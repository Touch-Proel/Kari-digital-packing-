import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { invoices, saveDatabaseToDisk, bumpDataRevision, settings, messengerSlips, AutoScannedMessengerSlip, activeFacebookPage, customers, rawComments } from './db';
import { Invoice } from './types';
import { sendFacebookMessengerReply, addChatbotLog } from './chatbotEngine';

const router = Router();

// Lazy-init Gemini client with dynamic API key support (env or UI settings)
let geminiClient: GoogleGenAI | null = null;
let currentActiveKey: string = '';

export function getGemini(): GoogleGenAI | null {
  const key = (process.env.GEMINI_API_KEY || settings.gemini_api_key || '').trim();
  if (!key) return null;
  if (!geminiClient || currentActiveKey !== key) {
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    currentActiveKey = key;
  }
  return geminiClient;
}

// GET /api/fast_check/gemini_status
router.get('/gemini_status', (req: Request, res: Response) => {
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  const dbKey = (settings.gemini_api_key || '').trim();
  const activeKey = envKey || dbKey;
  
  let maskedKey = '';
  if (activeKey) {
    maskedKey = activeKey.length > 8 
      ? `${activeKey.slice(0, 4)}••••••••${activeKey.slice(-4)}`
      : '••••••••';
  }

  res.json({
    success: true,
    hasKey: Boolean(activeKey),
    isFromEnv: Boolean(envKey),
    maskedKey,
    hasCustomKey: Boolean(dbKey)
  });
});

// POST /api/fast_check/save_gemini_key
router.post('/save_gemini_key', (req: Request, res: Response) => {
  const { gemini_api_key } = req.body;
  if (typeof gemini_api_key !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid API key format' });
  }

  const cleanKey = gemini_api_key.trim();
  settings.gemini_api_key = cleanKey;
  
  // Invalidate cached client to force re-initialization with new key
  geminiClient = null;
  currentActiveKey = '';
  
  saveDatabaseToDisk();
  bumpDataRevision();

  let maskedKey = '';
  if (cleanKey) {
    maskedKey = cleanKey.length > 8 
      ? `${cleanKey.slice(0, 4)}••••••••${cleanKey.slice(-4)}`
      : '••••••••';
  }

  res.json({
    success: true,
    message: cleanKey ? 'បានរក្សាទុក Gemini API Key រួចរាល់!' : 'បានលុប Gemini API Key រួចរាល់!',
    hasKey: Boolean(cleanKey || process.env.GEMINI_API_KEY),
    maskedKey
  });
});

// Check if extracted name is the store's receiving bank account name (e.g. Proel Toch / Kari Arnett)
export function isReceiverAccountName(name?: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    n.includes('proeltoch') ||
    n.includes('proel') ||
    n.includes('toch') ||
    n.includes('kariarnett') ||
    n.includes('kari') ||
    n.includes('arnett') ||
    n.includes('boutique') ||
    n.includes('receiver') ||
    n.includes('beneficiary')
  );
}

export function sanitizeCustomerName(extractedName?: string, senderName?: string, fallbackName?: string): string {
  if (!extractedName || isReceiverAccountName(extractedName)) {
    return senderName || fallbackName || 'អតិថិជន Facebook';
  }
  return extractedName.trim();
}

// Utility: Normalize text for matching
function normalizeName(name: string): string {
  if (!name) return '';
  if (isReceiverAccountName(name)) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip diacritics (ä->a, ë->e, etc.)
    .replace(/[^\p{L}\p{N}\s]/gu, '') // Keep Unicode letters and numbers
    .replace(/\s+/g, ' ')
    .trim();
}

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export interface ExtractedSlipData {
  customer_name: string;
  paid_amount: number;
  currency: 'USD' | 'KHR';
  phone_number?: string;
  bank_name?: string;
  trans_date?: string;
  trans_ref?: string;
  basket_no?: number | string;
  remarks?: string;
  fraud_suspected?: boolean;
  fraud_reasons?: string[];
}

export interface FastCheckResultItem {
  id: string;
  image_name: string;
  slip_url: string;
  extracted: ExtractedSlipData;
  status: 'MATCHED' | 'MULTIPLE_CANDIDATES' | 'NOT_FOUND' | 'APPROVED' | 'DUPLICATE_TXID' | 'REJECTED';
  is_approved?: boolean;
  confidence: number;
  error_message?: string;
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

/**
 * Parse Khmer and English banking slip dates accurately
 * Handles Khmer numerals (០-៩), Khmer months (តុលា, កញ្ញា, etc.), and current year 2026
 */
export function parseKhmerSlipDate(dateStr?: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  let s = dateStr.trim();
  if (!s) return null;

  // Convert Khmer numbers (០-៩) to Arabic digits (0-9)
  const khmerDigits: Record<string, string> = {
    '០': '0', '១': '1', '២': '2', '៣': '3', '៤': '4',
    '៥': '5', '៦': '6', '៧': '7', '៨': '8', '៩': '9'
  };
  s = s.replace(/[០-៩]/g, (d) => khmerDigits[d] || d);

  // Khmer & English months mapping
  const khmerMonths: Record<string, number> = {
    'មករា': 1, 'កុម្ភៈ': 2, 'មិនា': 3, 'មីនា': 3, 'មេសា': 4,
    'ឧសភា': 5, 'មិថុនា': 6, 'កក្កដា': 7, 'សីហា': 8, 'កញ្ញា': 9,
    'តុលា': 10, 'វិច្ឆិកា': 11, 'ធ្នូ': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
  };

  for (const [mName, mNum] of Object.entries(khmerMonths)) {
    if (s.toLowerCase().includes(mName)) {
      const dayMatch = s.match(/(\d{1,2})/);
      const yearMatch = s.match(/(202\d|203\d)/);
      const day = dayMatch ? parseInt(dayMatch[1], 10) : 1;
      const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
      return new Date(year, mNum - 1, day);
    }
  }

  // Handle standard ISO or slash date formats
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    // If year was parsed as past 2022 or missing, fix to current year 2026 if month/day match
    return parsed;
  }

  return null;
}

/**
 * High-Security Anti-Fraud & Duplicate Detection Engine
 * 1. Prevents Cross-Account Slip Reuse (1 slip used by 2-3 Facebook accounts)
 * 2. Catches Same-Account duplicate transmissions
 * 3. Checks against already paid/dispatched invoices in POS database
 * 4. Detects fake/forged slips (mismatched fonts, manipulated amounts, expired dates)
 */
export function evaluateSlipFraudAndDuplicates(
  slip: {
    id?: string;
    sender_id?: string;
    sender_name?: string;
    slip_url?: string;
    received_at?: string;
    extracted: ExtractedSlipData;
    matched_invoice?: any;
  },
  allSlips: AutoScannedMessengerSlip[],
  allInvoices: Invoice[]
) {
  let duplicate_warning: {
    is_duplicate: boolean;
    duplicate_type: 'SAME_ACCOUNT' | 'CROSS_ACCOUNT' | 'ALREADY_APPROVED';
    original_sender_name: string;
    original_basket_no?: number | string;
    trans_ref?: string;
    message: string;
  } | undefined = undefined;

  let fraud_warning: {
    is_fraud: boolean;
    severity: 'HIGH' | 'MEDIUM';
    reasons: string[];
    message: string;
  } | undefined = undefined;

  let amount_mismatch: {
    is_mismatch: boolean;
    slip_amount: number;
    invoice_amount: number;
    difference: number;
  } | undefined = undefined;

  const rawRef = slip.extracted?.trans_ref || '';
  const cleanRef = rawRef.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const slipUrl = (slip.slip_url || '').trim();

  // 1. AMOUNT MISMATCH CHECK (e.g. Slip pays $1.00 for $15.50 invoice)
  if (slip.matched_invoice && slip.extracted?.paid_amount > 0) {
    const invTotal = Number(slip.matched_invoice.total_amount) || 0;
    const slipAmt = Number(slip.extracted.paid_amount) || 0;
    const diff = Math.round((slipAmt - invTotal) * 100) / 100;
    if (Math.abs(diff) >= 0.25) {
      amount_mismatch = {
        is_mismatch: true,
        slip_amount: slipAmt,
        invoice_amount: invTotal,
        difference: diff
      };
    }
  }

  // 2. CHECK AGAINST PAID INVOICES IN DB (TxID already approved/marked Paid for an existing order)
  if (cleanRef && cleanRef.length >= 5) {
    const alreadyPaidInv = allInvoices.find(
      inv => (inv.status === 'Paid' || inv.payment_status === 'Paid') &&
             inv.invoice_id !== slip.matched_invoice?.invoice_id &&
             (
               (inv.payment_slip_url && slipUrl && inv.payment_slip_url === slipUrl) ||
               (inv.comments && inv.comments.some(c => c.toUpperCase().includes(cleanRef))) ||
               (inv.notes && inv.notes.some(n => n.toUpperCase().includes(cleanRef)))
             )
    );

    if (alreadyPaidInv) {
      duplicate_warning = {
        is_duplicate: true,
        duplicate_type: 'ALREADY_APPROVED',
        original_sender_name: alreadyPaidInv.facebook_name || 'អតិថិជនផ្សេង',
        original_basket_no: alreadyPaidInv.basket_no || alreadyPaidInv.invoice_id,
        trans_ref: cleanRef,
        message: `🚨 ការព្រមានក្លែងបន្លំ: លេខប្រតិបត្តិការ (TxID: ${cleanRef}) ឬ Slip នេះ ធ្លាប់បានកាត់បង់រួចហើយលើកន្ត្រក #${alreadyPaidInv.basket_no || alreadyPaidInv.invoice_id} របស់ FB «${alreadyPaidInv.facebook_name}»! មិនអាចយកមកប្រើស្ទួនឆ្លង Account បានទេ!`
      };
    }
  }

  // 3. CHECK AGAINST ALL MESSENGER SLIPS (Cross-Account vs Same-Account Reuse)
  if (!duplicate_warning && (cleanRef.length >= 5 || (slipUrl && !slipUrl.includes('unsplash')))) {
    const prior = allSlips.find(s => {
      if (s.id === slip.id) return false;
      const otherRef = (s.extracted?.trans_ref || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const hasSameRef = cleanRef.length >= 5 && otherRef === cleanRef;
      const hasSameUrl = slipUrl && s.slip_url && !slipUrl.includes('unsplash') && s.slip_url === slipUrl;
      return hasSameRef || hasSameUrl;
    });

    if (prior) {
      const currentSenderId = slip.sender_id || '';
      const priorSenderId = prior.sender_id || '';
      const currentSenderName = (slip.sender_name || '').trim().toLowerCase();
      const priorSenderName = (prior.sender_name || '').trim().toLowerCase();

      const isCrossAccount = (currentSenderId && priorSenderId && currentSenderId !== priorSenderId) ||
                            (currentSenderName && priorSenderName && currentSenderName !== priorSenderName && !currentSenderName.includes('facebook customer') && !currentSenderName.includes('អតិថិជន facebook'));

      if (isCrossAccount) {
        duplicate_warning = {
          is_duplicate: true,
          duplicate_type: 'CROSS_ACCOUNT',
          original_sender_name: prior.sender_name,
          original_basket_no: prior.matched_invoice?.basket_no || prior.extracted?.basket_no,
          trans_ref: cleanRef || 'រូបភាពដដែល',
          message: `🚨 ការព្រមានក្លែងបន្លំ: Slip / TxID: ${cleanRef || 'រូបភាពដដែល'} នេះ ត្រូវបានផ្ញើដោយគណនី FB «${prior.sender_name}» (កន្ត្រក #${prior.matched_invoice?.basket_no || prior.extracted?.basket_no || 'N/A'}) រួចហើយ! សង្ស័យយក Slip គេមកប្រើបន្លំ (Cross-Account Abuse)!`
        };
      } else {
        duplicate_warning = {
          is_duplicate: true,
          duplicate_type: 'SAME_ACCOUNT',
          original_sender_name: prior.sender_name,
          original_basket_no: prior.matched_invoice?.basket_no || prior.extracted?.basket_no,
          trans_ref: cleanRef,
          message: `⚠️ Slip ស្ទួន: ភ្ញៀវបានផ្ញើវិក្កយបត្រ (TxID: ${cleanRef || 'រូបភាពនេះ'}) ម្តងរួចមកហើយ`
        };
      }
    }
  }

  // 4. FRAUD DETECTION (AI Vision Signals & Timestamp Anomalies)
  const fraudReasons: string[] = [];
  if (slip.extracted?.fraud_suspected && Array.isArray(slip.extracted.fraud_reasons)) {
    // Exclude false positive date reasons from AI
    const filteredAiReasons = slip.extracted.fraud_reasons.filter(
      r => !r.toLowerCase().includes('date') && !r.toLowerCase().includes('timestamp') && !r.includes('កាលបរិច្ឆេទ')
    );
    fraudReasons.push(...filteredAiReasons);
  }

  // Date Check: Slip date too old (> 30 days) or far in future
  if (slip.extracted?.trans_date) {
    try {
      const parsedDate = parseKhmerSlipDate(slip.extracted.trans_date);
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        const now = Date.now();
        const diffDays = (now - parsedDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 30) {
          fraudReasons.push(`កាលបរិច្ឆេទលើ Slip ចាស់ពេក (${Math.round(diffDays)} ថ្ងៃមុន)`);
        } else if (diffDays < -3) {
          fraudReasons.push('កាលបរិច្ឆេទលើ Slip គឺនៅថ្ងៃអនាគត');
        }
      }
    } catch {
      // Ignore date parse errors
    }
  }

  if (fraudReasons.length > 0) {
    fraud_warning = {
      is_fraud: true,
      severity: 'HIGH',
      reasons: fraudReasons,
      message: `🚨 សង្ស័យ Slip ក្លែងបន្លំ: ${fraudReasons.join(' ‧ ')}`
    };
  }

  return { duplicate_warning, fraud_warning, amount_mismatch };
}


// Generic single syllables/stop words in Cambodian names that must NOT match alone as single tokens
const GENERIC_NAME_SYLLABLES = new Set([
  'ah', 'ly', 'na', 'da', 'vy', 'mey', 'pov', 'toch', 'srey', 'sok', 'heng', 'chann',
  'kim', 'lin', 'lee', 'leang', 'rith', 'rath', 'vanny', 'rithy', 'theary', 'borey',
  'fb', 'customer', 'aba', 'khqr', 'wing', 'acleda', 'user', 'facebook'
]);

export function isCustomerNameMatch(candidateName?: string, invoiceName?: string): boolean {
  if (!candidateName || !invoiceName) return false;
  const normA = normalizeName(candidateName);
  const normB = normalizeName(invoiceName);
  if (!normA || !normB) return false;

  // 1. Exact normalized match
  if (normA === normB) return true;

  // 2. Substring match only if length >= 5 and significant
  if (normA.length >= 5 && normB.length >= 5) {
    if (normA.includes(normB) || normB.includes(normA)) {
      return true;
    }
  }

  // 3. Multi-token match without generic false-positives
  const tokensA = normA.split(' ').filter(t => t.length >= 2 && !GENERIC_NAME_SYLLABLES.has(t));
  const tokensB = normB.split(' ').filter(t => t.length >= 2 && !GENERIC_NAME_SYLLABLES.has(t));

  if (tokensA.length >= 1 && tokensB.length >= 1) {
    const commonTokens = tokensA.filter(t => tokensB.includes(t));
    if (commonTokens.length >= 2) return true;
    if (commonTokens.length === 1 && commonTokens[0].length >= 4) {
      if (tokensA.length === 1 || tokensB.length === 1) {
        return true;
      }
    }
  }

  // Full token overlap check if both have multiple words
  const allTokensA = normA.split(' ').filter(t => t.length >= 2);
  const allTokensB = normB.split(' ').filter(t => t.length >= 2);
  if (allTokensA.length >= 2 && allTokensB.length >= 2) {
    const common = allTokensA.filter(t => allTokensB.includes(t));
    if (common.length >= 2) return true;
  }

  return false;
}

function parseCreatedTime(created_at?: string): number {
  if (!created_at) return 0;
  const t = new Date(created_at).getTime();
  if (!isNaN(t)) return t;
  const isoLike = String(created_at).replace(' ', 'T');
  const t2 = new Date(isoLike).getTime();
  return isNaN(t2) ? 0 : t2;
}

function getNumericBasketNo(inv: Invoice | { basket_no?: number | string; invoice_id?: number }): number {
  const clean = String(inv.basket_no || inv.invoice_id || '').replace(/\D/g, '');
  return Number(clean) || (inv.invoice_id as number) || 0;
}

export function sortInvoicesNewestFirst(list: Invoice[]): Invoice[] {
  return [...list].sort((a, b) => {
    // 1. Highest numeric basket / invoice ID (e.g. 5518 > 4981)
    const numB = getNumericBasketNo(b);
    const numA = getNumericBasketNo(a);

    // 2. Newest creation timestamp
    const timeA = parseCreatedTime(a.created_at);
    const timeB = parseCreatedTime(b.created_at);

    // If one was created at a significantly different time (>1 minute), timestamp leads
    if (Math.abs(timeB - timeA) > 60000) {
      return timeB - timeA;
    }

    if (numB !== numA) {
      return numB - numA;
    }
    return timeB - timeA;
  });
}

/**
 * Match extracted slip data against active database invoices
 * Prioritizes the customer's LATEST / NEWEST UNPAID BASKET (e.g. #5518 over older #4981)
 * Strictly ensures slips are ONLY matched to the genuine sender / customer and NEVER to unrelated strangers.
 */
export function matchInvoiceForSlip(
  data: ExtractedSlipData,
  senderName?: string,
  senderId?: string
): {
  status: 'MATCHED' | 'MULTIPLE_CANDIDATES' | 'NOT_FOUND';
  confidence: number;
  matched?: Invoice;
  candidates?: Invoice[];
} {
  // Active invoices across all lives (exclude Cancelled & already Dispatched)
  // Always sorted newest first
  const pool = sortInvoicesNewestFirst(
    invoices.filter(inv => inv.status !== 'Cancelled' && inv.status !== 'Dispatched' && inv.packing_stage !== 'DISPATCHED')
  );

  // Calculate USD equivalent
  let paidUsd = data.paid_amount || 0;
  if (data.currency === 'KHR' || data.paid_amount > 500) {
    paidUsd = data.paid_amount / 4000;
  }

  // 1. DIRECT SENDER / CUSTOMER MATCH (Highest Priority: Strictly customer's newest unpaid basket)
  const candidateNames = [
    senderName,
    data.customer_name,
    data.phone_number
  ].filter(Boolean) as string[];

  // Find all baskets strictly belonging to this customer
  const customerBaskets = pool.filter(inv => {
    if (senderId && senderId !== 'TEST_USER_1' && senderId !== 'FB_USER' && inv.facebook_user_id === senderId) {
      return true;
    }
    for (const name of candidateNames) {
      if (isCustomerNameMatch(name, inv.facebook_name)) {
        return true;
      }
    }
    if (data.phone_number && inv.phone_number) {
      const cleanSlipPhone = data.phone_number.replace(/\D/g, '');
      const cleanInvPhone = inv.phone_number.replace(/\D/g, '');
      if (cleanSlipPhone.length >= 8 && cleanInvPhone.length >= 8 && (cleanSlipPhone.includes(cleanInvPhone) || cleanInvPhone.includes(cleanSlipPhone))) {
        return true;
      }
    }
    return false;
  });

  if (customerBaskets.length > 0) {
    const sortedCustomerBaskets = sortInvoicesNewestFirst(customerBaskets);
    const unpaidCustomerBaskets = sortedCustomerBaskets.filter(b => b.status !== 'Paid' && b.payment_status !== 'Paid');

    if (unpaidCustomerBaskets.length > 0) {
      const newestUnpaid = unpaidCustomerBaskets[0];
      const otherCandidates = sortedCustomerBaskets.filter(b => b.invoice_id !== newestUnpaid.invoice_id);

      // Check if amount matches
      const isAmountMatching = paidUsd <= 0 || Math.abs(newestUnpaid.total_amount - paidUsd) < 0.25;

      // If amount doesn't match AND extracted customer name strictly belongs to a different person in the database:
      if (!isAmountMatching && data.customer_name && !isReceiverAccountName(data.customer_name)) {
        const altMatch = pool.find(inv => {
          if (inv.status === 'Paid' || inv.payment_status === 'Paid') return false;
          const nameMatches = isCustomerNameMatch(data.customer_name, inv.facebook_name);
          const amtMatches = paidUsd > 0 && Math.abs(inv.total_amount - paidUsd) < 0.25;
          return nameMatches && amtMatches;
        });
        if (altMatch) {
          return {
            status: 'MATCHED',
            confidence: 95,
            matched: altMatch,
            candidates: sortedCustomerBaskets
          };
        }
      }

      return {
        status: isAmountMatching ? 'MATCHED' : 'MULTIPLE_CANDIDATES',
        confidence: isAmountMatching ? 100 : 70,
        matched: newestUnpaid,
        candidates: otherCandidates.length > 0 ? otherCandidates : undefined
      };
    } else {
      // All customer baskets are already paid - return the newest one for review
      const newestBasket = sortedCustomerBaskets[0];
      const otherCandidates = sortedCustomerBaskets.slice(1);
      return {
        status: 'MATCHED',
        confidence: 80,
        matched: newestBasket,
        candidates: otherCandidates.length > 0 ? otherCandidates : undefined
      };
    }
  }

  // 2. DIRECT BASKET NUMBER MATCH (When customer name not matched, but explicit basket number is on slip)
  if (data.basket_no) {
    const cleanBNo = String(data.basket_no).replace(/\D/g, '');
    if (cleanBNo) {
      const directMatch = pool.find(
        i => String(i.basket_no) === cleanBNo || String(i.invoice_id) === cleanBNo
      );
      if (directMatch) {
        return {
          status: 'MATCHED',
          confidence: 100,
          matched: directMatch
        };
      }
    }
  }

  // 3. DO NOT auto-match strangers by amount! Return NOT_FOUND so staff can verify Messenger origin
  const recentUnpaid = pool.filter(i => i.status !== 'Paid' && i.payment_status !== 'Paid').slice(0, 5);
  return { status: 'NOT_FOUND', confidence: 0, candidates: recentUnpaid };
}

/**
 * Robust OCR Helper with Multi-Model Fallback for 503 / 429 Demand Spikes
 */
export async function callGeminiSlipExtraction(
  ai: GoogleGenAI,
  imagePart: { inlineData: { mimeType: string; data: string } },
  textPart: { text: string }
): Promise<{ text: string; error?: string }> {
  // Flagship high-accuracy model with high-throughput fallbacks
  const modelCandidates = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.0-flash'];
  let lastErrorMessage = '';

  for (const model of modelCandidates) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [imagePart, textPart]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });
      const text = response.text?.trim() || '';
      if (text) {
        return { text };
      }
    } catch (err: any) {
      const msg = String(err?.message || (typeof err === 'object' ? JSON.stringify(err) : err));
      lastErrorMessage = msg;
      console.warn(`[Gemini Slip Scan on ${model}]:`, msg);
    }
  }

  return { text: '', error: lastErrorMessage };
}

/**
 * POST /api/fast_check/scan_slips
 * Accepts multiple images in base64, parses them using Gemini Flash Free tier,
 * and matches against all active invoices across all lives.
 */
router.post('/scan_slips', async (req: Request, res: Response) => {
  try {
    const { images } = req.body;
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ success: false, error: 'No images provided' });
    }

    const ai = getGemini();
    const results: FastCheckResultItem[] = [];

    for (let idx = 0; idx < images.length; idx++) {
      const item = images[idx];
      const rawBase64 = item.data ? item.data.replace(/^data:image\/\w+;base64,/, '') : '';
      const mimeType = item.mimeType || 'image/jpeg';
      const fileName = `slip_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}.jpg`;
      const filePath = path.join(uploadsDir, fileName);

      let slipUrl = '';
      if (rawBase64) {
        try {
          fs.writeFileSync(filePath, Buffer.from(rawBase64, 'base64'));
          slipUrl = `/uploads/${fileName}`;
        } catch (err) {
          console.error('Failed to save slip image:', err);
        }
      }

      let extracted: ExtractedSlipData = {
        customer_name: '',
        paid_amount: 0,
        currency: 'USD'
      };
      let errorMessage = '';

      if (ai && rawBase64) {
        const imagePart = {
          inlineData: {
            mimeType,
            data: rawBase64
          }
        };

        const textPart = {
          text: `You are an expert at analyzing Cambodian Mobile Banking transfer slips and Facebook Messenger chat payment screenshots (ABA Bank, ACLEDA Bank, Bakong / KHQR, Canadia, TrueMoney, Wing).
Analyze this image carefully:
1. If this is a Facebook Messenger chat screenshot:
   - What is the customer's Facebook Profile Name in the header at the top?
2. If this is a direct mobile banking slip (ABA, ACLEDA, Bakong, etc.):
   - CRITICAL RECEIVER RULE: The merchant/shop receiver is "PROEL TOCH" or "KARI ARNETT". NEVER extract "PROEL TOCH" or the receiver's bank name as the customer name!
   - Extract ONLY the actual customer/sender/payer name ("Transfer From" / "Payer"). If sender name is not visible, leave customer_name as null.
3. Look at the transfer remarks / description:
   - Does it mention a basket number or order number (e.g. "#102", "102", "កន្ត្រក 102", "Order 102")?
4. Find the transferred numeric amount and currency (e.g. 10.00 USD or 40,000 KHR).
5. If the customer sent a phone number or address (e.g. "070227974"), extract it.
6. Extract bank name (ABA, ACLEDA, Bakong, Wing) and transaction reference number (TxID / Ref).
7. Extract trans_date (Current Year is 2026. For Khmer dates like "២ តុលា ២០២៦", convert to "2026-10-02". Khmer digits: ០=0, ១=1, ២=2, ៣=3, ៤=4, ៥=5, ៦=6, ៧=7, ៨=8, ៩=9).
8. Fraud / Forgery Inspection:
   - Look for manipulated/edited fonts on amount, spliced text, mismatched font style, or edited screenshots.
   - Set "fraud_suspected": true if visual signs of tampering or forgery exist (Do NOT flag genuine 2026 dates).

Return ONLY a JSON object:
{
  "customer_name": "...",
  "basket_no": null or number,
  "paid_amount": 10.00,
  "currency": "USD",
  "phone_number": "...",
  "bank_name": "...",
  "trans_ref": "...",
  "trans_date": "2026-10-02",
  "remarks": "...",
  "fraud_suspected": false,
  "fraud_reasons": []
}`
        };

        const { text: rawText, error: extractionError } = await callGeminiSlipExtraction(ai, imagePart, textPart);

        if (extractionError) {
          errorMessage = extractionError.includes('503') || extractionError.includes('high demand') || extractionError.includes('UNAVAILABLE')
            ? 'សេវា AI កំពុងមមាញឹកបណ្តោះអាសន្ន (503 High Demand) - សូមចុចស្កេនម្តងទៀត ឬរើសកន្ត្រកដោយផ្ទាល់ដៃ'
            : 'មិនអាចវិភាគរូបភាពបាន (សូមចុចស្កេនម្តងទៀត ឬរើសកន្ត្រកដោយផ្ទាល់ដៃ)';
        }

        if (rawText) {
          try {
            const cleaned = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
            const parsed = JSON.parse(cleaned);
            const rawCustName = String(parsed.customer_name || '').trim();
            let amt = Number(parsed.paid_amount) || 0;
            let curr: 'USD' | 'KHR' = String(parsed.currency || 'USD').toUpperCase() === 'KHR' ? 'KHR' : 'USD';
            if (curr === 'KHR' || amt > 500) {
              amt = Math.round((amt / 4100) * 100) / 100;
              curr = 'USD';
            }
            extracted = {
              customer_name: isReceiverAccountName(rawCustName) ? '' : rawCustName,
              paid_amount: amt,
              currency: curr,
              phone_number: parsed.phone_number ? String(parsed.phone_number).trim() : undefined,
              bank_name: parsed.bank_name ? String(parsed.bank_name).trim() : undefined,
              trans_ref: parsed.trans_ref ? String(parsed.trans_ref).trim() : undefined,
              trans_date: parsed.trans_date ? String(parsed.trans_date).trim() : undefined,
              basket_no: parsed.basket_no ? String(parsed.basket_no).replace(/\D/g, '') : undefined,
              remarks: parsed.remarks ? String(parsed.remarks).trim() : undefined,
              fraud_suspected: Boolean(parsed.fraud_suspected),
              fraud_reasons: Array.isArray(parsed.fraud_reasons) ? parsed.fraud_reasons : []
            };
          } catch {
            console.warn('Failed to parse Gemini JSON output:', rawText);
          }
        }
      } else if (!ai) {
        errorMessage = 'មិនទាន់កំណត់ GEMINI_API_KEY ទេ';
      }

      // Match against invoices (prioritizing newest unpaid basket & exact amount)
      const matchResult = matchInvoiceForSlip(extracted, item.name);

      // Evaluate duplicates & fraud
      const fraudEval = evaluateSlipFraudAndDuplicates(
        {
          id: `slip_${idx}_${Date.now()}`,
          sender_name: extracted.customer_name || (matchResult.matched && matchResult.matched.facebook_name) || item.name || 'Customer',
          slip_url: slipUrl,
          extracted,
          matched_invoice: matchResult.matched
        },
        messengerSlips,
        invoices
      );

      const finalStatus = fraudEval.duplicate_warning?.duplicate_type === 'CROSS_ACCOUNT'
        ? 'DUPLICATE_TXID'
        : matchResult.status;

      results.push({
        id: `slip_${idx}_${Date.now()}`,
        image_name: item.name || `Slip #${idx + 1}`,
        slip_url: slipUrl,
        extracted,
        status: finalStatus,
        confidence: matchResult.confidence,
        error_message: errorMessage || undefined,
        duplicate_warning: fraudEval.duplicate_warning,
        fraud_warning: fraudEval.fraud_warning,
        amount_mismatch: fraudEval.amount_mismatch,
        matched_invoice: matchResult.matched ? {
          invoice_id: matchResult.matched.invoice_id,
          basket_no: matchResult.matched.basket_no,
          live_id: matchResult.matched.live_id,
          facebook_name: matchResult.matched.facebook_name,
          phone_number: matchResult.matched.phone_number,
          total_amount: matchResult.matched.total_amount,
          created_at: matchResult.matched.created_at,
          packing_stage: matchResult.matched.packing_stage,
          status: matchResult.matched.status
        } : undefined,
        candidates: matchResult.candidates ? matchResult.candidates.map(c => ({
          invoice_id: c.invoice_id,
          basket_no: c.basket_no,
          live_id: c.live_id,
          facebook_name: c.facebook_name,
          phone_number: c.phone_number,
          total_amount: c.total_amount,
          created_at: c.created_at,
          packing_stage: c.packing_stage,
          status: c.status
        })) : undefined
      });
    }

    return res.json({
      success: true,
      total_scanned: results.length,
      matched_count: results.filter(r => r.status === 'MATCHED').length,
      ambiguous_count: results.filter(r => r.status === 'MULTIPLE_CANDIDATES').length,
      unmatched_count: results.filter(r => r.status === 'NOT_FOUND').length,
      results
    });
  } catch (err: any) {
    console.error('Error in /scan_slips:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * POST /api/fast_check/scan_names
 * 100% Free text batch matching. User pastes Facebook names (one per line or comma-separated).
 */
router.post('/scan_names', (req: Request, res: Response) => {
  try {
    const { namesText } = req.body;
    if (!namesText || typeof namesText !== 'string') {
      return res.status(400).json({ success: false, error: 'No names provided' });
    }

    const lines = namesText
      .split(/[\r\n,]+/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const results: FastCheckResultItem[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const name = lines[idx];
      const extracted: ExtractedSlipData = {
        customer_name: name,
        paid_amount: 0,
        currency: 'USD'
      };

      const matchResult = matchInvoiceForSlip(extracted);

      results.push({
        id: `name_${idx}_${Date.now()}`,
        image_name: `Line #${idx + 1}`,
        slip_url: '',
        extracted,
        status: matchResult.status,
        confidence: matchResult.confidence,
        matched_invoice: matchResult.matched ? {
          invoice_id: matchResult.matched.invoice_id,
          basket_no: matchResult.matched.basket_no,
          live_id: matchResult.matched.live_id,
          facebook_name: matchResult.matched.facebook_name,
          phone_number: matchResult.matched.phone_number,
          total_amount: matchResult.matched.total_amount,
          created_at: matchResult.matched.created_at,
          packing_stage: matchResult.matched.packing_stage,
          status: matchResult.matched.status
        } : undefined,
        candidates: matchResult.candidates ? matchResult.candidates.map(c => ({
          invoice_id: c.invoice_id,
          basket_no: c.basket_no,
          live_id: c.live_id,
          facebook_name: c.facebook_name,
          phone_number: c.phone_number,
          total_amount: c.total_amount,
          created_at: c.created_at,
          packing_stage: c.packing_stage,
          status: c.status
        })) : undefined
      });
    }

    return res.json({
      success: true,
      total_scanned: results.length,
      matched_count: results.filter(r => r.status === 'MATCHED').length,
      ambiguous_count: results.filter(r => r.status === 'MULTIPLE_CANDIDATES').length,
      unmatched_count: results.filter(r => r.status === 'NOT_FOUND').length,
      results
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * POST /api/fast_check/confirm_matches
 * Applies verified matches, marks invoices as Paid, saves slip URLs, and persists to DB
 */
router.post('/confirm_matches', (req: Request, res: Response) => {
  try {
    const { matches, packerName } = req.body;
    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ success: false, error: 'No matches to confirm' });
    }

    let updatedCount = 0;
    const nowIso = new Date().toISOString();

    for (const match of matches) {
      const inv = invoices.find(i => i.invoice_id === Number(match.invoice_id));
      if (inv) {
        inv.status = 'Paid';
        inv.payment_status = 'Paid';
        inv.paid_at = nowIso;
        inv.paid_by = packerName || 'Admin (Bulk Approve)';
        if (match.slip_url) {
          inv.payment_slip_url = match.slip_url;
        }
        if (match.paid_amount && match.paid_amount > 0) {
          inv.payment_method = 'Bank Transfer (KHQR)';
        }
        // Keep in STAGED so it transitions to Stage 3 [បង់រួច - QC]
        if (inv.packing_stage === 'UNPICKED') {
          inv.packing_stage = 'STAGED';
        }
        updatedCount++;

        // Find associated slip in messengerSlips and update
        const slip = messengerSlips.find(
          s => s.id === match.slip_id || s.slip_url === match.slip_url || s.matched_invoice?.invoice_id === inv.invoice_id
        );
        if (slip) {
          slip.status = 'APPROVED';
          slip.is_approved = true;
        }

        // Dispatch Messenger reply to customer
        const targetPsid = (slip && slip.sender_id) || inv.facebook_user_id;
        const customerName = inv.facebook_name || (slip && slip.sender_name) || 'អតិថិជន';
        const basketNo = inv.basket_no || inv.invoice_id;
        const finalAmount = match.paid_amount || (slip && slip.extracted?.paid_amount) || inv.total_amount;
        const bankName = (slip && slip.extracted?.bank_name) || 'ធនាគារ';
        const transRef = (slip && slip.extracted?.trans_ref) || '';

        const replyMessage = `✅ ហាងបានទទួលការទូទាត់ប្រាក់ចំនួន $${Number(finalAmount).toFixed(2)} (${bankName}${transRef ? ' ‧ Ref: ' + transRef : ''}) ត្រឹមត្រូវ ១០០% ហើយបង ${customerName}! 🎉\n\n📦 កន្ត្រកលេខ #${basketNo} របស់បងត្រូវបាន Admin ផ្ទៀងផ្ទាត់ [បង់រួច] និងបញ្ជូនទៅកាន់បញ្ជីវេចខ្ចប់រួចរាល់។ អរគុណច្រើនបង! 🙏`;

        if (targetPsid && targetPsid !== 'FB_USER' && targetPsid !== 'TEST_USER_1' && !targetPsid.startsWith('1000')) {
          sendFacebookMessengerReply(targetPsid, replyMessage).catch(err => {
            console.error('[Bulk Approve FB Send Error]:', err);
          });
        }

        addChatbotLog({
          type: 'SLIP_VERIFIED',
          customer_name: customerName,
          customer_id: targetPsid,
          basket_no: basketNo,
          incoming_message: `[Bulk Approved Slip #${basketNo} $${Number(finalAmount).toFixed(2)}]`,
          bot_reply: replyMessage,
          status: 'SUCCESS',
          meta: { invoice_id: inv.invoice_id, basket_no: basketNo, amount: finalAmount }
        });
      }
    }

    saveDatabaseToDisk();
    bumpDataRevision();

    return res.json({
      success: true,
      updated_count: updatedCount,
      message: `បានផ្ទៀងផ្ទាត់ និងសម្គាល់បង់រួចជោគជ័យ ${updatedCount} កន្ត្រក ព្រមទាំងបានផ្ញើសារបញ្ជាក់ទៅ Messenger!`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * GET /api/fast_check/qc_all_lives
 * Returns all ready-for-dispatch (Paid / QC) invoices across all lives,
 * sorted with oldest invoices (aging / backlog) first.
 */
router.get('/qc_all_lives', (_req: Request, res: Response) => {
  try {
    const allPaid = invoices.filter(
      inv =>
        (inv.status === 'Paid' || inv.payment_status === 'Paid' || Boolean(inv.paid_at)) &&
        inv.status !== 'Packed' &&
        inv.status !== 'Dispatched' &&
        inv.packing_stage !== 'DISPATCHED' &&
        inv.status !== 'Cancelled'
    );

    // Sort oldest created_at first so delayed goods get priority dispatch
    allPaid.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Group summary by live_id
    const summaryByLive: Record<string, { count: number; total_amount: number }> = {};
    for (const inv of allPaid) {
      const lid = inv.live_id || 'UNKNOWN';
      if (!summaryByLive[lid]) {
        summaryByLive[lid] = { count: 0, total_amount: 0 };
      }
      summaryByLive[lid].count++;
      summaryByLive[lid].total_amount += inv.total_amount || 0;
    }

    return res.json({
      success: true,
      total_count: allPaid.length,
      invoices: allPaid,
      summary_by_live: summaryByLive
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * GET /api/fast_check/dispatched_all_lives
 * GET /api/dispatched_all_lives
 * Returns all dispatched invoices across all live sessions,
 * along with daily counts (today's output, Phnom Penh vs Province breakdown).
 */
router.get('/dispatched_all_lives', (_req: Request, res: Response) => {
  try {
    const allDispatched = invoices.filter(
      inv => inv.status === 'Dispatched' || inv.status === 'Packed' || inv.packing_stage === 'DISPATCHED'
    );

    // Sort newest dispatched first
    allDispatched.sort((a, b) => {
      const timeA = new Date((a as any).dispatched_at || a.created_at || 0).getTime();
      const timeB = new Date((b as any).dispatched_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    // Today's date string in Asia/Phnom_Penh (UTC+7) e.g., 'YYYY-MM-DD'
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });

    let todayCount = 0;
    let todayAmount = 0;
    let ppCount = 0;
    let provinceCount = 0;
    let todayPpCount = 0;
    let todayProvinceCount = 0;

    const summaryByLive: Record<string, { count: number; total_amount: number }> = {};

    for (const inv of allDispatched) {
      const lid = inv.live_id || 'UNKNOWN';
      if (!summaryByLive[lid]) {
        summaryByLive[lid] = { count: 0, total_amount: 0 };
      }
      summaryByLive[lid].count++;
      summaryByLive[lid].total_amount += inv.total_amount || 0;

      const dispDate = (inv as any).dispatched_at || inv.created_at || '';
      let isToday = false;
      if (dispDate) {
        try {
          const dispDateStr = new Date(dispDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
          isToday = dispDateStr === todayStr;
        } catch {
          isToday = typeof dispDate === 'string' && dispDate.startsWith(todayStr);
        }
      }

      if (isToday) {
        todayCount++;
        todayAmount += inv.total_amount || 0;
        if (inv.location_zone === 'PP') todayPpCount++;
        else todayProvinceCount++;
      }

      if (inv.location_zone === 'PP') {
        ppCount++;
      } else {
        provinceCount++;
      }
    }

    return res.json({
      success: true,
      total_count: allDispatched.length,
      today_count: todayCount,
      today_amount: todayAmount,
      pp_count: ppCount,
      province_count: provinceCount,
      today_pp_count: todayPpCount,
      today_province_count: todayProvinceCount,
      today_date: todayStr,
      invoices: allDispatched,
      summary_by_live: summaryByLive
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * GET /api/fast_check/unpaid_baskets
 * Returns all active unpaid invoices across all live sessions for manual basket linking / search.
 */
router.get('/unpaid_baskets', (_req: Request, res: Response) => {
  try {
    const unpaidInvoices = sortInvoicesNewestFirst(
      invoices.filter(i => i.status !== 'Paid' && i.payment_status !== 'Paid' && i.status !== 'Cancelled')
    );
    const unpaid = unpaidInvoices.map(i => ({
      invoice_id: i.invoice_id,
      basket_no: i.basket_no,
      live_id: i.live_id,
      facebook_name: i.facebook_name,
      phone_number: i.phone_number,
      total_amount: i.total_amount,
      created_at: i.created_at,
      packing_stage: i.packing_stage,
      status: i.status
    }));

    return res.json({
      success: true,
      count: unpaid.length,
      baskets: unpaid
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * GET /api/fast_check/messenger_slips
 * Returns all auto-scanned slips from Messenger with dynamic matching against active invoices
 */
router.get('/messenger_slips', (req: Request, res: Response) => {
  try {
    const { since } = req.query; // 'today' | '24h' | 'all'
    const now = new Date();
    let cutoffDate: Date | null = null;

    if (since === 'today' || !since) {
      // 12:00 AM Midnight today
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (since === '24h') {
      cutoffDate = new Date(Date.now() - 24 * 3600 * 1000);
    }

    // Refresh match state for each slip that is not yet approved
    for (const slip of messengerSlips) {
      if (slip.status !== 'APPROVED' && slip.status !== 'REJECTED') {
        const matchRes = matchInvoiceForSlip(slip.extracted, slip.sender_name, slip.sender_id);
        slip.status = matchRes.status;
        slip.confidence = matchRes.confidence;
        slip.matched_invoice = matchRes.matched ? {
          invoice_id: matchRes.matched.invoice_id,
          basket_no: matchRes.matched.basket_no,
          live_id: matchRes.matched.live_id,
          facebook_name: matchRes.matched.facebook_name,
          phone_number: matchRes.matched.phone_number,
          total_amount: matchRes.matched.total_amount,
          created_at: matchRes.matched.created_at,
          packing_stage: matchRes.matched.packing_stage,
          status: matchRes.matched.status
        } : undefined;
        slip.candidates = matchRes.candidates ? matchRes.candidates.map(c => ({
          invoice_id: c.invoice_id,
          basket_no: c.basket_no,
          live_id: c.live_id,
          facebook_name: c.facebook_name,
          phone_number: c.phone_number,
          total_amount: c.total_amount,
          created_at: c.created_at,
          packing_stage: c.packing_stage,
          status: c.status
        })) : undefined;
      }
    }

    let filtered = [...messengerSlips];
    if (cutoffDate) {
      filtered = filtered.filter(s => {
        if (!s.received_at) return true;
        return new Date(s.received_at) >= cutoffDate;
      });
    }

    // Sort newest received first
    filtered.sort((a, b) => new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime());

    // -------------------------------------------------------------
    // 🛡️ ANTI-FRAUD & DUPLICATE TxID DETECTION ENGINE & AVATARS
    // -------------------------------------------------------------
    for (const slip of filtered) {
      // Resolve sender profile picture if available from database or FB Graph
      if (!slip.sender_avatar_url) {
        const matchingCustomer = customers.find(c => c.facebook_user_id === slip.sender_id || (slip.sender_name && c.facebook_name && c.facebook_name.toLowerCase().trim() === slip.sender_name.toLowerCase().trim()));
        const matchingInv = invoices.find(i => i.facebook_user_id === slip.sender_id || (slip.sender_name && i.facebook_name && i.facebook_name.toLowerCase().trim() === slip.sender_name.toLowerCase().trim()));
        const matchingComment = rawComments.find(rc => rc.facebook_user_id === slip.sender_id || (slip.sender_name && rc.facebook_name && rc.facebook_name.toLowerCase().trim() === slip.sender_name.toLowerCase().trim()));

        slip.sender_avatar_url = matchingCustomer?.picture_url || matchingInv?.picture_url || matchingComment?.picture_url;
        if (!slip.sender_avatar_url && slip.sender_id && !slip.sender_id.startsWith('TEST') && !slip.sender_id.startsWith('FB_USER') && !slip.sender_id.startsWith('mslip')) {
          slip.sender_avatar_url = `https://graph.facebook.com/v21.0/${slip.sender_id}/picture?type=square&width=120&height=120`;
        }
      }

      if (slip.matched_invoice && !slip.matched_invoice.picture_url) {
        const matchingInv = invoices.find(i => i.invoice_id === slip.matched_invoice?.invoice_id);
        slip.matched_invoice.picture_url = matchingInv?.picture_url || slip.sender_avatar_url;
        slip.matched_invoice.facebook_user_id = matchingInv?.facebook_user_id || slip.sender_id;
      }

      const fraudEval = evaluateSlipFraudAndDuplicates(
        slip,
        filtered,
        invoices
      );

      slip.duplicate_warning = fraudEval.duplicate_warning;
      slip.fraud_warning = fraudEval.fraud_warning;
      slip.amount_mismatch = fraudEval.amount_mismatch;

      if (fraudEval.duplicate_warning?.duplicate_type === 'CROSS_ACCOUNT' && !slip.is_approved) {
        slip.status = 'DUPLICATE_TXID';
      }
    }

    const matchedCount = filtered.filter(s => s.status === 'MATCHED' && !s.is_approved && !s.duplicate_warning?.is_duplicate && !s.fraud_warning?.is_fraud).length;
    const approvedCount = filtered.filter(s => s.status === 'APPROVED' || s.is_approved).length;
    const reviewCount = filtered.filter(s => (s.status === 'MULTIPLE_CANDIDATES' || s.status === 'NOT_FOUND') && !s.is_approved && !s.duplicate_warning?.is_duplicate && !s.fraud_warning?.is_fraud).length;
    const duplicateCount = filtered.filter(s => (s.duplicate_warning?.is_duplicate || s.fraud_warning?.is_fraud || s.status === 'DUPLICATE_TXID') && !s.is_approved).length;

    return res.json({
      success: true,
      count: filtered.length,
      slips: filtered,
      stats: {
        total: filtered.length,
        matched: matchedCount,
        review: reviewCount,
        approved: approvedCount,
        duplicate: duplicateCount
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * POST /api/fast_check/sync_messenger_slips
 * Scans Messenger conversations starting from 12:00 AM today and updates the verification queue
 */
router.post('/sync_messenger_slips', async (req: Request, res: Response) => {
  try {
    const page = activeFacebookPage;
    let newSlipsFound = 0;

    if (page && page.access_token && page.id) {
      // 12:00 AM Today (Local Midnight)
      const now = new Date();
      const cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/v21.0/${page.id}/conversations?fields=id,updated_time,participants,messages{id,created_time,from,message,attachments{id,mime_type,name,size,image_data}}&limit=30&access_token=${page.access_token}`
        );
        const fbData = await fbRes.json();
        if (fbData.data && Array.isArray(fbData.data)) {
          const pageId = String(page.id || '');
          const pageName = (page.name || '').toLowerCase().trim();

          for (const conv of fbData.data) {
            const customerParticipant = conv.participants?.data?.find((p: any) => {
              const pid = String(p.id || '');
              const pname = (p.name || '').toLowerCase();
              return pid !== pageId && !pname.includes('kari arnett') && !pname.includes('proel toch');
            });

            const senderName = customerParticipant?.name || 'Messenger Customer';
            const senderId = customerParticipant?.id || 'FB_USER';

            const messages = conv.messages?.data || [];
            for (const m of messages) {
              const fromId = String(m.from?.id || '');
              const fromName = (m.from?.name || '').toLowerCase().trim();

              // Strict ignore: Any message from the Page, staff, or admin
              if (fromId === pageId || fromName === pageName || fromName.includes('kari arnett') || fromName.includes('proel toch') || fromName.includes('staff') || fromName.includes('admin')) {
                continue;
              }

              // Also ensure message came from the customer participant, not another admin account
              if (customerParticipant && fromId && fromId !== String(customerParticipant.id)) {
                continue;
              }

              const msgTime = new Date(m.created_time);
              if (msgTime < cutoffDate) continue;

              const attachments = m.attachments?.data || [];
              for (const att of attachments) {
                const imgUrl = att.image_data?.url;
                if (!imgUrl || att.image_data?.render_as_sticker) continue;

                // Check if already in queue by URL or ID
                const alreadyExists = messengerSlips.some(s => s.slip_url === imgUrl || s.id.includes(m.id));
                if (!alreadyExists) {

                  let savedSlipUrl = imgUrl;
                  let rawBase64 = '';
                  const mimeType = att.mime_type || 'image/jpeg';

                  try {
                    const imgResp = await fetch(imgUrl);
                    const arrayBuf = await imgResp.arrayBuffer();
                    const buf = Buffer.from(arrayBuf);
                    rawBase64 = buf.toString('base64');
                    const fileName = `slip_fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
                    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
                    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
                    fs.writeFileSync(path.join(uploadsDir, fileName), buf);
                    savedSlipUrl = `/uploads/${fileName}`;
                  } catch (dlErr) {
                    console.error('Image download error:', dlErr);
                  }

                  let extracted: ExtractedSlipData = {
                    customer_name: senderName,
                    paid_amount: 0,
                    currency: 'USD'
                  };

                  const ai = getGemini();
                  if (ai && rawBase64) {
                    const imagePart = { inlineData: { mimeType, data: rawBase64 } };
                    const textPart = {
                      text: `You are an expert at analyzing Cambodian Mobile Banking transfer slips (ABA, ACLEDA, Bakong, KHQR, Wing, Canadia, TrueMoney).
Extract:
1. is_bank_slip (boolean)
2. customer_name (string: strictly the TRANSFER FROM / PAYER name. Note: The merchant receiver is "PROEL TOCH" - NEVER return "PROEL TOCH" as customer_name!)
3. paid_amount (number)
4. currency (USD or KHR)
5. phone_number (string or null)
6. bank_name (string or null)
7. trans_date (string: Current Year is 2026. For dates like "២ តុលា ២០២៦", convert to "2026-10-02". Khmer digits: ០=0, ១=1, ២=2, ៣=3, ៤=4, ៥=5, ៦=6, ៧=7, ៨=8, ៩=9)
8. trans_ref (string or null)
9. basket_no (number or null)
10. remarks (string or null)
11. fraud_suspected (boolean: true if font on amount is edited, spliced text, or fake receipt)
12. fraud_reasons (array of strings. Do NOT flag genuine 2026 dates)
Output strictly raw JSON with these fields.`
                    };
                    const geminiRes = await callGeminiSlipExtraction(ai, imagePart, textPart);
                    if (geminiRes.text) {
                      try {
                        const cleaned = geminiRes.text.replace(/```json/gi, '').replace(/```/gi, '').trim();
                        const parsed = JSON.parse(cleaned);
                        if (parsed.is_bank_slip !== false) {
                          let amt = Number(parsed.paid_amount) || 0;
                          let curr: 'USD' | 'KHR' = String(parsed.currency || 'USD').toUpperCase() === 'KHR' ? 'KHR' : 'USD';
                          if (curr === 'KHR' || amt > 500) {
                            amt = Math.round((amt / 4100) * 100) / 100;
                            curr = 'USD';
                          }
                          extracted = {
                            customer_name: sanitizeCustomerName(parsed.customer_name, senderName),
                            paid_amount: amt,
                            currency: curr,
                            phone_number: parsed.phone_number || undefined,
                            bank_name: parsed.bank_name || undefined,
                            trans_date: parsed.trans_date || undefined,
                            trans_ref: parsed.trans_ref || undefined,
                            basket_no: parsed.basket_no || undefined,
                            remarks: parsed.remarks || undefined,
                            fraud_suspected: Boolean(parsed.fraud_suspected),
                            fraud_reasons: Array.isArray(parsed.fraud_reasons) ? parsed.fraud_reasons : []
                          };
                        }
                      } catch (parseErr) {
                        console.error('Failed to parse OCR response:', parseErr);
                      }
                    }
                  }

                  const matchRes = matchInvoiceForSlip(extracted, senderName, senderId);

                  const fraudEval = evaluateSlipFraudAndDuplicates(
                    {
                      id: `mslip_${m.id}_${Date.now()}`,
                      sender_id: senderId,
                      sender_name: senderName,
                      slip_url: savedSlipUrl,
                      received_at: m.created_time || new Date().toISOString(),
                      extracted,
                      matched_invoice: matchRes.matched
                    },
                    messengerSlips,
                    invoices
                  );

                  const statusFinal = fraudEval.duplicate_warning?.duplicate_type === 'CROSS_ACCOUNT'
                    ? 'DUPLICATE_TXID'
                    : matchRes.status;

                  messengerSlips.unshift({
                    id: `mslip_${m.id}_${Date.now()}`,
                    source: 'MESSENGER',
                    sender_id: senderId,
                    sender_name: senderName,
                    slip_url: savedSlipUrl,
                    received_at: m.created_time || new Date().toISOString(),
                    extracted,
                    status: statusFinal,
                    confidence: matchRes.confidence,
                    duplicate_warning: fraudEval.duplicate_warning,
                    fraud_warning: fraudEval.fraud_warning,
                    amount_mismatch: fraudEval.amount_mismatch,
                    matched_invoice: matchRes.matched ? {
                      invoice_id: matchRes.matched.invoice_id,
                      basket_no: matchRes.matched.basket_no,
                      live_id: matchRes.matched.live_id,
                      facebook_name: matchRes.matched.facebook_name,
                      phone_number: matchRes.matched.phone_number,
                      total_amount: matchRes.matched.total_amount,
                      created_at: matchRes.matched.created_at,
                      packing_stage: matchRes.matched.packing_stage,
                      status: matchRes.matched.status
                    } : undefined,
                    candidates: matchRes.candidates ? matchRes.candidates.map(c => ({
                      invoice_id: c.invoice_id,
                      basket_no: c.basket_no,
                      live_id: c.live_id,
                      facebook_name: c.facebook_name,
                      phone_number: c.phone_number,
                      total_amount: c.total_amount,
                      created_at: c.created_at,
                      packing_stage: c.packing_stage,
                      status: c.status
                    })) : undefined
                  });
                  newSlipsFound++;
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('Facebook Graph sync error:', e);
      }
    }

    saveDatabaseToDisk();
    bumpDataRevision();

    return res.json({
      success: true,
      new_slips_count: newSlipsFound,
      total_slips: messengerSlips.length,
      message: `✅ បានទាញយក និង Auto-Scan វិក្កយបត្រថ្មីពី Messenger រួចរាល់ (${newSlipsFound} Slips ថ្មី)!`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * POST /api/fast_check/approve_slip
 * 1-Click Approve single slip from Messenger queue
 */
router.post('/approve_slip', (req: Request, res: Response) => {
  try {
    const { slip_id, invoice_id, paid_amount, packer_name, allow_duplicate_override } = req.body;
    if (!slip_id || !invoice_id) {
      return res.status(400).json({ success: false, error: 'Missing slip_id or invoice_id' });
    }

    const slip = messengerSlips.find(s => s.id === slip_id);
    const inv = invoices.find(i => i.invoice_id === Number(invoice_id));

    if (!inv) {
      return res.status(404).json({ success: false, error: 'រកមិនឃើញកន្ត្រកវិក្កយបត្រនេះទេ' });
    }

    if (slip?.duplicate_warning?.is_duplicate && slip.duplicate_warning.duplicate_type === 'CROSS_ACCOUNT' && !allow_duplicate_override) {
      return res.status(400).json({
        success: false,
        error: `⛔ មិនអាច Approve បានទេ! ${slip.duplicate_warning.message} (ប្រសិនបើចង់ Approve ដោយបង្ខំ សូមបញ្ជាក់ក្នុងប្រអប់ Confirmation)`
      });
    }

    const nowIso = new Date().toISOString();
    inv.status = 'Paid';
    inv.payment_status = 'Paid';
    inv.paid_at = nowIso;
    inv.paid_by = packer_name || 'Admin (Messenger Table)';
    if (slip && slip.slip_url) {
      inv.payment_slip_url = slip.slip_url;
    }
    if (paid_amount && Number(paid_amount) > 0) {
      inv.payment_method = 'Bank Transfer (KHQR)';
    }
    if (inv.packing_stage === 'UNPICKED') {
      inv.packing_stage = 'STAGED';
    }

    // Permanently record the TxID into invoice notes/comments to lock against future cross-account reuse
    const transRef = (slip && slip.extracted?.trans_ref) || '';
    if (transRef) {
      inv.notes = inv.notes || [];
      const noteEntry = `[TxID: ${transRef.toUpperCase()}]`;
      if (!inv.notes.includes(noteEntry)) {
        inv.notes.push(noteEntry);
      }
    }

    if (slip) {
      slip.status = 'APPROVED';
      slip.is_approved = true;
    }

    // DISPATCH MESSENGER CONFIRMATION REPLY TO CUSTOMER ON ADMIN APPROVE
    const targetPsid = (slip && slip.sender_id) || inv.facebook_user_id;
    const customerName = inv.facebook_name || (slip && slip.sender_name) || 'អតិថិជន';
    const basketNo = inv.basket_no || inv.invoice_id;
    const finalAmount = (slip && slip.extracted?.paid_amount) || inv.total_amount;
    const bankName = (slip && slip.extracted?.bank_name) || 'ធនាគារ';

    const replyMessage = `✅ ហាងបានទទួលការទូទាត់ប្រាក់ចំនួន $${Number(finalAmount).toFixed(2)} (${bankName}${transRef ? ' ‧ Ref: ' + transRef : ''}) ត្រឹមត្រូវ ១០០% ហើយបង ${customerName}! 🎉\n\n📦 កន្ត្រកលេខ #${basketNo} របស់បងត្រូវបាន Admin ផ្ទៀងផ្ទាត់ [បង់រួច] និងបញ្ជូនទៅកាន់បញ្ជីវេចខ្ចប់រួចរាល់។ អរគុណច្រើនបង! 🙏`;

    if (targetPsid && targetPsid !== 'FB_USER' && targetPsid !== 'TEST_USER_1' && !targetPsid.startsWith('1000')) {
      sendFacebookMessengerReply(targetPsid, replyMessage).catch(err => {
        console.error('[Admin Approve FB Send Error]:', err);
      });
    }

    addChatbotLog({
      type: 'SLIP_VERIFIED',
      customer_name: customerName,
      customer_id: targetPsid,
      basket_no: basketNo,
      incoming_message: `[Admin Approved Slip #${basketNo} $${Number(finalAmount).toFixed(2)}]`,
      bot_reply: replyMessage,
      status: 'SUCCESS',
      meta: { invoice_id: inv.invoice_id, basket_no: basketNo, amount: finalAmount }
    });

    saveDatabaseToDisk();
    bumpDataRevision();

    return res.json({
      success: true,
      message: `✅ Admin បាន Approved កន្ត្រក #${inv.basket_no} ទៅជា [Paid] និងបានផ្ញើសារបញ្ជាក់ទៅ Messenger រួចរាល់!`,
      invoice: inv
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * POST /api/fast_check/reject_slip
 * Discards or rejects an unneeded/invalid slip from queue
 */
router.post('/reject_slip', (req: Request, res: Response) => {
  try {
    const { slip_id } = req.body;
    if (!slip_id) {
      return res.status(400).json({ success: false, error: 'Missing slip_id' });
    }

    const idx = messengerSlips.findIndex(s => s.id === slip_id);
    if (idx !== -1) {
      messengerSlips.splice(idx, 1);
    }

    saveDatabaseToDisk();
    bumpDataRevision();

    return res.json({
      success: true,
      message: 'បានដក Slip ចេញពីតារាងផ្ទៀងផ្ទាត់រួចរាល់'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

export default router;
