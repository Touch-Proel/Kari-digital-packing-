import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  Product,
  Invoice,
  OrderItem,
  CustomerComment,
  Customer,
  PackerLog,
  AppSettings,
  FacebookPage
} from './types.ts';
import { persistToSqlite, loadFromSqlite } from './sqlite.ts';
import { detectDeliveryZone, extractCleanAddressFromComment, isPureContactOrInquiryComment, isQuestionOrLiveChatter } from './locationHelper.ts';
import { extractPhoneNumber, extractCodeQtyPairsFromComment, extractSizeAndColorNotes } from '../src/utils/commentParser.ts';

let dataRevision = 1;
let saveTimer: NodeJS.Timeout | null = null;
let sqliteTimer: NodeJS.Timeout | null = null;
let isDatabaseLoaded = false;

const DB_FILE_PATH = path.join(process.cwd(), 'server', 'db_store.json');
const LOCAL_WORKFLOW_LEDGER_PATH = path.join(process.cwd(), 'server', 'workflow_ledger.json');

// External directory outside the git repository so `git pull` / `git reset` on VPS never overwrites live state
const EXTERNAL_DATA_DIR = path.join(os.homedir() || '/tmp', '.karishop_data');
const EXTERNAL_DB_BACKUP_PATH = path.join(EXTERNAL_DATA_DIR, 'db_store_backup.json');
const EXTERNAL_WORKFLOW_LEDGER_PATH = path.join(EXTERNAL_DATA_DIR, 'workflow_ledger.json');

function ensureExternalDataDir() {
  try {
    if (!fs.existsSync(EXTERNAL_DATA_DIR)) {
      fs.mkdirSync(EXTERNAL_DATA_DIR, { recursive: true });
    }
  } catch {}
}

export interface WorkflowLedgerEntry {
  invoice_id: number;
  basket_no: number | string;
  live_id: string;
  facebook_user_id?: string;
  facebook_name?: string;
  packing_stage: string;
  status: string;
  payment_status?: string;
  staged_by?: string;
  staged_at?: string;
  verified_by?: string;
  verified_at?: string;
  paid_by?: string;
  paid_at?: string;
  dispatched_by?: string;
  dispatched_at?: string;
  msg_status?: string;
  items_packed?: Record<string, boolean>;
  updated_at: string;
}

const STAGE_RANK: Record<string, number> = {
  UNPICKED: 0,
  PACKING: 1,
  STAGED: 2,
  WAITING_PAYMENT: 2,
  VERIFIED: 3,
  DISPATCHED: 4
};

export function getStageRank(stage?: string, status?: string): number {
  if (status === 'Dispatched' || stage === 'DISPATCHED') return 4;
  if (status === 'Paid' && (stage === 'STAGED' || stage === 'VERIFIED')) return 3;
  return STAGE_RANK[String(stage || 'UNPICKED').toUpperCase()] ?? 0;
}

function buildWorkflowLedgerMap(invs: Invoice[]): Record<string, WorkflowLedgerEntry> {
  const ledger: Record<string, WorkflowLedgerEntry> = {};
  for (const inv of invs) {
    if (!inv) continue;
    const rank = getStageRank(inv.packing_stage, inv.status);
    const hasPackedItems = Array.isArray(inv.items) && inv.items.some(it => it.is_packed);
    const hasUpdatedAt = Boolean((inv as any).updated_at);
    if (rank > 0 || hasPackedItems || hasUpdatedAt || inv.status === 'Paid' || inv.paid_at || inv.staged_at) {
      const itemsPacked: Record<string, boolean> = {};
      for (const it of inv.items || []) {
        if (it.product_code) {
          itemsPacked[it.product_code.toUpperCase().trim()] = Boolean(it.is_packed);
        }
      }
      const entry: WorkflowLedgerEntry = {
        invoice_id: inv.invoice_id,
        basket_no: inv.basket_no || inv.invoice_id,
        live_id: inv.live_id || activeLiveId || '',
        facebook_user_id: inv.facebook_user_id,
        facebook_name: inv.facebook_name,
        packing_stage: inv.packing_stage || 'UNPICKED',
        status: inv.status || 'Pending',
        payment_status: (inv as any).payment_status,
        staged_by: inv.staged_by,
        staged_at: inv.staged_at,
        verified_by: inv.verified_by,
        verified_at: inv.verified_at,
        paid_by: inv.paid_by,
        paid_at: inv.paid_at,
        dispatched_by: (inv as any).dispatched_by,
        dispatched_at: (inv as any).dispatched_at,
        msg_status: inv.msg_status,
        items_packed: itemsPacked,
        updated_at: (inv as any).updated_at || inv.staged_at || inv.paid_at || (inv as any).dispatched_at || new Date().toISOString()
      };
      ledger[`id_${inv.invoice_id}`] = entry;
      if (inv.live_id && inv.basket_no) {
        ledger[`live_${inv.live_id}_b_${inv.basket_no}`] = entry;
      }
    }
  }
  return ledger;
}

export function stampInvoiceWorkflowUpdate(inv: Invoice) {
  (inv as any).updated_at = new Date().toISOString();
  try {
    ensureExternalDataDir();
    const ledgerJson = JSON.stringify(buildWorkflowLedgerMap(invoices));
    fs.promises.writeFile(LOCAL_WORKFLOW_LEDGER_PATH, ledgerJson, 'utf8').catch(() => {});
    fs.promises.writeFile(EXTERNAL_WORKFLOW_LEDGER_PATH, ledgerJson, 'utf8').catch(() => {});
  } catch {}
}

let isSaving = false;
let pendingSave = false;

async function executeDiskSave(forceSync = false) {
  if (!isDatabaseLoaded && !forceSync) {
    return;
  }

  if (isSaving && !forceSync) {
    pendingSave = true;
    return;
  }

  isSaving = true;
  try {
    ensureExternalDataDir();
    const BACKUP_SLIPS_PATH = path.join(process.cwd(), 'server', 'messenger_slips_backup.json');
    if (messengerSlips.length === 0 && fs.existsSync(BACKUP_SLIPS_PATH)) {
      try {
        const raw = fs.readFileSync(BACKUP_SLIPS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          messengerSlips.push(...parsed);
          console.log(`[DB Auto-Heal] Restored ${parsed.length} slips from backup file before saving.`);
        }
      } catch {}
    }

    const payload = {
      savedAt: new Date().toISOString(),
      dataRevision,
      activeLiveId,
      settings,
      products,
      invoices,
      rawComments: rawComments.slice(-1500),
      customers,
      packerLogs,
      activeFacebookPage,
      messengerSlips
    };
    const jsonStr = JSON.stringify(payload);
    const ledgerStr = JSON.stringify(buildWorkflowLedgerMap(invoices));

    if (forceSync) {
      fs.writeFileSync(DB_FILE_PATH, jsonStr, 'utf8');
      try { fs.writeFileSync(EXTERNAL_DB_BACKUP_PATH, jsonStr, 'utf8'); } catch {}
      try { fs.writeFileSync(LOCAL_WORKFLOW_LEDGER_PATH, ledgerStr, 'utf8'); } catch {}
      try { fs.writeFileSync(EXTERNAL_WORKFLOW_LEDGER_PATH, ledgerStr, 'utf8'); } catch {}

      if (messengerSlips && messengerSlips.length > 0) {
        try {
          fs.writeFileSync(BACKUP_SLIPS_PATH, JSON.stringify(messengerSlips, null, 2), 'utf8');
        } catch {}
      }
      if (sqliteTimer) {
        clearTimeout(sqliteTimer);
        sqliteTimer = null;
      }
      await persistToSqlite({
        activeLiveId,
        settings,
        products,
        invoices,
        rawComments: rawComments.slice(-1500),
        customers,
        packerLogs,
        activeFacebookPage,
        messengerSlips
      }).catch(err => console.error('[SQLite] Persist error:', err));
    } else {
      await fs.promises.writeFile(DB_FILE_PATH, jsonStr, 'utf8').catch(err => {
        console.error('[DB] Async save error:', err);
      });
      fs.promises.writeFile(EXTERNAL_DB_BACKUP_PATH, jsonStr, 'utf8').catch(() => {});
      fs.promises.writeFile(LOCAL_WORKFLOW_LEDGER_PATH, ledgerStr, 'utf8').catch(() => {});
      fs.promises.writeFile(EXTERNAL_WORKFLOW_LEDGER_PATH, ledgerStr, 'utf8').catch(() => {});

      if (messengerSlips && messengerSlips.length > 0) {
        fs.promises.writeFile(BACKUP_SLIPS_PATH, JSON.stringify(messengerSlips, null, 2), 'utf8').catch(() => {});
      }

      // Schedule SQLite binary persistence in 1.2s WITHOUT resetting existing timer so continuous activity never starves pos.db!
      if (!sqliteTimer) {
        sqliteTimer = setTimeout(() => {
          sqliteTimer = null;
          persistToSqlite({
            activeLiveId,
            settings,
            products,
            invoices,
            rawComments: rawComments.slice(-1500),
            customers,
            packerLogs,
            activeFacebookPage,
            messengerSlips
          }).catch(err => console.error('[SQLite] Persist error:', err));
        }, 1200);
      }
    }
  } catch (err) {
    console.error('Failed to save database:', err);
  } finally {
    isSaving = false;
    if (pendingSave) {
      pendingSave = false;
      setTimeout(() => executeDiskSave(false), 300);
    }
  }
}

export async function saveDatabaseToDisk(forceSync = false) {
  if (forceSync) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    return executeDiskSave(true);
  }
  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      executeDiskSave(false);
    }, 250);
  }
}

export function bumpDataRevision(persist = true): number {
  dataRevision += 1;
  if (persist) {
    saveDatabaseToDisk(false);
  }
  return dataRevision;
}

export function getDataRevision(): number {
  return dataRevision;
}

// Global active live session ID
export let activeLiveId = '1626350178950100';

export interface AutoScannedMessengerSlip {
  id: string;
  source: 'MESSENGER' | 'TELEGRAM';
  sender_id: string;
  sender_name: string;
  sender_avatar_url?: string;
  slip_url: string;
  received_at: string;
  extracted: {
    customer_name: string;
    paid_amount: number;
    currency: 'USD' | 'KHR';
    phone_number?: string;
    bank_name?: string;
    trans_ref?: string;
    trans_date?: string;
    basket_no?: number | string;
    remarks?: string;
  };
  status: 'MATCHED' | 'MULTIPLE_CANDIDATES' | 'NOT_FOUND' | 'APPROVED' | 'REJECTED' | 'DUPLICATE_TXID';
  is_approved?: boolean;
  confidence: number;
  duplicate_warning?: {
    is_duplicate: boolean;
    duplicate_type: 'SAME_ACCOUNT' | 'CROSS_ACCOUNT' | 'ALREADY_APPROVED';
    original_sender_name: string;
    original_basket_no?: number | string;
    trans_ref?: string;
    message: string;
  };
  fraud_warning?: {
    is_fraud: boolean;
    severity: 'HIGH' | 'MEDIUM';
    reasons: string[];
    message: string;
  };
  amount_mismatch?: {
    is_mismatch: boolean;
    slip_amount: number;
    invoice_amount: number;
    difference: number;
  };
  matched_invoice?: {
    invoice_id: number;
    basket_no?: number | string;
    live_id: string;
    facebook_name: string;
    facebook_user_id?: string;
    picture_url?: string;
    phone_number: string;
    total_amount: number;
    created_at: string;
    packing_stage: string;
    status: string;
  };
  candidates?: Array<{
    invoice_id: number;
    basket_no?: number | string;
    live_id: string;
    facebook_name: string;
    phone_number: string;
    total_amount: number;
    created_at: string;
    packing_stage: string;
    status: string;
  }>;
}

export const messengerSlips: AutoScannedMessengerSlip[] = [];

export function normalizeLiveId(id: string): string {
  const trimmed = String(id || '').trim();
  return trimmed && trimmed.includes('_') && !trimmed.startsWith('LIVE_') ? trimmed.split('_').pop() || trimmed : trimmed;
}

export function setActiveLiveId(id: string) {
  const cleanId = normalizeLiveId(id);
  if (!cleanId) return;
  activeLiveId = cleanId;
  // Safety: If cleanId was accidentally listed as a secondary linked video inside an older session,
  // detach it from that older session so selecting a Live post as Primary is 100% isolated.
  if (settings.linked_live_videos && typeof settings.linked_live_videos === 'object') {
    for (const [primaryKey, vids] of Object.entries(settings.linked_live_videos)) {
      if (normalizeLiveId(primaryKey) !== cleanId && Array.isArray(vids)) {
        settings.linked_live_videos[primaryKey] = vids
          .map(normalizeLiveId)
          .filter(v => v && v !== cleanId);
      }
    }
  }
  saveDatabaseToDisk();
}

export function getLinkedVideosForSession(sessionId?: string): string[] {
  const primaryId = normalizeLiveId(sessionId || activeLiveId);
  if (!primaryId) return [];
  const map = settings.linked_live_videos || {};
  const extras = Array.isArray(map[primaryId]) ? map[primaryId].map(normalizeLiveId).filter(Boolean) : [];
  return Array.from(new Set([primaryId, ...extras]));
}

export function addLinkedVideoToSession(sessionId: string, videoId: string): string[] {
  const primaryId = normalizeLiveId(sessionId || activeLiveId);
  const cleanVid = normalizeLiveId(videoId);
  if (!primaryId || !cleanVid) return getLinkedVideosForSession(primaryId);

  if (!settings.linked_live_videos) {
    settings.linked_live_videos = {};
  }
  const existing = Array.isArray(settings.linked_live_videos[primaryId])
    ? settings.linked_live_videos[primaryId].map(normalizeLiveId).filter(Boolean)
    : [];

  if (cleanVid !== primaryId && !existing.includes(cleanVid)) {
    existing.push(cleanVid);
  }
  settings.linked_live_videos[primaryId] = existing;

  // Also if cleanVid itself had any linked videos, absorb them into primaryId
  if (cleanVid !== primaryId && Array.isArray(settings.linked_live_videos[cleanVid])) {
    for (const subVid of settings.linked_live_videos[cleanVid]) {
      const cSub = normalizeLiveId(subVid);
      if (cSub && cSub !== primaryId && !settings.linked_live_videos[primaryId].includes(cSub)) {
        settings.linked_live_videos[primaryId].push(cSub);
      }
    }
    delete settings.linked_live_videos[cleanVid];
  }

  bumpDataRevision();
  saveDatabaseToDisk();
  return getLinkedVideosForSession(primaryId);
}

export function removeLinkedVideoFromSession(sessionId: string, videoId: string): string[] {
  const primaryId = normalizeLiveId(sessionId || activeLiveId);
  const cleanVid = normalizeLiveId(videoId);
  if (!primaryId || !cleanVid || !settings.linked_live_videos?.[primaryId]) {
    return getLinkedVideosForSession(primaryId);
  }
  settings.linked_live_videos[primaryId] = settings.linked_live_videos[primaryId]
    .map(normalizeLiveId)
    .filter(v => v && v !== cleanVid);
  bumpDataRevision();
  saveDatabaseToDisk();
  return getLinkedVideosForSession(primaryId);
}

export function mergeLiveSessionsIntoPrimary(
  primaryLiveId: string,
  sourceLiveId: string,
  options?: { includeProducts?: boolean }
): {
  mergedSameCustomerCount: number;
  movedBasketsCount: number;
  movedProductsCount: number;
} {
  const targetId = normalizeLiveId(primaryLiveId);
  const sourceId = normalizeLiveId(sourceLiveId);
  if (!targetId || !sourceId || targetId === sourceId) {
    return { mergedSameCustomerCount: 0, movedBasketsCount: 0, movedProductsCount: 0 };
  }

  let mergedSameCustomerCount = 0;
  let movedBasketsCount = 0;
  let movedProductsCount = 0;

  // 1. Move or merge products from sourceId into targetId ONLY when explicitly requested (default false to prevent stock contamination across Live sessions)
  if (options?.includeProducts === true) {
    const sourceProducts = products.filter(p => normalizeLiveId(p.live_id || '') === sourceId);
    for (const sp of sourceProducts) {
      const cleanCode = (sp.code || '').toUpperCase().trim();
      const existingInTarget = products.find(
        p => normalizeLiveId(p.live_id || '') === targetId && (p.code || '').toUpperCase().trim() === cleanCode
      );
      if (!existingInTarget) {
        sp.live_id = targetId;
        movedProductsCount++;
      }
    }
    // Remove leftover duplicate products in sourceId
    for (let i = products.length - 1; i >= 0; i--) {
      if (normalizeLiveId(products[i].live_id || '') === sourceId) {
        products.splice(i, 1);
      }
    }
  }

  // 2. Move rawComments from sourceId to targetId
  for (const rc of rawComments) {
    if (normalizeLiveId(rc.live_id || '') === sourceId) {
      rc.live_id = targetId;
    }
  }

  // 3. Merge or move invoices from sourceId into targetId
  const sourceInvoices = invoices.filter(inv => normalizeLiveId(inv.live_id || '') === sourceId && inv.status !== 'Cancelled');
  for (const srcInv of sourceInvoices) {
    const srcUid = srcInv.facebook_user_id && !['FB_USER_ID_STREAM', 'FB_MANUAL_USER', 'MANUAL_USER_ID'].includes(srcInv.facebook_user_id)
      ? srcInv.facebook_user_id
      : '';
    const srcName = (srcInv.facebook_name || '').trim().toLowerCase();
    const srcPhone = (srcInv.phone_number || '').replace(/\D/g, '');

    // Look for an active (non-Cancelled, non-Dispatched) basket for the same customer in targetId
    const targetInv = invoices.find(inv => {
      if (normalizeLiveId(inv.live_id || '') !== targetId) return false;
      if (inv.invoice_id === srcInv.invoice_id) return false;
      if (inv.status === 'Cancelled' || inv.status === 'Dispatched' || inv.packing_stage === 'DISPATCHED') return false;

      if (srcUid && inv.facebook_user_id === srcUid) return true;
      if (srcName && (inv.facebook_name || '').trim().toLowerCase() === srcName) return true;
      if (srcPhone.length >= 8 && (inv.phone_number || '').replace(/\D/g, '') === srcPhone) return true;
      return false;
    });

    if (targetInv && srcInv.status !== 'Dispatched' && srcInv.packing_stage !== 'DISPATCHED') {
      // Same customer! Consolidate items into targetInv (1 single basket, 1 shipping fee!)
      for (const sItem of srcInv.items || []) {
        const existingItem = targetInv.items.find(
          t => t.product_code.toUpperCase().trim() === sItem.product_code.toUpperCase().trim() && t.price === sItem.price
        );
        if (existingItem) {
          existingItem.quantity += sItem.quantity;
          if (sItem.item_comment && !existingItem.item_comment?.includes(sItem.item_comment)) {
            existingItem.item_comment = `${existingItem.item_comment ? existingItem.item_comment + ' | ' : ''}${sItem.item_comment}`;
          }
        } else {
          targetInv.items.push({
            ...sItem,
            id: Date.now() + Math.floor(Math.random() * 100000),
            invoice_id: targetInv.invoice_id,
            note: sItem.note ? `${sItem.note} (តឡាយ #${sourceId.slice(-6)})` : `(តឡាយ #${sourceId.slice(-6)})`
          });
        }
      }

      if ((!targetInv.phone_number || targetInv.phone_number === 'គ្មានលេខ' || targetInv.phone_number.includes('មិនទាន់')) &&
          srcInv.phone_number && srcInv.phone_number !== 'គ្មានលេខ') {
        targetInv.phone_number = srcInv.phone_number;
      }
      if ((!targetInv.address || targetInv.address.includes('មិនទាន់')) &&
          srcInv.address && !srcInv.address.includes('មិនទាន់')) {
        targetInv.address = srcInv.address;
      }
      if (srcInv.location_zone && srcInv.location_zone !== 'UNKNOWN' && targetInv.location_zone === 'UNKNOWN') {
        targetInv.location_zone = srcInv.location_zone;
        targetInv.location_label = srcInv.location_label;
      }

      if (Array.isArray(srcInv.comments)) {
        targetInv.comments = Array.from(new Set([...(targetInv.comments || []), ...srcInv.comments]));
      }
      if (Array.isArray(srcInv.comment_ids)) {
        targetInv.comment_ids = Array.from(new Set([...(targetInv.comment_ids || []), ...srcInv.comment_ids]));
      }
      if (Array.isArray(srcInv.unmatched_comments)) {
        targetInv.unmatched_comments = Array.from(new Set([...(targetInv.unmatched_comments || []), ...srcInv.unmatched_comments]));
      }

      recalculateInvoice(targetInv);
      targetInv.updated_at = new Date().toISOString();

      // Remove merged source invoice so there's no duplicate or cancelled ghost
      const idx = invoices.findIndex(i => i.invoice_id === srcInv.invoice_id);
      if (idx !== -1) {
        invoices.splice(idx, 1);
      }
      mergedSameCustomerCount++;
    } else {
      // Different customer — move their basket into targetId!
      const usedBasketNos = new Set(
        invoices
          .filter(i => normalizeLiveId(i.live_id || '') === targetId && i.invoice_id !== srcInv.invoice_id)
          .map(i => Number(i.basket_no) || 0)
      );
      let bNo = Number(srcInv.basket_no) || 1;
      if (usedBasketNos.has(bNo)) {
        const maxBNo = usedBasketNos.size > 0 ? Math.max(...Array.from(usedBasketNos)) : 0;
        bNo = maxBNo + 1;
      }
      srcInv.live_id = targetId;
      srcInv.basket_no = bNo;
      srcInv.updated_at = new Date().toISOString();
      movedBasketsCount++;
    }
  }

  // Remove any remaining cancelled invoices in sourceId
  for (let i = invoices.length - 1; i >= 0; i--) {
    if (normalizeLiveId(invoices[i].live_id || '') === sourceId) {
      invoices.splice(i, 1);
    }
  }

  // Link sourceId to targetId for future real-time comment syncs
  addLinkedVideoToSession(targetId, sourceId);
  return { mergedSameCustomerCount, movedBasketsCount, movedProductsCount };
}

// Active locks on invoices
export const activeInvoiceLocks = new Map<number, {
  packer_name: string;
  timestamp: number;
  start_time: number;
}>();

const LOCK_TIMEOUT_MS = 120 * 1000;

export function cleanExpiredLocks() {
  const now = Date.now();
  for (const [invId, lock] of activeInvoiceLocks.entries()) {
    if (now - lock.timestamp > LOCK_TIMEOUT_MS) {
      activeInvoiceLocks.delete(invId);
    }
  }
}

// Settings
export const settings: AppSettings = {
  default_shipping_fee: 2.0,
  free_ship_threshold: 0.0, // 0 = disabled (no free shipping under any condition)
  bulk_discount_qty: 0,
  bulk_discount_amount: 0.0,
  bakong_id: 'abaakhppxxx@abaa',
  merchant_name: 'Kari Arnett',
  account_name: 'Proel Toch',
  account_number: '000474559',
  bank_name: 'ABA Bank',
  khqr_city: 'Phnom Penh',
  khqr_enabled: true,
  exchange_rate: 4100,
  telegram_token: process.env.TELEGRAM_BOT_TOKEN || '',
  telegram_chat_id: process.env.TELEGRAM_CHAT_ID || '',
  gemini_api_key: process.env.GEMINI_API_KEY || '',
  admin_pin: '1688',
  parser_strict_catalog: false,
  parser_allow_standalone: true,
  auto_private_reply_enabled: false,
  auto_private_reply_template: 'ជម្រាបសួរ [Name]! អរគុណសម្រាប់ការកុម្ម៉ង់ទំនិញក្នុង Live។ ប្រព័ន្ធបានកត់ត្រាការកក់របស់បងរួចរាល់ហើយ។ សូមបងផ្ញើលេខទូរស័ព្ទ និងទីតាំង ដើម្បីខាងប្អូនរៀបចំវេចខ្ចប់ជូនបង។ អរគុណ!',
  scan_ping_messenger_enabled: true,
  scan_ping_messenger_template: '📦 [សួស្តីបង [Name]] បុគ្គលិកផ្នែករៀបចំ និងវេចខ្ចប់កំពុងផ្ទៀងផ្ទាត់កន្ត្រក #[Basket] ជូនបង! បុគ្គលិកអាចនឹងផ្ញើរូបភាព ឬបញ្ជាក់ទំនិញក្នុងឆាតនេះ។ សូមបងរង់ចាំបន្តិចណា៎! 🙏✨',
  linked_live_videos: {}
};

// Initial Products Catalog
export const products: Product[] = [
  { id: 1, live_id: '1626350178950100', code: '30', name: 'រ៉ូបសាច់ក្រណាត់ផ្កា', stock_qty: 45, price: 6.50, cost_price: 3.80, image_file: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&auto=format&fit=crop&q=80' },
  { id: 2, live_id: '1626350178950100', code: '54', name: 'អាវយឺតកូរ៉េដៃខ្លី', stock_qty: 32, price: 4.00, cost_price: 2.20, image_file: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop&q=80' },
  { id: 3, live_id: '1626350178950100', code: 'A12', name: 'ខោខូវប៊យជើងវែង VIP', stock_qty: 18, price: 9.50, cost_price: 5.50, image_file: 'https://images.unsplash.com/photo-1542272604-780c96856592?w=400&auto=format&fit=crop&q=80' },
  { id: 4, live_id: '1626350178950100', code: 'B05', name: 'ឈុតគេងយប់សូត្រ', stock_qty: 24, price: 5.00, cost_price: 2.90, image_file: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&auto=format&fit=crop&q=80' },
  { id: 5, live_id: '1626350178950100', code: 'K99', name: 'អាវប៉ាក់ផ្កាខ្មែរប្រណិត', stock_qty: 12, price: 12.00, cost_price: 7.00, image_file: 'https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=400&auto=format&fit=crop&q=80' },
  { id: 6, live_id: '1626350178950100', code: 'M10', name: 'ក្រែមលាបមាត់ matte', stock_qty: 50, price: 2.50, cost_price: 1.10, image_file: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400&auto=format&fit=crop&q=80' },
  { id: 7, live_id: '1626350178950100', code: '88', name: 'ស្បែកជើងប៉ាតាស្រី', stock_qty: 15, price: 8.50, cost_price: 4.80, image_file: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&auto=format&fit=crop&q=80' },
  { id: 8, live_id: '1626350178950100', code: 'V07', name: 'កាបូបស្ពាយតូចស្អាត', stock_qty: 20, price: 7.00, cost_price: 4.00, image_file: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&auto=format&fit=crop&q=80' }
];

// Initial Invoices (Baskets)
export const invoices: Invoice[] = [
  {
    invoice_id: 860,
    basket_no: 860,
    live_id: '1626350178950100',
    created_at: new Date().toISOString(),
    facebook_user_id: 'TEST_USER_1',
    facebook_name: 'Dany Ka',
    phone_number: '096 442 8567',
    address: 'ចាក់អង្រែលើ ភ្នំពេញ',
    location_zone: 'PP',
    location_label: '🏙️ ភ្នំពេញ',
    total_amount: 15.50,
    shipping_fee: 1.00,
    is_free_ship: false,
    status: 'Pending',
    packing_stage: 'STAGED',
    staged_by: 'សុខា',
    staged_at: new Date().toISOString(),
    msg_status: 'SENT',
    items: [
      { id: 10, invoice_id: 860, product_id: 4, product_code: 'B05', product_name: 'ឈុតគេងយប់សូត្រ VIP', quantity: 2, price: 5.00, is_packed: true, item_comment: 'B05=2' },
      { id: 11, invoice_id: 860, product_id: 2, product_code: '54', product_name: 'អាវយឺតកូរ៉េដៃខ្លី', quantity: 1, price: 4.50, is_packed: true, item_comment: '54x1' }
    ],
    comments: [
      'B05=2 និង 54 មួយចែ 0964428567 ចាក់អង្រែលើ ភ្នំពេញ'
    ],
    unmatched_comments: []
  },
  {
    invoice_id: 101,
    basket_no: 101,
    live_id: 'LIVE_20260913_VIP',
    created_at: '2026-09-13T14:30:00',
    facebook_user_id: '100088991122334',
    facebook_name: 'សុខ ស្រីម៉ៅ (Srey Mao)',
    phone_number: '012 889 772',
    address: 'ផ្ទះលេខ 24E0 ផ្លូវ 271 សង្កាត់បឹងទំពុន ខណ្ឌមានជ័យ',
    location_zone: 'PP',
    location_label: '🏙️ ភ្នំពេញ',
    total_amount: 17.00,
    shipping_fee: 2.00,
    is_free_ship: false,
    status: 'Pending',
    packing_stage: 'UNPICKED',
    msg_status: 'UNSENT',
    items: [
      { id: 1, invoice_id: 101, product_id: 1, product_code: '30', product_name: 'រ៉ូបសាច់ក្រណាត់ផ្កា', quantity: 2, price: 6.50, is_packed: false, item_comment: '30=2 យកពណ៍ផ្ទៃមេឃ' },
      { id: 2, invoice_id: 101, product_id: 2, product_code: '54', product_name: 'អាវយឺតកូរ៉េដៃខ្លី', quantity: 1, price: 4.00, is_packed: false, item_comment: '54x1' }
    ],
    comments: [
      'ជម្រាបសួរចែ 30=2 យកពណ៍ផ្ទៃមេឃ',
      'ថែម 54x1 ផងចែ 012889772 ភ្នំពេញ'
    ],
    unmatched_comments: [
      'ចែមានពណ៍ផ្កាឈូកអត់'
    ]
  },
  {
    invoice_id: 102,
    basket_no: 102,
    live_id: 'LIVE_20260913_VIP',
    created_at: '2026-09-13T14:35:10',
    facebook_user_id: '100077665544332',
    facebook_name: 'គីម ហុង (Kim Hong Boutique)',
    phone_number: '097 554 4321',
    address: 'ភូមិវត្តបូព៌ សង្កាត់សាលាកំរើក ក្រុងសៀមរាប',
    location_zone: 'PROVINCE',
    location_label: '🏞️ តាមខេត្ត',
    total_amount: 33.00,
    shipping_fee: 2.00,
    is_free_ship: false,
    status: 'Pending',
    packing_stage: 'STAGED',
    staged_by: 'សុខា',
    staged_at: '2026-09-13 14:40:00',
    msg_status: 'SENT',
    items: [
      { id: 3, invoice_id: 102, product_id: 3, product_code: 'A12', product_name: 'ខោខូវប៊យជើងវែង VIP', quantity: 2, price: 9.50, is_packed: true, item_comment: 'A12=2 size L' },
      { id: 4, invoice_id: 102, product_id: 5, product_code: 'K99', product_name: 'អាវប៉ាក់ផ្កាខ្មែរប្រណិត', quantity: 1, price: 12.00, is_packed: true, item_comment: 'K99 មួយ' }
    ],
    comments: [
      'កាត់ A12=2 size L 0975544321 សៀមរាប',
      'យក K99 មួយទៀតចែ'
    ],
    unmatched_comments: []
  },
  {
    invoice_id: 103,
    basket_no: 103,
    live_id: 'LIVE_20260913_VIP',
    created_at: '2026-09-13T14:42:00',
    facebook_user_id: '100099887766554',
    facebook_name: 'ចាន់ថា លីនដា (Linda Chan)',
    phone_number: '081 223 344',
    address: 'បុរីប៉េងហួតបឹងស្នោ ផ្លូវជាតិលេខ១ ភ្នំពេញ',
    location_zone: 'PP',
    location_label: '🏙️ ភ្នំពេញ',
    total_amount: 15.50,
    shipping_fee: 2.00,
    is_free_ship: false,
    status: 'Paid',
    packing_stage: 'STAGED',
    staged_by: 'សុខា',
    staged_at: '2026-09-13 14:45:00',
    msg_status: 'SENT',
    items: [
      { id: 5, invoice_id: 103, product_id: 7, product_code: '88', product_name: 'ស្បែកជើងប៉ាតាស្រី', quantity: 1, price: 8.50, is_packed: true, item_comment: '88*1 size 37' },
      { id: 6, invoice_id: 103, product_id: 4, product_code: 'B05', product_name: 'ឈុតគេងយប់សូត្រ', quantity: 1, price: 5.00, is_packed: true, item_comment: 'B05=1' }
    ],
    comments: [
      '88*1 size 37 081223344 ប៉េងហួតច្បារអំពៅ',
      'ថែម B05=1 ផង'
    ],
    unmatched_comments: []
  },
  {
    invoice_id: 104,
    basket_no: 104,
    live_id: 'LIVE_20260913_VIP',
    created_at: '2026-09-13T14:48:22',
    facebook_user_id: '100011223344556',
    facebook_name: 'ពេជ្រ សុជាតា (Pech Socheata)',
    phone_number: '070 998 811',
    address: 'សង្កាត់ស្រះចក ខណ្ឌដូនពេញ ភ្នំពេញ',
    location_zone: 'PP',
    location_label: '🏙️ ភ្នំពេញ',
    total_amount: 16.00,
    shipping_fee: 2.00,
    is_free_ship: false,
    status: 'Pending',
    packing_stage: 'UNPICKED',
    msg_status: 'UNSENT',
    items: [
      { id: 7, invoice_id: 104, product_id: 8, product_code: 'V07', product_name: 'កាបូបស្ពាយតូចស្អាត', quantity: 2, price: 7.00, is_packed: false, item_comment: 'V07=2 ខ្មៅ១ ត្នោត១' }
    ],
    comments: [
      'V07=2 ខ្មៅ១ ត្នោត១ 070998811 ភ្នំពេញ'
    ],
    unmatched_comments: [
      'កូដ 54=2 ថែម'
    ]
  },
  {
    invoice_id: 99,
    basket_no: 99,
    live_id: 'LIVE_20260912_NIGHT',
    created_at: '2026-09-12T20:15:00',
    facebook_user_id: '100044556677889',
    facebook_name: 'វ៉ាន់នី បាត់ដំបង',
    phone_number: '088 776 6554',
    address: 'ផ្លូវលេខ ៣ ក្រុងបាត់ដំបង',
    location_zone: 'PROVINCE',
    location_label: '🏞️ តាមខេត្ត',
    total_amount: 28.00,
    shipping_fee: 2.00,
    is_free_ship: false,
    status: 'Dispatched',
    packing_stage: 'DISPATCHED',
    staged_by: 'សុខា',
    staged_at: '2026-09-12 21:00:00',
    msg_status: 'SENT',
    items: [
      { id: 8, invoice_id: 99, product_id: 5, product_code: 'K99', product_name: 'អាវប៉ាក់ផ្កាខ្មែរប្រណិត', quantity: 2, price: 12.00, is_packed: true, item_comment: 'K99=2' },
      { id: 9, invoice_id: 99, product_id: 2, product_code: '54', product_name: 'អាវយឺតកូរ៉េដៃខ្លី', quantity: 1, price: 4.00, is_packed: true, item_comment: '54 មួយ' }
    ],
    comments: ['K99=2 និង 54 មួយ បាត់ដំបង'],
    unmatched_comments: []
  }
];

// Initial Customer Comments
export const rawComments: CustomerComment[] = [
  {
    comment_id: 'c_1001',
    live_id: 'LIVE_20260913_VIP',
    invoice_id: 101,
    facebook_user_id: '100088991122334',
    facebook_name: 'សុខ ស្រីម៉ៅ (Srey Mao)',
    comment_text: 'ជម្រាបសួរចែ 30=2 យកពណ៍ផ្ទៃមេឃ',
    created_at: '2026-09-13T14:30:00',
    is_matched: true
  },
  {
    comment_id: 'c_1002',
    live_id: 'LIVE_20260913_VIP',
    invoice_id: 101,
    facebook_user_id: '100088991122334',
    facebook_name: 'សុខ ស្រីម៉ៅ (Srey Mao)',
    comment_text: 'ថែម 54x1 ផងចែ 012889772 ភ្នំពេញ',
    created_at: '2026-09-13T14:32:00',
    is_matched: true
  },
  {
    comment_id: 'c_1003',
    live_id: 'LIVE_20260913_VIP',
    invoice_id: 102,
    facebook_user_id: '100077665544332',
    facebook_name: 'គីម ហុង (Kim Hong Boutique)',
    comment_text: 'កាត់ A12=2 size L 0975544321 សៀមរាប',
    created_at: '2026-09-13T14:35:10',
    is_matched: true
  },
  {
    comment_id: 'c_1004',
    live_id: 'LIVE_20260913_VIP',
    invoice_id: 104,
    facebook_user_id: '100011223344556',
    facebook_name: 'ពេជ្រ សុជាតា (Pech Socheata)',
    comment_text: 'V07=2 ខ្មៅ១ ត្នោត១ 070998811 ភ្នំពេញ',
    created_at: '2026-09-13T14:48:22',
    is_matched: true
  }
];

// Initial Customers
export const customers: Customer[] = [
  { customer_id: 1, facebook_user_id: '100088991122334', facebook_name: 'សុខ ស្រីម៉ៅ (Srey Mao)', phone_number: '012 889 772', address: 'ផ្ទះលេខ 24E0 ផ្លូវ 271 សង្កាត់បឹងទំពុន ខណ្ឌមានជ័យ', is_vip: true, is_blacklist: false },
  { customer_id: 2, facebook_user_id: '100077665544332', facebook_name: 'គីម ហុង (Kim Hong Boutique)', phone_number: '097 554 4321', address: 'ភូមិវត្តបូព៌ សង្កាត់សាលាកំរើក ក្រុងសៀមរាប', is_vip: false, is_blacklist: false },
  { customer_id: 3, facebook_user_id: '100099887766554', facebook_name: 'ចាន់ថា លីនដា (Linda Chan)', phone_number: '081 223 344', address: 'បុរីប៉េងហួតបឹងស្នោ ផ្លូវជាតិលេខ១ ភ្នំពេញ', is_vip: true, is_blacklist: false },
  { customer_id: 4, facebook_user_id: '100011223344556', facebook_name: 'ពេជ្រ សុជាតា (Pech Socheata)', phone_number: '070 998 811', address: 'សង្កាត់ស្រះចក ខណ្ឌដូនពេញ ភ្នំពេញ', is_vip: false, is_blacklist: false }
];

// Packer Logs
export const packerLogs: PackerLog[] = [
  { log_id: 1, invoice_id: 99, packer_name: 'សុខា', items_count: 3, duration_seconds: 28, packed_at: '2026-09-12 21:00:00', facebook_name: 'វ៉ាន់នី បាត់ដំបង', total_amount: 28.00 },
  { log_id: 2, invoice_id: 95, packer_name: 'សុខា', items_count: 2, duration_seconds: 22, packed_at: '2026-09-12 20:30:00', facebook_name: 'លីណា ភ្នំពេញ', total_amount: 18.50 },
  { log_id: 3, invoice_id: 94, packer_name: 'ធារ៉ា', items_count: 4, duration_seconds: 35, packed_at: '2026-09-12 20:10:00', facebook_name: 'ចន្ធូ កំពង់ចាម', total_amount: 36.00 }
];

// In-Memory Facebook Connection State
export let activeFacebookPage: FacebookPage | null = {
  id: '102094263212256',
  name: 'Kari Arnett',
  access_token: 'EAARoNf2KfC0BSVCb4u9Wb7PWQvXM3iVdJoPYn0hL9kBqDRri6RBnK9uxRGHug68YROZBkmP6KQ6jNopaa3fPE3qLOjmSf2wElTIuUeyikn4H5jATBaC13mvCfbYURxEuUPIGunirDa8P61RLFuyRIxYZAuCmGPVKItvOqHsJ4y4Y3i1I1Ri2FgwNGlYoF8y7UPvCMNH3RYZAZAjztLQZD',
  category: "Women's Clothing Store & Live Sales"
};

export function setActiveFacebookPage(page: FacebookPage | null) {
  activeFacebookPage = page;
}

export let facebookUserAccessToken: string = '';

export function getFacebookUserAccessToken(): string {
  return facebookUserAccessToken;
}

export function setFacebookUserAccessToken(token: string) {
  facebookUserAccessToken = token || '';
}

export const connectedFacebookPages: FacebookPage[] = [
  {
    id: '102094263212256',
    name: 'Kari Arnett',
    access_token: 'EAARoNf2KfC0BSVCb4u9Wb7PWQvXM3iVdJoPYn0hL9kBqDRri6RBnK9uxRGHug68YROZBkmP6KQ6jNopaa3fPE3qLOjmSf2wElTIuUeyikn4H5jATBaC13mvCfbYURxEuUPIGunirDa8P61RLFuyRIxYZAuCmGPVKItvOqHsJ4y4Y3i1I1Ri2FgwNGlYoF8y7UPvCMNH3RYZAZAjztLQZD',
    category: "Women's Clothing Store & Live Sales"
  }
];

export function getConnectedFacebookPages(): FacebookPage[] {
  return connectedFacebookPages;
}

export function setConnectedFacebookPages(pages: FacebookPage[], setFirstAsActive = true) {
  connectedFacebookPages.length = 0;
  connectedFacebookPages.push(...pages);
  if (setFirstAsActive && pages.length > 0 && !activeFacebookPage) {
    activeFacebookPage = pages[0];
  }
}

export function addOrUpdateConnectedPage(page: FacebookPage, setAsActive = false) {
  const existingIdx = connectedFacebookPages.findIndex(p => p.id === page.id);
  if (existingIdx >= 0) {
    connectedFacebookPages[existingIdx] = { ...connectedFacebookPages[existingIdx], ...page };
  } else {
    connectedFacebookPages.push(page);
  }
  if (setAsActive || !activeFacebookPage) {
    activeFacebookPage = page;
  }
}

export function batchAddConnectedPages(pages: FacebookPage[], setFirstAsActive = true) {
  for (const page of pages) {
    const existingIdx = connectedFacebookPages.findIndex(p => p.id === page.id);
    if (existingIdx >= 0) {
      connectedFacebookPages[existingIdx] = { ...connectedFacebookPages[existingIdx], ...page };
    } else {
      connectedFacebookPages.push(page);
    }
  }
  if (setFirstAsActive && pages.length > 0 && !activeFacebookPage) {
    activeFacebookPage = pages[0];
  }
}

export function removeConnectedPage(pageId: string) {
  const idx = connectedFacebookPages.findIndex(p => p.id === pageId);
  if (idx >= 0) {
    connectedFacebookPages.splice(idx, 1);
  }
  if (activeFacebookPage?.id === pageId) {
    activeFacebookPage = connectedFacebookPages[0] || null;
  }
}

export function clearAllConnectedPages() {
  connectedFacebookPages.length = 0;
  activeFacebookPage = null;
  facebookUserAccessToken = '';
}

// -------------------------------------------------------------
// Helper Calculation for an Invoice
// -------------------------------------------------------------
export function recalculateInvoice(inv: Invoice) {
  const itemsSum = inv.items.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  const totalItemsQty = inv.items.reduce((sum, it) => sum + it.quantity, 0);

  // User mandate: No discounts of any kind
  (inv as any).discount_amount = 0;

  // User mandate: Delivery is NEVER free regardless of dress/item price
  inv.is_free_ship = false;

  let finalShipping = 0;
  if (totalItemsQty > 0) {
    if (inv.shipping_fee !== undefined && inv.shipping_fee !== null && inv.shipping_fee > 0 && inv.shipping_fee !== 2.5) {
      finalShipping = inv.shipping_fee;
    } else {
      finalShipping = settings.default_shipping_fee || 2.0;
    }
  }

  inv.shipping_fee = finalShipping;
  // Total is strictly (Subtotal + Shipping)
  inv.total_amount = Number((itemsSum + finalShipping).toFixed(2));
}

// -------------------------------------------------------------
// Auto-Sync Active (Non-Dispatched) Basket Items with Stock Catalog
// Ensures that whenever stock prices/photos change, all active baskets reflect real prices immediately!
// -------------------------------------------------------------
export function syncAllActiveInvoicesWithStock(targetLiveId?: string, persist = true): number {
  let updatedInvoicesCount = 0;

  for (const inv of invoices) {
    const invLive = normalizeLiveId(inv.live_id || activeLiveId);
    if (targetLiveId && invLive !== normalizeLiveId(targetLiveId)) continue;

    // Only cascade to active, non-dispatched invoices (never alter historic dispatched packages)
    if (inv.status !== 'Dispatched' && inv.packing_stage !== 'DISPATCHED') {
      let invChanged = false;
      for (const item of inv.items) {
        // STRICT SESSION ISOLATION: Look up product ONLY in this exact live session (never pull price/photo/code from other live sessions!)
        const cleanCode = (item.product_code || '').trim().toUpperCase();
        if (!cleanCode) continue;

        const prod = products.find(
          p => normalizeLiveId(p.live_id || '') === invLive && (p.code || '').trim().toUpperCase() === cleanCode
        );

        if (prod) {
          // Auto-sync price if stock price is positive and differs
          if (typeof prod.price === 'number' && prod.price > 0 && Math.abs((item.price || 0) - prod.price) > 0.001) {
            item.price = prod.price;
            invChanged = true;
          }
          // Auto-sync photo if stock has photo and item does not match latest stock photo
          if (prod.image_file && prod.image_file.trim() !== '' && item.image_file !== prod.image_file.trim()) {
            item.image_file = prod.image_file.trim();
            invChanged = true;
          }
          // Auto-sync generic placeholder name
          if (prod.name && prod.name.trim() !== '' && (!item.product_name || item.product_name.startsWith('កូដ ') || item.product_name.startsWith('ទំនិញកូដ ') || item.product_name === `កូដ [${cleanCode}]` || item.product_name === `កូដ ${cleanCode}`)) {
            item.product_name = prod.name.trim();
            invChanged = true;
          }
        }
      }

      if (invChanged) {
        recalculateInvoice(inv);
        updatedInvoicesCount++;
      }
    }
  }

  if (updatedInvoicesCount > 0) {
    bumpDataRevision(persist);
    console.log(`[Stock Sync] Successfully synced ${updatedInvoicesCount} active basket(s) with latest stock prices & photos.`);
  }

  return updatedInvoicesCount;
}

let loadPromise: Promise<void> | null = null;

export function loadDatabaseFromDisk(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
  try {
    // 1. Try loading from SQLite pos.db first
    const sqliteData = await loadFromSqlite();
    if (sqliteData) {
      if (sqliteData.invoices && sqliteData.invoices.length > 0) {
        invoices.length = 0;
        invoices.push(...sqliteData.invoices);
      }
      if (sqliteData.products && sqliteData.products.length > 0) {
        products.length = 0;
        products.push(...sqliteData.products);
      }
      if (sqliteData.activeLiveId) {
        activeLiveId = sqliteData.activeLiveId;
      }
      if (sqliteData.activeFacebookPage) {
        activeFacebookPage = sqliteData.activeFacebookPage;
      }
      if (sqliteData.rawComments && sqliteData.rawComments.length > 0) {
        rawComments.length = 0;
        rawComments.push(...sqliteData.rawComments);
      }
      if (sqliteData.customers && sqliteData.customers.length > 0) {
        customers.length = 0;
        customers.push(...sqliteData.customers);
      }
      if (sqliteData.packerLogs && sqliteData.packerLogs.length > 0) {
        packerLogs.length = 0;
        packerLogs.push(...sqliteData.packerLogs);
      }
      if (sqliteData.settings) {
        Object.assign(settings, sqliteData.settings);
      }
      if (sqliteData.messengerSlips && Array.isArray(sqliteData.messengerSlips) && sqliteData.messengerSlips.length > 0) {
        messengerSlips.length = 0;
        messengerSlips.push(...sqliteData.messengerSlips);
        console.log(`[SQLite Loaded] Restored ${messengerSlips.length} messenger slips from SQLite pos.db`);
      }
      console.log(`[SQLite Loaded] Loaded ${invoices.length} invoices, ${products.length} products from pos.db`);
    }

    // 1a. Reconcile & merge with server/db_store.json, ~/.karishop_data/db_store_backup.json, and workflow_ledger.json!
    // This guarantees that even if pos.db lagged behind or `git pull` touched files inside the repo,
    // no picked/staged/paid/dispatched basket or newly created invoice ever reverts to UNPICKED!
    const jsonStoreCandidates = [EXTERNAL_DB_BACKUP_PATH, DB_FILE_PATH];
    const parsedStores: any[] = [];
    for (const storePath of jsonStoreCandidates) {
      if (fs.existsSync(storePath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
          if (parsed && typeof parsed === 'object') {
            parsedStores.push(parsed);
          }
        } catch (err) {
          console.warn(`[DB Reconcile] Warning reading ${storePath}:`, err);
        }
      }
    }

    // Load workflow ledgers (external Git-immune ledger + local ledger)
    const mergedLedger: Record<string, WorkflowLedgerEntry> = {};
    for (const ledgerPath of [LOCAL_WORKFLOW_LEDGER_PATH, EXTERNAL_WORKFLOW_LEDGER_PATH]) {
      if (fs.existsSync(ledgerPath)) {
        try {
          const rawL = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
          if (rawL && typeof rawL === 'object') {
            for (const [k, val] of Object.entries(rawL)) {
              const entry = val as WorkflowLedgerEntry;
              const existing = mergedLedger[k];
              if (!existing) {
                mergedLedger[k] = entry;
              } else {
                const newRank = getStageRank(entry.packing_stage, entry.status);
                const oldRank = getStageRank(existing.packing_stage, existing.status);
                const newTime = entry.updated_at ? new Date(entry.updated_at).getTime() : 0;
                const oldTime = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
                if (newTime > oldTime || (newTime === oldTime && newRank > oldRank)) {
                  mergedLedger[k] = entry;
                }
              }
            }
          }
        } catch {}
      }
    }

    // Also incorporate invoices from parsedStores (db_store.json & external backup)
    if (parsedStores.length > 0) {
      const invById = new Map<number, Invoice>();
      const invByLiveBasket = new Map<string, Invoice>();
      for (const inv of invoices) {
        invById.set(inv.invoice_id, inv);
        if (inv.live_id && inv.basket_no) {
          invByLiveBasket.set(`${inv.live_id}_b_${inv.basket_no}`, inv);
        }
      }

      let restoredMissingCount = 0;
      let restoredStageCount = 0;

      for (const store of parsedStores) {
        if (store.dataRevision && store.dataRevision > dataRevision) {
          dataRevision = store.dataRevision;
        }
        if (Array.isArray(store.invoices)) {
          // If store has an activeLiveId that has more invoices than current activeLiveId, adopt it
          if (store.activeLiveId && (!activeLiveId || invoices.length <= 10)) {
            activeLiveId = store.activeLiveId;
          }
          for (const sInv of store.invoices as Invoice[]) {
            if (!sInv || !sInv.invoice_id) continue;
            const liveBasketKey = sInv.live_id && sInv.basket_no ? `${sInv.live_id}_b_${sInv.basket_no}` : '';
            const existing = invById.get(sInv.invoice_id) || (liveBasketKey ? invByLiveBasket.get(liveBasketKey) : undefined);

            if (!existing) {
              invoices.push(sInv);
              invById.set(sInv.invoice_id, sInv);
              if (liveBasketKey) invByLiveBasket.set(liveBasketKey, sInv);
              restoredMissingCount++;
            } else {
              // Compare workflow stage & timestamps between existing (SQLite) and sInv (JSON store)
              const existingRank = getStageRank(existing.packing_stage, existing.status);
              const candidateRank = getStageRank(sInv.packing_stage, sInv.status);
              const existingTime = (existing as any).updated_at ? new Date((existing as any).updated_at).getTime() : 0;
              const candidateTime = (sInv as any).updated_at ? new Date((sInv as any).updated_at).getTime() : 0;

              const shouldAdoptStage =
                (candidateTime > existingTime && candidateTime > 0) ||
                (candidateTime === existingTime && candidateRank > existingRank) ||
                (existingRank === 0 && candidateRank > 0);

              if (shouldAdoptStage) {
                if (existing.packing_stage !== sInv.packing_stage || existing.status !== sInv.status) {
                  restoredStageCount++;
                }
                existing.packing_stage = sInv.packing_stage || existing.packing_stage;
                existing.status = sInv.status || existing.status;
                if ((sInv as any).payment_status) (existing as any).payment_status = (sInv as any).payment_status;
                if (sInv.staged_by) existing.staged_by = sInv.staged_by;
                if (sInv.staged_at) existing.staged_at = sInv.staged_at;
                if (sInv.verified_by) existing.verified_by = sInv.verified_by;
                if (sInv.verified_at) existing.verified_at = sInv.verified_at;
                if (sInv.paid_by) existing.paid_by = sInv.paid_by;
                if (sInv.paid_at) existing.paid_at = sInv.paid_at;
                if ((sInv as any).dispatched_by) (existing as any).dispatched_by = (sInv as any).dispatched_by;
                if ((sInv as any).dispatched_at) (existing as any).dispatched_at = (sInv as any).dispatched_at;
                if (sInv.msg_status && sInv.msg_status !== 'UNSENT') existing.msg_status = sInv.msg_status;
                if ((sInv as any).updated_at) (existing as any).updated_at = (sInv as any).updated_at;
              }

              // Preserve packed flags on items
              if (Array.isArray(sInv.items) && Array.isArray(existing.items)) {
                for (const sItem of sInv.items) {
                  if (sItem.is_packed) {
                    const matchIt = existing.items.find(it => (it.product_code || '').toUpperCase().trim() === (sItem.product_code || '').toUpperCase().trim());
                    if (matchIt && !matchIt.is_packed) {
                      matchIt.is_packed = true;
                    }
                  }
                }
              }
            }
          }
        }

        // Merge any missing products from JSON store (strictly preserving their original live_id)
        if (Array.isArray(store.products) && store.products.length > 0) {
          const existingProdKeys = new Set(products.map(p => `${normalizeLiveId(p.live_id || 'LEGACY_ISOLATED')}_${(p.code || '').toUpperCase().trim()}`));
          let maxProdId = products.reduce((m, p) => Math.max(m, p.id || 0), 0);
          for (const sp of store.products) {
            if (!sp || !sp.code || !sp.live_id) continue;
            const normLive = normalizeLiveId(sp.live_id);
            const key = `${normLive}_${sp.code.toUpperCase().trim()}`;
            if (!existingProdKeys.has(key)) {
              products.push({ ...sp, live_id: normLive, id: sp.id || ++maxProdId });
              existingProdKeys.add(key);
            }
          }
        }

        // Merge any missing packerLogs from JSON store
        if (Array.isArray(store.packerLogs) && store.packerLogs.length > 0) {
          const seenLogInvs = new Set(packerLogs.map(l => `${l.invoice_id}_${l.packed_at}`));
          let maxLogId = packerLogs.reduce((m, l) => Math.max(m, l.log_id || 0), 0);
          for (const sl of store.packerLogs) {
            const key = `${sl.invoice_id}_${sl.packed_at}`;
            if (!seenLogInvs.has(key)) {
              packerLogs.push({ ...sl, log_id: sl.log_id || ++maxLogId });
              seenLogInvs.add(key);
            }
          }
        }

        // Merge linked_live_videos from JSON store settings
        if (store.settings?.linked_live_videos && typeof store.settings.linked_live_videos === 'object') {
          if (!settings.linked_live_videos) settings.linked_live_videos = {};
          for (const [k, v] of Object.entries(store.settings.linked_live_videos)) {
            if (Array.isArray(v)) {
              const existingList = settings.linked_live_videos[k] || [];
              settings.linked_live_videos[k] = Array.from(new Set([...existingList, ...(v as string[])]));
            }
          }
        }
      }

      if (restoredMissingCount > 0 || restoredStageCount > 0) {
        console.log(`[DB Reconcile] Restored ${restoredMissingCount} missing baskets and ${restoredStageCount} basket stages from JSON backup store.`);
      }
    }

    // Reconcile every invoice against the Git-immune workflow ledger
    let ledgerRestoredCount = 0;
    for (const inv of invoices) {
      const ledgerEntry =
        mergedLedger[`id_${inv.invoice_id}`] ||
        (inv.live_id && inv.basket_no ? mergedLedger[`live_${inv.live_id}_b_${inv.basket_no}`] : undefined);

      if (ledgerEntry) {
        const invRank = getStageRank(inv.packing_stage, inv.status);
        const ledgerRank = getStageRank(ledgerEntry.packing_stage, ledgerEntry.status);
        const invTime = (inv as any).updated_at ? new Date((inv as any).updated_at).getTime() : 0;
        const ledgerTime = ledgerEntry.updated_at ? new Date(ledgerEntry.updated_at).getTime() : 0;

        if ((ledgerTime > invTime && ledgerTime > 0) || (ledgerTime === invTime && ledgerRank > invRank) || (invRank === 0 && ledgerRank > 0)) {
          if (inv.packing_stage !== ledgerEntry.packing_stage || inv.status !== ledgerEntry.status) {
            ledgerRestoredCount++;
          }
          inv.packing_stage = (ledgerEntry.packing_stage as any) || inv.packing_stage;
          inv.status = (ledgerEntry.status as any) || inv.status;
          if (ledgerEntry.payment_status) (inv as any).payment_status = ledgerEntry.payment_status;
          if (ledgerEntry.staged_by) inv.staged_by = ledgerEntry.staged_by;
          if (ledgerEntry.staged_at) inv.staged_at = ledgerEntry.staged_at;
          if (ledgerEntry.verified_by) inv.verified_by = ledgerEntry.verified_by;
          if (ledgerEntry.verified_at) inv.verified_at = ledgerEntry.verified_at;
          if (ledgerEntry.paid_by) inv.paid_by = ledgerEntry.paid_by;
          if (ledgerEntry.paid_at) inv.paid_at = ledgerEntry.paid_at;
          if (ledgerEntry.dispatched_by) (inv as any).dispatched_by = ledgerEntry.dispatched_by;
          if (ledgerEntry.dispatched_at) (inv as any).dispatched_at = ledgerEntry.dispatched_at;
          if (ledgerEntry.msg_status && ledgerEntry.msg_status !== 'UNSENT') inv.msg_status = ledgerEntry.msg_status as any;
          (inv as any).updated_at = ledgerEntry.updated_at;
        }

        if (ledgerEntry.items_packed && Array.isArray(inv.items)) {
          for (const it of inv.items) {
            const cleanCode = (it.product_code || '').toUpperCase().trim();
            if (cleanCode && ledgerEntry.items_packed[cleanCode]) {
              it.is_packed = true;
            }
          }
        }
      }
    }
    if (ledgerRestoredCount > 0) {
      console.log(`[Workflow Ledger] Restored ${ledgerRestoredCount} basket workflow stages from persistent ledger.`);
    }

    // 1b. Auto-heal from live_invoices.json / live_products.json / all_real_comments.json if SQLite had only seed records
    const LIVE_INVOICES_PATH = path.join(process.cwd(), 'server', 'live_invoices.json');
    const LIVE_PRODUCTS_PATH = path.join(process.cwd(), 'server', 'live_products.json');
    const ALL_COMMENTS_PATH = path.join(process.cwd(), 'server', 'all_real_comments.json');
    if (invoices.length <= 10 && fs.existsSync(LIVE_INVOICES_PATH)) {
      try {
        const liveInvs = JSON.parse(fs.readFileSync(LIVE_INVOICES_PATH, 'utf8'));
        if (Array.isArray(liveInvs) && liveInvs.length > invoices.length) {
          const existingIds = new Set(invoices.map(i => i.invoice_id));
          for (const li of liveInvs) {
            if (!existingIds.has(li.invoice_id)) {
              invoices.push(li);
              existingIds.add(li.invoice_id);
            }
          }
          if (liveInvs[0]?.live_id) {
            activeLiveId = liveInvs[0].live_id;
          }
          console.log(`[DB Auto-Heal] Restored ${liveInvs.length} live invoices (activeLiveId=${activeLiveId})`);
        }
        if (fs.existsSync(LIVE_PRODUCTS_PATH)) {
          const liveProds = JSON.parse(fs.readFileSync(LIVE_PRODUCTS_PATH, 'utf8'));
          if (Array.isArray(liveProds)) {
            const existingProdKeys = new Set(products.map(p => `${normalizeLiveId(p.live_id || 'LEGACY_ISOLATED')}_${p.code}`));
            let maxId = products.reduce((m, p) => Math.max(m, p.id || 0), 0);
            for (const lp of liveProds) {
              if (!lp || !lp.code || !lp.live_id) continue;
              const normLive = normalizeLiveId(lp.live_id);
              const key = `${normLive}_${lp.code}`;
              if (!existingProdKeys.has(key)) {
                products.push({ ...lp, live_id: normLive, id: ++maxId });
                existingProdKeys.add(key);
              }
            }
          }
        }
        if (fs.existsSync(ALL_COMMENTS_PATH) && rawComments.length <= 10) {
          const allComms = JSON.parse(fs.readFileSync(ALL_COMMENTS_PATH, 'utf8'));
          if (Array.isArray(allComms) && allComms.length > rawComments.length) {
            const existingCids = new Set(rawComments.map(c => c.comment_id));
            for (const rc of allComms) {
              if (rc.comment_id && !existingCids.has(rc.comment_id)) {
                rawComments.push({
                  ...rc,
                  live_id: rc.live_id || activeLiveId,
                  is_matched: Boolean(rc.invoice_id)
                });
                existingCids.add(rc.comment_id);
              }
            }
          }
        }
      } catch (healErr) {
        console.error('[DB Auto-Heal] Failed restoring live JSON files:', healErr);
      }
    }

    // 2. Load / supplement messengerSlips from db_store.json or backup file if empty
    const BACKUP_SLIPS_PATH = path.join(process.cwd(), 'server', 'messenger_slips_backup.json');
    if (messengerSlips.length === 0) {
      let candidateSlips: any[] = [];
      for (const store of parsedStores) {
        if (store.messengerSlips && Array.isArray(store.messengerSlips) && store.messengerSlips.length > 0) {
          candidateSlips = store.messengerSlips;
          break;
        }
      }

      if (candidateSlips.length === 0 && fs.existsSync(BACKUP_SLIPS_PATH)) {
        try {
          const raw = fs.readFileSync(BACKUP_SLIPS_PATH, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            candidateSlips = parsed;
          }
        } catch (bkErr) {
          console.error('Error reading from backup slips file:', bkErr);
        }
      }

      if (candidateSlips.length > 0) {
        messengerSlips.length = 0;
        // Cleanse receiver names, normalize amounts, and strictly keep ONLY genuine bank transfer slips
        const validSlips = candidateSlips.filter((s: any) => {
          const amt = Number(s.extracted?.paid_amount) || 0;
          const hasBankOrRef = Boolean(s.extracted?.bank_name || s.extracted?.trans_ref);
          return amt > 0 || hasBankOrRef;
        });

        for (const s of validSlips) {
          const raw = (s.extracted?.customer_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (raw.includes('proeltoch') || raw.includes('proel') || raw.includes('toch') || !s.extracted?.customer_name) {
            if (s.extracted) {
              s.extracted.customer_name = s.sender_name || (s.matched_invoice && s.matched_invoice.facebook_name) || 'អតិថិជន Facebook';
            }
          }
          // Normalize amounts in Riel (e.g. 19,300 KHR -> $4.71 USD)
          if (s.extracted && (s.extracted.currency === 'KHR' || s.extracted.paid_amount > 500)) {
            s.extracted.paid_amount = Math.round((s.extracted.paid_amount / 4100) * 100) / 100;
            s.extracted.currency = 'USD';
          }
        }
        messengerSlips.push(...validSlips);
        console.log(`[Slips Loaded] Restored ${messengerSlips.length} messenger slips from persistent storage.`);
      }
    }

    // Seed default auto-scanned slips ONLY for empty virgin brand new instance
    if (messengerSlips.length === 0 && invoices.length === 0 && !fs.existsSync(BACKUP_SLIPS_PATH)) {
      messengerSlips.push(
        {
          id: `mslip_101_${Date.now()}`,
          source: 'MESSENGER',
          sender_id: '100088991122334',
          sender_name: 'សុខ ស្រីម៉ៅ (Srey Mao)',
          slip_url: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80',
          received_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
          extracted: {
            customer_name: 'SOK SREY MAO',
            paid_amount: 17.00,
            currency: 'USD',
            phone_number: '012 889 772',
            bank_name: 'ABA Bank',
            trans_ref: 'ABA78912345',
            basket_no: 101,
            remarks: '101'
          },
          status: 'MATCHED',
          confidence: 100,
          matched_invoice: {
            invoice_id: 101,
            basket_no: 101,
            live_id: 'LIVE_20260913_VIP',
            facebook_name: 'សុខ ស្រីម៉ៅ (Srey Mao)',
            phone_number: '012 889 772',
            total_amount: 17.00,
            created_at: '2026-09-13T14:30:00',
            packing_stage: 'UNPICKED',
            status: 'Pending'
          }
        },
        {
          id: `mslip_860_${Date.now()}`,
          source: 'MESSENGER',
          sender_id: 'TEST_USER_1',
          sender_name: 'Dany Ka',
          slip_url: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=600&auto=format&fit=crop&q=80',
          received_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          extracted: {
            customer_name: 'DANY KA',
            paid_amount: 15.50,
            currency: 'USD',
            phone_number: '096 442 8567',
            bank_name: 'ACLEDA ToanChet',
            trans_ref: 'ACL99887711',
            basket_no: 860,
            remarks: 'កន្ត្រក 860'
          },
          status: 'MATCHED',
          confidence: 100,
          matched_invoice: {
            invoice_id: 860,
            basket_no: 860,
            live_id: '1626350178950100',
            facebook_name: 'Dany Ka',
            phone_number: '096 442 8567',
            total_amount: 15.50,
            created_at: new Date().toISOString(),
            packing_stage: 'STAGED',
            status: 'Pending'
          }
        },
        {
          id: `mslip_104_${Date.now()}`,
          source: 'MESSENGER',
          sender_id: '100011223344556',
          sender_name: 'ពេជ្រ សុជាតា (Pech Socheata)',
          slip_url: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&auto=format&fit=crop&q=80',
          received_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
          extracted: {
            customer_name: 'PECH SOCHEATA',
            paid_amount: 16.00,
            currency: 'USD',
            phone_number: '070 998 811',
            bank_name: 'Bakong / KHQR',
            trans_ref: 'BKG44556677',
            basket_no: 104,
            remarks: '104'
          },
          status: 'MATCHED',
          confidence: 100,
          matched_invoice: {
            invoice_id: 104,
            basket_no: 104,
            live_id: 'LIVE_20260913_VIP',
            facebook_name: 'ពេជ្រ សុជាតា (Pech Socheata)',
            phone_number: '070 998 811',
            total_amount: 16.00,
            created_at: '2026-09-13T14:48:22',
            packing_stage: 'UNPICKED',
            status: 'Pending'
          }
        }
      );
    }

    // Ensure sample basket #860 for Dany Ka exists for seamless testing
    if (invoices.length === 0 || !invoices.some(i => i.basket_no === 860 || i.invoice_id === 860)) {
      invoices.push({
        invoice_id: 860,
        basket_no: 860,
        live_id: activeLiveId || '1626350178950100',
        created_at: new Date().toISOString(),
        facebook_user_id: 'TEST_USER_1',
        facebook_name: 'Dany Ka',
        phone_number: '096 442 8567',
        address: 'ចាក់អង្រែលើ ភ្នំពេញ',
        location_zone: 'PP',
        location_label: '🏙️ ភ្នំពេញ',
        total_amount: 15.50,
        shipping_fee: 1.00,
        is_free_ship: false,
        status: 'Pending',
        packing_stage: 'STAGED',
        staged_by: 'សុខា',
        staged_at: new Date().toISOString(),
        msg_status: 'SENT',
        items: [
          { id: 10, invoice_id: 860, product_id: 4, product_code: 'B05', product_name: 'ឈុតគេងយប់សូត្រ VIP', quantity: 2, price: 5.00, is_packed: true, item_comment: 'B05=2' },
          { id: 11, invoice_id: 860, product_id: 2, product_code: '54', product_name: 'អាវយឺតកូរ៉េដៃខ្លី', quantity: 1, price: 4.50, is_packed: true, item_comment: '54x1' }
        ],
        comments: [
          'B05=2 និង 54 មួយចែ 0964428567 ចាក់អង្រែលើ ភ្នំពេញ'
        ],
        unmatched_comments: []
      });
    }

    // Strictly enforce shipping fee $2.0 flat across all orders
    settings.default_shipping_fee = 2.0;
    settings.free_ship_threshold = 0;
    settings.bulk_discount_qty = 0;
    settings.bulk_discount_amount = 0;

    // Purge invalid clothing size codes and bogus auto-created entries
    const invalidSizes = new Set([
      'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXS', '2XL', '3XL', '4XL', '5XL', '6XL', 'FS', 'FREESIZE', 'FREE-SIZE',
      'M1', '443', '209'
    ]);

    const initialProductCount = products.length;
    const purgedProductCodes = new Set<string>();

    const sanitizedProducts = products.filter(p => {
      const cleanCode = (p.code || '').toUpperCase().trim();
      const isAutoDummy = !p.image_file && (p.price === 0 || p.name === `កូដ ${cleanCode}` || p.name === `កូដ [${cleanCode}]` || p.name === cleanCode || p.name === '=5.00');

      if (invalidSizes.has(cleanCode) && isAutoDummy) {
        purgedProductCodes.add(cleanCode);
        return false;
      }
      return true;
    });

    if (sanitizedProducts.length !== initialProductCount) {
      const purgedCount = initialProductCount - sanitizedProducts.length;
      products.length = 0;
      products.push(...sanitizedProducts);
      console.log(`[Stock Cleanup] Purged ${purgedCount} invalid clothing size and bogus entries from products stock.`);
    }

    // Clean up purged dummy items from invoices
    if (purgedProductCodes.size > 0) {
      invoices.forEach(inv => {
        if (inv.items && Array.isArray(inv.items)) {
          inv.items = inv.items.filter(it => !purgedProductCodes.has((it.product_code || '').toUpperCase().trim()));
        }
      });
    }

    // Normalize activeLiveId if it contains composite page prefix
    if (activeLiveId && activeLiveId.includes('_') && !activeLiveId.startsWith('LIVE_')) {
      activeLiveId = activeLiveId.split('_').pop() || activeLiveId;
    }

    // Sanitize products, ensure live_id is normalized & isolated (never assign orphan products to activeLiveId), and format names
    products.forEach(p => {
      if (p.live_id && p.live_id.includes('_') && !p.live_id.startsWith('LIVE_')) {
        p.live_id = p.live_id.split('_').pop() || p.live_id;
      }
      if (!p.live_id) {
        p.live_id = 'LEGACY_ISOLATED';
      }
      if (p.name && p.name.startsWith('ទំនិញកូដ')) {
        p.name = p.name.replace(/^ទំនិញកូដ\s*/, 'កូដ ');
      }
    });

    // Normalize rawComments live_id
    rawComments.forEach(rc => {
      if (rc.live_id && rc.live_id.includes('_') && !rc.live_id.startsWith('LIVE_')) {
        rc.live_id = rc.live_id.split('_').pop() || rc.live_id;
      }
    });

    // Immediately mark database as loaded and ready so HTTP requests are served with 0ms delay on restart
    products.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' }));
    isDatabaseLoaded = true;
    bumpDataRevision(false);

    // Migrate loaded invoices in non-blocking async chunks of 25 so the Node.js event loop never freezes on restart
    for (let invIdx = 0; invIdx < invoices.length; invIdx++) {
      if (invIdx > 0 && invIdx % 25 === 0) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      const inv = invoices[invIdx];
      if (!inv) continue;

      if (inv.live_id && inv.live_id.includes('_') && !inv.live_id.startsWith('LIVE_')) {
        inv.live_id = inv.live_id.split('_').pop() || inv.live_id;
      }
      inv.is_free_ship = false;
      (inv as any).discount_amount = 0;
      if (!inv.shipping_fee || inv.shipping_fee <= 0 || inv.shipping_fee === 2.5) {
        inv.shipping_fee = 2.0;
      }

      // Populate / preserve payment_status
      if (inv.status === 'Paid' || inv.paid_at || inv.paid_by) {
        inv.payment_status = 'Paid';
      } else if (inv.status === 'Dispatched' || inv.packing_stage === 'DISPATCHED') {
        inv.payment_status = (inv.paid_at || inv.paid_by) ? 'Paid' : 'COD';
      } else {
        inv.payment_status = inv.payment_status || 'Unpaid';
      }

      // Skip heavy regex re-auditing for already completed/dispatched historical invoices
      const isHistoricalCompleted = inv.status === 'Dispatched' || inv.packing_stage === 'DISPATCHED';
      if (isHistoricalCompleted) {
        recalculateInvoice(inv);
        continue;
      }

      // Auto-heal missing phone number from comments
      if (!inv.phone_number || inv.phone_number === 'គ្មានលេខ' || inv.phone_number.includes('មិនទាន់មាន') || inv.phone_number.length < 8) {
        for (const c of inv.comments || []) {
          const mPhone = String(c).match(/(?:(?:\+?855[\s.\-()]*|0)[1-9](?:[\s.\-()]*\d){7,8}(?!\d))|(?:លេខ\s*0\d{8,9})|(?:\b0\d{8,9}\b)/i);
          if (mPhone) {
            const digits = mPhone[0].replace(/\D/g, '');
            if (digits.length >= 8 && digits.length <= 11) {
              inv.phone_number = digits.startsWith('855') ? '0' + digits.slice(3) : digits;
              break;
            }
          }
        }
      }

      // Sanitize existing address: strip accidental product codes, phone numbers, sizes, colors, or chat questions
      if (inv.address) {
        if (isQuestionOrLiveChatter(inv.address) || /(?:ខោជើងប៉ាត|160m|ពាក់បានអត់|ពាក់បានទេ|លក់ម៉េច|ប៉ុន្មាន|បងមាន|ចែមាន|មានសំពត់|សំពត់ក្មេង|លើកសំពត់|លើកឈុត|មានពណ៌|តើអី|បងលើក|ចែលើក)/i.test(inv.address)) {
          inv.address = '';
        } else if (/(?:(?<=[^\w\u1780-\u17D2]|^)[A-Za-z0-9]{1,5}\s*[:=/\-_*xX»]+\s*[\*\-_=A-Za-z0-9]*)|(?:\b(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS)\b)|(?:ពណ៌|ពណ៍)\s*[\u1780-\u17D2]+|(?:\b0\d{8,9}\b)|(?:\*+)/i.test(inv.address)) {
          const cleaned = extractCleanAddressFromComment(inv.address);
          inv.address = cleaned || '';
        } else if (inv.address === 'ចេាមចៅ') {
          inv.address = 'ចោមចៅ';
        }
      }

      // If address is empty or missing, search ALL comments for clean address
      if (!inv.address || inv.address.includes('មិនទាន់មាន') || inv.address === '🏙️ ភ្នំពេញ' || inv.address === 'ភ្នំពេញ' || inv.address === '🏞️ តាមខេត្ត' || isQuestionOrLiveChatter(inv.address)) {
        let foundCleanAddr = '';
        for (const c of inv.comments || []) {
          const clean = extractCleanAddressFromComment(c);
          if (clean && !isQuestionOrLiveChatter(clean)) {
            foundCleanAddr = clean;
            break;
          }
        }
        if (foundCleanAddr) {
          inv.address = foundCleanAddr;
        }
      }

      // Core Routing Rule: Accurate Phnom Penh detection, all remaining baskets are Province!
      const zoneCheckTarget = (inv.address && !inv.address.includes('មិនទាន់មាន') && !isQuestionOrLiveChatter(inv.address)) ? inv.address : (inv.comments || []).join(' ');
      const zoneRes = detectDeliveryZone(zoneCheckTarget);

      if (zoneRes.zone === 'PP') {
        inv.location_zone = 'PP';
        inv.location_label = '🏙️ ភ្នំពេញ';
        if (zoneRes.detectedLocation && (!inv.address || inv.address.includes('មិនទាន់មាន') || inv.address === '🏞️ តាមខេត្ត' || isQuestionOrLiveChatter(inv.address))) {
          inv.address = zoneRes.detectedLocation;
        }
      } else {
        inv.location_zone = 'PROVINCE';
        inv.location_label = '🏞️ តាមខេត្ត';
        if (zoneRes.hasExplicitLocation && zoneRes.detectedLocation && !isQuestionOrLiveChatter(zoneRes.detectedLocation)) {
          inv.address = zoneRes.detectedLocation;
        } else if (!inv.address || inv.address.includes('មិនទាន់មាន') || isQuestionOrLiveChatter(inv.address)) {
          inv.address = '⚠️ មិនទាន់មានអាសយដ្ឋាន';
        }
      }

      // Clean unclosed parenthesis if any
      if (inv.address) {
        inv.address = inv.address.replace(/\s*\([A-Za-z0-9\s]*$/, '').trim();
        const openP = (inv.address.match(/\(/g) || []).length;
        const closeP = (inv.address.match(/\)/g) || []).length;
        if (openP > closeP) inv.address += ')';
      }

      // Filter out pure phone numbers, pure addresses, and chat inquiries from unmatched_comments
      if (inv.unmatched_comments && Array.isArray(inv.unmatched_comments)) {
        inv.unmatched_comments = inv.unmatched_comments.filter(c => !isPureContactOrInquiryComment(c));
      }

      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(it => {
          if (it.product_name && it.product_name.startsWith('ទំនិញកូដ')) {
            it.product_name = it.product_name.replace(/^ទំនិញកូដ\s*/, 'កូដ ');
          }
        });

        const allCommentsText = ((inv.comments || []).join(' ') + ' ' + (inv.items || []).map(it => it.item_comment || '').join(' ')).replace(/[\u200B\u200C\u200D\uFEFF]/g, ' ');
        inv.items = inv.items.filter(it => {
          const cleanC = (it.product_code || '').toUpperCase().trim();
          const isWaistNum = parseInt(cleanC, 10);
          if (!isNaN(isWaistNum) && isWaistNum >= 24 && isWaistNum <= 46) {
            const waistInCommentPattern = new RegExp(`(?:ចង្កេះ|ចង្កះ|ចង្កែះ|សាយ|size|ស្លឹក|[-_\\/\\\\])\\s*${cleanC}\\b`, 'i');
            const waistListPattern = new RegExp(`(?:ចង្កេះ|ចង្កះ|ចង្កែះ|សាយ|size|ស្លឹក)\\s*[:=\\s\\-]?\\s*(?:(?:2[4-9]|3[0-9]|4[0-6])(?:\\s*[\\/+,.,និង\\-_]\\s*|\\s+))*${cleanC}\\b`, 'i');
            if (waistInCommentPattern.test(allCommentsText) || waistListPattern.test(allCommentsText)) {
              return false;
            }
            if (it.item_comment && /^[A-Za-z0-9]{2,5}\s*(?:size|សាយ|ចង្កេះ)/i.test(it.item_comment.trim())) {
              const commentParentCode = it.item_comment.trim().match(/^([A-Za-z0-9]{2,5})/i)?.[1]?.toUpperCase();
              if (commentParentCode && commentParentCode !== cleanC) {
                return false;
              }
            }
          }
          const isQtyNum = parseInt(cleanC, 10);
          if (!isNaN(isQtyNum) && isQtyNum >= 1 && isQtyNum <= 20) {
            const falseQtyFromAction = new RegExp(`[A-Za-z0-9]{2,5}\\s*(?:យក|កាត់|ថែម|ដាក់|កក់|=)\\s*${cleanC}\\b`, 'i');
            if (falseQtyFromAction.test(allCommentsText)) {
              const parentItem = inv.items.find(other => other.quantity === isQtyNum && other.product_code !== it.product_code);
              if (parentItem) {
                return false;
              }
            }
          }

          const addressMatch = new RegExp(`(?:គំរោង|គម្រោង|ផ្លូវ|ផ្ទះ|បន្ទប់|ជាន់ទី)\\s*(?:លេខ|ទី)?\\s*${cleanC}\\b`, 'i');
          if (addressMatch.test(allCommentsText)) {
            return false;
          }

          const kiloPattern = new RegExp(`(?:គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គីឡុ|គីឡួ|គីឡូក្រាម|គឺឡូក្រាម|គក|kg|kilo)\\s*[:=\\s\\-_/]?\\s*${cleanC}\\b`, 'i');
          const kiloAfterPattern = new RegExp(`\\b${cleanC}\\s*(?:kg|kilo|គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គក)\\b`, 'i');
          if (kiloPattern.test(allCommentsText) || kiloAfterPattern.test(allCommentsText)) {
            const otherItemsWithThisWeight = inv.items.filter(other => other.product_code !== cleanC && (
              (other.item_comment && (kiloPattern.test(other.item_comment) || kiloAfterPattern.test(other.item_comment)))
            ));
            const ownCommentParentCode = it.item_comment ? it.item_comment.trim().match(/^([A-Za-z0-9]{2,5})/i)?.[1]?.toUpperCase() : null;

            if (otherItemsWithThisWeight.length > 0 || (ownCommentParentCode && ownCommentParentCode !== cleanC)) {
              return false;
            }
          }

          const chestPattern = new RegExp(`(?:ដើមទ្រូង|ទ្រូង)\\s*[:=\\s\\-]?\\s*${cleanC}\\b`, 'i');
          if (chestPattern.test(allCommentsText)) {
            const otherItemsWithThisChest = inv.items.filter(other => other.product_code !== cleanC && (
              (other.item_comment && chestPattern.test(other.item_comment))
            ));
            const ownCommentParentCode = it.item_comment ? it.item_comment.trim().match(/^([A-Za-z0-9]{2,5})/i)?.[1]?.toUpperCase() : null;
            if (otherItemsWithThisChest.length > 0 || (ownCommentParentCode && ownCommentParentCode !== cleanC)) {
              return false;
            }
          }

          return true;
        });

        for (const it of inv.items) {
          const rawComment = it.item_comment || '';
          if (rawComment) {
            const multiWaistRegex = new RegExp(`(?:(?<![A-Za-z0-9])${it.product_code}\\s*(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ស្លឹក)\\s*[:=\\s\\-]?\\s*((?:(?:2[4-9]|3[0-9]|4[0-6])\\s*(?:[:=xX]\\s*\\d{1,2})?(?:\\s*[\\/+,.,និង\\-_]\\s*|\\s+)?)+))`, 'i');
            const m = rawComment.match(multiWaistRegex);
            if (m && m[1]) {
              const singleWaistRegex = /(2[4-9]|3[0-9]|4[0-6])(?:\s*[:=xX]\s*(\d{1,2}))?/gi;
              let totalWaistQty = 0;
              let wm: RegExpExecArray | null;
              while ((wm = singleWaistRegex.exec(m[1])) !== null) {
                totalWaistQty += (wm[2] ? (parseInt(wm[2], 10) || 1) : 1);
              }
              if (totalWaistQty > it.quantity) {
                it.quantity = totalWaistQty;
              }
            }
          }
        }

        inv.items = inv.items.filter(it => {
          if (!it.item_comment) return true;
          const cleanCode = (it.product_code || '').toUpperCase().trim();
          const subComments = it.item_comment.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
          const seenNorm = new Set<string>();
          let matchedQty = 0;
          let matchedAny = false;
          for (const sc of subComments) {
            const normKey = sc.replace(/0\d{8,9}|\*+/g, '').replace(/\s+/g, ' ').trim();
            const pairs = extractCodeQtyPairsFromComment(sc, products, false);
            const found = pairs.find(p => p.code.toUpperCase() === cleanCode || p.code.replace(/^0+/, '') === cleanCode.replace(/^0+/, ''));
            if (found) {
              matchedAny = true;
              if (!seenNorm.has(normKey)) {
                seenNorm.add(normKey);
                matchedQty += found.qty;
              }
            }
          }
          if (!matchedAny) {
            return false;
          }
          if (matchedQty > 0 && matchedQty !== it.quantity) {
            it.quantity = matchedQty;
          }
          const cleanNote = extractSizeAndColorNotes(it.item_comment);
          if (cleanNote) {
            it.note = cleanNote;
          } else if (it.note && it.note.includes('ពណ៌ស') && !/(?:^|\s)ស(?:\s|$)|ពណ៌\s*ស|ពណ៍\s*ស/.test(it.item_comment)) {
            it.note = it.note.replace(/\s*\|\s*ពណ៌ស|ពណ៌ស\s*\|\s*|ពណ៌ស/g, '').trim() || undefined;
          }
          return true;
        });

        for (const rawC of inv.comments || []) {
          if (/[-_]/.test(rawC)) {
            const invSessionProds = products.filter(pr => normalizeLiveId(pr.live_id || '') === normalizeLiveId(inv.live_id || activeLiveId));
            const pairs = extractCodeQtyPairsFromComment(rawC, invSessionProds, false);
            for (const p of pairs) {
              const alreadyHas = inv.items.some(it => (it.product_code || '').toUpperCase().trim() === p.code.toUpperCase());
              if (!alreadyHas) {
                const stockProd = invSessionProds.find(pr => pr.code.toUpperCase() === p.code.toUpperCase());
                const note = extractSizeAndColorNotes(rawC);
                inv.items.push({
                  id: Date.now() + Math.floor(Math.random() * 10000),
                  invoice_id: inv.invoice_id,
                  product_id: stockProd ? stockProd.id : 0,
                  product_code: p.code.toUpperCase(),
                  product_name: stockProd ? stockProd.name : `កូដ ${p.code.toUpperCase()}`,
                  quantity: p.qty,
                  price: stockProd ? stockProd.price : 0,
                  is_packed: false,
                  item_comment: rawC,
                  image_file: stockProd?.image_file || '',
                  ...(note ? { note } : {})
                });
              }
            }
          }
        }
      }

      recalculateInvoice(inv);
    }

    // Remove any leftover 0-item empty baskets from previous question comments
    cleanupEmptyZeroItemInvoices(false);

    // Automatically sync all active (non-dispatched) basket prices & photos strictly within their own live sessions
    syncAllActiveInvoicesWithStock(undefined, false);
    bumpDataRevision(false);
  } catch (err) {
    isDatabaseLoaded = true;
    console.error('Failed to load database on startup:', err);
  }
  })();
  return loadPromise;
}

export function getProductsForLive(liveId?: string): Product[] {
  const targetLive = liveId || activeLiveId;
  return products
    .filter(p => (p.live_id || activeLiveId) === targetLive)
    .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' }));
}

export function deduplicateAndSanitizeMessengerSlips(persist = true): number {
  let removed = 0;
  const seenIds = new Set<string>();
  const seenMids = new Set<string>();

  for (let i = messengerSlips.length - 1; i >= 0; i--) {
    const s = messengerSlips[i];
    if (!s || !s.extracted) {
      messengerSlips.splice(i, 1);
      removed++;
      continue;
    }

    // 1. Force Riel to USD conversion (e.g. 512,623 KHR -> $125.03)
    let amt = Number(s.extracted.paid_amount) || 0;
    const curr = String(s.extracted.currency || 'USD').toUpperCase();
    if (curr === 'KHR' || amt > 500) {
      amt = Math.round((amt / 4100) * 100) / 100;
      s.extracted.paid_amount = amt;
      s.extracted.currency = 'USD';
    }

    // 2. Filter non-bank photos only if zero amount AND no bank details AND no slip image
    const hasBankOrRef = Boolean(s.extracted.bank_name || s.extracted.trans_ref);
    if (amt <= 0 && !hasBankOrRef && !s.slip_url) {
      messengerSlips.splice(i, 1);
      removed++;
      continue;
    }

    // 3. Deduplicate strictly ONLY identical network/webhook duplicates (identical slip id or identical Facebook message id)
    // NEVER delete slips based on amount, sender, or bank - customers often send 2 slips for 1 basket or 2 transfers!
    let isIdenticalDuplicate = false;
    if (s.id) {
      if (seenIds.has(s.id)) {
        isIdenticalDuplicate = true;
      } else {
        seenIds.add(s.id);
      }
    }

    const mid = (s as any).mid || (s as any).message_id;
    if (mid) {
      if (seenMids.has(mid)) {
        isIdenticalDuplicate = true;
      } else {
        seenMids.add(mid);
      }
    }

    if (isIdenticalDuplicate) {
      messengerSlips.splice(i, 1);
      removed++;
    }
  }

  if (removed > 0) {
    bumpDataRevision(persist);
    console.log(`[DB Deduplicate] Safely sanitized ${removed} invalid/webhook-duplicate slips from queue.`);
  }

  return removed;
}

export function cleanupNonSlipMessengerEntries(): number {
  return deduplicateAndSanitizeMessengerSlips();
}

export function cleanupEmptyZeroItemInvoices(persist = true) {
  let removed = 0;
  for (let i = invoices.length - 1; i >= 0; i--) {
    if ((!invoices[i].items || invoices[i].items.length === 0) && (!invoices[i].total_amount || invoices[i].total_amount === 0)) {
      invoices.splice(i, 1);
      removed++;
    }
  }
  if (removed > 0) {
    bumpDataRevision(persist);
    console.log(`[DB Clean] Removed ${removed} empty 0-item baskets.`);
  }
}

// Load from disk on startup
loadDatabaseFromDisk().then(() => {
  deduplicateAndSanitizeMessengerSlips(false);
  bumpDataRevision(false);
}).catch(err => console.error(err));
