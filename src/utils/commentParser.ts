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
  'KG', 'KILO', 'CM', 'PP', 'VIP', 'ABA', 'KHQR', 'USD', 'KHR', 'DOLLAR', 'RIEL',
  'FREE', 'SHIP', 'SET', 'TEL', 'PHONE', 'SIZE', 'COLOR',
  'សាយ', 'ចង្កេះ', 'លេខ', 'ពណ៌', 'ពណ៍', 'អាវ', 'ខោ', 'ឈុត',
  ...CLOTHING_SIZES
]);

export const KHMER_DIGITS_MAP: Record<string, string> = {
  '០': '0', '១': '1', '២': '2', '៣': '3', '៤': '4',
  '៥': '5', '៦': '6', '៧': '7', '៨': '8', '៩': '9'
};

const ACTION_WORDS = ['យក', 'យល', 'ចង់បាន', 'កាត់', 'សុំ', 'ថែម', 'ដាក់', 'កក់', 'បូក', 'សុំយក'];

const SIZE_COLOR_SUFFIXES = [
  'XXL', 'XXS', '4XL', '3XL', '2XL', 'XL', 'XS', 'M', 'L', 'S',
  'ស', 'ខ្មៅ', 'ក្រហម', 'ខៀវ', 'លឿង', 'ផ្កាឈូក', 'ស្វាយ', 'បៃតង', 'ត្នោត', 'ប្រផេះ', 'ទឹកដោះគោ', 'សូកូឡា', 'កាហ្វេ', 'ឈាមជ្រូក'
];

export const RE_PRICE_CLEANUP = /(?:\$\s*\d+(?:[\.,]\d+)?|\b\d+(?:[\.,]\d+)?\s*\$|\b\d+\s*៛|\b\d{4,}\s*(?:រៀល|៛)\b)/gi;
export const RE_MEASUREMENTS_CLEANUP = /(?:\d*\s*(?:kg|kilo|គីឡូ|គីឡូក្រាម|គក)\s*\d*|កម្ពស់\s*\d{2,3}|1\.[4-9]\d?\s*(?:m|ម៉ែត្រ)?\b)/gi;
export const RE_ADDRESS_NUMBERS_CLEANUP = /(?:គំរោង\s*\d+|គម្រោង\s*\d+|ផ្លូវ(?:លេខ|ទី)?\s*\d+[A-Za-z]?|ផ្ទះ(?:លេខ)?\s*\d+|បន្ទប់(?:លេខ)?\s*\d+|ជាន់ទី\s*\d+|ផ្សារ\s*[\u1780-\u17FFa-zA-Z0-9_]+\s*\d*|បុរី\s*[\u1780-\u17FFa-zA-Z0-9_]+\s*\d*|សង្កាត់\s*[\u1780-\u17FFa-zA-Z0-9_]+|ខណ្ឌ\s*[\u1780-\u17FFa-zA-Z0-9_]+|ភូមិ\s*[\u1780-\u17FFa-zA-Z0-9_]+)/gi;

export const RE_CAMBODIAN_PHONE = /(?:\+?855[\s.\-()]*|0)(?:1\d|3[18]|6[016-9]|7[016-9]|8[15-9]|9[0-8])(?:[\s.\-()]*\d){6,7}(?!\d)/i;

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

  // Waist / pants size (e.g. "សាយ 34", "ចង្កេះ 32", "ចង្កះ 36", "size 34", "សាយ34", "លេខ 34", "94\35", "94=1-34")
  const waistMatch = s.match(/(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|លេខ|ស្លឹក)\s*[:=\s]*(\d{2})\b/i) ||
                     s.match(/(?<!\d)[A-Za-z0-9]{1,5}\s*(?:=|\/|\\|-)\s*(?:\d{1,2}\s*[-_]\s*)?(2[4-9]|3[0-9]|4[0-6])\b/i);
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
  } else {
    for (const c of ['ស', 'ខ្មៅ', 'ក្រហម', 'ខៀវ', 'លឿង', 'ផ្កាឈូក', 'ស្វាយ', 'បៃតង', 'ត្នោត', 'ប្រផេះ', 'ទឹកដោះគោ', 'សូកូឡា', 'កាហ្វេ', 'ឈាមជ្រូក']) {
      if (new RegExp(`(?:^|\\s)${c}(?:\\s|$)`).test(text)) {
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

  s = s.replace(/(\d{3,4})\s*\n\s*(\d{3,6})/g, '$1$2');
  s = convertKhmerDigitsToArabic(s);

  s = s.replace(/ឆុត/g, 'ឈុត')
       .replace(/កូត|ខូត|កូក|គូដ/g, 'កូដ')
       .replace(/យល/g, 'យក');

  // Replace Khmer phonetic sizes
  s = s.replace(/សាយ\s*អិល|សាយអិល/gi, ' size L ')
       .replace(/សាយ\s*អ៊ិចអិល|សាយអ៊ិចអិល/gi, ' size XL ')
       .replace(/សាយ\s*អេស|សាយអេស/gi, ' size S ')
       .replace(/សាយ\s*អិម|សាយអិម/gi, ' size M ')
       .replace(/ហ្វ្រីសាយ|freesize/gi, ' FreeSize ');

  // Clean address indicators first so address numbers don't get matched as product codes
  s = s.replace(RE_ADDRESS_NUMBERS_CLEANUP, ' ');

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

export function extractCodeQtyPairsFromComment(
  text: string,
  catalogProducts?: { code: string; live_id?: string }[],
  strictCatalog: boolean = false
): ExtractedItemPair[] {
  if (!text) return [];

  let s = normalizeKhmerText(text);

  const { cleanText: textWithoutPhone } = extractPhoneNumber(s);
  s = textWithoutPhone;

  // 0. GUARD: Pure action + quantity ONLY (e.g. "យក 2", "យក2", "កាត់ 1", "ថែម 2", "ដាក់ 1", "កក់ 2", "យកមួយ", "យកបីអាវ", "យក 1 អាវ")
  // These are comments with quantity intent ONLY, but NO product code! They must NEVER be extracted as product codes "2" or "1"!
  const isPureActionQuantity = /^(?:យក|កាត់|ថែម|ដាក់|កក់|បូក|សុំ|សុំយក)\s*(?:\d{1,2}|មួយឡូ|កន្លះឡូ|ដប់|ប្រាំបួន|ប្រាំបី|ប្រាំពីរ|ប្រាំមួយ|ប្រាំ|បួន|បី|ពីរ|មួយ|មូយ)(?:\s*(?:អាវ|ខោ|ឈុត|កំប៉ុង|ក្បាល|គូ|កញ្ចប់|ពណ៌|ពណ))?$/i.test(s.trim());
  if (isPureActionQuantity) {
    return [];
  }

  // 0. GUARD: Pure size ONLY without product code (e.g. "សាយ 34", "size 34", "ចង្កេះ 34", "សាយ 34 យក 1", "ចង្កេះ 32 យក 2")
  const isPureSizeComment = /^(?:(?:យក|កាត់|ថែម|ដាក់|កក់)\s*)?(?:សាយ|size|ចង្កេះ|លេខ|ស្លឹក)\s*[:=\s]*\d{2}(?:\s*(?:យក|កាត់|ថែម|ដាក់|កក់)?\s*(?:\d{1,2}|មួយ|ពីរ|បី|បួន|ប្រាំ))?(?:\s*(?:អាវ|ខោ|ឈុត|ពណ៌|ពណ))?$/i.test(s.trim());
  if (isPureSizeComment) {
    return [];
  }

  // Clean measurements and prices
  s = s.replace(RE_MEASUREMENTS_CLEANUP, ' ');
  s = s.replace(RE_PRICE_CLEANUP, ' ');
  s = s.replace(RE_ADDRESS_NUMBERS_CLEANUP, ' ');

  // 🎯 Protect item separators between distinct items: "50=2 .51=1" or "50=2/51=1" or "50=2, 51=1" -> "50=2 51=1"
  s = s.replace(/([:=]\s*\d{1,2})\s*[\/.,;]+\s*([A-Za-z0-9])/g, '$1 $2');

  // Handle merged qty + size format (e.g. "24=13XL" -> "24=1 3XL", "24=12XL" -> "24=1 2XL")
  s = s.replace(/([:=])\s*(\d)(?:3XL|2XL|4XL|5XL|6XL|XXL|XXS|XL|XS|[SML]|FS|FREESIZE)\b/gi, '$1$2 ');

  // 🎯 Code + Qty with Unit (e.g. "118 3អាវ", "118 3 អាវ", "យក118 3អាវ", "118 1ខោ")
  s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*[:=\s]?\s*(\d{1,2})\s*(?:អាវ|ខោ|ឈុត|កំប៉ុង|ក្បាល|គូ|កញ្ចប់|ពណ៌|ពណ)/gi, '$1=$2 ');

  // 🎯 Pants / Waist Sizes (e.g. "94=2 ចង្កេះ34", "94 ចង្កះ36", "94=1-34", "94\35", "94/35", "51 សាយ 34 2", "51 size 34 យក 2", "51 ចង្កេះ 32=1", "47 សាយ 34")
  // 1. Code + Qty + Dash/Space + Waist: "94=1-34", "94=2-34", "94=1 34", "94=2-size34"
  s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*[:=]\s*(\d{1,2})\s*[-_\s]\s*(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ស្លឹក)?\s*(?:2[4-9]|3[0-9]|4[0-6])\b/gi, '$1=$2');

  // 2. Code + Explicit Waist Keyword + Waist + Qty: "51 សាយ 34 2", "51 size 34 យក 2", "51 ចង្កេះ 32=1", "94 ចង្កះ 36 2"
  s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ស្លឹក)\s*[:=\s]*\s*(?:2[4-9]|3[0-9]|4[0-6])\s*(?:យក|កាត់|ថែម|ដាក់|កក់)?\s*[:=\s]\s*(\d{1,2})(?!\d)/gi, '$1=$2');

  // 3. Code + Qty + Explicit Waist Keyword + Waist: "94=2 ចង្កេះ34", "94=2 ចង្កះ34", "51=2 សាយ 34", "51 2 size 34"
  s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*[:=\s]\s*(\d{1,2})\s*(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ស្លឹក)\s*[:=\s]*(?:2[4-9]|3[0-9]|4[0-6])\b/gi, '$1=$2');

  // 4. Code + Slash/Backslash/Dash + Waist: "94\35", "94/35", "94-35", "94\34", "94/34" -> Code 94, waist 35, qty 1
  s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*[\/\\]\s*(2[4-9]|3[0-9]|4[0-6])(?!\d)/gi, '$1=1');
  s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*-\s*(2[4-9]|3[0-9]|4[0-6])(?!\d)/gi, '$1=1');

  // 5. Code + Explicit Waist Keyword without explicit qty: "94 ចង្កះ36", "94 ចង្កេះ36", "47 សាយ 34", "51 size 32" -> Code 94, waist 36, qty 1
  s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ស្លឹក)\s*[:=\s]*(?:2[4-9]|3[0-9]|4[0-6])(?!\d)/gi, '$1=1');

  // 🎯 Code + Multi-Size or Clothing Size with Quantity:
  // e.g. "30L1 XL1" -> Code 30, L=1, XL=1 -> "30=2"
  // "30 L1 XL1" -> "30=2", "30L1XL1" -> "30=2"
  // "30 M1 L2" -> "30=3", "30 S1 M1 L1" -> "30=3"
  // "30L2" -> "30=2", "30XL1" -> "30=1", "30M1" -> "30=1", "30S1" -> "30=1"
  const multiSizeWithQtyRegex = /(?<![A-Za-z0-9])([A-Za-z]\d{1,3}|\d{1,4})\s*(?:សាយ|size|ពណ៌|ពណ៍)?\s*[:=\s\-]?\s*((?:(?:6XL|5XL|4XL|3XL|2XL|XXL|XXS|XL|XS|[SML]|FS|FREESIZE)\s*[:=\s\-]?\s*(?:\d{1,2})?(?:\s*[\/+,និង\s]?\s*)?)+)(?![A-Za-z])/gi;

  s = s.replace(multiSizeWithQtyRegex, (fullMatch, code, sizesPart) => {
    let sm: RegExpExecArray | null;
    let totalQty = 0;
    const sRegex = /(6XL|5XL|4XL|3XL|2XL|XXL|XXS|XL|XS|[SML]|FS|FREESIZE)\s*[:=\s\-]?\s*(\d{1,2})?/gi;
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
  s = s.replace(/(?<!\d)([A-Za-z]\d{1,3}|\d{1,4})\s*[:=\s]\s*(\d{1,2})\s*(?:សាយ|size|ពណ៌|ពណ៍)?\s*(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|[SML]|FS|FREESIZE)\b/gi, '$1=$2');

  // Strip standalone waist size indicators from string so remaining waist numbers are NEVER extracted as product codes
  s = s.replace(/(?:សាយ|size|ចង្កេះ|ចង្កះ|ចង្កែះ|ស្លឹក)\s*[:=\s]*(?:2[4-9]|3[0-9]|4[0-6])\b/gi, ' ');
  s = s.replace(/(?:[-_\\\/])\s*(?:2[4-9]|3[0-9]|4[0-6])\b/gi, ' ');
  s = s.replace(/\b(?:XXS|XXL|6XL|5XL|4XL|3XL|2XL|XL|XS|FREESIZE)\b/gi, ' ');

  // 🎯 Normalize Cambodian live selling order patterns to standard CODE=QTY format:
  // 1. Double/single dot: "47..5", "47.1" (only when isolated, not part of decimals)
  s = s.replace(/(?<![=:\d])(\d{1,4}|[A-Za-z]\d{1,3})\.{1,3}(\d{1,2})(?![=:\d])/g, '$1=$2');
  // 2. Slashes: "47/2", "47//2" (for non-waist qty)
  s = s.replace(/(?<![=:\d])(\d{1,4}|[A-Za-z]\d{1,3})\/+(\d{1,2})(?![=:\d])/g, '$1=$2');
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

  const sortedCatalog = (catalogProducts || [])
    .filter(p => p.code && p.code.trim().length > 0)
    .sort((a, b) => b.code.length - a.code.length);
  const catalogCodeSet = new Set(sortedCatalog.map(p => p.code.toUpperCase()));

  // 🌟 PASS 1: Extract all explicit patterns like CODE=QTY anywhere in the comment text!
  // e.g. "50=2 .51=1", "47=2", "47:1", "47=2លាយពណ៌", "បាត់ដំបង ។ 47=2ពណ៌", "47=2 46=1"
  const explicitGlobalRegex = /(?:(?<=^|[^\w])([A-Za-z0-9]{1,5})\s*[:=]\s*(\d{1,2})(?!\d))/gi;
  let match: RegExpExecArray | null;

  while ((match = explicitGlobalRegex.exec(s)) !== null) {
    const rawCode = match[1].toUpperCase().trim();
    const qty = parseInt(match[2], 10) || 1;

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

  // 🌟 PASS 2: Loose code + qty separated by space (e.g. "47 2", "47 1 ខ្មៅ")
  const looseCodeQtyRegex = /(?<=^|[^\w])(\d{2,4}|[A-Za-z]\d{1,3})\s+(\d{1,2})(?!\d)/g;
  while ((match = looseCodeQtyRegex.exec(s)) !== null) {
    const rawCode = match[1].toUpperCase().trim();
    const qty = parseInt(match[2], 10) || 1;

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
    if (!seg) continue;

    for (const prod of sortedCatalog) {
      const pCode = prod.code.toUpperCase().trim();
      if (NON_PRODUCT_CODES.has(pCode) || seenCodes.has(pCode)) continue;

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
        pairs.push({ code: pCode, qty: multiTotalQty });
        seenCodes.add(pCode);
        seg = seg.replace(codeMatch[0], ' ');
        continue;
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
