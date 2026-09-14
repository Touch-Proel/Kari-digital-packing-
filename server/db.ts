import fs from 'fs';
import path from 'path';
import {
  Product,
  Invoice,
  OrderItem,
  CustomerComment,
  Customer,
  PackerLog,
  AppSettings,
  FacebookPage
} from './types';

let dataRevision = 1;
let saveTimer: NodeJS.Timeout | null = null;

const DB_FILE_PATH = path.join(process.cwd(), 'server', 'db_store.json');

export function saveDatabaseToDisk() {
  try {
    const payload = {
      dataRevision,
      activeLiveId,
      settings,
      products,
      invoices,
      customers,
      packerLogs,
      activeFacebookPage
    };
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save db_store.json:', err);
  }
}

export function bumpDataRevision(): number {
  dataRevision += 1;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDatabaseToDisk();
  }, 400);
  return dataRevision;
}

export function getDataRevision(): number {
  return dataRevision;
}

// Global active live session ID
export let activeLiveId = '1626350178950100';

export function setActiveLiveId(id: string) {
  activeLiveId = id;
  saveDatabaseToDisk();
}

// Active locks on invoices
export const activeInvoiceLocks = new Map<number, {
  packer_name: string;
  timestamp: number;
  start_time: number;
}>();

const LOCK_TIMEOUT_MS = 120 * 1000;

export function cleanExpiredLocks() {
  const now = Date.now();
  for (const [invId, lock] of activeInvoiceLocks.entries()) {
    if (now - lock.timestamp > LOCK_TIMEOUT_MS) {
      activeInvoiceLocks.delete(invId);
    }
  }
}

// Settings
export const settings: AppSettings = {
  default_shipping_fee: 2.0,
  free_ship_threshold: 0.0, // 0 = disabled (no free shipping under any condition)
  bulk_discount_qty: 0,
  bulk_discount_amount: 0.0,
  bakong_id: '000474559@aba',
  merchant_name: 'KARI ARNETT',
  exchange_rate: 4100,
  telegram_token: process.env.TELEGRAM_BOT_TOKEN || '',
  telegram_chat_id: process.env.TELEGRAM_CHAT_ID || ''
};

// Initial Products Catalog
export const products: Product[] = [
  { id: 1, code: '30', name: 'រ៉ូបសាច់ក្រណាត់ផ្កា', stock_qty: 45, price: 6.50, cost_price: 3.80, image_file: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&auto=format&fit=crop&q=80' },
  { id: 2, code: '54', name: 'អាវយឺតកូរ៉េដៃខ្លី', stock_qty: 32, price: 4.00, cost_price: 2.20, image_file: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop&q=80' },
  { id: 3, code: 'A12', name: 'ខោខូវប៊យជើងវែង VIP', stock_qty: 18, price: 9.50, cost_price: 5.50, image_file: 'https://images.unsplash.com/photo-1542272604-780c96856592?w=400&auto=format&fit=crop&q=80' },
  { id: 4, code: 'B05', name: 'ឈុតគេងយប់សូត្រ', stock_qty: 24, price: 5.00, cost_price: 2.90, image_file: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&auto=format&fit=crop&q=80' },
  { id: 5, code: 'K99', name: 'អាវប៉ាក់ផ្កាខ្មែរប្រណិត', stock_qty: 12, price: 12.00, cost_price: 7.00, image_file: 'https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=400&auto=format&fit=crop&q=80' },
  { id: 6, code: 'M10', name: 'ក្រែមលាបមាត់ matte', stock_qty: 50, price: 2.50, cost_price: 1.10, image_file: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400&auto=format&fit=crop&q=80' },
  { id: 7, code: '88', name: 'ស្បែកជើងប៉ាតាស្រី', stock_qty: 15, price: 8.50, cost_price: 4.80, image_file: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&auto=format&fit=crop&q=80' },
  { id: 8, code: 'V07', name: 'កាបូបស្ពាយតូចស្អាត', stock_qty: 20, price: 7.00, cost_price: 4.00, image_file: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&auto=format&fit=crop&q=80' }
];

// Initial Invoices (Baskets)
export const invoices: Invoice[] = [
  {
    invoice_id: 101,
    basket_no: 101,
    live_id: 'LIVE_20260913_VIP',
    created_at: '2026-09-13T14:30:00',
    facebook_user_id: '100088991122334',
    facebook_name: 'សុខ ស្រីម៉ៅ (Srey Mao)',
    phone_number: '012 889 772',
    address: 'ផ្ទះលេខ 24E0 ផ្លូវ 271 សង្កាត់បឹងទំពុន ខណ្ឌមានជ័យ',
    location_zone: 'PP',
    location_label: '🏙️ ភ្នំពេញ',
    total_amount: 17.00,
    shipping_fee: 2.00,
    is_free_ship: false,
    status: 'Pending',
    packing_stage: 'UNPICKED',
    msg_status: 'UNSENT',
    items: [
      { id: 1, invoice_id: 101, product_id: 1, product_code: '30', product_name: 'រ៉ូបសាច់ក្រណាត់ផ្កា', quantity: 2, price: 6.50, is_packed: false, item_comment: '30=2 យកពណ៍ផ្ទៃមេឃ' },
      { id: 2, invoice_id: 101, product_id: 2, product_code: '54', product_name: 'អាវយឺតកូរ៉េដៃខ្លី', quantity: 1, price: 4.00, is_packed: false, item_comment: '54x1' }
    ],
    comments: [
      'ជម្រាបសួរចែ 30=2 យកពណ៍ផ្ទៃមេឃ',
      'ថែម 54x1 ផងចែ 012889772 ភ្នំពេញ'
    ],
    unmatched_comments: [
      'ចែមានពណ៍ផ្កាឈូកអត់'
    ]
  },
  {
    invoice_id: 102,
    basket_no: 102,
    live_id: 'LIVE_20260913_VIP',
    created_at: '2026-09-13T14:35:10',
    facebook_user_id: '100077665544332',
    facebook_name: 'គីម ហុង (Kim Hong Boutique)',
    phone_number: '097 554 4321',
    address: 'ភូមិវត្តបូព៌ សង្កាត់សាលាកំរើក ក្រុងសៀមរាប',
    location_zone: 'PROVINCE',
    location_label: '🏞️ តាមខេត្ត',
    total_amount: 33.00,
    shipping_fee: 2.00,
    is_free_ship: false,
    status: 'Pending',
    packing_stage: 'STAGED',
    staged_by: 'សុខា',
    staged_at: '2026-09-13 14:40:00',
    msg_status: 'SENT',
    items: [
      { id: 3, invoice_id: 102, product_id: 3, product_code: 'A12', product_name: 'ខោខូវប៊យជើងវែង VIP', quantity: 2, price: 9.50, is_packed: true, item_comment: 'A12=2 size L' },
      { id: 4, invoice_id: 102, product_id: 5, product_code: 'K99', product_name: 'អាវប៉ាក់ផ្កាខ្មែរប្រណិត', quantity: 1, price: 12.00, is_packed: true, item_comment: 'K99 មួយ' }
    ],
    comments: [
      'កាត់ A12=2 size L 0975544321 សៀមរាប',
      'យក K99 មួយទៀតចែ'
    ],
    unmatched_comments: []
  },
  {
    invoice_id: 103,
    basket_no: 103,
    live_id: 'LIVE_20260913_VIP',
    created_at: '2026-09-13T14:42:00',
    facebook_user_id: '100099887766554',
    facebook_name: 'ចាន់ថា លីនដា (Linda Chan)',
    phone_number: '081 223 344',
    address: 'បុរីប៉េងហួតបឹងស្នោ ផ្លូវជាតិលេខ១ ភ្នំពេញ',
    location_zone: 'PP',
    location_label: '🏙️ ភ្នំពេញ',
    total_amount: 15.50,
    shipping_fee: 2.00,
    is_free_ship: false,
    status: 'Paid',
    packing_stage: 'STAGED',
    staged_by: 'សុខា',
    staged_at: '2026-09-13 14:45:00',
    msg_status: 'SENT',
    items: [
      { id: 5, invoice_id: 103, product_id: 7, product_code: '88', product_name: 'ស្បែកជើងប៉ាតាស្រី', quantity: 1, price: 8.50, is_packed: true, item_comment: '88*1 size 37' },
      { id: 6, invoice_id: 103, product_id: 4, product_code: 'B05', product_name: 'ឈុតគេងយប់សូត្រ', quantity: 1, price: 5.00, is_packed: true, item_comment: 'B05=1' }
    ],
    comments: [
      '88*1 size 37 081223344 ប៉េងហួតច្បារអំពៅ',
      'ថែម B05=1 ផង'
    ],
    unmatched_comments: []
  },
  {
    invoice_id: 104,
    basket_no: 104,
    live_id: 'LIVE_20260913_VIP',
    created_at: '2026-09-13T14:48:22',
    facebook_user_id: '100011223344556',
    facebook_name: 'ពេជ្រ សុជាតា (Pech Socheata)',
    phone_number: '070 998 811',
    address: 'សង្កាត់ស្រះចក ខណ្ឌដូនពេញ ភ្នំពេញ',
    location_zone: 'PP',
    location_label: '🏙️ ភ្នំពេញ',
    total_amount: 16.00,
    shipping_fee: 2.00,
    is_free_ship: false,
    status: 'Pending',
    packing_stage: 'UNPICKED',
    msg_status: 'UNSENT',
    items: [
      { id: 7, invoice_id: 104, product_id: 8, product_code: 'V07', product_name: 'កាបូបស្ពាយតូចស្អាត', quantity: 2, price: 7.00, is_packed: false, item_comment: 'V07=2 ខ្មៅ១ ត្នោត១' }
    ],
    comments: [
      'V07=2 ខ្មៅ១ ត្នោត១ 070998811 ភ្នំពេញ'
    ],
    unmatched_comments: [
      'កូដ 54=2 ថែម'
    ]
  },
  {
    invoice_id: 99,
    basket_no: 99,
    live_id: 'LIVE_20260912_NIGHT',
    created_at: '2026-09-12T20:15:00',
    facebook_user_id: '100044556677889',
    facebook_name: 'វ៉ាន់នី បាត់ដំបង',
    phone_number: '088 776 6554',
    address: 'ផ្លូវលេខ ៣ ក្រុងបាត់ដំបង',
    location_zone: 'PROVINCE',
    location_label: '🏞️ តាមខេត្ត',
    total_amount: 28.00,
    shipping_fee: 2.00,
    is_free_ship: false,
    status: 'Dispatched',
    packing_stage: 'DISPATCHED',
    staged_by: 'សុខា',
    staged_at: '2026-09-12 21:00:00',
    msg_status: 'SENT',
    items: [
      { id: 8, invoice_id: 99, product_id: 5, product_code: 'K99', product_name: 'អាវប៉ាក់ផ្កាខ្មែរប្រណិត', quantity: 2, price: 12.00, is_packed: true, item_comment: 'K99=2' },
      { id: 9, invoice_id: 99, product_id: 2, product_code: '54', product_name: 'អាវយឺតកូរ៉េដៃខ្លី', quantity: 1, price: 4.00, is_packed: true, item_comment: '54 មួយ' }
    ],
    comments: ['K99=2 និង 54 មួយ បាត់ដំបង'],
    unmatched_comments: []
  }
];

// Initial Customer Comments
export const rawComments: CustomerComment[] = [
  {
    comment_id: 'c_1001',
    live_id: 'LIVE_20260913_VIP',
    invoice_id: 101,
    facebook_user_id: '100088991122334',
    facebook_name: 'សុខ ស្រីម៉ៅ (Srey Mao)',
    comment_text: 'ជម្រាបសួរចែ 30=2 យកពណ៍ផ្ទៃមេឃ',
    created_at: '2026-09-13T14:30:00',
    is_matched: true
  },
  {
    comment_id: 'c_1002',
    live_id: 'LIVE_20260913_VIP',
    invoice_id: 101,
    facebook_user_id: '100088991122334',
    facebook_name: 'សុខ ស្រីម៉ៅ (Srey Mao)',
    comment_text: 'ថែម 54x1 ផងចែ 012889772 ភ្នំពេញ',
    created_at: '2026-09-13T14:32:00',
    is_matched: true
  },
  {
    comment_id: 'c_1003',
    live_id: 'LIVE_20260913_VIP',
    invoice_id: 102,
    facebook_user_id: '100077665544332',
    facebook_name: 'គីម ហុង (Kim Hong Boutique)',
    comment_text: 'កាត់ A12=2 size L 0975544321 សៀមរាប',
    created_at: '2026-09-13T14:35:10',
    is_matched: true
  },
  {
    comment_id: 'c_1004',
    live_id: 'LIVE_20260913_VIP',
    invoice_id: 104,
    facebook_user_id: '100011223344556',
    facebook_name: 'ពេជ្រ សុជាតា (Pech Socheata)',
    comment_text: 'V07=2 ខ្មៅ១ ត្នោត១ 070998811 ភ្នំពេញ',
    created_at: '2026-09-13T14:48:22',
    is_matched: true
  }
];

// Initial Customers
export const customers: Customer[] = [
  { customer_id: 1, facebook_user_id: '100088991122334', facebook_name: 'សុខ ស្រីម៉ៅ (Srey Mao)', phone_number: '012 889 772', address: 'ផ្ទះលេខ 24E0 ផ្លូវ 271 សង្កាត់បឹងទំពុន ខណ្ឌមានជ័យ', is_vip: true, is_blacklist: false },
  { customer_id: 2, facebook_user_id: '100077665544332', facebook_name: 'គីម ហុង (Kim Hong Boutique)', phone_number: '097 554 4321', address: 'ភូមិវត្តបូព៌ សង្កាត់សាលាកំរើក ក្រុងសៀមរាប', is_vip: false, is_blacklist: false },
  { customer_id: 3, facebook_user_id: '100099887766554', facebook_name: 'ចាន់ថា លីនដា (Linda Chan)', phone_number: '081 223 344', address: 'បុរីប៉េងហួតបឹងស្នោ ផ្លូវជាតិលេខ១ ភ្នំពេញ', is_vip: true, is_blacklist: false },
  { customer_id: 4, facebook_user_id: '100011223344556', facebook_name: 'ពេជ្រ សុជាតា (Pech Socheata)', phone_number: '070 998 811', address: 'សង្កាត់ស្រះចក ខណ្ឌដូនពេញ ភ្នំពេញ', is_vip: false, is_blacklist: false }
];

// Packer Logs
export const packerLogs: PackerLog[] = [
  { log_id: 1, invoice_id: 99, packer_name: 'សុខា', items_count: 3, duration_seconds: 28, packed_at: '2026-09-12 21:00:00', facebook_name: 'វ៉ាន់នី បាត់ដំបង', total_amount: 28.00 },
  { log_id: 2, invoice_id: 95, packer_name: 'សុខា', items_count: 2, duration_seconds: 22, packed_at: '2026-09-12 20:30:00', facebook_name: 'លីណា ភ្នំពេញ', total_amount: 18.50 },
  { log_id: 3, invoice_id: 94, packer_name: 'ធារ៉ា', items_count: 4, duration_seconds: 35, packed_at: '2026-09-12 20:10:00', facebook_name: 'ចន្ធូ កំពង់ចាម', total_amount: 36.00 }
];

// In-Memory Facebook Connection State
export let activeFacebookPage: FacebookPage | null = {
  id: '102094263212256',
  name: 'Kari Arnett',
  access_token: 'EAARoNf2KfC0BSVCb4u9Wb7PWQvXM3iVdJoPYn0hL9kBqDRri6RBnK9uxRGHug68YROZBkmP6KQ6jNopaa3fPE3qLOjmSf2wElTIuUeyikn4H5jATBaC13mvCfbYURxEuUPIGunirDa8P61RLFuyRIxYZAuCmGPVKItvOqHsJ4y4Y3i1I1Ri2FgwNGlYoF8y7UPvCMNH3RYZAZAjztLQZD',
  category: "Women's Clothing Store & Live Sales"
};

export function setActiveFacebookPage(page: FacebookPage | null) {
  activeFacebookPage = page;
}

// -------------------------------------------------------------
// Helper Calculation for an Invoice
// -------------------------------------------------------------
export function recalculateInvoice(inv: Invoice) {
  const itemsSum = inv.items.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  const totalItemsQty = inv.items.reduce((sum, it) => sum + it.quantity, 0);

  // User mandate: No discounts of any kind
  (inv as any).discount_amount = 0;

  // User mandate: Delivery is NEVER free regardless of dress/item price
  inv.is_free_ship = false;

  let finalShipping = 0;
  if (totalItemsQty > 0) {
    if (inv.shipping_fee !== undefined && inv.shipping_fee !== null && inv.shipping_fee > 0 && inv.shipping_fee !== 2.5) {
      finalShipping = inv.shipping_fee;
    } else {
      finalShipping = settings.default_shipping_fee || 2.0;
    }
  }

  inv.shipping_fee = finalShipping;
  // Total is strictly (Subtotal + Shipping)
  inv.total_amount = Number((itemsSum + finalShipping).toFixed(2));
}

export function loadDatabaseFromDisk() {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.invoices && Array.isArray(parsed.invoices) && parsed.invoices.length > 0) {
        invoices.length = 0;
        invoices.push(...parsed.invoices);
      }
      if (parsed.products && Array.isArray(parsed.products) && parsed.products.length > 0) {
        products.length = 0;
        products.push(...parsed.products);
      }
      if (parsed.activeLiveId) {
        activeLiveId = parsed.activeLiveId;
      }
      if (parsed.activeFacebookPage) {
        activeFacebookPage = parsed.activeFacebookPage;
      }
      if (parsed.customers && Array.isArray(parsed.customers) && parsed.customers.length > 0) {
        customers.length = 0;
        customers.push(...parsed.customers);
      }
      if (parsed.packerLogs && Array.isArray(parsed.packerLogs) && parsed.packerLogs.length > 0) {
        packerLogs.length = 0;
        packerLogs.push(...parsed.packerLogs);
      }
      if (parsed.settings) {
        Object.assign(settings, parsed.settings);
      }
      // Strictly enforce shipping fee $2.0 flat across all orders
      settings.default_shipping_fee = 2.0;
      settings.free_ship_threshold = 0;
      settings.bulk_discount_qty = 0;
      settings.bulk_discount_amount = 0;

      // Sanitize products and invoice item names to use កូដ [CODE] instead of ទំនិញកូដ [CODE]
      products.forEach(p => {
        if (p.name && p.name.startsWith('ទំនិញកូដ')) {
          p.name = p.name.replace(/^ទំនិញកូដ\s*/, 'កូដ ');
        }
      });

      // Migrate all loaded invoices to ensure shipping fee is strictly $2.00 flat, discounts removed, and item names cleaned
      invoices.forEach(inv => {
        inv.is_free_ship = false;
        (inv as any).discount_amount = 0;
        if (!inv.shipping_fee || inv.shipping_fee <= 0 || inv.shipping_fee === 2.5) {
          inv.shipping_fee = 2.0;
        }
        if (inv.items && Array.isArray(inv.items)) {
          inv.items.forEach(it => {
            if (it.product_name && it.product_name.startsWith('ទំនិញកូដ')) {
              it.product_name = it.product_name.replace(/^ទំនិញកូដ\s*/, 'កូដ ');
            }
          });
        }
        recalculateInvoice(inv);
      });

      // Persist the migrated data to disk
      saveDatabaseToDisk();

      console.log(`[DB Loaded] Successfully loaded and normalized ${invoices.length} invoices, ${products.length} products from disk.`);
    }
  } catch (err) {
    console.error('Failed to load db_store.json:', err);
  }
}

// Load from disk on startup
loadDatabaseFromDisk();

// Calculate on start
invoices.forEach(recalculateInvoice);
bumpDataRevision();
