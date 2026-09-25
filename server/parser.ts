import {
  products,
  invoices,
  customers,
  rawComments,
  recalculateInvoice,
  bumpDataRevision,
  saveDatabaseToDisk,
  activeLiveId,
  settings
} from './db';
import { DeliveryZone, Invoice, OrderItem, CustomerComment } from './types';
import { detectDeliveryZone } from './locationHelper';

export { detectDeliveryZone };

const COMMON_GREETINGS = new Set([
  'HI', 'HELLO', 'BONG', 'OK', 'YES', 'NO', 'PRICE', 'INBOX',
  'ADMIN', 'SL', 'SLL', 'SLSL', 'LIKE', 'LOVE', 'CAN', 'HOW', 'TWA',
  'CHHAT', 'JAE', 'AKUN', 'ORKUN', 'SLJAE', 'SLBONG', 'GOOD'
]);

const QUESTION_KEYWORDS = [
  'អត់', 'មាន', 'ប៉ុន្មាន', 'ថ្លៃ', 'តម្លៃ', 'ពាក់បាន',
  'សាច់', 'សល់', 'មានអត់', 'អត់បង', 'អត់ចែ', 'ថ្លៃប៉ុន្មាន',
  'លក់ម៉េច', 'ម៉េចដែរ', 'ចុះ', 'បញ្ចុះ',
  'ត្រូវថ្លៃ', 'សួរ', 'ចង់សួរ', 'មានកូន', 'មេីល', 'មើល',
  'អស់នៅ', 'អស់ហើយ', 'អស់ឬនៅ', 'អស់រឺនៅ', 'អស់ហើយនៅ', 'អស់អត់', 'អស់បង', 'អស់ចែ',
  'ហៅលេខ', 'ហៅកូដ', 'ហៅលេខកូដ', 'សុំមើល', 'មើលអាវ', 'មើលខោ', 'សុំមើលមួយ',
  'លក់យ៉ាងម៉េច', 'មិចដែរ', 'ប៉ុន្មានបង', 'ប៉ុន្មានចែ', 'សល់ប៉ុន្មាន', 'មានសល់',
  'ពាក់បានអត់', 'គីឡូពាក់បាន', 'មានពណ៌អី', 'មានសាយអី', 'មានsize'
];

const KHMER_DIGITS_MAP: Record<string, string> = {
  '០': '0', '១': '1', '២': '2', '៣': '3', '៤': '4',
  '៥': '5', '៦': '6', '៧': '7', '៨': '8', '៩': '9'
};

const ACTION_WORDS = ['យក', 'យល', 'ចង់បាន', 'កាត់', 'សុំ', 'ថែម', 'ដាក់', 'កក់', 'បូក', 'សុំយក'];

const SIZE_COLOR_SUFFIXES = [
  'XXL', 'XXS', '4XL', '3XL', '2XL', 'XL', 'XS', 'M', 'L', 'S',
  'ស', 'ខ្មៅ', 'ក្រហម', 'ខៀវ', 'លឿង', 'ផ្កាឈូក', 'ស្វាយ', 'បៃតង', 'ត្នោត', 'ប្រផេះ', 'ទឹកដោះគោ', 'សូកូឡា', 'កាហ្វេ', 'ឈាមជ្រូក'
];

const RE_PRICE_CLEANUP = /(?:\d+[\.,]\d+\s*[$៛]|\b\d+\s*[$៛]|\b\d{4,}\s*(?:រៀល|៛)?\b)/gi;
const RE_MEASUREMENTS_CLEANUP = /(?:\d*\s*(?:kg|kilo|គីឡូ|គីឡូក្រាម|គក)\s*\d*|កម្ពស់\s*\d{2,3}|ចង្កេះ\s*[:=\s]*\d{2}|(?:សាយ|size)\s*[:=\s]*\d{2}|1\.[4-9]\d?\s*(?:m|ម៉ែត្រ)?\b)/gi;
const RE_ADDRESS_NUMBERS_CLEANUP = /(?:ផ្លូវ(?:លេខ)?\s*\d+[A-Za-z]?|ផ្ទះ(?:លេខ)?\s*\d+|ផ្សារ\s*\d+|បុរី\s*[\u1780-\u17FFa-zA-Z0-9_]+\s*\d+)/gi;

const KHMER_BOUND_AFTER = '(?=[^\\u1780-\\u17FFa-zA-Z0-9]|$)';
const KHMER_BOUND_BEFORE = '(?<=[^\\u1780-\\u17FFa-zA-Z0-9]|^)';

export function convertKhmerDigitsToArabic(text: string): string {
  if (!text) return '';
  return text.replace(/[០-៩]/g, ch => KHMER_DIGITS_MAP[ch] || ch);
}

export function normalizeKhmerText(text: string): string {
  if (!text) return '';
  let s = text.trim();

  s = s.replace(/(\d{3,4})\s*\n\s*(\d{3,6})/g, '$1$2');
  s = convertKhmerDigitsToArabic(s);

  s = s.replace(/ឆុត/g, 'ឈុត')
       .replace(/កូត|ខូត|កូក/g, 'កូដ')
       .replace(/យល/g, 'យក');

  // Replace Khmer word numbers ONLY when paired with action verbs or code
  // Pattern 1: Action + Code + NumberWord -> Code=Qty (e.g. "យក 47 ពីរ" -> "47=2")
  s = s.replace(new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*([A-Za-z0-9]{1,5})\\s*ប្រាំបួន${KHMER_BOUND_AFTER}`, 'gi'), '$1=9 ')
       .replace(new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*([A-Za-z0-9]{1,5})\\s*ប្រាំបី${KHMER_BOUND_AFTER}`, 'gi'), '$1=8 ')
       .replace(new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*([A-Za-z0-9]{1,5})\\s*ប្រាំពីរ${KHMER_BOUND_AFTER}`, 'gi'), '$1=7 ')
       .replace(new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*([A-Za-z0-9]{1,5})\\s*ប្រាំមួយ${KHMER_BOUND_AFTER}`, 'gi'), '$1=6 ')
       .replace(new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*([A-Za-z0-9]{1,5})\\s*ប្រាំ${KHMER_BOUND_AFTER}`, 'gi'), '$1=5 ')
       .replace(new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*([A-Za-z0-9]{1,5})\\s*បួន${KHMER_BOUND_AFTER}`, 'gi'), '$1=4 ')
       .replace(new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*([A-Za-z0-9]{1,5})\\s*បី${KHMER_BOUND_AFTER}`, 'gi'), '$1=3 ')
       .replace(new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*([A-Za-z0-9]{1,5})\\s*ពីរ${KHMER_BOUND_AFTER}`, 'gi'), '$1=2 ')
       .replace(new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*([A-Za-z0-9]{1,5})\\s*(?:មួយ|មូយ)${KHMER_BOUND_AFTER}`, 'gi'), '$1=1 ');

  // Pattern 2: Code + យក + NumberWord -> Code=Qty (e.g. "47 យក ពីរ" -> "47=2")
  s = s.replace(new RegExp(`([A-Za-z0-9]{1,5})\\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\\s*ប្រាំបួន${KHMER_BOUND_AFTER}`, 'gi'), '$1=9 ')
       .replace(new RegExp(`([A-Za-z0-9]{1,5})\\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\\s*ប្រាំបី${KHMER_BOUND_AFTER}`, 'gi'), '$1=8 ')
       .replace(new RegExp(`([A-Za-z0-9]{1,5})\\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\\s*ប្រាំពីរ${KHMER_BOUND_AFTER}`, 'gi'), '$1=7 ')
       .replace(new RegExp(`([A-Za-z0-9]{1,5})\\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\\s*ប្រាំមួយ${KHMER_BOUND_AFTER}`, 'gi'), '$1=6 ')
       .replace(new RegExp(`([A-Za-z0-9]{1,5})\\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\\s*ប្រាំ${KHMER_BOUND_AFTER}`, 'gi'), '$1=5 ')
       .replace(new RegExp(`([A-Za-z0-9]{1,5})\\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\\s*បួន${KHMER_BOUND_AFTER}`, 'gi'), '$1=4 ')
       .replace(new RegExp(`([A-Za-z0-9]{1,5})\\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\\s*បី${KHMER_BOUND_AFTER}`, 'gi'), '$1=3 ')
       .replace(new RegExp(`([A-Za-z0-9]{1,5})\\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\\s*ពីរ${KHMER_BOUND_AFTER}`, 'gi'), '$1=2 ')
       .replace(new RegExp(`([A-Za-z0-9]{1,5})\\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\\s*(?:មួយ|មូយ)${KHMER_BOUND_AFTER}`, 'gi'), '$1=1 ');

  s = s.replace(/\*{3,}/g, ' ');
  return s;
}

const RE_CAMBODIAN_PHONE = /(?:\+?855[\s.\-()]*|0)(?:1\d|3[18]|6[016-9]|7[016-9]|8[15-9]|9[0-8])(?:[\s.\-()]*\d){6,7}(?!\d)/i;

export function extractPhoneNumber(text: string): { phone: string | null; cleanText: string } {
  if (!text) return { phone: null, cleanText: text };

  const normalized = convertKhmerDigitsToArabic(text);
  const match = normalized.match(RE_CAMBODIAN_PHONE);

  if (match) {
    const matchedStr = match[0];
    const matchIndex = match.index ?? normalized.indexOf(matchedStr);
    const matchLength = matchedStr.length;

    let digits = matchedStr.replace(/\D/g, '');
    if (digits.startsWith('855')) {
      digits = '0' + digits.slice(3);
    }

    if ((digits.length === 8 || digits.length === 9 || digits.length === 10) && digits.startsWith('0')) {
      const cleanText = (text.substring(0, matchIndex) + ' ' + text.substring(matchIndex + matchLength))
        .replace(/\s+/g, ' ')
        .trim();
      return { phone: digits, cleanText };
    }
  }

  return { phone: null, cleanText: text };
}

export function isQuestionComment(text: string): boolean {
  if (!text) return false;
  const norm = convertKhmerDigitsToArabic(text);

  // If comment has explicit order syntax like "47=2", "47:1", "47/2", it is an order, not a pure question
  if (/(?:កូដ\s*)?[A-Za-z0-9]{1,5}\s*[:=]\s*\d{1,2}/.test(norm)) return false;

  const lower = norm.toLowerCase();
  for (const kw of QUESTION_KEYWORDS) {
    if (lower.includes(kw)) {
      const hasAction = ACTION_WORDS.some(act => lower.includes(act));
      if (!hasAction) return true;
    }
  }
  return false;
}

export interface ExtractedItemPair {
  code: string;
  qty: number;
}

export function extractCodeQtyPairs(text: string, liveId?: string): ExtractedItemPair[] {
  if (!text) return [];
  if (isQuestionComment(text)) return [];

  let s = normalizeKhmerText(text);

  const { cleanText: textWithoutPhone } = extractPhoneNumber(s);
  s = textWithoutPhone;

  s = s.replace(RE_MEASUREMENTS_CLEANUP, ' ');
  s = s.replace(RE_PRICE_CLEANUP, ' ');
  s = s.replace(RE_ADDRESS_NUMBERS_CLEANUP, ' ');

  // 🎯 Normalize Cambodian live selling order patterns to standard CODE=QTY format:
  // 1. Double/single dot: "47..5", "47.1" -> "47=5", "47=1"
  s = s.replace(/(?<!\d)(?!1\.[4-9]\d)(\d{1,4}|[A-Za-z]\d{1,3})\.{1,3}(\d{1,2})(?!\d)/g, '$1=$2');
  // 2. Slashes: "47/2", "47//2" -> "47=2"
  s = s.replace(/(?<!\d)(\d{1,4}|[A-Za-z]\d{1,3})\/+(\d{1,2})(?!\d)/g, '$1=$2');
  // 3. Action words: "47 យក 2", "47យក3", "47 យក ២ពណ៌" -> "47=2"
  s = s.replace(/(?<!\d)(\d{1,4}|[A-Za-z]\d{1,3})\s*(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\s*(\d{1,2})(?!\d)/gi, '$1=$2');
  // 4. Action prefix: "ថែម 47=1", "ថែម47=1", "យក 47=2" -> "47=1", "47=2"
  s = s.replace(/(?:ថែម|កាត់|កក់|ដាក់|យក)\s*(\d{1,4}|[A-Za-z]\d{1,3})\s*[:=]\s*(\d{1,2})/gi, '$1=$2');
  // 5. Code prefix: "កូដ 47 1", "កូដ47=2", "code 47 1" -> "47=1", "47=2"
  s = s.replace(/(?:កូដ|code)\s*(\d{1,4}|[A-Za-z]\d{1,3})\s*[:=\s]\s*(\d{1,2})(?!\d)/gi, '$1=$2');
  // 6. Action word before: "យក 47 2", "កាត់ 47 1" -> "47=2", "47=1"
  s = s.replace(/(?:ថែម|កាត់|កក់|ដាក់|យក)\s*(\d{1,4}|[A-Za-z]\d{1,3})\s+(\d{1,2})(?!\d)/gi, '$1=$2');

  const pairs: ExtractedItemPair[] = [];
  const seenCodes = new Set<string>();

  const targetLive = liveId || activeLiveId;
  const sortedCatalog = products
    .filter(p => (p.live_id || activeLiveId) === targetLive && p.code && p.code.trim().length > 0)
    .sort((a, b) => b.code.length - a.code.length);
  const catalogCodeSet = new Set(sortedCatalog.map(p => p.code.toUpperCase()));

  // 🌟 PASS 1: Extract all explicit patterns like CODE=QTY anywhere in the comment text!
  // e.g. "47=2", "47:1", "47=2លាយពណ៌", "បាត់ដំបង ។ 47=2ពណ៌", "47=2 46=1"
  const explicitGlobalRegex = /(?:(?<=^|[^\w])([A-Za-z0-9]{1,5})\s*[:=]\s*(\d{1,2})(?!\d))/gi;
  let match: RegExpExecArray | null;

  while ((match = explicitGlobalRegex.exec(s)) !== null) {
    const rawCode = match[1].toUpperCase().trim();
    const qty = parseInt(match[2], 10) || 1;

    // In Strict Mode, only accept codes in catalog; in Auto Mode, accept any valid alphanumeric code
    if (settings.parser_strict_catalog && !catalogCodeSet.has(rawCode)) {
      continue;
    }

    if (!COMMON_GREETINGS.has(rawCode) && !seenCodes.has(rawCode)) {
      pairs.push({ code: rawCode, qty });
      seenCodes.add(rawCode);
    }
  }

  // 🛡️ CRITICAL GUARD: If explicit CODE=QTY pairs were found, we are finished!
  // NEVER allow downstream catalog loops to treat the quantity (e.g. 1, 2, 3) as a product code!
  if (pairs.length > 0) {
    return pairs;
  }

  // 🌟 PASS 2: Loose code + qty separated by space (e.g. "47 2", "47 1 ខ្មៅ")
  // Only applies to 2-4 digit numbers or letter+digits to prevent single digit false positives
  const looseCodeQtyRegex = /(?<=^|[^\w])(\d{2,4}|[A-Za-z]\d{1,3})\s+(\d{1,2})(?!\d)/g;
  while ((match = looseCodeQtyRegex.exec(s)) !== null) {
    const rawCode = match[1].toUpperCase().trim();
    const qty = parseInt(match[2], 10) || 1;

    if (settings.parser_strict_catalog && !catalogCodeSet.has(rawCode)) {
      continue;
    }

    if (!COMMON_GREETINGS.has(rawCode) && !seenCodes.has(rawCode)) {
      pairs.push({ code: rawCode, qty });
      seenCodes.add(rawCode);
    }
  }

  if (pairs.length > 0) {
    return pairs;
  }

  // 🌟 PASS 3: Multi-size variants if present (e.g. "47 XL 2 L 1")
  const multiVariantRegex = /\b(XXL|XXS|4XL|3XL|2XL|XL|XS|[SML])\s*(\d{1,2})?\b/gi;
  const validSuffixes = SIZE_COLOR_SUFFIXES.join('|');

  // 🌟 PASS 4: Known Catalog matching for codes without explicit quantity (default qty = 1)
  const segments = s.split(/[\n;+,]+|\s+និង\s+|\s{2,}/i);

  for (let seg of segments) {
    seg = seg.trim();
    if (!seg) continue;

    for (const prod of sortedCatalog) {
      const pCode = prod.code.toUpperCase().trim();
      if (COMMON_GREETINGS.has(pCode) || seenCodes.has(pCode)) continue;

      const esc = pCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isSingleDigit = /^\d$/.test(pCode);

      // Single digit codes (1-9) MUST have explicit "កូដ" prefix or be part of code definition
      if (isSingleDigit) {
        const falseQtyPattern = new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់)?\\s*${esc}\\s*(?:អាវ|ខោ|ឈុត|កំប៉ុង|ពណ៌|ពណ)`, 'i');
        if (falseQtyPattern.test(seg) && !new RegExp(`(?:កូដ|កូដលេខ|CODE)\\s*${esc}\\b`, 'i').test(seg)) {
          continue;
        }
      }

      const codePattern = isSingleDigit
        ? `(?:កូដ|កូដលេខ|CODE)\\s*(${esc})(?!\\d)`
        : `(?<![A-Za-z0-9])(${esc})(?![A-Za-z0-9])`;

      const codeMatch = seg.match(new RegExp(codePattern, 'i'));
      if (!codeMatch) continue;

      // Check for multi-size variant quantities
      let varMatch: RegExpExecArray | null;
      let multiTotalQty = 0;
      const textAfterCode = seg.substring(codeMatch.index! + codeMatch[0].length);

      while ((varMatch = multiVariantRegex.exec(textAfterCode)) !== null) {
        const q = varMatch[2] ? (parseInt(varMatch[2], 10) || 1) : 1;
        multiTotalQty += q;
      }

      if (multiTotalQty > 0) {
        pairs.push({ code: pCode, qty: multiTotalQty });
        seenCodes.add(pCode);
        seg = '';
        break;
      }

      const reWithQty = new RegExp(
        `(?:(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*)?` +
        `(?<!\\d)(${esc})(?!\\d)` +
        `(?:[\\s_-]*(${validSuffixes}))?` +
        `(?:\\s*[:=xX*\\-_.,+«»~]|\\s*(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)|[\\s\\S]*?(?:យក|កាត់|ថែម|ដាក់|កក់|បូក))` +
        `\\s*(\\d{1,2})(?:\\s*(?:អាវ|ខោ|ឈុត|ពណ៌|ពណ))?`,
        'i'
      );

      const matchWithQty = seg.match(reWithQty);
      if (matchWithQty && matchWithQty[3]) {
        let rawQty = parseInt(matchWithQty[3], 10) || 1;
        pairs.push({ code: pCode, qty: rawQty });
        seenCodes.add(pCode);
        seg = '';
        break;
      }

      pairs.push({ code: pCode, qty: 1 });
      seenCodes.add(pCode);
      seg = '';
      break;
    }
  }

  // 🌟 PASS 5: Pure standalone product code in comment (e.g. "46", "57", "93", "48", "A1") with default qty = 1
  if (pairs.length === 0) {
    const standaloneMatch = s.match(/(?<=^|[^\w])(\d{2,4}|[A-Za-z]\d{1,3})(?=[^\w]|$)/);
    if (standaloneMatch) {
      const bareCode = standaloneMatch[1].toUpperCase().trim();
      if (!COMMON_GREETINGS.has(bareCode) && !seenCodes.has(bareCode) && !/^(គីឡូ|ខោ|អាវ|ឈុត|រៀល|ដុល្លារ)$/.test(bareCode)) {
        pairs.push({ code: bareCode, qty: 1 });
        seenCodes.add(bareCode);
      }
    }
  }

  return pairs;
}

export interface ParseCommentResult {
  status: 'SUCCESS' | 'IGNORED' | 'SOLD_OUT' | 'CONTACT_SAVED' | 'QUESTION_SAVED' | 'UNMATCHED_SAVED';
  message: string;
  invoice_id?: number;
  customer_name?: string;
  phone_number?: string;
  address?: string;
  allocated_items?: {
    code: string;
    product_name: string;
    quantity: number;
    price: number;
  }[];
  total_amount?: number;
}

const processedCommentKeys = new Set<string>();

export function parseAndAllocateComment(
  fbUserId: string,
  fbName: string,
  commentText: string,
  liveId: string = activeLiveId,
  commentId?: string,
  userPicUrl?: string
): ParseCommentResult {
  const cleanFbName = (fbName || 'អតិថិជន Facebook').trim();
  const rawText = (commentText || '').trim();

  if (
    fbUserId === '102094263212256' ||
    cleanFbName.toLowerCase().includes('kari arnett') ||
    rawText.includes('វិក្កយបត្រកន្ត្រក') ||
    rawText.includes('TOCH PROEL')
  ) {
    return { status: 'IGNORED', message: 'Bot Comment ត្រូវបានរំលង' };
  }

  if (!rawText) {
    return { status: 'IGNORED', message: 'Comment ទទេ' };
  }

  const { phone, cleanText } = extractPhoneNumber(rawText);
  const hasValidFbUserId = Boolean(fbUserId && fbUserId !== 'FB_USER_ID_STREAM' && fbUserId.trim() !== '');

  const savedCommentId = commentId || `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const signatureKey = `${liveId}_${(fbUserId || cleanFbName).toLowerCase()}_${rawText}`;

  // Safe invoice lookup helper: avoids merging two distinct users who happen to share the same name
  const existingInv = invoices.find(i => {
    if (i.live_id !== liveId) return false;
    if (i.status === 'Cancelled') return false;

    const invHasUserId = Boolean(i.facebook_user_id && i.facebook_user_id !== 'FB_USER_ID_STREAM' && i.facebook_user_id.trim() !== '');

    // 1. If both have valid facebook_user_id, they must match
    if (hasValidFbUserId && invHasUserId) {
      return i.facebook_user_id === fbUserId;
    }

    // 2. If phone is explicitly present in comment, match by normalized phone
    if (phone && i.phone_number && i.phone_number !== 'គ្មានលេខ' && !i.phone_number.includes('មិនទាន់មាន')) {
      const cleanInvPhone = i.phone_number.replace(/\D/g, '');
      const cleanCommentPhone = phone.replace(/\D/g, '');
      if (cleanInvPhone && cleanCommentPhone && cleanInvPhone === cleanCommentPhone) {
        return true;
      }
    }

    // 3. If neither has conflicting user ID, match by name
    if (i.facebook_name.toLowerCase() === cleanFbName.toLowerCase()) {
      if (hasValidFbUserId && invHasUserId && i.facebook_user_id !== fbUserId) {
        return false; // Two different Facebook accounts with the same display name! Keep separate!
      }
      return true;
    }

    return false;
  });

  const isAlreadyInBasket = existingInv && (
    (existingInv.comments && existingInv.comments.includes(rawText)) ||
    (existingInv.unmatched_comments && existingInv.unmatched_comments.includes(rawText)) ||
    (existingInv.items && existingInv.items.some(it => it.item_comment === rawText))
  );

  const isDuplicate =
    isAlreadyInBasket ||
    (commentId && processedCommentKeys.has(commentId)) ||
    processedCommentKeys.has(savedCommentId) ||
    processedCommentKeys.has(signatureKey) ||
    rawComments.some(rc => 
      (commentId && rc.comment_id === commentId) ||
      (rc.live_id === liveId && rc.facebook_name.toLowerCase() === cleanFbName.toLowerCase() && rc.comment_text.trim() === rawText)
    );

  if (isDuplicate) {
    return {
      status: 'IGNORED',
      message: `⏩ ខមិននេះបានបញ្ចូលរួចរាល់ហើយ ៖ «${cleanFbName}» "${rawText.slice(0, 20)}"`
    };
  }

  processedCommentKeys.add(savedCommentId);
  if (commentId) processedCommentKeys.add(commentId);
  processedCommentKeys.add(signatureKey);

  const newCommentEntry: CustomerComment = {
    comment_id: savedCommentId,
    live_id: liveId,
    facebook_user_id: fbUserId || 'FB_USER_ID_STREAM',
    facebook_name: cleanFbName,
    comment_text: rawText,
    created_at: new Date().toISOString(),
    picture_url: userPicUrl
  };
  rawComments.push(newCommentEntry);

  const { zone, label, detectedLocation, hasExplicitLocation } = detectDeliveryZone(rawText);

  // SAFE CUSTOMER DB LOOKUP:
  // 1. First priority: match by unique facebook_user_id
  let cust = hasValidFbUserId
    ? customers.find(c => c.facebook_user_id === fbUserId)
    : undefined;

  let isVerifiedIdCustomer = Boolean(cust);

  // 2. If not found by user_id, match by name ONLY if that customer doesn't have a different conflicting user_id
  if (!cust) {
    const nameMatch = customers.find(c => c.facebook_name.toLowerCase() === cleanFbName.toLowerCase());
    if (nameMatch) {
      const nameMatchHasOtherId = Boolean(nameMatch.facebook_user_id && nameMatch.facebook_user_id !== 'FB_USER_ID_STREAM' && nameMatch.facebook_user_id !== fbUserId);
      if (!nameMatchHasOtherId) {
        cust = nameMatch;
      }
    }
  }

  const initialCustAddress = hasExplicitLocation ? (detectedLocation || label) : undefined;

  if (!cust) {
    cust = {
      customer_id: customers.length + 1,
      facebook_user_id: fbUserId || 'FB_USER_ID_STREAM',
      facebook_name: cleanFbName,
      picture_url: userPicUrl,
      phone_number: phone || undefined,
      address: initialCustAddress,
      is_vip: false,
      is_blacklist: false,
      last_interaction_at: new Date().toISOString()
    };
    customers.push(cust);
    isVerifiedIdCustomer = hasValidFbUserId;
  } else {
    if (userPicUrl) cust.picture_url = userPicUrl;
    if (phone) cust.phone_number = phone;
    if (hasExplicitLocation && detectedLocation) {
      cust.address = detectedLocation;
    } else if (hasExplicitLocation && !cust.address) {
      cust.address = label;
    }
    if (hasValidFbUserId && (!cust.facebook_user_id || cust.facebook_user_id === 'FB_USER_ID_STREAM')) {
      cust.facebook_user_id = fbUserId;
      isVerifiedIdCustomer = true;
    }
    cust.last_interaction_at = new Date().toISOString();
  }

  const isQuestion = isQuestionComment(rawText);
  const pairs = extractCodeQtyPairs(cleanText, liveId);

  // Match open/unpacked invoice for this customer in this live session
  let inv = invoices.find(i => {
    if (i.live_id !== liveId) return false;
    if (i.status === 'Packed' || i.status === 'Dispatched' || i.status === 'Cancelled') return false;

    const invHasUserId = Boolean(i.facebook_user_id && i.facebook_user_id !== 'FB_USER_ID_STREAM' && i.facebook_user_id.trim() !== '');

    // 1. If both have valid facebook_user_id
    if (hasValidFbUserId && invHasUserId) {
      return i.facebook_user_id === fbUserId;
    }

    // 2. If phone is explicitly present in comment, match by normalized phone
    if (phone && i.phone_number && i.phone_number !== 'គ្មានលេខ' && !i.phone_number.includes('មិនទាន់មាន')) {
      const cleanInvPhone = i.phone_number.replace(/\D/g, '');
      const cleanCommentPhone = phone.replace(/\D/g, '');
      if (cleanInvPhone && cleanCommentPhone && cleanInvPhone === cleanCommentPhone) {
        return true;
      }
    }

    // 3. Match by name only if no conflicting user IDs
    if (i.facebook_name.toLowerCase() === cleanFbName.toLowerCase()) {
      if (hasValidFbUserId && invHasUserId && i.facebook_user_id !== fbUserId) {
        return false; // Two different Facebook accounts with the same display name! Separate baskets!
      }
      return true;
    }

    return false;
  });

  if (isQuestion || pairs.length === 0) {
    if (inv) {
      newCommentEntry.invoice_id = inv.invoice_id;
      inv.last_comment_id = savedCommentId;
      if (!inv.comment_ids) inv.comment_ids = [];
      if (!inv.comment_ids.includes(savedCommentId)) inv.comment_ids.push(savedCommentId);

      if (!inv.comments) inv.comments = [];
      if (!inv.comments.includes(rawText)) inv.comments.push(rawText);
      if (!inv.unmatched_comments) inv.unmatched_comments = [];
      if (!inv.unmatched_comments.includes(rawText)) inv.unmatched_comments.push(rawText);

      if (hasExplicitLocation) {
        inv.location_zone = zone;
        inv.location_label = label;
        if (detectedLocation) {
          if (!inv.address || inv.address.includes('មិនទាន់មាន') || inv.address === '🏙️ ភ្នំពេញ' || inv.address === 'ភ្នំពេញ' || inv.address === '🏞️ តាមខេត្ត') {
            inv.address = detectedLocation;
          }
        }
      }

      recalculateInvoice(inv);
      bumpDataRevision();
    }

    return {
      status: isQuestion ? 'QUESTION_SAVED' : 'UNMATCHED_SAVED',
      message: `💬 កត់ត្រាខមិន${isQuestion ? 'សួរ' : ''} (មិនមានកូដទំនិញត្រូវ) ៖ «${cleanFbName}» ៖ "${rawText}"`,
      customer_name: cleanFbName,
      phone_number: phone || (isVerifiedIdCustomer ? cust.phone_number : undefined),
      address: isVerifiedIdCustomer ? cust.address : undefined
    };
  }

  if (!inv) {
    const nextId = invoices.length > 0 ? Math.max(...invoices.map(i => i.invoice_id)) + 1 : 101;

    // SAFE AUTOFILL RULE:
    // Only autofill phone & address from DB if:
    // 1. The customer record has a VERIFIED Facebook User ID match (preventing wrong autofill when 2 people share the same name like "អា លីន")
    // OR
    // 2. The phone / location is explicitly stated in the CURRENT comment.
    const canAutofillFromSavedCust = isVerifiedIdCustomer && Boolean(cust?.phone_number || cust?.address);

    let resolvedPhone = phone || (canAutofillFromSavedCust ? cust?.phone_number : undefined) || 'គ្មានលេខ';
    let resolvedAddress = '⚠️ មិនទាន់មានអាសយដ្ឋាន';
    let resolvedZone: DeliveryZone = 'UNKNOWN';
    let resolvedLabel = '❓ មិនទាន់ដឹង';

    const custHasSavedAddr = canAutofillFromSavedCust && cust?.address && !cust.address.includes('មិនទាន់មាន') && cust.address !== '⚠️ មិនទាន់មានអាសយដ្ឋាន';

    if (hasExplicitLocation) {
      resolvedAddress = detectedLocation || label;
      resolvedZone = zone;
      resolvedLabel = label;
    } else if (custHasSavedAddr) {
      resolvedAddress = cust!.address!;
      const custZoneRes = detectDeliveryZone(resolvedAddress);
      resolvedZone = custZoneRes.zone;
      resolvedLabel = custZoneRes.label;
    }

    inv = {
      invoice_id: nextId,
      basket_no: nextId,
      live_id: liveId,
      created_at: new Date().toISOString(),
      facebook_user_id: fbUserId || 'FB_USER_ID_STREAM',
      facebook_name: cleanFbName,
      picture_url: userPicUrl || cust?.picture_url,
      phone_number: resolvedPhone,
      address: resolvedAddress,
      location_zone: resolvedZone,
      location_label: resolvedLabel,
      total_amount: 0,
      status: 'Pending',
      packing_stage: 'UNPICKED',
      msg_status: 'UNSENT',
      last_comment_id: savedCommentId,
      comment_ids: [savedCommentId],
      items: [],
      comments: [rawText],
      unmatched_comments: []
    };
    newCommentEntry.invoice_id = inv.invoice_id;
    invoices.unshift(inv);
  } else {
    newCommentEntry.invoice_id = inv.invoice_id;
    inv.last_comment_id = savedCommentId;
    if (!inv.comment_ids) inv.comment_ids = [];
    if (!inv.comment_ids.includes(savedCommentId)) inv.comment_ids.push(savedCommentId);

    if (userPicUrl && !inv.picture_url) inv.picture_url = userPicUrl;
    if (phone && (!inv.phone_number || inv.phone_number === 'គ្មានលេខ')) inv.phone_number = phone;
    
    if (hasExplicitLocation) {
      inv.location_zone = zone;
      inv.location_label = label;
      if (detectedLocation) {
        if (!inv.address || inv.address.includes('មិនទាន់មាន') || inv.address === '🏙️ ភ្នំពេញ' || inv.address === 'ភ្នំពេញ' || inv.address === '🏞️ តាមខេត្ត') {
          inv.address = detectedLocation;
        }
      } else if (!inv.address || inv.address.includes('មិនទាន់មាន')) {
        inv.address = label;
      }
    } else if (isVerifiedIdCustomer && (!inv.address || inv.address.includes('មិនទាន់មាន')) && cust?.address && !cust.address.includes('មិនទាន់មាន')) {
      inv.address = cust.address;
      const custZoneRes = detectDeliveryZone(cust.address);
      inv.location_zone = custZoneRes.zone;
      inv.location_label = custZoneRes.label;
    }
    if (!inv.comments) inv.comments = [];
    if (!inv.comments.includes(rawText)) inv.comments.push(rawText);
  }

  const allocated: { code: string; product_name: string; quantity: number; price: number }[] = [];
  const soldOut: string[] = [];

  for (const pair of pairs) {
    let prod = products.find(
      p => (p.live_id || activeLiveId) === liveId && p.code.toUpperCase() === pair.code.toUpperCase()
    );

    if (!prod) {
      if (settings.parser_strict_catalog) {
        continue;
      }
      const nextId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      prod = {
        id: nextId,
        code: pair.code.toUpperCase(),
        name: `កូដ ${pair.code.toUpperCase()}`,
        stock_qty: 200,
        price: 0,
        cost_price: 0,
        image_file: '',
        live_id: liveId
      };
      products.push(prod);
      saveDatabaseToDisk();
      bumpDataRevision();
    }

    if (prod.stock_qty <= 0) {
      soldOut.push(prod.code);
      continue;
    }

    const qtyToTake = Math.min(pair.qty, prod.stock_qty);
    prod.stock_qty -= qtyToTake;

    const existingItem = inv.items.find(
      it => it.product_code.toUpperCase() === prod.code.toUpperCase()
    );

    if (existingItem) {
      existingItem.quantity += qtyToTake;
      existingItem.is_packed = false;

      if (rawText && existingItem.item_comment !== rawText) {
        if (!existingItem.item_comment) {
          existingItem.item_comment = rawText;
        } else if (!existingItem.item_comment.includes(rawText)) {
          existingItem.item_comment += ` | ${rawText}`;
        }
      }
    } else {
      const nextItemId = inv.items.length > 0 ? Math.max(...inv.items.map(it => it.id)) + 1 : 1;
      inv.items.push({
        id: nextItemId,
        invoice_id: inv.invoice_id,
        product_id: prod.id,
        product_code: prod.code,
        product_name: prod.name,
        quantity: qtyToTake,
        price: prod.price,
        is_packed: false,
        item_comment: rawText,
        image_file: prod.image_file || ''
      });
    }

    allocated.push({
      code: prod.code,
      product_name: prod.name,
      quantity: qtyToTake,
      price: prod.price
    });
  }

  recalculateInvoice(inv);
  bumpDataRevision();

  if (allocated.length === 0 && soldOut.length > 0) {
    if (!inv.unmatched_comments) inv.unmatched_comments = [];
    if (!inv.unmatched_comments.includes(rawText)) inv.unmatched_comments.push(rawText);

    return {
      status: 'SOLD_OUT',
      message: `⚠️ កូដ [${soldOut.join(', ')}] អស់ស្តុកហើយ!`,
      invoice_id: inv.invoice_id,
      customer_name: cleanFbName
    };
  }

  if (allocated.length > 0) {
    const summary = allocated.map(a => `[${a.code}x${a.quantity}]`).join(' ');
    return {
      status: 'SUCCESS',
      message: `✅ បានកាត់ ${summary} ចូលកន្ត្រក #${inv.basket_no} របស់ «${cleanFbName}»`,
      invoice_id: inv.invoice_id,
      customer_name: cleanFbName,
      phone_number: inv.phone_number,
      address: inv.address,
      allocated_items: allocated,
      total_amount: inv.total_amount
    };
  }

  return {
    status: 'UNMATCHED_SAVED',
    message: `💬 បានរក្សាទុកខមិន ៖ "${rawText}"`,
    invoice_id: inv.invoice_id,
    customer_name: cleanFbName
  };
}