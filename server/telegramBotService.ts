import fs from 'fs';
import path from 'path';
import { invoices, products, activeLiveId, settings, saveDatabaseToDisk, bumpDataRevision } from './db';
import { getGemini, callGeminiSlipExtraction, matchInvoiceForSlip, ExtractedSlipData } from './fastCheckRoutes';
import { deleteTelegramWebhook, parseLinesForStockItems, downloadTelegramPhoto, cachedTelegramItems, bulkImportStockItems, findImageOnDiskForCode } from './telegramSync';
import { broadcastSSE } from './packingRoutes';
import { Invoice, Product } from './types';

// State tracker for Telegram Bot Service
let botRunning = false;
let pollingAbortController: AbortController | null = null;
let lastUpdateOffset = 0;
let consecutiveErrors = 0;

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Send a Telegram text message
 */
export async function sendTelegramMessage(
  token: string,
  chatId: number | string,
  text: string,
  replyToMessageId?: number,
  messageThreadId?: number
) {
  try {
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    };
    if (replyToMessageId) {
      payload.reply_to_message_id = replyToMessageId;
    }
    if (messageThreadId) {
      payload.message_thread_id = messageThreadId;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
    return null;
  }
}

/**
 * Download a photo file from Telegram by file_id
 */
async function downloadTelegramPhotoBuffer(token: string, fileId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result?.file_path) {
      return null;
    }

    const filePath = fileData.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const imgRes = await fetch(downloadUrl);
    const arrayBuf = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    const ext = path.extname(filePath) || '.jpg';
    const fileName = `slip_tg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
    const localSavePath = path.join(uploadsDir, fileName);

    fs.writeFileSync(localSavePath, buffer);

    // Also copy to dist/uploads if dist exists
    const distUploads = path.join(process.cwd(), 'dist', 'uploads');
    if (fs.existsSync(distUploads)) {
      try {
        fs.writeFileSync(path.join(distUploads, fileName), buffer);
      } catch {}
    }

    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { buffer, fileName, mimeType };
  } catch (err) {
    console.error('Error downloading Telegram photo:', err);
    return null;
  }
}

// Concurrency-controlled Queue for Telegram Media & OCR processing (prevents 6GB memory spikes & CPU lockup during 100+ bulk photo forwards)
class TelegramTaskQueue {
  private queue: Array<() => Promise<void>> = [];
  private active = 0;
  private readonly maxConcurrency = 2;

  add(task: () => Promise<void>) {
    this.queue.push(task);
    this.processNext();
  }

  private processNext() {
    while (this.active < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;
      this.active++;
      task()
        .catch(err => console.error('[Telegram Queue Task Error]:', err))
        .finally(() => {
          this.active--;
          // 25ms pause between items to allow V8 GC to sweep memory
          setTimeout(() => this.processNext(), 25);
        });
    }
  }

  get pending() {
    return this.queue.length;
  }
}

const telegramQueue = new TelegramTaskQueue();

/**
 * Handle incoming Product Stock Photo & Code (Stock Sync)
 */
async function handleIncomingStockItemPhoto(
  token: string,
  chatId: number | string,
  messageId: number,
  photoArray: any[],
  caption: string,
  stockItems: Array<{ code: string; price: number; name?: string }>,
  messageDate?: number | string
) {
  // Pick best resolution photo (medium-large for HD product view)
  let chosenPhoto = photoArray[photoArray.length - 1];
  for (let pIdx = photoArray.length - 1; pIdx >= 0; pIdx--) {
    const p = photoArray[pIdx];
    if ((p.width >= 400 || p.height >= 400) && (p.width <= 1280 || p.height <= 1280)) {
      chosenPhoto = p;
      break;
    }
  }

  const primaryItem = stockItems[0];
  let photoUrl: string | undefined = undefined;
  if (chosenPhoto?.file_id) {
    photoUrl = await downloadTelegramPhoto(token, chosenPhoto.file_id, primaryItem.code, messageDate);
  }

  // Bulk import items into products database (handles persistence, active live sync, and IDs)
  bulkImportStockItems(
    stockItems.map(item => ({
      code: item.code,
      name: item.name,
      price: item.price,
      stock_qty: 200,
      image_file: photoUrl
    })),
    'merge',
    { targetLiveId: activeLiveId }
  );

  for (const item of stockItems) {
    const upperCode = item.code.toUpperCase();

    // Keep cachedTelegramItems in sync so Web OS StockSyncModal displays it instantly
    const existingCached = cachedTelegramItems.find(c => c.code.toUpperCase() === upperCode);
    if (existingCached) {
      existingCached.price = item.price;
      existingCached.image_url = photoUrl || existingCached.image_url;
      if (item.name) existingCached.name = item.name;
    } else {
      cachedTelegramItems.unshift({
        code: upperCode,
        name: item.name || `កូដ ${upperCode}`,
        price: item.price,
        stock_qty: 200,
        chat_id: typeof chatId === 'number' ? chatId : undefined,
        message_date: new Date().toISOString(),
        original_text: caption,
        message_id: messageId,
        image_url: photoUrl
      });
    }
  }

  // Debounced auto-save & revision bump (prevents 125 simultaneous disk writes)
  bumpDataRevision();
  console.log(`[Telegram Stock Sync] Recorded item ${stockItems.map(s => s.code).join(', ')} (Queue pending: ${telegramQueue.pending})`);
}

/**
 * Handle incoming Telegram photo (Slip OCR & Auto-Tick Paid - OPTION 1)
 */
async function handleIncomingSlipPhoto(token: string, chatId: number | string, messageId: number, photoArray: any[], caption?: string) {
  // 1. Send initial feedback
  await sendTelegramMessage(token, chatId, '🔍 <i>កំពុងប្រើ Gemini AI ស្កេនរូបភាព Slip... សូមរង់ចាំបន្តិច...</i>', messageId);

  // 2. Pick highest resolution photo
  const bestPhoto = photoArray[photoArray.length - 1];
  if (!bestPhoto?.file_id) {
    await sendTelegramMessage(token, chatId, '❌ មិនអាចទាញយករូបភាពបានទេ', messageId);
    return;
  }

  const downloaded = await downloadTelegramPhotoBuffer(token, bestPhoto.file_id);
  if (!downloaded) {
    await sendTelegramMessage(token, chatId, '❌ មិនអាចទាញយករូបភាពពី Telegram Server បានទេ', messageId);
    return;
  }

  const slipUrl = `/uploads/${downloaded.fileName}`;
  const base64Data = downloaded.buffer.toString('base64');
  const ai = getGemini();

  if (!ai) {
    await sendTelegramMessage(
      token,
      chatId,
      `⚠️ <b>មិនទាន់កំណត់ GEMINI_API_KEY ទេ!</b>\nសូមកំណត់ Key ក្នុង Settings លើ Web OS ឬក្នុង .env ដើម្បីឱ្យ AI ស្កេនរូបភាពបាន។`,
      messageId
    );
    return;
  }

  // 3. Call Gemini OCR
  const imagePart = {
    inlineData: {
      mimeType: downloaded.mimeType,
      data: base64Data
    }
  };

  const textPart = {
    text: `You are an expert at analyzing two types of images for Cambodian online shops:
Type A: Delivery parcels / waybills (e.g. orange plastic parcel bags, Virak Buntham VET Express stickers, J&T, handwritten customer names, phone numbers like 015673303, and destination towns/provinces).
Type B: Bank transfer payment receipts/slips (ABA Bank, ACLEDA, Canadia, TrueMoney, KHQR, Bakong) or Messenger chat payment screenshots.

Analyze this image carefully:
1. Determine "image_type": "DELIVERY_WAYBILL" if it is a parcel bag/waybill/VET sticker with recipient name/phone/tracking, OR "BANK_SLIP" if it is a money transfer slip.
2. If DELIVERY_WAYBILL:
   - "customer_name": Recipient's name written on parcel/sticker (e.g. "យ៉ាត នីតា", "Ru Ny", "ហួង មួយសៀប", "ជា ធីតា", "សារ៉េត", "ណាង").
   - "phone_number": Recipient's phone number (e.g. "015673303", "093214087", "098668851", "0978601915").
   - "destination": Destination address/province (e.g. "អង់តង់ស្លាប់ កំពង់ស្ពឺ", "លំដាប់បែកចាន ត្រពាំងក្រសាំង", "ផ្សារព្រៃទទឹង").
   - "carrier_name": Delivery company (e.g. "វីរៈប៊ុនថាំ (VET Express)", "J&T Express", "Capitol", etc.).
   - "tracking_code": Waybill barcode/QR tracking code (e.g. "pneat-angtonlob260900014/1", "230-01", or alphanumeric code on sticker).
3. If BANK_SLIP:
   - "customer_name": Facebook Name / sender name on slip.
   - "paid_amount": Transferred numeric amount (e.g. 10.00).
   - "currency": "USD" or "KHR".
   - "phone_number": Phone number if in chat text.
   - "bank_name": "ABA", "ACLEDA", "Wing", etc.
   - "trans_ref": Transaction reference ID.
   - "basket_no": order or basket number if mentioned in transfer remarks / memo (e.g. 102 or null).
   - "remarks": transfer note / remarks text.

Return ONLY pure valid JSON:
{
  "image_type": "DELIVERY_WAYBILL" | "BANK_SLIP" | "OTHER",
  "customer_name": "...",
  "phone_number": "...",
  "destination": "...",
  "carrier_name": "...",
  "tracking_code": "...",
  "paid_amount": 0,
  "currency": "USD",
  "bank_name": "...",
  "trans_ref": "...",
  "basket_no": null or number,
  "remarks": "..."
}`
  };

  const { text: rawText, error: extractionError } = await callGeminiSlipExtraction(ai, imagePart, textPart);

  if (extractionError || !rawText) {
    await sendTelegramMessage(
      token,
      chatId,
      `⚠️ <b>ស្កេនរូបភាពមិនបានជោគជ័យ</b>\n${extractionError || 'AI មិនអាចអានអក្សរលើរូបភាពបានទេ'}`,
      messageId
    );
    return;
  }

  let parsed: any = {};
  try {
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('Error parsing Gemini OCR JSON:', rawText);
  }

  // =========================================================================
  // 🚚 CASE A: DELIVERY WAYBILL / PARCEL PHOTO (បុងឡាន / VET Express)
  // =========================================================================
  if (parsed.image_type === 'DELIVERY_WAYBILL' || (parsed.carrier_name && parsed.phone_number) || parsed.tracking_code) {
    const cleanPhone = (parsed.phone_number || '').replace(/\D/g, '');
    const cleanName = (parsed.customer_name || '').trim().toLowerCase();

    // Match invoice by phone number first, then by customer name
    const activeInvoices = invoices.filter(i => i.status !== 'Cancelled');
    let matchedInv: Invoice | undefined;

    if (cleanPhone && cleanPhone.length >= 8) {
      matchedInv = activeInvoices.find(i => {
        const invPhone = (i.phone_number || '').replace(/\D/g, '');
        return invPhone && (invPhone.includes(cleanPhone) || cleanPhone.includes(invPhone));
      });
    }

    if (!matchedInv && cleanName && cleanName.length >= 2) {
      matchedInv = activeInvoices.find(i => {
        const iName = (i.facebook_name || '').toLowerCase();
        return iName.includes(cleanName) || cleanName.includes(iName);
      });
    }

    if (matchedInv) {
      matchedInv.status = 'Dispatched';
      matchedInv.packing_stage = 'DISPATCHED';
      matchedInv.waybill_image_url = slipUrl;
      matchedInv.tracking_code = parsed.tracking_code || `VET-${Date.now().toString().slice(-6)}`;
      matchedInv.delivery_carrier = parsed.carrier_name || 'វីរៈប៊ុនថាំ (VET Express)';
      matchedInv.dispatched_at = new Date().toISOString();

      if ((!matchedInv.phone_number || matchedInv.phone_number === 'គ្មានលេខ') && parsed.phone_number) {
        matchedInv.phone_number = parsed.phone_number;
      }
      if ((!matchedInv.address || matchedInv.address.includes('មិនទាន់មាន')) && parsed.destination) {
        matchedInv.address = parsed.destination;
      }

      saveDatabaseToDisk();
      bumpDataRevision();

      const basketNo = matchedInv.basket_no || matchedInv.invoice_id;
      const waybillReply = `🚚 <b>បានកត់ត្រាបុងឡាន &amp; Dispatched ជោគជ័យ!</b> 🎉
━━━━━━━━━━━━━━━━━━
🛒 <b>កន្ត្រក:</b> #${basketNo} (<code>${matchedInv.facebook_name}</code>)
👤 <b>អ្នកទទួល:</b> ${parsed.customer_name || matchedInv.facebook_name} (📞 <code>${parsed.phone_number || matchedInv.phone_number}</code>)
🚚 <b>ក្រុមហ៊ុនដឹក:</b> ${matchedInv.delivery_carrier}
🔖 <b>លេខកូដតាមដាន (Tracking):</b> <code>${matchedInv.tracking_code}</code>
📍 <b>ទិសដៅដឹក:</b> ${parsed.destination || matchedInv.address || 'តាមខេត្ត'}
💵 <b>សរុបវិក្កយបត្រ:</b> $${matchedInv.total_amount.toFixed(2)}
📸 <b>រូបភាពបុង:</b> បានរក្សាទុកក្នុងប្រព័ន្ធរួចរាល់`;

      await sendTelegramMessage(token, chatId, waybillReply, messageId);
      return;
    }

    // If waybill was recognized but not matched to an active invoice
    const unmatchMsg = `⚠️ <b>AI បានស្កេនបុងឡានកញ្ចប់អីវ៉ាន់ ៖</b>
👤 <b>ឈ្មោះលើកញ្ចប់:</b> <code>${parsed.customer_name || 'មិនច្បាស់'}</code>
📞 <b>លេខទូរស័ព្ទ:</b> <code>${parsed.phone_number || 'មិនមាន'}</code>
🚚 <b>ក្រុមហ៊ុនដឹក:</b> ${parsed.carrier_name || 'វីរៈប៊ុនថាំ (VET Express)'}
🔖 <b>Tracking:</b> <code>${parsed.tracking_code || 'ស្វ័យប្រវត្តិ'}</code>
📍 <b>ទិសដៅ:</b> ${parsed.destination || 'តាមខេត្ត'}
❌ <i>រកមិនឃើញកន្ត្រកដែលមានលេខទូរស័ព្ទ ឬឈ្មោះនេះក្នុងប្រព័ន្ធឡើយ!</i>
💡 <i>លោកអ្នកអាចវាយ <code>/dispatch &lt;លេខកន្ត្រក&gt;</code> ដើម្បីកត់ត្រាចេញដឹកដោយផ្ទាល់ដៃបាន។</i>`;

    await sendTelegramMessage(token, chatId, unmatchMsg, messageId);
    return;
  }

  // =========================================================================
  // 💳 CASE B: BANK TRANSFER SLIP (ABA / ACLEDA / KHQR)
  // =========================================================================
  let detectedBasketNo: string | undefined = parsed.basket_no ? String(parsed.basket_no).replace(/\D/g, '') : undefined;
  if (!detectedBasketNo && caption) {
    const matchB = caption.match(/(?:#|កន្ត្រក\s*|basket\s*|order\s*)(\d+)/i) || caption.match(/\b(\d{2,5})\b/);
    if (matchB) {
      detectedBasketNo = matchB[1];
    }
  }

  const extracted: ExtractedSlipData = {
    customer_name: String(parsed.customer_name || '').trim(),
    paid_amount: Number(parsed.paid_amount) || 0,
    currency: String(parsed.currency || 'USD').toUpperCase() === 'KHR' ? 'KHR' : 'USD',
    phone_number: parsed.phone_number ? String(parsed.phone_number).trim() : undefined,
    bank_name: parsed.bank_name ? String(parsed.bank_name).trim() : undefined,
    trans_ref: parsed.trans_ref ? String(parsed.trans_ref).trim() : undefined,
    basket_no: detectedBasketNo,
    remarks: parsed.remarks
  };

  const amountDisplay = extracted.currency === 'KHR'
    ? `${extracted.paid_amount.toLocaleString()} ៛`
    : `$${extracted.paid_amount.toFixed(2)}`;

  // 4. Match against active invoices (prioritizing newest unpaid basket)
  const matchResult = matchInvoiceForSlip(extracted, extracted.customer_name);

  if (matchResult.status === 'MATCHED' && matchResult.matched) {
    const inv = matchResult.matched;

    // Apply Paid Status
    inv.status = 'Paid';
    inv.payment_status = 'Paid';
    inv.payment_slip_url = slipUrl;
    inv.paid_by = 'KARI AI Bot (Telegram)';
    inv.paid_at = new Date().toISOString();
    if (inv.packing_stage === 'UNPICKED') {
      inv.packing_stage = 'STAGED';
      inv.staged_by = 'KARI AI Bot';
      inv.staged_at = new Date().toISOString();
    }

    if (!inv.phone_number && extracted.phone_number) {
      inv.phone_number = extracted.phone_number;
    }

    saveDatabaseToDisk();
    bumpDataRevision();
    broadcastSSE('order_updated', { invoice: inv });

    const basketNo = inv.basket_no || inv.invoice_id;
    const itemsSummary = inv.items.map(it => `  • ${it.product_name || it.product_code} x${it.quantity} = $${(it.price * it.quantity).toFixed(2)}`).join('\n');

    const locationDisp = inv.address || (inv.location_zone === 'PROVINCE' ? 'ផ្ញើតាមខេត្ត' : 'ភ្នំពេញ');

    const replyMsg = `✅ <b>ផ្ទៀងផ្ទាត់ &amp; Tick [បង់រួច] ជោគជ័យ!</b> 🎉
━━━━━━━━━━━━━━━━━━
🛒 <b>កន្ត្រក:</b> #${basketNo} (<code>${inv.facebook_name || 'អតិថិជន'}</code>)
💵 <b>សរុបវិក្កយបត្រ:</b> <b>$${inv.total_amount.toFixed(2)}</b>
💳 <b>ព័ត៌មាន Slip:</b> ${amountDisplay} (${extracted.bank_name || 'Bank Transfer'})
${extracted.trans_ref ? `🆔 <b>លេខប្រតិបត្តិការ (TxID):</b> <code>${extracted.trans_ref}</code>\n` : ''}📦 <b>ទំនិញ (${inv.items.length} មុខ):</b>
${itemsSummary || '  (ទំនិញទទេ)'}
📍 <b>ទីតាំង:</b> ${locationDisp}
📞 <b>លេខទូរស័ព្ទ:</b> ${inv.phone_number || 'មិនទាន់មាន'}
🎥 <b>វគ្គ Live:</b> #${(inv.live_id || '').replace('LIVE_', '')}`;

    await sendTelegramMessage(token, chatId, replyMsg, messageId);
    return;
  }

  if (matchResult.status === 'MULTIPLE_CANDIDATES' && matchResult.candidates && matchResult.candidates.length > 0) {
    const candidateList = matchResult.candidates
      .slice(0, 4)
      .map((c, i) => `${i + 1}. <b>#${c.basket_no || c.invoice_id}</b> - ${c.facebook_name} ($${c.total_amount.toFixed(2)})`)
      .join('\n');

    const replyMsg = `⚠️ <b>AI បានស្កេន Slip រួចរាល់:</b>
👤 <b>ឈ្មោះលើ Slip:</b> <code>${extracted.customer_name || 'មិនច្បាស់'}</code>
💵 <b>ចំនួនទឹកប្រាក់:</b> <b>${amountDisplay}</b> (${extracted.bank_name || 'Bank'})
${extracted.trans_ref ? `🆔 <b>TxID:</b> <code>${extracted.trans_ref}</code>\n` : ''}
🔍 <b>រកឃើញកន្ត្រកដែលអាចត្រូវគ្នា (${matchResult.candidates.length}):</b>
${candidateList}

💡 <i>សូមវាយ <code>/paid &lt;លេខកន្ត្រក&gt;</code> (ឧ. <code>/paid ${matchResult.candidates[0].basket_no || matchResult.candidates[0].invoice_id}</code>) ដើម្បី Tick បង់រួច!</i>`;

    await sendTelegramMessage(token, chatId, replyMsg, messageId);
    return;
  }

  // If the image is not a bank slip and has 0 amount and no customer name
  if (extracted.paid_amount <= 0 && !extracted.customer_name) {
    const nonSlipMsg = `💡 <b>ព័ត៌មានជំនួយ ៖</b>
រូបភាពនេះមិនមានទិន្នន័យវិក្កយបត្របង់ប្រាក់ ឬបុងឡានដឹកជញ្ជូនឡើយ។

• ប្រសិនបើជា<b>រូបទំនិញលក់</b> ៖ សូមសរសេរ Caption ខាងក្រោមរូប ឧទាហរណ៍ <code>A12 5$</code> ឬ <code>កូដ A01 តម្លៃ 10$</code> ដើម្បីឱ្យ Bot ដាក់បញ្ចូលស្តុក POS ដោយស្វ័យប្រវត្តិ!
• ប្រសិនបើជា<b>វិក្កយបត្រផ្ទេរប្រាក់ ឬបុងឡាន</b> ៖ សូមផ្ញើរូបភាព ឬ Screenshot ឱ្យបានច្បាស់។`;
    await sendTelegramMessage(token, chatId, nonSlipMsg, messageId);
    return;
  }

  // Not found
  const replyMsg = `⚠️ <b>AI បានស្កេនរូបភាព Slip:</b>
👤 <b>ឈ្មោះលើ Slip:</b> <code>${extracted.customer_name || 'មិនច្បាស់'}</code>
💵 <b>ចំនួនទឹកប្រាក់:</b> <b>${amountDisplay}</b> (${extracted.bank_name || 'Bank'})
${extracted.trans_ref ? `🆔 <b>TxID:</b> <code>${extracted.trans_ref}</code>\n` : ''}
❌ <b>រកមិនឃើញកន្ត្រកដែលត្រូវគ្នា ឬកន្ត្រកបានបង់រួចហើយ!</b>
💡 <i>ប្រសិនបើលោកអ្នកស្គាល់លេខកន្ត្រក សូមវាយ: <code>/paid &lt;លេខកន្ត្រក&gt;</code></i>`;

  await sendTelegramMessage(token, chatId, replyMsg, messageId);
}

/**
 * Handle incoming Text Commands (OPTION 3: Chat Assistant)
 */
async function handleIncomingTextCommand(token: string, chatId: number | string, messageId: number, text: string) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 1. /start or /help
  if (lower === '/start' || lower === '/help' || lower === 'help' || lower === 'ជំនួយ') {
    const helpMsg = `🤖 <b>សួស្តី! ខ្ញុំជាជំនួយការ Telegram POS &amp; Live Assistant</b>
━━━━━━━━━━━━━━━━━━
✨ <b>មុខងារពិសេសដែលអាចប្រើបាន ៖</b>

📸 <b>១. ស្កេន Slip បង់ប្រាក់ Auto (AI Free):</b>
👉 គ្រាន់តែ <b>ផ្ញើរូបភាព ឬ Forward រូបភាព Screenshot វិក្កយបត្រ (ABA / ACLEDA / KHQR)</b> ចូលក្នុង Chat ឬ Group នេះ AI នឹងស្កេន និង Tick [បង់រួច] ស្វ័យប្រវត្តិតែម្តង!

💬 <b>២. បញ្ជាពិនិត្យ និងគ្រប់គ្រងតាម Chat:</b>
• <code>/check &lt;លេខកន្ត្រក ឬ ឈ្មោះ&gt;</code> ៖ មើលព័ត៌មានកន្ត្រក និងមុខទំនិញ
  <i>(ឧ. <code>/check 1511</code> ឬ <code>/check ស្រីគុជ</code>)</i>

• <code>/paid &lt;លេខកន្ត្រក&gt;</code> ៖ Tick បង់រួចលើកន្ត្រកភ្លាមៗ
  <i>(ឧ. <code>/paid 1511</code>)</i>

• <code>/unpaid &lt;លេខកន្ត្រក&gt;</code> ៖ ដោះចេញពីស្ថានភាពបង់រួច
  <i>(ឧ. <code>/unpaid 1511</code>)</i>

• <code>/today</code> ឬ <code>/summary</code> ៖ មើលរបាយការណ៍សរុបប្រចាំថ្ងៃ (ចំណូល, កន្ត្រក, វេចខ្ចប់)

• <code>/stock &lt;កូដទំនិញ&gt;</code> ៖ ស្វែងរកស្តុក និងតម្លៃទំនិញ
  <i>(ឧ. <code>/stock A12</code>)</i>

• <code>/live</code> ៖ មើលវគ្គ Live បច្ចុប្បន្នដែលកំពុងដំណើរការ`;

    await sendTelegramMessage(token, chatId, helpMsg, messageId);
    return;
  }

  // 2. /check <query>
  if (lower.startsWith('/check') || lower.startsWith('check ') || lower.startsWith('/មើល') || lower.startsWith('មើល ')) {
    const query = trimmed.replace(/^(\/check|check|\/មើល|មើល)\s*/i, '').trim();
    if (!query) {
      await sendTelegramMessage(token, chatId, '⚠️ សូមបញ្ចូលលេខកន្ត្រក ឬឈ្មោះអតិថិជន!\nឧទាហរណ៍ ៖ <code>/check 1511</code> ឬ <code>/check ស្រីគុជ</code>', messageId);
      return;
    }

    const cleanQuery = query.toLowerCase();
    const matches = invoices.filter(inv => {
      const bNo = String(inv.basket_no || inv.invoice_id);
      const name = (inv.facebook_name || '').toLowerCase();
      const phone = (inv.phone_number || '').replace(/\D/g, '');
      return bNo === cleanQuery || name.includes(cleanQuery) || (phone && phone.includes(cleanQuery));
    });

    if (matches.length === 0) {
      await sendTelegramMessage(token, chatId, `❌ រកមិនឃើញកន្ត្រកដែលមានពាក្យ <b>"${query}"</b> ទេ!`, messageId);
      return;
    }

    // Return the top match or list if multiple
    const inv = matches[0];
    const isPaid = inv.status === 'Paid' || inv.payment_status === 'Paid';
    const stageMap: Record<string, string> = {
      'UNPICKED': '⏳ មិនទាន់រៀប (Unpicked)',
      'STAGED': '📦 រៀបចំរួច (Staged)',
      'DISPATCHED': '🚀 បានចេញដឹក (Dispatched)'
    };

    const stageDisp = stageMap[inv.packing_stage] || inv.packing_stage;
    const itemsList = inv.items.map(it => `  • ${it.product_name || it.product_code} x${it.quantity} = $${(it.price * it.quantity).toFixed(2)}`).join('\n');
    const locationDisp = inv.address || (inv.location_zone === 'PROVINCE' ? 'ផ្ញើតាមខេត្ត' : 'ភ្នំពេញ');

    const checkMsg = `🛒 <b>ព័ត៌មានកន្ត្រក #${inv.basket_no || inv.invoice_id}</b>
━━━━━━━━━━━━━━━━━━
👤 <b>អតិថិជន:</b> <b>${inv.facebook_name || 'អតិថិជន'}</b>
📞 <b>លេខទូរស័ព្ទ:</b> ${inv.phone_number || 'មិនទាន់មាន'}
💵 <b>តម្លៃសរុប:</b> <b>$${inv.total_amount.toFixed(2)}</b>
💳 <b>ស្ថានភាពទូទាត់:</b> ${isPaid ? '✅ <b>បង់រួច (PAID)</b>' : '⏳ <b>មិនទាន់បង់ (UNPAID)</b>'}
📦 <b>ដំណាក់កាលវេចខ្ចប់:</b> ${stageDisp}
📍 <b>ទីតាំង:</b> ${locationDisp}
🎥 <b>វគ្គ Live:</b> #${(inv.live_id || '').replace('LIVE_', '')}

🛍️ <b>ទំនិញក្នុងកន្ត្រក (${inv.items.length} មុខ):</b>
${itemsList || '  (ទំនិញទទេ)'}
${!isPaid ? `\n👉 វាយ <code>/paid ${inv.basket_no || inv.invoice_id}</code> ដើម្បី Tick បង់រួច!` : ''}`;

    await sendTelegramMessage(token, chatId, checkMsg, messageId);
    return;
  }

  // 3. /paid <id>
  if (lower.startsWith('/paid') || lower.startsWith('paid ') || lower.startsWith('/បង់រួច') || lower.startsWith('បង់រួច ')) {
    const idStr = trimmed.replace(/^(\/paid|paid|\/បង់រួច|បង់រួច)\s*/i, '').trim();
    if (!idStr) {
      await sendTelegramMessage(token, chatId, '⚠️ សូមបញ្ចូលលេខកន្ត្រក!\nឧទាហរណ៍ ៖ <code>/paid 1511</code>', messageId);
      return;
    }

    const cleanId = idStr.toLowerCase();
    const inv = invoices.find(i => String(i.basket_no || i.invoice_id).toLowerCase() === cleanId || String(i.invoice_id) === cleanId);

    if (!inv) {
      await sendTelegramMessage(token, chatId, `❌ រកមិនឃើញកន្ត្រកលេខ <b>#${idStr}</b> ទេ!`, messageId);
      return;
    }

    inv.status = 'Paid';
    inv.payment_status = 'Paid';

    saveDatabaseToDisk();
    bumpDataRevision();

    const successMsg = `✅ <b>បាន Tick [បង់រួច] រួចរាល់!</b>
━━━━━━━━━━━━━━━━━━
🛒 <b>កន្ត្រក:</b> #${inv.basket_no || inv.invoice_id} (<code>${inv.facebook_name || 'អតិថិជន'}</code>)
💵 <b>ចំនួនទឹកប្រាក់:</b> <b>$${inv.total_amount.toFixed(2)}</b>
💳 <b>ស្ថានភាព:</b> ✅ PAID (បានធ្វើបច្ចុប្បន្នភាពលើ Web Dashboard)`;

    await sendTelegramMessage(token, chatId, successMsg, messageId);
    return;
  }

  // 4. /unpaid <id>
  if (lower.startsWith('/unpaid') || lower.startsWith('unpaid ') || lower.startsWith('/មិនទាន់បង់')) {
    const idStr = trimmed.replace(/^(\/unpaid|unpaid|\/មិនទាន់បង់)\s*/i, '').trim();
    if (!idStr) {
      await sendTelegramMessage(token, chatId, '⚠️ សូមបញ្ចូលលេខកន្ត្រក!\nឧទាហរណ៍ ៖ <code>/unpaid 1511</code>', messageId);
      return;
    }

    const cleanId = idStr.toLowerCase();
    const inv = invoices.find(i => String(i.basket_no || i.invoice_id).toLowerCase() === cleanId || String(i.invoice_id) === cleanId);

    if (!inv) {
      await sendTelegramMessage(token, chatId, `❌ រកមិនឃើញកន្ត្រកលេខ <b>#${idStr}</b> ទេ!`, messageId);
      return;
    }

    inv.status = 'Pending';
    inv.payment_status = 'Unpaid';

    saveDatabaseToDisk();
    bumpDataRevision();

    await sendTelegramMessage(
      token,
      chatId,
      `🔄 បានប្តូរកន្ត្រក <b>#${inv.basket_no || inv.invoice_id}</b> (${inv.facebook_name}) មកស្ថានភាព <b>⏳ មិនទាន់បង់ (UNPAID)</b> វិញរួចរាល់!`,
      messageId
    );
    return;
  }

  // 5. /today or /summary
  if (lower === '/today' || lower === '/summary' || lower === 'summary' || lower === '/របាយការណ៍' || lower === 'របាយការណ៍') {
    const liveInvoices = activeLiveId && activeLiveId !== 'ALL'
      ? invoices.filter(i => i.live_id === activeLiveId)
      : invoices;

    const totalBaskets = liveInvoices.length;
    const paidInvoices = liveInvoices.filter(i => i.status === 'Paid' || i.payment_status === 'Paid');
    const unpaidInvoices = liveInvoices.filter(i => i.status !== 'Paid' && i.payment_status !== 'Paid');

    const totalRevenue = liveInvoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);
    const paidRevenue = paidInvoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);
    const unpaidRevenue = unpaidInvoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);

    const stagedCount = liveInvoices.filter(i => i.packing_stage === 'STAGED').length;
    const dispatchedCount = liveInvoices.filter(i => i.packing_stage === 'DISPATCHED').length;

    const summaryMsg = `📊 <b>របាយការណ៍សរុប (Live Summary)</b>
━━━━━━━━━━━━━━━━━━
🎥 <b>វគ្គ Live:</b> #${(activeLiveId || 'ALL').replace('LIVE_', '')}
🛒 <b>កន្ត្រកសរុប:</b> <b>${totalBaskets} កន្ត្រក</b>
💰 <b>ចំណូលសរុប:</b> <b>$${totalRevenue.toFixed(2)}</b>

✅ <b>បង់រួច (PAID):</b> ${paidInvoices.length} កន្ត្រក ($${paidRevenue.toFixed(2)})
⏳ <b>មិនទាន់បង់ (UNPAID):</b> ${unpaidInvoices.length} កន្ត្រក ($${unpaidRevenue.toFixed(2)})

🎁 <b>រៀបចំរួច:</b> ${stagedCount} / ${totalBaskets} កន្ត្រក
🚀 <b>ចេញដឹក:</b> ${dispatchedCount} កន្ត្រក`;

    await sendTelegramMessage(token, chatId, summaryMsg, messageId);
    return;
  }

  // 6. /stock <query>
  if (lower.startsWith('/stock') || lower.startsWith('stock ') || lower.startsWith('/ស្តុក') || lower.startsWith('ស្តុក ')) {
    const query = trimmed.replace(/^(\/stock|stock|\/ស្តុក|ស្តុក)\s*/i, '').trim();
    if (!query) {
      await sendTelegramMessage(token, chatId, '⚠️ សូមបញ្ចូលកូដ ឬឈ្មោះទំនិញ!\nឧទាហរណ៍ ៖ <code>/stock A12</code>', messageId);
      return;
    }

    const cleanQ = query.toLowerCase();
    const found = products.filter(p => p.code.toLowerCase().includes(cleanQ) || (p.name && p.name.toLowerCase().includes(cleanQ)));

    if (found.length === 0) {
      await sendTelegramMessage(token, chatId, `❌ រកមិនឃើញទំនិញដែលមានកូដ/ឈ្មោះ <b>"${query}"</b> ក្នុងស្តុកទេ!`, messageId);
      return;
    }

    const list = found.slice(0, 8).map(p => {
      const stockStatus = (p.stock_qty || 0) > 0 ? `📦 សល់: <b>${p.stock_qty}</b>` : '❌ <b>ដាច់ស្តុក</b>';
      return `• <b>[${p.code}]</b> ${p.name || ''} 💵 <b>$${(p.price || 0).toFixed(2)}</b> (${stockStatus})`;
    }).join('\n');

    const stockMsg = `📦 <b>ទិន្នន័យស្តុក (${found.length} មុខ):</b>
━━━━━━━━━━━━━━━━━━
${list}`;

    await sendTelegramMessage(token, chatId, stockMsg, messageId);
    return;
  }

  // 7. /live
  if (lower === '/live') {
    const liveLabel = activeLiveId ? `#${activeLiveId.replace('LIVE_', '')}` : 'គ្រប់ Live (ALL)';
    const count = invoices.filter(i => !activeLiveId || i.live_id === activeLiveId).length;
    await sendTelegramMessage(token, chatId, `🎥 <b>វគ្គ Live សកម្មបច្ចុប្បន្ន ៖</b> <code>${liveLabel}</code> (${count} កន្ត្រក)`, messageId);
  }
}

/**
 * Main Long-Polling Loop for Telegram Bot
 */
async function startPollingLoop() {
  if (botRunning) return;
  botRunning = true;
  pollingAbortController = new AbortController();

  console.log('🤖 [Telegram Bot Assistant & Slip AI Service STARTED]');

  while (botRunning) {
    const token = (settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!token) {
      // Wait for token to be configured
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateOffset}&timeout=20&allowed_updates=["message","channel_post","edited_message"]`;
      let res = await fetch(url, {
        signal: pollingAbortController.signal
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        if (errData?.description && (errData.description.includes('webhook is active') || errData.description.includes('deleteWebhook'))) {
          console.log('⚡ Telegram Bot Service: Detected active webhook, auto-deleting webhook...');
          await deleteTelegramWebhook(token);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        consecutiveErrors++;
        const sleepMs = Math.min(30000, 2000 * Math.pow(1.5, consecutiveErrors));
        await new Promise(r => setTimeout(r, sleepMs));
        continue;
      }

      const data = await res.json();
      consecutiveErrors = 0;

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateOffset = Math.max(lastUpdateOffset, update.update_id + 1);

          const msg = update.message || update.channel_post || update.edited_message;
          if (!msg) continue;

          const chatId = msg.chat?.id;
          const messageId = msg.message_id;

          // Auto-record active group ID if message is from a group or supergroup
          if (chatId && msg.chat && (msg.chat.type === 'group' || msg.chat.type === 'supergroup')) {
            if (settings.telegram_chat_id !== String(chatId)) {
              settings.telegram_chat_id = String(chatId);
              saveDatabaseToDisk();
              console.log(`[Telegram Bot] Auto-synced active Telegram Group ID: ${chatId} (${msg.chat.title || ''})`);
            }
          }

          // Check if photo is attached (either compressed photo or uncompressed document image)
          let photoArray = msg.photo;
          if (!photoArray && msg.document) {
            const isImageDoc = (msg.document.mime_type && msg.document.mime_type.startsWith('image/')) ||
              (msg.document.file_name && /\.(jpe?g|png|webp)$/i.test(msg.document.file_name));
            if (isImageDoc) {
              photoArray = [{ file_id: msg.document.file_id, width: 800, height: 800 }];
            }
          }

          // Case A: Image Attached (Stock Photo or Bank Slip)
          if (Array.isArray(photoArray) && photoArray.length > 0) {
            const rawCaption = msg.caption || '';
            const stockItems = parseLinesForStockItems(rawCaption);

            if (stockItems.length > 0) {
              // 1. PRODUCT PHOTO & CODE -> Add to POS Product Stock via Queue (Throttled & Low RAM)
              telegramQueue.add(async () => {
                await handleIncomingStockItemPhoto(token, chatId, messageId, photoArray, rawCaption, stockItems, msg.date);
              });
            } else {
              // 2. BANK SLIP PHOTO / Chat Screenshot -> Gemini AI Slip OCR via Queue
              telegramQueue.add(async () => {
                await handleIncomingSlipPhoto(token, chatId, messageId, photoArray, msg.caption);
              });
            }
            continue;
          }

          // Case B: Text Message (Command or Stock Item Codes)
          if (typeof msg.text === 'string' && msg.text.trim()) {
            const trimmed = msg.text.trim();

            if (trimmed.startsWith('/')) {
              // Bot Command (/check, /paid, /stock, /today, etc.)
              telegramQueue.add(async () => {
                await handleIncomingTextCommand(token, chatId, messageId, trimmed);
              });
            } else {
              // Check if plain text contains stock item codes (e.g. A01 5$, B02 10$)
              const stockItems = parseLinesForStockItems(trimmed);
              if (stockItems.length > 0) {
                bulkImportStockItems(
                  stockItems.map(item => ({
                    code: item.code,
                    name: item.name,
                    price: item.price,
                    stock_qty: 200
                  })),
                  'merge'
                );

                bumpDataRevision();
                console.log(`[Telegram Stock Sync] Silently recorded text items from chat ${chatId}: ${stockItems.map(s => s.code).join(', ')}`);
              }
            }
            continue;
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || !botRunning) {
        break;
      }
      consecutiveErrors++;
      const sleepMs = Math.min(20000, 1500 * consecutiveErrors);
      await new Promise(r => setTimeout(r, sleepMs));
    }
  }

  console.log('⏹️ [Telegram Bot Assistant & Slip AI Service STOPPED]');
}

/**
 * Initialize and boot Telegram Bot Service
 */
export function initTelegramBotService() {
  if (!botRunning) {
    startPollingLoop().catch(err => {
      console.error('Failed to start Telegram Bot Service:', err);
    });
  }
}

/**
 * Restart or stop service
 */
export function stopTelegramBotService() {
  botRunning = false;
  if (pollingAbortController) {
    pollingAbortController.abort();
    pollingAbortController = null;
  }
}
