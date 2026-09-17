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
  'អត់', 'មាន', 'ប៉ុន្មាន', 'ថ្លៃ', 'តម្លៃ', 'ពាក់បាន',
  'សាច់', 'សល់', 'មានអត់', 'អត់បង', 'អត់ចែ', 'ថ្លៃប៉ុន្មាន',
  'លក់ម៉េច', 'ម៉េចដែរ', 'ចុះ', 'បញ្ចុះ',
  'ត្រូវថ្លៃ', 'សួរ', 'ចង់សួរ', 'មានកូន', 'មេីល', 'មើល'
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

// សម្អាតទម្ងន់ទាំងដុំ (ឧ. 1គីឡូ77, 20=1គីឡូ78) មិនឱ្យសល់លេខទោលខាងក្រោយ
const RE_MEASUREMENTS_CLEANUP = /(?:\d*\s*(?:kg|kilo|គីឡូ|គីឡូក្រាម|គក)\s*\d*|កម្ពស់\s*\d{2,3}|ចង្កេះ\s*[:=\s]*\d{2}|(?:សាយ|size)\s*[:=\s]*\d{2}|1\.[4-9]\d?\s*(?:m|ម៉ែត្រ)?\b)/gi;

const RE_ADDRESS_NUMBERS_CLEANUP = /(?:ផ្លូវ(?:លេខ)?\s*\d+[A-Za-z]?|ផ្ទះ(?:លេខ)?\s*\d+|ផ្សារ\s*\d+|បុរី\s*[\u1780-\u17FFa-zA-Z0-9_]+\s*\d+)/gi;

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

  s = s.replace(/(\d+)\s*(?:មួយ|មូយ)/g, '$1=1 ')
       .replace(/(\d+)\s*(?:ពីរ|ពី)/g, '$1=2 ')
       .replace(/(\d+)\s*(?:បី)/g, '$1=3 ')
       .replace(/(\d+)\s*(?:បួន)/g, '$1=4 ')
       .replace(/(\d+)\s*(?:ប្រាំ)/g, '$1=5 ');

  s = s.replace(/ប្រាំបួន/g, ' 9 ')
       .replace(/ប្រាំបី/g, ' 8 ')
       .replace(/ប្រាំពីរ/g, ' 7 ')
       .replace(/ប្រាំមួយ/g, ' 6 ')
       .replace(/ប្រាំ/g, ' 5 ')
       .replace(/បួន/g, ' 4 ')
       .replace(/បី/g, ' 3 ')
       .replace(/ពីរ/g, ' 2 ')
       .replace(/មួយ|មូយ/g, ' 1 ');

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
}

export function extractCodeQtyPairs(text: string): ExtractedItemPair[] {
  if (!text) return [];

  let s = normalizeKhmerText(text);

  // ១. សម្អាតទម្ងន់/គីឡូ (រួមទាំងលេខសងខាង) និងតម្លៃលុយឱ្យអស់មុនគេ
  s = s.replace(RE_MEASUREMENTS_CLEANUP, ' ');
  s = s.replace(RE_PRICE_CLEANUP, ' ');
  s = s.replace(RE_ADDRESS_NUMBERS_CLEANUP, ' ');

  // ២. បំប្លែងទម្រង់ CODE.QTY និងសញ្ញាផ្សេងៗ
  s = s.replace(/(?<!\d)(?!1\.[4-9]\d)(\d{1,3})\.(\d{1,2})(?!\d)/g, '$1=$2');
  s = s.replace(/\//g, ' ');
  s = s.replace(/(\d{1,3})\s*=\s*(?:[-_]|\s*(?=[^\d]|$))/g, '$1=1 ');

  const segments = s.split(/[\n;+]+|\s+និង\s+|\s{2,}/i);
  const pairs: ExtractedItemPair[] = [];
  const seenCodes = new Set<string>();

  const sortedCatalog = [...products]
    .filter(p => p.code && p.code.trim().length > 0)
    .sort((a, b) => b.code.length - a.code.length);

  const validSuffixes = SIZE_COLOR_SUFFIXES.join('|');

  for (let seg of segments) {
    seg = seg.trim();
    if (!seg) continue;

    for (const prod of sortedCatalog) {
      const pCode = prod.code.toUpperCase().trim();
      if (COMMON_GREETINGS.has(pCode) || seenCodes.has(pCode)) continue;

      const esc = pCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isSingleDigit = /^\d$/.test(pCode);

      if (isSingleDigit) {
        const falseQtyPattern = new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់)?\\s*${esc}\\s*(?:អាវ|ខោ|ឈុត|កំប៉ុង|ពណ៌|ពណ៍)`, 'i');
        if (falseQtyPattern.test(seg) && !new RegExp(`(?:កូដ|កូដលេខ|CODE)\\s*${esc}\\b`, 'i').test(seg)) {
          continue;
        }
      }

      // ប្រើប្រាស់ព្រំដែនតឹងរឹងការពារកុំឱ្យលេខកូដទៅស៊ីជាប់លេខផ្សេង
      const codePattern = isSingleDigit
        ? `(?:(?:កូដ|កូដលេខ|CODE|យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*${esc}|(?<!\\d)${esc}(?!\\d))`
        : `(?<!\\d)(${esc})(?!\\d)`;

      const codeMatch = seg.match(new RegExp(codePattern, 'i'));
      if (!codeMatch) continue;

      const multiVariantRegex = /\b(XXL|XXS|4XL|3XL|2XL|XL|XS|[SML])\s*(\d{1,2})?\b/gi;
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
        `\\s*(\\d{1,2})(?:\\s*(?:អាវ|ខោ|ឈុត|ពណ៌|ពណ៍))?`,
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

    if (!prod) continue;

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