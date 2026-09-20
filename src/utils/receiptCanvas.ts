/**
 * Ultra-Fast Direct 2D Canvas Receipt Generator for Thermal Printers (80mm / 576 dots)
 * Bypasses heavy HTML DOM rendering (html2canvas) for 0.002s instant generation!
 * Styled with LARGE, BOLD typography for crystal-clear readability on 80mm thermal paper.
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
 * Helper to wrap text cleanly for Canvas 2D without clipping
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  const lines: string[] = [];
  
  // Try splitting by spaces or Khmer word boundaries if spaces exist
  const words = text.includes(' ') ? text.split(' ') : [text];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Single word exceeds maxWidth, break by characters
        let chunk = '';
        for (const char of word) {
          if (ctx.measureText(chunk + char).width <= maxWidth) {
            chunk += char;
          } else {
            if (chunk) lines.push(chunk);
            chunk = char;
          }
        }
        currentLine = chunk;
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Renders an invoice directly to an HTML5 Canvas element in < 5ms with Large High-Contrast Fonts
 */
export function renderInvoiceTo576Canvas(
  invoice: InvoiceData,
  options: RenderCanvasOptions = {}
): HTMLCanvasElement {
  const rielRate = options.rielRate || 4100;
  const items = invoice.items || [];
  const khqrConfig = getKHQRConfig();
  // By default, NEVER print KHQR on POS paper slips to save thermal paper & vertical space
  const showKHQR = options.showKHQR !== undefined ? options.showKHQR : false;
  const khqrCurrency = options.khqrCurrency || khqrConfig.currency || 'USD';

  const fontKhmer = "'Battambang', 'Kantumruy Pro', 'Khmer OS Siemreap', system-ui, sans-serif";
  const fontMono = "'Courier New', Courier, monospace";

  const width = 576;
  const paddingX = 22; // Safe 22px margin so right side numbers never get cut off
  const maxContentWidth = width - (paddingX * 2);

  // Temporary canvas to measure wrapped text height accurately
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  
  const address = (invoice.address || invoice.shipping_address || '').trim();
  let addressLines: string[] = [];
  if (measureCtx && address) {
    measureCtx.font = `800 24px ${fontKhmer}`;
    addressLines = wrapText(measureCtx, `ទីតាំង ៖ ${address}`, maxContentWidth);
  }

  // Measure notes per item
  const itemNoteLinesMap = new Map<number, string[]>();
  if (measureCtx) {
    measureCtx.font = `800 23px ${fontKhmer}`;
    const maxNoteWidth = maxContentWidth - 44;
    items.forEach((it, idx) => {
      if (it.item_comment) {
        const lines = wrapText(measureCtx, `↳ Note: "${it.item_comment}"`, maxNoteWidth);
        itemNoteLinesMap.set(idx, lines);
      }
    });
  }

  // 1. Calculate height dynamically with extra breathing room for larger text & wrapped notes
  const headerHeight = 440 + (addressLines.length > 1 ? (addressLines.length - 1) * 32 : 0);
  const itemsHeight = items.reduce((acc, _, idx) => {
    const noteLines = itemNoteLinesMap.get(idx) || [];
    const noteExtra = noteLines.length > 0 ? noteLines.length * 32 + 8 : 0;
    return acc + 65 + noteExtra;
  }, 0);
  const khqrHeight = showKHQR ? 370 : 0;
  const footerHeight = 430 + khqrHeight;
  const totalHeight = headerHeight + itemsHeight + footerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  // Fill white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Setup styles
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  let y = 18;

  // Helper: Draw horizontal line
  const drawLine = (posY: number, thickness = 3) => {
    ctx.lineWidth = thickness;
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(paddingX, posY);
    ctx.lineTo(width - paddingX, posY);
    ctx.stroke();
  };

  // 1. STORE HEADER
  ctx.textAlign = 'center';
  ctx.font = `900 36px ${fontMono}`;
  ctx.fillText('KARI ARNETT BOUTIQUE', width / 2, y);
  y += 44;

  ctx.font = `800 24px ${fontKhmer}`;
  ctx.fillText('PREMIUM LIVE FULFILLMENT', width / 2, y);
  y += 34;

  drawLine(y, 3);
  y += 16;

  // 2. BASKET NO + LOCATION BADGE
  ctx.textAlign = 'left';
  ctx.font = `800 26px ${fontKhmer}`;
  ctx.fillText('វិក្កយបត្រ ៖ ', paddingX, y + 10);

  const basketText = `#${invoice.basket_no || invoice.invoice_id}`;
  ctx.font = `900 48px ${fontMono}`;
  ctx.fillText(basketText, paddingX + 135, y);

  // Location Badge (Right aligned with safe margin)
  const locationZone = (invoice.location_zone || invoice.province || 'ភ្នំពេញ').trim();
  ctx.font = `800 24px ${fontKhmer}`;
  const badgeWidth = ctx.measureText(locationZone).width + 24;
  const badgeX = width - paddingX - badgeWidth - 4;
  
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(badgeX, y + 6, badgeWidth, 42);
  ctx.textAlign = 'center';
  ctx.fillText(locationZone, badgeX + badgeWidth / 2, y + 12);

  y += 62;

  // Date/Time
  const dateObj = invoice.created_at ? new Date(invoice.created_at) : new Date();
  const dateStr = dateObj.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh' });
  const timeStr = dateObj.toLocaleTimeString('en-US', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', hour12: true });

  ctx.textAlign = 'left';
  ctx.font = `800 24px ${fontKhmer}`;
  ctx.fillText(`កាលបរិច្ឆេទ ៖ ${dateStr} ${timeStr}`, paddingX, y);
  y += 36;

  drawLine(y, 3);
  y += 16;

  // 3. CUSTOMER DETAILS
  const custName = invoice.facebook_name || 'អតិថិជន';
  const phone = invoice.phone || invoice.phone_number || '[គ្មានលេខ]';

  ctx.font = `800 26px ${fontKhmer}`;
  ctx.fillText('អតិថិជន ៖ ', paddingX, y);
  ctx.font = `900 35px ${fontKhmer}`;
  ctx.fillText(custName, paddingX + 125, y - 4);
  y += 44;

  ctx.font = `800 26px ${fontKhmer}`;
  ctx.fillText('ទូរស័ព្ទ   ៖ ', paddingX, y);
  ctx.font = `900 32px ${fontMono}`;
  ctx.fillText(phone, paddingX + 125, y - 2);
  y += 42;

  if (address) {
    ctx.font = `800 24px ${fontKhmer}`;
    if (addressLines.length > 0) {
      addressLines.forEach((line) => {
        ctx.fillText(line, paddingX, y);
        y += 32;
      });
      y += 6;
    } else {
      ctx.fillText(`ទីតាំង ៖ ${address}`, paddingX, y);
      y += 38;
    }
  }

  drawLine(y, 3);
  y += 16;

  // 4. PACKING LIST TITLE
  ctx.font = `900 30px ${fontKhmer}`;
  ctx.fillText('📋 បញ្ជីទំនិញ (PACKING LIST) ៖', paddingX, y);
  y += 44;

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

    // Checkbox box (30x30px)
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(paddingX, y + 4, 30, 30);

    // Product Code (Extra Large 40px & Bold 900)
    ctx.font = `900 40px ${fontMono}`;
    ctx.fillText(`កូដ [ ${code} ]`, paddingX + 42, y);

    if (custom) {
      ctx.font = `800 24px ${fontKhmer}`;
      ctx.fillText(custom.slice(0, 8), paddingX + 310, y + 8);
    }

    // Quantity + Price (Right Aligned with safe margin)
    ctx.textAlign = 'right';
    ctx.font = `900 34px ${fontMono}`;
    ctx.fillText(`x${qty}`, width - paddingX - 130, y + 2);
    ctx.fillText(`$${itemTotal.toFixed(2)}`, width - paddingX - 4, y + 2);
    ctx.textAlign = 'left';

    y += 50;

    // Multiline Note rendering to prevent line clipping
    const noteLines = itemNoteLinesMap.get(idx);
    if (noteLines && noteLines.length > 0) {
      ctx.font = `800 23px ${fontKhmer}`;
      noteLines.forEach((nLine, nIdx) => {
        const indentX = nIdx === 0 ? paddingX + 42 : paddingX + 68;
        ctx.fillText(nLine, indentX, y);
        y += 32;
      });
      y += 6;
    } else if (it.item_comment) {
      ctx.font = `800 23px ${fontKhmer}`;
      ctx.fillText(`↳ Note: "${it.item_comment}"`, paddingX + 42, y);
      y += 34;
    }

    y += 10;
  });

  drawLine(y, 3);
  y += 16;

  // 6. TOTALS BREAKDOWN
  const shippingFee = Number(invoice.shipping_fee || 0);
  const discount = Number(invoice.discount || 0);
  const exactTotal = subtotal + shippingFee - discount;
  const rielTotal = Math.round((exactTotal * rielRate) / 100) * 100;
  const formattedRiel = rielTotal.toLocaleString('en-US');

  ctx.font = `800 25px ${fontKhmer}`;
  ctx.fillText('ចំនួនសរុប ៖', paddingX, y);
  ctx.textAlign = 'right';
  ctx.font = `900 28px ${fontKhmer}`;
  ctx.fillText(`${totalQty} ឈុត`, width - paddingX - 4, y);
  ctx.textAlign = 'left';
  y += 36;

  ctx.font = `800 25px ${fontKhmer}`;
  ctx.fillText('តម្លៃទំនិញ ៖', paddingX, y);
  ctx.textAlign = 'right';
  ctx.font = `900 28px ${fontMono}`;
  ctx.fillText(`$${subtotal.toFixed(2)}`, width - paddingX - 4, y);
  ctx.textAlign = 'left';
  y += 36;

  ctx.font = `800 25px ${fontKhmer}`;
  ctx.fillText('សេវាដឹក ៖', paddingX, y);
  ctx.textAlign = 'right';
  ctx.font = `900 28px ${fontMono}`;
  ctx.fillText(shippingFee === 0 ? 'FREE' : `+$${shippingFee.toFixed(2)}`, width - paddingX - 4, y);
  ctx.textAlign = 'left';
  y += 38;

  drawLine(y, 3);
  y += 18;

  // 7. GRAND TOTAL (USD on Line 1, Riel on Line 2 centered!)
  ctx.textAlign = 'center';
  ctx.font = `900 50px ${fontMono}`;
  ctx.fillText(`TOTAL: $${exactTotal.toFixed(2)}`, width / 2, y);
  y += 50;

  ctx.font = `900 42px ${fontMono}`;
  ctx.fillText(`( ${formattedRiel} R )`, width / 2, y);
  y += 55;

  // 7.5. BAKONG DYNAMIC KHQR (80mm Thermal Optimized)
  if (showKHQR && exactTotal > 0) {
    drawLine(y, 3);
    y += 14;

    ctx.textAlign = 'center';
    ctx.font = `900 24px ${fontKhmer}`;
    ctx.fillText('ស្កេនបង់ប្រាក់ KHQR (ABA BANK)', width / 2, y);
    y += 30;

    // Currency for QR
    const qrAmount = khqrCurrency === 'KHR' ? rielTotal : exactTotal;
    const qrString = generateBakongKHQRString({
      amount: qrAmount,
      currency: khqrCurrency,
      billNumber: invoice.basket_no || invoice.invoice_id,
      storeLabel: khqrConfig.merchantName || 'Kari Arnett',
      config: khqrConfig
    });

    // Draw QR Code centered (240px wide)
    const { actualHeight } = drawKHQRToCanvas(ctx, qrString, width / 2, y + 10, 230);
    y += (actualHeight || 230) + 24;

    ctx.font = `900 22px ${fontMono}`;
    ctx.fillText(`${khqrConfig.bankName}: ${khqrConfig.accountNumber} (${khqrConfig.accountName})`, width / 2, y);
    y += 28;

    ctx.font = `800 20px ${fontKhmer}`;
    ctx.fillText(`ហាង ៖ ${khqrConfig.merchantName} ‧ ទឹកប្រាក់ ៖ ${khqrCurrency === 'KHR' ? `${formattedRiel} ៛` : `$${exactTotal.toFixed(2)}`}`, width / 2, y);
    y += 32;
  }

  // 8. FOOTER POLICY & CUT LINE
  ctx.font = `900 24px ${fontKhmer}`;
  ctx.fillText('អរគុណចំពោះការគាំទ្រ KARI ARNETT!', width / 2, y);
  y += 32;

  ctx.font = `800 20px ${fontKhmer}`;
  ctx.fillText('ទំនិញទិញហើយមិនអាចប្តូរវិញបានទេ', width / 2, y);
  y += 36;

  // Dot cut line
  ctx.font = `800 18px ${fontMono}`;
  ctx.fillStyle = '#555555';
  ctx.fillText('- - - - - - - - [ កាត់ត្រង់នេះ ✂️ ] - - - - - - - -', width / 2, y);

  return canvas;
}
