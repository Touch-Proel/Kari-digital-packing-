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
  for (const [kh, ar] of Object.entries(KHMER_DIGITS_MAP)) {
    s = s.split(kh).join(ar);
  }
  s = s.replace(/ឆុត/g, 'ឈុត').replace(/កូត/g, 'កូដ').replace(/ខូត/g, 'កូដ').replace(/យល/g, 'យក');
  // Normalize multiplication symbols to x
  s = s.replace(/[×✕✖]/g, 'x');

  // Convert "ពី" to "2" ONLY when preceded by an action verb (e.g. "យកពី" -> "យក 2")
  // Do NOT convert standalone "ពី" because "ពីភ្នំពេញ", "សួរពី..." means "from"
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

// 7-Digit Subscriber Numbers (Total 10 Digits with leading 0)
const RE_CAMBODIA_7_DIGIT = /(?:\+?855[\s.\-()]*|0)(?:18|31|71|76|88|96|97)(?:[\s.\-()]*\d){7}\b/i;

// 6-Digit Subscriber Numbers (Total 9 Digits with leading 0)
const RE_CAMBODIA_6_DIGIT = /(?:\+?855[\s.\-()]*|0)(?:10|11|12|14|15|16|17|38|60|61|66|67|68|69|70|77|78|81|85|86|87|89|90|92|93|95|98|99)(?:[\s.\-()]*\d){6}\b/i;

// General Cambodian phone number fallback (9 or 10 digits starting with 0 or +855)
const RE_CAMBODIA_GENERAL = /(?:\+?855[\s.\-()]*|0)[1-9]\d(?:[\s.\-()]*\d){6,7}\b/i;

export function extractPhoneNumber(text: string): { phone: string | null; cleanText: string } {
  if (!text) return { phone: null, cleanText: text };

  // Convert Khmer digits (០-៩) to Arabic digits (0-9) preserving 1:1 character indices
  const normalized = convertKhmerDigitsToArabic(text);

  // Match in priority: 7-digit subscriber, 6-digit subscriber, then general fallback
  const match = normalized.match(RE_CAMBODIA_7_DIGIT)
             || normalized.match(RE_CAMBODIA_6_DIGIT)
             || normalized.match(RE_CAMBODIA_GENERAL);

  if (match) {
    const matchedStr = match[0];
    const matchIndex = match.index ?? normalized.indexOf(matchedStr);
    const matchLength = matchedStr.length;

    // Extract digits only
    let digits = matchedStr.replace(/\D/g, '');
    if (digits.startsWith('855')) {
      digits = '0' + digits.slice(3);
    }

    if ((digits.length === 9 || digits.length === 10) && digits.startsWith('0')) {
      // Strip trailing separators right before phone number (e.g. 17_0883784999 -> 17)
      const before = text.substring(0, matchIndex).replace(/[\s_\-:=/,]+$/, '');
      const after = text.substring(matchIndex + matchLength).replace(/^[\s_\-:=/,]+/, '');
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

  const reAddr = /(?:ទីតាំង|ផ្ទះ\s*(?:លេខ|№)?|ផ្លូវ\s*(?:លេខ)?|ផ្លូវលំ|បន្ទប់\s*(?:លេខ)?|ផ្សារ|ភូមិ|ឃុំ|សង្កាត់|ខណ្ឌ|បុរី|st(?:reet|\.)?)\s*[:=]?\s*[\u1780-\u17FFA-Za-z0-9._\-\/]+(?:\s+[\u1780-\u17FFA-Za-z0-9._\-\/]+)*/gi;
  let foundAddr: string | null = null;
  const clean = text.replace(reAddr, (match) => {
    // Only shield if it does not contain explicit order action words
    if (!/(?:យក|កាត់|ថែម|ដាក់|កក់)/.test(match)) {
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
 */
export function extractWeight(text: string): { weight: string | null; cleanText: string } {
  if (!text) return { weight: null, cleanText: text };
  let weightVal: string | null = null;

  // 1. Weight AFTER គីឡូ / kg (e.g. "37គីឡូ54", "37 គីឡូ 54", "118គីឡូ68", "គីឡូ 54", "kg 54")
  const reAfter = /(?:គីឡូ(?:ក្រាម)?|kilo|kgs?)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)(?![A-Za-z0-9])/gi;
  let clean = text.replace(reAfter, (_match, g1) => {
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

  // Remove any remaining standalone គីឡូ / kg words
  clean = clean.replace(/(?:គីឡូ(?:ក្រាម)?|kilo|kgs?)/gi, ' ');
  return { weight: weightVal, cleanText: clean.replace(/\s+/g, ' ').trim() };
}

export function isQuestionComment(text: string): boolean {
  if (!text) return false;
  // If it has explicit digit-connector-digit syntax like 30=2 or 30x2, it's not a question
  if (/\d\s*[*=:+\-]\s*\d|\d\s*[xX]\s*\d/.test(text)) return false;

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

  const norm = normalizeKhmerText(text);
  let clean = norm.toUpperCase().trim();
  const pairs: ExtractedPair[] = [];
  const seenCodes = new Set<string>();

  function addPair(rawCode: string, rawQty: string | number, sizeOption?: string) {
    const c = rawCode.trim().replace(/^\./, '').replace(/^[_\-:=]+|[_\-:=]+$/g, '');
    const q = typeof rawQty === 'number' ? rawQty : (parseInt(rawQty, 10) || 1);
    if (c && !COMMON_GREETINGS.has(c) && !seenCodes.has(c) && c.length <= 6) {
      // Exclude standalone telephone numbers
      if (/^0\d{8,9}$/.test(c)) return;
      pairs.push({ code: c, qty: q, size: sizeOption });
      seenCodes.add(c);
    }
  }

  // Pass 1: Code with Size / Variant: e.g. "12xL", "12×L", "12 size L", "12 L", "48/1xL"
  const reSize = /(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})\s*(?:[*xX=:_\-\/,.\+«»~]|size|\/)\s*([1-9]\d*)?\s*(?:[*xX=:_\-\/,.\+«»~]|size|\/)?\s*(XS|S|M|L|XL|XXL|2XL|3XL)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reSize.exec(clean)) !== null) {
    const codePart = m[1];
    const qtyPart = m[2] || '1';
    const sizePart = m[3];
    addPair(codePart, qtyPart, sizePart);
    clean = maskMatch(clean, m.index, m[0].length);
    reSize.lastIndex = 0;
  }

  // Pass 2: Explicit connector with quantity: e.g. "30=2", "30*2", "30x2", "30:2", "30-2", "36/1", "118_1", "40=2"
  const reConnector = /(?:ថែម|យក|កាត់|ដាក់|កក់)?\s*(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})\s*[*xX=:_\-\/,.\+«»~]\s*(\d{1,2})\b/g;
  while ((m = reConnector.exec(clean)) !== null) {
    addPair(m[1], m[2]);
    clean = maskMatch(clean, m.index, m[0].length);
    reConnector.lastIndex = 0;
  }

  // Pass 3: Khmer Action Word attached or spaced after code: "28 យក 2", "57យក1", "24យក 1", "119យក"
  const reCodeAction = /(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})\s*(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\s*(\d{1,2})?\b/g;
  while ((m = reCodeAction.exec(clean)) !== null) {
    addPair(m[1], m[2] || '1');
    clean = maskMatch(clean, m.index, m[0].length);
    reCodeAction.lastIndex = 0;
  }

  // Pass 4: Action word before code: "ថែម 57 យក 1" or "យក 119 2" or "ថែម 106"
  const reActionBefore = /(?:ថែម|យក|កាត់|ដាក់|កក់|បូក)\s*(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})(?:\s+(\d{1,2}))?\b/g;
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
