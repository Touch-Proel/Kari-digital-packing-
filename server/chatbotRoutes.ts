import { Router, Request, Response } from 'express';
import {
  getChatbotConfig,
  saveChatbotConfigToDisk,
  getChatbotLogs,
  processIncomingSlipImage,
  processIncomingAddressText,
  generatePaymentReminders,
  generateShippingNotification,
  processCustomerFaq,
  sendFacebookMessengerReply
} from './chatbotEngine';

const router = Router();

// GET /api/chatbot/config
router.get('/config', (_req: Request, res: Response) => {
  res.json({ success: true, config: getChatbotConfig() });
});

// POST /api/chatbot/config
router.post('/config', (req: Request, res: Response) => {
  const newConfig = req.body;
  saveChatbotConfigToDisk(newConfig);
  res.json({ success: true, message: 'បានរក្សាទុកការកំណត់ Chatbot រួចរាល់!', config: getChatbotConfig() });
});

// GET /api/chatbot/logs
router.get('/logs', (_req: Request, res: Response) => {
  res.json({ success: true, logs: getChatbotLogs() });
});

// POST /api/chatbot/test_slip - Live Simulator for testing slip verification
router.post('/test_slip', async (req: Request, res: Response) => {
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

// POST /api/chatbot/test_message - Live Simulator for testing address extraction or AI FAQ
router.post('/test_message', async (req: Request, res: Response) => {
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
router.post('/send_payment_reminders', async (_req: Request, res: Response) => {
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
    for (const entry of body.entry) {
      const webhookEvent = entry.messaging?.[0];
      if (!webhookEvent) continue;

      const senderPsid = webhookEvent.sender?.id;
      const message = webhookEvent.message;

      if (message && senderPsid) {
        console.log(`📩 [Messenger Inbound] from PSID ${senderPsid}:`, message.text || '[Attachment]');

        // Handle image attachments (Slips)
        if (message.attachments && message.attachments.length > 0) {
          const imageAttachment = message.attachments.find((att: any) => att.type === 'image');
          if (imageAttachment && imageAttachment.payload?.url) {
            processIncomingSlipImage(senderPsid, 'Facebook Customer', imageAttachment.payload.url)
              .then(slipRes => {
                if (slipRes.reply) {
                  sendFacebookMessengerReply(senderPsid, slipRes.reply);
                }
              })
              .catch(err => console.error('[Webhook Slip Error]', err));
          }
        } else if (message.text) {
          // Handle Text (Address/Phone or FAQ)
          const addrRes = await processIncomingAddressText(senderPsid, 'Facebook Customer', message.text);
          if (addrRes.isAddressOrPhone && addrRes.reply) {
            await sendFacebookMessengerReply(senderPsid, addrRes.reply);
          } else {
            const faqReply = await processCustomerFaq(senderPsid, 'Facebook Customer', message.text);
            if (faqReply) {
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
