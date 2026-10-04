import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface CachedSlipData {
  customer_name: string;
  paid_amount: number;
  currency: 'USD' | 'KHR';
  phone_number?: string;
  bank_name?: string;
  trans_ref?: string;
  trans_date?: string;
  basket_no?: number | string;
  remarks?: string;
  fraud_suspected?: boolean;
  fraud_reasons?: string[];
  is_bank_slip?: boolean;
  cached_at: string;
}

const OCR_CACHE_PATH = path.join(process.cwd(), 'server', 'ocr_cache.json');
const PROCESSED_IDS_PATH = path.join(process.cwd(), 'server', 'synced_attachments.json');
const ocrMemoryCache = new Map<string, CachedSlipData>();
const processedIdsSet = new Set<string>();

let isDirty = false;
let isProcessedDirty = false;
let saveTimer: NodeJS.Timeout | null = null;

export function initOcrCache() {
  try {
    if (fs.existsSync(OCR_CACHE_PATH)) {
      const raw = fs.readFileSync(OCR_CACHE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [key, val] of Object.entries(parsed)) {
          if (val && typeof val === 'object') {
            ocrMemoryCache.set(key, val as CachedSlipData);
            // Also seed processed IDs from all known cache keys
            processedIdsSet.add(key);
          }
        }
        console.log(`[OCR Cache] Loaded ${ocrMemoryCache.size} cached slip OCR results from disk.`);
      }
    }

    if (fs.existsSync(PROCESSED_IDS_PATH)) {
      const rawIds = fs.readFileSync(PROCESSED_IDS_PATH, 'utf8');
      const parsedIds = JSON.parse(rawIds);
      if (Array.isArray(parsedIds)) {
        for (const id of parsedIds) {
          if (id) processedIdsSet.add(String(id));
        }
        console.log(`[Processed Tracker] Loaded ${processedIdsSet.size} previously scanned message/attachment IDs.`);
      }
    }
  } catch (err) {
    console.error('[OCR Cache] Failed to load ocr_cache.json or synced_attachments.json:', err);
  }
}

export function isProcessed(idOrUrl: string): boolean {
  if (!idOrUrl) return false;
  return processedIdsSet.has(idOrUrl);
}

export function markProcessed(idOrUrl: string) {
  if (!idOrUrl) return;
  if (!processedIdsSet.has(idOrUrl)) {
    processedIdsSet.add(idOrUrl);
    isProcessedDirty = true;
    scheduleSaveProcessed();
  }
}

export function markMultipleProcessed(idsOrUrls: string[]) {
  let changed = false;
  for (const id of idsOrUrls) {
    if (id && !processedIdsSet.has(id)) {
      processedIdsSet.add(id);
      changed = true;
    }
  }
  if (changed) {
    isProcessedDirty = true;
    scheduleSaveProcessed();
  }
}

function scheduleSaveProcessed() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const arr = Array.from(processedIdsSet);
      fs.writeFileSync(PROCESSED_IDS_PATH, JSON.stringify(arr), 'utf8');
      isProcessedDirty = false;
    } catch (e) {
      console.error('[Processed Tracker] Failed to save synced_attachments.json:', e);
    }
  }, 2000);
}

export function computeImageHash(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

export function getCachedOcr(keyOrHash: string): CachedSlipData | null {
  if (!keyOrHash) return null;
  const hit = ocrMemoryCache.get(keyOrHash);
  if (hit) {
    console.log(`[OCR Cache HIT] Reused cached slip OCR for key/hash: ${keyOrHash.substring(0, 32)} (0 AI Tokens Spent)`);
    return hit;
  }
  return null;
}

export function setCachedOcr(keyOrHash: string, data: Omit<CachedSlipData, 'cached_at'>, secondaryKeys: string[] = []) {
  if (!keyOrHash) return;
  const entry: CachedSlipData = {
    ...data,
    cached_at: new Date().toISOString()
  };

  ocrMemoryCache.set(keyOrHash, entry);
  for (const k of secondaryKeys) {
    if (k) {
      ocrMemoryCache.set(k, entry);
    }
  }

  isDirty = true;
  saveOcrCacheToDisk(true);
}

export function saveOcrCacheToDisk(forceSync = false) {
  try {
    const obj: Record<string, CachedSlipData> = {};
    for (const [k, v] of ocrMemoryCache.entries()) {
      obj[k] = v;
    }
    const jsonStr = JSON.stringify(obj, null, 2);
    fs.writeFileSync(OCR_CACHE_PATH, jsonStr, 'utf8');
    isDirty = false;
  } catch (err) {
    console.error('[OCR Cache] Failed to write ocr_cache.json:', err);
  }
}

// Initialize on module load
initOcrCache();
