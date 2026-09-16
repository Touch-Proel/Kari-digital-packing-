import {
  products,
  invoices,
  customers,
  rawComments,
  recalculateInvoice,
  bumpDataRevision,
  activeLiveId
} from './db';
import { DeliveryZone, Invoice, OrderItem } from './types';
import { detectDeliveryZone } from './locationHelper';

export { detectDeliveryZone };

const COMMON_GREETINGS = new Set([
  'HI', 'HELLO', 'BONG', 'OK', 'YES', 'NO', 'PRICE', 'INBOX',
  'ADMIN', 'SL', 'SLL', 'SLSL', 'LIKE', 'LOVE', 'CAN', 'HOW', 'TWA',
  'CHHAT', 'JAE', 'AKUN', 'ORKUN', 'SLJAE', 'SLBONG', 'GOOD'
]);

const QUESTION_KEYWORDS = [
  'អត់', 'មាន', 'ប៉ុន្មាន', 'ថ្លៃ', 'តម្លៃ', 'ពាក់', 'ពាក់បាន',
  'សាច់', 'សល់', 'មានអត់', 'អត់បង', 'អត់ចែ', 'ថ្លៃប៉ុន្មាន',
  'លក់', 'លក់ម៉េច', 'ម៉េច', 'ម៉េចដែរ', 'ចុះ', 'បញ្ចុះ',
  'ត្រូវ', 'ត្រូវថ្លៃ', 'សួរ', 'ចង់សួរ', 'មានកូន', 'មេីល', 'មើល',
  'ម៉ាន', 'រឺ', 'ឬ', 'នៅអត់', 'នៅទេ', 'ពាក់ត្រូវ'
];

const KHMER_DIGITS_MAP: Record<string, string> = {
  '០': '0', '១': '1', '២': '2', '៣': '3', '៤': '4',
  '៥': '5', '៦': '6', '៧': '7', '៨': '8', '៩': '9'
};

const KHMER_WORD_NUMBERS: [string, number][] = [
  ['ប្រាំបួន', 9], ['ប្រាំបី', 8], ['ប្រាំពីរ', 7], ['ប្រាំមួយ', 6],
  ['ប្រាំ', 5], ['បួន', 4], ['បី', 3], ['ពីរ', 2], ['មួយ', 1], ['មូយ', 1], ['ដប់', 10]
];

const ACTION_WORDS = ['យក', 'យល', 'ចង់បាន', 'កាត់', 'សុំ', 'ថែម', 'ដាក់', 'កក់', 'បូក', 'សុំយក'];

export function normalizeKhmerText(text: string): string {
  if (!text) return '';
  let s = text.trim();

  // Replace common typos for 'កូដ' (Code) and 'សាយ' (Size)
  s = s.replace(/ឆុត/g, 'ឈុត')
       .replace(/កូត/g, 'កូដ')
       .replace(/ខូត/g, 'កូដ')
       .replace(/កូន\s*(?=\d)/g, 'កូដ ')
       .replace(/កូនលេខ/g, 'កូដលេខ')
       .replace(/រឿងកូដ/g, 'កូដ')
       .replace(/យល/g, 'យក')
       .replace(/ស្តាយ(?=\s*[A-Za-z])/gi, 'សាយ')
       .replace(/[×✕✖]/g, 'x');

  // Insert space between Arabic code and Khmer digit + unit word (e.g., "78២ឈុត" -> "78 2 ឈុត")
  s = s.replace(/([A-Za-z0-9]{1,5})([០-៩]+)\s*(ឈុត|អាវ|គូ|គូរ|រូប|កញ្ចប់|ដុំ)/g, '$1 $2 $3');

  // Split Khmer digits concatenated like "១០៨១០" -> "108 10" when 5 digits start with 3-digit code + 2-digit qty
  s = s.replace(/([១-៩][០-៩]{2})([១-៩០][០-៩]?)\b/g, (_m, g1, g2) => {
    const d1 = convertKhmerDigitsToArabic(g1);
    const d2 = convertKhmerDigitsToArabic(g2);
    return `${d1} ${d2}`;
  });

  // Convert Khmer digits to Arabic
  for (const [kh, ar] of Object.entries(KHMER_DIGITS_MAP)) {
    s = s.split(kh).join(ar);
  }

  // Split Arabic 5 digits concatenated like "10810" -> "108 10" or "11510" -> "115 10"
  s = s.replace(/\b([1-9]\d{2})(10|20|30|40|50|[1-9])\b/g, '$1 $2');

  // Convert "ពី" to "2" ONLY when preceded by an action verb (e.g. "យកពី" -> "យក 2")
  s = s.replace(/(យក|ថែម|កាត់|ដាក់|កក់|សុំ)\s*ពី(?![[\u1780-\u17FF])/g, '$1 2');

  for (const [word, num] of KHMER_WORD_NUMBERS) {
    s = s.split(word).join(` ${num} `);
  }
  return s;
}

export function convertKhmerDigitsToArabic(text: string): string {
  if (!text) return '';
  return text.replace(/[០-៩]/g, ch => KHMER_DIGITS_MAP[ch] || ch);
}

// Cambodian mobile prefixes for 9-digit (e.g. 012345678) and 10-digit (e.g. 0961234567) numbers
const CAMBODIA_MOBILE_PREFIXES = '(?:10|11|12|13|14|15|16|17|18|31|38|60|61|66|67|68|69|70|71|76|77|78|81|85|86|87|88|89|90|92|93|95|96|97|98|99)';

// 1. Phone number starting with 0 or +855 or 855
const RE_CAMBODIA_STANDARD = new RegExp(`(?:\\+?855[\\s.\\-()]*|0)${CAMBODIA_MOBILE_PREFIXES}(?:[\\s.\\-()]*\\d){6,7}\\b`, 'i');

// 2. Phone number preceded by a quantity digit without space (e.g. "3089331833" = qty 3 + phone 089331833)
const RE_CAMBODIA_ATTACHED_QTY = new RegExp(`\\b[1-9]\\d?(0${CAMBODIA_MOBILE_PREFIXES}\\d{6,7})\\b`, 'i');

// 3. Spaced phone numbers like "070 40 41 69" or "015 88 42 38"
const RE_CAMBODIA_SPACED = new RegExp(`\\b0${CAMBODIA_MOBILE_PREFIXES}\\s+\\d{2,3}\\s+\\d{2,3}\\s+\\d{2,3}\\b`, 'i');

// 4. 9-digit Cambodian phone number missing leading 0 (e.g. "768949962" -> "0768949962")
const RE_CAMBODIA_MISSING_ZERO = new RegExp(`\\b(${CAMBODIA_MOBILE_PREFIXES}\\d{6,7})\\b`, 'i');

export function extractPhoneNumber(text: string): { phone: string | null; cleanText: string } {
  if (!text) return { phone: null, cleanText: text };

  // Convert Khmer digits (០-៩) to Arabic digits (0-9)
  let normalized = convertKhmerDigitsToArabic(text);

  // Normalize dots or slashes attached right before '0' (e.g. "1.069926846" -> "1 069926846", "35.093868110" -> "35 093868110")
  normalized = normalized.replace(/(\d)\.(0[1-9]\d{7,8})/g, '$1 $2')
                         .replace(/\/(0[1-9]\d{7,8})/g, ' $1');

  // Match 1: Attached quantity + phone (e.g. "3089331833")
  const mAttached = normalized.match(RE_CAMBODIA_ATTACHED_QTY);
  if (mAttached && mAttached[1]) {
    const rawPhone = mAttached[1];
    const matchIndex = mAttached.index ?? normalized.indexOf(mAttached[0]);
    // Replace full match with just the attached quantity prefix
    const qtyPrefix = mAttached[0].slice(0, mAttached[0].length - rawPhone.length);
    const before = normalized.substring(0, matchIndex);
    const after = normalized.substring(matchIndex + mAttached[0].length);
    const cleanText = `${before} ${qtyPrefix} ${after}`.replace(/\s+/g, ' ').trim();
    return { phone: rawPhone, cleanText };
  }

  // Match 2: Spaced phone numbers (e.g. "070 40 41 69")
  const mSpaced = normalized.match(RE_CAMBODIA_SPACED);
  if (mSpaced) {
    const matchedStr = mSpaced[0];
    const digits = matchedStr.replace(/\D/g, '');
    const matchIndex = mSpaced.index ?? normalized.indexOf(matchedStr);
    const before = normalized.substring(0, matchIndex);
    const after = normalized.substring(matchIndex + matchedStr.length);
    const cleanText = `${before} ${after}`.replace(/\s+/g, ' ').trim();
    return { phone: digits, cleanText };
  }

  // Match 3: Standard phone number starting with 0 or +855
  const mStandard = normalized.match(RE_CAMBODIA_STANDARD);
  if (mStandard) {
    const matchedStr = mStandard[0];
    let digits = matchedStr.replace(/\D/g, '');
    if (digits.startsWith('855')) {
      digits = '0' + digits.slice(3);
    }
    const matchIndex = mStandard.index ?? normalized.indexOf(matchedStr);
    const before = normalized.substring(0, matchIndex).replace(/[\s_\-:=/,]+$/, '');
    const after = normalized.substring(matchIndex + matchedStr.length).replace(/^[\s_\-:=/,]+/, '');
    const cleanText = `${before} ${after}`.replace(/\s+/g, ' ').trim();
    return { phone: digits, cleanText };
  }

  // Match 4: 9-digit phone missing leading 0 (e.g. "768949962")
  const mMissing = normalized.match(RE_CAMBODIA_MISSING_ZERO);
  if (mMissing) {
    const matchedStr = mMissing[0];
    const digits = '0' + matchedStr.replace(/\D/g, '');
    if (digits.length === 9 || digits.length === 10) {
      const matchIndex = mMissing.index ?? normalized.indexOf(matchedStr);
      const before = normalized.substring(0, matchIndex);
      const after = normalized.substring(matchIndex + matchedStr.length);
      const cleanText = `${before} ${after}`.replace(/\s+/g, ' ').trim();
      return { phone: digits, cleanText };
    }
  }

  return { phone: null, cleanText: text };
}

/**
 * Extract Address/Location snippet from comment (e.g. "ទីតាំងផ្សារ115", "ផ្លូវ271", "ផ្ទះលេខ25")
 * and mask it out so numbers in addresses are never mistaken for product codes.
 */
export function extractAddressShield(text: string): { address: string | null; cleanText: string } {
  if (!text) return { address: null, cleanText: text };

  // Address pattern, excluding order action keywords
  const reAddr = /(?:ទីតាំង|ផ្ទះ\s*(?:លេខ|№)?|ផ្លូវ\s*(?:លេខ)?|ផ្លូវលំ|បន្ទប់\s*(?:លេខ)?|ផ្សារ|ភូមិ|ឃុំ|សង្កាត់|ខណ្ឌ|បុរី|st(?:reet|\.)?)\s*[:=]?\s*[\u1780-\u17FFA-Za-z0-9._\-\/]+(?:\s+[\u1780-\u17FFA-Za-z0-9._\-\/]+)*/gi;
  let foundAddr: string | null = null;
  const clean = text.replace(reAddr, (match) => {
    // Only shield if it does not contain explicit order action words or product codes like "121/1"
    if (!/(?:យក|កាត់|ថែម|ដាក់|កក់|\b\d+\/\d+\b|\b\d+=\d+\b)/.test(match)) {
      if (!foundAddr) foundAddr = match.trim();
      return ' ';
    }
    return match;
  });

  return { address: foundAddr, cleanText: clean.replace(/\s+/g, ' ').trim() };
}

/**
 * Extract weight in kg (e.g. "37គីឡូ54", "37 គីឡូ 54", "118គីឡូ68យក១", "55kg")
 * and remove it from text so weight numbers are never parsed as product codes or quantities.
 * Shields location "គីឡូលេខ" / "គីឡូទី" / "នៅគីឡូ" (Kilometer 10) from being misparsed as weight.
 */
export function extractWeight(text: string): { weight: string | null; cleanText: string } {
  if (!text) return { weight: null, cleanText: text };
  let weightVal: string | null = null;

  // Protect location terms like "គីឡូលេខ១០", "នៅគីឡូ10"
  let processText = text.replace(/(?:នៅ|ផ្លូវ|ស្តុប|ជិត|ពី)?\s*គីឡូ\s*(?:លេខ|ទី)?\s*\d+\b/g, (m) => {
    if (/នៅ|ផ្លូវ|ស្តុប|ជិត|លេខ|ទី/.test(m)) {
      return m.replace(/គីឡូ/g, 'KILOMETER_LOCATION');
    }
    return m;
  });

  // 1. Weight AFTER គីឡូ / kg (e.g. "37គីឡូ54", "37 គីឡូ 54", "118គីឡូ68", "គីឡូ 54", "kg 54")
  const reAfter = /(?:គីឡូ(?:ក្រាម)?|kilo|kgs?)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)(?![A-Za-z0-9])/gi;
  let clean = processText.replace(reAfter, (_match, g1) => {
    weightVal = `${g1}kg`;
    return ' ';
  });

  // 2. Weight BEFORE kg / គីឡូ (e.g. "55kg", "55 គីឡូ", "35/55kg")
  if (!weightVal) {
    const reBefore = /(?:^|[^\d])(\d{2,3}(?:\.\d+)?)\s*(?:គីឡូ(?:ក្រាម)?|kilo|kgs?)(?![A-Za-z0-9])/gi;
    clean = clean.replace(reBefore, (_match, g1) => {
      weightVal = `${g1}kg`;
      return ' ';
    });
  }

  // Restore protected location terms & remove leftover standalone weight words
  clean = clean.replace(/KILOMETER_LOCATION/g, 'គីឡូ').replace(/(?:គីឡូ(?:ក្រាម)?|kilo|kgs?)/gi, ' ');
  return { weight: weightVal, cleanText: clean.replace(/\s+/g, ' ').trim() };
}

export function isQuestionComment(text: string): boolean {
  if (!text) return false;
  // If it has explicit digit-connector-digit syntax like 30=2 or 30x2, it's not a question
  if (/\d\s*[*=:+\-«»]\s*\d|\d\s*[xX]\s*\d/.test(text)) return false;

  const lower = text.toLowerCase();

  // Size only question: "XLមានអត់", "size L មានអត់", "មាន XL អត់", "XL នៅអត់", "អាវលើខ្លួនលក់ម៉េច"
  if (/(?:size\s*)?(?:XS|S|M|L|XL|XXL|2XL|3XL)\s*(?:មានអត់|មានទេ|មាន|អត់|នៅ|សល់)/i.test(text)) {
    return true;
  }
  if (/(?:មាន|សល់|នៅ)\s*(?:size\s*)?(?:XS|S|M|L|XL|XXL|2XL|3XL)\b/i.test(text)) {
    return true;
  }

  for (const kw of QUESTION_KEYWORDS) {
    if (lower.includes(kw)) {
      const hasAction = ACTION_WORDS.some(act => lower.includes(act));
      if (!hasAction) return true;
    }
  }
  return false;
}

/**
 * Mask prices/amounts like "$2.5", "2.5$", "(2.7$)", "3000៛", "13000៛"
 * so price numbers are never mistaken for quantity or product codes.
 */
function maskPrices(text: string): string {
  if (!text) return text;
  return text.replace(/\(?\d+(?:\.\d+)?\s*[\$៛]\)?|\(?[\$៛]\s*\d+(?:\.\d+)?\)?/gi, ' ');
}

/**
 * Replace a substring match range with whitespace so downstream regexes cannot re-match it.
 */
function maskMatch(str: string, matchIndex: number, matchLength: number): string {
  return str.substring(0, matchIndex) + ' '.repeat(matchLength) + str.substring(matchIndex + matchLength);
}

export interface ExtractedPair {
  code: string;
  qty: number;
  size?: string;
}

export function extractCodeQtyPairs(text: string): ExtractedPair[] {
  if (!text) return [];

  // Check for cancellation / refusal phrases ("អត់យកទេ", "សុំអត់យក", "សុំលុប", "បោះបង់")
  if (/(?:អត់យក|មិនយក|សុំអត់យក|សុំលុប|បោះបង់)/i.test(text)) {
    return [];
  }

  const norm = normalizeKhmerText(text);
  const textNoPrices = maskPrices(norm);
  let clean = textNoPrices.toUpperCase().trim();
  const pairs: ExtractedPair[] = [];
  const seenCodes = new Set<string>();

  function addPair(rawCode: string, rawQty: string | number, sizeOption?: string) {
    const c = rawCode.trim().replace(/^\./, '').replace(/^[_\-:=«»]+|[_\-:=«»]+$/g, '');
    const q = typeof rawQty === 'number' ? rawQty : (parseInt(rawQty, 10) || 1);
    if (c && !COMMON_GREETINGS.has(c) && !seenCodes.has(c) && c.length <= 6) {
      // Exclude standalone telephone numbers
      if (/^0\d{8,9}$/.test(c)) return;
      pairs.push({ code: c, qty: q, size: sizeOption });
      seenCodes.add(c);
    }
  }

  let m: RegExpExecArray | null;

  // Pass 0: Quantity unit words attached to code: e.g. "78 2ឈុត", "132 3ឈុត", "87 20អាវ", "78 10គូរ", "49 2រូប"
  const reUnitWord = /(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})\s*(?:[*xX=:_\-\/,.\+«»~]|size|\/)?\s*(\d{1,3})\s*(?:ឈុត|ឆុត|អាវ|គូ|គូរ|រូប|កញ្ចប់|ដុំ|set|sets|pcs?)\b/gi;
  while ((m = reUnitWord.exec(clean)) !== null) {
    addPair(m[1], m[2]);
    clean = maskMatch(clean, m.index, m[0].length);
    reUnitWord.lastIndex = 0;
  }

  // Pass 1: Code with Size / Variant: e.g. "12xL", "12×L", "12 size L", "12 L", "48/1xL", "94sML"
  const reSizeCombo = /(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})\s*(?:[*xX=:_\-\/,.\+«»~]|size|\/)?\s*(SML|S\s*M\s*L|S\/M\/L)\b/gi;
  while ((m = reSizeCombo.exec(clean)) !== null) {
    addPair(m[1], 3); // 3 items (S, M, L)
    clean = maskMatch(clean, m.index, m[0].length);
    reSizeCombo.lastIndex = 0;
  }

  const reSize = /(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})\s*(?:[*xX=:_\-\/,.\+«»~]|size|\/)\s*([1-9]\d*)?\s*(?:[*xX=:_\-\/,.\+«»~]|size|\/)?\s*(XS|S|M|L|XL|XXL|2XL|3XL)\b/gi;
  while ((m = reSize.exec(clean)) !== null) {
    const codePart = m[1];
    const qtyPart = m[2] || '1';
    const sizePart = m[3];
    addPair(codePart, qtyPart, sizePart);
    clean = maskMatch(clean, m.index, m[0].length);
    reSize.lastIndex = 0;
  }

  // Pass 2: Explicit connector with quantity: e.g. "30=2", "30*2", "30x2", "30:2", "30-2", "36/1", "118_1", "40=2", "96«2", "85»2"
  const reConnector = /(?:ថែម|យក|កាត់|ដាក់|កក់)?\s*(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})\s*[*xX=:_\-\/,.\+«»~]\s*(\d{1,3})\b/g;
  while ((m = reConnector.exec(clean)) !== null) {
    addPair(m[1], m[2]);
    clean = maskMatch(clean, m.index, m[0].length);
    reConnector.lastIndex = 0;
  }

  // Pass 3: Khmer Action Word attached or spaced after code: "28 យក 2", "57យក1", "24យក 1", "119យក"
  const reCodeAction = /(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})\s*(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\s*(\d{1,3})?\b/g;
  while ((m = reCodeAction.exec(clean)) !== null) {
    addPair(m[1], m[2] || '1');
    clean = maskMatch(clean, m.index, m[0].length);
    reCodeAction.lastIndex = 0;
  }

  // Pass 4: Action word before code: "ថែម 57 យក 1" or "យក 119 2" or "ថែម 106"
  const reActionBefore = /(?:ថែម|យក|កាត់|ដាក់|កក់|បូក)\s*(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})(?:\s+(\d{1,3}))?\b/g;
  while ((m = reActionBefore.exec(clean)) !== null) {
    addPair(m[1], m[2] || '1');
    clean = maskMatch(clean, m.index, m[0].length);
    reActionBefore.lastIndex = 0;
  }

  // Pass 5: Spaced code and quantity: e.g. "30 2" or "A12 1"
  const reSpace = /\b([A-Za-z0-9]{1,5})\s+([1-9]\d?)\b/g;
  while ((m = reSpace.exec(clean)) !== null) {
    const c = m[1].trim();
    if (!COMMON_GREETINGS.has(c) && !seenCodes.has(c) && !/^\d{3,}$/.test(c)) {
      addPair(c, m[2]);
      clean = maskMatch(clean, m.index, m[0].length);
      reSpace.lastIndex = 0;
    }
  }

  // Pass 6: Standalone codes: e.g. "37", "17", "118", "40", "31M", "49M"
  const reStandalone = /\b([A-Za-z0-9]{1,5})\b/g;
  while ((m = reStandalone.exec(clean)) !== null) {
    const c = m[1].trim();
    if (!COMMON_GREETINGS.has(c) && !seenCodes.has(c) && !/^\d{7,}$/.test(c)) {
      addPair(c, '1');
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

// Memory cache of processed comment keys to prevent duplicate quantity additions when syncing comments
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

  if (!rawText) {
    return { status: 'IGNORED', message: 'Comment ទទេ' };
  }

  // Pipeline Step 1: Extract and shield phone number
  const { phone, cleanText: textAfterPhone } = extractPhoneNumber(rawText);

  // Pipeline Step 2: Extract and shield address location snippet
  const { address: detectedAddr, cleanText: textAfterAddr } = extractAddressShield(textAfterPhone);

  // Pipeline Step 3: Extract and shield customer weight (kg)
  const { weight: detectedWeight, cleanText: textAfterWeight } = extractWeight(textAfterAddr);

  // Deduplication check: Prevent re-allocating items if comment was fetched multiple times
  const savedCommentId = commentId || `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const signatureKey = `${liveId}_${(fbUserId || cleanFbName).toLowerCase()}_${rawText}`;

  // Check if this comment was already processed in customer's existing basket for this live session
  const existingInv = invoices.find(
    i => i.live_id === liveId &&
         i.status !== 'Cancelled' &&
         (
           (fbUserId && fbUserId !== 'FB_USER_ID_STREAM' && i.facebook_user_id === fbUserId) ||
           (i.facebook_name.toLowerCase() === cleanFbName.toLowerCase()) ||
           (phone && i.phone_number && i.phone_number.replace(/\D/g, '') === phone.replace(/\D/g, ''))
         )
  );

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

  // Permanently record into rawComments list & processed cache
  processedCommentKeys.add(savedCommentId);
  if (commentId) processedCommentKeys.add(commentId);
  processedCommentKeys.add(signatureKey);

  rawComments.push({
    comment_id: savedCommentId,
    live_id: liveId,
    facebook_user_id: fbUserId || 'FB_USER_ID_STREAM',
    facebook_name: cleanFbName,
    comment_text: rawText,
    created_at: new Date().toISOString(),
    picture_url: userPicUrl
  });

  const { zone, label } = detectDeliveryZone(rawText);
  const effectiveAddress = detectedAddr || (zone !== 'UNKNOWN' ? label : undefined);

  // Update or create customer profile
  let cust = customers.find(c => c.facebook_name.toLowerCase() === cleanFbName.toLowerCase());
  if (!cust) {
    cust = {
      customer_id: customers.length + 1,
      facebook_user_id: fbUserId || 'FB_USER_ID_STREAM',
      facebook_name: cleanFbName,
      picture_url: userPicUrl,
      phone_number: phone || undefined,
      address: effectiveAddress,
      is_vip: false,
      is_blacklist: false,
      last_interaction_at: new Date().toISOString()
    };
    customers.push(cust);
  } else {
    if (userPicUrl) cust.picture_url = userPicUrl;
    if (phone) cust.phone_number = phone;
    if (effectiveAddress && (!cust.address || cust.address.includes('មិនទាន់មាន'))) {
      cust.address = effectiveAddress;
    }
    cust.last_interaction_at = new Date().toISOString();
  }

  // Pipeline Step 4: Check if question comment
  const isQuestion = isQuestionComment(rawText);

  // Pipeline Step 5: Extract item codes & quantities from the cleaned string
  const pairs = extractCodeQtyPairs(textAfterWeight);

  // Find existing active basket for this customer in current live session
  let inv = invoices.find(
    i => i.live_id === liveId &&
         i.status !== 'Packed' &&
         i.status !== 'Dispatched' &&
         i.status !== 'Cancelled' &&
         (
           (fbUserId && fbUserId !== 'FB_USER_ID_STREAM' && i.facebook_user_id === fbUserId) ||
           (i.facebook_name.toLowerCase() === cleanFbName.toLowerCase()) ||
           (phone && i.phone_number && i.phone_number.replace(/\D/g, '') === phone.replace(/\D/g, ''))
         )
  );

  // Rule 1: Do NOT create empty baskets for customers who only ask questions or haven't ordered any product codes!
  if (isQuestion || pairs.length === 0) {
    if (inv) {
      if (!inv.comments) inv.comments = [];
      if (!inv.comments.includes(rawText)) inv.comments.push(rawText);
      if (!inv.unmatched_comments) inv.unmatched_comments = [];
      if (!inv.unmatched_comments.includes(rawText)) inv.unmatched_comments.push(rawText);
      recalculateInvoice(inv);
      bumpDataRevision();
    }

    return {
      status: isQuestion ? 'QUESTION_SAVED' : 'UNMATCHED_SAVED',
      message: `💬 កត់ត្រាខមិន${isQuestion ? 'សួរ' : ''} (មិនទាន់កាត់កន្ត្រក) ៖ «${cleanFbName}» ៖ "${rawText}"`,
      customer_name: cleanFbName,
      phone_number: phone || cust.phone_number,
      address: cust.address
    };
  }

  // Rule 2: Customer ordered product code(s) (pairs.length > 0) -> Create basket now if none exists!
  if (!inv) {
    const nextId = invoices.length > 0 ? Math.max(...invoices.map(i => i.invoice_id)) + 1 : 101;
    inv = {
      invoice_id: nextId,
      basket_no: nextId,
      live_id: liveId,
      created_at: new Date().toISOString(),
      facebook_user_id: fbUserId || 'FB_USER_ID_STREAM',
      facebook_name: cleanFbName,
      picture_url: userPicUrl || cust?.picture_url,
      phone_number: phone || cust.phone_number || 'គ្មានលេខ',
      address: effectiveAddress || cust.address || (zone !== 'UNKNOWN' ? label : '⚠️ មិនទាន់មានអាសយដ្ឋាន'),
      location_zone: zone !== 'UNKNOWN' ? zone : (cust.address && /ខេត្ត|សៀមរាប|បាត់ដំបង|កំពង់ចាម|កំពត|កណ្តាល|ស្វាយរៀង/i.test(cust.address) ? 'PROVINCE' : (cust.address && /ភ្នំពេញ|pp|ទួលគោក|ដូនពេញ|ចំការមន/i.test(cust.address) ? 'PP' : 'UNKNOWN')),
      location_label: zone !== 'UNKNOWN' ? label : (cust.address && /ខេត្ត|សៀមរាប|បាត់ដំបង|កំពង់ចាម|កំពត/i.test(cust.address) ? '🏞️ តាមខេត្ត' : (cust.address && /ភ្នំពេញ|pp|ទួលគោក|ដូនពេញ/i.test(cust.address) ? '🏙️ ភ្នំពេញ' : '❓ មិនទាន់ដឹង')),
      total_amount: 0,
      status: 'Pending',
      packing_stage: 'UNPICKED',
      msg_status: 'UNSENT',
      items: [],
      comments: [rawText],
      unmatched_comments: []
    };
    invoices.unshift(inv);
  } else {
    if (userPicUrl && !inv.picture_url) {
      inv.picture_url = userPicUrl;
    }
    if (phone && (!inv.phone_number || inv.phone_number === 'គ្មានលេខ')) {
      inv.phone_number = phone;
    }
    if (effectiveAddress && (!inv.address || inv.address.includes('មិនទាន់មាន'))) {
      inv.location_zone = zone !== 'UNKNOWN' ? zone : 'PP';
      inv.location_label = zone !== 'UNKNOWN' ? label : '🏙️ ភ្នំពេញ';
      inv.address = effectiveAddress;
    }
    if (!inv.comments) inv.comments = [];
    if (!inv.comments.includes(rawText)) {
      inv.comments.push(rawText);
    }
  }

  // Allocate items into customer's basket
  const allocated: { code: string; product_name: string; quantity: number; price: number }[] = [];
  const soldOut: string[] = [];

  for (const pair of pairs) {
    // Find product in catalog or auto-register new live product
    let prod = products.find(p => p.code.toUpperCase() === pair.code.toUpperCase());
    if (!prod) {
      const nextProdId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      prod = {
        id: nextProdId,
        code: pair.code.toUpperCase(),
        name: `កូដ [${pair.code.toUpperCase()}]${pair.size ? ` (${pair.size})` : ''}`,
        stock_qty: 100,
        price: 5.0,
        cost_price: 3.0
      };
      products.push(prod);
    }

    if (prod.stock_qty <= 0) {
      soldOut.push(prod.code);
      continue;
    }

    const qtyToTake = Math.min(pair.qty, prod.stock_qty);
    prod.stock_qty -= qtyToTake;

    // Build descriptive item note including size or weight if detected
    let itemNote = rawText;
    if (pair.size && !itemNote.includes(pair.size)) {
      itemNote += ` [Size ${pair.size}]`;
    }
    if (detectedWeight && !itemNote.includes(detectedWeight)) {
      itemNote += ` (ទម្ងន់: ${detectedWeight})`;
    }

    // Add or update item in invoice
    const existingItem = inv.items.find(it => it.product_code.toUpperCase() === prod.code.toUpperCase());
    if (existingItem) {
      existingItem.quantity += qtyToTake;
      existingItem.item_comment = itemNote;
      existingItem.is_packed = false;
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
        item_comment: itemNote,
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

  // If items could not be allocated (e.g. sold out), save comment to unmatched
  if (allocated.length === 0) {
    if (!inv.unmatched_comments) inv.unmatched_comments = [];
    if (!inv.unmatched_comments.includes(rawText)) {
      inv.unmatched_comments.push(rawText);
    }
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

  if (soldOut.length > 0) {
    return {
      status: 'SOLD_OUT',
      message: `⚠️ កូដ [${soldOut.join(', ')}] អស់ស្តុកហើយ! (បានរក្សាទុកខមិន)`,
      invoice_id: inv.invoice_id,
      customer_name: cleanFbName
    };
  }

  return {
    status: 'UNMATCHED_SAVED',
    message: `💬 បានរក្សាទុកខមិន ៖ "${rawText}"`,
    invoice_id: inv.invoice_id,
    customer_name: cleanFbName
  };
}
