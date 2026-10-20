export const CLOTHING_SIZES = [
  'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', '6XL', 'FS', 'FREESIZE', 'FREE-SIZE'
];

export const CLOTHING_SIZES_SET = new Set(CLOTHING_SIZES);

// Common pants / waist sizes (inches)
export const COMMON_WAIST_SIZES = new Set([
  '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '42', '44', '46'
]);

export const NON_PRODUCT_CODES = new Set([
  'HI', 'HELLO', 'BONG', 'OK', 'YES', 'NO', 'PRICE', 'INBOX',
  'ADMIN', 'SL', 'SLL', 'SLSL', 'LIKE', 'LOVE', 'CAN', 'HOW', 'TWA',
  'CHHAT', 'JAE', 'AKUN', 'ORKUN', 'SLJAE', 'SLBONG', 'GOOD',
  'KG', 'KILO', 'GK', 'CM', 'PP', 'VIP', 'ABA', 'KHQR', 'USD', 'KHR', 'DOLLAR', 'RIEL',
  'FREE', 'SHIP', 'SET', 'TEL', 'PHONE', 'SIZE', 'COLOR',
  'សាយ', 'ចង្កេះ', 'លេខ', 'ពណ៌', 'ពណ៍', 'អាវ', 'ខោ', 'ឈុត',
  'គីឡូ', 'គឺឡូ', 'កីឡូ', 'គីឡ', 'គឺឡ', 'គក', 'គឺទូ', 'KL',
  ...CLOTHING_SIZES
]);

export const KHMER_DIGITS_MAP: Record<string, string> = {
  '០': '0', '១': '1', '២': '2', '៣': '3', '៤': '4',
  '៥': '5', '៦': '6', '៧': '7', '៨': '8', '៩': '9'
};

const ACTION_WORDS = ['យក', 'យល', 'ចង់បាន', 'កាត់', 'សុំ', 'ថែម', 'ដាក់', 'កក់', 'បូក', 'សុំយក'];

const SIZE_COLOR_SUFFIXES = [
  'XXL', 'XXS', '4XL', '3XL', '2XL', 'XL', 'XS', 'M', 'L', 'S',
  'ស', 'ខ្មៅ', 'ក្រម៉ៅ', 'ក្រហម', 'ខៀវ', 'លឿង', 'ផ្កាឈូក', 'ស្វាយ', 'បៃតង', 'ត្នោត', 'ប្រផេះ', 'ទឹកដោះគោ', 'សូកូឡា', 'សុកុឡា', 'សុកូឡា', 'កាហ្វេ', 'ឈាមជ្រូក'
];

export const RE_PRICE_CLEANUP = /(?:[:=]\s*)?(?:\(\s*\d+(?:[\.,]\d{1,2})?\s*\$?\s*\)|(?:តម្លៃ|តំលៃ)\s*\d+(?:[\.,]\d{1,2})?\s*(?:\$|រៀល|៛|ពាន់)?|\$\s*\d+(?:[\.,]\d{1,2})?|\b\d+(?:[\.,]\d{1,2})?\s*\$|\b\d+\s*៛|\b\d{4,}\s*(?:រៀល|៛)\b|[:=]\s*\d+\.\d{1,2}\b)/gi;
export const RE_MEASUREMENTS_CLEANUP = /(?:(?:kg|kilo|gk|គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គីឡុ|គីឡួ|គីឡូក្រាម|គឺឡូក្រាម|គក|គឺទូ)\s*[:=\s\-_/]?\s*\d{1,3}(?![A-Za-z0-9\u1780-\u17FF])|(?<!\d)\d{2,3}\s*(?:kg|kilo|gk|គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គីឡុ|គីឡួ|គីឡូក្រាម|គឺឡូក្រាម|គក|គឺទូ)(?!\s*[:=\-]?\s*\d)(?![A-Za-z0-9\u1780-\u17FF])|(?<![A-Za-z0-9])គ\d{2}\b|(?:ដើមទ្រូង|ទ្រូង)\s*[:=\s\-]?\s*\d{2,3}|(?:កម្ពស់|កំពស់)\s*[:=\s\-]?\s*\d{2,3}|1\.[4-9]\d?\s*(?:m|ម៉ែត្រ)?\b)/gi;
export const RE_ADDRESS_NUMBERS_CLEANUP = /(?:(?:គំរោង|គម្រោង)(?:ទី)?\s*\d+|ផ្លូវ(?:លេខ|ទី)?\s*\d+[A-Za-z]?|ផ្លូវជាតិ(?:លេខ)?\s*\d+|ផ្ទះ(?:លេខ)?\s*[A-Za-z0-9\-]+|បន្ទប់(?:លេខ)?\s*\d+|ជាន់ទី\s*\d+|គីឡូម៉ែត្រ(?:លេខ)?\s*\d+|គីឡូលេខ\s*\d+|បុរី\s*[^\s\d/]+(?:\s*(?:ទី)?\d+)?|ឈូកវ៉ា\s*\d+|ភូមិ(?:ទី)?\s*\d+|ក្រុម(?:ទី)?\s*\d+|ច្រក(?:ទី)?\s*\d+|ស្ទឹងមានជ័យ(?:\s*(?:ទី)?\d+)?|រង្វង់មូល[^\s\d]+)/gi;

export const RE_CAMBODIAN_PHONE = /(?:\+?855[\s.\-()]*|0)(?:[1-9]\d)(?:[\s.\-()]*\d){6,7}(?!\d)/i;

export function convertKhmerDigitsToArabic(text: string): string {
  if (!text) return '';
  return text.replace(/[០-៩]/g, ch => KHMER_DIGITS_MAP[ch] || ch);
}

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

export function extractSizeAndColorNotes(text: string): string {
  if (!text) return '';
  const s = convertKhmerDigitsToArabic(text);
  const notes: string[] = [];

  // Weight notes (e.g. "គីឡូ 65", "65 គីឡូ", "65kg", "30=80", "12=55", "20=35")
  const weightMatch = s.match(/(?:គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គីឡុ|គីឡួ|គីឡូក្រាម|គឺឡូក្រាម|គក|គឺទូ|kg|kilo|gk)\s*[:=\s\-_/]?\s*(\d{2,3})/i) ||
                      s.match(/(?<!\d)(\d{2,3})\s*(?:kg|kilo|gk|គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គីឡុ|គីឡួ|គីឡូក្រាម|គឺឡូក្រាម|គក|គឺទូ)/i) ||
                      s.match(/(?:\d{1,4})?គ\s*(\d{2})\b/i) ||
                      s.match(/(?<!\d)[A-Za-z0-9]{1,5}\s*[:=]\s*(4[7-9]|[5-9][0-9]|1[0-2][0-9])\b/i);
  if (weightMatch) {
    notes.push(`${weightMatch[1]}kg`);
  }

  // Waist / pants size (e.g. "សាយ 34", "ចង្កេះ 32", "ចង្កះ 36", "size 34", "សាយ34", "លេខ 34", "94\35", "94=1-34", "94=34", "1,សាយ31,2")
  const waistMatch = s.match(/(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|លេខ|ស្លឹក)\s*[:=\s]*(\d{2})\b/i) ||
                     s.match(/(?<!\d)[A-Za-z0-9]{1,5}\s*(?:=|\/|\\|-|,|\s)\s*(?:(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|លេខ|ស្លឹក)\s*)?(?:\d{1,2}\s*[-_]\s*)?(2[4-9]|3[0-9]|4[0-6])\b/i);
  if (waistMatch) {
    notes.push(`size ${waistMatch[1]}`);
  }

  // Letter sizes (e.g. "XL", "2XL", "សាយអិល", "សាយ L")
  const letterMatch = s.match(/\b(XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\b/i);
  if (letterMatch && !waistMatch) {
    notes.push(`size ${letterMatch[1].toUpperCase()}`);
  } else if (/សាយ\s*អិល|សាយអិល/i.test(s)) {
    notes.push('size L');
  } else if (/សាយ\s*អ៊ិចអិល|សាយអ៊ិចអិល/i.test(s)) {
    notes.push('size XL');
  } else if (/សាយ\s*អេស|សាយអេស/i.test(s)) {
    notes.push('size S');
  } else if (/សាយ\s*អិម|សាយអិម/i.test(s)) {
    notes.push('size M');
  } else if (/ហ្វ្រីសាយ|freesize/i.test(s)) {
    notes.push('FreeSize');
  }

  // Colors
  const colorMatch = text.match(/(?:ពណ៍|ពណ៌|ពណ៏)\s*([A-Za-z0-9\u1780-\u17FF]+)/i);
  if (colorMatch) {
    notes.push(colorMatch[0].trim());
  } else if (/(?:គ្រប់ពណ៌|គ្រប់ពណ៍|គ្រប់ពណ៏|គ្រុបពណ|គ្រប់ពណ|គ្រុបណ|លាយពណ៌|លាយពណ៍)/i.test(text)) {
    notes.push('គ្រប់ពណ៌');
  } else {
    for (const c of ['ក្រម៉ៅ', 'ក្រហម', 'ខៀវ', 'លឿង', 'ផ្កាឈូក', 'ស្វាយ', 'បៃតង', 'ត្នោត', 'ប្រផេះ', 'ទឹកដោះគោ', 'សូកូឡា', 'សុកុឡា', 'សុកូឡា', 'កាហ្វេ', 'ឈាមជ្រូក', 'ខ្មៅ', 'ស']) {
      if (new RegExp(`(?:^|\\s)${c}(?:\\s|$)`).test(text) || new RegExp(`\\d+${c}(?![\\u1780-\\u17FF])`).test(text)) {
        notes.push(`ពណ៌${c}`);
        break;
      }
    }
  }

  return notes.join(' | ');
}

export function normalizeKhmerText(text: string): string {
  if (!text) return '';
  let s = text.trim();

  // Strip invisible zero-width characters (ZWSP, ZWNJ, ZWJ, BOM) commonly inserted by Khmer mobile keyboards
  s = s.replace(/[\u200B\u200C\u200D\uFEFF]/g, ' ');

  // Normalize Khmer nikkahit/bantok variant for bundle: ដំុ -> ដុំ
  s = s.replace(/ដំុ/g, 'ដុំ');

  // Normalize common typo "ថែ" -> "ថែម" when followed by code/digits (e.g. "ថែ36-10គ្រុបពណ", "ថែ45-2សាយ31")
  s = s.replace(/(?<=^|[^\u1780-\u17FF])ថែ(?=\s*(?:កូដ|កូត|[០-៩\d]|[A-Za-z]\d))/gi, ' ថែម ');

  // Normalize "គ្រុបពណ" / "គ្រុបណ" -> "គ្រប់ពណ៌"
  s = s.replace(/គ្រុបពណ|គ្រុបណ|គ្រប់ពណ(?![៌៍៏])/g, ' គ្រប់ពណ៌ ');

  // Normalize Khmer "ស្មើ" or "ស្មើនឹង" (meaning equals =)
  s = s.replace(/\s*ស្មើ(?:នឹង)?\s*/gi, '=');

  // Normalize Khmer shorthand for code: "កូ 1", "កូ1", "កូ១" -> "កូដ 1"
  s = s.replace(/(?<=^|[^\w\u1780-\u17D2])កូ\s*([០-៩\d])/gi, ' កូដ $1');

  // Separate glued code/numbers before kilo/kg variations (e.g. "157គីឡូ 65" -> "157 គីឡូ 65", "73=1គឺឡូ68" -> "73=1 គឺឡូ 68", "127គ65" -> "127 គីឡូ 65")
  const KILO_TERMS = 'គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គីឡុ|គីឡួ|គីឡូក្រាម|គឺឡូក្រាម|គក|គឺទូ|kg|kilo|gk';
  s = s.replace(new RegExp(`([A-Za-z0-9])(${KILO_TERMS})`, 'gi'), '$1 $2');
  s = s.replace(new RegExp(`(${KILO_TERMS})([A-Za-z0-9])`, 'gi'), '$1 $2');

  // Normalize phonetic/spelling variations of kilo to standard "គីឡូ"
  s = s.replace(/(?:គឺឡូ|កីឡូ|គីឡុ|គីឡួ|គឺឡ|គីឡូក្រាម|គឺឡូក្រាម|គឺទូ)/gi, ' គីឡូ ');
  s = s.replace(/\bgk\b/gi, ' kg ');
  s = s.replace(/គីឡ(?=\s*\d)/gi, ' គីឡូ ');
  s = s.replace(/(?<![A-Za-z0-9])(\d{1,4})\s*គ\s*(\d{2})\b/gi, '$1 គីឡូ $2');

  // Normalize guillemets » and « often used in Cambodia live comments as arrows or item separators
  s = s.replace(/[»«]/g, ' » ');

  s = convertKhmerDigitsToArabic(s);

  // Clean prices BEFORE separating Khmer words and numbers so "(2.5)" or "តម្លៃ6500" are stripped intact
  s = s.replace(RE_PRICE_CLEANUP, ' ');

  // Separate glued Khmer words and English/numbers (e.g. "ភ្នំពេញ28" -> "ភ្នំពេញ 28", "ចោមចៅ28" -> "ចោមចៅ 28", "កូដ28" -> "កូដ 28", "28អាវ" -> "28 អាវ")
  s = s.replace(/([\u1780-\u17D2])([A-Za-z0-9])/g, '$1 $2');
  s = s.replace(/([A-Za-z0-9])([\u1780-\u17D2])/g, '$1 $2');
  s = s.replace(/(\d)(size|freesize)\b/gi, '$1 $2');
  s = s.replace(/\b(size)(\d)/gi, '$1 $2');

  s = s.replace(/ឆុត/g, 'ឈុត')
       .replace(/កូត|ខូត|កូក|គូដ|គូត/g, 'កូដ')
       .replace(/យល|យម/g, 'យក')
       .replace(/កូដ\s*យក/g, ' យក ');

  // Replace Khmer phonetic sizes and size keywords
  s = s.replace(/សាយ\s*អិល|សាយអិល/gi, ' size L ')
       .replace(/សាយ\s*អ៊ិចអិល|សាយអ៊ិចអិល/gi, ' size XL ')
       .replace(/សាយ\s*អេស|សាយអេស/gi, ' size S ')
       .replace(/សាយ\s*អិម|សាយអិម/gi, ' size M ')
       .replace(/ហ្វ្រីសាយ|freesize/gi, ' FreeSize ')
       .replace(/ទំហំ\s*(2[4-9]|3[0-9]|4[0-6])\b/gi, ' size $1 ')
       .replace(/(?:ចង្កេះ|ចង្កះ|ចង្កែះ|ចង្កោះ|សាយ|សាត|size|ទំហំ)\s*លេខ\s*(2[4-9]|3[0-9]|4[0-6])\b/gi, ' size $1 ');

  // Clean address indicators first so address numbers don't get matched as product codes
  s = s.replace(RE_ADDRESS_NUMBERS_CLEANUP, ' ');
  // Clean prices before word nums so e.g. "53=3$យកពី" becomes "53 យកពី" -> "53=2"
  s = s.replace(RE_PRICE_CLEANUP, ' ');

  // Replace Khmer word numbers when paired with action verbs or code
  const KHMER_WORD_NUMS = [
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
    { word: 'ពី', num: 2 },
    { word: 'មួយ', num: 1 },
    { word: 'មូយ', num: 1 }
  ];

  for (const { word, num } of KHMER_WORD_NUMS) {
    // Pattern 1: Action + Code + NumberWord (e.g. "យក 47 ពីរ", "កាត់ 47 មួយអាវ", "យក118បីអាវ")
    s = s.replace(
      new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|បូក|សុំ)\\s*([A-Za-z]\\d{1,3}|\\d{1,4})\\s*${word}(?:\\s*(?:អាវ|ខោ|ឈុត|កំប៉ុង|ក្បាល|គូ|កញ្ចប់|ពណ៌|ពណ))?`, 'gi'),
      `$1=${num} `
    );
    // Pattern 2: Code + Action/Optional + NumberWord (e.g. "118 បីអាវ", "118បីអាវ", "118បី", "47 យក ពីរ", "47 ពីរ")
    s = s.replace(
      new RegExp(`(?<!\\d)([A-Za-z]\\d{1,3}|\\d{1,4})\\s*(?:យក|កាត់|ថែម|ដាក់|កក់|សុំ)?\\s*${word}(?:\\s*(?:អាវ|ខោ|ឈុត|កំប៉ុង|ក្បាល|គូ|កញ្ចប់|ពណ៌|ពណ))?`, 'gi'),
      `$1=${num} `
    );
    // Pattern 3: Action + NumberWord + Code (e.g. "យក ពីរ 47", "កាត់ មួយ 100", "យក បី 118")
    s = s.replace(
      new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|សុំ)\\s*${word}\\s*(?:អាវ|ខោ|ឈុត|កំប៉ុង|ក្បាល|គូ|កញ្ចប់)?\\s*([A-Za-z]\\d{1,3}|\\d{1,4})`, 'gi'),
      `$1=${num} `
    );
  }

  s = s.replace(/\*{3,}/g, ' ');
  return s;
}

export interface ExtractedItemPair {
  code: string;
  qty: number;
}

function sanitizeRetailQuantity(code: string, rawQty: number, commentContext: string): number {
  if (rawQty <= 20) {
    return rawQty;
  }
  // Allow wholesale quantity if there is an explicit unit word attached (e.g. "50 អាវ", "100 អាវ", "50 ខោ", "100 ឈុត", "50 កំប៉ុង", "100 កេស", "50 ឡូ", "2 ដុំ", "2 ដំុ")
  const hasExplicitWholesaleUnit = new RegExp(`(?:${rawQty})\\s*(?:អាវ|ខោ|ឈុត|ឆុត|កំប៉ុង|កញ្ចប់|ដប|គូ|កេស|ដើម|ប្រអប់|ក្បាល|បន្ទះ|ថង់|ដុំ|ដំុ|ឡូ|កែវ)`, 'i').test(commentContext);
  if (hasExplicitWholesaleUnit) {
    return rawQty;
  }
  // Otherwise, in retail live streams, any naked number > 20 is either a waist size (24-46) or weight in kg (35-130) -> default qty = 1!
  return 1;
}

export function extractCodeQtyPairsFromComment(
  text: string,
  catalogProducts?: { code: string; live_id?: string }[],
  strictCatalog: boolean = false
): ExtractedItemPair[] {
  if (!text) return [];

  let s = normalizeKhmerText(text);

  const { cleanText: textWithoutPhone } = extractPhoneNumber(s);
  s = textWithoutPhone;

  // Clean prices and currency indicators first so price tags (e.g. "=2.50", "=2.5$", "3$", "(2.5)") are not confused with product codes/quantities
  s = s.replace(RE_PRICE_CLEANUP, ' ');

  // 0. GUARD: Prank / joke comment cancellation (e.g. "443=20លេងសើច", "ខមិនលេង", "ច្រឡំអត់យក")
  if (/(?:លេងសើច|និយាយលេង|ខមិនលេង|កុំយក|ច្រឡំអត់យក|កុំទាន់ដាក់|កុំទាន់យក)/i.test(s)) {
    return [];
  }

  // 0. GUARD: Pure action + quantity ONLY (e.g. "យក 2", "យក2", "កាត់ 1", "ថែម 2", "ដាក់ 1", "កក់ 2", "យកមួយ", "យកបីអាវ", "យក 1 អាវ")
  // These are comments with single-digit quantity intent ONLY, but NO product code! They must NEVER be extracted as product codes "2" or "1"!
  const isPureActionQuantity = /^(?:យក|កាត់|ថែម|ដាក់|កក់|បូក|សុំ|សុំយក)\s*(?:\d\b|មួយឡូ|កន្លះឡូ|ដប់|ប្រាំបួន|ប្រាំបី|ប្រាំពីរ|ប្រាំមួយ|ប្រាំ|បួន|បី|ពីរ|មួយ|មូយ)(?:\s*(?:អាវ|ខោ|ឈុត|កំប៉ុង|ក្បាល|គូ|កញ្ចប់|ពណ៌|ពណ))?$/i.test(s.trim());
  if (isPureActionQuantity) {
    return [];
  }

  // 0. GUARD: Pure size ONLY without product code (e.g. "សាយ 34", "size 34", "ចង្កេះ 34", "សាយ 34 យក 1", "ចង្កេះ 32 យក 2")
  const isPureSizeComment = /^(?:(?:យក|កាត់|ថែម|ដាក់|កក់)\s*)?(?:សាយ|size|ចង្កេះ|លេខ|ស្លឹក|ទំហំ)\s*[:=\s]*\d{2}(?:\s*(?:យក|កាត់|ថែម|ដាក់|កក់)?\s*(?:\d{1,2}|មួយ|ពីរ|បី|បួន|ប្រាំ))?(?:\s*(?:អាវ|ខោ|ឈុត|ពណ៌|ពណ))?$/i.test(s.trim());
  if (isPureSizeComment) {
    return [];
  }

  // Inquiries and explicit order intent check
  const hasExplicitOrderPattern = /(?:កូដ\s*)?[A-Za-z0-9]{1,5}\s*[:=»_\-]\s*\d{1,2}/i.test(s) ||
                                 /(?:យក|កាត់|ថែម|ដាក់|កក់|បូក|សុំយក)\s*(?:លេខ)?(?:កូដ|កូត|code)?\s*[A-Za-z0-9]{1,5}/i.test(s) ||
                                 /(?:កូដ|កូត|code)\s*[A-Za-z0-9]{1,5}/i.test(s);

  // 0. GUARD: Conversational inquiries & confirmation checks (e.g. "38ពាក់ដល់មាណគីឡូបង", "ចែ 110 មិញបានអត់", "កុងកុំឮងមើល", "117មានម៉ានគីឡូបង", "លើខ្លួនមួយឆុតបង")
  const isConversationalOrCheck = !hasExplicitOrderPattern && /(?:(?:មិញ)?\s*(?:ខ្ញុំ|ញុម)?\s*បានអត់|បានអីវ៉ាន់អត់|បានលោតសារ|លោតសារបាន|លោតសាចឹង|អត់លោតសារ|អត់ឮសំឡេង|អត់សូវឮ|ឮតិច|ឮតិចៗ|កុងកុំឮងមើល|កុងកុឮងមើល)/i.test(s);
  if (isConversationalOrCheck) {
    return [];
  }

  const isOutfitInquiry = /(?:លើខ្លួន|នៅលើខ្លួន|លើកខ្លួន)\s*(?:មួយឈុត|មួយឆុត)?\s*(?:ប៉ុន្មាន|លក់ម៉េច|ម៉េច|ម៉ាន|មាណ|លក់អត់|មានលក់|អស់នៅ|អស់ហើយ|សុំមើល)/i.test(s);
  if (isOutfitInquiry) {
    return [];
  }

  const isWeightSizeQuestion = /(?:ម៉ាន|មាណ|ប៉ុន្មាន|ប៉ុន្នាន)\s*(?:គីឡូ|kg|kilo)|ពាក់បាន|ពាក់ដល់|ពាក់ចុះ|ស្លៀកបាន|ស្លៀកដល់|ស្លៀកចុះ|មានសាយអីខ្លះ/i.test(s);
  if (isWeightSizeQuestion && !hasExplicitOrderPattern) {
    return [];
  }

  const isQuestionOnly = /(?:\?|ប៉ុន្មាន|ពាក់បាន|ពាក់ចុះ|លក់ម៉េច|ម៉េចដែរ|ចុះថ្លៃ|សល់អត់|អស់នៅ|អស់ហើយ|សុំមើល|មើលអាវ|មើលខោ|មាន[\s\u1780-\u17FF]{0,25}(?:អត់|ទេ|អីខ្លះ)|មានអត់|មានទេ|មានច្រើនពណ)/i.test(s) && !hasExplicitOrderPattern;
  if (isQuestionOnly) {
    return [];
  }

  // 🎯 Clean address numbers first so address numbers (National Road 4, Borey 2, etc.) are NEVER extracted as product codes
  s = s.replace(RE_ADDRESS_NUMBERS_CLEANUP, ' ');

  // Strip fallback waist size instructions like "អត់ 34 យក 33" ("if out of 34, take 33")
  s = s.replace(/(?:បើ)?អត់\s*(?:សាយ|លេខ|ចង្កេះ)?\s*(?:2[4-9]|3[0-9]|4[0-6])\s*(?:យក|ដាក់)\s*(?:សាយ|លេខ|ចង្កេះ)?\s*(?:2[4-9]|3[0-9]|4[0-6])/gi, ' ');

  // Strip waist range after explicit action quantity (e.g. "1 យក 6 32- 38", "2 យក 6 28- 33", "4 យក 6 28-33", "1=5/28_32")
  s = s.replace(/((?:យក|កាត់|ថែម|ដាក់|កក់|=)\s*\d{1,2})\s*[\s\/,]+\s*(?:2[4-9]|3[0-9]|4[0-6])\s*(?:ដល់|ដល|-|_)\s*(?:2[4-9]|3[0-9]|4[0-6])\b/gi, '$1 ');

  // Normalize "1. = 2" -> "1=2" and "54x1" -> "54=1"
  s = s.replace(/(\d{1,4})\s*\.\s*=\s*(\d{1,2})/g, '$1=$2');
  s = s.replace(/(?<![A-Za-z0-9])(\d{1,4}|[A-Za-z]\d{1,3})\s*[xX*]\s*(0?[1-9]|1[0-9]|20)\b/g, '$1=$2');

  // Normalize "សាយ 32 យក 2" -> "សាយ 32=2" so multi-waist sub-quantities sum them properly
  s = s.replace(/(សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|លេខ|ទំហំ)\s*(2[4-9]|3[0-9]|4[0-6])\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\s*(\d{1,2})/gi, '$1 $2=$3 ');

  // 🎯 Code / Weight protection BEFORE slash splitting: (e.g. 27/65គីឡូ, 28/65, 28/60, 30/65)
  s = s.replace(/(?<![=:\.\d])([A-Za-z]\d{1,3}|\d{1,4})\s*[\/\\]\s*(4[0-9]|[5-9][0-9]|1[0-2][0-9])(?:\s*(?:kg|kilo|gk|គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គក|គីឡូក្រាម))?\b/gi, '$1=1 គីឡូ $2 ');
  s = s.replace(/(?<![=:\.\d])([A-Za-z]\d{1,3}|\d{1,4})\s*-\s*(4[0-9]|[5-9][0-9]|1[0-2][0-9])(?:\s*(?:kg|kilo|gk|គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គក|គីឡូក្រាម))\b/gi, '$1=1 គីឡូ $2 ');
  s = s.replace(/(?<![=:\.\d])([A-Za-z]\d{1,3}|\d{1,4})\s*(?:គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គក)\s*(4[0-9]|[5-9][0-9]|1[0-2][0-9])\b/gi, '$1=1 គីឡូ $2 ');

  // 🎯 Waist range: (e.g. "24 28ដល់33", "24 28ដល32=10", "2,28ដល32,10ខោ", "28ដល់33")
  s = s.replace(/(?<![=:\.\d])(?:([A-Za-z]\d{1,3}|\d{1,4})\s*[,/:\s\-=]?\s*)?(2[4-9]|3[0-9]|4[0-6])\s*(?:ដល់|ដល)\s*(2[4-9]|3[0-9]|4[0-6])(?:\s*[:=,]\s*(\d{1,2})\s*(?:ខោ|អាវ|ឈុត)?)?/gi, (m, code, w1, w2, q) => {
    if (code) {
      return `${code}=${q || 1} `;
    }
    return ' ';
  });

  // 🎯 Action + Qty + Code: (e.g. ថែម 2. 54 or ថែម 2 54)
  s = s.replace(/(?:ថែម|កាត់|កក់|ដាក់|យក)\s*(\d)\s*[.\s]+\s*(\d{2,4}|[A-Za-z]\d{1,3})/gi, '$2=$1');

  // 🎯 2. Code + Multi-waist specifications with sub-quantities:
  // e.g. "111,28=2,29=2", "24 28=2 29=2", "124=28=2 30=2 32=3 33=1", "142,31,1,32,1,33,1", "43=4 សាយ32=3 សាយ31=1", "24=3. 29=1. 30=1. 31=1", "24 យកលេខ 30=1 31=1 32=1 33=1", "កូត9=3(32=2. 34=1 )"
  const multiWaistWithSubQty = /(?<![A-Za-z0-9=\/])([A-Za-z]\d{1,3}|\d{1,4})(?:\s*(?:=|(?:យក|កាត់|ថែម|ដាក់|កក់)\s*[:=]?)\s*(0?[1-9]|1[0-9]|20)(?=[\s.,(]))?\s*[:=,\s.\-()]*\s*(?:(?:យក|កាត់|ថែម|ដាក់|កក់)\s*)?(?:(?:ពណ៌|ពណ៍|ពណ៏)\s*[^\s\d]+\s*)?(?:(?:(?:លេខ|សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ទំហំ)?\s*(?<!\d)(?:2[4-9]|3[0-9]|4[0-6])\s*(?:[:=.]\s*(0?[1-9]|1[0-9]|20)|[.,\s]\s*([1-9]))(?!\d)\s*(?:ពណ៌|ពណ៍|ពណ៏|ពណ|ខោ|អាវ|ឈុត)?)\s*[,/+\-\s.()&]*)+/gi;
  s = s.replace(multiWaistWithSubQty, (fullMatch, code, existingTotal) => {
    const hasExplicitWaistWord = /(?:លេខ|សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ទំហំ)/i.test(fullMatch);
    const hasEqualsOrCommaSub = /(?:2[4-9]|3[0-9]|4[0-6])\s*[:=,]\s*\d/.test(fullMatch);
    if (!existingTotal && !hasExplicitWaistWord && !hasEqualsOrCommaSub) {
      return fullMatch;
    }
    const subRegex = /(?:លេខ|សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ទំហំ)?\s*(?<!\d)(2[4-9]|3[0-9]|4[0-6])\s*(?:[:=.]\s*(0?[1-9]|1[0-9]|20)|[.,\s]\s*([1-9]))(?!\d)/gi;
    let sm: RegExpExecArray | null;
    let totalQty = 0;
    let count = 0;
    while ((sm = subRegex.exec(fullMatch)) !== null) {
      count++;
      const q = sm[2] || sm[3];
      totalQty += parseInt(q, 10) || 1;
    }
    if (count < 2 && !hasExplicitWaistWord) {
      return fullMatch;
    }
    if (existingTotal) {
      return `${code}=${existingTotal} `;
    }
    if (count > 0 && totalQty > 0) {
      return `${code}=${totalQty} `;
    }
    return fullMatch;
  });

  // 🎯 3. Code + Multiple pants sizes list (e.g. "87 Size 29, 30,31,32", "24 យក 28 29 30 31 32 33", "2=3 សាយ 29 34=2", "1=32-34-36", "4-30-32", "43=28និង30", "កូត1 យក 4. 29. 31. 32. 34.")
  const multiWaistListRegex = /(?<![A-Za-z0-9=\/])([A-Za-z]\d{1,3}|\d{1,4})(?:\s*(?:=|(?:យក|កាត់|ថែម|ដាក់|កក់)\s*[:=]?)\s*(0?[1-9]|1[0-9]|20)(?!\s*[-_\/]))?\s*[,/:\s.\-=]?\s*(?:(?:យក|កាត់|ថែម|ដាក់|កក់)\s*)?(?:លេខ|សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ស្លឹក|ទំហំ)?\s*[:=\s\-]?\s*((?:(?<!\d)(?:2[4-9]|3[0-9]|4[0-6])\s*(?:[:=xX]\s*\d{1,2})?(?:\s*(?:និង|[\/+,.:\-_])\s*|\s+)?){2,})/gi;
  const singleWaistListRegex = /(?<!\d)(2[4-9]|3[0-9]|4[0-6])(?:\s*[:=xX]\s*(\d{1,2}))?/gi;

  s = s.replace(multiWaistListRegex, (fullMatch, code, existingTotal, listPart) => {
    let wm: RegExpExecArray | null;
    let totalQty = 0;
    let count = 0;
    while ((wm = singleWaistListRegex.exec(listPart)) !== null) {
      count++;
      const qty = wm[2] ? (parseInt(wm[2], 10) || 1) : 1;
      totalQty += qty;
    }
    if (count >= 2 && totalQty > 0) {
      return `${code}=${existingTotal || totalQty} `;
    }
    return fullMatch;
  });

  // Code + Qty + Dash/Space/Slash/Dot/Plus + Waist: "94=1-34", "94=2-34", "94=1 34", "23=1. 30", "2=3/32", "43=2+ 32", "1=2យកពីរពណ៍ យក 33"
  s = s.replace(/(?<![=:\d])([A-Za-z]\d{1,3}|\d{1,4})\s*[:=]\s*(\d{1,2})(?:\s*(?:ពីរ|បី|បួន|ប្រាំ)?\s*(?:ពណ៌|ពណ៍|ពណ៏|ពណ))?\s*[-_\s.,\/+]+\s*(?:(?:យក|កាត់|ដាក់)\s*)?(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ស្លឹក|ទំហំ|លេខ)?\s*(?:2[4-9]|3[0-9]|4[0-6])(?!\d|\s*[:=]\s*\d)\b/gi, '$1=$2 ');

  // 🎯 Normalize dash (-) and underscore (_) notations BEFORE waist keyword rules:
  // e.g. "28-10គ្រុបពណ" -> "28=10", "ថែ45-2សាយ31" -> "45=2", "105_2" -> "105=2", "8-10" -> "8=10", "5_4" -> "5=4", "70-71" -> "70=1 71=1"
  s = s.replace(/(?<![=:\.\/\-_\d])(\d{1,4}|[A-Za-z]\d{1,3})\s*[-_]+\s*(\d{1,3})(?![=:\.\-_\d])/g, (match, p1, p2) => {
    const qty = parseInt(p2, 10);
    if (qty >= 1 && qty <= 20) {
      return `${p1}=${p2}`;
    }
    if (qty >= 24 && qty <= 46) {
      const c1 = parseInt(p1, 10);
      if (!isNaN(c1) && c1 >= 24 && c1 <= 46 && qty > c1) {
        return ' ';
      }
      return `${p1}=1 `;
    }
    if (qty >= 47) {
      return `${p1}=1 ${p2}=1`;
    }
    return `${p1}=${p2}`;
  });

  // 🎯 0. Code / Qty + Waist Keyword + Waist (e.g. "1/2 សាយ31", "4/1 សាយ32", "9/2សាយ32", "23/1សាយ32", "119/1សាយ29")
  s = s.replace(/(?<![=:\.\d])([A-Za-z]\d{1,3}|\d{1,4})\s*\/\s*(\d{1,2})\s*(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ចង្កោះ|ស្លឹក|ទំហំ|លេខ)\s*[:=\s\-]?\s*(?:2[4-9]|3[0-9]|4[0-6])\b/gi, '$1=$2 ');

  // 🎯 1. Code + Waist Keyword + Waist + Comma/Space/= + Qty (e.g. "1,សាយ31,2", "កូដ4=ចង្កេះ29=1", "51 សាយ 34 2")
  s = s.replace(/(?<![=:\.\/\-_\d])([A-Za-z]\d{1,3}|\d{1,4})\s*[,/:\s\-=]?\s*(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ចង្កោះ|ស្លឹក|ទំហំ|លេខ)\s*[:=\s\-]?\s*(2[4-9]|3[0-9]|4[0-6])\s*[,/:\s\-=]\s*(?:យក|កាត់|ថែម|ដាក់|កក់)?\s*[:=\s]?\s*(0?[1-9]|1[0-9]|20)(?!\d)/gi, '$1=$3 ');

  // 🎯 4. Code / Waist protection BEFORE generic slash splitting: (e.g. 124/28, 124/31, 94\35)
  s = s.replace(/(?<![=:\.\d])([A-Za-z]\d{1,3}|\d{1,4})\s*[\/\\]\s*(2[4-9]|3[0-9]|4[0-6])(?!\d)/gi, '$1=1 ');

  // 🎯 5. Code + លេខ/size + Waist (without trailing qty): (e.g. 23លេខ 34, 24លេខ34, 24 លេខ33, 43=1លេខ 31, 43លេខ36, 45លេខ28)
  s = s.replace(/(?<![=:\.\/\-_\d])([A-Za-z]\d{1,3}|\d{1,4})\s*(?:=1)?\s*(?:លេខ|សាយ|សាត|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ចង្កោះ|ទំហំ)\s*(2[4-9]|3[0-9]|4[0-6])(?!\d|\s*[,=:]\s*\d)/gi, '$1=1 ');

  // 🎯 Color + quantity cleanup: strip color counts so single digits like '1' are never extracted as code 1 (e.g. 56=2គគី១ខ្មៅ១, V07=2 ខ្មៅ១ ត្នោត១)
  const COLOR_TERMS = 'ខ្មៅ|ក្រម៉ៅ|ក្រហម|ខៀវ|លឿង|ផ្កាឈូក|ស្វាយ|បៃតង|ត្នោត|ប្រផេះ|ប្រជេះ|ទឹកដោះគោ|សូកូឡា|សុកុឡា|កាហ្វេ|ឈាមជ្រូក|គគី|ផ្ទៃមេឃ|ឈាមមាន់|ស';
  s = s.replace(new RegExp(`(?:${COLOR_TERMS})\\s*[:=\\s\\-]?\\s*(\\d{1,2})`, 'gi'), ' ');

  // 🎯 Size + Qty attached (e.g. 150_2M -> 150=2, 61យកM1 -> 61=1)
  s = s.replace(/([A-Za-z0-9]{1,5})\s*[:=_]\s*(\d{1,2})\s*(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\b/gi, '$1=$2 ');
  s = s.replace(/([A-Za-z0-9]{1,5})\s*(?:យក|កាត់|ថែម|ដាក់|កក់)?\s*(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\s*(\d{1,2})/gi, '$1=$2 ');

  // 🎯 Guillemet conversion for chained orders like "92»1»99»1»102»1", "29»1", "36»2", "3»2"
  s = s.replace(/([A-Za-z0-9]{1,5})\s*[»«]+\s*(\d{1,2})/g, '$1=$2 ');

  // 🎯 Normalize dot and slash notations:
  // For quantities (<=12), "47.1" -> "47=1", "47/2" -> "47=2".
  // If single digit before dot and waist 24..46 after dot (e.g. "1.30"), treat as Code 1, waist 30 -> "1=1".
  // If the number after dot is >=13 (e.g. "58.56", "40.54"), they are TWO product codes!
  s = s.replace(/(?<![=:\d])(\d{1,4}|[A-Za-z]\d{1,3})\.{1,3}(\d{1,2})(?![=:\d])/g, (match, p1, p2) => {
    const qty = parseInt(p2, 10);
    if (/^\d$/.test(p1) && qty >= 24 && qty <= 46) {
      return `${p1}=1 `;
    }
    if (qty >= 13) {
      return `${p1}=1 ${p2}=1`;
    }
    return `${p1}=${p2}`;
  });
  s = s.replace(/(?<![=:\d])(\d{1,4}|[A-Za-z]\d{1,3})\/+(\d{1,2})(?![=:\d])/g, (match, p1, p2) => {
    const qty = parseInt(p2, 10);
    if (qty >= 24 && qty <= 46) {
      return `${p1}=1 `;
    }
    if (qty >= 47 && qty <= 120) {
      return `${p1}=1 គីឡូ ${p2} `;
    }
    if (qty >= 13) {
      return `${p1}=1 ${p2}=1`;
    }
    return `${p1}=${p2}`;
  });

  // 🎯 Code attached to weight (e.g. "30=80kg" -> "30=1 គីឡូ 80", "137kg70=1" -> "137=1 គីឡូ 70", "124Kg40" -> "124=1 គីឡូ 40")
  s = s.replace(/(?<![=:\.\d])([A-Za-z]\d{1,3}|\d{1,4})\s*[:=]\s*(\d{2,3})\s*(?:kg|kilo|gk|គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គក|គឺទូ)\b/gi, '$1=1 គីឡូ $2 ');
  s = s.replace(/(?<![=:\.\d])([A-Za-z]\d{1,3}|\d{1,4})\s*(?:kg|kilo|gk|គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គក|គឺទូ)\s*[:=\s\-_/]?\s*(\d{2,3})\s*[:=\s]\s*(\d{1,2})/gi, '$1=$3 គីឡូ $2 ');
  s = s.replace(/(?<![=:\.\d])([A-Za-z]\d{1,3}|\d{1,4})\s*(?:kg|kilo|gk|គីឡូ|គឺឡូ|កីឡូ|គីឡ|គឺឡ|គក|គឺទូ)\s*[:=\s\-_/]?\s*(\d{2,3})(?!\d)/gi, '$1=1 គីឡូ $2 ');

  // Clean measurements
  s = s.replace(RE_MEASUREMENTS_CLEANUP, ' ');

  // 🎯 Protect item separators between distinct items: "50=2 .51=1" or "50=2/51=1" or "12=1-13=1" or "74.1+77 1" -> "50=2 51=1"
  s = s.replace(/([:=]\s*\d{1,2})\s*[\/.,;\-_+~»«]+\s*([A-Za-z0-9])/g, '$1 $2');

  // Handle merged qty + size format (e.g. "24=13XL" -> "24=1 3XL", "24=12XL" -> "24=1 2XL")
  s = s.replace(/([:=])\s*(\d)(?:3XL|2XL|4XL|5XL|6XL|XXL|XXS|XL|XS|[SML]|FS|FREESIZE)\b/gi, '$1$2 ');

  // 🎯 Code + Qty with Unit (e.g. "118 3អាវ", "118 3 អាវ", "យក118 3អាវ", "118 1ខោ")
  s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*[:=\s]+\s*(\d{1,2})\s*(?:អាវ|ខោ|ឈុត|កំប៉ុង|ក្បាល|គូ|កញ្ចប់|ពណ៌|ពណ)/gi, '$1=$2 ');

  // 5. Code + Qty + Explicit Waist Keyword + Waist: "94=2 ចង្កេះ34", "94=2 ចង្កះ34", "51=2 សាយ 34", "51 2 size 34"
  s = s.replace(/(?<![=:\d])([A-Za-z]\d{1,3}|\d{1,4})\s*[:=\s]\s*(\d{1,2})\s*(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ចង្កោះ|ស្លឹក|ទំហំ|លេខ)\s*[:=\s]*(?:2[4-9]|3[0-9]|4[0-6])\b/gi, '$1=$2');

  // 6. Code + Explicit Waist Keyword without explicit qty: "1,សាយ30", "2/សាយ33", "94 ចង្កះ36", "94 ចង្កេះ36", "47 សាយ 34", "51 size 32" -> Code 94, waist 36, qty 1
  s = s.replace(/(?<![=:\.\/\-_\d])([A-Za-z]\d{1,3}|\d{1,4})\s*[,/:\s\-]?\s*(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ចង្កោះ|ស្លឹក|ទំហំ|លេខ)\s*[:=\s]*(?:2[4-9]|3[0-9]|4[0-6])(?!\d)/gi, '$1=1');

  // 🎯 Code + Multi-Size or Clothing Size with Quantity:
  // e.g. "30L1 XL1" -> Code 30, L=1, XL=1 -> "30=2", "136,S,1,M,1,L,1" -> "136=3"
  const multiSizeWithQtyRegex = /(?<![A-Za-z0-9])([A-Za-z]\d{1,3}|\d{1,4})\s*(?:សាយ|size|ពណ៌|ពណ)?\s*[:=,\s\-]?\s*((?:(?:6XL|5XL|4XL|3XL|2XL|XXL|XXS|XL|XS|[SML]|FS|FREESIZE)\s*[:=,\s\-]?\s*(?:\d{1,2})?(?:\s*[\/+,និង\s]?\s*)?)+)(?![A-Za-z])/gi;

  s = s.replace(multiSizeWithQtyRegex, (fullMatch, code, sizesPart) => {
    let sm: RegExpExecArray | null;
    let totalQty = 0;
    const sRegex = /(6XL|5XL|4XL|3XL|2XL|XXL|XXS|XL|XS|[SML]|FS|FREESIZE)\s*[:=,\s\-]?\s*(\d{1,2})?/gi;
    let count = 0;
    while ((sm = sRegex.exec(sizesPart)) !== null) {
      count++;
      const q = sm[2] ? (parseInt(sm[2], 10) || 1) : 1;
      totalQty += q;
    }
    if (count > 0 && totalQty > 0) {
      return `${code}=${totalQty} `;
    }
    return fullMatch;
  });

  // Code + Qty + Size: "47=2 XL", "47 2 size L"
  s = s.replace(/(?<![=:\d])([A-Za-z]\d{1,3}|\d{1,4})\s*[:=\s]\s*(\d{1,2})\s*(?:សាយ|size|ពណ៌|ពណ)?\s*(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\b/gi, '$1=$2');

  // Strip standalone waist size indicators from string so remaining waist numbers are NEVER extracted as product codes
  s = s.replace(/(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ចង្កោះ|ស្លឹក|ទំហំ|លេខ)\s*[:=\s]*(?:2[4-9]|3[0-9]|4[0-6])\b/gi, ' ');
  s = s.replace(/\b(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|FREESIZE)\b/gi, ' ');

  // 🎯 Normalize Cambodian live selling order patterns to standard CODE=QTY format:
  // 0. Handle pattern: Leading code + address/location/phone in middle + trailing action quantity
  // E.g. "58នៅជិតផ្សារបែកចាន*********យក20អាវ" -> "58=20 នៅជិតផ្សារបែកចាន*********"
  s = s.replace(/^([A-Za-z0-9]{1,5})\b([\s\S]+?)(?:យក|កាត់|ថែម|ដាក់|កក់|សុំ)\s*(\d{1,2})\s*(?:អាវ|ខោ|ឈុត|ឆុត|កំប៉ុង|កញ្ចប់|ដប|គូ|កេស|ដើម|ប្រអប់|ក្បាល|បន្ទះ|ថង់)?[\s\-_.*]*$/i, (match, p1, p2, p3) => {
    if (p2.trim().length < 2 || /\d/.test(p2)) return match;
    return `${p1}=${p3} ${p2}`;
  });

  // 1. Chained order notation: e.g. "33=1=34=2=78=1=97=1=150=1" -> "33=1 34=2 78=1 97=1 150=1"
  s = s.replace(/(\d{1,4}|[A-Za-z]\d{1,3})\s*[:=]\s*(\d{1,2})\s*[:=]\s*(?=[A-Za-z0-9])/g, '$1=$2 ');

  // 2. Colon with action verb e.g. "63:ថែម1", "64:ថែម1", "63:យក2" -> "63=1", "63=2"
  s = s.replace(/(\d{1,4}|[A-Za-z]\d{1,3})\s*[:=]\s*(?:ថែម|យក|កាត់|ដាក់|កក់)\s*(\d{1,2})/gi, '$1=$2');

  // 3. Action words with code and quantity: "47 យក 2", "47យក3", "ថែម55,យក2", "47 យក ២ពណ៌", "៦យក៣", "កូដ1យក=2" -> "47=2", "55=2", "6=3", "1=2"
  s = s.replace(/(?<!\d)(\d{1,4}|[A-Za-z]\d{1,3})\s*[,.\s]*\s*(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\s*[:=]?\s*(\d{1,2})(?!\d)/gi, '$1=$2');

  // 4. Action prefix with code and quantity: "ថែម 47=1", "ថែម47=1", "យក 47=2", "ថែមកូត43=3" -> "47=1", "47=2", "43=3"
  s = s.replace(/(?:ថែម|កាត់|កក់|ដាក់|យក)\s*(?:លេខ)?(?:កូដ|កូត|code)?\s*(\d{1,4}|[A-Za-z]\d{1,3})\s*[:=]\s*(\d{1,2})/gi, '$1=$2');

  // 5. Code prefix with quantity: "កូដ 47 1", "កូដ47=2", "code 47 1", "កូត11=1" -> "47=1", "47=2"
  s = s.replace(/(?:កូដ|កូត|code)\s*(\d{1,4}|[A-Za-z]\d{1,3})\s*[:=\s]\s*(\d{1,2})(?!\d)/gi, '$1=$2');

  // 6. Action word with space then quantity: "យក 47 2", "កាត់ 47 1" -> "47=2", "47=1"
  s = s.replace(/(?:ថែម|កាត់|កក់|ដាក់|យក)\s*(\d{1,4}|[A-Za-z]\d{1,3})\s+(\d{1,2})(?!\d)/gi, '$1=$2');

  // 7. Action word or code prefix before code WITHOUT quantity e.g. "ថែម២១", "ថែម39", "ថែម 54", "យក36", "ថែមកូត5", "កូដ 5" -> "39=1", "36=1", "5=1"
  s = s.replace(/(?:(?:ថែម|កាត់|កក់|ដាក់|យក)\s*(?:លេខ)?(?:កូដ|កូត|code)?|(?:កូដ|កូត|code))\s*([A-Za-z]\d{1,3}|\d{1,4})(?!\d|\s*[:=\-_/]\s*\d|\s*(?:យក|កាត់|ថែម|ដាក់|កក់)\s*\d|\s*(?:kg|kilo|gk|គីឡូ|cm|inch|សង់ទី|ហ៊ុន))/gi, (match, p1) => {
    // If single digit (1-9), require explicit code keyword OR explicit action like ថែម/យក
    if (/^\d$/.test(p1) && !/(?:កូដ|កូត|code|ថែម|កាត់|កក់|យក)/i.test(match)) {
      return match;
    }
    return `${p1}=1 `;
  });

  // 8. Code before action word WITHOUT quantity e.g. "36.យក", "36.យកក្រហម", "36 យក", "36យក", "36កាត់", "36ថែម" -> "36=1 "
  s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{2,4})\s*(?:\.|\s+)?\s*(?:ថែម|កាត់|កក់|ដាក់|យក)(?!\s*\d|\s*[:=\-_/]\s*\d|\s*(?:kg|kilo|gk|គីឡូ|cm|inch|សង់ទី|ហ៊ុន))/gi, '$1=1 ');

  const pairs: ExtractedItemPair[] = [];
  const seenCodes = new Set<string>();

  const sortedCatalog = (catalogProducts || [])
    .filter(p => p.code && p.code.trim().length > 0)
    .sort((a, b) => b.code.length - a.code.length);

  const catalogCodeSet = new Set<string>();
  (catalogProducts || []).forEach(p => {
    if (!p.code) return;
    const clean = p.code.toUpperCase().trim();
    catalogCodeSet.add(clean);
    if (/^0\d+$/.test(clean)) {
      catalogCodeSet.add(clean.replace(/^0+/, ''));
    }
  });

  // 🌟 PASS 1: Extract all explicit patterns like CODE=QTY anywhere in the comment text!
  // e.g. "50=2 .51=1", "47=2", "47:1", "47=2លាយពណ៌", "30=80", "94=34"
  const explicitGlobalRegex = /(?:(?<=^|[^\w])([A-Za-z0-9]{1,5})\s*[:=]\s*(\d{1,3})(?!\d))/gi;
  let match: RegExpExecArray | null;

  while ((match = explicitGlobalRegex.exec(s)) !== null) {
    const rawCode = match[1].toUpperCase().trim();
    let qty = parseInt(match[2], 10) || 1;
    qty = sanitizeRetailQuantity(rawCode, qty, text);

    // In Strict Mode, only accept codes in catalog; in Auto Mode, accept any valid alphanumeric code
    if (strictCatalog && !catalogCodeSet.has(rawCode)) {
      continue;
    }

    if (!NON_PRODUCT_CODES.has(rawCode) && !seenCodes.has(rawCode)) {
      pairs.push({ code: rawCode, qty });
      seenCodes.add(rawCode);
      // Blank out matched portion so quantity is never re-extracted as a separate code in later passes
      s = s.substring(0, match.index) + ' '.repeat(match[0].length) + s.substring(match.index + match[0].length);
    }
  }

  // 🌟 PASS 2: Loose code + qty separated by space (e.g. "47 2", "47 1 ខ្មៅ", "30 80")
  const looseCodeQtyRegex = /(?<=^|[^\w])(\d{2,4}|[A-Za-z]\d{1,3})\s+(\d{1,3})(?!\d)/g;
  while ((match = looseCodeQtyRegex.exec(s)) !== null) {
    const rawCode = match[1].toUpperCase().trim();
    let qty = parseInt(match[2], 10) || 1;
    qty = sanitizeRetailQuantity(rawCode, qty, text);

    if (strictCatalog && !catalogCodeSet.has(rawCode)) {
      continue;
    }

    if (!NON_PRODUCT_CODES.has(rawCode) && !seenCodes.has(rawCode)) {
      pairs.push({ code: rawCode, qty });
      seenCodes.add(rawCode);
      s = s.substring(0, match.index) + ' '.repeat(match[0].length) + s.substring(match.index + match[0].length);
    }
  }

  // 🌟 PASS 3: Known Catalog matching for multiple codes or standalone codes (e.g. "100 101 102", "51សាយL")
  const multiVariantRegex = /\b(XXL|XXS|4XL|3XL|2XL|XL|XS|[SML])\s*(\d{1,2})?\b/gi;
  const validSuffixes = SIZE_COLOR_SUFFIXES.join('|');

  const segments = s.split(/[\n;+,]+|\s+និង\s+|\s{2,}/i);

  for (let seg of segments) {
    seg = seg.trim();
    if (!seg || !/\d/.test(seg)) continue;
    const upperSeg = seg.toUpperCase();

    for (const prod of sortedCatalog) {
      const pCode = prod.code.toUpperCase().trim();
      if (!upperSeg.includes(pCode) || NON_PRODUCT_CODES.has(pCode) || seenCodes.has(pCode)) continue;

      const esc = pCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isSingleDigit = /^\d$/.test(pCode);

      // Single digit codes (1-9) MUST have explicit "កូដ" prefix, assignment (=), action verb, or size/color token
      if (isSingleDigit) {
        const hasExplicitCodePattern = new RegExp(
          `(?:កូដ|កូត|កូ|កូដលេខ|CODE)\\s*${esc}(?![A-Za-z0-9])|` +
          `(?<![A-Za-z0-9])${esc}\\s*[:=]\\s*|` +
          `(?<![A-Za-z0-9])${esc}\\s*(?:យក|កាត់|ថែម|ដាក់|កក់|សុំ|សុំយក)|` +
          `(?<![A-Za-z0-9])${esc}\\s*[/,:]?\\s*(?:សាយ|size|ចង្កេះ|ទំហំ|ពណ៌|ពណ|សូកូឡា|សុកុឡា|កាហ្វេ)(?![A-Za-z0-9\u1780-\u17D2])|` +
          `(?<![A-Za-z0-9])${esc}\\s*[/,:]\\s*\\d`,
          'i'
        ).test(seg);
        if (!hasExplicitCodePattern) {
          continue;
        }
      }

      // If the candidate number is an action quantity like "យក 20 អាវ", do NOT extract as code 20
      const isActionQuantityOnly = new RegExp(`(?:យក|កាត់|ថែម|ដាក់|កក់|សុំ)\\s*${esc}\\s*(?:អាវ|ខោ|ឈុត|ឆុត|កំប៉ុង|កញ្ចប់|ដប|គូ|កេស|ដើម|ប្រអប់|ក្បាល|បន្ទះ|ថង់)?$`, 'i').test(seg);
      const hasExplicitCodePrefix = new RegExp(`(?:កូដ|កូត|កូ|កូដលេខ|CODE)\\s*${esc}(?![A-Za-z0-9])`, 'i').test(seg);
      if (isActionQuantityOnly && !hasExplicitCodePrefix) {
        continue;
      }

      const codePattern = isSingleDigit
        ? `(?:(?:កូដ|កូត|កូ|កូដលេខ|CODE)\\s*)?(${esc})(?![A-Za-z0-9])`
        : `(?<![A-Za-z0-9=:\\/*xX])(${esc})(?![A-Za-z0-9])`;

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
        pairs.push({ code: pCode, qty: sanitizeRetailQuantity(pCode, multiTotalQty, text) });
        seenCodes.add(pCode);
        seg = seg.replace(codeMatch[0], ' ');
        continue;
      }

      const reWithQty = new RegExp(
        `(?:(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)\\s*)?` +
        `(?<!\\d)(${esc})(?!\\d)` +
        `(?:[\\s_-]*(${validSuffixes}))?` +
        `(?:\\s*[:=xX*\\-_.,+«»~]|\\s*(?:យក|កាត់|ថែម|ដាក់|កក់|បូក)|[\\s\\S]*?(?:យក|កាត់|ថែម|ដាក់|កក់|បូក))` +
        `\\s*(\\d{1,3})(?:\\s*(?:អាវ|ខោ|ឈុត|ពណ៌|ពណ))?`,
        'i'
      );

      const matchWithQty = seg.match(reWithQty);
      if (matchWithQty && matchWithQty[3]) {
        let rawQty = parseInt(matchWithQty[3], 10) || 1;
        rawQty = sanitizeRetailQuantity(pCode, rawQty, text);
        pairs.push({ code: pCode, qty: rawQty });
        seenCodes.add(pCode);
        seg = seg.replace(matchWithQty[0], ' ');
        continue;
      }

      pairs.push({ code: pCode, qty: 1 });
      seenCodes.add(pCode);
      seg = seg.replace(codeMatch[0], ' ');
    }
  }

  // 🌟 PASS 4: Pure standalone product code in comment (e.g. "46", "57", "93", "48", "A1") with default qty = 1
  if (pairs.length === 0) {
    const standaloneMatch = s.match(/(?<=^|[^\w])(\d{2,4}|[A-Za-z]\d{1,3})(?=[^\w]|$)/);
    if (standaloneMatch) {
      const bareCode = standaloneMatch[1].toUpperCase().trim();
      if (!NON_PRODUCT_CODES.has(bareCode) && !seenCodes.has(bareCode) && !/^(គីឡូ|ខោ|អាវ|ឈុត|រៀល|ដុល្លារ)$/.test(bareCode)) {
        pairs.push({ code: bareCode, qty: 1 });
        seenCodes.add(bareCode);
      }
    }
  }

  return pairs;
}

/**
 * Checks if a comment is purely contact info (phone/address) or customer chat inquiry,
 * with NO product order intent.
 */
export function isPureContactOrInquiryComment(text: string): boolean {
  if (!text) return true;
  const s = text.trim();
  if (!s) return true;

  // 1. Phone numbers: if comment is purely a Cambodian phone number (e.g. 012345678, លេខ016285098, 099 942032)
  const phoneOnly = s
    .replace(/(?:(?:\+?855[\s.\-()]*|0)[1-9](?:[\s.\-()]*\d){7,8}(?!\d))|(?:លេខ\s*0\d{8,9})|(?:\b0\d{8,9}\b)/gi, '')
    .replace(/^(?:លេខ|phone|tell?|tel|hp|phone\s*number)?:?\s*/i, '')
    .replace(/[\s\-_.,/]+/g, '');
  if (phoneOnly.length === 0) {
    return true;
  }

  // 2. Chat inquiries & questions (e.g. "ខោជើងប៉ាតនិង160mពាក់បានអត់បង", "សួស្តី", "សុំមើល", "លក់ម៉េច", "ប៉ុន្មាន")
  if (/(?:ពាក់បានអត់|ពាក់បានទេ|ពាក់បាន|ស្លៀកបាន|មានអត់|អស់នៅ|អស់ហើយ|លក់ម៉េច|ប៉ុន្មាន|ប៉ុន្មានបង|ប៉ុន្មានចែ|សុំមើល|លើកអាវ|លើកខោ|សាច់ស្អាត|សួស្តី|ជម្រាបសួរ|អរគុណ|បងលើក)/i.test(s)) {
    return true;
  }

  // 3. Pure location comments without order intent (e.g. "ផ្សារព្រែកឯង", "ចោមចៅ", "បែកចាន", "ទួលគោក", "សៀមរាប", "តាកែវ")
  const hasOrderPattern = 
    /(?:(?<=[^\w\u1780-\u17D2]|^)[A-Za-z0-9]{1,5}\s*[:=/\-_*xX»]+\s*[\*\-_=A-Za-z0-9]*)|(?:(?:យក|កាត់|ថែម|ដាក់|កក់)\s*(?:កូដ|code)?[A-Za-z0-9]{1,5})|(?<!\d)([A-Za-z]\d{1,3}|\d{2,4})\s*(?:\.|\s+)?\s*(?:យក|កាត់|ថែម|ដាក់|កក់)|(?:(?:កូដ|កូត|code)\s*[A-Za-z0-9]{1,5})|(?<![A-Za-z0-9])(?:[A-Za-z]\d{1,3}|\d{2,4})(?![A-Za-z0-9])/i.test(s);
  if (!hasOrderPattern) {
    if (/(?:ផ្សារ|បុរី|សង្កាត់|ខណ្ឌ|ក្រុង|ស្រុក|ភូមិ|ភ្នំពេញ|ចោមចៅ|ទឹកថ្លា|បែកចាន|ទួលគោក|ដង្កោ|សៀមរាប|បាត់ដំបង|កំពង់ចាម|កំពង់ស្ពឺ|តាកែវ|កំពត|ព្រៃវែង|ស្វាយរៀង|វីរៈប៊ុនថាំ|j&t|flash|បសេដ្ឋ|បរសេដ្ឋ|ទន្លាប់|ឈូកវ៉ា)/i.test(s)) {
      return true;
    }
  }

  return false;
}

/**
 * Intelligently find the exact customer comment that corresponds to a given product code.
 * Prevents false matches where the number is an address milestone (e.g. គីឡូ55, ផ្លូវ4, ផ្ទះ12),
 * phone number, waist size (ចង្កេះ29), or belongs to another product code.
 */
export function findBestMatchingCommentForCode(
  comments: string[] | undefined,
  targetCode: string,
  catalogProducts?: { code: string; live_id?: string }[]
): string | null {
  if (!comments || comments.length === 0 || !targetCode) return null;

  const cleanTarget = convertKhmerDigitsToArabic(targetCode).trim().toUpperCase();
  if (!cleanTarget) return null;

  let bestComment: string | null = null;
  let bestScore = -9999;

  for (const rawComment of comments) {
    if (!rawComment || !rawComment.trim()) continue;
    const comment = rawComment.trim();
    const s = convertKhmerDigitsToArabic(comment).toUpperCase();

    let score = 0;

    // 1. Highest priority: extractCodeQtyPairsFromComment extracted this exact code!
    const pairs = extractCodeQtyPairsFromComment(comment, catalogProducts, false);
    const hasParsedPair = pairs.some(p => p.code.toUpperCase() === cleanTarget);
    if (hasParsedPair) {
      score += 1000;
    }

    // 2. Explicit code keyword (e.g. កូត55, កូដ55, កុត55, code55, ថែមកូត55, ថែមកូដ55, ថែម55, លេខ55, #55)
    const explicitPrefixRegex = new RegExp(`(?:កូដ|កូត|កុត|code|លេខ|ថែមកូដ|ថែមកូត|ថែម|ដាក់|កាត់|កក់|#)\\s*[:#-]?\\s*${cleanTarget}(?!\\d)`, 'i');
    if (explicitPrefixRegex.test(s)) {
      score += 500;
    }

    // 3. Explicit action / assignment (e.g. 55=2, 55យក2, 55x2, 55:2)
    const explicitActionRegex = new RegExp(`(?:^|\\D)${cleanTarget}\\s*(?:[:=xX*»]|យក|កាត់|ថែម|ដាក់|កក់)\\s*\\d+`, 'i');
    if (explicitActionRegex.test(s)) {
      score += 400;
    }

    // 4. Check for false positives:
    // a. Milestone / Location / Address prefix (e.g. គីឡូ55, ផ្លូវ55, ផ្ទះ55, ភូមិ5, គីឡូម៉ែត្រ55)
    const isLocationAddress = new RegExp(`(?:គីឡូ|គឺឡូ|កីឡូ|គីឡូម៉ែត្រ|គីឡូលេខ|ផ្លូវ|ផ្ទះ|បន្ទប់|ជាន់|ភូមិ|ក្រុម|ច្រក|សង្កាត់|ខណ្ឌ|បុរី)\\s*${cleanTarget}(?!\\d)`, 'i').test(s);
    if (isLocationAddress && !explicitPrefixRegex.test(s) && !hasParsedPair) {
      score -= 2000; // heavily penalize location/milestone numbers
    }

    // b. Waist / Pants Size prefix (e.g. ចង្កេះ29, size29, សាយ29)
    const isWaistOrSize = new RegExp(`(?:ចង្កេះ|ចង្កះ|ចង្កែះ|size|សាយ|ទំហំ|ស្លឹក)\\s*[:=\\s-]*${cleanTarget}(?!\\d)`, 'i').test(s);
    if (isWaistOrSize && !explicitPrefixRegex.test(s) && !hasParsedPair) {
      score -= 2000; // heavily penalize waist size numbers
    }

    // c. Weight indicator (e.g. 55 គីឡូ, 55kg)
    const isWeight = new RegExp(`${cleanTarget}\\s*(?:គីឡូ|គឺឡូ|កីឡូ|គីឡ|គក|kg|kilo)`, 'i').test(s);
    if (isWeight && !explicitPrefixRegex.test(s) && !hasParsedPair) {
      score -= 2000;
    }

    // d. Check if cleanTarget is embedded inside a phone number
    const { phone } = extractPhoneNumber(comment);
    if (phone && phone.includes(cleanTarget) && !explicitPrefixRegex.test(s) && !hasParsedPair) {
      const nonPhoneText = comment.replace(phone, '');
      const nonPhoneNorm = convertKhmerDigitsToArabic(nonPhoneText).toUpperCase();
      if (!new RegExp(`(^|\\D)${cleanTarget}(\\D|$)`).test(nonPhoneNorm)) {
        score -= 2000;
      }
    }

    // e. General standalone match (as low confidence fallback)
    if (new RegExp(`(^|\\D)${cleanTarget}(\\D|$)`).test(s)) {
      score += 50;
    }

    // f. If another explicit code exists in this comment and matches better (e.g. comment has "កូត48" while target is 55)
    if (!hasParsedPair && !explicitPrefixRegex.test(s) && pairs.length > 0 && !pairs.some(p => p.code.toUpperCase() === cleanTarget)) {
      score -= 500; // this comment belongs to another product code!
    }

    if (score > bestScore) {
      bestScore = score;
      bestComment = comment;
    }
  }

  // Only return if score is positive (confidence is valid)
  return bestScore > 0 ? bestComment : null;
}

