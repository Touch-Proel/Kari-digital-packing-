import QRCode from 'qrcode';
import sharp from 'sharp';
import { settings, invoices } from './db';

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

function calcCRC16(payload: string): string {
  let crc = 0xFFFF;
  const bytes = Buffer.from(payload, 'utf8');
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    const j = (c ^ (crc >> 8)) & 0xFF;
    crc = CRC_TABLE[j] ^ ((crc << 8) & 0xFFFF);
  }
  return ((crc ^ 0) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function formatTag(tag: string, val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === '') return '';
  const str = String(val);
  const len = String(str.length).padStart(2, '0');
  return `${tag}${len}${str}`;
}

export interface ServerKHQROptions {
  amount: number;
  currency?: 'USD' | 'KHR';
  billNumber?: string | number;
  customerName?: string;
  storeLabel?: string;
}

/**
 * Generates an NBC-compliant Bakong KHQR String on the server
 */
export function generateServerBakongKHQRString(options: ServerKHQROptions): string {
  const isKhr = options.currency === 'KHR';
  const currencyCode = isKhr ? '116' : '840';

  let formattedAmount = '';
  if (options.amount > 0) {
    formattedAmount = isKhr ? String(Math.round(options.amount)) : options.amount.toFixed(2);
  }

  // 1. Tag 00
  let payload = formatTag('00', '01');

  // 2. Tag 01: Dynamic ("12") or Static ("11")
  const isDynamic = Boolean(formattedAmount && Number(formattedAmount) > 0);
  payload += formatTag('01', isDynamic ? '12' : '11');

  // 3. Tag 30 (Merchant / Direct ABA Account) or Tag 29
  const merchantType = (settings as any).khqr_merchant_type || 'merchant';
  if (merchantType !== 'individual') {
    const gateway = (settings.bakong_id && settings.bakong_id.includes('@') && !settings.bakong_id.startsWith('000'))
      ? settings.bakong_id
      : 'abaakhppxxx@abaa';
    const accNumber = settings.account_number || '000474559';
    const acqBank = 'abaa';
    const sub00 = formatTag('00', gateway);
    const sub01 = formatTag('01', accNumber);
    const sub02 = formatTag('02', acqBank);
    payload += formatTag('30', sub00 + sub01 + sub02);
  } else {
    let bakongId = (settings.bakong_id || '').trim();
    if (!bakongId) bakongId = `${settings.account_number || '000474559'}@abaa`;
    if (!bakongId.includes('@')) bakongId += '@abaa';
    if (bakongId.endsWith('@aba')) bakongId += 'a';
    payload += formatTag('29', formatTag('00', bakongId));
  }

  // 4. Tag 52: Merchant Category Code
  payload += formatTag('52', '5999');

  // 5. Tag 53: Currency
  payload += formatTag('53', currencyCode);

  // 6. Tag 54: Amount
  if (isDynamic) {
    payload += formatTag('54', formattedAmount);
  }

  // 7. Tag 58: Country Code
  payload += formatTag('58', 'KH');

  // 8. Tag 59: Merchant Name
  const rawName = settings.merchant_name || settings.account_name || 'Kari Arnett';
  const merchantDisplayName = rawName.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 25) || 'Kari Arnett';
  payload += formatTag('59', merchantDisplayName);

  // 9. Tag 60: City
  const rawCity = settings.khqr_city || 'Phnom Penh';
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

  // 11. Tag 99: Timestamp (24h)
  if (isDynamic) {
    const now = Date.now();
    const expire = now + 24 * 60 * 60 * 1000;
    const tag99Content = formatTag('00', String(now)) + formatTag('01', String(expire));
    payload += formatTag('99', tag99Content);
  }

  // 12. Tag 63: CRC16
  payload += '6304';
  const checksum = calcCRC16(payload);
  return payload + checksum;
}

/**
 * Generates a complete, beautiful Bakong KHQR image PNG Buffer
 */
export async function generateServerKHQRPNG(options: ServerKHQROptions): Promise<Buffer> {
  const qrString = generateServerBakongKHQRString(options);

  // Generate QR Code as raw PNG buffer
  const qrPngBuffer = await QRCode.toBuffer(qrString, {
    errorCorrectionLevel: 'M',
    type: 'png',
    margin: 1,
    width: 320,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });

  const isKhr = options.currency === 'KHR';
  const formattedAmount = isKhr
    ? `${Math.round(options.amount).toLocaleString('en-US')} ៛`
    : `$${options.amount.toFixed(2)}`;

  const storeName = settings.merchant_name || 'Kari Arnett';
  const accName = settings.account_name || 'Proel Toch';
  const accNum = settings.account_number || '000474559';
  const bankName = settings.bank_name || 'ABA Bank';
  const basketTag = options.billNumber ? `Basket #${options.billNumber}` : 'Order Invoice';

  // SVG Card Template Dimensions: 420px width x 560px height
  const width = 420;
  const height = 560;

  const cardSvg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#E11925" />
          <stop offset="100%" stop-color="#B70F1B" />
        </linearGradient>
        <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.15" />
        </filter>
      </defs>

      <!-- Outer Card with rounded corners and clean white background -->
      <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="24" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2" filter="url(#cardShadow)"/>

      <!-- Red Bakong KHQR Header Bar -->
      <path d="M 10 34 Q 10 10 34 10 L 386 10 Q 410 10 410 34 L 410 80 L 10 80 Z" fill="url(#headerGrad)" />

      <!-- KHQR Logo Badge -->
      <rect x="26" y="24" width="82" height="38" rx="8" fill="#FFFFFF" />
      <text x="67" y="49" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="900" fill="#E11925" text-anchor="middle" letter-spacing="1">KHQR</text>

      <!-- Header Label -->
      <text x="390" y="48" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="#FFFFFF" text-anchor="end" letter-spacing="0.5">BAKONG SCAN</text>

      <!-- Store / Merchant Info -->
      <text x="${width / 2}" y="112" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="800" fill="#0F172A" text-anchor="middle">${storeName.toUpperCase()}</text>
      <text x="${width / 2}" y="132" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#64748B" text-anchor="middle">${basketTag} • ${accName}</text>

      <!-- Amount Banner -->
      <rect x="60" y="146" width="${width - 120}" height="42" rx="12" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5" />
      <text x="${width / 2}" y="173" font-family="Courier, monospace, -apple-system, sans-serif" font-size="22" font-weight="900" fill="#E11925" text-anchor="middle">${formattedAmount}</text>

      <!-- QR Frame Placeholder Area (Centered) -->
      <!-- QR Image is positioned between y: 200 and y: 480 -->

      <!-- Footer Info -->
      <rect x="20" y="490" width="${width - 40}" height="45" rx="14" fill="#0F172A" />
      <text x="${width / 2}" y="512" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="#38BDF8" text-anchor="middle">${bankName} : ${accNum}</text>
      <text x="${width / 2}" y="527" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="600" fill="#94A3B8" text-anchor="middle">Scan with ABA Mobile, Bakong, or Any Banking App</text>
    </svg>
  `;

  // Composite the QR code buffer inside the card SVG
  const cardPng = await sharp(Buffer.from(cardSvg))
    .composite([
      {
        input: qrPngBuffer,
        top: 198,
        left: Math.round((width - 320) / 2)
      }
    ])
    .png({ quality: 95 })
    .toBuffer();

  return cardPng;
}
