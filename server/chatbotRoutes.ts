import { Router, Request, Response } from 'express';
import {
  getChatbotConfig,
  saveChatbotConfigToDisk,
  getChatbotLogs,
  processIncomingSlipImage,
  processIncomingAddressText,
  processIncomingVoiceAudio,
  generatePaymentReminders,
  generateShippingNotification,
  processCustomerFaq,
  sendFacebookMessengerReply,
  resolveCustomerFacebookName
} from './chatbotEngine';
import { activeFacebookPage } from './db';

const router = Router();

// GET /api/chatbot/config or /api/config
router.get(['/config', '/chatbot/config'], (_req: Request, res: Response) => {
  res.json({ success: true, config: getChatbotConfig() });
});

// POST /api/chatbot/config or /api/config
router.post(['/config', '/chatbot/config'], (req: Request, res: Response) => {
  const newConfig = req.body;
  saveChatbotConfigToDisk(newConfig);
  res.json({ success: true, message: 'បានរក្សាទុកការកំណត់ Chatbot រួចរាល់!', config: getChatbotConfig() });
});

// GET /api/chatbot/logs or /api/logs
router.get(['/logs', '/chatbot/logs'], (_req: Request, res: Response) => {
  res.json({ success: true, logs: getChatbotLogs() });
});

// POST /api/chatbot/test_slip - Live Simulator for testing slip verification
router.post(['/test_slip', '/chatbot/test_slip'], async (req: Request, res: Response) => {
  const { sender_id, sender_name, image_base64, mime_type } = req.body;
  if (!image_base64) {
    return res.status(400).json({ success: false, error: 'Missing image_base64' });
  }

  const result = await processIncomingSlipImage(
    sender_id || 'TEST_USER_1',
    sender_name || 'អតិថិជនសាកល្បង',
    image_base64,
    mime_type || 'image/jpeg'
  );

  res.json({ success: true, result });
});

// POST /api/chatbot/test_voice - Live Simulator for testing Khmer voice note understanding
router.post(['/test_voice', '/chatbot/test_voice'], async (req: Request, res: Response) => {
  const { sender_id, sender_name, audio_base64, mime_type } = req.body;
  if (!audio_base64) {
    return res.status(400).json({ success: false, error: 'Missing audio_base64' });
  }

  const result = await processIncomingVoiceAudio(
    sender_id || 'TEST_USER_1',
    sender_name || 'អតិថិជនសាកល្បង',
    audio_base64,
    mime_type || 'audio/mp4'
  );

  res.json({ success: true, result });
});

// POST /api/chatbot/test_message - Live Simulator for testing address extraction or AI FAQ
router.post(['/test_message', '/chatbot/test_message'], async (req: Request, res: Response) => {
  const { sender_id, sender_name, message } = req.body;
  if (!message) {
    return res.status(400).json({ success: false, error: 'Missing message' });
  }

  const name = sender_name || 'អតិថិជនសាកល្បង';
  const id = sender_id || 'TEST_USER_1';

  // 1. First check if message contains Address or Phone number
  const addressResult = await processIncomingAddressText(id, name, message);
  if (addressResult.isAddressOrPhone && addressResult.reply) {
    return res.json({
      success: true,
      type: 'ADDRESS_EXTRACTED',
      reply: addressResult.reply,
      invoice: addressResult.invoice
    });
  }

  // 2. Otherwise route to AI Smart FAQ Engine (#11)
  const faqReply = await processCustomerFaq(id, name, message);
  return res.json({
    success: true,
    type: 'AI_FAQ',
    reply: faqReply
  });
});

// POST /api/chatbot/send_payment_reminders - Trigger bulk payment reminders (#4)
router.post(['/send_payment_reminders', '/chatbot/send_payment_reminders'], async (_req: Request, res: Response) => {
  const result = await generatePaymentReminders();
  // If customer has PSID, send via Messenger
  for (const item of result.messages) {
    if (item.invoice.facebook_user_id) {
      sendFacebookMessengerReply(item.invoice.facebook_user_id, item.message).catch(() => {});
    }
  }

  res.json({
    success: true,
    message: `បានផ្ញើសាររំលឹកបង់ប្រាក់ចំនួន ${result.count} កន្ត្រក!`,
    count: result.count,
    reminders: result.messages
  });
});

// POST /api/chatbot/scan_inbox_slips - Scan Messenger Inbox for customer payment slips from midnight up to now
router.post(['/scan_inbox_slips', '/chatbot/scan_inbox_slips'], async (req: Request, res: Response) => {
  const { since_hours } = req.body;
  const page = activeFacebookPage;

  if (!page || !page.access_token || !page.id) {
    return res.status(400).json({
      success: false,
      error: 'មិនទាន់ភ្ជាប់ Facebook Page ឬគ្មាន Access Token ឡើយ!'
    });
  }

  // Calculate cutoff timestamp: defaults to 12:00 AM today (local midnight) or since_hours
  const now = new Date();
  let cutoffDate: Date;
  if (since_hours && Number(since_hours) > 0) {
    cutoffDate = new Date(Date.now() - Number(since_hours) * 3600 * 1000);
  } else {
    // 12:00 AM Today (Local Midnight)
    cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  const cutoffIso = cutoffDate.toISOString();
  console.log(`🔍 [Messenger Scan] Scanning conversations since ${cutoffIso}...`);

  try {
    const fbRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}/conversations?fields=id,updated_time,participants,messages{id,created_time,from,message,attachments{id,mime_type,name,size,image_data}}&limit=50&access_token=${page.access_token}`
    );
    const fbData = await fbRes.json();

    if (!fbData.data || !Array.isArray(fbData.data)) {
      return res.status(400).json({
        success: false,
        error: fbData.error?.message || 'បរាជ័យក្នុងការទាញយក Inbox ពី Facebook'
      });
    }

    const conversations = fbData.data;
    let imagesScanned = 0;
    let matchedPaidCount = 0;
    const matchedSlips: Array<{
      customer_name: string;
      basket_no: number | string;
      amount: number;
      slip_url?: string;
      created_time: string;
    }> = [];

    for (const conv of conversations) {
      const messages = conv.messages?.data || [];

      for (const m of messages) {
        // Skip messages sent by the page itself
        if (m.from?.id === page.id) continue;

        // Skip messages before the cutoff time
        const msgTime = new Date(m.created_time);
        if (msgTime < cutoffDate) continue;

        const attachments = m.attachments?.data || [];
        for (const att of attachments) {
          const imgUrl = att.image_data?.url;
          if (!imgUrl) continue;

          // Skip stickers
          if (att.image_data?.render_as_sticker) continue;

          imagesScanned++;
          const senderPsid = m.from?.id || conv.participants?.data?.find((p: any) => p.id !== page.id)?.id || 'UNKNOWN';
          const customerName = m.from?.name || conv.participants?.data?.find((p: any) => p.id !== page.id)?.name || 'Facebook Customer';

          try {
            const slipRes = await processIncomingSlipImage(senderPsid, customerName, imgUrl, att.mime_type || 'image/jpeg');
            if (slipRes.success && slipRes.invoice) {
              matchedPaidCount++;
              matchedSlips.push({
                customer_name: slipRes.invoice.facebook_name || customerName,
                basket_no: slipRes.invoice.basket_no || slipRes.invoice.invoice_id,
                amount: slipRes.invoice.total_amount,
                slip_url: slipRes.invoice.payment_slip_url,
                created_time: m.created_time
              });
            }
          } catch (slipErr) {
            console.error('[Batch Slip Error]:', slipErr);
          }
        }
      }
    }

    return res.json({
      success: true,
      cutoff: cutoffIso,
      conversationsCount: conversations.length,
      imagesScanned,
      matchedPaidCount,
      matchedSlips,
      message: `✅ បានស្កេន ${conversations.length} ការសន្ទនា, ពិនិត្យ ${imagesScanned} រូបភាព, និងបាន Tick [បង់រួច] ${matchedPaidCount} កន្ត្រក!`
    });
  } catch (err: any) {
    console.error('[Scan Inbox Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Error scanning inbox slips'
    });
  }
});

// -------------------------------------------------------------
// 🔗 Meta Facebook Messenger Webhook Handlers
// -------------------------------------------------------------

// GET /api/webhook (Meta Webhook verification handshake)
router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const config = getChatbotConfig();

  if (mode === 'subscribe' && token === config.webhookVerifyToken) {
    console.log('✅ Facebook Webhook verified successfully!');
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// POST /api/webhook (Meta Inbound Message Event)
router.post('/webhook', async (req: Request, res: Response) => {
  const body = req.body;

  if (body.object === 'page') {
    const config = getChatbotConfig();
    if (!config.enabled) {
      console.log('⏸️ [Messenger Inbound] Ignored - Chatbot Master Switch is OFF');
      return res.status(200).send('CHATBOT_DISABLED');
    }

    for (const entry of body.entry) {
      const webhookEvent = entry.messaging?.[0];
      if (!webhookEvent) continue;

      const senderPsid = webhookEvent.sender?.id;
      const message = webhookEvent.message;

      if (message && senderPsid) {
        console.log(`📩 [Messenger Inbound] from PSID ${senderPsid}:`, message.text || '[Attachment]');
        const customerName = await resolveCustomerFacebookName(senderPsid);

        // Handle attachments (Slips or Audio Voice Notes)
        if (message.attachments && message.attachments.length > 0) {
          const imageAttachment = message.attachments.find((att: any) => att.type === 'image');
          const audioAttachment = message.attachments.find((att: any) => att.type === 'audio');

          if (imageAttachment && imageAttachment.payload?.url) {
            processIncomingSlipImage(senderPsid, customerName, imageAttachment.payload.url)
              .then(slipRes => {
                if (slipRes.reply && slipRes.reply.trim()) {
                  sendFacebookMessengerReply(senderPsid, slipRes.reply);
                }
              })
              .catch(err => console.error('[Webhook Slip Error]', err));
          } else if (audioAttachment && audioAttachment.payload?.url) {
            // Stream audio from Facebook CDN to Gemini
            fetch(audioAttachment.payload.url)
              .then(res => res.arrayBuffer())
              .then(buffer => {
                const base64 = Buffer.from(buffer).toString('base64');
                return processIncomingVoiceAudio(senderPsid, customerName, base64, 'audio/mp4');
              })
              .then(voiceRes => {
                if (voiceRes.reply && voiceRes.reply.trim()) {
                  sendFacebookMessengerReply(senderPsid, voiceRes.reply);
                }
              })
              .catch(err => console.error('[Webhook Voice Error]', err));
          }
        } else if (message.text) {
          // Handle Text (Address/Phone or FAQ / Basket Query)
          const addrRes = await processIncomingAddressText(senderPsid, customerName, message.text);
          if (addrRes.isAddressOrPhone && addrRes.reply && addrRes.reply.trim()) {
            await sendFacebookMessengerReply(senderPsid, addrRes.reply);
          } else {
            const faqReply = await processCustomerFaq(senderPsid, customerName, message.text);
            if (faqReply && faqReply.trim()) {
              await sendFacebookMessengerReply(senderPsid, faqReply);
            }
          }
        }
      }
    }
    return res.status(200).send('EVENT_RECEIVED');
  }

  res.sendStatus(404);
});

export default router;
