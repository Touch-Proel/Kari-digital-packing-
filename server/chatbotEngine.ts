import { GoogleGenAI } from '@google/genai';
import { invoices, saveDatabaseToDisk, bumpDataRevision, activeFacebookPage } from './db';
import { Invoice } from './types';
import fs from 'fs';
import path from 'path';

export interface ChatbotConfig {
  enabled: boolean;
  enableSlipAutoVerify: boolean;
  enableAddressAutoExtract: boolean;
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
  type: 'SLIP_VERIFIED' | 'ADDRESS_EXTRACTED' | 'PAYMENT_REMINDER' | 'SHIPPING_NOTIFIED' | 'AI_FAQ';
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

import { getGemini, callGeminiSlipExtraction, matchInvoiceForSlip } from './fastCheckRoutes';

// Get GoogleGenAI Instance with Key hierarchy
function getGenAI(): GoogleGenAI | null {
  return getGemini();
}

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
  if (!chatbotConfig.enableSlipAutoVerify) {
    return {
      success: false,
      reply: `អរគុណបង ${senderName}! ហាងបានទទួលរូបភាពវិក្កយបត្រហើយ បុគ្គលិកនឹងពិនិត្យផ្ទៀងផ្ទាត់ជូនបងឆាប់ៗនេះ។`
    };
  }

  const ai = getGenAI();
  if (!ai) {
    return {
      success: false,
      reply: `អរគុណបង ${senderName}! ហាងបានទទួលវិក្កយបត្រហើយ បុគ្គលិកនឹងពិនិត្យផ្ទៀងផ្ទាត់ជូនបង។`
    };
  }

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    
    // OCR & Extract using Gemini Flash with multi-model fallback
    const promptText = `You are an expert OCR parser for Cambodian bank transfer slips (ABA, ACLEDA, Canadia, TrueMoney, Wing, Bakong/KHQR, etc.).
Extract the following information in strict JSON:
{
  "customer_name": "payer or sender name on the slip or recipient note",
  "paid_amount": 0.00,
  "currency": "USD" or "KHR",
  "bank_name": "ABA" or "ACLEDA" or "Canadia" or "Wing" or other,
  "trans_ref": "transaction reference or ID",
  "trans_date": "date/time"
}
Return ONLY pure JSON. No markdown ticks, no commentary.`;

    const ocrRes = await callGeminiSlipExtraction(
      ai,
      { inlineData: { mimeType, data: cleanBase64 } },
      { text: promptText }
    );

    const rawText = ocrRes.text || '';
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const extracted = JSON.parse(cleaned);

    const paidAmount = Number(extracted.paid_amount) || 0;
    const bankName = extracted.bank_name || 'ធនាគារ';
    const transRef = extracted.trans_ref || '';

    // Locate active invoice for customer
    const activeInvoices = invoices.filter(
      i => i.status !== 'Cancelled' && i.status !== 'Dispatched' && i.packing_stage !== 'DISPATCHED'
    );

    let matchedInv: Invoice | undefined;

    // 1. Direct match by sender ID
    if (senderId && senderId !== 'TEST_USER_1') {
      matchedInv = activeInvoices.find(i => i.facebook_user_id === senderId);
    }

    // 2. Direct match by sender name
    if (!matchedInv && senderName && senderName !== 'Dany Ka' && senderName !== 'អតិថិជនសាកល្បង') {
      matchedInv = activeInvoices.find(
        i => i.facebook_name && i.facebook_name.toLowerCase().trim() === senderName.toLowerCase().trim()
      );
    }

    // 3. Fallback: Search all active invoices using Fast-Check match engine
    if (!matchedInv) {
      const matchResult = matchInvoiceForSlip({
        customer_name: extracted.customer_name || senderName,
        paid_amount: paidAmount,
        currency: extracted.currency || 'USD',
        bank_name: bankName,
        trans_ref: transRef
      });

      if (matchResult.matched) {
        matchedInv = matchResult.matched;
      } else if (matchResult.candidates && matchResult.candidates.length > 0) {
        matchedInv = matchResult.candidates[0];
      }
    }

    // 4. If still not matched, check if any unpaid invoice matches the exact amount or fuzzy name
    if (!matchedInv) {
      matchedInv = activeInvoices.find(i => {
        if (paidAmount > 0 && Math.abs(i.total_amount - paidAmount) < 0.25) return true;
        if (extracted.customer_name && i.facebook_name && i.facebook_name.toLowerCase().includes(extracted.customer_name.toLowerCase())) return true;
        return false;
      });
    }

    if (!matchedInv) {
      const reply = `🧾 ហាងបានស្កេនឃើញវិក្កយបត្រ ៖\n👤 ឈ្មោះ ៖ ${extracted.customer_name || senderName}\n💵 ចំនួន ៖ $${paidAmount.toFixed(2)} (${bankName})\n🔖 Ref ៖ ${transRef || 'N/A'}\n\n⚠️ ប្រព័ន្ធមិនទាន់រកឃើញកន្ត្រកដែលកំពុងរង់ចាំបង់ប្រាក់ត្រូវគ្នានឹងព័ត៌មាននេះទេ។ បុគ្គលិកនឹងទាក់ទងផ្ទៀងផ្ទាត់ជូនបងបន្ថែម!`;
      addChatbotLog({
        type: 'SLIP_VERIFIED',
        customer_name: extracted.customer_name || senderName,
        customer_id: senderId,
        incoming_message: `[រូបភាព Slip $${paidAmount.toFixed(2)}]`,
        bot_reply: reply,
        status: 'WARNING',
        meta: extracted
      });
      return { success: false, reply };
    }

    // Auto-mark invoice as Paid in KARI OS
    matchedInv.status = 'Paid';
    (matchedInv as any).payment_status = 'Paid';
    matchedInv.paid_by = 'KARI AI Bot (Chat)';
    matchedInv.paid_at = new Date().toISOString();
    matchedInv.payment_method = bankName;
    if (matchedInv.packing_stage === 'UNPICKED') {
      matchedInv.packing_stage = 'STAGED';
      matchedInv.staged_by = 'KARI AI Bot';
      matchedInv.staged_at = new Date().toISOString();
    }

    bumpDataRevision();
    saveDatabaseToDisk();

    const reply = `✅ ហាងបានទទួលការទូទាត់ប្រាក់ចំនួន $${paidAmount.toFixed(2)} (${bankName} ‧ Ref: ${transRef || 'N/A'}) ត្រឹមត្រូវ ១០០% ហើយបង ${matchedInv.facebook_name}! 🎉\n\n📦 កន្ត្រកលេខ #${matchedInv.basket_no || matchedInv.invoice_id} របស់បងត្រូវបានសម្គាល់ [បង់រួច] និងបញ្ជូនទៅកាន់បញ្ជីវេចខ្ចប់រួចរាល់។ អរគុណច្រើនបង! 🙏`;

    addChatbotLog({
      type: 'SLIP_VERIFIED',
      customer_name: matchedInv.facebook_name,
      customer_id: senderId,
      basket_no: matchedInv.basket_no || matchedInv.invoice_id,
      incoming_message: `[រូបភាព Slip $${paidAmount.toFixed(2)}]`,
      bot_reply: reply,
      status: 'SUCCESS',
      meta: { paidAmount, bankName, transRef, invoice_id: matchedInv.invoice_id }
    });

    return { success: true, reply, invoice: matchedInv };
  } catch (err: any) {
    console.error('Slip auto-verification error:', err);
    const reply = `អរគុណបង ${senderName}! ហាងបានទទួលរូបភាពវិក្កយបត្រហើយ បុគ្គលិកនឹងពិនិត្យផ្ទៀងផ្ទាត់ជូនបងភ្លាមៗ។`;
    return { success: false, reply };
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
  if (!chatbotConfig.enableAddressAutoExtract) return { isAddressOrPhone: false };

  // Quick heuristic: does it contain phone numbers or typical address keywords?
  const hasPhone = /(?:0\d{8,9}|\+855\d{8,9})/.test(text.replace(/[\s-]/g, ''));
  const hasAddressWord = /(ភ្នំពេញ|ខេត្ត|ស្រុក|ខណ្ឌ|សង្កាត់|ភូមិ|ផ្ទះ|ម្តុំ|ជិត|ផ្លូវ|ស្តុប|pp|phnom penh|province|street|st|khan|sangkat)/i.test(text);

  if (!hasPhone && !hasAddressWord) {
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

      const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
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
      // Fallback regex extraction
      const phoneMatch = text.match(/(?:0\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}|0\d{8,9})/);
      extracted.phone_number = phoneMatch ? phoneMatch[0].replace(/[\s.-]/g, '') : '';
      extracted.full_address = text.trim();
      extracted.location_zone = /ភ្នំពេញ|pp|phnom penh/i.test(text) ? 'PHNOM_PENH' : 'PROVINCE';
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

    const zoneText = matchedInv.location_zone === 'PP' ? 'រាជធានីភ្នំពេញ' : 'តាមបណ្តាខេត្ត';
    const feeText = `$${(matchedInv.shipping_fee ?? 1.0).toFixed(2)}`;
    const reply = `📍 ហាងបានកត់ត្រាព័ត៌មានដឹកជញ្ជូនរបស់បង ${senderName} ក្នុងកន្ត្រក #${matchedInv.basket_no || matchedInv.invoice_id} រួចរាល់ ៖\n\n📞 លេខទូរស័ព្ទ ៖ ${matchedInv.phone_number || 'មិនទាន់មាន'}\n🏠 ទីតាំង ៖ ${matchedInv.address}\n🚚 តំបន់ ៖ ${zoneText} (សេវាដឹក ${feeText})\n💵 សរុបរួម ៖ $${matchedInv.total_amount.toFixed(2)}\n\nអរគុណច្រើនបង! 🙏`;

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
 * 5. AI SMART FAQ 24/7 (#11)
 * -------------------------------------------------------------
 */
export async function processCustomerFaq(
  senderId: string,
  senderName: string,
  userMessage: string
): Promise<string> {
  if (!chatbotConfig.enableAiFaq) {
    return `សួស្តីបង ${senderName}! ហាងបានទទួលសាររបស់បងហើយ បុគ្គលិកនឹងឆ្លើយតបជូនបងឆាប់ៗនេះ។`;
  }

  const ai = getGenAI();
  if (!ai) {
    return `សួស្តីបង ${senderName}! ហាងបានទទួលសាររបស់បងហើយ បុគ្គលិកនឹងឆ្លើយតបជូនបងឆាប់ៗនេះ។`;
  }

  try {
    const systemInstruction = `You are a polite, helpful, and friendly Khmer AI Customer Service Assistant for "${chatbotConfig.shopName}".
Here is the official shop knowledge base:
- Shop Location: ${chatbotConfig.shopLocation}
- Working Hours: ${chatbotConfig.workingHours}
- Delivery Time: Phnom Penh (${chatbotConfig.deliveryTimePP}), Provinces (${chatbotConfig.deliveryTimeProvince})
- Shipping Rates: Phnom Penh ($${chatbotConfig.shippingRatePP.toFixed(2)}), Provinces ($${chatbotConfig.shippingRateProvince.toFixed(2)})
- Exchange Policy: ${chatbotConfig.exchangePolicy}
- Additional Guidelines: ${chatbotConfig.customFaqPrompt}

Rules:
1. Always respond in natural, polite, respectful Khmer.
2. Address the customer as "បង ${senderName}".
3. Keep answers clear, accurate to the knowledge base, and concise.
4. If asked about their basket or order, kindly invite them to provide their phone number or basket number.`;

    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    let faqText = '';

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            { role: 'user', parts: [{ text: userMessage }] }
          ],
          config: {
            systemInstruction
          }
        });
        if (response.text) {
          faqText = response.text;
          break;
        }
      } catch {
        // try next model
      }
    }

    const reply = faqText || `សួស្តីបង ${senderName}! ហាងបានទទួលសាររបស់បងហើយ បុគ្គលិកនឹងឆ្លើយតបជូនបងឆាប់ៗនេះ។`;

    addChatbotLog({
      type: 'AI_FAQ',
      customer_name: senderName,
      customer_id: senderId,
      incoming_message: userMessage,
      bot_reply: reply,
      status: 'SUCCESS'
    });

    return reply;
  } catch (err) {
    console.error('AI FAQ Error:', err);
    return `សួស្តីបង ${senderName}! ហាងបានទទួលសាររបស់បងហើយ បុគ្គលិកនឹងឆ្លើយតបជូនបងឆាប់ៗនេះ។`;
  }
}
