/**
 * Ultra-Fast Direct 2D Canvas Receipt Generator for Thermal Printers (80mm / 576 dots)
 * Formats receipts with SAFE 80mm thermal margins (512 dots active printable head)
 * Prevents text clipping on right-side numbers, badges, and long multi-item notes.
 */

import { generateBakongKHQRString, drawKHQRToCanvas, getKHQRConfig } from './khqr';

export interface InvoiceItem {
  product_code: string;
  product_name?: string;
  price: number;
  quantity: number;
  item_comment?: string;
}

export interface InvoiceData {
  invoice_id: number | string;
  basket_no?: number | string;
  facebook_name: string;
  phone?: string;
  phone_number?: string;
  address?: string;
  shipping_address?: string;
  location_zone?: string;
  province?: string;
  created_at?: string;
  items: InvoiceItem[];
  subtotal?: number;
  total_amount?: number;
  shipping_fee?: number;
  discount?: number;
  grand_total?: number;
}

export interface RenderCanvasOptions {
  rielRate?: number;
  showKHQR?: boolean;
  khqrCurrency?: 'USD' | 'KHR';
}

/**
 * Intelligent text wrap helper designed for Khmer & mixed ASCII/Khmer strings
 */
function wrapNoteText(
  ctx: CanvasRenderingContext2D,
  rawComment: string,
  maxWidth: number
): string[] {
  if (!rawComment || !rawComment.trim()) return [];
  const fullText = `↳ Note: "${rawComment.trim()}"`;
  
  // Quick test: if full note fits in one line, return directly
  if (ctx.measureText(fullText).width <= maxWidth) {
    return [fullText];
  }

  // Tokenize by space first
  const tokens = rawComment.trim().split(/\s+/);
  const lines: string[] = [];
  
  let currentLine = '↳ Note: "';
  let isFirstLine = true;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isLastToken = (i === tokens.length - 1);
    const candidate = isFirstLine && currentLine === '↳ Note: "'
      ? `${currentLine}${token}${isLastToken ? '"' : ''}`
      : `${currentLine} ${token}${isLastToken ? '"' : ''}`;

    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine && currentLine !== '↳ Note: "' && currentLine !== '        ') {
        lines.push(currentLine);
      }
      isFirstLine = false;
      currentLine = `        ${token}${isLastToken ? '"' : ''}`;
      
      // If a single token itself is wider than maxWidth, hard split
      while (ctx.measureText(currentLine).width > maxWidth && currentLine.length > 10) {
        let splitIdx = currentLine.length - 1;
        while (splitIdx > 8 && ctx.measureText(currentLine.slice(0, splitIdx)).width > maxWidth) {
          splitIdx--;
        }
        lines.push(currentLine.slice(0, splitIdx));
        currentLine = `        ${currentLine.slice(splitIdx)}`;
      }
    }
  }

  if (currentLine && currentLine.trim()) {
    if (!currentLine.endsWith('"')) currentLine += '"';
    lines.push(currentLine);
  }

  return lines;
}

function wrapSimpleText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  if (ctx.measureText(text).width <= maxWidth) return [text];

  const words = text.includes(' ') ? text.split(/\s+/) : [text];
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Renders an invoice directly to an HTML5 Canvas element in < 5ms with Large High-Contrast Fonts
 * Formatted for standard 80mm POS printers (576px canvas with 516px safe printable boundary)
 */
export function renderInvoiceTo576Canvas(
  invoice: InvoiceData,
  options: RenderCanvasOptions = {}
): HTMLCanvasElement {
  const rielRate = options.rielRate || 4100;
  const items = invoice.items || [];
  const khqrConfig = getKHQRConfig();
  const showKHQR = options.showKHQR !== undefined ? options.showKHQR : false;
  const khqrCurrency = options.khqrCurrency || khqrConfig.currency || 'USD';

  const fontKhmer = "'Battambang', 'Kantumruy Pro', 'Khmer OS Siemreap', system-ui, sans-serif";
  const fontMono = "'Courier New', Courier, monospace";

  // Standard 80mm raster parameters
  const width = 576;
  const safeLeft = 24;
  const safeRight = 516; // 516px boundary prevents hardware clipping on 512-dot printheads
  const maxContentWidth = safeRight - safeLeft; // 492px safe width

  // Measure text heights using a scratch canvas
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  
  const address = (invoice.address || invoice.shipping_address || '').trim();
  let addressLines: string[] = [];
  if (measureCtx && address) {
    measureCtx.font = `800 23px ${fontKhmer}`;
    addressLines = wrapSimpleText(measureCtx, `ទីតាំង ៖ ${address}`, maxContentWidth);
  }

  // Pre-calculate wrapped lines for item notes
  const itemNoteLinesMap = new Map<number, string[]>();
  if (measureCtx) {
    measureCtx.font = `700 21px ${fontKhmer}`;
    items.forEach((it, idx) => {
      if (it.item_comment) {
        const lines = wrapNoteText(measureCtx, it.item_comment, maxContentWidth - 10);
        itemNoteLinesMap.set(idx, lines);
      }
    });
  }

  // Calculate dynamic canvas height
  const headerHeight = 430 + (addressLines.length > 1 ? (addressLines.length - 1) * 30 : 0);
  const itemsHeight = items.reduce((acc, _, idx) => {
    const noteLines = itemNoteLinesMap.get(idx) || [];
    const noteExtra = noteLines.length > 0 ? noteLines.length * 28 + 6 : 0;
    return acc + 60 + noteExtra;
  }, 0);
  const singleQrHeight = 145; // Side-by-side single compact QR (Customer photos & Fast Check)
  const khqrHeight = showKHQR ? 370 : 0;
  const footerHeight = 310 + khqrHeight + singleQrHeight;
  const totalHeight = headerHeight + itemsHeight + footerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  // Fill crisp white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Setup text defaults
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  let y = 18;

  // Helper: Draw horizontal separator line within safe boundaries
  const drawLine = (posY: number, thickness = 3) => {
    ctx.lineWidth = thickness;
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(safeLeft, posY);
    ctx.lineTo(safeRight, posY);
    ctx.stroke();
  };

  // 1. STORE HEADER
  const centerX = (safeLeft + safeRight) / 2;
  ctx.textAlign = 'center';
  ctx.font = `900 34px ${fontMono}`;
  ctx.fillText('KARI ARNETT BOUTIQUE', centerX, y);
  y += 42;

  ctx.font = `800 23px ${fontKhmer}`;
  ctx.fillText('PREMIUM LIVE FULFILLMENT', centerX, y);
  y += 32;

  drawLine(y, 3);
  y += 16;

  // 2. BASKET NO + LOCATION BADGE
  ctx.textAlign = 'left';
  ctx.font = `800 25px ${fontKhmer}`;
  ctx.fillText('វិក្កយបត្រ ៖ ', safeLeft, y + 8);

  const basketText = `#${invoice.basket_no || invoice.invoice_id}`;
  ctx.font = `900 46px ${fontMono}`;
  ctx.fillText(basketText, safeLeft + 130, y);

  // Location Badge (Right aligned cleanly to safeRight)
  const locationZone = (invoice.location_zone || invoice.province || 'ភ្នំពេញ').trim();
  ctx.font = `800 24px ${fontKhmer}`;
  const badgeWidth = ctx.measureText(locationZone).width + 24;
  const badgeX = safeRight - badgeWidth;
  
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(badgeX, y + 6, badgeWidth, 40);
  ctx.textAlign = 'center';
  ctx.fillText(locationZone, badgeX + badgeWidth / 2, y + 11);

  y += 58;

  // Date / Time
  const dateObj = invoice.created_at ? new Date(invoice.created_at) : new Date();
  const dateStr = dateObj.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh' });
  const timeStr = dateObj.toLocaleTimeString('en-US', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', hour12: true });

  ctx.textAlign = 'left';
  ctx.font = `800 23px ${fontKhmer}`;
  ctx.fillText(`កាលបរិច្ឆេទ ៖ ${dateStr} ${timeStr}`, safeLeft, y);
  y += 34;

  drawLine(y, 3);
  y += 16;

  // 3. CUSTOMER DETAILS
  const custName = invoice.facebook_name || 'អតិថិជន';
  const phone = invoice.phone || invoice.phone_number || '[គ្មានលេខ]';

  ctx.font = `800 25px ${fontKhmer}`;
  ctx.fillText('អតិថិជន ៖ ', safeLeft, y);
  ctx.font = `900 33px ${fontKhmer}`;
  ctx.fillText(custName, safeLeft + 120, y - 3);
  y += 42;

  ctx.font = `800 25px ${fontKhmer}`;
  ctx.fillText('ទូរស័ព្ទ   ៖ ', safeLeft, y);
  ctx.font = `900 30px ${fontMono}`;
  ctx.fillText(phone, safeLeft + 120, y - 2);
  y += 40;

  if (address) {
    ctx.font = `800 23px ${fontKhmer}`;
    if (addressLines.length > 0) {
      addressLines.forEach((line) => {
        ctx.fillText(line, safeLeft, y);
        y += 30;
      });
      y += 6;
    } else {
      ctx.fillText(`ទីតាំង ៖ ${address}`, safeLeft, y);
      y += 36;
    }
  }

  drawLine(y, 3);
  y += 16;

  // 4. PACKING LIST TITLE
  ctx.font = `900 28px ${fontKhmer}`;
  ctx.fillText('📋 បញ្ជីទំនិញ (PACKING LIST) ៖', safeLeft, y);
  y += 40;

  // 5. PACKING LIST ITEMS
  let totalQty = 0;
  let subtotal = 0;

  items.forEach((it, idx) => {
    const qty = Number(it.quantity || 1);
    const price = Number(it.price || 0);
    const itemTotal = qty * price;
    totalQty += qty;
    subtotal += itemTotal;

    const code = String(it.product_code || '');
    let custom = (it.product_name || '')
      .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${code}\\]?`, 'i'), '')
      .replace(new RegExp(`^កូដ\\s*\\[?${code}\\]?`, 'i'), '')
      .replace(new RegExp(`\\[?${code}\\]?`, 'i'), '')
      .replace(/^ទំនិញ\s*/i, '')
      .replace(/\s*ទំនិញ$/i, '')
      .trim();
    if (custom === 'ទំនិញ') custom = '';

    // Checkbox box (28x28px)
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(safeLeft, y + 4, 28, 28);

    // Product Code (Extra Large & Bold)
    ctx.font = `900 38px ${fontMono}`;
    ctx.fillText(`កូដ [ ${code} ]`, safeLeft + 38, y);

    if (custom) {
      ctx.font = `800 22px ${fontKhmer}`;
      ctx.fillText(custom.slice(0, 8), safeLeft + 280, y + 8);
    }

    // Quantity + Price (Aligned to safeRight)
    ctx.textAlign = 'right';
    ctx.font = `900 32px ${fontMono}`;
    ctx.fillText(`x${qty}`, safeRight - 120, y + 2);
    ctx.fillText(`$${itemTotal.toFixed(2)}`, safeRight, y + 2);
    ctx.textAlign = 'left';

    y += 46;

    // Multiline Note rendering - wraps cleanly across lines without cutting off
    const noteLines = itemNoteLinesMap.get(idx);
    if (noteLines && noteLines.length > 0) {
      ctx.font = `700 21px ${fontKhmer}`;
      noteLines.forEach((nLine) => {
        ctx.fillText(nLine, safeLeft, y);
        y += 28;
      });
      y += 6;
    } else if (it.item_comment) {
      ctx.font = `700 21px ${fontKhmer}`;
      ctx.fillText(`↳ Note: "${it.item_comment}"`, safeLeft, y);
      y += 30;
    }

    y += 8;
  });

  drawLine(y, 3);
  y += 16;

  // 6. TOTALS BREAKDOWN
  const shippingFee = Number(invoice.shipping_fee || 0);
  const discount = Number(invoice.discount || 0);
  const exactTotal = subtotal + shippingFee - discount;
  const rielTotal = Math.round((exactTotal * rielRate) / 100) * 100;
  const formattedRiel = rielTotal.toLocaleString('en-US');

  ctx.font = `800 24px ${fontKhmer}`;
  ctx.fillText('ចំនួនសរុប ៖', safeLeft, y);
  ctx.textAlign = 'right';
  ctx.font = `900 26px ${fontKhmer}`;
  ctx.fillText(`${totalQty} ឈុត`, safeRight, y);
  ctx.textAlign = 'left';
  y += 34;

  ctx.font = `800 24px ${fontKhmer}`;
  ctx.fillText('តម្លៃទំនិញ ៖', safeLeft, y);
  ctx.textAlign = 'right';
  ctx.font = `900 26px ${fontMono}`;
  ctx.fillText(`$${subtotal.toFixed(2)}`, safeRight, y);
  ctx.textAlign = 'left';
  y += 34;

  ctx.font = `800 24px ${fontKhmer}`;
  ctx.fillText('សេវាដឹក ៖', safeLeft, y);
  ctx.textAlign = 'right';
  ctx.font = `900 26px ${fontMono}`;
  ctx.fillText(shippingFee === 0 ? 'FREE' : `+$${shippingFee.toFixed(2)}`, safeRight, y);
  ctx.textAlign = 'left';
  y += 36;

  drawLine(y, 3);
  y += 18;

  // 7. GRAND TOTAL (USD on Line 1, Riel on Line 2 centered within safe printable width)
  ctx.textAlign = 'center';
  ctx.font = `900 48px ${fontMono}`;
  ctx.fillText(`TOTAL: $${exactTotal.toFixed(2)}`, centerX, y);
  y += 48;

  ctx.font = `900 40px ${fontMono}`;
  ctx.fillText(`( ${formattedRiel} R )`, centerX, y);
  y += 52;

  // 7.2. COMPACT SINGLE QR CODE SIDE-BY-SIDE WITH FOOTER POLICY (Maximum Paper Saving)
  drawLine(y, 2);
  y += 14;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const customerUrl = `${origin}/?order=${invoice.invoice_id || invoice.basket_no}`;
  const qrSize = 100;
  const qrX = safeRight - qrSize / 2;
  const textMaxW = maxContentWidth - qrSize - 20;

  // Draw Footer text on the Left
  ctx.textAlign = 'left';
  ctx.font = `900 24px ${fontKhmer}`;
  ctx.fillText('អរគុណចំពោះការគាំទ្រ KARI ARNETT!', safeLeft, y + 6);

  ctx.font = `800 20px ${fontKhmer}`;
  ctx.fillText('ទំនិញទិញហើយមិនអាចប្តូរវិញបានទេ', safeLeft, y + 38);

  ctx.font = `900 18px ${fontMono}`;
  ctx.fillText(`📱 ស្កេនមើលទំនិញ • Order #${invoice.basket_no || invoice.invoice_id}`, safeLeft, y + 68);

  // Draw Compact Single QR on the Right
  drawKHQRToCanvas(ctx, customerUrl, qrX, y, qrSize);

  y += qrSize + 16;
  drawLine(y, 2);
  y += 14;

  // 7.5. BAKONG DYNAMIC KHQR (80mm Thermal Optimized)
  if (showKHQR && exactTotal > 0) {
    drawLine(y, 3);
    y += 14;

    ctx.textAlign = 'center';
    ctx.font = `900 24px ${fontKhmer}`;
    ctx.fillText('ស្កេនបង់ប្រាក់ KHQR (ABA BANK)', centerX, y);
    y += 30;

    const qrAmount = khqrCurrency === 'KHR' ? rielTotal : exactTotal;
    const qrString = generateBakongKHQRString({
      amount: qrAmount,
      currency: khqrCurrency,
      billNumber: invoice.basket_no || invoice.invoice_id,
      storeLabel: khqrConfig.merchantName || 'Kari Arnett',
      config: khqrConfig
    });

    const { actualHeight } = drawKHQRToCanvas(ctx, qrString, centerX, y + 10, 220);
    y += (actualHeight || 220) + 24;

    ctx.font = `900 21px ${fontMono}`;
    ctx.fillText(`${khqrConfig.bankName}: ${khqrConfig.accountNumber} (${khqrConfig.accountName})`, centerX, y);
    y += 28;

    ctx.font = `800 19px ${fontKhmer}`;
    ctx.fillText(`ហាង ៖ ${khqrConfig.merchantName} ‧ ទឹកប្រាក់ ៖ ${khqrCurrency === 'KHR' ? `${formattedRiel} ៛` : `$${exactTotal.toFixed(2)}`}`, centerX, y);
    y += 32;
  }

  // 8. CUT LINE
  ctx.textAlign = 'center';
  ctx.font = `800 18px ${fontMono}`;
  ctx.fillStyle = '#555555';
  ctx.fillText('- - - - - - - - [ កាត់ត្រង់នេះ ✂️ ] - - - - - - - -', centerX, y);

  return canvas;
}
