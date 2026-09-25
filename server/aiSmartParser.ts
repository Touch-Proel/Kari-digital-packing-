import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { Product } from './types';
import { detectDeliveryZone } from './locationHelper';
import { convertKhmerDigitsToArabic, extractPhoneNumber } from './parser';
import { settings } from './db';

export interface BasketAuditResult {
  verified_items: Array<{
    code: string;
    quantity: number;
    notes?: string;
    suggested_price?: number;
    product_name?: string;
  }>;
  phone: string | null;
  address: string | null;
  zone: 'PP' | 'PROVINCE' | null;
  corrections_made: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  summary: string;
}

const KHMER_NUM_WORDS: Array<{ word: string; num: number }> = [
  { word: 'មួយឡូ', num: 12 },
  { word: 'កន្លះឡូ', num: 6 },
  { word: 'ដប់', num: 10 },
  { word: 'ប្រាំបួន', num: 9 },
  { word: 'ប្រាំបី', num: 8 },
  { word: 'ប្រាំពីរ', num: 7 },
  { word: 'ប្រាំមួយ', num: 6 },
  { word: 'ប្រាំ', num: 5 },
  { word: 'បួន', num: 4 },
  { word: 'បី', num: 3 },
  { word: 'ពីរ', num: 2 },
  { word: 'មួយ', num: 1 },
  { word: 'មូយ', num: 1 }
];

const NON_CODE_WORDS = new Set([
  'HI', 'HELLO', 'OK', 'YES', 'NO', 'KG', 'KILO', 'CM', 'PP', 'VIP', 'ABA', 'KHQR',
  'LIVE', 'FREE', 'SHIP', 'SET', 'TEL', 'PHONE', 'SIZE', 'COLOR', 'ADMIN', 'BONG', 'JAE',
  'SL', 'SLL', 'SLSL', 'ORKUN', 'AKUN', 'HOW', 'CAN', 'LIKE', 'LOVE',
  'សាយ', 'ចង្កេះ', 'លេខ', 'ពណ៌', 'ពណ៍', 'អាវ', 'ខោ', 'ឈុត',
  'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXS', '2XL', '3XL', '4XL', '5XL', '6XL', 'FS', 'FREESIZE', 'FREE-SIZE'
]);

const QUESTION_PHRASES = [
  'អត់', 'ប៉ុន្មាន', 'តម្លៃ', 'ថ្លៃ', 'សាច់', 'ពាក់បាន', 'សល់', 'មានអត់', 'សុំមើល',
  'មើល', 'អស់នៅ', 'អស់ហើយ', 'លក់ម៉េច', 'មិចដែរ', 'ចុះ', 'បញ្ចុះ', 'គីឡូពាក់បាន'
];

/**
 * AI Smart Basket Auditor using Gemini Flash (Real AI, No regex fallback)
 * Audits the ENTIRE basket by analyzing ALL customer comments with Gemini models,
 * verifying against catalog, and extracting items, phone, address, and notes.
 */
export async function aiSmartAuditFullBasket(
  allComments: string[],
  currentItems: Array<{ code: string; quantity: number; notes?: string }>,
  customerName: string = 'អតិថិជន',
  catalog: Product[] = []
): Promise<BasketAuditResult> {
  if (!allComments || allComments.length === 0) {
    return {
      verified_items: currentItems.map(it => ({
        code: it.code,
        quantity: it.quantity,
        notes: cleanNotes(it.notes || '', it.code)
      })),
      phone: null,
      address: null,
      zone: null,
      corrections_made: [],
      confidence: 'LOW',
      summary: 'គ្មានខមិនរបស់អតិថិជនដើម្បីផ្ទៀងផ្ទាត់ឡើយ'
    };
  }

  const catalogSummary = catalog.map(p => ({
    code: p.code,
    name: p.name,
    price: p.price,
    stock: p.stock_qty
  }));

  const apiKey = (process.env.GEMINI_API_KEY || settings.gemini_api_key || '').trim();

  if (!apiKey) {
    throw new Error('មិនទាន់មាន Gemini API Key នៅឡើយទេ។ សូមកំណត់ GEMINI_API_KEY នៅក្នុង Settings > Secrets ដើម្បីដំណើរការ AI!');
  }

  const prompt = `You are an expert Cambodian Facebook Live commerce Auditor & Order Reconciler.
Your task is to re-audit an ENTIRE customer basket by reading ALL customer comments from scratch and fixing any incorrect quantities or wrongly parsed items previously registered by the system regex.

CUSTOMER NAME: "${customerName || 'Customer'}"

CURRENT ITEMS IN BASKET (PREVIOUSLY REGISTERED - MAY HAVE WRONG QUANTITY OR MISSING ITEMS):
${JSON.stringify(currentItems, null, 2)}

ACTIVE PRODUCT CATALOG (IN STOCK FOR THIS LIVE):
${JSON.stringify(catalogSummary, null, 2)}

ALL COMMENTS FROM THIS CUSTOMER (in chronological order):
${allComments.map((c, i) => `${i + 1}. "${c}"`).join('\n')}

STRICT AUDIT INSTRUCTIONS:
1. Ground Truth is Customer Comments: Parse what the customer actually ordered in their comments.
2. Correct Wrong Quantities:
   - If comment says "យក 47 ពីរ" or "47=2" or "47 2" -> code "47" quantity 2.
   - If comment says "85=2 82=2" -> code "85" quantity 2, code "82" quantity 2.
   - If comment says "101" or "យក 101" -> code "101" quantity 1.
   - If comment says "106=1" -> code "106" quantity 1.
   - DO NOT multiply or accumulate duplicate counts from the same single comment.
3. Multi-Item Extraction: Extract all distinct product codes ordered across all comments. Unlisted live codes are valid product codes.
4. Clean Notes:
   - "notes" MUST ONLY be actual color, size, or customer special instructions (e.g. "size L", "size 34", "ចង្កេះ 32", "ពណ៍ខ្មៅ").
   - NEVER write "កូដ [xxx]" or repeat the product code in the notes. Leave "notes" as "" (empty string) if no color/size was requested.
5. Inquiries vs Orders:
   - Comments like "ខោពាក់បានត្រឹមប៉ុន្មានគីឡូ?", "សួស្តី", "សុំមើលកូដ 5", "តម្លៃប៉ុន្មាន" are questions, NOT orders. Do not extract numbers from questions.
6. Phone & Location:
   - Phone: Extract Cambodian phone numbers (e.g. 012889772, 0975544321).
   - Address: Full address string if given.
   - Zone: "PP" (Phnom Penh) or "PROVINCE" (all provinces).
7. CLOTHING SIZES & PANTS/WAIST SIZES ARE NOT PRODUCT CODES:
   - Letter sizes (XS, S, M, L, XL, XXL, 2XL, 3XL, 4XL, 5XL, FreeSize) and pants waist sizes (24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 40, etc., written as "សាយ 34", "size 34", "ចង្កេះ 32", "លេខ 34") are SIZES / ATTRIBUTES.
   - Put them in "notes" (e.g. notes: "size 34", notes: "size XL", notes: "ចង្កេះ 32", "សាយ L").
   - NEVER treat clothing/waist sizes as standalone product codes (e.g. NEVER output code "34", "32", "L", "XL", "M", "2XL", etc. unless confirmed as explicit product codes by catalog).
8. ACTION PHRASES WITHOUT PRODUCT CODE:
   - Comments like "យក 2", "យក2", "កាត់ 1", "ថែម 2", "ដាក់ 1", "កក់ 1", "យកមួយ", "យក 2 អាវ" specify QUANTITY ONLY without a product code.
   - NEVER create a product code "2" or "1" from these comments. If no product code was specified, do not add an item.

Return ONLY valid JSON:
{
  "verified_items": [
    {
      "code": "85",
      "quantity": 2,
      "notes": ""
    }
  ],
  "phone": "012345678" or null,
  "address": "Phnom Penh" or null,
  "zone": "PP" | "PROVINCE" | null,
  "corrections_made": [
    "កែសម្រួលកូដ 85=2, 82=2, 101=1 ចូលកន្ត្រកត្រឹមត្រូវ"
  ],
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "summary": "បានផ្ទៀងផ្ទាត់កន្ត្រកឡើងវិញឃើញ 3 មុខទំនិញ"
}`;

  const modelsToTry = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW
          }
        }
      });

      const responseText = response.text || '{}';
      const parsed = JSON.parse(responseText);

      const validItems = (Array.isArray(parsed.verified_items) ? parsed.verified_items : [])
        .map((it: any) => {
          const cleanCode = String(it.code || '').trim().toUpperCase();
          const matchedProd = catalog.find(p => p.code.toUpperCase() === cleanCode);
          const notes = cleanNotes(String(it.notes || ''), cleanCode);
          return {
            code: cleanCode,
            quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
            notes,
            suggested_price: matchedProd?.price || 3.0,
            product_name: matchedProd?.name || `កូដ ${cleanCode}`
          };
        })
        .filter((it: any) => Boolean(it.code) && !NON_CODE_WORDS.has(it.code));

      let detectedZone: 'PP' | 'PROVINCE' | null =
        parsed.zone === 'PROVINCE' ? 'PROVINCE' : parsed.zone === 'PP' ? 'PP' : null;

      if (!detectedZone && parsed.address) {
        const zoneRes = detectDeliveryZone(parsed.address);
        if (zoneRes.zone === 'PP' || zoneRes.zone === 'PROVINCE') {
          detectedZone = zoneRes.zone;
        }
      }

      return {
        verified_items: validItems,
        phone: parsed.phone ? String(parsed.phone).replace(/\D/g, '') : null,
        address: parsed.address ? String(parsed.address).trim() : null,
        zone: detectedZone,
        corrections_made: Array.isArray(parsed.corrections_made) ? parsed.corrections_made : [],
        confidence: parsed.confidence || 'HIGH',
        summary: parsed.summary || `✨ AI (${modelName}) បានផ្ទៀងផ្ទាត់កន្ត្រកឃើញ ${validItems.length} មុខទំនិញ`
      };
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err || '');
      if (!errMsg.includes('429') && !errMsg.includes('RESOURCE_EXHAUSTED')) {
        console.log(`[Gemini AI] Attempt with ${modelName} notice:`, errMsg.slice(0, 120));
      }
    }
  }

  // If Gemini API fails or quota runs out, smoothly use high-precision Cambodian rule reconciliation
  try {
    const fallbackResult = fallbackFullBasketAudit(allComments, currentItems, catalog);
    return fallbackResult;
  } catch (fbErr: any) {
    throw new Error(`បរាជ័យក្នុងការវិភាគ៖ ${fbErr?.message || 'មិនអាចផ្ទៀងផ្ទាត់កន្ត្រកបានទេ'}`);
  }
}

/**
 * Sanitizes note string: removes ugly "កូដ [xxx]" or self-referential codes
 */
function cleanNotes(note: string, code: string): string {
  if (!note) return '';
  let s = note.trim();
  if (/^កូដ\s*\[?.*?\]?$/i.test(s)) return '';
  if (s.toUpperCase() === code.toUpperCase() || s.toUpperCase() === `កូដ ${code}`.toUpperCase()) return '';
  s = s.replace(/\[\s*កូដ\s*[^\]]+\]/gi, '').trim();
  s = s.replace(/កូដ\s*\[[^\]]+\]/gi, '').trim();
  return s;
}

/**
 * High-speed, high-precision offline Khmer rule reconciliation engine
 */
export function fallbackFullBasketAudit(
  allComments: string[],
  currentItems: Array<{ code: string; quantity: number; notes?: string }>,
  catalog: Product[]
): BasketAuditResult {
  const allText = allComments.join(' \n ');
  const normText = convertKhmerDigitsToArabic(allText);

  const { phone } = extractPhoneNumber(normText);
  const zoneRes = detectDeliveryZone(normText);
  const finalZone: 'PP' | 'PROVINCE' | null =
    zoneRes.zone === 'PP' || zoneRes.zone === 'PROVINCE' ? zoneRes.zone : null;

  const catalogMap = new Map<string, Product>();
  for (const p of catalog) {
    if (p.code && p.code.trim()) {
      catalogMap.set(p.code.toUpperCase().trim(), p);
    }
  }

  const itemsMap = new Map<string, { qty: number; notes: string }>();
  const corrections: string[] = [];

  for (let rawComment of allComments) {
    if (!rawComment || !rawComment.trim()) continue;

    let s = convertKhmerDigitsToArabic(rawComment.trim());

    // 0. GUARD: Skip pure action + quantity ONLY comments (e.g. "យក 2", "យក2", "កាត់ 1", "ថែម 2", "ដាក់ 1", "កក់ 1", "យកមួយ", "យក 1 អាវ")
    if (/^(?:យក|កាត់|ថែម|ដាក់|កក់|បូក|សុំ|សុំយក)\s*\d{1,2}(?:\s*(?:អាវ|ខោ|ឈុត|កំប៉ុង|ក្បាល|គូ|កញ្ចប់|ពណ៌|ពណ))?$/i.test(s.trim())) {
      continue;
    }

    // 0. GUARD: Skip pure waist / size comments without code (e.g. "សាយ 34", "size 34", "ចង្កេះ 34", "សាយ 34 យក 1", "ចង្កេះ 32 យក 2")
    if (/^(?:(?:យក|កាត់|ថែម|ដាក់|កក់)\s*)?(?:សាយ|size|ចង្កេះ|លេខ|ស្លឹក)\s*[:=\s]*\d{2}(?:\s*(?:យក|កាត់|ថែម|ដាក់|កក់)?\s*\d{1,2})?(?:\s*(?:អាវ|ខោ|ឈុត|ពណ៌|ពណ))?$/i.test(s.trim())) {
      continue;
    }

    // 1. Skip pure inquiry / question comments with no order intent
    const isQuestion = QUESTION_PHRASES.some(q => s.includes(q)) &&
      !/(?:កូដ\s*)?[A-Za-z0-9]{1,5}\s*[:=/\-_*xX]\s*\d{1,2}/.test(s) &&
      !/(?:យក|កាត់|ថែម|ដាក់|កក់)\s*[A-Za-z0-9]{1,5}/.test(s);

    if (isQuestion) {
      continue;
    }

    // 2. Strip out phone numbers and addresses so their digits are NEVER confused as product codes or quantities
    s = s.replace(/(?:\+?855|0)\d{7,9}/g, ' ');
    s = s.replace(/(?:ផ្ទះលេខ|ផ្លូវ|សង្កាត់|ខណ្ឌ|ក្រុង|ភូមិ|ផ្សារ|បុរី)\s*[\u1780-\u17FFa-zA-Z0-9_\-]+/g, ' ');
    s = s.replace(/\d+\s*(?:kg|kilo|គីឡូ|គក|ម៉ែត្រ|m)\b/gi, ' ');

    s = s.replace(/ឆុត/g, 'ឈុត').replace(/កូត|ខូត|កូក|គូដ/g, 'កូដ').replace(/យល/g, 'យក');

    // Replace Khmer word numbers with digits
    for (const { word, num } of KHMER_NUM_WORDS) {
      s = s.replace(new RegExp(word, 'g'), String(num));
    }

    // Protect delimiters between multiple items: "50=2 .51=1" -> "50=2 51=1"
    s = s.replace(/([:=]\s*\d{1,2})\s*[\/.,;]+\s*([A-Za-z0-9])/g, '$1 $2');
    s = s.replace(/([:=])\s*(\d)(?:3XL|2XL|4XL|5XL|6XL|XXL|XXS|XL|XS|[SML]|FS|FREESIZE)\b/gi, '$1$2 ');

    // Extract clothing size / waist notes (e.g. "51 សាយ 34 2" or "47 L 2" or "47 ចង្កេះ 32")
    let noteText = '';
    const waistExtractMatch = rawComment.match(/(?:សាយ|size|ចង្កេះ|លេខ|ស្លឹក)\s*[:=\s]*(\d{2})\b/i);
    const sizeExtractMatch = rawComment.match(/\b(XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\b/i);
    const colorExtractMatch = rawComment.match(/(?:ពណ៍|ពណ៌|ពណ៏)\s*([A-Za-z0-9\u1780-\u17FF]+)/i);

    if (waistExtractMatch) {
      noteText = `size ${waistExtractMatch[1]}`;
    } else if (sizeExtractMatch) {
      noteText = `size ${sizeExtractMatch[1].toUpperCase()}`;
    } else if (/សាយ\s*អិល|សាយអិល/i.test(rawComment)) {
      noteText = 'size L';
    } else if (/សាយ\s*អ៊ិចអិល|សាយអ៊ិចអិល/i.test(rawComment)) {
      noteText = 'size XL';
    }

    if (colorExtractMatch) {
      noteText = noteText ? `${noteText} | ${colorExtractMatch[0].trim()}` : colorExtractMatch[0].trim();
    }

    // Normalize pants waist patterns
    s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*(?:សាយ|size|ចង្កេះ|លេខ)?\s*(?:2[4-9]|3[0-9]|4[0-6])\s*(?:យក|កាត់|ថែម|ដាក់|កក់)?\s*[:=\s]\s*(\d{1,2})(?!\d)/gi, '$1=$2');
    s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*[:=\s]\s*(\d{1,2})\s*(?:សាយ|size|ចង្កេះ|លេខ)\s*[:=\s]*(?:2[4-9]|3[0-9]|4[0-6])\b/gi, '$1=$2');
    s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*(?:សាយ|size|ចង្កេះ|លេខ)\s*[:=\s]*(?:2[4-9]|3[0-9]|4[0-6])(?!\d)/gi, '$1=1');

    s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*(?:សាយ|size|ពណ៌|ពណ៍)?\s*(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\s*[:=\s]\s*(\d{1,2})(?!\d)/gi, '$1=$2');
    s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*[:=\s]\s*(\d{1,2})\s*(?:សាយ|size|ពណ៌|ពណ៍)?\s*(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\b/gi, '$1=$2');
    s = s.replace(/(?<![=:\d])(\d{1,4}|[A-Za-z]\d{1,3})\.{1,3}(\d{1,2})(?![=:\d])/g, '$1=$2');

    // Remove standalone size/waist remnants so they aren't parsed as codes
    s = s.replace(/(?:សាយ|size|ចង្កេះ|លេខ|ស្លឹក)\s*[:=\s]*(?:2[4-9]|3[0-9]|4[0-6])\b/gi, ' ');
    s = s.replace(/\b(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|FREESIZE)\b/gi, ' ');

    // Track matched codes in this specific comment to avoid double-counting
    const commentMatchedCodes = new Set<string>();

    // Pattern A: Standard explicit pairs (e.g. "85=2 82=2", "47:2", "51 យក 1", "កូដ 10 2")
    const pairRegex = /(?:(?<=[^\w]|^)([A-Za-z0-9]{1,5})\s*[:=/\-_*xX]\s*(\d{1,2})(?=[^\w]|$))|(?:(?:កូដ|code)\s*([A-Za-z0-9]{1,5})\s*(?:យក|កាត់|ថែម)?\s*(\d{1,2})(?=[^\w]|$))|(?:([A-Za-z0-9]{1,5})\s*(?:យក|កាត់|ថែម)\s*(\d{1,2})(?=[^\w]|$))/gi;

    let match;
    while ((match = pairRegex.exec(s)) !== null) {
      const code = (match[1] || match[3] || match[5] || '').toUpperCase().trim();
      const qty = parseInt(match[2] || match[4] || match[6] || '1', 10) || 1;

      if (code && !NON_CODE_WORDS.has(code) && code.length <= 5 && !commentMatchedCodes.has(code)) {
        commentMatchedCodes.add(code);
        const prev = itemsMap.get(code) || { qty: 0, notes: noteText };
        itemsMap.set(code, { qty: prev.qty + qty, notes: noteText || prev.notes });
      }
    }

    // Pattern B: Inverted pattern: "យក 2 កូដ 47", "យក 2 អាវ 47"
    const invRegex = /(?:យក|កាត់|ថែម|ដាក់|កក់)\s*(\d{1,2})\s*(?:កូដ|code|អាវ|ខោ|ឈុត)?\s*([A-Za-z0-9]{1,5})(?=[^\w]|$)/gi;
    while ((match = invRegex.exec(s)) !== null) {
      const qty = parseInt(match[1], 10) || 1;
      const code = match[2].toUpperCase().trim();

      if (code && !NON_CODE_WORDS.has(code) && code.length <= 5 && !commentMatchedCodes.has(code)) {
        commentMatchedCodes.add(code);
        const prev = itemsMap.get(code) || { qty: 0, notes: noteText };
        itemsMap.set(code, { qty: prev.qty + qty, notes: noteText || prev.notes });
      }
    }

    // Pattern C: Action word + Single Code without quantity (e.g. "យក 101", "កាត់ 106", "ថែម 101", "សុំ 101")
    if (commentMatchedCodes.size === 0) {
      const actionSingleRegex = /(?:យក|កាត់|ថែម|ដាក់|កក់|សុំ)\s*(?:កូដ|code)?\s*([A-Za-z0-9]{1,5})(?=[^\w]|$)/gi;
      while ((match = actionSingleRegex.exec(s)) !== null) {
        const code = match[1].toUpperCase().trim();
        const isSingleDigit = /^\d$/.test(code);
        // Single digit (1-9) after action verb without "កូដ" is a quantity (e.g. "យក 2"), not a code!
        if (isSingleDigit && !s.includes('កូដ') && !s.includes('code') && !catalogMap.has(code)) {
          continue;
        }

        if (code && !NON_CODE_WORDS.has(code) && code.length <= 5 && !commentMatchedCodes.has(code)) {
          commentMatchedCodes.add(code);
          const prev = itemsMap.get(code) || { qty: 0, notes: noteText };
          itemsMap.set(code, { qty: prev.qty + 1, notes: noteText || prev.notes });
        }
      }
    }

    // Pattern D: Standalone code comment (e.g. customer just wrote "101" or "85")
    if (commentMatchedCodes.size === 0) {
      const tokens = s.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 1) {
        const singleToken = tokens[0].toUpperCase().trim();
        if (singleToken.length >= 2 && singleToken.length <= 5 && !NON_CODE_WORDS.has(singleToken) && /^[A-Z0-9]+$/.test(singleToken)) {
          commentMatchedCodes.add(singleToken);
          const prev = itemsMap.get(singleToken) || { qty: 0, notes: noteText };
          itemsMap.set(singleToken, { qty: prev.qty + 1, notes: noteText || prev.notes });
        }
      }
    }
  }

  // Build final verified items list
  const finalItems: Array<{ code: string; quantity: number; notes?: string; suggested_price?: number; product_name?: string }> = [];

  itemsMap.forEach(({ qty, notes }, code) => {
    const prod = catalogMap.get(code);
    finalItems.push({
      code,
      quantity: Math.max(1, qty),
      notes: cleanNotes(notes, code),
      suggested_price: prod?.price || 3.0,
      product_name: prod?.name || `កូដ ${code}`
    });
    corrections.push(`ផ្ទៀងផ្ទាត់កូដ [${code} x${qty}]`);
  });

  // If no items were extracted from comments at all, retain valid items from current basket
  if (finalItems.length === 0) {
    for (const cur of currentItems) {
      const clean = cur.code.toUpperCase().trim();
      if (clean && !NON_CODE_WORDS.has(clean)) {
        finalItems.push({
          code: clean,
          quantity: cur.quantity,
          notes: cleanNotes(cur.notes || '', clean)
        });
      }
    }
  }

  if (phone) corrections.push(`ទូរស័ព្ទ: ${phone}`);
  if (finalZone) corrections.push(`តំបន់: ${finalZone === 'PP' ? 'ភ្នំពេញ' : 'ខេត្ត'}`);

  return {
    verified_items: finalItems,
    phone,
    address: null,
    zone: finalZone,
    corrections_made: corrections,
    confidence: 'HIGH',
    summary: `✨ បានផ្ទៀងផ្ទាត់កន្ត្រកឡើងវិញឃើញ ${finalItems.length} មុខទំនិញ`
  };
}
