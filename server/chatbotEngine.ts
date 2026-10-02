import { GoogleGenAI } from '@google/genai';
import { invoices, products, settings, saveDatabaseToDisk, bumpDataRevision, activeFacebookPage, messengerSlips } from './db';
import { broadcastSSE } from './packingRoutes';
import { Invoice } from './types';
import { isReceiverAccountName, sanitizeCustomerName, matchInvoiceForSlip, callGeminiSlipExtraction, getGemini } from './fastCheckRoutes';
import fs from 'fs';
import path from 'path';

async function sendTelegramAlert(text: string) {
  const token = settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (err) {
    console.error('[Telegram Alert Error]:', err);
  }
}

export interface ChatbotConfig {
  enabled: boolean;
  enableSlipAutoVerify: boolean;
  enableAddressAutoExtract: boolean;
  enableVoiceUnderstanding: boolean;
  enablePaymentReminders: boolean;
  paymentReminderHours: number;
  enableShippingNotifications: boolean;
  enableAiFaq: boolean;
  shopName: string;
  shopLocation: string;
  workingHours: string;
  deliveryTimePP: string;
  deliveryTimeProvince: string;
  shippingRatePP: number;
  shippingRateProvince: number;
  exchangePolicy: string;
  customFaqPrompt: string;
  webhookVerifyToken: string;
  pageAccessToken: string;
}

export interface ChatbotLogItem {
  id: string;
  timestamp: string;
  type: 'SLIP_VERIFIED' | 'ADDRESS_EXTRACTED' | 'VOICE_PROCESSED' | 'PAYMENT_REMINDER' | 'SHIPPING_NOTIFIED' | 'AI_FAQ';
  customer_name: string;
  customer_id?: string;
  basket_no?: number | string;
  incoming_message?: string;
  bot_reply: string;
  status: 'SUCCESS' | 'WARNING' | 'FAILED';
  meta?: any;
}

// Config file path
const CONFIG_FILE = path.join(process.cwd(), 'data', 'chatbot_config.json');
const LOGS_FILE = path.join(process.cwd(), 'data', 'chatbot_logs.json');

// Default Config
let chatbotConfig: ChatbotConfig = {
  enabled: true,
  enableSlipAutoVerify: true,
  enableAddressAutoExtract: true,
  enableVoiceUnderstanding: true,
  enablePaymentReminders: true,
  paymentReminderHours: 4,
  enableShippingNotifications: true,
  enableAiFaq: true,
  shopName: 'KARI LIVE STORE',
  shopLocation: 'រាជធានីភ្នំពេញ (ក្បែរផ្សារទួលទំពូង)',
  workingHours: '8:00 ព្រឹក - 9:00 យប់ (រៀងរាល់ថ្ងៃ)',
  deliveryTimePP: '1 ទៅ 2 ថ្ងៃ',
  deliveryTimeProvince: '2 ទៅ 3 ថ្ងៃ',
  shippingRatePP: 1.0,
  shippingRateProvince: 1.5,
  exchangePolicy: 'អាចប្តូរបានក្នុងរយៈពេល ៣ ថ្ងៃ ប្រសិនបើខុសទំហំ Size ឬទំនិញមានបញ្ហា',
  customFaqPrompt: 'ឆ្លើយតបដោយសុភាពរាបសារ រួសរាយ និងជាភាសាខ្មែរជានិច្ច។',
  webhookVerifyToken: 'kari_live_bot_secret_2026',
  pageAccessToken: ''
};

let chatbotLogs: ChatbotLogItem[] = [];

// Load config and logs from disk
export function initChatbotStore() {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      chatbotConfig = { ...chatbotConfig, ...saved };
    }
    if (fs.existsSync(LOGS_FILE)) {
      chatbotLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to init chatbot store:', err);
  }
}

export function saveChatbotConfigToDisk(newConfig: Partial<ChatbotConfig>) {
  chatbotConfig = { ...chatbotConfig, ...newConfig };
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(chatbotConfig, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save chatbot config:', err);
  }
}

export function addChatbotLog(log: Omit<ChatbotLogItem, 'id' | 'timestamp'>) {
  const newLog: ChatbotLogItem = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...log
  };
  chatbotLogs.unshift(newLog);
  if (chatbotLogs.length > 200) {
    chatbotLogs = chatbotLogs.slice(0, 200);
  }
  try {
    const dir = path.dirname(LOGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOGS_FILE, JSON.stringify(chatbotLogs, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save chatbot logs:', err);
  }
  return newLog;
}

export function getChatbotConfig(): ChatbotConfig {
  return chatbotConfig;
}

export function getChatbotLogs(): ChatbotLogItem[] {
  return chatbotLogs;
}

// Get GoogleGenAI Instance with Key hierarchy
function getGenAI(): GoogleGenAI | null {
  return getGemini();
}

// Anti-Replay Guard: Keep track of used transaction references
const usedSlipRefs = new Set<string>();

/**
 * -------------------------------------------------------------
 * 1. AI SLIP AUTO-VERIFY IN CHAT (#2)
 * -------------------------------------------------------------
 */
export async function processIncomingSlipImage(
  senderId: string,
  senderName: string,
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<{ success: boolean; reply: string; invoice?: Invoice }> {
  if (!chatbotConfig.enabled || !chatbotConfig.enableSlipAutoVerify) {
    return {
      success: false,
      reply: ''
    };
  }

  const ai = getGenAI();
  if (!ai) {
    return {
      success: false,
      reply: ''
    };
  }

  try {
    let cleanBase64 = '';
    let savedSlipUrl = '';

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    if (imageBase64.startsWith('http://') || imageBase64.startsWith('https://')) {
      try {
        const resp = await fetch(imageBase64);
        const arrayBuf = await resp.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        cleanBase64 = buf.toString('base64');
        const ext = (mimeType && mimeType.includes('png')) ? '.png' : '.jpg';
        const fileName = `slip_fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
        const localPath = path.join(uploadsDir, fileName);
        fs.writeFileSync(localPath, buf);
        savedSlipUrl = `/uploads/${fileName}`;

        // Also copy to dist/uploads if dist exists
        const distUploads = path.join(process.cwd(), 'dist', 'uploads');
        if (fs.existsSync(distUploads)) {
          try {
            fs.writeFileSync(path.join(distUploads, fileName), buf);
          } catch {}
        }
      } catch (dlErr) {
        console.error('Failed to download incoming Messenger image:', dlErr);
        return {
          success: false,
          reply: `អរគុណបង ${senderName}! ហាងបានទទួលរូបភាពហើយ បុគ្គលិកនឹងពិនិត្យផ្ទៀងផ្ទាត់ជូនបងបន្ថែមណា៎។ 🙏`
        };
      }
    } else {
      cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      try {
        const buf = Buffer.from(cleanBase64, 'base64');
        const ext = (mimeType && mimeType.includes('png')) ? '.png' : '.jpg';
        const fileName = `slip_fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
        const localPath = path.join(uploadsDir, fileName);
        fs.writeFileSync(localPath, buf);
        savedSlipUrl = `/uploads/${fileName}`;

        const distUploads = path.join(process.cwd(), 'dist', 'uploads');
        if (fs.existsSync(distUploads)) {
          try {
            fs.writeFileSync(path.join(distUploads, fileName), buf);
          } catch {}
        }
      } catch {}
    }
    
    // Strict OCR & Slip Verification using Gemini Flash
    const promptText = `You are a strict validation & OCR parser for Cambodian Mobile Banking Transfer Slips (ABA Mobile, ACLEDA ToanChet, Bakong / KHQR, Wing Bank, Canadia, TrueMoney, Chip Mong, Sathapana, FTB, etc.).

CRITICAL RULES:
1. First, verify whether the image is a REAL digital mobile banking transfer slip / receipt screenshot.
   - It MUST be an authentic digital bank payment confirmation (e.g. ABA Mobile transfer receipt, ACLEDA ToanChet transfer receipt, KHQR payment confirmation, Wing receipt).
   - REJECT (set is_bank_slip: false) if the image is:
     * A paper-printed packing list / fulfillment delivery receipt / thermal receipt (e.g. "KARI ARNETT BOUTIQUE", "PACKING LIST", store receipt, delivery waybill).
     * A photo of parcels, yellow shipping bags, or packaging.
     * A photo of clothes, dresses, shirts, pants, products, or goods.
     * A selfie, person photo, screenshot of conversation, or random image.
     * An ABA KHQR payment code screen (asking someone to scan) rather than a completed transaction receipt.

2. If is_bank_slip is true:
   - CRITICAL BENEFICIARY / RECEIVER RULE: The merchant/shop receiver receiving the money is "PROEL TOCH" or "KARI ARNETT". NEVER extract "PROEL TOCH" or "KARI ARNETT" as the customer name!
   - "customer_name": STRICTLY the PAYER / SENDER customer name who transferred the money (e.g. "From: SOK SREY MAO", "DANY KA"). If payer name is not listed or is unclear, leave customer_name as null.
   - "paid_amount": exact transferred numeric amount (e.g. 11.20 or 45000).
   - "currency": "USD" or "KHR".
   - "bank_name": "ABA" | "ACLEDA" | "Canadia" | "Wing" | "Bakong" | "TrueMoney" | "Chip Mong" | "Sathapana" | "Other".
   - "trans_ref": transaction reference or ID number.
   - "trans_date": date/time of transfer.
   - "basket_no_in_slip": order / basket number if mentioned in transfer remarks (e.g. 5093 or null).
   - "phone_number": phone number if visible on slip or in chat.

Return strict JSON ONLY:
{
  "is_bank_slip": true or false,
  "rejection_reason": "NOT_A_BANK_SLIP" | "PACKING_OR_STORE_RECEIPT" | "PHOTO_OF_GOODS" | "NONE",
  "customer_name": "...",
  "paid_amount": 0.00,
  "currency": "USD" | "KHR",
  "bank_name": "...",
  "trans_ref": "...",
  "trans_date": "...",
  "basket_no_in_slip": null or number,
  "phone_number": null or string
}`;

    const ocrRes = await callGeminiSlipExtraction(
      ai,
      { inlineData: { mimeType, data: cleanBase64 } },
      { text: promptText }
    );

    const rawText = ocrRes.text || '';
    if (!rawText.trim()) {
      return {
        success: false,
        reply: `អរគុណបង ${senderName}! ហាងបានទទួលរូបភាពហើយ បុគ្គលិកនឹងពិនិត្យផ្ទៀងផ្ទាត់ជូនបងបន្ថែមណា៎។ 🙏`
      };
    }

    let extracted: any = {};
    try {
      const cleaned = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
      extracted = JSON.parse(cleaned);
    } catch {
      return {
        success: false,
        reply: `អរគុណបង ${senderName}! ហាងបានទទួលរូបភាពហើយ បុគ្គលិកនឹងពិនិត្យផ្ទៀងផ្ទាត់ជូនបងបន្ថែមណា៎។ 🙏`
      };
    }

    // Sanitize customer name: Always prioritize Facebook Sender Name if AI extracted receiver name or empty
    extracted.customer_name = sanitizeCustomerName(extracted.customer_name, senderName);

    const isBankSlip = Boolean(extracted.is_bank_slip);
    let paidAmount = Number(extracted.paid_amount) || 0;
    const currency = String(extracted.currency || 'USD').toUpperCase();
    const bankName = extracted.bank_name || 'ធនាគារ';
    const transRef = extracted.trans_ref ? String(extracted.trans_ref).trim() : '';
    const basketNoInSlip = extracted.basket_no_in_slip ? Number(extracted.basket_no_in_slip) : null;

    // KHR to USD conversion if paid in Riel
    if (currency === 'KHR' && paidAmount > 0) {
      paidAmount = Math.round((paidAmount / 4100) * 100) / 100;
    }

    // 1. SILENT REJECTION OF NON-BANK SLIP IMAGES
    if (!isBankSlip || paidAmount <= 0) {
      addChatbotLog({
        type: 'SLIP_VERIFIED',
        customer_name: senderName,
        customer_id: senderId,
        incoming_message: `[រូបភាពទូទៅ/មិនមែន Slip ធនាគារ - ${extracted.rejection_reason || 'NOT_A_BANK_SLIP'}]`,
        bot_reply: '[ស្ងាត់ស្ងៀម - ទុកឱ្យ Admin ឆ្លើយតបធម្មតា]',
        status: 'WARNING',
        meta: extracted
      });

      return { success: false, reply: '' };
    }

    // 2. REJECT DUPLICATE SLIPS (Anti-Replay Attack)
    if (transRef && usedSlipRefs.has(transRef)) {
      const dupReply = `⚠️ វិក្កយបត្រនេះ (Ref: ${transRef}) ត្រូវបានប្រើប្រាស់កាត់បង់រួចម្តងរួចមកហើយ។ សូមកុំផ្ញើវិក្កយបត្រដដែលៗ! អរគុណច្រើនបង! 🙏`;
      return { success: false, reply: dupReply };
    }

    // 3. LOCATE ACTIVE INVOICE BELONGING TO THIS CUSTOMER
    const activeInvoices = invoices.filter(
      i => i.status !== 'Cancelled' && i.status !== 'Dispatched' && i.packing_stage !== 'DISPATCHED'
    );

    let matchedInv: Invoice | undefined;

    // A. Match if basket number is explicitly mentioned in slip remarks (e.g. #5093)
    if (basketNoInSlip) {
      matchedInv = activeInvoices.find(
        i => i.basket_no === basketNoInSlip || i.invoice_id === basketNoInSlip
      );
    }

    // B. Direct match by Facebook sender ID
    if (!matchedInv && senderId && senderId !== 'TEST_USER_1') {
      matchedInv = activeInvoices.find(i => i.facebook_user_id === senderId);
    }

    // C. Direct match by Facebook sender Name
    if (!matchedInv && senderName && senderName !== 'Dany Ka' && senderName !== 'អតិថិជនសាកល្បង' && senderName !== 'Facebook Customer') {
      matchedInv = activeInvoices.find(
        i => i.facebook_name && i.facebook_name.toLowerCase().trim() === senderName.toLowerCase().trim()
      );
    }

    // D. Direct match by extracted customer name on slip
    if (!matchedInv && extracted.customer_name) {
      const extNameClean = String(extracted.customer_name).toLowerCase().trim();
      matchedInv = activeInvoices.find(
        i => i.facebook_name && i.facebook_name.toLowerCase().trim().includes(extNameClean)
      );
    }

    // E. Smart Multi-Tier Match via matchInvoiceForSlip
    if (!matchedInv) {
      const matchRes = matchInvoiceForSlip({
        customer_name: extracted.customer_name || senderName,
        paid_amount: paidAmount,
        currency: currency as any,
        phone_number: extracted.phone_number,
        bank_name: bankName,
        trans_ref: transRef,
        basket_no: basketNoInSlip || undefined
      });
      if (matchRes.status === 'MATCHED' && matchRes.matched) {
        matchedInv = matchRes.matched;
      }
    }

    // 4. If still no basket found, notify team and inform customer
    if (!matchedInv) {
      const reply = `🧾 ហាងបានស្កេនឃើញវិក្កយបត្រចំនួន $${paidAmount.toFixed(2)} (${bankName} ‧ Ref: ${transRef || 'N/A'}) ពីបង ${senderName}។\n\n⚠️ ប៉ុន្តែប្រព័ន្ធមិនទាន់រកឃើញកន្ត្រកដែលកំពុងរង់ចាំបង់ប្រាក់ត្រូវគ្នានឹងគណនីរបស់បងទេ។ បុគ្គលិកនឹងជួយពិនិត្យផ្ទៀងផ្ទាត់ជូនបងបន្ថែម! 🙏`;
      addChatbotLog({
        type: 'SLIP_VERIFIED',
        customer_name: extracted.customer_name || senderName,
        customer_id: senderId,
        incoming_message: `[រូបភាព Slip $${paidAmount.toFixed(2)} (${bankName})]`,
        bot_reply: reply,
        status: 'WARNING',
        meta: extracted
      });

      sendTelegramAlert(
        `⚠️ <b>AI បានទទួល Slip ក្នុង Chat ប៉ុន្តែរកមិនឃើញកន្ត្រកត្រូវគ្នា:</b>\n👤 <b>ភ្ញៀវ:</b> ${senderName} (ID: <code>${senderId}</code>)\n💵 <b>ទឹកប្រាក់:</b> $${paidAmount.toFixed(2)} (${bankName})\n💳 <b>TxID:</b> <code>${transRef || 'N/A'}</code>\n💡 <i>សូមបុគ្គលិកជួយពិនិត្យក្នុងប្រព័ន្ធ POS</i>`
      );

      return { success: false, reply };
    }

    // Auto-mark invoice as Paid in KARI OS
    matchedInv.status = 'Paid';
    (matchedInv as any).payment_status = 'Paid';
    matchedInv.paid_by = 'KARI AI Bot (Chat)';
    matchedInv.paid_at = new Date().toISOString();
    matchedInv.payment_method = bankName;
    if (savedSlipUrl) {
      matchedInv.payment_slip_url = savedSlipUrl;
    }
    if (matchedInv.packing_stage === 'UNPICKED') {
      matchedInv.packing_stage = 'STAGED';
      matchedInv.staged_by = 'KARI AI Bot';
      matchedInv.staged_at = new Date().toISOString();
    }

    if (transRef) {
      usedSlipRefs.add(transRef);
    }

    // Add / update in Messenger Auto-Scan Table queue
    const existingIndex = messengerSlips.findIndex(s => s.slip_url === savedSlipUrl || (transRef && s.extracted.trans_ref === transRef));
    const newSlipItem: any = {
      id: `mslip_live_${Date.now()}`,
      source: 'MESSENGER',
      sender_id: senderId,
      sender_name: matchedInv.facebook_name || senderName,
      slip_url: savedSlipUrl,
      received_at: new Date().toISOString(),
      extracted: {
        customer_name: extracted.customer_name || matchedInv.facebook_name,
        paid_amount: paidAmount,
        currency: currency as any,
        phone_number: extracted.phone_number || matchedInv.phone_number,
        bank_name: bankName,
        trans_ref: transRef,
        basket_no: matchedInv.basket_no || matchedInv.invoice_id,
        remarks: extracted.remarks || ''
      },
      status: 'APPROVED',
      is_approved: true,
      confidence: 100,
      matched_invoice: {
        invoice_id: matchedInv.invoice_id,
        basket_no: matchedInv.basket_no,
        live_id: matchedInv.live_id,
        facebook_name: matchedInv.facebook_name,
        phone_number: matchedInv.phone_number,
        total_amount: matchedInv.total_amount,
        created_at: matchedInv.created_at,
        packing_stage: matchedInv.packing_stage,
        status: matchedInv.status
      }
    };

    if (existingIndex !== -1) {
      messengerSlips[existingIndex] = newSlipItem;
    } else {
      messengerSlips.unshift(newSlipItem);
    }

    bumpDataRevision();
    saveDatabaseToDisk();
    broadcastSSE('order_updated', { invoice: matchedInv });

    const reply = `✅ ហាងបានទទួលការទូទាត់ប្រាក់ចំនួន $${paidAmount.toFixed(2)} (${bankName} ‧ Ref: ${transRef || 'N/A'}) ត្រឹមត្រូវ ១០០% ហើយបង ${matchedInv.facebook_name}! 🎉\n\n📦 កន្ត្រកលេខ #${matchedInv.basket_no || matchedInv.invoice_id} របស់បងត្រូវបានសម្គាល់ [បង់រួច] និងបញ្ជូនទៅកាន់បញ្ជីវេចខ្ចប់រួចរាល់។ អរគុណច្រើនបង! 🙏`;

    addChatbotLog({
      type: 'SLIP_VERIFIED',
      customer_name: matchedInv.facebook_name,
      customer_id: senderId,
      basket_no: matchedInv.basket_no || matchedInv.invoice_id,
      incoming_message: `[រូបភាព Slip $${paidAmount.toFixed(2)} (${bankName})]`,
      bot_reply: reply,
      status: 'SUCCESS',
      meta: { ...extracted, paid_amount: paidAmount }
    });

    sendTelegramAlert(
      `✅ <b>ភ្ញៀវបានផ្ញើ Slip ក្នុង Chat Messenger &amp; Tick [បង់រួច]!</b> 🎉\n━━━━━━━━━━━━━━━━━━\n🛒 <b>កន្ត្រក:</b> #${matchedInv.basket_no || matchedInv.invoice_id} (<code>${matchedInv.facebook_name}</code>)\n💵 <b>ទឹកប្រាក់:</b> $${paidAmount.toFixed(2)} (${bankName})\n💳 <b>TxID:</b> <code>${transRef || 'N/A'}</code>`
    );

    return { success: true, reply, invoice: matchedInv };
  } catch (err: any) {
    console.error('Slip processing error:', err);
    return {
      success: false,
      reply: `អរគុណបង ${senderName}! ហាងបានទទួលវិក្កយបត្រហើយ បុគ្គលិកនឹងពិនិត្យផ្ទៀងផ្ទាត់ជូនបងបន្ថែម។`
    };
  }
}

/**
 * -------------------------------------------------------------
 * 2. AI AUTO-EXTRACT ADDRESS & PHONE (#3)
 * -------------------------------------------------------------
 */
export async function processIncomingAddressText(
  senderId: string,
  senderName: string,
  text: string
): Promise<{ isAddressOrPhone: boolean; reply?: string; invoice?: Invoice }> {
  if (!chatbotConfig.enabled || !chatbotConfig.enableAddressAutoExtract) return { isAddressOrPhone: false };

  // Quick heuristic: does it contain phone numbers or typical address keywords?
  const hasPhone = /(?:0\d{8,9}|\+855\d{8,9})/.test(text.replace(/[\s-]/g, ''));
  const hasAddressWord = /(ភ្នំពេញ|ខេត្ត|ស្រុក|ខណ្ឌ|សង្កាត់|ភូមិ|ផ្ទះ|ម្តុំ|ជិត|ផ្លូវ|ស្តុប|pp|phnom penh|province|street|st|khan|sangkat)/i.test(text);

  if (!hasPhone && !hasAddressWord) {
    return { isAddressOrPhone: false };
  }

  // Guard: If customer is asking an order inquiry/tracking/status question and NOT giving a phone number, route to FAQ/Chat engine!
  const isQuestionSentence = /(ចេញមកនៅ|ចេញនៅ|ផ្ញើនៅ|ដឹកនៅ|ដល់នៅ|នៅបង|ប៉ុន្មាន|ថ្លៃ|ពេលណា|ម៉ោង|នៅឯណា|កន្លែងណា|មិច|ម៉េច|ទេ\?|\?|បានអីខ្លះ|អាវ៉ាន់|អីវ៉ាន់)/i.test(text);
  if (isQuestionSentence && !hasPhone) {
    return { isAddressOrPhone: false };
  }

  const ai = getGenAI();
  let extracted = { phone_number: '', full_address: '', location_zone: 'UNKNOWN' };

  if (ai) {
    try {
      const prompt = `Analyze this customer message in Cambodia for delivery details:
"${text}"

Extract in strict JSON:
{
  "is_delivery_info": true or false,
  "phone_number": "standard Cambodian phone format e.g. 0964428567",
  "full_address": "clean structured address in Khmer/English",
  "location_zone": "PHNOM_PENH" or "PROVINCE"
}
If this is just a general question or not delivery info, return "is_delivery_info": false.
Return ONLY valid JSON.`;

      const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      let rawResponseText = '';

      for (const model of modelsToTry) {
        try {
          const res = await ai.models.generateContent({
            model,
            contents: prompt
          });
          if (res.text) {
            rawResponseText = res.text;
            break;
          }
        } catch {
          // try next model
        }
      }

      if (rawResponseText) {
        const parsed = JSON.parse(rawResponseText.replace(/```json/gi, '').replace(/```/gi, '').trim() || '{}');
        if (parsed.is_delivery_info) {
          extracted = {
            phone_number: parsed.phone_number || '',
            full_address: parsed.full_address || text.trim(),
            location_zone: parsed.location_zone || 'UNKNOWN'
          };
        }
      }
    } catch {
      // ignore
    }
  }

  // Resilient Regex & Khmer Heuristic Fallback if AI is exhausted or offline
  if (!extracted.phone_number && !extracted.full_address) {
    const phoneMatch = text.match(/(?:0\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}|0\d{8,9}|\+855\d{8,9})/);
    const phone = phoneMatch ? phoneMatch[0].replace(/[\s.-]/g, '') : '';
    let address = text.replace(/(?:0\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}|0\d{8,9}|\+855\d{8,9})/, '').trim();
    if (!address) address = text.trim();
    const isPP = /ភ្នំពេញ|pp|phnom penh|ចាក់អង្រែ|ទួលគោក|បឹងកេងកង|សែនសុខ|មានជ័យ|ដង្កោ|ច្បារអំពៅ|ឫស្សីកែវ|ជ្រោយចង្វារ|ពោធិ៍សែនជ័យ|កំបូល|ព្រែកព្នៅ/i.test(text);
    const zone = isPP ? 'PHNOM_PENH' : 'PROVINCE';

    if (phone || (address && address.length > 2)) {
      extracted = {
        phone_number: phone,
        full_address: address,
        location_zone: zone
      };
    }
  }

  if (!extracted.phone_number && !extracted.full_address) {
    return { isAddressOrPhone: false };
  }

  // Find customer active invoice
  const activeInvoices = invoices.filter(
    i => i.status !== 'Cancelled' && i.status !== 'Dispatched' && i.packing_stage !== 'DISPATCHED'
  );

  const matchedInv = activeInvoices.find(i => {
    if (i.facebook_user_id && senderId && i.facebook_user_id === senderId) return true;
    if (senderName && i.facebook_name && i.facebook_name.toLowerCase().trim() === senderName.toLowerCase().trim()) return true;
    return false;
  });

  if (matchedInv) {
    if (extracted.phone_number) matchedInv.phone_number = extracted.phone_number;
    if (extracted.full_address) matchedInv.address = extracted.full_address;
    if (extracted.location_zone === 'PHNOM_PENH') {
      matchedInv.location_zone = 'PP';
      matchedInv.shipping_fee = chatbotConfig.shippingRatePP;
    } else if (extracted.location_zone === 'PROVINCE') {
      matchedInv.location_zone = 'PROVINCE';
      matchedInv.shipping_fee = chatbotConfig.shippingRateProvince;
    }

    // Recalculate invoice total
    const subtotal = matchedInv.items.reduce((s, it) => s + (it.price * it.quantity), 0);
    const ship = matchedInv.is_free_ship ? 0 : (matchedInv.shipping_fee ?? 1.0);
    matchedInv.total_amount = Math.round((subtotal + ship) * 100) / 100;
    matchedInv.updated_at = new Date().toISOString();

    bumpDataRevision();
    saveDatabaseToDisk();

    const zoneText = matchedInv.location_zone === 'PP' ? 'ភ្នំពេញ' : 'ខេត្ត';
    const feeText = `$${(matchedInv.shipping_fee ?? 1.0).toFixed(2)}`;
    const reply = `✅ ហាងបានកត់ត្រាទីតាំងរបស់បង ${senderName} ក្នុងកន្ត្រក #${matchedInv.basket_no || matchedInv.invoice_id} ៖\n📞 ${matchedInv.phone_number || 'មិនទាន់មាន'}\n📍 ${matchedInv.address}\n🚚 សេវាដឹក (${zoneText}) ៖ ${feeText} ‧ សរុប ៖ $${matchedInv.total_amount.toFixed(2)}\nអរគុណច្រើនបង! 🙏`;

    addChatbotLog({
      type: 'ADDRESS_EXTRACTED',
      customer_name: senderName,
      customer_id: senderId,
      basket_no: matchedInv.basket_no || matchedInv.invoice_id,
      incoming_message: text,
      bot_reply: reply,
      status: 'SUCCESS',
      meta: { phone: matchedInv.phone_number, address: matchedInv.address, zone: matchedInv.location_zone }
    });

    return { isAddressOrPhone: true, reply, invoice: matchedInv };
  } else {
    // No active basket, but confirmed address/phone
    const reply = `✅ ហាងបានកត់ត្រាលេខទូរស័ព្ទ និងទីតាំងរបស់បង ${senderName} រួចរាល់ហើយ។ អរគុណច្រើនបង! 🙏`;
    addChatbotLog({
      type: 'ADDRESS_EXTRACTED',
      customer_name: senderName,
      customer_id: senderId,
      incoming_message: text,
      bot_reply: reply,
      status: 'SUCCESS',
      meta: extracted
    });
    return { isAddressOrPhone: true, reply };
  }

  return { isAddressOrPhone: false };
}

/**
 * -------------------------------------------------------------
 * 3. AUTO-PAYMENT REMINDERS (#4)
 * -------------------------------------------------------------
 */
export async function generatePaymentReminders(): Promise<{ count: number; messages: Array<{ invoice: Invoice; message: string }> }> {
  if (!chatbotConfig.enablePaymentReminders) return { count: 0, messages: [] };

  const now = Date.now();
  const cutoffMs = chatbotConfig.paymentReminderHours * 60 * 60 * 1000;

  // Staged / Unpaid invoices waiting for payment
  const unpaidInvoices = invoices.filter(i => {
    if (i.status === 'Paid' || i.status === 'Cancelled' || i.status === 'Dispatched') return false;
    if (i.packing_stage !== 'STAGED' && i.packing_stage !== 'UNPICKED') return false;
    const createdAt = new Date(i.created_at).getTime();
    return (now - createdAt) >= cutoffMs;
  });

  const reminders: Array<{ invoice: Invoice; message: string }> = [];

  for (const inv of unpaidInvoices) {
    const itemsSummary = inv.items.map(it => `${it.product_code}x${it.quantity}`).join(', ');
    const msg = `🔔 សួស្តីបង ${inv.facebook_name}! ហាងសូមរំលឹកកន្ត្រកលេខ #${inv.basket_no || inv.invoice_id} (ទំនិញ៖ ${itemsSummary} | សរុប៖ $${inv.total_amount.toFixed(2)}) របស់បងកំពុងរង់ចាំការទូទាត់។\n\nសូមបងមេត្តាផ្ញើវិក្កយបត្របង់ប្រាក់ដើម្បីឱ្យហាងរៀបចំច្រក និងចេញដឹកជូនបងឆាប់ៗនេះ។ សូមអរគុណច្រើនបង! 🙏`;
    
    reminders.push({ invoice: inv, message: msg });

    addChatbotLog({
      type: 'PAYMENT_REMINDER',
      customer_name: inv.facebook_name,
      customer_id: inv.facebook_user_id,
      basket_no: inv.basket_no || inv.invoice_id,
      bot_reply: msg,
      status: 'SUCCESS',
      meta: { total_amount: inv.total_amount, items: itemsSummary }
    });
  }

  return { count: reminders.length, messages: reminders };
}

/**
 * -------------------------------------------------------------
 * 4. AUTO-SHIPPING NOTIFICATION (#5)
 * -------------------------------------------------------------
 */
export function generateShippingNotification(
  invoice: Invoice,
  carrierName: string = 'J&T Express',
  trackingCode?: string
): string {
  if (!chatbotConfig.enableShippingNotifications) return '';

  const cleanTracking = trackingCode || `KARI-${Date.now().toString().slice(-6)}`;
  const msg = `🚚 ដំណឹងចេញដឹកជញ្ជូន ៖\n\nសួស្តីបង ${invoice.facebook_name}! កញ្ចប់អីវ៉ាន់លេខ #${invoice.basket_no || invoice.invoice_id} របស់បងត្រូវបានប្រគល់ជូនក្រុមហ៊ុនដឹក [${carrierName}] រួចរាល់ហើយ! 🎉\n\n🔖 លេខកូដតាមដាន (Tracking) ៖ ${cleanTracking}\n📞 ទូរស័ព្ទទទួល ៖ ${invoice.phone_number || 'តាមការណាត់'}\n🏠 ទីតាំង ៖ ${invoice.address || 'រាជធានី/ខេត្ត'}\n\nអ្នកដឹកនឹងទាក់ទងទូរស័ព្ទទៅបងនៅពេលកញ្ចប់អីវ៉ាន់ទៅដល់។ អរគុណច្រើនសម្រាប់ការគាំទ្រហាងយើងខ្ញុំ! 🙏`;

  addChatbotLog({
    type: 'SHIPPING_NOTIFIED',
    customer_name: invoice.facebook_name,
    customer_id: invoice.facebook_user_id,
    basket_no: invoice.basket_no || invoice.invoice_id,
    bot_reply: msg,
    status: 'SUCCESS',
    meta: { carrier: carrierName, tracking: cleanTracking }
  });

  return msg;
}

/**
 * -------------------------------------------------------------
 * 4.5. AI KHMER VOICE / AUDIO NOTE UNDERSTANDING (#12)
 * -------------------------------------------------------------
 */
export async function processIncomingVoiceAudio(
  senderId: string,
  senderName: string,
  audioBase64: string,
  mimeType: string = 'audio/mp4'
): Promise<{ success: boolean; reply: string; transcription?: string; invoice?: Invoice; type?: string }> {
  if (!chatbotConfig.enabled || !chatbotConfig.enableVoiceUnderstanding) {
    return { success: false, reply: '' };
  }

  const ai = getGenAI();
  if (!ai) {
    return { success: false, reply: '' };
  }

  try {
    const cleanBase64 = audioBase64.replace(/^data:audio\/\w+;base64,/, '');

    const promptText = `You are an expert Khmer speech-to-text transcriber and conversational AI assistant for "${chatbotConfig.shopName}".
Shop Details:
- Location: ${chatbotConfig.shopLocation}
- Working Hours: ${chatbotConfig.workingHours}
- Delivery: Phnom Penh (${chatbotConfig.deliveryTimePP}, $${chatbotConfig.shippingRatePP.toFixed(2)}), Provinces (${chatbotConfig.deliveryTimeProvince}, $${chatbotConfig.shippingRateProvince.toFixed(2)})
- Policy: ${chatbotConfig.exchangePolicy}

Listen to this Khmer audio voice note from customer "${senderName}".
1. Transcribe the spoken Khmer audio accurately.
2. Determine user's real intention:
   - "is_providing_address_phone": true ONLY if the customer is specifically providing their delivery address/phone for their order (e.g. "012345678 ផ្ទះលេខ...", "ផ្ញើមកខេត្តកណ្តាល លេខ 096..."). If they are asking a question (e.g. asking if order is sent/dispatched, asking price, asking hours, tracking), set this to false.
   - "phone": "012345678" or null,
   - "address": "location text" or null,
   - "reply_khmer": "Sweet-toned, polite, and strictly 1-2 lines Khmer reply directly answering what the customer asked (e.g. 'ចាសបង [ឈ្មោះ]!... ណា៎បង 🙏✨')."

Return strictly valid JSON:
{
  "transcription": "spoken Khmer text",
  "is_providing_address_phone": true/false,
  "phone": null,
  "address": null,
  "reply_khmer": "..."
}
Return ONLY pure JSON. No markdown ticks, no commentary.`;

    const modelCandidates = ['gemini-3.5-transcribe', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let ocrResText = '';
    for (const modelName of modelCandidates) {
      try {
        const res = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: mimeType || 'audio/mp4', data: cleanBase64 } },
                { text: promptText }
              ]
            }
          ]
        });
        if (res.text) {
          ocrResText = res.text;
          break;
        }
      } catch (e: any) {
        console.warn(`[Gemini Voice Audio candidate ${modelName} unavailable/quota]:`, e?.message || e);
      }
    }

    if (!ocrResText) {
      return {
        success: false,
        reply: '⚠️ ប្រព័ន្ធទទួលសំឡេងកំពុងមមាញឹកបន្តិច សូមបងសាកល្បងម្ដងទៀត ឬវាយជាអក្សរជំនួសវិញបានណា៎បង! 🙏'
      };
    }

    const cleaned = ocrResText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    const transcription = parsed.transcription || '';

    // Check if customer is genuinely providing delivery address or phone number (not asking a question)
    const isQuestion = /(ចេញមកនៅ|ចេញនៅ|ផ្ញើនៅ|ដឹកនៅ|ដល់នៅ|នៅបង|ប៉ុន្មាន|ថ្លៃ|ពេលណា|ម៉ោង|នៅឯណា|កន្លែងណា|មិច|ម៉េច|ទេ\?|\?)/i.test(transcription);
    if ((parsed.is_providing_address_phone || parsed.phone) && !isQuestion) {
      const addressResult = await processIncomingAddressText(
        senderId,
        senderName,
        transcription || `${parsed.phone || ''} ${parsed.address || ''}`
      );
      if (addressResult.isAddressOrPhone && addressResult.reply) {
        addChatbotLog({
          type: 'VOICE_PROCESSED',
          customer_name: senderName,
          customer_id: senderId,
          incoming_message: `🎙️ [Voice]: "${transcription}"`,
          bot_reply: addressResult.reply,
          status: 'SUCCESS',
          meta: { transcription, phone: parsed.phone, address: parsed.address }
        });
        return {
          success: true,
          reply: addressResult.reply,
          transcription,
          invoice: addressResult.invoice,
          type: 'ADDRESS_EXTRACTED'
        };
      }
    }

    // FAQ / Query / Order Tracking reply
    const faqReply = await processCustomerFaq(senderId, senderName, transcription);
    const finalReply = faqReply || parsed.reply_khmer || `🎙️ ចាសបង ${senderName}! ហាងបានទទួលសារជាសំឡេងរបស់បងហើយ។ ហាងកំពុងរៀបចំ និងឆ្លើយតបជូនបងឆាប់ៗនេះណា៎! 🙏`;

    addChatbotLog({
      type: 'VOICE_PROCESSED',
      customer_name: senderName,
      customer_id: senderId,
      incoming_message: `🎙️ [Voice]: "${transcription}"`,
      bot_reply: finalReply,
      status: 'SUCCESS',
      meta: { transcription, parsed }
    });

    return {
      success: true,
      reply: finalReply,
      transcription,
      type: 'VOICE_PROCESSED'
    };
  } catch (err: any) {
    console.error('[Process Voice Error]:', err);
    return { success: false, reply: '' };
  }
}

/**
 * -------------------------------------------------------------
 * 5. AI SMART FAQ 24/7 (#11)
 * -------------------------------------------------------------
 */
const customerNameCache = new Map<string, string>();

/**
 * Resolve Real Customer Facebook Name from local database or Graph API
 */
export async function resolveCustomerFacebookName(senderPsid: string): Promise<string> {
  if (!senderPsid || senderPsid === 'TEST_USER_1') return 'ភ្ញៀវ';
  if (customerNameCache.has(senderPsid)) {
    return customerNameCache.get(senderPsid)!;
  }

  // 1. Check local invoices database for matching PSID
  const localInv = invoices.find(
    i => i.facebook_user_id === senderPsid && i.facebook_name && !i.facebook_name.toLowerCase().includes('customer')
  );
  if (localInv && localInv.facebook_name) {
    customerNameCache.set(senderPsid, localInv.facebook_name);
    return localInv.facebook_name;
  }

  // 2. Fetch from Facebook Graph API (PSID Profile Endpoint)
  const token = (
    chatbotConfig.pageAccessToken ||
    activeFacebookPage?.access_token ||
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
    ''
  ).trim();

  if (token && !token.startsWith('simulated_')) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${senderPsid}?fields=first_name,last_name,name&access_token=${token}`);
      const data: any = await res.json();
      if (data?.name) {
        customerNameCache.set(senderPsid, data.name);
        return data.name;
      }
      if (data?.first_name || data?.last_name) {
        const full = `${data.first_name || ''} ${data.last_name || ''}`.trim();
        customerNameCache.set(senderPsid, full);
        return full;
      }
    } catch (err) {
      console.warn(`[Profile Resolver] Failed to fetch name for PSID ${senderPsid}:`, err);
    }
  }

  return 'ភ្ញៀវ';
}

/**
 * -------------------------------------------------------------
 * 5. AI SMART FAQ 24/7 (#11) & BASKET STATUS QUERY
 * -------------------------------------------------------------
 */
export async function processCustomerFaq(
  senderId: string,
  senderName: string,
  userMessage: string
): Promise<string> {
  if (!chatbotConfig.enabled || !chatbotConfig.enableAiFaq) {
    return '';
  }

  const displayName = senderName && !senderName.toLowerCase().includes('customer') ? senderName : 'ភ្ញៀវ';

  const activeInvoices = invoices.filter(i => i.status !== 'Cancelled');
  let customerInvoices = activeInvoices.filter(i => 
    (senderId && senderId !== 'TEST_USER_1' && (
      i.facebook_user_id === senderId ||
      senderId === `ID_${i.basket_no}` ||
      senderId === `ID_${i.invoice_id}`
    )) ||
    (displayName !== 'ភ្ញៀវ' && i.facebook_name && i.facebook_name.toLowerCase().trim() === displayName.toLowerCase().trim())
  );

  // Loose name matching if exact match not found
  if (customerInvoices.length === 0 && displayName !== 'ភ្ញៀវ') {
    const normDisplay = displayName.toLowerCase().replace(/\s+/g, '');
    customerInvoices = activeInvoices.filter(i => {
      if (!i.facebook_name) return false;
      const normName = i.facebook_name.toLowerCase().replace(/\s+/g, '');
      return normName === normDisplay || normName.includes(normDisplay) || normDisplay.includes(normName);
    });
  }

  // Also match by phone number if mentioned in user's message
  const phoneDigitsMatch = userMessage.match(/\b(0\d{1,2}[-.\s]?\d{3}[-.\s]?\d{3,4})\b/);
  if (phoneDigitsMatch) {
    const rawDigits = phoneDigitsMatch[1].replace(/[-.\s]/g, '');
    const phoneInv = activeInvoices.find(i => i.phone_number && i.phone_number.replace(/[-.\s]/g, '').includes(rawDigits));
    if (phoneInv && !customerInvoices.some(ci => ci.invoice_id === phoneInv.invoice_id)) {
      customerInvoices.unshift(phoneInv);
    }
  }

  // Sort customer baskets by newest created_at / highest invoice_id first
  customerInvoices.sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return (b.invoice_id || 0) - (a.invoice_id || 0);
  });

  const basketNumberMatch = userMessage.match(/(?:#|កន្ត្រក\s*|basket\s*|no\s+)(\d{2,6})\b/i);
  let targetInv: Invoice | undefined;
  if (basketNumberMatch && basketNumberMatch[1]) {
    const bNum = basketNumberMatch[1];
    targetInv = activeInvoices.find(i => String(i.basket_no) === bNum || String(i.invoice_id) === bNum);
  }
  
  // Fall back to customer's own active basket if targetInv wasn't set or not found
  if (!targetInv) {
    targetInv = customerInvoices[0];
  }

  // -------------------------------------------------------------
  // 🛡️ 1. OPTION A (HIGH SAFETY): PRODUCT CODE & PRICE INQUIRY FLOW
  // Answers price clearly, concisely (1-2 lines), and alerts admin safely
  // -------------------------------------------------------------
  let matchedCode = '';
  const codeRegexMatch = userMessage.match(/(?:កូដ|code|លេខកូដ)\s*[:#-]?\s*([a-zA-Z0-9_-]+)/i) ||
    userMessage.match(/(?:ថែម|សុំថែម|ចង់ថែម|ដាក់ថែម|កុម្ម៉ង់ថែម|យកថែម|ចង់បាន|យក)\s*[:#-]?\s*([a-zA-Z0-9_-]+)/i);

  if (codeRegexMatch && codeRegexMatch[1]) {
    matchedCode = codeRegexMatch[1].trim();
  } else {
    // Check if any standalone word matches an existing catalog product code (e.g. "149 នៅអត់?")
    const tokens = userMessage.match(/[a-zA-Z0-9_-]{1,8}/g) || [];
    for (const t of tokens) {
      if (products.some(p => p.code.toLowerCase() === t.toLowerCase())) {
        matchedCode = t;
        break;
      }
    }
  }

  if (matchedCode) {
    const rawCode = matchedCode;
    const product = products.find(p => p.code.toLowerCase().trim() === rawCode.toLowerCase());

    if (targetInv) {
      const bNum = targetInv.basket_no || targetInv.invoice_id;

      // Case A1: Product in stock -> ALWAYS tell price clearly & concisely
      if (product && (product.stock_qty === undefined || product.stock_qty > 0)) {
        if (!targetInv.unmatched_comments) targetInv.unmatched_comments = [];
        const reqTag = `[Messenger] ថែមកូដ ${product.code} ($${product.price.toFixed(2)})`;
        if (!targetInv.unmatched_comments.includes(reqTag)) {
          targetInv.unmatched_comments.push(reqTag);
          bumpDataRevision();
          saveDatabaseToDisk();
          broadcastSSE('live_data_update', { invoice_id: targetInv.invoice_id });
        }

        // Send Telegram alert to admin / group
        const tgAlert = `🔔 <b>ដំណឹងភ្ញៀវសួរ/សុំថែមកូដក្នុងកន្ត្រក!</b>\n` +
          `👤 ភ្ញៀវ ៖ <b>${displayName}</b>\n` +
          `📦 កន្ត្រក ៖ <b>#${bNum}</b>\n` +
          `🏷️ កូដ ៖ <b>${product.code}</b> (${product.name || 'ទំនិញ'})\n` +
          `💵 តម្លៃ ៖ <b>$${product.price.toFixed(2)}</b> (ស្តុក: ${product.stock_qty ?? 'មាន'})\n` +
          `💬 សារភ្ញៀវ ៖ <i>"${userMessage}"</i>`;
        sendTelegramAlert(tgAlert).catch(() => {});

        // 🎯 SHORT, CONCISE, TELLS PRICE DIRECTLY
        const reply = `ចាសបង! កូដ [${product.code}] នៅមានស្តុក តម្លៃ $${product.price.toFixed(2)} ណា៎បង។ អូនបានជូនដំណឹង Admin ជួយថែមចូលកន្ត្រក #${bNum} ជូនបងរួចរាល់ចាស៎ 🙏✨`;

        addChatbotLog({
          type: 'AI_FAQ',
          customer_name: displayName,
          customer_id: senderId,
          basket_no: bNum,
          incoming_message: userMessage,
          bot_reply: reply,
          status: 'SUCCESS'
        });

        return reply;
      } else if (product && product.stock_qty !== undefined && product.stock_qty <= 0) {
        // Case A2: Out of stock
        const reply = `ចាសបង! កូដ [${product.code}] តម្លៃ $${product.price.toFixed(2)} ប៉ុន្តែដាច់ស្តុកអស់ហើយបងណា៎ 🙏`;
        addChatbotLog({
          type: 'AI_FAQ',
          customer_name: displayName,
          customer_id: senderId,
          basket_no: bNum,
          incoming_message: userMessage,
          bot_reply: reply,
          status: 'SUCCESS'
        });
        return reply;
      } else {
        // Case A3: Product code not found in current products DB
        if (!targetInv.unmatched_comments) targetInv.unmatched_comments = [];
        const reqTag = `[Messenger] ថែមកូដ ${rawCode}`;
        if (!targetInv.unmatched_comments.includes(reqTag)) {
          targetInv.unmatched_comments.push(reqTag);
          bumpDataRevision();
          saveDatabaseToDisk();
          broadcastSSE('live_data_update', { invoice_id: targetInv.invoice_id });
        }

        const tgAlert = `🔔 <b>ដំណឹងភ្ញៀវសួរកូដ [${rawCode}]!</b>\n` +
          `👤 ភ្ញៀវ ៖ <b>${displayName}</b> (កន្ត្រក #${bNum})\n` +
          `💬 សារភ្ញៀវ ៖ <i>"${userMessage}"</i>`;
        sendTelegramAlert(tgAlert).catch(() => {});

        const reply = `ចាសបង! កូដ [${rawCode}] រកមិនឃើញក្នុងប្រព័ន្ធទេ ចាំអូនជួយសួរ Admin បន្ថែមជូនកន្ត្រក #${bNum} ណា៎បង 🙏✨`;
        addChatbotLog({
          type: 'AI_FAQ',
          customer_name: displayName,
          customer_id: senderId,
          basket_no: bNum,
          incoming_message: userMessage,
          bot_reply: reply,
          status: 'SUCCESS'
        });
        return reply;
      }
    } else {
      // If customer doesn't have an identified basket yet
      if (product && (product.stock_qty === undefined || product.stock_qty > 0)) {
        const reply = `ចាសបង! កូដ [${product.code}] នៅមានស្តុក តម្លៃ $${product.price.toFixed(2)} ចាស៎ (បងអាចប្រាប់លេខកន្ត្រក ឬលេខទូរស័ព្ទដើម្បីកុម្ម៉ង់បានណា៎) 🙏✨`;
        addChatbotLog({
          type: 'AI_FAQ',
          customer_name: displayName,
          customer_id: senderId,
          incoming_message: userMessage,
          bot_reply: reply,
          status: 'SUCCESS'
        });
        return reply;
      } else if (product && product.stock_qty !== undefined && product.stock_qty <= 0) {
        const reply = `ចាសបង! កូដ [${product.code}] តម្លៃ $${product.price.toFixed(2)} ប៉ុន្តែដាច់ស្តុកអស់ហើយបងណា៎ 🙏`;
        addChatbotLog({
          type: 'AI_FAQ',
          customer_name: displayName,
          customer_id: senderId,
          incoming_message: userMessage,
          bot_reply: reply,
          status: 'SUCCESS'
        });
        return reply;
      } else {
        const reply = `ចាសបង! កូដ [${rawCode}] រកមិនឃើញក្នុងប្រព័ន្ធឡើយបងណា៎ 🙏`;
        addChatbotLog({
          type: 'AI_FAQ',
          customer_name: displayName,
          customer_id: senderId,
          incoming_message: userMessage,
          bot_reply: reply,
          status: 'SUCCESS'
        });
        return reply;
      }
    }
  }

  // 2. Check if user is asking about their basket or mentioning basket number (e.g. #860, 860, អីវ៉ាន់ខ្ញុំបានអីខ្លះ, អាវ៉ាន់ខ្ញុំចេញនៅ, អស់ប៉ុន្មាន, សុំមើលបុង)
  const isAskingBasket = /(អីវ៉ាន់|អាវ៉ាន់|កន្ត្រក|កុម្ម៉ង់|ទិញបាន|order|basket|ទំនិញ|បានអីខ្លះ|បានអី|បានអ្វីខ្លះ|បានអ្វី|អស់ប៉ុន្មាន|សរុបប៉ុន្មាន|តម្លៃប៉ុន្មាន|ថ្លៃប៉ុន្មាន|ប៉ុន្មានលុយ|ចេញមកនៅ|ចេញនៅ|ផ្ញើនៅ|ដឹកនៅ|ដល់នៅ|បុង|បុងឡាន|រូបបុង|មើលបុង|សុំមើលបុង|tracking|ឡាន|សុំឆែក|ឆែកមើល)/i.test(userMessage) || Boolean(basketNumberMatch);

  if (isAskingBasket && targetInv) {
    const itemsList = targetInv.items.length > 0
      ? targetInv.items.map(it => `• [${it.product_code}] x ${it.quantity} ($${(it.price * it.quantity).toFixed(2)})`).join('\n')
      : '• មិនទាន់មានមុខទំនិញ';

    let stageLabel = '⏳ កំពុងរង់ចាំការទូទាត់ប្រាក់ (STAGED)';
    if (targetInv.status === 'Paid') {
      stageLabel = '🔍 បានបង់ប្រាក់រួចរាល់ (កំពុងរៀបចំវេចខ្ចប់ & QC)';
    } else if (targetInv.status === 'Dispatched' || targetInv.packing_stage === 'DISPATCHED') {
      stageLabel = `🚚 បានចេញដឹកជញ្ជូនរួចរាល់ [${targetInv.delivery_carrier || 'វីរៈប៊ុនថាំ (VET Express)'}]`;
    }

    const shipFee = targetInv.is_free_ship ? 'Free' : `$${(targetInv.shipping_fee ?? (targetInv.location_zone === 'PROVINCE' ? 1.5 : 1.0)).toFixed(2)}`;
    
    let reply = `📦 ព័ត៌មានកន្ត្រកចុងក្រោយលេខ #${targetInv.basket_no || targetInv.invoice_id} របស់បង ${targetInv.facebook_name} ៖\n\n${itemsList}\n\n🚚 សេវាដឹក ៖ ${shipFee} (${targetInv.location_zone === 'PROVINCE' ? 'តាមខេត្ត' : 'ភ្នំពេញ'})\n💵 សរុបទឹកប្រាក់ ៖ $${targetInv.total_amount.toFixed(2)}\n📍 ស្ថានភាព ៖ ${stageLabel}`;

    if (targetInv.status === 'Dispatched' || targetInv.packing_stage === 'DISPATCHED') {
      if (targetInv.tracking_code) {
        reply += `\n🔖 លេខកូដតាមដាន (Tracking) ៖ ${targetInv.tracking_code}`;
      }
      if (targetInv.waybill_image_url) {
        reply += `\n📸 បុងឡាន ៖ មានរូបភាពបុងកញ្ចប់អីវ៉ាន់ក្នុងប្រព័ន្ធរួចរាល់`;
      }
    }

    // If customer specifically asks for waybill photo
    const isAskingWaybill = /(បុង|បុងឡាន|រូបបុង|មើលបុង|សុំមើលបុង|សុំរូបបុង)/i.test(userMessage);
    if (isAskingWaybill && (targetInv.status === 'Dispatched' || targetInv.packing_stage === 'DISPATCHED')) {
      reply = `🚚 ដំណឹងបុងឡានកញ្ចប់អីវ៉ាន់លេខ #${targetInv.basket_no || targetInv.invoice_id} របស់បង ${targetInv.facebook_name} ៖\n\n🏢 ក្រុមហ៊ុនដឹក ៖ ${targetInv.delivery_carrier || 'វីរៈប៊ុនថាំ (VET Express)'}\n🔖 លេខកូដតាមដាន ៖ ${targetInv.tracking_code || 'VET Express'}\n📍 ទិសដៅ ៖ ${targetInv.address || 'តាមខេត្ត'}\n\nអ្នកដឹកនឹងទូរស័ព្ទទៅបងពេលអីវ៉ាន់ទៅដល់ណា៎បង 🙏✨`;
    }

    // If customer has other active baskets, mention them politely
    const otherBaskets = customerInvoices
      .filter(i => i.invoice_id !== targetInv!.invoice_id)
      .map(i => `#${i.basket_no || i.invoice_id}`);
    if (otherBaskets.length > 0) {
      reply += `\n\n💡 (បងមានកន្ត្រកផ្សេងទៀត ៖ ${otherBaskets.join(', ')} អាចវាយលេខដើម្បីឆែកមើលបាន)`;
    }

    if (targetInv.status !== 'Paid' && targetInv.packing_stage !== 'DISPATCHED') {
      reply += `\n\n👉 បងអាចផ្ញើវិក្កយបត្រ (Slip) បង់ប្រាក់ចូលទីនេះ ដើម្បីហាងរៀបចំច្រក និងចេញដឹកជូនបងឆាប់ៗនេះ! សូមអរគុណច្រើនបង! 🙏`;
    } else if (targetInv.packing_stage !== 'DISPATCHED') {
      reply += `\n\nអរគុណច្រើនបងសម្រាប់ការគាំទ្រហាងយើងខ្ញុំ! 🙏✨`;
    }

    addChatbotLog({
      type: 'AI_FAQ',
      customer_name: targetInv.facebook_name,
      customer_id: senderId,
      basket_no: targetInv.basket_no || targetInv.invoice_id,
      incoming_message: userMessage,
      bot_reply: reply,
      status: 'SUCCESS'
    });

    return reply;
  }

  // If customer explicitly typed a basket number like #860 and it was not found:
  if ((userMessage.includes('#') || /(?:កន្ត្រក|basket)/i.test(userMessage)) && !targetInv) {
    const bNum = basketNumberMatch ? basketNumberMatch[1] : '';
    const notFoundReply = `ចាសជម្រាបសួរបង ${displayName}! ហាងបានឆែកមើលក្នុងប្រព័ន្ធហើយ មិនទាន់ឃើញមានកន្ត្រកលេខ #${bNum || userMessage.trim()} ឡើយបងណា៎។ សូមបងជួយផ្ញើឈ្មោះហ្វេសប៊ុក ឬលេខទូរស័ព្ទដើម្បីឱ្យប្អូនជួយស្វែងរកជូនបន្ថែមណា៎បង 🙏✨`;
    addChatbotLog({
      type: 'AI_FAQ',
      customer_name: displayName,
      customer_id: senderId,
      incoming_message: userMessage,
      bot_reply: notFoundReply,
      status: 'SUCCESS'
    });
    return notFoundReply;
  }

  const ai = getGenAI();
  if (!ai) {
    return '';
  }

  try {
    const customerGreeting = displayName !== 'ភ្ញៀវ' ? `បង ${displayName}` : 'បង';

    // Build context regarding the customer's existing basket so Gemini acts intelligently!
    let basketContext = '';
    if (targetInv) {
      const itemsList = targetInv.items.length > 0
        ? targetInv.items.map(it => `[${it.product_code}] x ${it.quantity}`).join(', ')
        : 'មានទំនិញក្នុងកន្ត្រក';
      const bNum = targetInv.basket_no || targetInv.invoice_id;
      const statusKh = targetInv.status === 'Paid' ? 'បានបង់ប្រាក់រួច (កំពុងរៀបចំវេចខ្ចប់)' : targetInv.status === 'Dispatched' ? 'បានចេញដឹកជញ្ជូនរួចរាល់' : 'មិនទាន់បង់ប្រាក់ (រង់ចាំការទូទាត់)';

      basketContext = `
📌 ព័ត៌មានកន្ត្រកបច្ចុប្បន្នរបស់ភ្ញៀវ (${customerGreeting}) ៖
- អតិថិជននេះបានកុម្ម៉ង់ទំនិញរួចរាល់ហើយ គឺមានកន្ត្រកលេខ #${bNum}
- មុខទំនិញក្នុងកន្ត្រក ៖ ${itemsList}
- ទឹកប្រាក់សរុប ៖ $${targetInv.total_amount.toFixed(2)}
- ស្ថានភាពបច្ចុប្បន្ន ៖ ${statusKh}
- ទីតាំងបច្ចុប្បន្ន ៖ ${targetInv.address || 'មិនទាន់មានទីតាំង'}
- លេខទូរស័ព្ទ ៖ ${targetInv.phone_number || 'មិនទាន់មាន'}

🚨 ច្បាប់សំខាន់បំផុតសម្រាប់អតិថិជននេះ (STRICT ORDER RULES) ៖
1. ហាមដាច់ខាតកុំសួរថា "តើបងចាប់អារម្មណ៍មុខទំនិញណាដែរ?" ឬ "តើបងចង់ទិញអ្វីដែរ?" ជាដាច់ខាត! ព្រោះគាត់បានកុម្ម៉ង់ទំនិញក្នុងកន្ត្រកលេខ #${bNum} រួចរាល់ហើយ។
2. បើភ្ញៀវសួរពីសេវាដឹក ឬទីតាំង (ដូចជា ព្រៃវែង សៀមរាប កំពង់ចាម ឬកន្លែងណាផ្សេង) ៖ ត្រូវប្រាប់តម្លៃសេវាដឹក (តាមខេត្ត $${chatbotConfig.shippingRateProvince.toFixed(2)} ឬភ្នំពេញ $${chatbotConfig.shippingRatePP.toFixed(2)}) ហើយសួរបញ្ជាក់ដោយផ្អែមល្ហែមថា "តើបងចង់ឱ្យអូនកត់ត្រាទីតាំងនេះចូលក្នុងកន្ត្រកលេខ #${bNum} របស់បងដែរឬទេចា៎ស់?" ឬប្រាប់ឱ្យគាត់ផ្ញើទីតាំង និងលេខទូរស័ព្ទលម្អិត។
3. បើកន្ត្រកមិនទាន់បង់ប្រាក់ ៖ អាចប្រាប់គាត់យ៉ាងផ្អែមល្ហែមថា គាត់អាចផ្ញើវិក្កយបត្រ (Slip) វេលុយចូលទីនេះបាន ដើម្បីឱ្យខាងហាងរៀបចំកញ្ចប់ #${bNum} ចេញដឹកជូន។
4. បើភ្ញៀវសួរពីការដកទំនិញ ឬកែប្រែកន្ត្រក ៖ ចូរឆ្លើយតបយ៉ាងរួសរាយថានឹងជួយកែប្រែ ឬជម្រាបជូនតាមគោលការណ៍ហាង។
5. ចម្លើយត្រូវខ្លីខ្លឹមត្រឹម ១ ទៅ ២ ជួរ ផ្អែមល្ហែម គួរឱ្យស្រឡាញ់ និងចំសំណួរ។`;
    } else {
      basketContext = `
📌 ស្ថានភាពភ្ញៀវ ៖ ភ្ញៀវមិនទាន់រកឃើញកន្ត្រកជាក់លាក់ (ឬអាចជាភ្ញៀវថ្មី)។
🚨 ច្បាប់សំខាន់ដាច់ខាត ៖
1. ហាមដាច់ខាតកុំសួរថា "តើបងចាប់អារម្មណ៍មុខទំនិញណាដែរ?" ឬ "តើបងស្រឡាញ់ទំនិញមួយណាដែរ?" ឬ "តើបងចង់ទិញអ្វីដែរ?" ជាដាច់ខាត!
2. ប្រសិនបើភ្ញៀវសួរពីកញ្ចប់អីវ៉ាន់ ស្ថានភាព ឬតម្លៃ ត្រូវសួររក "លេខកន្ត្រក (#...)" ឬ "លេខទូរស័ព្ទ" ដើម្បីឱ្យប្អូនជួយឆែកមើលក្នុងប្រព័ន្ធជូនភ្លាមៗ។
3. ឆ្លើយតបខ្លីៗត្រឹម ១ ទៅ ២ ជួរ ផ្អែមល្ហែម និងចំសំណួរ។`;
    }

    const prompt = `អ្នកជាបុគ្គលិកឆ្លើយឆាតបម្រើអតិថិជនរបស់ហាង "${chatbotConfig.shopName}" សម្រាប់ Live Stream និងការវេចខ្ចប់កញ្ចប់ទំនិញ។
ចូរឆ្លើយតបសំណួររបស់អតិថិជនជាភាសាខ្មែរ ដោយផ្អែមល្ហែម ខ្លីៗត្រឹមតែ ១ ជួរ (យ៉ាងច្រើន ២ ជួរខ្លី) ចំសំណួរដែលគេសួរ ហាមវែងអន្លាយដាច់ខាត។

⚠️ បម្រាមពិសេស (STRICT RULES) ៖
1. ឆ្លើយខ្លីៗ ចំសំណួរ គ្មានពាក្យបន្ថែមវែងឆ្ងាយ។
2. ហាមសួរនាំបែបផ្សព្វផ្សាយលក់ទំនិញដូចជា "តើបងចាប់អារម្មណ៍មុខទំនិញណាដែរ?" ឬ "តើថ្ងៃនេះបងចាប់អារម្មណ៍ទំនិញមួយណាដែរ?" ជាដាច់ខាត!
3. ប្រសិនបើមានព័ត៌មានកន្ត្រកខាងក្រោម ត្រូវផ្ដោតលើការបញ្ជាក់កន្ត្រក #${targetInv ? (targetInv.basket_no || targetInv.invoice_id) : ''} នោះប៉ុណ្ណោះ។

ព័ត៌មានជាក់ស្តែងរបស់ហាង ៖
- ទីតាំងហាង ៖ ${chatbotConfig.shopLocation}
- ម៉ោងបើកទទួលភ្ញៀវ ៖ ${chatbotConfig.workingHours}
- សេវាដឹកភ្នំពេញ ៖ $${chatbotConfig.shippingRatePP.toFixed(2)} (${chatbotConfig.deliveryTimePP})
- សេវាដឹកតាមខេត្ត ៖ $${chatbotConfig.shippingRateProvince.toFixed(2)} (${chatbotConfig.deliveryTimeProvince})
- គោលការណ៍ប្តូរទំនិញ ៖ ${chatbotConfig.exchangePolicy}
${chatbotConfig.customFaqPrompt ? `- ចំណាំបន្ថែម ៖ ${chatbotConfig.customFaqPrompt}` : ''}
${basketContext}

សំណួរភ្ញៀវ (${customerGreeting}) ៖ "${userMessage}"

ចូរឆ្លើយតបជាភាសាខ្មែរផ្អែមល្ហែម ខ្លីចំចំណួរ (១-២ ជួរ) ៖`;

    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let faqText = '';

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt
        });
        if (response.text) {
          faqText = response.text.trim();
          break;
        }
      } catch {
        // try next model
      }
    }

    // Smart Knowledge Fallback if AI quota is exhausted
    if (!faqText) {
      const lower = userMessage.toLowerCase();
      if (/ទីតាំង|នៅឯណា|កន្លែងណា|location|ហាងនៅ|ម្តុំណា/i.test(lower)) {
        faqText = `ចាស${customerGreeting}! ហាងអូនមានទីតាំងនៅ ៖ ${chatbotConfig.shopLocation} បងណា៎ 🙏`;
      } else if (/ម៉ោង|បើក|បិទ|working hours|time/i.test(lower)) {
        faqText = `ចាស${customerGreeting}! ហាងបើកទទួលភ្ញៀវជារៀងរាល់ថ្ងៃ ម៉ោង ${chatbotConfig.workingHours} ណា៎បង 🙏`;
      } else if (/ថ្លៃដឹក|សេវាដឹក|ដឹកភ្នំពេញ|ដឹកខេត្ត|delivery|shipping|សេវាប៉ុន្មាន/i.test(lower)) {
        if (targetInv) {
          const bNum = targetInv.basket_no || targetInv.invoice_id;
          const isProv = /ខេត្ត|ព្រៃវែង|សៀមរាប|កំពង់|បាត់ដំបង|បឹង|ស្ទឹង|កណ្តាល|តាកែវ|កំពត|កែប|កោះកុង|ពោធិ៍សាត់|ក្រចេះ|ស្ទឹងត្រែង|រតនគិរី|មណ្ឌលគិរី|ព្រះវិហារ|ឧត្តរមានជ័យ|ប៉ៃលិន|បន្ទាយមានជ័យ|ស្វាយរៀង/i.test(lower);
          const zoneInfo = isProv
            ? `សម្រាប់ទីតាំងតាមខេត្ត សេវាដឹកត្រឹមតែ $${chatbotConfig.shippingRateProvince.toFixed(2)} (${chatbotConfig.deliveryTimeProvince})`
            : `សេវាដឹកភ្នំពេញ $${chatbotConfig.shippingRatePP.toFixed(2)} (${chatbotConfig.deliveryTimePP}) និងតាមខេត្ត $${chatbotConfig.shippingRateProvince.toFixed(2)} (${chatbotConfig.deliveryTimeProvince})`;
          faqText = `ចាស${customerGreeting}! ${zoneInfo} ប៉ុណ្ណោះចា៎ស់។ តើបងចង់ឱ្យអូនកត់ត្រាទីតាំងនេះចូលក្នុងកន្ត្រកលេខ #${bNum} របស់បងដែរទេចា៎ស់? (បងអាចផ្ញើលេខទូរស័ព្ទ និងទីតាំងលម្អិតបានណា៎បង) 🙏✨`;
        } else {
          faqText = `ចាស${customerGreeting}! សេវាដឹកភ្នំពេញ $${chatbotConfig.shippingRatePP.toFixed(2)} (${chatbotConfig.deliveryTimePP}) និងតាមខេត្ត $${chatbotConfig.shippingRateProvince.toFixed(2)} (${chatbotConfig.deliveryTimeProvince}) បងណា៎! 🚚`;
        }
      } else if (/ប្តូរ|ដូរ|ខូច|exchange|return/i.test(lower)) {
        faqText = `ចាស${customerGreeting}! គោលការណ៍ប្តូរទំនិញ ៖ ${chatbotConfig.exchangePolicy} ណា៎បង 🙏`;
      }
    }

    // 🛡️ GUARANTEED SANITIZER: Eliminate any accidental promotional sales phrasing
    if (faqText) {
      const salesPattern = /(?:តើ\s*)?(?:ថ្ងៃនេះ\s*)?បង(?:ចាប់អារម្មណ៍|ស្រឡាញ់|ចង់បាន|ចង់ទិញ)(?:មុខ)?(?:ទំនិញ|អីវ៉ាន់|ឥវ៉ាន់)(?:ណា|មួយណា)(?:ដែរ)?(?:ចា៎ស់|ចាស|ទេ)?(?:\?|។|\s)*(?:អូនជួយប្រាប់ព័ត៌មានជូន\??)?/gi;
      if (salesPattern.test(faqText)) {
        if (targetInv) {
          const bNum = targetInv.basket_no || targetInv.invoice_id;
          faqText = faqText.replace(salesPattern, `តើបងចង់ឱ្យអូនកត់ត្រាទីតាំងនេះចូលក្នុងកន្ត្រកលេខ #${bNum} របស់បងដែរទេចា៎ស់?`).trim();
        } else {
          faqText = faqText.replace(salesPattern, 'តើបងមានលេខកន្ត្រក ឬលេខទូរស័ព្ទដែរទេ ដើម្បីឱ្យអូនជួយឆែកមើលក្នុងប្រព័ន្ធជូនណា៎បង?').trim();
        }
      }
    }

    const reply = faqText || `សួស្តី${customerGreeting}! ហាងបានទទួលសាររបស់បងហើយ បុគ្គលិកនឹងឆ្លើយតបជូនបងឆាប់ៗនេះណា៎។ 🙏`;

    addChatbotLog({
      type: 'AI_FAQ',
      customer_name: displayName,
      customer_id: senderId,
      incoming_message: userMessage,
      bot_reply: reply,
      status: 'SUCCESS'
    });

    return reply;
  } catch (err) {
    console.error('AI FAQ Error:', err);
    return `សួស្តីបង${displayName !== 'ភ្ញៀវ' ? ` ${displayName}` : ''}! ហាងបានទទួលសាររបស់បងហើយ បុគ្គលិកនឹងឆ្លើយតបជូនបងឆាប់ៗនេះ។`;
  }
}

/**
 * -------------------------------------------------------------
 * 6. FACEBOOK GRAPH SEND API (Reply directly into Messenger)
 * -------------------------------------------------------------
 */
export async function sendFacebookMessengerReply(
  recipientPsid: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  const token = (
    chatbotConfig.pageAccessToken ||
    activeFacebookPage?.access_token ||
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
    ''
  ).trim();

  if (!token || token.startsWith('simulated_')) {
    console.warn(`[Messenger Bot] Missing valid Page Access Token for PSID ${recipientPsid}`);
    return { success: false, error: 'Missing Page Access Token' };
  }

  try {
    const pageId = activeFacebookPage?.id || 'me';
    const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        message: { text },
        messaging_type: 'RESPONSE'
      })
    });

    const data: any = await res.json();
    if (data?.message_id) {
      console.log(`✅ [Messenger Bot] Sent message to ${recipientPsid}: ${text.slice(0, 40)}...`);
      return { success: true };
    } else {
      console.error(`❌ [Messenger Bot] Facebook API error sending to ${recipientPsid}:`, data?.error?.message || data);
      return { success: false, error: data?.error?.message };
    }
  } catch (err: any) {
    console.error(`❌ [Messenger Bot] Network error sending to ${recipientPsid}:`, err);
    return { success: false, error: err.message };
  }
}
