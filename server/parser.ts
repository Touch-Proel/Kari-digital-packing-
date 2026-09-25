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
import {
  CLOTHING_SIZES,
  CLOTHING_SIZES_SET,
  COMMON_WAIST_SIZES,
  NON_PRODUCT_CODES,
  KHMER_DIGITS_MAP,
  RE_PRICE_CLEANUP,
  RE_MEASUREMENTS_CLEANUP,
  RE_ADDRESS_NUMBERS_CLEANUP,
  RE_CAMBODIAN_PHONE,
  convertKhmerDigitsToArabic,
  extractPhoneNumber,
  extractSizeAndColorNotes,
  normalizeKhmerText,
  extractCodeQtyPairsFromComment,
  ExtractedItemPair
} from '../src/utils/commentParser';

export {
  detectDeliveryZone,
  CLOTHING_SIZES,
  CLOTHING_SIZES_SET,
  COMMON_WAIST_SIZES,
  NON_PRODUCT_CODES,
  KHMER_DIGITS_MAP,
  RE_PRICE_CLEANUP,
  RE_MEASUREMENTS_CLEANUP,
  RE_ADDRESS_NUMBERS_CLEANUP,
  RE_CAMBODIAN_PHONE,
  convertKhmerDigitsToArabic,
  extractPhoneNumber,
  extractSizeAndColorNotes,
  normalizeKhmerText,
  extractCodeQtyPairsFromComment
};
export type { ExtractedItemPair };

const COMMON_GREETINGS = NON_PRODUCT_CODES;

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

const ACTION_WORDS = ['យក', 'យល', 'ចង់បាន', 'កាត់', 'សុំ', 'ថែម', 'ដាក់', 'កក់', 'បូក', 'សុំយក'];

export function isQuestionComment(text: string): boolean {
  if (!text) return false;
  let norm = convertKhmerDigitsToArabic(text);
  norm = norm.replace(RE_PRICE_CLEANUP, ' ');

  // If comment has explicit order syntax like "47=2", "47:1", "47/2", "យក36", "ថែម 54", "38=2", "120=2", "16,2", "37»5", it is an order, not a pure question
  if (
    /(?:កូដ\s*)?[A-Za-z0-9]{1,5}\s*[:=»_]\s*\d{1,2}/.test(norm) ||
    /(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\s*(?:លេខ)?(?:កូដ|កូត|code)?\s*[A-Za-z0-9]{1,5}/i.test(norm)
  ) {
    return false;
  }

  // Conversational inquiries, checks, and status questions
  if (/(?:មិញ)?\s*(?:ខ្ញុំ|ញុម)?\s*បានអត់|បានអីវ៉ាន់អត់|បានលោតសារ|លោតសារបាន|លោតសាចឹង|អត់លោតសារ|អត់ឮសំឡេង|អត់សូវឮ|ឮតិច|ឮតិចៗ|កុងកុំឮងមើល|កុងកុឮងមើល|ធ្វើមិចបានដឹង|អត់លោត|ទិញរហូត|ទិញមិនដែលបាន|ទិញ២ដងហើយ|មិនទាន់មកដល់|ពេញចិត្ត|អន់ចិត្ត|សាច់ស្អាត|ស្អាតណាស់|សេវ៉ាលឿន|យឺតក៏នៅតែទិញ|ម៉ូយគាត់តាំងពី|រាប់ឈុតចំរុះ|បាញ់លុយរួចហើយយក100|ច្រឡំអត់យក|ច្រឡំលេខកូដ/i.test(norm)) {
    return true;
  }
  if (/(?:លើខ្លួន|នៅលើខ្លួន|លើកខ្លួន|លើកសំពត់|លើកខោ|លើកអាវ|លើកឈុត|សុំមើល)\s*(?:មួយឈុត|មួយឆុត)?\s*(?:ប៉ុន្មាន|លក់ម៉េច|ម៉េច|ម៉ាន|មាណ|លក់អត់|មានលក់|អស់នៅ|អស់ហើយ|សុំមើល|ផង|មក)/i.test(norm)) {
    return true;
  }
  if (/(?:ម៉ាន|មាណ|ប៉ុន្មាន|ប៉ុន្នាន)\s*(?:គីឡូ|kg|kilo)|ពាក់បាន|ពាក់ដល់|ស្លៀកបាន|ស្លៀកដល់|មានសាយអីខ្លះ|សាយអី|មានពណ័អត់|មានពណ៌អត់|មានអត់|មានទេ|មានខោ|មានអាវ|មានសំពត់|មានឈុត/i.test(norm)) {
    return true;
  }

  const lower = norm.toLowerCase();
  for (const kw of QUESTION_KEYWORDS) {
    if (lower.includes(kw)) {
      const hasAction = ACTION_WORDS.some(act => lower.includes(act));
      if (!hasAction) return true;
    }
  }
  return false;
}

export function extractCodeQtyPairs(text: string, liveId?: string): ExtractedItemPair[] {
  if (!text) return [];
  if (isQuestionComment(text)) return [];

  const targetLive = liveId || activeLiveId;
  const targetProducts = products.filter(p => (p.live_id || activeLiveId) === targetLive);

  return extractCodeQtyPairsFromComment(text, targetProducts, settings.parser_strict_catalog);
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
    const cleanPairCode = pair.code.toUpperCase().trim();
    if (NON_PRODUCT_CODES.has(cleanPairCode) || CLOTHING_SIZES_SET.has(cleanPairCode)) {
      continue; // NEVER treat clothing sizes (XS, S, M, L, XL, 2XL, etc.) as product codes or create in stock!
    }

    // Guard: Accidental extraction of waist numbers (e.g. 29, 30, 31, 32 from "87Size29, 30,31,32")
    const isWaistNum = parseInt(cleanPairCode, 10);
    if (!isNaN(isWaistNum) && isWaistNum >= 24 && isWaistNum <= 46) {
      const waistPattern = new RegExp(`(?:ចង្កេះ|ចង្កះ|ចង្កែះ|សាយ|size|ស្លឹក)\\s*[:=\\s\\-]?\\s*(?:\\d{1,2}\\s*[,/+\\-\\s]*)*${cleanPairCode}\\b`, 'i');
      if (waistPattern.test(rawText)) {
        continue;
      }
    }

    // Guard: Accidental extraction of weight / kilo numbers (e.g. 68 from "73=1គឺឡូ68")
    const kiloPattern = new RegExp(`(?:គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គីឡុ|គីឡួ|គីឡូក្រាម|គឺឡូក្រាម|គក|kg|kilo)\\s*[:=\\s\\-_/]?\\s*${cleanPairCode}\\b`, 'i');
    const kiloAfterPattern = new RegExp(`\\b${cleanPairCode}\\s*(?:kg|kilo|គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គក)\\b`, 'i');
    if (kiloPattern.test(rawText) || kiloAfterPattern.test(rawText)) {
      continue;
    }

    // Guard: Accidental extraction of chest / bust numbers (e.g. 38 from "ទ្រូង 38")
    const chestPattern = new RegExp(`(?:ដើមទ្រូង|ទ្រូង)\\s*[:=\\s\\-]?\\s*${cleanPairCode}\\b`, 'i');
    if (chestPattern.test(rawText)) {
      continue;
    }

    // Guard: Accidental extraction of address / building numbers (e.g. 19 from "គំរោង19")
    const addressPattern = new RegExp(`(?:គំរោង|គម្រោង|ផ្លូវ|ផ្ទះ|បន្ទប់|ជាន់ទី)\\s*(?:លេខ|ទី)?\\s*${cleanPairCode}\\b`, 'i');
    if (addressPattern.test(rawText)) {
      continue;
    }

    let prod = products.find(
      p => (p.live_id || activeLiveId) === liveId && p.code.toUpperCase() === cleanPairCode
    );

    if (!prod) {
      if (settings.parser_strict_catalog) {
        continue;
      }
      const nextId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      prod = {
        id: nextId,
        code: cleanPairCode,
        name: `កូដ ${cleanPairCode}`,
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

    const detectedNote = extractSizeAndColorNotes(rawText);

    const existingItem = inv.items.find(
      it => it.product_code.toUpperCase() === prod.code.toUpperCase()
    );

    if (existingItem) {
      existingItem.quantity += qtyToTake;
      existingItem.is_packed = false;

      if (detectedNote && !existingItem.note) {
        existingItem.note = detectedNote;
      }

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
        image_file: prod.image_file || '',
        note: detectedNote || undefined
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