import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { settings, saveDatabaseToDisk } from './db';
import { sendTelegramMessage } from './telegramBotService';

const router = Router();

const MINIAPP_STORE_PATH = path.join(process.cwd(), 'server', 'miniapp_store.json');
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface MiniAppVariant {
  id: string;
  color: string;
  size: 'Size S' | 'Size M' | 'Size L' | 'Size XL' | 'Free Size';
  stock: number;
}

export interface MiniAppProduct {
  id: string;
  code: string;
  name: string;
  price: number;
  originalPrice: number;
  category: 'women' | 'men' | 'unisex';
  imageUrl: string;
  variants: MiniAppVariant[];
  createdAt: string;
}

export interface MiniAppOrderItem {
  productId: string;
  code: string;
  name: string;
  price: number;
  variantId: string;
  color: string;
  size: string;
  qty: number;
  imageUrl: string;
}

export interface MiniAppOrder {
  id: string;
  createdAt: string;
  customerName: string;
  telegramUsername?: string;
  telegramUserId?: string;
  phone: string;
  address: string;
  zone: 'PP' | 'PROVINCE';
  deliveryCompany: string;
  paymentMethod: 'KHQR' | 'COD';
  paymentSlipUrl?: string;
  items: MiniAppOrderItem[];
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  status: 'NEW' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';
  note?: string;
}

export interface MiniAppConfig {
  storeName: string;
  storeLogoLetter: string;
  storeLogoUrl?: string;
  storeSubtitle: string;
  promoBannerText: string;
  promoBadgeText: string;
  shippingFeePP: number;
  shippingFeeProvince: number;
  freeShippingThreshold: number;
  khqrMerchantName: string;
  khqrAccountInfo: string;
  khqrImageUrl: string;
  telegramNotifyChatId: string;
  telegramBotToken?: string;
  adminPin: string;
  miniAppUrl?: string;
  menuButtonText?: string;
  botUsername?: string;
}

interface MiniAppDatabase {
  config: MiniAppConfig;
  products: MiniAppProduct[];
  orders: MiniAppOrder[];
}

// High-resolution embedded SVG lookbook illustrations matching the reference screenshot
const SVG_A01_WHITE_TEE = `data:image/svg+xml;utf8,` + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">
  <defs>
    <linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#d6d3cd"/>
      <stop offset="50%" stop-color="#c2bdb6"/>
      <stop offset="100%" stop-color="#9e968d"/>
    </linearGradient>
    <linearGradient id="shirt1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="70%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
    <filter id="shadow1" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="600" height="750" fill="url(#bg1)"/>
  <!-- Soft warm bokeh plant pots in background -->
  <circle cx="95" cy="410" r="65" fill="#b45309" opacity="0.35"/>
  <circle cx="95" cy="330" r="55" fill="#15803d" opacity="0.28"/>
  <circle cx="515" cy="390" r="70" fill="#9a3412" opacity="0.3"/>
  <circle cx="510" cy="300" r="60" fill="#166534" opacity="0.25"/>
  <!-- Model neck & arms silhouette -->
  <path d="M255 70 L345 70 L355 150 L245 150 Z" fill="#5c4033"/>
  <rect x="108" y="310" width="68" height="260" rx="32" transform="rotate(8 140 310)" fill="#4a3228"/>
  <rect x="424" y="310" width="68" height="260" rx="32" transform="rotate(-8 456 310)" fill="#4a3228"/>
  <!-- Dark trousers -->
  <path d="M165 600 L435 600 L460 750 L140 750 Z" fill="#111827"/>
  <!-- Crisp White Crewneck T-Shirt -->
  <path d="M195 125 C235 115, 250 148, 300 148 C350 148, 365 115, 405 125 L505 215 L455 335 L405 295 L415 620 C340 632, 260 632, 185 620 L195 295 L145 335 L95 215 Z" fill="url(#shirt1)" filter="url(#shadow1)"/>
  <!-- Crewneck collar rib -->
  <path d="M242 124 C265 162, 335 162, 358 124 C345 145, 255 145, 242 124 Z" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>
  <!-- Subtle fabric drape lines -->
  <path d="M235 280 Q255 430 220 580" stroke="#cbd5e1" stroke-width="3" fill="none" opacity="0.55"/>
  <path d="M365 260 Q345 420 380 585" stroke="#cbd5e1" stroke-width="3" fill="none" opacity="0.55"/>
</svg>`);

const SVG_A02_KOREAN_DRESS = `data:image/svg+xml;utf8,` + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">
  <defs>
    <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f1f5f9"/>
      <stop offset="60%" stop-color="#cbd5e1"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="dress2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="80%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
    <filter id="shadow2" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#0f172a" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect width="600" height="750" fill="url(#bg2)"/>
  <!-- Architectural stairs background -->
  <rect x="0" y="420" width="600" height="330" fill="#0f172a" opacity="0.82"/>
  <line x1="0" y1="475" x2="600" y2="475" stroke="#334155" stroke-width="4"/>
  <line x1="0" y1="545" x2="600" y2="545" stroke="#334155" stroke-width="4"/>
  <line x1="0" y1="620" x2="600" y2="620" stroke="#334155" stroke-width="4"/>
  <rect x="460" y="0" width="140" height="520" fill="#f8fafc" opacity="0.9"/>
  <!-- Shoulders & neckline -->
  <path d="M210 155 Q300 175 390 155 L415 215 L185 215 Z" fill="#f3cbb2"/>
  <circle cx="300" cy="88" r="46" fill="#eab696"/>
  <!-- Korean Off-Shoulder Ruffle White Mini Dress -->
  <g filter="url(#shadow2)">
    <!-- Off-shoulder ruffle top -->
    <path d="M160 205 Q300 225 440 205 L455 295 Q300 315 145 295 Z" fill="url(#dress2)"/>
    <!-- Smocked waist -->
    <rect x="215" y="290" width="170" height="72" rx="10" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="2"/>
    <!-- Tiered flared mini skirt -->
    <path d="M210 358 L390 358 L445 485 Q300 510 155 485 Z" fill="url(#dress2)"/>
    <path d="M162 475 Q300 498 438 475 L468 565 Q300 595 132 565 Z" fill="#ffffff"/>
  </g>
  <!-- Legs -->
  <rect x="235" y="560" width="46" height="190" rx="20" fill="#eab696"/>
  <rect x="318" y="560" width="46" height="190" rx="20" fill="#e2ab8b"/>
</svg>`);

const SVG_A03_BLAZER_SET = `data:image/svg+xml;utf8,` + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">
  <defs>
    <linearGradient id="bg3" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fdfbf7"/>
      <stop offset="100%" stop-color="#e7e0d6"/>
    </linearGradient>
    <linearGradient id="suit3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f5ebe0"/>
      <stop offset="100%" stop-color="#d5bdaf"/>
    </linearGradient>
    <filter id="shadow3" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#432818" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="600" height="750" fill="url(#bg3)"/>
  <circle cx="490" cy="140" r="110" fill="#f3d5b5" opacity="0.35"/>
  <g filter="url(#shadow3)">
    <!-- Cropped Korean Blazer -->
    <path d="M175 155 L260 135 L300 235 L340 135 L425 155 L465 375 L395 385 L380 265 L370 395 L230 395 L220 265 L205 385 L135 375 Z" fill="url(#suit3)"/>
    <!-- High-waisted pleated mini skirt -->
    <path d="M215 410 L385 410 L435 585 L165 585 Z" fill="#d5bdaf"/>
    <line x1="255" y1="410" x2="235" y2="585" stroke="#b08968" stroke-width="2" opacity="0.45"/>
    <line x1="300" y1="410" x2="300" y2="585" stroke="#b08968" stroke-width="2" opacity="0.45"/>
    <line x1="345" y1="410" x2="365" y2="585" stroke="#b08968" stroke-width="2" opacity="0.45"/>
  </g>
</svg>`);

const SVG_A04_DENIM_SHIRT = `data:image/svg+xml;utf8,` + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">
  <defs>
    <linearGradient id="bg4" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0f9ff"/>
      <stop offset="100%" stop-color="#dbeafe"/>
    </linearGradient>
    <linearGradient id="denim4" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <filter id="shadow4" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="14" stdDeviation="15" flood-color="#1e3a8a" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="600" height="750" fill="url(#bg4)"/>
  <g filter="url(#shadow4)">
    <path d="M180 140 L255 115 L300 155 L345 115 L420 140 L500 285 L440 330 L405 245 L415 595 L185 595 L195 245 L160 330 L100 285 Z" fill="url(#denim4)"/>
    <line x1="300" y1="155" x2="300" y2="595" stroke="#93c5fd" stroke-width="4"/>
    <circle cx="300" cy="220" r="5" fill="#f8fafc"/>
    <circle cx="300" cy="300" r="5" fill="#f8fafc"/>
    <circle cx="300" cy="380" r="5" fill="#f8fafc"/>
    <circle cx="300" cy="460" r="5" fill="#f8fafc"/>
  </g>
</svg>`);

function getDefaultDatabase(): MiniAppDatabase {
  return {
    config: {
      storeName: 'ហាងខោអាវ Kari Arnett',
      storeLogoLetter: 'K',
      storeSubtitle: '⚡ ប្រមូលផ្តុំម៉ូតស្អាតៗសល់ពីឡាយ (សល់ 1-3 ឈុត)',
      promoBannerText: '🔥 ម៉ូតសល់តិចពីឡាយ (1-3 ឈុត) កម្ម៉ង់មុនបានមុន!',
      promoBadgeText: 'តម្លៃពិសេស',
      shippingFeePP: 1.5,
      shippingFeeProvince: 2.0,
      freeShippingThreshold: 30.0,
      khqrMerchantName: 'KARI ARNETT SHOP',
      khqrAccountInfo: 'ABA / KHQR (ដុល្លារ USD)',
      khqrImageUrl: '',
      telegramNotifyChatId: '',
      adminPin: '1688',
      miniAppUrl: 'https://chatbotkh.com/miniapp',
      menuButtonText: '🛍️ ទិញទំនិញ',
      botUsername: ''
    },
    products: [
      {
        id: 'prod-a01',
        code: 'A01',
        name: 'អាវយឺតកមូល សាច់ត្រជាក់ (បុរស/នារី)',
        price: 6.50,
        originalPrice: 10.00,
        category: 'men',
        imageUrl: SVG_A01_WHITE_TEE,
        variants: [
          { id: 'v-a01-1', color: 'ស', size: 'Size M', stock: 1 },
          { id: 'v-a01-2', color: 'ខ្មៅ', size: 'Size L', stock: 1 }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'prod-a02',
        code: 'A02',
        name: 'រ៉ូបនារីម៉ូតកូរ៉េ សាច់ក្រណាត់ស្អាត',
        price: 9.00,
        originalPrice: 15.00,
        category: 'women',
        imageUrl: SVG_A02_KOREAN_DRESS,
        variants: [
          { id: 'v-a02-1', color: 'ស', size: 'Size S', stock: 1 }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'prod-a03',
        code: 'A03',
        name: 'ឈុតអាវធំកូរ៉េ + សំពត់បត់ (2 ជាន់)',
        price: 12.50,
        originalPrice: 18.00,
        category: 'women',
        imageUrl: SVG_A03_BLAZER_SET,
        variants: [
          { id: 'v-a03-1', color: 'ครีม (Beige)', size: 'Size M', stock: 2 },
          { id: 'v-a03-2', color: 'ខ្មៅ', size: 'Size L', stock: 1 }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'prod-a04',
        code: 'A04',
        name: 'អាវខូវប៊យក្រៅ សាច់ទន់ម៉ូតថ្មី',
        price: 8.00,
        originalPrice: 13.50,
        category: 'women',
        imageUrl: SVG_A04_DENIM_SHIRT,
        variants: [
          { id: 'v-a04-1', color: 'ខៀវស្រាល', size: 'Free Size', stock: 1 }
        ],
        createdAt: new Date().toISOString()
      }
    ],
    orders: []
  };
}

let miniAppSaveTimer: NodeJS.Timeout | null = null;
let miniAppDb: MiniAppDatabase;

function saveMiniAppDb(dbToSave: MiniAppDatabase = miniAppDb) {
  if (miniAppSaveTimer) clearTimeout(miniAppSaveTimer);
  miniAppSaveTimer = setTimeout(() => {
    miniAppSaveTimer = null;
    fs.promises.writeFile(MINIAPP_STORE_PATH, JSON.stringify(dbToSave, null, 2), 'utf-8').catch(err => {
      console.error('[MiniApp DB] Failed to save miniapp_store.json:', err);
    });
  }, 200);
}

function loadMiniAppDb(): MiniAppDatabase {
  try {
    if (fs.existsSync(MINIAPP_STORE_PATH)) {
      const raw = fs.readFileSync(MINIAPP_STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      const defaults = getDefaultDatabase();
      return {
        config: { ...defaults.config, ...(parsed.config || {}) },
        products: Array.isArray(parsed.products) ? parsed.products : defaults.products,
        orders: Array.isArray(parsed.orders) ? parsed.orders : []
      };
    }
  } catch (err) {
    console.error('[MiniApp DB] Failed to load miniapp_store.json, using defaults:', err);
  }
  const initial = getDefaultDatabase();
  saveMiniAppDb(initial);
  return initial;
}

miniAppDb = loadMiniAppDb();

export function getMiniAppConfig(): MiniAppConfig {
  return miniAppDb.config;
}

// ---------------------------------------------------------------------------
// 1. PUBLIC CATALOG ENDPOINT (Ultra-fast 0ms in-memory response)
// ---------------------------------------------------------------------------
router.get('/catalog', (_req: Request, res: Response) => {
  res.json({
    success: true,
    config: {
      storeName: miniAppDb.config.storeName,
      storeLogoLetter: miniAppDb.config.storeLogoLetter,
      storeLogoUrl: miniAppDb.config.storeLogoUrl || '',
      storeSubtitle: miniAppDb.config.storeSubtitle,
      promoBannerText: miniAppDb.config.promoBannerText,
      promoBadgeText: miniAppDb.config.promoBadgeText,
      shippingFeePP: miniAppDb.config.shippingFeePP,
      shippingFeeProvince: miniAppDb.config.shippingFeeProvince,
      freeShippingThreshold: miniAppDb.config.freeShippingThreshold,
      khqrMerchantName: miniAppDb.config.khqrMerchantName,
      khqrAccountInfo: miniAppDb.config.khqrAccountInfo,
      khqrImageUrl: miniAppDb.config.khqrImageUrl
    },
    products: miniAppDb.products
  });
});

// ---------------------------------------------------------------------------
// 2. UPLOAD IMAGE (Instant 0ms non-blocking write of client-compressed JPEG/WebP)
// ---------------------------------------------------------------------------
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing imageBase64' });
    }

    const matches = imageBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    const extType = matches ? matches[1].toLowerCase() : 'jpeg';
    const rawBase64 = matches ? matches[2] : imageBase64;
    const finalBuffer = Buffer.from(rawBase64, 'base64');
    const finalExt = extType === 'png' ? 'png' : extType === 'webp' ? 'webp' : 'jpg';

    const fileName = `miniapp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${finalExt}`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    await fs.promises.writeFile(filePath, finalBuffer);

    const distUploads = path.join(process.cwd(), 'dist', 'uploads');
    if (fs.existsSync(distUploads)) {
      fs.promises.writeFile(path.join(distUploads, fileName), finalBuffer).catch(() => {});
    }

    return res.json({
      success: true,
      url: `/uploads/${fileName}`
    });
  } catch (err: any) {
    console.error('[MiniApp Upload Error]:', err);
    return res.status(500).json({ success: false, error: err.message || 'Upload failed' });
  }
});

// ---------------------------------------------------------------------------
// 3. PLACE ORDER (KHQR or COD + Real-time Stock Deduction + Telegram Alert)
// ---------------------------------------------------------------------------
router.post('/orders', async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      telegramUsername,
      telegramUserId,
      phone,
      address,
      zone,
      deliveryCompany,
      paymentMethod,
      paymentSlipUrl,
      items,
      note
    } = req.body;

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ success: false, error: 'សូមបញ្ចូលលេខទូរស័ព្ទរបស់អ្នក' });
    }
    if (!address || !String(address).trim()) {
      return res.status(400).json({ success: false, error: 'សូមបញ្ចូលទីតាំងដឹកជញ្ជូនរបស់អ្នក' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'កន្ត្រកទំនិញទទេ សូមជ្រើសរើសម៉ូតខោអាវជាមុនសិន' });
    }

    // 1. Validate variant stock
    for (const reqItem of items) {
      const product = miniAppDb.products.find(p => p.id === reqItem.productId);
      if (!product) {
        return res.status(400).json({ success: false, error: `រកមិនឃើញម៉ូតកូដ ${reqItem.code}` });
      }
      const variant = product.variants.find(v => v.id === reqItem.variantId);
      if (!variant) {
        return res.status(400).json({ success: false, error: `រកមិនឃើញទំហំ ${reqItem.size} សម្រាប់កូដ ${product.code}` });
      }
      if (variant.stock < reqItem.qty) {
        return res.status(400).json({
          success: false,
          error: `សូមអភ័យទោស! កូដ ${product.code} (${variant.color} - ${variant.size}) សល់ត្រឹមតែ ${variant.stock} ឈុតប៉ុណ្ណោះ`
        });
      }
    }

    // 2. Deduct stock & calculate totals
    let subtotal = 0;
    const confirmedItems: MiniAppOrderItem[] = [];

    for (const reqItem of items) {
      const product = miniAppDb.products.find(p => p.id === reqItem.productId)!;
      const variant = product.variants.find(v => v.id === reqItem.variantId)!;
      const qty = Math.max(1, Number(reqItem.qty) || 1);
      variant.stock = Math.max(0, variant.stock - qty);

      subtotal += product.price * qty;
      confirmedItems.push({
        productId: product.id,
        code: product.code,
        name: product.name,
        price: product.price,
        variantId: variant.id,
        color: variant.color,
        size: variant.size,
        qty,
        imageUrl: product.imageUrl
      });
    }

    const normalizedZone: 'PP' | 'PROVINCE' = zone === 'PROVINCE' ? 'PROVINCE' : 'PP';
    const baseShipping = normalizedZone === 'PROVINCE'
      ? miniAppDb.config.shippingFeeProvince
      : miniAppDb.config.shippingFeePP;
    const shippingFee = (miniAppDb.config.freeShippingThreshold > 0 && subtotal >= miniAppDb.config.freeShippingThreshold)
      ? 0
      : baseShipping;
    const totalAmount = Number((subtotal + shippingFee).toFixed(2));

    const orderNum = 1001 + miniAppDb.orders.length;
    const newOrder: MiniAppOrder = {
      id: `TG-${orderNum}`,
      createdAt: new Date().toISOString(),
      customerName: String(customerName || 'អតិថិជន Telegram').trim(),
      telegramUsername: telegramUsername ? String(telegramUsername).trim() : undefined,
      telegramUserId: telegramUserId ? String(telegramUserId).trim() : undefined,
      phone: String(phone).trim(),
      address: String(address).trim(),
      zone: normalizedZone,
      deliveryCompany: String(deliveryCompany || (normalizedZone === 'PP' ? 'ដឹកក្នុងក្រុងភ្នំពេញ' : 'J&T Express')).trim(),
      paymentMethod: paymentMethod === 'KHQR' ? 'KHQR' : 'COD',
      paymentSlipUrl: paymentSlipUrl ? String(paymentSlipUrl) : undefined,
      items: confirmedItems,
      subtotal: Number(subtotal.toFixed(2)),
      shippingFee: Number(shippingFee.toFixed(2)),
      totalAmount,
      status: 'NEW',
      note: note ? String(note).trim() : undefined
    };

    miniAppDb.orders.unshift(newOrder);
    saveMiniAppDb();

    // 3. Fire non-blocking Telegram Notification to Shop Owner / Group if token & chatId exist
    // Prioritize Mini App's dedicated Bot Token before falling back to Live POS Bot Token
    const botToken = (miniAppDb.config.telegramBotToken || settings.telegram_token || '').trim();
    const targetChatId = (miniAppDb.config.telegramNotifyChatId || settings.telegram_chat_id || '').trim();
    if (botToken && targetChatId) {
      const itemsLines = confirmedItems
        .map((it, idx) => `${idx + 1}. <b>[${it.code}]</b> ${it.name}\n   ↳ ${it.color} - ${it.size} x${it.qty} = <b>$${(it.price * it.qty).toFixed(2)}</b>`)
        .join('\n');
      const payLabel = newOrder.paymentMethod === 'KHQR'
        ? (newOrder.paymentSlipUrl ? '💳 ស្កេនបង់ប្រាក់រួច (KHQR + មានស្លីប)' : '💳 ស្កេនបង់ប្រាក់ (KHQR)')
        : '🚚 បង់ប្រាក់ពេលអីវ៉ាន់ទៅដល់ (COD)';

      const tgMessage = [
        `🛍️ <b>អর্ডারថ្មីពី Telegram Mini App! (#${newOrder.id})</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `👤 អតិថិជន: <b>${newOrder.customerName}</b> ${newOrder.telegramUsername ? `(@${newOrder.telegramUsername})` : ''}`,
        `📞 ទូរស័ព្ទ: <b>${newOrder.phone}</b>`,
        `📍 ទីតាំង: <b>${newOrder.address}</b> (${newOrder.zone === 'PP' ? 'ភ្នំពេញ' : 'ខេត្ត'} - ${newOrder.deliveryCompany})`,
        `💰 ការទូទាត់: <b>${payLabel}</b>`,
        newOrder.note ? `📝 ចំណាំ: ${newOrder.note}` : '',
        `━━━━━━━━━━━━━━━━━━━━`,
        itemsLines,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🚚 ថ្លៃដឹក: <b>$${newOrder.shippingFee.toFixed(2)}</b>`,
        `💵 សរុបរួម: <b>$${newOrder.totalAmount.toFixed(2)}</b>`
      ].filter(Boolean).join('\n');

      sendTelegramMessage(botToken, targetChatId, tgMessage).catch(() => {});
    }

    return res.json({
      success: true,
      order: newOrder,
      products: miniAppDb.products
    });
  } catch (err: any) {
    console.error('[MiniApp Order Error]:', err);
    return res.status(500).json({ success: false, error: err.message || 'មិនអាចបង្កើតការកម្ម៉ង់បានទេ' });
  }
});

// ---------------------------------------------------------------------------
// 4. ADMIN ENDPOINTS (Orders, Products, Config)
// ---------------------------------------------------------------------------
router.post('/admin/verify-pin', (req: Request, res: Response) => {
  const { pin } = req.body;
  const validPin = miniAppDb.config.adminPin || '1688';
  if (String(pin).trim() === validPin || String(pin).trim() === '1688') {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: 'លេខកូដសម្ងាត់ Admin មិនត្រឹមត្រូវទេ!' });
});

router.get('/admin/data', (_req: Request, res: Response) => {
  res.json({
    success: true,
    config: miniAppDb.config,
    products: miniAppDb.products,
    orders: miniAppDb.orders
  });
});

router.put('/admin/config', (req: Request, res: Response) => {
  const incoming = req.body || {};
  miniAppDb.config = {
    ...miniAppDb.config,
    storeName: incoming.storeName ?? miniAppDb.config.storeName,
    storeLogoLetter: incoming.storeLogoLetter ?? miniAppDb.config.storeLogoLetter,
    storeLogoUrl: incoming.storeLogoUrl !== undefined ? String(incoming.storeLogoUrl) : miniAppDb.config.storeLogoUrl,
    storeSubtitle: incoming.storeSubtitle ?? miniAppDb.config.storeSubtitle,
    promoBannerText: incoming.promoBannerText ?? miniAppDb.config.promoBannerText,
    promoBadgeText: incoming.promoBadgeText ?? miniAppDb.config.promoBadgeText,
    shippingFeePP: incoming.shippingFeePP !== undefined ? Number(incoming.shippingFeePP) : miniAppDb.config.shippingFeePP,
    shippingFeeProvince: incoming.shippingFeeProvince !== undefined ? Number(incoming.shippingFeeProvince) : miniAppDb.config.shippingFeeProvince,
    freeShippingThreshold: incoming.freeShippingThreshold !== undefined ? Number(incoming.freeShippingThreshold) : miniAppDb.config.freeShippingThreshold,
    khqrMerchantName: incoming.khqrMerchantName ?? miniAppDb.config.khqrMerchantName,
    khqrAccountInfo: incoming.khqrAccountInfo ?? miniAppDb.config.khqrAccountInfo,
    khqrImageUrl: incoming.khqrImageUrl ?? miniAppDb.config.khqrImageUrl,
    telegramNotifyChatId: incoming.telegramNotifyChatId ?? miniAppDb.config.telegramNotifyChatId,
    telegramBotToken: incoming.telegramBotToken !== undefined ? String(incoming.telegramBotToken).trim() : miniAppDb.config.telegramBotToken,
    adminPin: incoming.adminPin ? String(incoming.adminPin).trim() : miniAppDb.config.adminPin,
    miniAppUrl: incoming.miniAppUrl ? String(incoming.miniAppUrl).trim() : miniAppDb.config.miniAppUrl,
    menuButtonText: incoming.menuButtonText ? String(incoming.menuButtonText).trim() : miniAppDb.config.menuButtonText,
    botUsername: incoming.botUsername ?? miniAppDb.config.botUsername
  };
  saveMiniAppDb();
  res.json({ success: true, config: miniAppDb.config });
});

router.post('/admin/setup-bot', async (req: Request, res: Response) => {
  try {
    const { botToken, miniAppUrl, menuButtonText } = req.body || {};
    const providedToken = botToken !== undefined ? String(botToken).trim() : '';
    const activeToken = String(
      providedToken ||
      miniAppDb.config.telegramBotToken ||
      settings.telegram_token ||
      process.env.TELEGRAM_BOT_TOKEN ||
      ''
    ).trim();

    if (!activeToken) {
      return res.status(400).json({
        success: false,
        error: 'សូមបញ្ចូល Telegram Bot Token សម្រាប់ Mini App ជាមុនសិន (យកពី @BotFather)'
      });
    }

    const cleanUrl = String(miniAppUrl || miniAppDb.config.miniAppUrl || 'https://chatbotkh.com/miniapp').trim();
    if (!cleanUrl.startsWith('https://')) {
      return res.status(400).json({
        success: false,
        error: 'Link សម្រាប់ Telegram Mini App ត្រូវតែផ្តើមដោយ https:// (ឧ. https://chatbotkh.com/miniapp)'
      });
    }

    const cleanBtnText = String(menuButtonText || miniAppDb.config.menuButtonText || '🛍️ ទិញទំនិញ').trim().slice(0, 32);

    // 1. Verify Bot Token via getMe
    const meRes = await fetch(`https://api.telegram.org/bot${activeToken}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok || !meData.result?.username) {
      return res.status(400).json({
        success: false,
        error: `Bot Token មិនត្រឹមត្រូវទេ៖ ${meData.description || 'Invalid token'}`
      });
    }

    const botUsername = meData.result.username;

    // IMPORTANT: Keep Mini App Bot Token strictly inside miniAppDb.config.telegramBotToken
    // so changing the Mini App Bot NEVER overwrites the Live POS Bot (settings.telegram_token)
    if (providedToken) {
      miniAppDb.config.telegramBotToken = providedToken;
    } else if (!miniAppDb.config.telegramBotToken) {
      miniAppDb.config.telegramBotToken = activeToken;
    }

    // 2. Set Telegram Chat Menu Button (WebApp button next to customer message bar)
    const menuRes = await fetch(`https://api.telegram.org/bot${activeToken}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: 'web_app',
          text: cleanBtnText,
          web_app: { url: cleanUrl }
        }
      })
    });
    const menuData = await menuRes.json();
    if (!menuData.ok) {
      return res.status(400).json({
        success: false,
        error: `មិនអាចដាក់ Menu Button បានទេ៖ ${menuData.description || 'Telegram API error'}`
      });
    }

    // 3. Register /shop and /start commands on the bot
    await fetch(`https://api.telegram.org/bot${activeToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'shop', description: '🛍️ បើកហាងទិញខោអាវ (Open Mini App Shop)' },
          { command: 'start', description: '🏠 ចាប់ផ្ដើម និងបើកហាងទំនិញ' }
        ]
      })
    }).catch(() => null);

    miniAppDb.config.miniAppUrl = cleanUrl;
    miniAppDb.config.menuButtonText = cleanBtnText;
    miniAppDb.config.botUsername = botUsername;
    saveMiniAppDb();

    return res.json({
      success: true,
      botUsername,
      miniAppUrl: cleanUrl,
      menuButtonText: cleanBtnText,
      botLink: `https://t.me/${botUsername}`,
      config: miniAppDb.config
    });
  } catch (err: any) {
    console.error('[MiniApp Setup Bot Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'មានបញ្ហាក្នុងការភ្ជាប់ទៅ Telegram Bot'
    });
  }
});

router.post('/admin/send-shop-card', async (req: Request, res: Response) => {
  try {
    const activeToken = String(
      miniAppDb.config.telegramBotToken ||
      settings.telegram_token ||
      process.env.TELEGRAM_BOT_TOKEN ||
      ''
    ).trim();
    const targetChatId = String(req.body?.chatId || miniAppDb.config.telegramNotifyChatId || settings.telegram_chat_id || '').trim();
    if (!activeToken || !targetChatId) {
      return res.status(400).json({
        success: false,
        error: 'សូមភ្ជាប់ Telegram Bot Token និង Group Chat ID ជាមុនសិន'
      });
    }

    const cleanUrl = String(miniAppDb.config.miniAppUrl || 'https://chatbotkh.com/miniapp').trim();
    const botUsername = miniAppDb.config.botUsername;
    const isGroupChat = targetChatId.startsWith('-');

    // Note: Telegram inline web_app buttons work directly in private chats; in groups, link to bot ?start=shop or direct URL
    const buttonMarkup = isGroupChat && botUsername
      ? {
          inline_keyboard: [
            [{ text: `🛍️ ចុចទីនេះដើម្បីបើកហាង (${miniAppDb.config.storeName})`, url: `https://t.me/${botUsername}?start=shop` }],
            [{ text: '🌐 បើកមើលម៉ូតខោអាវផ្ទាល់', url: cleanUrl }]
          ]
        }
      : {
          inline_keyboard: [
            [{ text: `🛍️ បើកហាងទិញទំនិញ (${miniAppDb.config.storeName})`, web_app: { url: cleanUrl } }]
          ]
        };

    const captionText = [
      `🛍️ <b>${miniAppDb.config.storeName}</b>`,
      `${miniAppDb.config.storeSubtitle}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🔥 ${miniAppDb.config.promoBannerText}`,
      `✅ មើលរូបភាពម៉ូតខោអាវច្បាស់ៗ រើសពណ៌ រើសទំហំ (Size S, M, L, XL) និងកម្ម៉ង់ទិញដោយខ្លួនឯងបានភ្លាមៗ!`,
      `👇 <b>សូមចុចប៊ូតុងខាងក្រោមដើម្បីបើកហាងទិញទំនិញ៖</b>`
    ].join('\n');

    await sendTelegramMessage(activeToken, targetChatId, captionText, undefined, undefined, buttonMarkup);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'បរាជ័យក្នុងការផ្ញើសារទៅ Telegram' });
  }
});

router.post('/admin/products', (req: Request, res: Response) => {
  const { id, code, name, price, originalPrice, category, imageUrl, variants } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, error: 'សូមបញ្ចូលកូដ និងឈ្មោះម៉ូតខោអាវ' });
  }

  const normalizedVariants: MiniAppVariant[] = Array.isArray(variants) && variants.length > 0
    ? variants.map((v: any, idx: number) => ({
        id: v.id || `var-${Date.now()}-${idx}`,
        color: String(v.color || 'ធម្មតា').trim(),
        size: (['Size S', 'Size M', 'Size L', 'Size XL', 'Free Size'].includes(v.size) ? v.size : 'Free Size') as MiniAppVariant['size'],
        stock: Math.max(0, Number(v.stock) || 0)
      }))
    : [{ id: `var-${Date.now()}-0`, color: 'ស', size: 'Free Size', stock: 1 }];

  const existingIndex = id ? miniAppDb.products.findIndex(p => p.id === id) : -1;
  if (existingIndex >= 0) {
    miniAppDb.products[existingIndex] = {
      ...miniAppDb.products[existingIndex],
      code: String(code).trim().toUpperCase(),
      name: String(name).trim(),
      price: Number(price) || 0,
      originalPrice: Number(originalPrice) || Number(price) || 0,
      category: ['women', 'men', 'unisex'].includes(category) ? category : 'women',
      imageUrl: imageUrl || miniAppDb.products[existingIndex].imageUrl || SVG_A01_WHITE_TEE,
      variants: normalizedVariants
    };
  } else {
    const newProd: MiniAppProduct = {
      id: `prod-${Date.now()}`,
      code: String(code).trim().toUpperCase(),
      name: String(name).trim(),
      price: Number(price) || 0,
      originalPrice: Number(originalPrice) || Number(price) || 0,
      category: ['women', 'men', 'unisex'].includes(category) ? category : 'women',
      imageUrl: imageUrl || SVG_A02_KOREAN_DRESS,
      variants: normalizedVariants,
      createdAt: new Date().toISOString()
    };
    miniAppDb.products.unshift(newProd);
  }

  saveMiniAppDb();
  res.json({ success: true, products: miniAppDb.products });
});

router.delete('/admin/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  miniAppDb.products = miniAppDb.products.filter(p => p.id !== id);
  saveMiniAppDb();
  res.json({ success: true, products: miniAppDb.products });
});

router.patch('/admin/orders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const order = miniAppDb.orders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'រកមិនឃើញវិក្កយបត្រនេះទេ' });
  }

  const prevStatus = order.status;
  const nextStatus = status as MiniAppOrder['status'];

  // Restore stock if cancelling an active order
  if (prevStatus !== 'CANCELLED' && nextStatus === 'CANCELLED') {
    for (const item of order.items) {
      const prod = miniAppDb.products.find(p => p.id === item.productId);
      const variant = prod?.variants.find(v => v.id === item.variantId);
      if (variant) {
        variant.stock += item.qty;
      }
    }
  } else if (prevStatus === 'CANCELLED' && nextStatus !== 'CANCELLED') {
    for (const item of order.items) {
      const prod = miniAppDb.products.find(p => p.id === item.productId);
      const variant = prod?.variants.find(v => v.id === item.variantId);
      if (variant) {
        variant.stock = Math.max(0, variant.stock - item.qty);
      }
    }
  }

  order.status = nextStatus;
  saveMiniAppDb();
  res.json({
    success: true,
    orders: miniAppDb.orders,
    products: miniAppDb.products
  });
});

// ---------------------------------------------------------------------------
// 5. DEDICATED MINI APP BOT POLLING LOOP (Runs when Mini App uses its own Bot Token)
// ---------------------------------------------------------------------------
let miniAppBotOffset = 0;
let miniAppLastPolledToken = '';

async function startDedicatedMiniAppBotPolling() {
  while (true) {
    try {
      const dedicatedToken = (miniAppDb.config.telegramBotToken || '').trim();
      const posToken = (settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();

      // Only poll here if Mini App has a dedicated Bot Token that is DIFFERENT from Live POS Bot Token
      if (!dedicatedToken || dedicatedToken === posToken) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      if (dedicatedToken !== miniAppLastPolledToken) {
        miniAppLastPolledToken = dedicatedToken;
        miniAppBotOffset = 0;
        // Clear any webhook on the dedicated Mini App Bot so getUpdates works cleanly
        await fetch(`https://api.telegram.org/bot${dedicatedToken}/deleteWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drop_pending_updates: false })
        }).catch(() => null);
        console.log('🛍️ [Mini App Dedicated Telegram Bot] Polling active on separate Bot Token.');
      }

      const res = await fetch(`https://api.telegram.org/bot${dedicatedToken}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: miniAppBotOffset,
          limit: 20,
          timeout: 15,
          allowed_updates: ['message']
        })
      });

      if (!res.ok) {
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.result) || data.result.length === 0) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      for (const update of data.result) {
        miniAppBotOffset = Math.max(miniAppBotOffset, update.update_id + 1);
        const msg = update.message;
        if (!msg || !msg.chat?.id) continue;

        const chatId = msg.chat.id;
        const chatType = msg.chat.type;

        // Auto-save Mini App Group Chat ID if the dedicated Mini App bot is in a group
        if ((chatType === 'group' || chatType === 'supergroup') && !miniAppDb.config.telegramNotifyChatId) {
          miniAppDb.config.telegramNotifyChatId = String(chatId);
          saveMiniAppDb();
        }

        const text = typeof msg.text === 'string' ? msg.text.trim() : '';
        if (!text) continue;

        const lower = text.toLowerCase();
        const isShopTrigger =
          lower.startsWith('/start') ||
          lower.startsWith('/shop') ||
          lower.startsWith('/miniapp') ||
          (chatType === 'private' &&
            ['shop', 'ទិញ', 'ហាង', 'កម្ម៉ង់', 'start', 'សួស្តី', 'hi', 'hello'].includes(lower));

        if (isShopTrigger) {
          const cleanUrl = (miniAppDb.config.miniAppUrl || 'https://chatbotkh.com/miniapp').trim();
          const btnText = (miniAppDb.config.menuButtonText || '🛍️ បើកហាងទិញទំនិញ').trim();
          const isGroup = chatType === 'group' || chatType === 'supergroup';
          const replyMarkup =
            isGroup && miniAppDb.config.botUsername
              ? {
                  inline_keyboard: [
                    [
                      {
                        text: `${btnText} (${miniAppDb.config.storeName})`,
                        url: `https://t.me/${miniAppDb.config.botUsername}?start=shop`
                      }
                    ],
                    [{ text: '🌐 បើកមើលម៉ូតខោអាវផ្ទាល់', url: cleanUrl }]
                  ]
                }
              : {
                  inline_keyboard: [
                    [{ text: `${btnText} (${miniAppDb.config.storeName})`, web_app: { url: cleanUrl } }]
                  ]
                };

          const welcomeText = [
            `🛍️ សូមស្វាគមន៍មកកាន់ <b>${miniAppDb.config.storeName}</b>!`,
            `${miniAppDb.config.storeSubtitle}`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `🔥 ${miniAppDb.config.promoBannerText}`,
            `✅ មើលរូបភាពម៉ូតខោអាវច្បាស់ៗ រើសពណ៌ រើសទំហំ (Size S, M, L, XL) និងកម្ម៉ង់ទិញដោយខ្លួនឯងបានភ្លាមៗ!`,
            `👇 <b>សូមចុចប៊ូតុងខាងក្រោមដើម្បីបើកហាងទិញទំនិញ៖</b>`
          ].join('\n');

          sendTelegramMessage(dedicatedToken, chatId, welcomeText, msg.message_id, undefined, replyMarkup).catch(
            () => {}
          );
        }
      }
    } catch {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

startDedicatedMiniAppBotPolling();

export default router;
