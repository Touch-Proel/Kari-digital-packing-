import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { invoices, saveDatabaseToDisk, bumpDataRevision, settings } from './db';
import { Invoice } from './types';

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

// Utility: Normalize text for matching
function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
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
}

export interface FastCheckResultItem {
  id: string;
  image_name: string;
  slip_url: string;
  extracted: ExtractedSlipData;
  status: 'MATCHED' | 'MULTIPLE_CANDIDATES' | 'NOT_FOUND';
  confidence: number;
  error_message?: string;
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
 * Match extracted slip data against active database invoices
 */
export function matchInvoiceForSlip(data: ExtractedSlipData): {
  status: 'MATCHED' | 'MULTIPLE_CANDIDATES' | 'NOT_FOUND';
  confidence: number;
  matched?: Invoice;
  candidates?: Invoice[];
} {
  // Active invoices across all lives (exclude Cancelled & already Dispatched)
  const pool = invoices.filter(
    inv => inv.status !== 'Cancelled' && inv.status !== 'Dispatched' && inv.packing_stage !== 'DISPATCHED'
  );

  const normExtracted = normalizeName(data.customer_name);
  if (!normExtracted) {
    // If name was not recognized, provide recent unpaid/staged baskets as fallback candidates
    const recentUnpaid = pool.filter(i => i.status !== 'Paid').slice(0, 5);
    return { status: 'NOT_FOUND', confidence: 0, candidates: recentUnpaid };
  }

  // Score candidate invoices
  const scored = pool.map(inv => {
    let score = 0;
    const normInv = normalizeName(inv.facebook_name);

    // 1. Name Match
    if (normInv === normExtracted) {
      score += 60;
    } else if (normInv.includes(normExtracted) || normExtracted.includes(normInv)) {
      score += 40;
    } else {
      // Check token overlap
      const invTokens = normInv.split(' ');
      const extTokens = normExtracted.split(' ');
      const overlap = invTokens.filter(t => t.length > 2 && extTokens.includes(t));
      if (overlap.length > 0) {
        score += 25 * overlap.length;
      }
    }

    // 2. Amount Match (Handle USD and KHR conversion ~ 4000-4100 KHR/USD)
    if (data.paid_amount > 0 && inv.total_amount > 0) {
      let paidUsd = data.paid_amount;
      if (data.currency === 'KHR' || data.paid_amount > 500) {
        paidUsd = data.paid_amount / 4000;
      }

      const diff = Math.abs(inv.total_amount - paidUsd);
      if (diff < 0.25) {
        score += 35; // Near-exact match
      } else if (diff < 1.0) {
        score += 20; // Close match
      } else if (data.paid_amount === inv.total_amount) {
        score += 35;
      }
    }

    // 3. Phone Match
    if (data.phone_number && inv.phone_number) {
      const cleanSlipPhone = data.phone_number.replace(/\D/g, '');
      const cleanInvPhone = inv.phone_number.replace(/\D/g, '');
      if (cleanSlipPhone && cleanInvPhone && (cleanSlipPhone.includes(cleanInvPhone) || cleanInvPhone.includes(cleanSlipPhone))) {
        score += 30;
      }
    }

    // 4. Prefer baskets that are waiting for payment (STAGED / UNPICKED)
    if (inv.packing_stage === 'STAGED' && inv.status !== 'Paid') {
      score += 15;
    }

    return { inv, score };
  });

  // Filter candidates with minimum plausible score
  const validCandidates = scored
    .filter(item => item.score >= 45)
    .sort((a, b) => b.score - a.score);

  if (validCandidates.length === 0) {
    const fallbackUnpaid = pool.filter(i => i.status !== 'Paid').slice(0, 5);
    return { status: 'NOT_FOUND', confidence: 0, candidates: fallbackUnpaid };
  }

  // If top candidate has high score and is clearly ahead
  if (validCandidates.length === 1 || (validCandidates[0].score >= 80 && validCandidates[0].score - (validCandidates[1]?.score || 0) >= 25)) {
    return {
      status: 'MATCHED',
      confidence: Math.min(100, validCandidates[0].score),
      matched: validCandidates[0].inv
    };
  }

  // Ambiguous: multiple candidates
  return {
    status: 'MULTIPLE_CANDIDATES',
    confidence: validCandidates[0].score,
    candidates: validCandidates.slice(0, 5).map(c => c.inv)
  };
}

/**
 * Robust OCR Helper with Multi-Model Fallback for 503 / 429 Demand Spikes
 */
export async function callGeminiSlipExtraction(
  ai: GoogleGenAI,
  imagePart: { inlineData: { mimeType: string; data: string } },
  textPart: { text: string }
): Promise<{ text: string; error?: string }> {
  // Use high-throughput flash-lite first to avoid 503 high demand spikes, with 3.6-flash and 3.8-flash fallbacks
  const modelCandidates = ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'];
  let lastErrorMessage = '';

  for (const model of modelCandidates) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model,
        contents: { parts: [imagePart, textPart] },
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
      // Seamlessly proceed to the next fallback model without throwing noisy console warnings
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
          text: `You are an expert at analyzing Cambodian Facebook Messenger chat screenshots with bank transfer receipts (ABA Bank, ACLEDA Bank, Canadia, TrueMoney, KHQR).
Analyze this image carefully:
1. Look at the Facebook Messenger chat header at the very top: What is the customer's Facebook Profile Name? (e.g. "Mak Banhapich", "Malin Mon", "Kari Arnett"). Do NOT use the page name or staff name.
2. In the chat or on the bank slip, find the transferred amount and currency (e.g. 40,000 KHR or 10.00 USD).
3. If the customer sent a phone number or address in the chat text (e.g. "070227974"), extract the phone number.
4. Extract bank name (e.g. ACLEDA, ABA) and reference number if visible.

Return ONLY a JSON object with this exact structure:
{
  "customer_name": "Exact Name at Top of Chat",
  "paid_amount": 10.00,
  "currency": "USD",
  "phone_number": "070227974",
  "bank_name": "ACLEDA",
  "trans_ref": "62616195612"
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
            const parsed = JSON.parse(rawText.trim());
            extracted = {
              customer_name: String(parsed.customer_name || '').trim(),
              paid_amount: Number(parsed.paid_amount) || 0,
              currency: String(parsed.currency || 'USD').toUpperCase() === 'KHR' ? 'KHR' : 'USD',
              phone_number: parsed.phone_number ? String(parsed.phone_number).trim() : undefined,
              bank_name: parsed.bank_name ? String(parsed.bank_name).trim() : undefined,
              trans_ref: parsed.trans_ref ? String(parsed.trans_ref).trim() : undefined
            };
          } catch {
            console.warn('Failed to parse Gemini JSON output:', rawText);
          }
        }
      } else if (!ai) {
        errorMessage = 'មិនទាន់កំណត់ GEMINI_API_KEY ទេ';
      }

      // Match against invoices
      const matchResult = matchInvoiceForSlip(extracted);

      results.push({
        id: `slip_${idx}_${Date.now()}`,
        image_name: item.name || `Slip #${idx + 1}`,
        slip_url: slipUrl,
        extracted,
        status: matchResult.status,
        confidence: matchResult.confidence,
        error_message: errorMessage || undefined,
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
        inv.paid_by = packerName || 'Fast-Check AI';
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
      }
    }

    saveDatabaseToDisk();
    bumpDataRevision();

    return res.json({
      success: true,
      updated_count: updatedCount,
      message: `បានផ្ទៀងផ្ទាត់ និងសម្គាល់បង់រួចជោគជ័យ ${updatedCount} កន្ត្រក!`
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
        else if (inv.location_zone === 'PROVINCE') todayProvinceCount++;
      }

      if (inv.location_zone === 'PP') {
        ppCount++;
      } else if (inv.location_zone === 'PROVINCE') {
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

export default router;
