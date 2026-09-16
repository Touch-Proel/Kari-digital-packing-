import QRCode from 'qrcode';
// @ts-ignore
import jsQR from 'jsqr';

export interface KHQRConfig {
  bankName: string;
  accountNumber: string;
  accountName: string;
  merchantName: string;
  bakongAccountId: string; // e.g. 'abaakhppxxx@abaa' or 'proel_toch@abaa'
  merchantCity: string;
  currency: 'USD' | 'KHR';
  qrMode: 'dynamic' | 'static' | 'original';
  merchantType: 'merchant' | 'individual'; // 'merchant' uses Tag 30 (for ABA account numbers), 'individual' uses Tag 29
  acquiringBank: string; // default 'abaa'
  originalQRString?: string;
  originalQRImageUrl?: string;
  enabled: boolean;
}

export const DEFAULT_KHQR_CONFIG: KHQRConfig = {
  bankName: 'ABA Bank',
  accountNumber: '000474559',
  accountName: 'Proel Toch',
  merchantName: 'Kari Arnett',
  bakongAccountId: 'abaakhppxxx@abaa',
  merchantCity: 'Phnom Penh',
  currency: 'USD',
  qrMode: 'dynamic',
  merchantType: 'merchant',
  acquiringBank: 'abaa',
  enabled: true
};

const STORAGE_KEY = 'pos_khqr_config';

/**
 * Loads the current KHQR store configuration from localStorage
 */
export function getKHQRConfig(): KHQRConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Auto-migrate outdated config values
      if (!parsed.merchantType) {
        parsed.merchantType = 'merchant';
      }
      if (parsed.bakongAccountId === '000474559@aba' || !parsed.bakongAccountId) {
        parsed.bakongAccountId = 'abaakhppxxx@abaa';
      }
      return {
        ...DEFAULT_KHQR_CONFIG,
        ...parsed
      };
    }
  } catch (err) {
    console.error('Failed to read KHQR config from storage:', err);
  }
  return { ...DEFAULT_KHQR_CONFIG };
}

/**
 * Saves KHQR config to localStorage and notifies server
 */
export function saveKHQRConfig(config: Partial<KHQRConfig>): KHQRConfig {
  const current = getKHQRConfig();
  const updated: KHQRConfig = {
    ...current,
    ...config
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // Optional sync to server settings
    fetch('/api/khqr/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }).catch(() => {});
  } catch (err) {
    console.error('Failed to save KHQR config:', err);
  }

  return updated;
}

/**
 * Formats an EMVCo Tag-Length-Value chunk
 */
function formatTag(tag: string, val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === '') return '';
  const str = String(val);
  const len = String(str.length).padStart(2, '0');
  return `${tag}${len}${str}`;
}

// CRC-16 / CCITT Lookup Table
const CRC_TABLE = [
  0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50A5, 0x60C6, 0x70E7,
  0x8108, 0x9129, 0xA14A, 0xB16B, 0xC18C, 0xD1AD, 0xE1CE, 0xF1EF,
  0x1231, 0x0210, 0x3273, 0x2252, 0x52B5, 0x4294, 0x72F7, 0x62D6,
  0x9339, 0x8318, 0xB37B, 0xA35A, 0xD3BD, 0xC39C, 0xF3FF, 0xE3DE,
  0x2462, 0x3443, 0x0420, 0x1401, 0x64E6, 0x74C7, 0x44A4, 0x5485,
  0xA56A, 0xB54B, 0x8528, 0x9509, 0xE5EE, 0xF5CF, 0xC5AC, 0xD58D,
  0x3653, 0x2672, 0x1611, 0x0630, 0x76D7, 0x66F6, 0x5695, 0x46B4,
  0xB75B, 0xA77A, 0x9719, 0x8738, 0xF7DF, 0xE7FE, 0xD79D, 0xC7BC,
  0x48C4, 0x58E5, 0x6886, 0x78A7, 0x0840, 0x1861, 0x2802, 0x3823,
  0xC9CC, 0xD9ED, 0xE98E, 0xF9AF, 0x8948, 0x9969, 0xA90A, 0xB92B,
  0x5AF5, 0x4AD4, 0x7AB7, 0x6A96, 0x1A71, 0x0A50, 0x3A33, 0x2A12,
  0xDBFD, 0xCBDC, 0xFBBF, 0xEB9E, 0x9B79, 0x8B58, 0xBB3B, 0xAB1A,
  0x6CA6, 0x7C87, 0x4CE4, 0x5CC5, 0x2C22, 0x3C03, 0x0C60, 0x1C41,
  0xEDAE, 0xFD8F, 0xCDEC, 0xDDCD, 0xAD2A, 0xBD0B, 0x8D68, 0x9D49,
  0x7E97, 0x6EB6, 0x5ED5, 0x4EF4, 0x3E13, 0x2E32, 0x1E51, 0x0E70,
  0xFF9F, 0xEFBE, 0xDFDD, 0xCFFC, 0xBF1B, 0xAF3A, 0x9F59, 0x8F78,
  0x9188, 0x81A9, 0xB1CA, 0xA1EB, 0xD10C, 0xC12D, 0xF14E, 0xE16F,
  0x1080, 0x00A1, 0x30C2, 0x20E3, 0x5004, 0x4025, 0x7046, 0x6067,
  0x83B9, 0x9398, 0xA3FB, 0xB3DA, 0xC33D, 0xD31C, 0xE37F, 0xF35E,
  0x02B1, 0x1290, 0x22F3, 0x32D2, 0x4235, 0x5214, 0x6277, 0x7256,
  0xB5EA, 0xA5CB, 0x95A8, 0x8589, 0xF56E, 0xE54F, 0xD52C, 0xC50D,
  0x34E2, 0x24C3, 0x14A0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
  0xA7DB, 0xB7FA, 0x8799, 0x97B8, 0xE75F, 0xF77E, 0xC71D, 0xD73C,
  0x26D3, 0x36F2, 0x0691, 0x16B0, 0x6657, 0x7676, 0x4615, 0x5634,
  0xD94C, 0xC96D, 0xF90E, 0xE92F, 0x99C8, 0x89E9, 0xB98A, 0xA9AB,
  0x5844, 0x4865, 0x7806, 0x6827, 0x18C0, 0x08E1, 0x3882, 0x28A3,
  0xCB7D, 0xDB5C, 0xEB3F, 0xFB1E, 0x8BF9, 0x9BD8, 0xABBB, 0xBB9A,
  0x4A75, 0x5A54, 0x6A37, 0x7A16, 0x0AF1, 0x1AD0, 0x2AB3, 0x3A92,
  0xFD2E, 0xED0F, 0xDD6C, 0xCD4D, 0xBDAA, 0xAD8B, 0x9DE8, 0x8DC9,
  0x7C26, 0x6C07, 0x5C64, 0x4C45, 0x3CA2, 0x2C83, 0x1CE0, 0x0CC1,
  0xEF1F, 0xFF3E, 0xCF5D, 0xDF7C, 0xAF9B, 0xBFBA, 0x8FD9, 0x9FF8,
  0x6E17, 0x7E36, 0x4E55, 0x5E74, 0x2E93, 0x3EB2, 0x0ED1, 0x1EF0,
];

/**
 * Calculates 16-bit CRC-CCITT (polynomial 0x1021, init 0xFFFF)
 */
export function calcCRC16(payload: string): string {
  let crc = 0xFFFF;
  const bytes = new TextEncoder().encode(payload);
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    const j = (c ^ (crc >> 8)) & 0xFF;
    crc = CRC_TABLE[j] ^ ((crc << 8) & 0xFFFF);
  }
  return ((crc ^ 0) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

export interface GenerateKHQROptions {
  amount: number;
  currency?: 'USD' | 'KHR';
  billNumber?: string | number;
  storeLabel?: string;
  terminalLabel?: string;
  config?: Partial<KHQRConfig>;
}

/**
 * Generates an NBC-standard Bakong Dynamic KHQR Payload String
 */
export function generateBakongKHQRString(options: GenerateKHQROptions): string {
  const currentCfg = {
    ...getKHQRConfig(),
    ...(options.config || {})
  };

  // If user configured to use original static QR and amount is 0
  if (currentCfg.qrMode === 'original' && currentCfg.originalQRString) {
    if (!options.amount || options.amount <= 0) {
      return currentCfg.originalQRString;
    }
  }

  const isKhr = options.currency === 'KHR';
  const currencyCode = isKhr ? '116' : '840';

  // Format amount
  let formattedAmount = '';
  if (options.amount > 0 && currentCfg.qrMode !== 'static') {
    formattedAmount = isKhr ? String(Math.round(options.amount)) : options.amount.toFixed(2);
  }

  // 1. Tag 00: Payload Format Indicator (Fixed "01")
  let payload = formatTag('00', '01');

  // 2. Tag 01: Point of Initiation Method ("12" = Dynamic with amount, "11" = Static)
  const isDynamic = Boolean(formattedAmount && Number(formattedAmount) > 0);
  payload += formatTag('01', isDynamic ? '12' : '11');

  // 3. Tag 30 (Merchant / Direct ABA Account) OR Tag 29 (Individual Bakong ID)
  // For ABA Bank Accounts (e.g. 000474559), Tag 30 is the official NBC Bakong EMVCo standard:
  // - Subtag 00: 'abaakhppxxx@abaa' (ABA Central Bakong Gateway)
  // - Subtag 01: Account Number ('000474559')
  // - Subtag 02: Acquiring Bank ('abaa')
  // ACLEDA and all NBC member banks recognize Tag 30 for direct account crediting!
  if (currentCfg.merchantType !== 'individual') {
    const gateway = (currentCfg.bakongAccountId && currentCfg.bakongAccountId.includes('@') && !currentCfg.bakongAccountId.startsWith('000'))
      ? currentCfg.bakongAccountId
      : 'abaakhppxxx@abaa';
    const accNumber = currentCfg.accountNumber || '000474559';
    const acqBank = currentCfg.acquiringBank || 'abaa';
    const sub00 = formatTag('00', gateway);
    const sub01 = formatTag('01', accNumber);
    const sub02 = formatTag('02', acqBank);
    payload += formatTag('30', sub00 + sub01 + sub02);
  } else {
    // Tag 29: Individual Bakong ID (must end with @abaa, e.g. proel_toch@abaa)
    let bakongId = (currentCfg.bakongAccountId || '').trim();
    if (!bakongId) bakongId = `${currentCfg.accountNumber}@abaa`;
    if (!bakongId.includes('@')) bakongId += '@abaa';
    if (bakongId.endsWith('@aba')) bakongId += 'a'; // convert @aba to @abaa
    payload += formatTag('29', formatTag('00', bakongId));
  }

  // 4. Tag 52: Merchant Category Code (5999 = Miscellaneous Retail)
  payload += formatTag('52', '5999');

  // 5. Tag 53: Transaction Currency ("840" = USD, "116" = KHR)
  payload += formatTag('53', currencyCode);

  // 6. Tag 54: Transaction Amount
  if (isDynamic) {
    payload += formatTag('54', formattedAmount);
  }

  // 7. Tag 58: Country Code ("KH")
  payload += formatTag('58', 'KH');

  // 8. Tag 59: Merchant / Account Name (max 25 chars, clean ASCII)
  const rawName = currentCfg.merchantName || currentCfg.accountName || 'Kari Arnett';
  const merchantDisplayName = rawName.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 25) || 'Kari Arnett';
  payload += formatTag('59', merchantDisplayName);

  // 9. Tag 60: Merchant City (max 15 chars, clean ASCII)
  const rawCity = currentCfg.merchantCity || 'Phnom Penh';
  const city = rawCity.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 15) || 'Phnom Penh';
  payload += formatTag('60', city);

  // 10. Tag 62: Additional Data Field (Bill number, store label)
  const billNum = options.billNumber ? String(options.billNumber).replace(/[^\x20-\x7E]/g, '').slice(0, 25) : '';
  const storeLabel = (options.storeLabel || merchantDisplayName).replace(/[^\x20-\x7E]/g, '').slice(0, 25);

  let tag62Content = '';
  if (billNum) tag62Content += formatTag('01', billNum);
  if (storeLabel) tag62Content += formatTag('03', storeLabel);
  if (tag62Content) {
    payload += formatTag('62', tag62Content);
  }

  // 11. Tag 99: Timestamp (Required for Dynamic KHQR)
  // 13-digit epoch timestamp in milliseconds
  if (isDynamic) {
    const now = Date.now();
    const expire = now + 24 * 60 * 60 * 1000; // 24 hours validity
    const tag99Content = formatTag('00', String(now)) + formatTag('01', String(expire));
    payload += formatTag('99', tag99Content);
  }

  // 12. Tag 63: CRC16 Checksum
  payload += '6304';
  const checksum = calcCRC16(payload);
  return payload + checksum;
}

export interface DecodedKHQR {
  rawString: string;
  isValidKHQR: boolean;
  bakongAccountId?: string;
  accountNumber?: string;
  merchantType?: 'merchant' | 'individual';
  acquiringBank?: string;
  merchantName?: string;
  merchantCity?: string;
  currency?: 'USD' | 'KHR';
  amount?: number;
  billNumber?: string;
  storeLabel?: string;
  isDynamic?: boolean;
}

/**
 * Parses an EMVCo Bakong KHQR String and extracts account info
 */
export function parseBakongKHQRString(qr: string): DecodedKHQR {
  if (!qr || !qr.startsWith('000201')) {
    return { rawString: qr, isValidKHQR: false };
  }

  try {
    let i = 0;
    const tags: Record<string, string> = {};
    while (i < qr.length - 4) {
      const tag = qr.substring(i, i + 2);
      const len = parseInt(qr.substring(i + 2, i + 4), 10);
      if (isNaN(len)) break;
      const val = qr.substring(i + 4, i + 4 + len);
      tags[tag] = val;
      i += 4 + len;
      if (tag === '63') break;
    }

    // Extract Tag 29 (Individual) or Tag 30 (Merchant)
    let bakongAccountId = '';
    let accountNumber = '';
    let acquiringBank = '';
    let merchantType: 'merchant' | 'individual' = tags['30'] ? 'merchant' : 'individual';
    const accountInfoTag = tags['30'] || tags['29'];
    if (accountInfoTag) {
      let j = 0;
      while (j < accountInfoTag.length) {
        const subtag = accountInfoTag.substring(j, j + 2);
        const sublen = parseInt(accountInfoTag.substring(j + 2, j + 4), 10);
        if (isNaN(sublen)) break;
        const subval = accountInfoTag.substring(j + 4, j + 4 + sublen);
        if (subtag === '00') bakongAccountId = subval;
        if (subtag === '01') accountNumber = subval;
        if (subtag === '02') acquiringBank = subval;
        j += 4 + sublen;
      }
    }

    // Extract Additional Data Tag 62
    let billNumber = '';
    let storeLabel = '';
    const tag62 = tags['62'];
    if (tag62) {
      let k = 0;
      while (k < tag62.length) {
        const subtag = tag62.substring(k, k + 2);
        const sublen = parseInt(tag62.substring(k + 2, k + 4), 10);
        if (isNaN(sublen)) break;
        const subval = tag62.substring(k + 4, k + 4 + sublen);
        if (subtag === '01') billNumber = subval;
        if (subtag === '03') storeLabel = subval;
        k += 4 + sublen;
      }
    }

    return {
      rawString: qr,
      isValidKHQR: true,
      bakongAccountId: bakongAccountId || undefined,
      accountNumber: accountNumber || undefined,
      merchantType,
      acquiringBank: acquiringBank || undefined,
      merchantName: tags['59'] || undefined,
      merchantCity: tags['60'] || undefined,
      currency: tags['53'] === '116' ? 'KHR' : 'USD',
      amount: tags['54'] ? parseFloat(tags['54']) : undefined,
      billNumber: billNumber || undefined,
      storeLabel: storeLabel || undefined,
      isDynamic: tags['01'] === '12'
    };
  } catch (err) {
    console.error('Failed to parse KHQR string:', err);
    return { rawString: qr, isValidKHQR: false };
  }
}

/**
 * Reads an image file (PNG/JPG) and decodes QR code directly using jsQR
 */
export async function decodeQRFromImageFile(file: File): Promise<{ qrString: string | null; error?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve({ qrString: null, error: 'Cannot create canvas context' });
            return;
          }
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth'
          });
          if (code && code.data) {
            resolve({ qrString: code.data });
          } else {
            resolve({ qrString: null, error: 'រកមិនឃើញ QR កូដក្នុងរូបភាពនេះឡើយ សូមសាកល្បងរូបភាពដែលច្បាស់ជាងនេះ' });
          }
        } catch (err: any) {
          resolve({ qrString: null, error: err?.message || 'Error processing image' });
        }
      };
      img.onerror = () => resolve({ qrString: null, error: 'មិនអាចអានរូបភាពបានឡើយ' });
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve({ qrString: null, error: 'មិនអាចផ្ទុកឯកសារបានឡើយ' });
    reader.readAsDataURL(file);
  });
}

/**
 * Generates a high-resolution base64 PNG data URL for the QR code
 */
export async function generateKHQRDataUrl(
  qrString: string,
  options: { width?: number; margin?: number } = {}
): Promise<string> {
  return QRCode.toDataURL(qrString, {
    width: options.width || 320,
    margin: options.margin !== undefined ? options.margin : 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

/**
 * Draws the QR Code directly onto a 2D HTML5 Canvas context synchronously in < 1ms
 */
export function drawKHQRToCanvas(
  ctx: CanvasRenderingContext2D,
  qrString: string,
  centerX: number,
  topY: number,
  targetSize: number = 230
): { actualWidth: number; actualHeight: number } {
  try {
    const qr = QRCode.create(qrString, { errorCorrectionLevel: 'M' });
    const moduleCount = qr.modules.size;
    const moduleSize = Math.max(1, Math.floor(targetSize / moduleCount));
    const actualWidth = moduleSize * moduleCount;
    const actualHeight = actualWidth;
    const startX = Math.floor(centerX - actualWidth / 2);

    // Draw white quiet zone backing
    const quietPad = moduleSize * 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(
      startX - quietPad,
      topY - quietPad,
      actualWidth + quietPad * 2,
      actualHeight + quietPad * 2
    );

    // Draw modules
    ctx.fillStyle = '#000000';
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.modules.get(row, col)) {
          ctx.fillRect(
            startX + col * moduleSize,
            topY + row * moduleSize,
            moduleSize,
            moduleSize
          );
        }
      }
    }

    return { actualWidth, actualHeight };
  } catch (err) {
    console.error('Failed to draw KHQR directly to canvas:', err);
    return { actualWidth: 0, actualHeight: 0 };
  }
}

/**
 * Generates an NBC Bakong App deep-link
 */
export function generateBakongDeepLink(qrString: string): string {
  return `https://bakong.nbc.gov.kh/qr/${encodeURIComponent(qrString)}`;
}
