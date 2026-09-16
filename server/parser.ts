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
  'ត្រូវ', 'ត្រូវថ្លៃ', 'សួរ', 'ចង់សួរ', 'មានកូន', 'មេីល', 'មើល'
];

const KHMER_DIGITS_MAP: Record<string, string> = {
  '០': '0', '១': '1', '២': '2', '៣': '3', '៤': '4',
  '៥': '5', '៦': '6', '៧': '7', '៨': '8', '៩': '9'
};

const ACTION_WORDS = ['យក', 'យល', 'ចង់បាន', 'កាត់', 'សុំ', 'ថែម', 'ដាក់', 'កក់', 'បូក', 'សុំយក'];

const SIZE_COLOR_SUFFIXES = [
  'XXL', 'XXS', 'XL', 'XS', 'M', 'L', 'S',
  'ស', 'ខ្មៅ', 'ក្រហម', 'ខៀវ', 'លឿង', 'ផ្កាឈូក', 'ស្វាយ', 'បៃតង', 'ត្នោត', 'ប្រផេះ'
];

export function convertKhmerDigitsToArabic(text: string): string {
  if (!text) return '';
  return text.replace(/[០-៩]/g, ch => KHMER_DIGITS_MAP[ch] || ch);
}

export function normalizeKhmerText(text: string): string {
  if (!text) return '';
  let s = convertKhmerDigitsToArabic(text.trim());

  // កែពាក្យខុសទូទៅ
  s = s.replace(/ឆុត/g, 'ឈុត')
       .replace(/កូត|ខូត/g, 'កូដ')
       .replace(/យល/g, 'យក');

  // បម្លែងពាក្យខ្មែរទៅលេខ (មិនដោត space នាំឱ្យខូចលេខកូដឡើយ)
  s = s.replace(/ប្រាំបួន/g, '9')
       .replace(/ប្រាំបី/g, '8')
       .replace(/ប្រាំពីរ/g, '7')
       .replace(/ប្រាំមួយ/g, '6')
       .replace(/ប្រាំ/g, '5')
       .replace(/បួន/g, '4')
       .replace(/បី/g, '3')
       .replace(/ពីរ|ពី/g, '2')
       .replace(/មួយ|មូយ/g, '1');

  return s;
}

const RE_CAMBODIA_7_DIGIT = /(?:\+?855[\s.\-()]*|0)(?:18|31|71|76|88|96|97)(?:[\s.\-()]*\d){7}\b/i;
const RE_CAMBODIA_6_DIGIT = /(?:\+?855[\s.\-()]*|0)(?:10|11|12|14|15|16|17|38|60|61|66|67|68|69|70|77|78|81|85|86|87|89|90|92|93|95|98|99)(?:[\s.\-()]*\d){6}\b/i;
const RE_CAMBODIA_GENERAL = /(?:\+?855[\s.\-()]*|0)[1-9]\d(?:[\s.\-()]*\d){6,7}\b/i;

export function extractPhoneNumber(text: string): { phone: string | null; cleanText: string } {
  if (!text) return { phone: null, cleanText: text };

  const normalized = convertKhmerDigitsToArabic(text);
  const match = normalized.match(RE_CAMBODIA_7_DIGIT)
             || normalized.match(RE_CAMBODIA_6_DIGIT)
             || normalized.match(RE_CAMBODIA_GENERAL);

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
  if (/[:=*xX+\-]/.test(text)) return false;

  const lower = text.toLowerCase();
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
  variant?: string;
}

export function extractCodeQtyPairs(text: string): ExtractedItemPair[] {
  if (!text) return [];

  const s = normalizeKhmerText(text);
  // បំបែក segments តាមក្បៀស បន្ទាត់ថ្មី ឬពាក្យកាត់ទំនិញ
  const segments = s.split(/[\n,;+]+|\s{2,}|\s+(?=\d+[a-zA-Z]*\s*(?:យក|កាត់|=|\*))/i);
  const pairs: ExtractedItemPair[] = [];
  const seenCodes = new Set<string>();

  // តម្រៀបកូដពីវែងទៅខ្លី ដើម្បីការពារការចាប់ជាន់លើគ្នា
  const sortedCatalog = [...products]
    .filter(p => p.code && p.code.trim().length > 0)
    .sort((a, b) => b.code.length - a.code.length);

  const suffixRegex = `(?:[\\s_-]*(${SIZE_COLOR_SUFFIXES.join('|')}))?`;

  for (let seg of segments) {
    seg = seg.trim();
    if (!seg) continue;

    for (const prod of sortedCatalog) {
      const pCode = prod.code.toUpperCase().trim();
      if (COMMON_GREETINGS.has(pCode) || seenCodes.has(pCode)) continue;

      const esc = pCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // ១. កូដ + Variant (Optional) + ចំនួន (ឧ. 28យក2, 31M 1, 40=2, 49M)
      const reWithQtyAndVariant = new RegExp(
        `(?:(?:កូដលេខ|លេខកូដ|កូដ|CODE)?\\s*)` +
        `(?<![A-Za-z0-9])(${esc})` +
        `${suffixRegex}` +
        `\\s*(?:[*xX=:_\\-\\s/.,+«»~]|យក|កាត់|ថែម|ដាក់|កក់|បូក)*\\s*(\\d{1,2})?(?![A-Za-z0-9])`,
        'i'
      );

      // ២. ពាក្យ Action ខាងមុខ (ឧ. យក 28 2, កាត់ 40)
      const reActionBefore = new RegExp(
        `(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*` +
        `(?:កូដលេខ|លេខកូដ|កូដ|CODE)?\\s*` +
        `(?<![A-Za-z0-9])(${esc})` +
        `${suffixRegex}` +
        `(?:\\s*[*xX=:_\\-\\s/.,+«»~]\\s*|\\s+)?(\\d{1,2})?(?![A-Za-z0-9])`,
        'i'
      );

      const match = seg.match(reWithQtyAndVariant) || seg.match(reActionBefore);

      if (match) {
        const detectedCode = pCode;
        const variant = match[2] ? match[2].toUpperCase().trim() : undefined;
        const qty = match[3] ? (parseInt(match[3], 10) || 1) : 1;

        pairs.push({
          code: detectedCode,
          qty,
          variant
        });

        seenCodes.add(detectedCode);
        seg = seg.replace(match[0], ' ');
        break;
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

  if (!rawText) {
    return { status: 'IGNORED', message: 'Comment ទទេ' };
  }

  const { phone, cleanText } = extractPhoneNumber(rawText);

  const savedCommentId = commentId || `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const signatureKey = `${liveId}_${(fbUserId || cleanFbName).toLowerCase()}_${rawText}`;

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

  let cust = customers.find(c => 
    (fbUserId && fbUserId !== 'FB_USER_ID_STREAM' && c.facebook_user_id === fbUserId) ||
    c.facebook_name.toLowerCase() === cleanFbName.toLowerCase()
  );

  if (!cust) {
    cust = {
      customer_id: customers.length + 1,
      facebook_user_id: fbUserId || 'FB_USER_ID_STREAM',
      facebook_name: cleanFbName,
      picture_url: userPicUrl,
      phone_number: phone || undefined,
      address: zone !== 'UNKNOWN' ? label : undefined,
      is_vip: false,
      is_blacklist: false,
      last_interaction_at: new Date().toISOString()
    };
    customers.push(cust);
  } else {
    if (userPicUrl) cust.picture_url = userPicUrl;
    if (phone) cust.phone_number = phone;
    if (zone !== 'UNKNOWN' && !cust.address) cust.address = label;
    cust.last_interaction_at = new Date().toISOString();
  }

  const isQuestion = isQuestionComment(rawText);
  const pairs = extractCodeQtyPairs(cleanText);

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

  // ប្រសិនបើជាសំណួរ ឬគ្មានកូដទំនិញដែលត្រូវនឹង Catalog មិនត្រូវបង្កើតកន្ត្រកឡើយ
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
      message: `💬 កត់ត្រាខមិន${isQuestion ? 'សួរ' : ''} (មិនមានកូដទំនិញត្រូវ) ៖ «${cleanFbName}» ៖ "${rawText}"`,
      customer_name: cleanFbName,
      phone_number: phone || cust.phone_number,
      address: cust.address
    };
  }

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
      address: cust.address || (zone !== 'UNKNOWN' ? label : '⚠️ មិនទាន់មានអាសយដ្ឋាន'),
      location_zone: zone !== 'UNKNOWN' ? zone : 'UNKNOWN',
      location_label: zone !== 'UNKNOWN' ? label : '❓ មិនទាន់ដឹង',
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
    if (userPicUrl && !inv.picture_url) inv.picture_url = userPicUrl;
    if (phone && (!inv.phone_number || inv.phone_number === 'គ្មានលេខ')) inv.phone_number = phone;
    if (zone !== 'UNKNOWN' && (!inv.address || inv.address.includes('មិនទាន់មាន'))) {
      inv.location_zone = zone;
      inv.location_label = label;
      inv.address = label;
    }
    if (!inv.comments) inv.comments = [];
    if (!inv.comments.includes(rawText)) inv.comments.push(rawText);
  }

  const allocated: { code: string; product_name: string; quantity: number; price: number }[] = [];
  const soldOut: string[] = [];

  for (const pair of pairs) {
    const prod = products.find(p => p.code.toUpperCase() === pair.code.toUpperCase());

    // មិនស្គាល់កូដ -> រំលង (មិនបង្កើត product ផ្តេសផ្តាសឡើយ)
    if (!prod) continue;

    if (prod.stock_qty <= 0) {
      soldOut.push(prod.code);
      continue;
    }

    const qtyToTake = Math.min(pair.qty, prod.stock_qty);
    prod.stock_qty -= qtyToTake;

    const displayName = pair.variant ? `${prod.name} (${pair.variant})` : prod.name;
    const existingItem = inv.items.find(
      it => it.product_code.toUpperCase() === prod.code.toUpperCase() &&
            it.product_name === displayName
    );

    if (existingItem) {
      existingItem.quantity += qtyToTake;
      existingItem.item_comment = rawText;
      existingItem.is_packed = false;
    } else {
      const nextItemId = inv.items.length > 0 ? Math.max(...inv.items.map(it => it.id)) + 1 : 1;
      inv.items.push({
        id: nextItemId,
        invoice_id: inv.invoice_id,
        product_id: prod.id,
        product_code: prod.code,
        product_name: displayName,
        quantity: qtyToTake,
        price: prod.price,
        is_packed: false,
        item_comment: rawText,
        image_file: prod.image_file || ''
      });
    }

    allocated.push({
      code: prod.code,
      product_name: displayName,
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
