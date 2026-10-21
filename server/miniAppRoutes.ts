import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { settings, saveDatabaseToDisk, getConnectedFacebookPages } from './db.ts';
import { sendTelegramMessage } from './telegramBotService.ts';

const router = Router();

const MINIAPP_STORE_PATH = path.join(process.cwd(), 'server', 'miniapp_store.json');
const EXTERNAL_BACKUP_DIR = path.join(os.homedir() || process.cwd(), '.karishop_data');
const EXTERNAL_MINIAPP_BACKUP_PATH = path.join(EXTERNAL_BACKUP_DIR, 'miniapp_store_backup.json');
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
try {
  if (!fs.existsSync(EXTERNAL_BACKUP_DIR)) {
    fs.mkdirSync(EXTERNAL_BACKUP_DIR, { recursive: true });
  }
} catch {}

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
  category: 'women' | 'men' | 'kids' | 'unisex';
  imageUrl: string;
  images?: string[];
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
  channel?: 'TELEGRAM' | 'FACEBOOK' | 'WEB';
  fbPsid?: string;
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
  trackingInfo?: string;
}

export interface SizeGuideRow {
  size: string;
  weightRange: string;
  bustRange: string;
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
  khqrAccountNumber?: string;
  khqrBakongId?: string;
  khqrAccountInfo: string;
  khqrImageUrl: string;
  khqrRawString?: string;
  abaPaymentLink?: string;
  telegramNotifyChatId: string;
  telegramBotToken?: string;
  adminPin: string;
  miniAppUrl?: string;
  menuButtonText?: string;
  botUsername?: string;
  fbPageId?: string;
  fbPageName?: string;
  fbPageAccessToken?: string;
  fbVerifyToken?: string;
  fbAutoReplyEnabled?: boolean;
  fbButtonText?: string;
  sizeGuide?: SizeGuideRow[];
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

const SVG_A01_BLACK_TEE = `data:image/svg+xml;utf8,` + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">
  <defs>
    <linearGradient id="bg1b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
    <linearGradient id="shirt1b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <filter id="shadow1b" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="600" height="750" fill="url(#bg1b)"/>
  <circle cx="480" cy="180" r="95" fill="#94a3b8" opacity="0.25"/>
  <path d="M195 125 C235 115, 250 148, 300 148 C350 148, 365 115, 405 125 L505 215 L455 335 L405 295 L415 620 C340 632, 260 632, 185 620 L195 295 L145 335 L95 215 Z" fill="url(#shirt1b)" filter="url(#shadow1b)"/>
  <path d="M242 124 C265 162, 335 162, 358 124 C345 145, 255 145, 242 124 Z" fill="#0f172a" stroke="#334155" stroke-width="2"/>
  <rect x="335" y="235" width="46" height="54" rx="6" fill="#1e293b" stroke="#475569" stroke-width="2"/>
</svg>`);

const SVG_A05_KIDS_DRESS = `data:image/svg+xml;utf8,` + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">
  <defs>
    <linearGradient id="bgKids1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff1f2"/>
      <stop offset="100%" stop-color="#ffe4e6"/>
    </linearGradient>
    <linearGradient id="kidsDress" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fb7185"/>
      <stop offset="100%" stop-color="#e11d48"/>
    </linearGradient>
    <filter id="shadowKids1" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#881337" flood-opacity="0.2"/>
    </filter>
  </defs>
  <rect width="600" height="750" fill="url(#bgKids1)"/>
  <circle cx="110" cy="140" r="70" fill="#fda4af" opacity="0.35"/>
  <circle cx="490" cy="580" r="85" fill="#fecdd3" opacity="0.45"/>
  <g filter="url(#shadowKids1)">
    <!-- Peter Pan Collar Kids Dress -->
    <path d="M210 170 L390 170 L415 310 L185 310 Z" fill="#fff1f2"/>
    <circle cx="200" cy="215" r="42" fill="#ffe4e6"/>
    <circle cx="400" cy="215" r="42" fill="#ffe4e6"/>
    <!-- Flared Pinafore Skirt -->
    <path d="M205 295 L395 295 L465 565 Q300 595 135 565 Z" fill="url(#kidsDress)"/>
    <!-- Cute Ribbon Bow at Waist -->
    <path d="M265 295 L300 312 L265 330 Z" fill="#ffffff"/>
    <path d="M335 295 L300 312 L335 330 Z" fill="#ffffff"/>
    <circle cx="300" cy="312" r="9" fill="#ffe4e6"/>
    <!-- Polka dots on dress -->
    <circle cx="250" cy="400" r="8" fill="#ffffff" opacity="0.75"/>
    <circle cx="345" cy="390" r="8" fill="#ffffff" opacity="0.75"/>
    <circle cx="295" cy="465" r="8" fill="#ffffff" opacity="0.75"/>
    <circle cx="220" cy="505" r="8" fill="#ffffff" opacity="0.75"/>
    <circle cx="380" cy="500" r="8" fill="#ffffff" opacity="0.75"/>
  </g>
</svg>`);

const SVG_A06_KIDS_SET = `data:image/svg+xml;utf8,` + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">
  <defs>
    <linearGradient id="bgKids2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fef9c3"/>
      <stop offset="100%" stop-color="#fde68a"/>
    </linearGradient>
    <linearGradient id="kidsTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
    <linearGradient id="kidsShorts" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
    <filter id="shadowKids2" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#78350f" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="600" height="750" fill="url(#bgKids2)"/>
  <circle cx="490" cy="130" r="75" fill="#fcd34d" opacity="0.4"/>
  <g filter="url(#shadowKids2)">
    <!-- Kids T-Shirt -->
    <path d="M210 140 L390 140 L460 225 L420 285 L390 255 L395 430 L205 430 L210 255 L180 285 L140 225 Z" fill="url(#kidsTop)"/>
    <path d="M255 140 Q300 175 345 140" fill="none" stroke="#f59e0b" stroke-width="8" stroke-linecap="round"/>
    <!-- Cute Bear Badge on Chest -->
    <circle cx="275" cy="255" r="12" fill="#d97706"/>
    <circle cx="325" cy="255" r="12" fill="#d97706"/>
    <circle cx="300" cy="280" r="32" fill="#f59e0b"/>
    <circle cx="290" cy="274" r="4" fill="#0f172a"/>
    <circle cx="310" cy="274" r="4" fill="#0f172a"/>
    <ellipse cx="300" cy="286" rx="10" ry="7" fill="#fef3c7"/>
    <!-- Kids Denim Shorts -->
    <path d="M212 445 L388 445 L410 610 L312 610 L300 525 L288 610 L190 610 Z" fill="url(#kidsShorts)"/>
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
      khqrAccountNumber: '000474559',
      khqrBakongId: 'abaakhppxxx@abaa',
      khqrAccountInfo: '000 474 559 (ABA Bank • USD)',
      khqrImageUrl: '',
      abaPaymentLink: '',
      telegramNotifyChatId: '',
      adminPin: '1688',
      miniAppUrl: 'https://chatbotkh.com/miniapp',
      menuButtonText: '🛍️ ទិញទំនិញ',
      botUsername: '',
      fbPageId: '',
      fbPageName: '',
      fbPageAccessToken: '',
      fbVerifyToken: '1688',
      fbAutoReplyEnabled: true,
      fbButtonText: '🛍️ ចុចទិញទំនិញ',
      sizeGuide: [
        { size: 'Size S', weightRange: '40kg – 47kg', bustRange: '32" – 34"', note: 'រាងតូច / ស្លីម' },
        { size: 'Size M', weightRange: '48kg – 54kg', bustRange: '34" – 36"', note: 'ទំហំពេញនិយម' },
        { size: 'Size L', weightRange: '55kg – 62kg', bustRange: '36" – 38"', note: 'ពាក់ស្រួលខ្លួន' },
        { size: 'Size XL', weightRange: '63kg – 72kg', bustRange: '38" – 41"', note: 'រាងធំ / ទូលាយ' },
        { size: 'Free Size', weightRange: '42kg – 60kg', bustRange: '32" – 38"', note: 'សាច់យឺត ពាក់បានទូទៅ' }
      ]
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
        images: [SVG_A01_WHITE_TEE, SVG_A01_BLACK_TEE],
        variants: [
          { id: 'v-a01-1', color: 'ស', size: 'Size M', stock: 2 },
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
        images: [SVG_A02_KOREAN_DRESS, SVG_A03_BLAZER_SET],
        variants: [
          { id: 'v-a02-1', color: 'ស', size: 'Size S', stock: 1 },
          { id: 'v-a02-2', color: 'ស', size: 'Size M', stock: 1 }
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
        images: [SVG_A03_BLAZER_SET, SVG_A02_KOREAN_DRESS],
        variants: [
          { id: 'v-a03-1', color: 'គ្រីម (Beige)', size: 'Size M', stock: 2 },
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
        images: [SVG_A04_DENIM_SHIRT, SVG_A01_WHITE_TEE],
        variants: [
          { id: 'v-a04-1', color: 'ខៀវស្រាល', size: 'Free Size', stock: 2 }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'prod-a05',
        code: 'A05',
        name: 'រ៉ូបក្មេងស្រីម៉ូតកូរ៉េ បូរសាច់កប្បាសទន់',
        price: 5.50,
        originalPrice: 9.00,
        category: 'kids',
        imageUrl: SVG_A05_KIDS_DRESS,
        images: [SVG_A05_KIDS_DRESS, SVG_A06_KIDS_SET],
        variants: [
          { id: 'v-a05-1', color: 'ផ្កាឈូក', size: 'Size S', stock: 2 },
          { id: 'v-a05-2', color: 'ផ្កាឈូក', size: 'Size M', stock: 1 }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 'prod-a06',
        code: 'A06',
        name: 'ឈុតអាវយឺតរូបខ្លាឃ្មុំ + ខោខ្លីក្មេងប្រុស',
        price: 6.00,
        originalPrice: 9.50,
        category: 'kids',
        imageUrl: SVG_A06_KIDS_SET,
        images: [SVG_A06_KIDS_SET, SVG_A05_KIDS_DRESS],
        variants: [
          { id: 'v-a06-1', color: 'លឿង-ខៀវ', size: 'Size S', stock: 1 },
          { id: 'v-a06-2', color: 'លឿង-ខៀវ', size: 'Size M', stock: 2 }
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
    const payload = JSON.stringify(dbToSave, null, 2);
    fs.promises.writeFile(MINIAPP_STORE_PATH, payload, 'utf-8').catch(err => {
      console.error('[MiniApp DB] Failed to save miniapp_store.json:', err);
    });
    fs.promises.writeFile(EXTERNAL_MINIAPP_BACKUP_PATH, payload, 'utf-8').catch(() => {});
  }, 150);
}

function loadMiniAppDb(): MiniAppDatabase {
  try {
    let parsed: any = null;
    if (fs.existsSync(MINIAPP_STORE_PATH)) {
      try {
        parsed = JSON.parse(fs.readFileSync(MINIAPP_STORE_PATH, 'utf-8'));
      } catch {}
    }
    let extParsed: any = null;
    if (fs.existsSync(EXTERNAL_MINIAPP_BACKUP_PATH)) {
      try {
        extParsed = JSON.parse(fs.readFileSync(EXTERNAL_MINIAPP_BACKUP_PATH, 'utf-8'));
      } catch {}
    }

    if (!parsed && extParsed) {
      parsed = extParsed;
    } else if (parsed && extParsed) {
      // Merge products and orders from Git-immune backup so git pull never wipes custom products
      if (Array.isArray(extParsed.products) && extParsed.products.length > 0) {
        const currentProds: MiniAppProduct[] = Array.isArray(parsed.products) ? parsed.products : [];
        const byId = new Map<string, MiniAppProduct>();
        for (const p of currentProds) byId.set(p.id, p);
        for (const ep of extParsed.products) {
          if (ep && ep.id && !byId.has(ep.id)) {
            currentProds.push(ep);
          } else if (ep && ep.id && byId.has(ep.id)) {
            // Prefer external backup product if it has custom uploaded images or modified price
            byId.set(ep.id, ep);
          }
        }
        parsed.products = Array.from(byId.values());
      }
      if (Array.isArray(extParsed.orders) && extParsed.orders.length > (parsed.orders?.length || 0)) {
        parsed.orders = extParsed.orders;
      }
      if (extParsed.config) {
        const baseCfg = parsed.config || {};
        const extCfg = extParsed.config || {};
        const mergedCfg: Record<string, any> = { ...baseCfg, ...extCfg };
        // Never allow an empty string in either file to overwrite a non-empty token/setting in the other
        for (const key of Object.keys(mergedCfg)) {
          const bVal = baseCfg[key];
          const eVal = extCfg[key];
          if (typeof bVal === 'string' && bVal.trim() && (!eVal || (typeof eVal === 'string' && !eVal.trim()))) {
            mergedCfg[key] = bVal;
          } else if (typeof eVal === 'string' && eVal.trim()) {
            mergedCfg[key] = eVal;
          }
        }
        parsed.config = mergedCfg;
      }
    }

    if (parsed) {
      const defaults = getDefaultDatabase();
      const loadedProducts: MiniAppProduct[] = Array.isArray(parsed.products) ? parsed.products : defaults.products;
      let needsSave = false;

      for (const p of loadedProducts) {
        if (Array.isArray(p.variants)) {
          for (const v of p.variants) {
            if (v.color && v.color.includes('ครีม')) {
              v.color = v.color.replace('ครีม', 'គ្រីម');
              needsSave = true;
            }
          }
        }
        // Populate default multi-image gallery if missing on default items
        if (!Array.isArray(p.images) || p.images.length === 0) {
          const defProd = defaults.products.find(dp => dp.code === p.code);
          p.images = defProd?.images || (p.imageUrl ? [p.imageUrl] : []);
          needsSave = true;
        }
      }

      // Ensure kids products exist so the Kids tab is never empty by default
      const hasKidsProducts = loadedProducts.some(p => p.category === 'kids');
      if (!hasKidsProducts) {
        const defaultKids = defaults.products.filter(p => p.category === 'kids');
        for (const kp of defaultKids) {
          if (!loadedProducts.some(p => p.code === kp.code)) {
            loadedProducts.push(kp);
            needsSave = true;
          }
        }
      }

      const mergedConfig = { ...defaults.config, ...(parsed.config || {}) };
      if (mergedConfig.khqrImageUrl && mergedConfig.khqrImageUrl.includes('api.qrserver.com')) {
        mergedConfig.khqrImageUrl = '';
        needsSave = true;
      }

      const dbObj: MiniAppDatabase = {
        config: mergedConfig,
        products: loadedProducts,
        orders: Array.isArray(parsed.orders) ? parsed.orders : []
      };
      if (needsSave) {
        saveMiniAppDb(dbObj);
      }
      return dbObj;
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

// Helper: Resolve effective Facebook Page Access Token & Page ID from MiniApp config or main POS DB
function getEffectiveFbPageAuth(): { token: string; pageId: string; pageName: string } {
  let token = String(miniAppDb.config.fbPageAccessToken || '').trim();
  let pageId = String(miniAppDb.config.fbPageId || '').trim();
  let pageName = String(miniAppDb.config.fbPageName || '').trim();

  if (!token) {
    try {
      const connectedPages = getConnectedFacebookPages() || [];
      const matchedPage =
        (pageId ? connectedPages.find(p => String(p.id) === pageId && p.access_token) : undefined) ||
        connectedPages.find(p => p && p.access_token);
      if (matchedPage && matchedPage.access_token) {
        token = String(matchedPage.access_token).trim();
        pageId = String(matchedPage.id || pageId).trim();
        pageName = String(matchedPage.name || pageName).trim();
        // Auto-sync back into miniAppDb so it stays connected
        miniAppDb.config.fbPageAccessToken = token;
        if (pageId) miniAppDb.config.fbPageId = pageId;
        if (pageName) miniAppDb.config.fbPageName = pageName;
        saveMiniAppDb();
      }
    } catch {}
  }

  if (!token && (settings as any).fb_access_token) {
    token = String((settings as any).fb_access_token).trim();
  }

  return { token, pageId, pageName };
}

// Helper: Remember known Facebook Messenger customers (PSID <-> Name/Phone)
const fbKnownCustomers = new Map<string, { psid: string; name: string; phone?: string; updatedAt: number }>();

function recordKnownFbCustomer(psid?: string, name?: string, phone?: string) {
  const cleanPsid = String(psid || '').trim();
  if (!cleanPsid) return;
  const cleanName = String(name || '').trim();
  const cleanPhone = String(phone || '').replace(/\s+/g, '').trim();
  fbKnownCustomers.set(cleanPsid, {
    psid: cleanPsid,
    name: cleanName || fbKnownCustomers.get(cleanPsid)?.name || '',
    phone: cleanPhone || fbKnownCustomers.get(cleanPsid)?.phone,
    updatedAt: Date.now()
  });
}

// Helper: Resolve a customer's Facebook Messenger PSID even if opened via Persistent Menu or browser without ?psid=
async function resolveCustomerFbPsid(opts: {
  explicitPsid?: string;
  customerName?: string;
  phone?: string;
  channel?: string;
  fbToken?: string;
  fbPageId?: string;
}): Promise<string> {
  const explicit = String(opts.explicitPsid || '').trim();
  if (explicit) {
    recordKnownFbCustomer(explicit, opts.customerName, opts.phone);
    return explicit;
  }

  const cleanPhone = String(opts.phone || '').replace(/\s+/g, '').trim();
  const cleanName = String(opts.customerName || '').trim().toLowerCase();
  const isDefaultPlaceholderName =
    !cleanName ||
    cleanName === 'អតិថិជន telegram' ||
    cleanName === 'អតិថិជន facebook page' ||
    cleanName === 'អតិថិជន facebook' ||
    cleanName === 'អតិថិជន';

  // 1. Check previous orders in miniAppDb.orders by phone or customerName
  for (const ord of miniAppDb.orders) {
    const ordPsid = String(ord.fbPsid || '').trim();
    if (!ordPsid) continue;
    const ordPhone = String(ord.phone || '').replace(/\s+/g, '').trim();
    const ordName = String(ord.customerName || '').trim().toLowerCase();
    if (cleanPhone.length >= 6 && ordPhone === cleanPhone) {
      recordKnownFbCustomer(ordPsid, opts.customerName, opts.phone);
      return ordPsid;
    }
    if (!isDefaultPlaceholderName && ordName && ordName === cleanName) {
      recordKnownFbCustomer(ordPsid, opts.customerName, opts.phone);
      return ordPsid;
    }
  }

  // 2. Check in-memory fbKnownCustomers directory by phone or name
  for (const entry of fbKnownCustomers.values()) {
    if (cleanPhone.length >= 6 && entry.phone && entry.phone === cleanPhone) {
      return entry.psid;
    }
    if (!isDefaultPlaceholderName && entry.name && entry.name.toLowerCase() === cleanName) {
      return entry.psid;
    }
  }

  // 3. Query Facebook Page recent conversations via Graph API if fbToken is available
  const token = String(opts.fbToken || '').trim();
  const pageId = String(opts.fbPageId || '').trim();
  if (token) {
    try {
      const convRes = await fetch(
        `https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time&limit=10&access_token=${encodeURIComponent(token)}`
      );
      if (convRes.ok) {
        const convData = await convRes.json();
        const conversations = Array.isArray(convData?.data) ? convData.data : [];
        let mostRecentPsid = '';

        for (const conv of conversations) {
          const participants = conv?.participants?.data || [];
          const cust = participants.find((p: any) => String(p?.id || '') !== pageId);
          if (!cust?.id) continue;
          const cPsid = String(cust.id).trim();
          const cName = String(cust.name || '').trim();
          recordKnownFbCustomer(cPsid, cName);

          if (!mostRecentPsid) {
            mostRecentPsid = cPsid;
          }

          if (!isDefaultPlaceholderName && cName) {
            const cLower = cName.toLowerCase();
            if (cLower === cleanName || cLower.includes(cleanName) || cleanName.includes(cLower)) {
              recordKnownFbCustomer(cPsid, opts.customerName, opts.phone);
              return cPsid;
            }
          }
        }

        // If opened from Facebook Messenger (e.g., Persistent Menu where ?source=fb has no psid in URL),
        // or if the user is testing on their Page with an active recent conversation, use mostRecentPsid
        if (mostRecentPsid && (opts.channel === 'FACEBOOK' || !isDefaultPlaceholderName)) {
          return mostRecentPsid;
        }
      }
    } catch {}
  }

  return '';
}

// ---------------------------------------------------------------------------
// 1. PUBLIC CATALOG ENDPOINT (Ultra-fast 0ms in-memory response)
// ---------------------------------------------------------------------------
router.get('/catalog', (_req: Request, res: Response) => {
  const cleanKhqrImg =
    miniAppDb.config.khqrImageUrl && !miniAppDb.config.khqrImageUrl.includes('api.qrserver.com')
      ? miniAppDb.config.khqrImageUrl
      : '';
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
      khqrMerchantName: miniAppDb.config.khqrMerchantName || settings.merchant_name || 'KARI ARNETT SHOP',
      khqrAccountNumber: miniAppDb.config.khqrAccountNumber || settings.account_number || '000474559',
      khqrBakongId: miniAppDb.config.khqrBakongId || settings.bakong_id || 'abaakhppxxx@abaa',
      khqrAccountInfo: miniAppDb.config.khqrAccountInfo || `${miniAppDb.config.khqrAccountNumber || settings.account_number || '000474559'} (ABA Bank)`,
      khqrImageUrl: cleanKhqrImg,
      khqrRawString: miniAppDb.config.khqrRawString || (settings as any).khqr_orig_string || '',
      abaPaymentLink: miniAppDb.config.abaPaymentLink || '',
      botUsername: miniAppDb.config.botUsername || '',
      fbPageId: miniAppDb.config.fbPageId || '',
      fbPageName: miniAppDb.config.fbPageName || '',
      sizeGuide: Array.isArray(miniAppDb.config.sizeGuide) && miniAppDb.config.sizeGuide.length > 0
        ? miniAppDb.config.sizeGuide
        : getDefaultDatabase().config.sizeGuide
    },
    products: miniAppDb.products
  });
});

// ---------------------------------------------------------------------------
// 1B. CUSTOMER LIVE ORDER STATUS LOOKUP (By Order IDs or Phone Number)
// ---------------------------------------------------------------------------
router.get('/orders/lookup', (req: Request, res: Response) => {
  const idsParam = String(req.query.ids || '').trim();
  const phoneParam = String(req.query.phone || '').replace(/\s+/g, '').trim();

  const idSet = new Set(
    idsParam
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
  );

  const matched = miniAppDb.orders.filter(o => {
    if (idSet.has(o.id.toUpperCase())) return true;
    if (phoneParam.length >= 6) {
      const cleanOrderPhone = String(o.phone || '').replace(/\s+/g, '');
      if (cleanOrderPhone.includes(phoneParam) || phoneParam.includes(cleanOrderPhone)) {
        return true;
      }
    }
    return false;
  });

  res.json({
    success: true,
    orders: matched.slice(0, 25)
  });
});

// ---------------------------------------------------------------------------
// 2. UPLOAD IMAGE (Supports both single-request and 600KB chunked Ultra-HD uploads)
// ---------------------------------------------------------------------------
const pendingUploadChunks = new Map<string, { chunks: string[]; totalChunks: number; createdAt: number }>();

router.post('/upload', async (req: Request, res: Response) => {
  try {
    const { imageBase64, uploadId, chunkIndex, totalChunks, chunkData } = req.body || {};

    let fullBase64 = '';

    // Handle chunked upload for large Ultra-HD images (> 650KB) so Nginx 1MB limit never triggers
    if (uploadId && typeof chunkIndex === 'number' && typeof totalChunks === 'number' && typeof chunkData === 'string') {
      const now = Date.now();
      for (const [k, v] of pendingUploadChunks.entries()) {
        if (now - v.createdAt > 5 * 60 * 1000) pendingUploadChunks.delete(k);
      }

      let entry = pendingUploadChunks.get(uploadId);
      if (!entry) {
        entry = { chunks: new Array(totalChunks).fill(''), totalChunks, createdAt: now };
        pendingUploadChunks.set(uploadId, entry);
      }
      entry.chunks[chunkIndex] = chunkData;

      const isComplete = entry.chunks.every(c => c.length > 0);
      if (!isComplete) {
        return res.json({ success: true, partial: true, chunkIndex });
      }

      fullBase64 = entry.chunks.join('');
      pendingUploadChunks.delete(uploadId);
    } else if (imageBase64 && typeof imageBase64 === 'string') {
      fullBase64 = imageBase64;
    } else {
      return res.status(400).json({ success: false, error: 'Missing imageBase64' });
    }

    let extType = 'jpeg';
    let rawBase64 = fullBase64.trim();
    const base64MarkerIdx = rawBase64.indexOf(';base64,');
    if (base64MarkerIdx !== -1) {
      const header = rawBase64.slice(0, base64MarkerIdx).toLowerCase();
      if (header.includes('png')) extType = 'png';
      else if (header.includes('webp')) extType = 'webp';
      rawBase64 = rawBase64.slice(base64MarkerIdx + 8);
    }

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
      channel,
      fbPsid,
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
    const { token: fbToken, pageId: fbPageId } = getEffectiveFbPageAuth();
    const resolvedFbPsid = await resolveCustomerFbPsid({
      explicitPsid: fbPsid ? String(fbPsid).trim() : '',
      customerName: customerName ? String(customerName).trim() : '',
      phone: String(phone).trim(),
      channel: channel ? String(channel).trim() : '',
      fbToken,
      fbPageId
    });

    const resolvedChannel: 'TELEGRAM' | 'FACEBOOK' | 'WEB' =
      channel === 'FACEBOOK' || resolvedFbPsid
        ? 'FACEBOOK'
        : telegramUserId || telegramUsername
        ? 'TELEGRAM'
        : 'WEB';
    const orderPrefix = resolvedChannel === 'FACEBOOK' ? 'FB' : 'TG';
    const newOrder: MiniAppOrder = {
      id: `${orderPrefix}-${orderNum}`,
      createdAt: new Date().toISOString(),
      customerName: String(
        customerName || (resolvedChannel === 'FACEBOOK' ? 'អតិថិជន Facebook Page' : 'អតិថិជន Telegram')
      ).trim(),
      telegramUsername: telegramUsername ? String(telegramUsername).trim() : undefined,
      telegramUserId: telegramUserId ? String(telegramUserId).trim() : undefined,
      channel: resolvedChannel,
      fbPsid: resolvedFbPsid || undefined,
      phone: String(phone).trim(),
      address: String(address).trim(),
      zone: normalizedZone,
      deliveryCompany: String(deliveryCompany || (normalizedZone === 'PP' ? 'ដឹកក្នុងក្រុងភ្នំពេញ' : 'វីរៈប៊ុនថាំ (VET)')).trim(),
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

    // 3. Fire Telegram Notification to Shop Owner / Group AND Customer's Telegram Chat (if ordered via Telegram)
    const botToken = (miniAppDb.config.telegramBotToken || settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const targetChatId = (miniAppDb.config.telegramNotifyChatId || settings.telegram_chat_id || '').trim();
    const payLabel = newOrder.paymentMethod === 'KHQR'
      ? (newOrder.paymentSlipUrl ? '💳 ស្កេនបង់ប្រាក់រួច (KHQR + មានស្លីប)' : '💳 ស្កេនបង់ប្រាក់ (KHQR)')
      : '🚚 បង់ប្រាក់ពេលអីវ៉ាន់ទៅដល់ (COD)';

    if (botToken && targetChatId) {
      const itemsLines = confirmedItems
        .map((it, idx) => `${idx + 1}. <b>[${it.code}]</b> ${it.name}\n   ↳ ${it.color} - ${it.size} x${it.qty} = <b>$${(it.price * it.qty).toFixed(2)}</b>`)
        .join('\n');

      const sourceTitle =
        newOrder.channel === 'FACEBOOK'
          ? `📘 <b>អর্ডারថ្មីពី Facebook Page Messenger! (#${newOrder.id})</b>`
          : `🛍️ <b>អর্ডারថ្មីពី Telegram Mini App! (#${newOrder.id})</b>`;

      const tgMessage = [
        sourceTitle,
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

    // 3B. If customer ordered inside Telegram Mini App (has telegramUserId), send Order Receipt directly to their Telegram chat!
    if (botToken && newOrder.telegramUserId && String(newOrder.telegramUserId) !== String(targetChatId)) {
      const tgReceiptLines = [
        `🎉 <b>អរគុណសម្រាប់ការកម្ម៉ង់ទិញពី ${miniAppDb.config.storeName}!</b>`,
        `🧾 លេខវិក្កយបត្រ៖ <b>#${newOrder.id}</b>`,
        `━━━━━━━━━━━━━━━━`,
        ...confirmedItems.map(
          (it, idx) => `${idx + 1}. <b>[${it.code}]</b> ${it.name} (${it.color} - ${it.size}) x${it.qty} = <b>$${(it.price * it.qty).toFixed(2)}</b>`
        ),
        `━━━━━━━━━━━━━━━━`,
        `🚚 ថ្លៃដឹក៖ <b>$${newOrder.shippingFee.toFixed(2)}</b> (${newOrder.deliveryCompany})`,
        `💵 សរុបរួម៖ <b>$${newOrder.totalAmount.toFixed(2)}</b>`,
        `💰 ការទូទាត់៖ <b>${payLabel}</b>`,
        `📞 ទូរស័ព្ទ៖ <b>${newOrder.phone}</b>`,
        `📍 ទីតាំង៖ <b>${newOrder.address}</b>`,
        `✅ ក្រុមការងារហាងយើងខ្ញុំបានទទួលការកម្ម៉ង់របស់បងហើយ និងកំពុងរៀបចំវេចខ្ចប់ជូនបង! 🙏✨`
      ].join('\n');

      sendTelegramMessage(botToken, newOrder.telegramUserId, tgReceiptLines).catch(() => {});
    }

    // 4. If customer ordered from Facebook Messenger (or resolved fbPsid) and Page Token is available,
    // automatically send an Order Receipt confirmation message back into their Facebook Messenger chat!
    let sentToFbChat = false;
    if (fbToken && newOrder.fbPsid) {
      const receiptLines = [
        `🎉 អរគុណសម្រាប់ការកម្ម៉ង់ទិញពី ${miniAppDb.config.storeName}!`,
        `🧾 លេខវិក្កយបត្រ៖ #${newOrder.id}`,
        `━━━━━━━━━━━━━━━━`,
        ...confirmedItems.map(
          (it, idx) => `${idx + 1}. [${it.code}] ${it.name} (${it.color} - ${it.size}) x${it.qty} = $${(it.price * it.qty).toFixed(2)}`
        ),
        `━━━━━━━━━━━━━━━━`,
        `🚚 ថ្លៃដឹក៖ $${newOrder.shippingFee.toFixed(2)} (${newOrder.deliveryCompany})`,
        `💵 សរុបរួម៖ $${newOrder.totalAmount.toFixed(2)}`,
        `📞 ទូរស័ព្ទ៖ ${newOrder.phone}`,
        `📍 ទីតាំង៖ ${newOrder.address}`,
        `✅ ក្រុមការងារហាងយើងខ្ញុំបានទទួលការកម្ម៉ង់របស់បងហើយ និងកំពុងរៀបចំវេចខ្ចប់ជូនបង! 🙏✨`
      ].join('\n');

      try {
        const fbRes = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(fbToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: newOrder.fbPsid },
            messaging_type: 'RESPONSE',
            message: { text: receiptLines }
          })
        });
        if (fbRes.ok) {
          sentToFbChat = true;
        } else {
          // Fallback to UPDATE messaging_type
          const retryRes = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(fbToken)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: newOrder.fbPsid },
              messaging_type: 'UPDATE',
              message: { text: receiptLines }
            })
          });
          if (retryRes.ok) sentToFbChat = true;
        }
      } catch (fbErr) {
        console.error('[MiniApp FB Receipt Error]:', fbErr);
      }
    }

    return res.json({
      success: true,
      order: newOrder,
      sentToFbChat,
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
  const connectedFbPages = (getConnectedFacebookPages() || []).map(p => ({
    id: p.id,
    name: p.name,
    access_token: p.access_token
  }));
  res.json({
    success: true,
    config: miniAppDb.config,
    products: miniAppDb.products,
    orders: miniAppDb.orders,
    connectedFbPages
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
    khqrAccountNumber: incoming.khqrAccountNumber !== undefined ? String(incoming.khqrAccountNumber).replace(/\s+/g, '') : (miniAppDb.config.khqrAccountNumber || settings.account_number || '000474559'),
    khqrBakongId: incoming.khqrBakongId !== undefined ? String(incoming.khqrBakongId).trim() : (miniAppDb.config.khqrBakongId || settings.bakong_id || 'abaakhppxxx@abaa'),
    khqrAccountInfo: incoming.khqrAccountInfo ?? miniAppDb.config.khqrAccountInfo,
    khqrImageUrl: incoming.khqrImageUrl ?? miniAppDb.config.khqrImageUrl,
    khqrRawString: incoming.khqrRawString !== undefined ? String(incoming.khqrRawString) : miniAppDb.config.khqrRawString,
    abaPaymentLink: incoming.abaPaymentLink !== undefined ? String(incoming.abaPaymentLink).trim() : miniAppDb.config.abaPaymentLink,
    telegramNotifyChatId:
      incoming.telegramNotifyChatId && String(incoming.telegramNotifyChatId).trim()
        ? String(incoming.telegramNotifyChatId).trim()
        : miniAppDb.config.telegramNotifyChatId,
    telegramBotToken:
      incoming.telegramBotToken && String(incoming.telegramBotToken).trim()
        ? String(incoming.telegramBotToken).trim()
        : miniAppDb.config.telegramBotToken,
    adminPin: incoming.adminPin ? String(incoming.adminPin).trim() : miniAppDb.config.adminPin,
    miniAppUrl: incoming.miniAppUrl ? String(incoming.miniAppUrl).trim() : miniAppDb.config.miniAppUrl,
    menuButtonText: incoming.menuButtonText ? String(incoming.menuButtonText).trim() : miniAppDb.config.menuButtonText,
    botUsername:
      incoming.botUsername && String(incoming.botUsername).trim()
        ? String(incoming.botUsername).trim()
        : miniAppDb.config.botUsername,
    fbPageId:
      incoming.fbPageId && String(incoming.fbPageId).trim()
        ? String(incoming.fbPageId).trim()
        : miniAppDb.config.fbPageId,
    fbPageName:
      incoming.fbPageName && String(incoming.fbPageName).trim()
        ? String(incoming.fbPageName).trim()
        : miniAppDb.config.fbPageName,
    fbPageAccessToken:
      incoming.fbPageAccessToken && String(incoming.fbPageAccessToken).trim()
        ? String(incoming.fbPageAccessToken).trim()
        : miniAppDb.config.fbPageAccessToken,
    fbVerifyToken: incoming.fbVerifyToken !== undefined ? String(incoming.fbVerifyToken).trim() : (miniAppDb.config.fbVerifyToken || '1688'),
    fbAutoReplyEnabled: incoming.fbAutoReplyEnabled !== undefined ? Boolean(incoming.fbAutoReplyEnabled) : (miniAppDb.config.fbAutoReplyEnabled ?? true),
    fbButtonText: incoming.fbButtonText ? String(incoming.fbButtonText).trim() : (miniAppDb.config.fbButtonText || '🛍️ ចុចទិញទំនិញ'),
    sizeGuide: Array.isArray(incoming.sizeGuide) && incoming.sizeGuide.length > 0
      ? incoming.sizeGuide.map((row: any) => ({
          size: String(row.size || '').trim(),
          weightRange: String(row.weightRange || '').trim(),
          bustRange: String(row.bustRange || '').trim(),
          note: String(row.note || '').trim()
        }))
      : miniAppDb.config.sizeGuide
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

function persistBase64ImageIfNeeded(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  // Keep lightweight inline SVG illustrations as-is
  if (trimmed.startsWith('data:image/svg+xml')) {
    return trimmed;
  }
  try {
    const base64MarkerIdx = trimmed.indexOf(';base64,');
    if (base64MarkerIdx === -1) return trimmed;
    const header = trimmed.slice(0, base64MarkerIdx).toLowerCase();
    const rawBase64 = trimmed.slice(base64MarkerIdx + 8);
    const finalBuffer = Buffer.from(rawBase64, 'base64');
    const finalExt = header.includes('png') ? 'png' : header.includes('webp') ? 'webp' : 'jpg';
    const fileName = `miniapp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${finalExt}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, finalBuffer);

    const distUploads = path.join(process.cwd(), 'dist', 'uploads');
    if (fs.existsSync(distUploads)) {
      try {
        fs.writeFileSync(path.join(distUploads, fileName), finalBuffer);
      } catch {}
    }
    return `/uploads/${fileName}`;
  } catch (err) {
    console.error('[MiniApp] Failed to persist inline base64 image:', err);
    return trimmed;
  }
}

router.post('/admin/products', (req: Request, res: Response) => {
  try {
    const { id, code, name, price, originalPrice, category, imageUrl, images, variants } = req.body;
    if (!code || !name) {
      return res.status(400).json({ success: false, error: 'សូមបញ្ចូលកូដ និងឈ្មោះម៉ូតខោអាវ' });
    }

    const rawImages: string[] = Array.isArray(images)
      ? images.map((u: any) => String(u || '').trim()).filter(Boolean)
      : imageUrl
      ? [String(imageUrl).trim()]
      : [];

    const normalizedImages: string[] = rawImages.map(u => persistBase64ImageIfNeeded(u)).filter(Boolean);
    const sanitizedPrimaryUrl = imageUrl ? persistBase64ImageIfNeeded(String(imageUrl)) : '';

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
      const fallbackImg = miniAppDb.products[existingIndex].imageUrl || SVG_A01_WHITE_TEE;
      const primaryImg = normalizedImages[0] || sanitizedPrimaryUrl || fallbackImg;
      const finalImages = normalizedImages.length > 0 ? normalizedImages : [primaryImg];

      miniAppDb.products[existingIndex] = {
        ...miniAppDb.products[existingIndex],
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        price: Number(price) || 0,
        originalPrice: Number(originalPrice) || Number(price) || 0,
        category: ['women', 'men', 'kids', 'unisex'].includes(category) ? category : 'women',
        imageUrl: primaryImg,
        images: finalImages,
        variants: normalizedVariants
      };
    } else {
      const primaryImg = normalizedImages[0] || sanitizedPrimaryUrl || SVG_A02_KOREAN_DRESS;
      const finalImages = normalizedImages.length > 0 ? normalizedImages : [primaryImg];

      const newProd: MiniAppProduct = {
        id: `prod-${Date.now()}`,
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        price: Number(price) || 0,
        originalPrice: Number(originalPrice) || Number(price) || 0,
        category: ['women', 'men', 'kids', 'unisex'].includes(category) ? category : 'women',
        imageUrl: primaryImg,
        images: finalImages,
        variants: normalizedVariants,
        createdAt: new Date().toISOString()
      };
      miniAppDb.products.unshift(newProd);
    }

    saveMiniAppDb();
    res.json({ success: true, products: miniAppDb.products });
  } catch (err: any) {
    console.error('[MiniApp Save Product Error]:', err);
    res.status(500).json({ success: false, error: err?.message || 'មិនអាចរក្សាទុកម៉ូតខោអាវបានទេ' });
  }
});

router.delete('/admin/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  miniAppDb.products = miniAppDb.products.filter(p => p.id !== id);
  saveMiniAppDb();
  res.json({ success: true, products: miniAppDb.products });
});

router.post('/admin/products/:id/restock', (req: Request, res: Response) => {
  const { id } = req.params;
  const prod = miniAppDb.products.find(p => p.id === id);
  if (!prod) {
    return res.status(404).json({ success: false, error: 'រកមិនឃើញម៉ូតនេះទេ' });
  }
  for (const v of prod.variants) {
    v.stock = Math.max(1, v.stock + 1);
  }
  saveMiniAppDb();
  res.json({ success: true, products: miniAppDb.products });
});

router.patch('/admin/orders/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, trackingInfo } = req.body || {};
  const order = miniAppDb.orders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'រកមិនឃើញវិក្កយបត្រនេះទេ' });
  }

  const prevStatus = order.status;
  const nextStatus = (status || order.status) as MiniAppOrder['status'];

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
  if (trackingInfo !== undefined) {
    order.trackingInfo = String(trackingInfo).trim() || undefined;
  }
  saveMiniAppDb();

  // Auto-notify customer via Telegram or Facebook Messenger when status changes
  let notifiedCustomer = false;
  const itemsSummary = order.items
    .map(it => `• [${it.code}] ${it.name} (${it.color} - ${it.size}) x${it.qty}`)
    .join('\n');

  let statusHeadline = '';
  let statusFooter = '';
  if (nextStatus === 'CONFIRMED') {
    statusHeadline = `✅ ហាង ${miniAppDb.config.storeName} បានទទួលការកម្ម៉ង់ #${order.id} របស់បងហើយ!`;
    statusFooter = `📦 ក្រុមការងារកំពុងរៀបចំវេចខ្ចប់ជូនបង។ អរគុណសម្រាប់ការគាំទ្រ! 🙏✨`;
  } else if (nextStatus === 'SHIPPED') {
    statusHeadline = `🚚 អីវ៉ាន់របស់បង (#${order.id}) បានដាក់ផ្ញើចេញហើយ!`;
    statusFooter = [
      `🏢 ដឹកជញ្ជូនតាម៖ ${order.deliveryCompany} (${order.zone === 'PP' ? 'ភ្នំពេញ' : 'ខេត្ត'})`,
      order.trackingInfo ? `🔖 លេខកូដដឹកជញ្ជូន / តៃកុង៖ ${order.trackingInfo}` : '',
      `📞 សូមបងត្រៀមទទួលទូរស័ព្ទពីអ្នកដឹកជញ្ជូនណាបង! 🙏✨`
    ].filter(Boolean).join('\n');
  } else if (nextStatus === 'CANCELLED') {
    statusHeadline = `❌ ការកម្ម៉ង់ #${order.id} ត្រូវបានបោះបង់`;
    statusFooter = `ប្រសិនបើមានចម្ងល់ សូមឆាតទាក់ទងមកកាន់ហាងយើងខ្ញុំផ្ទាល់។`;
  }

  if (statusHeadline) {
    const fullCustomerMsg = [
      statusHeadline,
      `━━━━━━━━━━━━━━━━`,
      itemsSummary,
      `💵 សរុបរួម៖ $${order.totalAmount.toFixed(2)} (${order.paymentMethod === 'KHQR' ? 'បង់តាម KHQR' : 'បង់ពេលដឹកដល់ COD'})`,
      `📍 ទីតាំង៖ ${order.address}`,
      `━━━━━━━━━━━━━━━━`,
      statusFooter
    ].join('\n');

    // 1. Send to Telegram customer if telegramUserId is present
    const botToken = (miniAppDb.config.telegramBotToken || settings.telegram_token || '').trim();
    if (botToken && order.telegramUserId) {
      try {
        await sendTelegramMessage(botToken, order.telegramUserId, fullCustomerMsg);
        notifiedCustomer = true;
      } catch {}
    }

    // 2. Send to Facebook Messenger customer if fbPsid is present or can be resolved
    const { token: fbToken, pageId: fbPageId } = getEffectiveFbPageAuth();
    const targetFbPsid = await resolveCustomerFbPsid({
      explicitPsid: order.fbPsid,
      customerName: order.customerName,
      phone: order.phone,
      channel: order.channel,
      fbToken,
      fbPageId
    });
    if (targetFbPsid && !order.fbPsid) {
      order.fbPsid = targetFbPsid;
      saveMiniAppDb();
    }
    if (fbToken && targetFbPsid) {
      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(fbToken)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: targetFbPsid },
              messaging_type: 'UPDATE',
              message: { text: fullCustomerMsg }
            })
          }
        );
        if (!fbRes.ok) {
          // Fallback to RESPONSE messaging_type within 24h window
          const retryRes = await fetch(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(fbToken)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: { id: targetFbPsid },
                messaging_type: 'RESPONSE',
                message: { text: fullCustomerMsg }
              })
            }
          );
          if (retryRes.ok) notifiedCustomer = true;
        } else {
          notifiedCustomer = true;
        }
      } catch {}
    }
  }

  res.json({
    success: true,
    notifiedCustomer,
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
        if (lower.startsWith('/start ask_')) {
          const askedCode = text.slice('/start ask_'.length).trim().toUpperCase();
          const matchedProd = miniAppDb.products.find(p => p.code.toUpperCase() === askedCode);
          const cleanUrl = (miniAppDb.config.miniAppUrl || 'https://chatbotkh.com/miniapp').trim();
          const btnText = (miniAppDb.config.menuButtonText || '🛍️ បើកហាងទិញទំនិញ').trim();
          const replyMarkup = {
            inline_keyboard: [[{ text: `${btnText} (កូដ ${askedCode})`, web_app: { url: `${cleanUrl}?code=${encodeURIComponent(askedCode)}` } }]]
          };

          const prodInfoText = matchedProd
            ? [
                `💬 <b>បងកំពុងសាកសួរអំពីម៉ូតកូដ [${matchedProd.code}] — ${matchedProd.name}</b>`,
                `💵 តម្លៃពិសេស៖ <b>$${matchedProd.price.toFixed(2)}</b>`,
                `🎨 ពណ៌ និងទំហំក្នុងស្តុក៖ ${matchedProd.variants.map(v => `${v.color}-${v.size}(សល់ ${v.stock})`).join(', ')}`,
                `━━━━━━━━━━━━━━━━━━━━`,
                `✍️ សូមបងវាយសំណួររបស់បងនៅទីនេះ (ឧ. សួរពីសាច់ក្រណាត់ ឬទំហំគីឡូ) ម្ចាស់ហាងនឹងឆ្លើយតបជូនបងភ្លាមៗ! 👇`
              ].join('\n')
            : `💬 សូមបងវាយសំណួរអំពីម៉ូតកូដ <b>${askedCode}</b> នៅទីនេះ ម្ចាស់ហាងនឹងឆ្លើយតបជូនបងភ្លាមៗ!`;

          sendTelegramMessage(dedicatedToken, chatId, prodInfoText, msg.message_id, undefined, replyMarkup).catch(() => {});

          const targetGroupChatId = (miniAppDb.config.telegramNotifyChatId || settings.telegram_chat_id || '').trim();
          if (targetGroupChatId && String(targetGroupChatId) !== String(chatId)) {
            const custLabel = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'អតិថិជន';
            const userHandle = msg.from?.username ? `(@${msg.from.username})` : '';
            const adminAlert = `💬 <b>ភ្ញៀវសួរពីម៉ូតខោអាវ!</b>\n👤 អតិថិជន៖ <b>${custLabel}</b> ${userHandle}\n👗 ម៉ូតកូដ៖ <b>[${askedCode}] ${matchedProd?.name || ''}</b>`;
            sendTelegramMessage(dedicatedToken, targetGroupChatId, adminAlert).catch(() => {});
          }
          continue;
        }

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

// ---------------------------------------------------------------------------
// 6. FACEBOOK PAGE MESSENGER SHOP INTEGRATION (Method 1 & Method 2)
// ---------------------------------------------------------------------------
function buildFbMessengerShopUrl(baseMiniAppUrl: string, psid?: string, customerName?: string): string {
  const cleanBase = (baseMiniAppUrl || miniAppDb.config.miniAppUrl || 'https://chatbotkh.com/miniapp').trim();
  const sep = cleanBase.includes('?') ? '&' : '?';
  const params = new URLSearchParams();
  params.set('source', 'fb');
  if (psid) params.set('psid', psid);
  if (customerName) params.set('cname', customerName);
  return `${cleanBase}${sep}${params.toString()}`;
}

export async function sendFacebookShopCard(
  pageAccessToken: string,
  recipientPsid: string,
  customerName?: string
): Promise<{ ok: boolean; error?: string }> {
  const token = String(pageAccessToken || '').trim();
  if (!token || !recipientPsid) {
    return { ok: false, error: 'Missing Page Access Token or Recipient PSID' };
  }

  const shopUrl = buildFbMessengerShopUrl(
    miniAppDb.config.miniAppUrl || 'https://chatbotkh.com/miniapp',
    recipientPsid,
    customerName
  );
  const btnTitle = String(miniAppDb.config.fbButtonText || '🛍️ ចុចទិញទំនិញ').trim().slice(0, 20);
  const storeTitle = `🛍️ ${miniAppDb.config.storeName}`;
  const cardText = [
    `សួស្តី${customerName ? `បង ${customerName}` : ''}! 🙏✨ សូមស្វាគមន៍មកកាន់ ${miniAppDb.config.storeName}`,
    `${miniAppDb.config.storeSubtitle}`,
    `🔥 ${miniAppDb.config.promoBannerText}`,
    `👇 សូមចុចប៊ូតុងខាងក្រោមដើម្បីមើលម៉ូត រើសពណ៌ រើស Size និងកម្ម៉ង់ទិញភ្លាមៗ៖`
  ].join('\n');

  // 1. Try sending Interactive Messenger Button Template (Displays text + clickable Webview Button inside Messenger!)
  try {
    const btnTemplateRes = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientPsid },
          messaging_type: 'RESPONSE',
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'button',
                text: cardText.slice(0, 600),
                buttons: [
                  {
                    type: 'web_url',
                    url: shopUrl,
                    title: btnTitle,
                    webview_height_ratio: 'full'
                  }
                ]
              }
            }
          }
        })
      }
    );
    const btnTemplateData = await btnTemplateRes.json();
    if (btnTemplateRes.ok && !btnTemplateData.error) {
      return { ok: true };
    }

    // 2. Fallback to Generic Template Card
    const genericRes = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientPsid },
          messaging_type: 'RESPONSE',
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'generic',
                elements: [
                  {
                    title: storeTitle.slice(0, 80),
                    subtitle: `${miniAppDb.config.storeSubtitle} - ${miniAppDb.config.promoBannerText}`.slice(0, 80),
                    default_action: {
                      type: 'web_url',
                      url: shopUrl,
                      webview_height_ratio: 'full'
                    },
                    buttons: [
                      {
                        type: 'web_url',
                        url: shopUrl,
                        title: btnTitle,
                        webview_height_ratio: 'full'
                      }
                    ]
                  }
                ]
              }
            }
          }
        })
      }
    );
    const genericData = await genericRes.json();
    if (genericRes.ok && !genericData.error) {
      return { ok: true };
    }

    // 3. Final fallback: Standard text message with clickable shop link
    const textRes = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientPsid },
          messaging_type: 'RESPONSE',
          message: {
            text: `${cardText}\n\n🛒 ${btnTitle}៖\n${shopUrl}`
          }
        })
      }
    );
    const textData = await textRes.json();
    if (textRes.ok && !textData.error) {
      return { ok: true };
    }
    return {
      ok: false,
      error: textData?.error?.message || btnTemplateData?.error?.message || 'Facebook Send API error'
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error calling Facebook Send API' };
  }
}

// 1-Click Setup Facebook Page Messenger Shop (Persistent Menu + Ice Breakers + Auto-Reply)
router.post('/admin/setup-fb-page', async (req: Request, res: Response) => {
  try {
    const { fbPageAccessToken, miniAppUrl, fbButtonText, fbAutoReplyEnabled, fbVerifyToken } = req.body || {};
    const activeToken = String(fbPageAccessToken || miniAppDb.config.fbPageAccessToken || '').trim();

    if (!activeToken) {
      return res.status(400).json({
        success: false,
        error: 'សូមបញ្ចូល ឬជ្រើសរើស Facebook Page Access Token ជាមុនសិន'
      });
    }

    const cleanUrl = String(miniAppUrl || miniAppDb.config.miniAppUrl || 'https://chatbotkh.com/miniapp').trim();
    if (!cleanUrl.startsWith('https://')) {
      return res.status(400).json({
        success: false,
        error: 'Link សម្រាប់ហាង Mini App ត្រូវតែផ្តើមដោយ https://'
      });
    }

    const cleanBtnText = String(fbButtonText || miniAppDb.config.fbButtonText || '🛍️ ចុចទិញទំនិញ').trim().slice(0, 20);

    // 1. Verify Page Access Token via Graph API /me
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(activeToken)}`
    );
    const meData = await meRes.json();
    if (!meRes.ok || meData.error || !meData.id) {
      return res.status(400).json({
        success: false,
        error: `Page Access Token មិនត្រឹមត្រូវទេ៖ ${meData?.error?.message || 'Invalid token'}`
      });
    }

    const pageId = String(meData.id);
    const pageName = String(meData.name || 'Facebook Page');
    const fbShopUrl = buildFbMessengerShopUrl(cleanUrl);

    // 2. Configure Messenger Profile (Get Started + Persistent Menu Web URL button + Ice Breakers)
    let profileNote = 'បានដាក់ប៊ូតុងហាងក្នុង Messenger Menu និងប្រព័ន្ធឆ្លើយតបស្វ័យប្រវត្តិរួចរាល់!';
    try {
      const profileRes = await fetch(
        `https://graph.facebook.com/v19.0/me/messenger_profile?access_token=${encodeURIComponent(activeToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            get_started: { payload: 'GET_STARTED_MINIAPP_SHOP' },
            persistent_menu: [
              {
                locale: 'default',
                composer_input_disabled: false,
                call_to_actions: [
                  {
                    type: 'web_url',
                    title: cleanBtnText,
                    url: fbShopUrl,
                    webview_height_ratio: 'full'
                  }
                ]
              }
            ],
            ice_breakers: [
              {
                call_to_actions: [
                  {
                    question: '🛍️ មើលម៉ូតខោអាវ និងតម្លៃ (បើកហាងទិញ)',
                    payload: 'OPEN_MINIAPP_SHOP'
                  },
                  {
                    question: '📦 ចង់កម្ម៉ង់ទិញខោអាវ',
                    payload: 'OPEN_MINIAPP_SHOP'
                  }
                ],
                locale: 'default'
              }
            ]
          })
        }
      );
      const profileData = await profileRes.json();
      if (profileData?.error) {
        profileNote = 'បានភ្ជាប់ប្រព័ន្ធឆ្លើយតបប៊ូតុងហាងស្វ័យប្រវត្តិ (Auto-Reply Button Card) រួចរាល់!';
      }
    } catch {}

    // 3. Subscribe page to webhook events if possible
    fetch(
      `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(activeToken)}`,
      { method: 'POST' }
    ).catch(() => {});

    miniAppDb.config.fbPageId = pageId;
    miniAppDb.config.fbPageName = pageName;
    miniAppDb.config.fbPageAccessToken = activeToken;
    miniAppDb.config.miniAppUrl = cleanUrl;
    miniAppDb.config.fbButtonText = cleanBtnText;
    miniAppDb.config.fbAutoReplyEnabled = fbAutoReplyEnabled !== undefined ? Boolean(fbAutoReplyEnabled) : true;
    if (fbVerifyToken) {
      miniAppDb.config.fbVerifyToken = String(fbVerifyToken).trim();
    }
    saveMiniAppDb();

    return res.json({
      success: true,
      pageId,
      pageName,
      messengerLink: `https://m.me/${pageId}`,
      note: profileNote,
      config: miniAppDb.config
    });
  } catch (err: any) {
    console.error('[MiniApp Setup FB Page Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'មានបញ្ហាក្នុងការភ្ជាប់ទៅ Facebook Page'
    });
  }
});

// Send a test Shop Button Card to the most recent customer in Facebook Page Inbox
router.post('/admin/send-fb-test-card', async (req: Request, res: Response) => {
  try {
    const { token: activeToken, pageId: fbPageId } = getEffectiveFbPageAuth();
    if (!activeToken) {
      return res.status(400).json({
        success: false,
        error: 'សូមភ្ជាប់ Facebook Page Access Token ជាមុនសិន'
      });
    }
    const pageId = String(miniAppDb.config.fbPageId || fbPageId || '').trim();

    let targetPsid = String(req.body?.psid || '').trim();
    let targetName = '';

    if (!targetPsid) {
      const convRes = await fetch(
        `https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time&limit=5&access_token=${encodeURIComponent(activeToken)}`
      );
      const convData = await convRes.json();
      if (!convRes.ok || convData.error) {
        return res.status(400).json({
          success: false,
          error: `មិនអាចទាញបញ្ជីឆាតពី Page បានទេ៖ ${convData?.error?.message || 'Graph API Error'}`
        });
      }

      const conversations = Array.isArray(convData.data) ? convData.data : [];
      for (const conv of conversations) {
        const participants = conv?.participants?.data || [];
        const customer = participants.find((p: any) => String(p.id) !== pageId);
        if (customer?.id) {
          targetPsid = String(customer.id);
          targetName = String(customer.name || '');
          recordKnownFbCustomer(targetPsid, targetName);
          break;
        }
      }
    }

    if (!targetPsid) {
      return res.status(400).json({
        success: false,
        error: 'រកមិនឃើញឆាតភ្ញៀវថ្មីៗក្នុង Page ទេ។ សូមឱ្យភ្ញៀវឆាតចូល Page ម្នាក់សិន!'
      });
    }

    const sendRes = await sendFacebookShopCard(activeToken, targetPsid, targetName);
    if (!sendRes.ok) {
      return res.status(400).json({
        success: false,
        error: `មិនអាចផ្ញើប៊ូតុងហាងទៅឆាតភ្ញៀវបានទេ៖ ${sendRes.error}`
      });
    }

    return res.json({
      success: true,
      customerName: targetName || targetPsid
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'មានបញ្ហាក្នុងការផ្ញើប៊ូតុងហាងទៅ Facebook Messenger'
    });
  }
});

// Meta Messenger Webhook Verification (GET /api/miniapp/fb-webhook)
router.get('/fb-webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = (miniAppDb.config.fbVerifyToken || '1688').trim();

  if (mode === 'subscribe' && (token === expectedToken || token === '1688')) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Meta Messenger Webhook Event Receiver (POST /api/miniapp/fb-webhook)
const fbCustomerCooldownMap = new Map<string, number>();

router.post('/fb-webhook', async (req: Request, res: Response) => {
  res.status(200).send('EVENT_RECEIVED');
  try {
    const body = req.body;
    if (body?.object !== 'page' || !Array.isArray(body.entry)) return;

    const { token: activeToken, pageId: resolvedPageId } = getEffectiveFbPageAuth();
    if (!activeToken || miniAppDb.config.fbAutoReplyEnabled === false) return;

    for (const entry of body.entry) {
      const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging : [];
      for (const evt of messagingEvents) {
        const senderId = evt?.sender?.id ? String(evt.sender.id) : '';
        const pageId = String(miniAppDb.config.fbPageId || resolvedPageId || entry.id || '');
        if (!senderId || senderId === pageId || evt?.message?.is_echo) continue;

        recordKnownFbCustomer(senderId);

        const postbackPayload = evt?.postback?.payload || '';
        const text = typeof evt?.message?.text === 'string' ? evt.message.text.trim() : '';
        const lower = text.toLowerCase();

        const isExplicitShopCommand =
          postbackPayload === 'GET_STARTED_MINIAPP_SHOP' ||
          postbackPayload === 'OPEN_MINIAPP_SHOP' ||
          ['បើកហាង', 'មើលហាង', 'ទិញទំនិញ', '/shop', 'shop', 'menu'].some(
            kw => lower === kw
          );

        const lastSentAt = fbCustomerCooldownMap.get(senderId) || 0;
        const cooldownExpired = Date.now() - lastSentAt > 24 * 60 * 60 * 1000; // 24 hours anti-spam cooldown per customer

        if (isExplicitShopCommand || cooldownExpired) {
          fbCustomerCooldownMap.set(senderId, Date.now());
          await sendFacebookShopCard(activeToken, senderId);
        }
      }
    }
  } catch (err) {
    console.error('[FB Webhook Error]:', err);
  }
});

// Zero-Webhook Background Facebook Page Conversation Poller
// Automatically replies with the Shop Button Card ONCE per 24h when a customer starts a chat,
// and stays silent if the Page Admin is actively chatting with the customer!
const processedFbMsgIds = new Set<string>();
let isFirstFbPollPass = true;

async function startFacebookMessengerShopPoller() {
  while (true) {
    try {
      const { token: activeToken, pageId } = getEffectiveFbPageAuth();
      const autoReply = miniAppDb.config.fbAutoReplyEnabled !== false;

      if (!activeToken || !pageId || !autoReply) {
        await new Promise(r => setTimeout(r, 6000));
        continue;
      }

      const url = `https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time,messages.limit(5){id,message,from,created_time}&limit=6&access_token=${encodeURIComponent(activeToken)}`;
      const res = await fetch(url);
      if (!res.ok) {
        await new Promise(r => setTimeout(r, 12000));
        continue;
      }

      const data = await res.json();
      const conversations = Array.isArray(data?.data) ? data.data : [];

      for (const conv of conversations) {
        const participants = conv?.participants?.data || [];
        for (const pt of participants) {
          if (pt?.id && String(pt.id) !== pageId) {
            recordKnownFbCustomer(String(pt.id), String(pt.name || ''));
          }
        }

        const msgs = conv?.messages?.data || [];
        if (msgs.length === 0) continue;

        const latestMsg = msgs[0];
        const msgId = String(latestMsg?.id || '');
        if (!msgId) continue;

        // On first startup pass, seed existing message IDs so we don't reply to old historical messages
        if (isFirstFbPollPass) {
          processedFbMsgIds.add(msgId);
          continue;
        }

        if (processedFbMsgIds.has(msgId)) continue;
        processedFbMsgIds.add(msgId);

        const fromId = String(latestMsg?.from?.id || '');
        const fromName = String(latestMsg?.from?.name || '');
        if (!fromId || fromId === pageId) continue;
        recordKnownFbCustomer(fromId, fromName);

        // Check message age (only auto-reply to messages received within the last 3 minutes)
        const createdTime = latestMsg?.created_time ? new Date(latestMsg.created_time).getTime() : Date.now();
        if (Date.now() - createdTime > 3 * 60 * 1000) continue;

        const text = String(latestMsg?.message || '').trim();
        const lower = text.toLowerCase();

        // Explicit command to re-open the shop at any time
        const isExplicitShopCommand = ['បើកហាង', 'មើលហាង', 'ទិញទំនិញ', '/shop', 'shop', 'menu'].some(
          kw => lower === kw
        );

        // Check if Page Admin has actively replied in the last 45 minutes (Smart Pause so we don't interrupt human chat)
        const adminRepliedRecently = msgs.slice(1).some((m: any) => {
          const sender = String(m?.from?.id || '');
          const mTime = m?.created_time ? new Date(m.created_time).getTime() : 0;
          return sender === pageId && Date.now() - mTime < 45 * 60 * 1000;
        });

        const lastSentAt = fbCustomerCooldownMap.get(fromId) || 0;
        const cooldownExpired = Date.now() - lastSentAt > 24 * 60 * 60 * 1000; // 24-hour anti-spam cooldown

        if (isExplicitShopCommand || (cooldownExpired && !adminRepliedRecently)) {
          fbCustomerCooldownMap.set(fromId, Date.now());
          await sendFacebookShopCard(activeToken, fromId, fromName);
        }
      }

      isFirstFbPollPass = false;
    } catch {
      // Ignore transient network errors
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

startFacebookMessengerShopPoller();

// Customer Product Inquiry Endpoint (Triggered when clicking "💬 ឆាតសួរម្ចាស់ហាងពីម៉ូតនេះ")
router.post('/inquire', async (req: Request, res: Response) => {
  try {
    const { code, name, price, customerName, telegramUsername, telegramUserId, fbPsid } = req.body || {};
    const cleanCode = String(code || '').trim().toUpperCase();
    const cleanName = String(name || '').trim();
    const custLabel = String(customerName || 'អតិថិជន').trim();

    let sentToCustomerChat = false;

    // 1. If customer is in Facebook Messenger Webview (has fbPsid or can be resolved)
    const { token: fbToken, pageId: fbPageId } = getEffectiveFbPageAuth();
    const resolvedFbPsid = await resolveCustomerFbPsid({
      explicitPsid: fbPsid ? String(fbPsid).trim() : '',
      customerName: custLabel,
      fbToken,
      fbPageId
    });
    if (fbToken && resolvedFbPsid) {
      const fbMsg = [
        `💬 បងកំពុងសាកសួរអំពីម៉ូតកូដ [${cleanCode}] — ${cleanName} ($${Number(price || 0).toFixed(2)})`,
        `✍️ សូមបងវាយសំណួររបស់បងនៅក្នុងឆាតនេះ (ឧ. សួរពីសាច់ក្រណាត់ ឬទំហំគីឡូ) ក្រុមការងារហាងនឹងឆ្លើយតបជូនបងភ្លាមៗ! 🙏✨`
      ].join('\n');
      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(fbToken)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: String(resolvedFbPsid) },
              messaging_type: 'RESPONSE',
              message: { text: fbMsg }
            })
          }
        );
        if (fbRes.ok) sentToCustomerChat = true;
      } catch {}
    }

    // 2. If customer has Telegram User ID
    const botToken = (miniAppDb.config.telegramBotToken || settings.telegram_token || '').trim();
    if (botToken && telegramUserId) {
      const tgMsg = [
        `💬 <b>បងកំពុងសាកសួរអំពីម៉ូតកូដ [${cleanCode}] — ${cleanName} ($${Number(price || 0).toFixed(2)})</b>`,
        `✍️ សូមបងវាយសំណួររបស់បងនៅក្នុងឆាតនេះ ម្ចាស់ហាងនឹងឆ្លើយតបជូនបងភ្លាមៗ! 🙏✨`
      ].join('\n');
      try {
        await sendTelegramMessage(botToken, String(telegramUserId), tgMsg);
        sentToCustomerChat = true;
      } catch {}
    }

    // 3. Notify Shop Admin Group on Telegram
    const targetChatId = (miniAppDb.config.telegramNotifyChatId || settings.telegram_chat_id || '').trim();
    if (botToken && targetChatId) {
      const channelBadge = resolvedFbPsid ? '📘 Facebook Page' : '✈️ Telegram';
      const handleStr = telegramUsername ? `(@${telegramUsername})` : '';
      const alertMsg = [
        `💬 <b>ភ្ញៀវចុចសួរពីម៉ូតខោអាវ! (${channelBadge})</b>`,
        `👤 អតិថិជន៖ <b>${custLabel}</b> ${handleStr}`,
        `👗 ម៉ូតដែលសួរ៖ <b>[${cleanCode}] ${cleanName}</b> ($${Number(price || 0).toFixed(2)})`
      ].join('\n');
      sendTelegramMessage(botToken, targetChatId, alertMsg).catch(() => {});
    }

    return res.json({ success: true, sentToCustomerChat, resolvedFbPsid: resolvedFbPsid || undefined });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Error sending inquiry' });
  }
});

export default router;

