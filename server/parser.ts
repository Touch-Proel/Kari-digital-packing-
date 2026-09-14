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

const KHMER_WORD_NUMBERS: [string, number][] = [
  ['ប្រាំបួន', 9], ['ប្រាំបី', 8], ['ប្រាំពីរ', 7], ['ប្រាំមួយ', 6],
  ['ប្រាំ', 5], ['បួន', 4], ['បី', 3], ['ពីរ', 2], ['ពី', 2], ['មួយ', 1], ['មូយ', 1], ['ដប់', 10]
];

const ACTION_WORDS = ['យក', 'យល', 'ចង់បាន', 'កាត់', 'សុំ', 'ថែម', 'ដាក់', 'កក់', 'បូក', 'សុំយក'];

export function normalizeKhmerText(text: string): string {
  if (!text) return '';
  let s = text.trim();
  for (const [kh, ar] of Object.entries(KHMER_DIGITS_MAP)) {
    s = s.split(kh).join(ar);
  }
  s = s.replace(/ឆុត/g, 'ឈុត').replace(/កូត/g, 'កូដ').replace(/ខូត/g, 'កូដ').replace(/យល/g, 'យក');

  for (const [word, num] of KHMER_WORD_NUMBERS) {
    s = s.split(word).join(` ${num} `);
  }
  return s;
}

export function extractPhoneNumber(text: string): { phone: string | null; cleanText: string } {
  if (!text) return { phone: null, cleanText: text };
  const rePhone = /(?:\+?855|0)\s*(?:[1-9]\d{1,2})\s*\d{2,3}\s*\d{2,4}\b|\b0\d{8,9}\b|\b0\d{2,3}[-\s]?\d{3}[-\s]?\d{3,4}\b/;
  const match = text.match(rePhone);
  if (match) {
    const raw = match[0];
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('855')) {
      digits = '0' + digits.slice(3);
    }
    if (digits.length >= 8 && digits.length <= 10) {
      const clean = text.replace(raw, ' ').trim();
      return { phone: digits, cleanText: clean };
    }
  }
  return { phone: null, cleanText: text };
}

export function detectDeliveryZone(text: string): { zone: DeliveryZone; label: string } {
  if (!text) return { zone: 'UNKNOWN', label: 'មិនទាន់កំណត់' };
  const lower = text.toLowerCase();

  const ppKeywords = [
    'ភ្នំពេញ', 'phnom penh', ' pp', 'ទួលគោក', 'ដូនពេញ', 'ចំការមន', 'មានជ័យ',
    'សែនសុខ', 'ច្បារអំពៅ', 'បឹងកេងកង', 'ជ្រោយចង្វារ', 'ឫស្សីកែវ', 'ពោធិ៍សែនជ័យ',
    'ដង្កោ', 'កំបូល', 'ព្រែកព្នៅ', 'បឹងទំពុន', 'បឹងត្របែក', 'ទឹកថ្លា', 'ស្ទឹងមានជ័យ',
    'ទួលទំពូង', 'អូឡាំពិក', 'ផ្សារដើមថ្កូវ', 'កាល់ម៉ែត', 'កំបូល'
  ];

  for (const kw of ppKeywords) {
    if (lower.includes(kw)) {
      return { zone: 'PP', label: '🏙️ ភ្នំពេញ' };
    }
  }

  const provKeywords = [
    'ខេត្ត', 'សៀមរាប', 'siem reap', 'បាត់ដំបង', 'battambang', 'កំពង់ចាម', 'kampong cham',
    'កំពង់ស្ពឺ', 'កំពង់ឆ្នាំង', 'កំពង់ធំ', 'កំពត', 'kampot', 'កែប', 'kep', 'កោះកុង',
    'ព្រះសីហនុ', 'sihanoukville', 'កំពង់សោម', 'កណ្តាល', 'kandal', 'ក្រចេះ', 'មណ្ឌលគិរី',
    'រតនគិរី', 'ព្រះវិហារ', 'ព្រៃវែង', 'ពោធិ៍សាត់', 'ស្ទឹងត្រែង', 'ស្វាយរៀង', 'តាកែវ',
    'ឧត្តរមានជ័យ', 'ត្បូងឃ្មុំ', 'ប៉ៃលិន'
  ];

  for (const kw of provKeywords) {
    if (lower.includes(kw)) {
      return { zone: 'PROVINCE', label: '🏞️ តាមខេត្ត' };
    }
  }

  return { zone: 'UNKNOWN', label: 'មិនទាន់កំណត់' };
}

export function isQuestionComment(text: string): boolean {
  if (!text) return false;
  // If it has connector syntax like 30=2, it is not just a question
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

export function extractCodeQtyPairs(text: string): { code: string; qty: number }[] {
  if (!text) return [];

  const norm = normalizeKhmerText(text);
  const clean = norm.toUpperCase().trim();
  const pairs: { code: string; qty: number }[] = [];
  const seenCodes = new Set<string>();

  // Explicit connector: 30=2, 30*2, 30x2, 30:2, 30-2, 30+2, 118_1
  const reConnector = /(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})\s*[*xX=:_\-\/,.\+«»~]\s*(\d{1,2})/g;
  let match: RegExpExecArray | null;
  while ((match = reConnector.exec(clean)) !== null) {
    const c = match[1].trim().replace(/^\./, '');
    const q = parseInt(match[2], 10) || 1;
    if (!COMMON_GREETINGS.has(c) && !seenCodes.has(c) && c.length <= 5) {
      pairs.push({ code: c, qty: q });
      seenCodes.add(c);
    }
  }

  // Khmer Action Word attached or spaced after code: ១១៩យក១, 119យក2, 119 យក 1, 119យក
  const reCodeAction = /(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})\s*(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\s*(\d{1,2})?/g;
  while ((match = reCodeAction.exec(clean)) !== null) {
    const c = match[1].trim().replace(/^\./, '');
    const q = match[2] ? (parseInt(match[2], 10) || 1) : 1;
    if (!COMMON_GREETINGS.has(c) && !seenCodes.has(c) && c.length <= 5) {
      pairs.push({ code: c, qty: q });
      seenCodes.add(c);
    }
  }

  // Action word before code: យក 119 2 or យក 119 or កាត់ 30 2
  const reActionBefore = /(?:ថែម|យក|កាត់|ដាក់|កក់|បូក)\s*(?:កូដលេខ|លេខកូដ|កូដ|code)?\s*([A-Za-z0-9]{1,5})(?:\s+(\d{1,2}))?/g;
  while ((match = reActionBefore.exec(clean)) !== null) {
    const c = match[1].trim().replace(/^\./, '');
    const q = match[2] ? (parseInt(match[2], 10) || 1) : 1;
    if (!COMMON_GREETINGS.has(c) && !seenCodes.has(c) && c.length <= 5) {
      pairs.push({ code: c, qty: q });
      seenCodes.add(c);
    }
  }

  // Space pattern: 30 2 or A12 1
  const reSpace = /\b([A-Za-z0-9]{1,5})\s+(\d{1,2})\b/g;
  while ((match = reSpace.exec(clean)) !== null) {
    const c = match[1].trim().replace(/^\./, '');
    const q = parseInt(match[2], 10) || 1;
    // Don't mistake phone fragments as code
    if (!COMMON_GREETINGS.has(c) && !seenCodes.has(c) && !/^\d{3,}$/.test(c)) {
      pairs.push({ code: c, qty: q });
      seenCodes.add(c);
    }
  }

  // Standalone code or code with variant/color: e.g. "120", "119", "A12", "កូដ 120", "120 ស"
  const reStandalone = /^\s*(?:កូដលេខ|លេខកូដ|កូដ|code|លេខ)?\s*([A-Za-z0-9]{1,5})(?:[_\s]+([ក-អA-Za-z0-9_]+))?\s*$/i;
  const standaloneMatch = clean.match(reStandalone);
  if (standaloneMatch) {
    const c = standaloneMatch[1].trim();
    if (!COMMON_GREETINGS.has(c) && !seenCodes.has(c) && c.length <= 5 && !/^\d{8,}$/.test(c)) {
      pairs.push({ code: c, qty: 1 });
      seenCodes.add(c);
    }
  }

  if (pairs.length > 0) return pairs;

  // Direct product code match if exists in stock catalog
  for (const prod of products) {
    const pCode = prod.code.toUpperCase();
    const regex = new RegExp(`\\b${pCode}\\b`, 'i');
    if (regex.test(clean) && !seenCodes.has(pCode)) {
      pairs.push({ code: pCode, qty: 1 });
      seenCodes.add(pCode);
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

  // 1. Permanently record into rawComments list
  const savedCommentId = commentId || `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  rawComments.push({
    comment_id: savedCommentId,
    live_id: liveId,
    facebook_user_id: fbUserId || 'FB_USER_ID_STREAM',
    facebook_name: cleanFbName,
    comment_text: rawText,
    created_at: new Date().toISOString(),
    picture_url: userPicUrl
  });

  const { phone, cleanText } = extractPhoneNumber(rawText);
  const { zone, label } = detectDeliveryZone(rawText);

  // 2. Update or create customer profile
  let cust = customers.find(c => c.facebook_name.toLowerCase() === cleanFbName.toLowerCase());
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

  // 3. Find or create customer's basket in the current live session
  // EVERY customer comment is retained and attached to their basket!
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
      location_zone: zone !== 'UNKNOWN' ? zone : 'PP',
      location_label: zone !== 'UNKNOWN' ? label : '🏙️ ភ្នំពេញ',
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
    if (zone !== 'UNKNOWN' && (!inv.address || inv.address.includes('មិនទាន់មាន'))) {
      inv.location_zone = zone;
      inv.location_label = label;
      inv.address = label;
    }
    if (!inv.comments) inv.comments = [];
    if (!inv.comments.includes(rawText)) {
      inv.comments.push(rawText);
    }
  }

  // 4. Check whether this is an inquiry or question comment
  const isQuestion = isQuestionComment(rawText);

  // 5. Extract item code and quantity pairs
  const pairs = extractCodeQtyPairs(cleanText);

  // If question OR no product codes found: retain in unmatched_comments so staff sees it directly!
  if (isQuestion || pairs.length === 0) {
    if (!inv.unmatched_comments) inv.unmatched_comments = [];
    if (!inv.unmatched_comments.includes(rawText)) {
      inv.unmatched_comments.push(rawText);
    }
    recalculateInvoice(inv);
    bumpDataRevision();

    if (phone || zone !== 'UNKNOWN') {
      return {
        status: 'CONTACT_SAVED',
        message: `📝 បានកត់ត្រាព័ត៌មាន & ខមិន ៖ ${cleanFbName} (${phone || label})`,
        invoice_id: inv.invoice_id,
        customer_name: cleanFbName,
        phone_number: inv.phone_number,
        address: inv.address
      };
    }

    return {
      status: isQuestion ? 'QUESTION_SAVED' : 'UNMATCHED_SAVED',
      message: `💬 បានកត់ត្រាខមិន${isQuestion ? 'សួរ' : ''} ៖ «${cleanFbName}» ៖ "${rawText}"`,
      invoice_id: inv.invoice_id,
      customer_name: cleanFbName,
      phone_number: inv.phone_number,
      address: inv.address
    };
  }

  // 6. Allocate items into customer's basket
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
        name: `កូដ [${pair.code.toUpperCase()}]`,
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

    // Add or update item in invoice
    const existingItem = inv.items.find(it => it.product_code.toUpperCase() === prod.code.toUpperCase());
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
        product_name: prod.name,
        quantity: qtyToTake,
        price: prod.price,
        is_packed: false,
        item_comment: rawText
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

  // If items could not be allocated (e.g. sold out), make sure the comment is in unmatched_comments
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
