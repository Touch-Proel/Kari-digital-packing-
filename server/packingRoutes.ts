import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  invoices,
  products,
  packerLogs,
  rawComments,
  customers,
  settings,
  activeLiveId,
  setActiveLiveId,
  activeInvoiceLocks,
  cleanExpiredLocks,
  bumpDataRevision,
  getDataRevision,
  recalculateInvoice,
  saveDatabaseToDisk
} from './db';
import { parseAndAllocateComment } from './parser';
import { sendFacebookReply } from './fbAuth';
import {
  testTelegramBotToken,
  fetchTelegramStockUpdates,
  bulkImportStockItems
} from './telegramSync';

const router = Router();

// GET /api/invoices
router.get('/invoices', (req: Request, res: Response) => {
  const liveId = (req.query.live_id as string) || activeLiveId;
  const clientRev = req.query.rev ? parseInt(req.query.rev as string, 10) : 0;
  const currentRev = getDataRevision();

  if (clientRev > 0 && clientRev === currentRev) {
    return res.json({ changed: false });
  }

  cleanExpiredLocks();

  // Filter invoices for requested live
  let filtered = invoices;
  if (liveId && liveId.trim() !== '') {
    filtered = invoices.filter(inv => inv.live_id === liveId);
  }

  // Calculate live lock state and pricing
  const result = filtered.map(inv => {
    recalculateInvoice(inv);
    const lock = activeInvoiceLocks.get(inv.invoice_id);
    const isLocked = !!lock;
    return {
      ...inv,
      is_locked: isLocked,
      locked_by: lock?.packer_name || null
    };
  });

  return res.json({
    changed: true,
    revision: currentRev,
    data: result
  });
});

// GET /api/obs_data
router.get('/obs_data', (_req: Request, res: Response) => {
  const topProducts = products.map(p => ({
    id: p.id,
    code: p.code,
    name: p.name,
    price: p.price,
    cost_price: p.cost_price,
    stock_qty: p.stock_qty,
    image_file: p.image_file || ''
  }));

  // Find recent winner
  const allItems = invoices.flatMap(inv =>
    inv.items.map(it => ({
      customer_name: inv.facebook_name,
      code: it.product_code,
      product_name: it.product_name,
      price: it.price
    }))
  );
  const recentWinner = allItems.length > 0 ? allItems[0] : null;

  res.json({
    products: topProducts,
    recent_winner: recentWinner
  });
});

// GET /api/products
router.get('/products', (_req: Request, res: Response) => {
  res.json(products);
});

// POST /api/update_product_stock_price
router.post('/update_product_stock_price', (req: Request, res: Response) => {
  const { code, stock_qty, add_qty, price, name, cost_price, image_file, new_code } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, error: 'Code is required' });
  }

  const cleanCode = String(code).trim().toUpperCase();
  let prod = products.find(p => p.code.toUpperCase() === cleanCode);

  if (!prod) {
    prod = {
      id: products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1,
      code: cleanCode,
      name: name?.trim() || `កូដ ${cleanCode}`,
      stock_qty: Number(stock_qty || 50),
      price: Number(price || 5.0),
      cost_price: Number(cost_price || 3.0),
      image_file: image_file || ''
    };
    products.push(prod);
  } else {
    if (name) prod.name = name.trim();
    if (cost_price !== undefined) prod.cost_price = Number(cost_price);
    if (image_file !== undefined) prod.image_file = image_file || '';

    // If user changed the code itself
    if (new_code && String(new_code).trim().toUpperCase() !== cleanCode) {
      const cleanNewCode = String(new_code).trim().toUpperCase();
      const existingNew = products.find(p => p.code.toUpperCase() === cleanNewCode && p.id !== prod?.id);
      if (existingNew) {
        return res.status(400).json({ success: false, error: `កូដ [${cleanNewCode}] មានរួចហើយក្នុងស្តុក!` });
      }
      prod.code = cleanNewCode;
    }

    if (stock_qty !== undefined && stock_qty !== null) {
      prod.stock_qty = Math.max(0, Number(stock_qty));
    } else if (add_qty) {
      prod.stock_qty = Math.max(0, prod.stock_qty + Number(add_qty));
    }

    if (price !== undefined && price !== null) {
      const newPrice = Number(price);
      prod.price = newPrice;
      // Cascade price ONLY to the currently ACTIVE live session and ONLY unpicked pending invoices
      // Previous live sessions (e.g. yesterday) are 100% frozen and price-protected!
      for (const inv of invoices) {
        if (
          inv.live_id === activeLiveId &&
          inv.status === 'Pending' &&
          inv.packing_stage === 'UNPICKED'
        ) {
          for (const it of inv.items) {
            if (it.product_code.toUpperCase() === cleanCode) {
              it.price = newPrice;
            }
          }
          recalculateInvoice(inv);
        }
      }
    }
  }

  bumpDataRevision();
  res.json({ success: true, data: prod });
});

// POST /api/delete_product
router.post('/delete_product', (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, error: 'Code is required' });
  }

  const cleanCode = String(code).trim().toUpperCase();
  const idx = products.findIndex(p => p.code.toUpperCase() === cleanCode);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: `រកមិនឃើញកូដ [${cleanCode}] ក្នុងស្តុកឡើយ!` });
  }

  const removed = products.splice(idx, 1)[0];
  bumpDataRevision();

  console.log(`[Product Deleted] Removed product [${cleanCode}] from stock.`);
  res.json({
    success: true,
    message: `បានលុបកូដ [${cleanCode}] ចេញពីស្តុកជោគជ័យ!`,
    deleted: removed
  });
});

// POST /api/upload_product_image
router.post('/upload_product_image', (req: Request, res: Response) => {
  try {
    const { code, image_data } = req.body;
    if (!image_data) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    const cleanCode = code ? String(code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') : 'item';
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Check if image_data is a base64 data URL
    let fileBuffer: Buffer;
    let ext = 'jpg';

    if (image_data.startsWith('data:image/')) {
      const matches = image_data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches) {
        ext = matches[1].replace('jpeg', 'jpg');
        fileBuffer = Buffer.from(matches[2], 'base64');
      } else {
        fileBuffer = Buffer.from(image_data.split(',')[1] || image_data, 'base64');
      }
    } else {
      // If it's an external web URL, save directly on product
      if (image_data.startsWith('http://') || image_data.startsWith('https://')) {
        if (code) {
          const targetProd = products.find(p => p.code.toUpperCase() === String(code).trim().toUpperCase());
          if (targetProd) {
            targetProd.image_file = image_data;
            bumpDataRevision();
          }
        }
        return res.json({ success: true, image_url: image_data });
      }
      return res.status(400).json({ success: false, error: 'Invalid image format' });
    }

    const filename = `prod_${cleanCode}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, fileBuffer);

    const publicUrl = `/uploads/${filename}`;

    // Automatically update product if code provided
    if (code) {
      const targetProd = products.find(p => p.code.toUpperCase() === String(code).trim().toUpperCase());
      if (targetProd) {
        targetProd.image_file = publicUrl;
        bumpDataRevision();
      }
    }

    res.json({
      success: true,
      image_url: publicUrl,
      message: 'បានបង្ហោះរូបភាពទំនិញរួចរាល់!'
    });
  } catch (err: any) {
    console.error('Upload product image error:', err);
    res.status(500).json({ success: false, error: err.message || 'Upload failed' });
  }
});

// POST /api/update_invoice_zone
router.post('/update_invoice_zone', (req: Request, res: Response) => {
  const { invoice_id, zone } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);
  if (!inv) {
    return res.status(404).json({ success: false, error: 'Invoice not found' });
  }

  const newZone = (zone || 'PP').toUpperCase();
  inv.location_zone = newZone === 'PROVINCE' ? 'PROVINCE' : 'PP';
  inv.location_label = inv.location_zone === 'PP' ? '🏙️ ភ្នំពេញ' : '🏞️ តាមខេត្ត';
  inv.is_free_ship = false;
  inv.shipping_fee = 2.0;
  recalculateInvoice(inv);
  bumpDataRevision();

  res.json({ success: true, zone: inv.location_zone, shipping_fee: inv.shipping_fee, total_amount: inv.total_amount });
});

// POST /api/invoices/:invoice_id/shipping or /api/update_invoice_shipping
router.post(['/update_invoice_shipping', '/invoices/:invoice_id/shipping', '/api/invoices/:invoice_id/shipping'], (req: Request, res: Response) => {
  const invId = req.params.invoice_id || req.body.invoice_id;
  const cleanId = parseInt(String(invId).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);
  if (!inv) {
    return res.status(404).json({ success: false, error: 'Invoice not found' });
  }

  const { shipping_fee } = req.body;
  inv.is_free_ship = false;
  if (shipping_fee !== undefined && Number(shipping_fee) > 0) {
    inv.shipping_fee = Number(shipping_fee);
  } else {
    inv.shipping_fee = 2.0;
  }

  recalculateInvoice(inv);
  bumpDataRevision();

  res.json({ success: true, is_free_ship: false, shipping_fee: inv.shipping_fee, total_amount: inv.total_amount });
});

// POST /api/lock_invoice
router.post(['/lock_invoice', '/api/lock_invoice'], (req: Request, res: Response) => {
  const { invoice_id, packer_name } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const packer = String(packer_name || 'បុគ្គលិក').trim();

  cleanExpiredLocks();
  const existing = activeInvoiceLocks.get(cleanId);
  const now = Date.now();

  if (existing && existing.packer_name.toLowerCase() !== packer.toLowerCase()) {
    if (now - existing.timestamp < 120 * 1000) {
      return res.status(409).json({
        success: false,
        error: `កន្ត្រកនេះកំពុងច្រកដោយ ${existing.packer_name}!`,
        locked_by: existing.packer_name
      });
    }
  }

  activeInvoiceLocks.set(cleanId, {
    packer_name: packer,
    timestamp: now,
    start_time: existing?.start_time || now
  });

  bumpDataRevision();
  res.json({ success: true });
});

// POST /api/unlock_invoice
router.post(['/unlock_invoice', '/api/unlock_invoice'], (req: Request, res: Response) => {
  const { invoice_id, packer_name, force } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const lock = activeInvoiceLocks.get(cleanId);

  if (lock && (force || lock.packer_name.toLowerCase() === String(packer_name || '').trim().toLowerCase())) {
    activeInvoiceLocks.delete(cleanId);
    bumpDataRevision();
  }

  res.json({ success: true });
});

// POST /api/stage_pack
router.post('/stage_pack', (req: Request, res: Response) => {
  const { invoice_id, packer_name } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);

  if (!inv) {
    return res.status(404).json({ success: false, error: 'Invoice not found' });
  }

  inv.packing_stage = 'STAGED';
  inv.staged_by = String(packer_name || 'បុគ្គលិក');
  inv.staged_at = new Date().toISOString();
  activeInvoiceLocks.delete(cleanId);

  bumpDataRevision();
  res.json({
    success: true,
    message: `បានព្រីន និងដាក់កន្ត្រក #${cleanId} លើធ្នើរង់ចាំលុយ!`
  });
});

// POST /api/dispatch_pack
router.post('/dispatch_pack', (req: Request, res: Response) => {
  const { invoice_id, packer_name } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);

  if (!inv) {
    return res.status(404).json({ success: false, error: 'Invoice not found' });
  }

  const pName = String(packer_name || 'អ្នកផ្ទៀងផ្ទាត់');
  const lock = activeInvoiceLocks.get(cleanId);
  const duration = lock ? Math.max(5, Math.round((Date.now() - lock.start_time) / 1000)) : 25;

  inv.packing_stage = 'DISPATCHED';
  inv.status = 'Dispatched';
  inv.items.forEach(it => { it.is_packed = true; });

  const totalQty = inv.items.reduce((s, it) => s + it.quantity, 0);

  // Record packer log
  packerLogs.unshift({
    log_id: packerLogs.length + 1,
    invoice_id: cleanId,
    packer_name: pName,
    items_count: totalQty,
    duration_seconds: duration,
    packed_at: new Date().toISOString(),
    facebook_name: inv.facebook_name,
    total_amount: inv.total_amount
  });

  activeInvoiceLocks.delete(cleanId);
  bumpDataRevision();

  res.json({
    success: true,
    message: `កញ្ចប់ #${cleanId} ត្រូវបានផ្ទៀងផ្ទាត់ និងបញ្ចេញដឹកជោគជ័យ!`
  });
});

// POST /api/notify_customer_packed
router.post('/notify_customer_packed', async (req: Request, res: Response) => {
  const { invoice_id } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);

  if (!inv) {
    return res.status(404).json({ success: false, error: `រកមិនឃើញកន្ត្រក #${cleanId}` });
  }

  const customerName = inv.facebook_name;
  const phone = inv.phone_number || 'គ្មានលេខ';
  const address = inv.address || 'មិនទាន់មានអាសយដ្ឋាន';

  const itemsList = inv.items.map(it => {
    const custom = (it.product_name || '')
      .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
      .replace(new RegExp(`^កូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
      .replace(new RegExp(`\\[?${it.product_code}\\]?`, 'i'), '')
      .replace(/^ទំនិញ\s*/i, '')
      .replace(/\s*ទំនិញ$/i, '')
      .trim();
    const hasCustom = custom && custom !== 'ទំនិញ';
    const label = hasCustom ? `កូដ [${it.product_code}] ${custom}` : `កូដ [${it.product_code}]`;
    return `  🔹 ${label} x${it.quantity} = $${(it.price * it.quantity).toFixed(2)}`;
  }).join('\n');

  const totalQty = inv.items.reduce((s, it) => s + it.quantity, 0);
  const subtotal = inv.items.reduce((s, it) => s + (it.price * it.quantity), 0);
  const totalKhr = Math.round(inv.total_amount * settings.exchange_rate).toLocaleString();

  const vipMsg =
    `🎉 ជម្រាបសួរចា៎បង ${customerName}! អីវ៉ាន់កន្ត្រក #${cleanId} ត្រូវបានរៀបចំច្រករួចរាល់ហើយចា៎ 🛍️\n\n` +
    `🧾 វិក្កយបត្រកុម្ម៉ង់ទំនិញ (VIP INVOICE)\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 អតិថិជន ៖ ${customerName}\n` +
    `📞 ទូរស័ព្ទ  ៖ ${phone}\n` +
    `📍 ទីតាំង   ៖ ${address}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 បញ្ជីទំនិញកាត់បាន ៖\n` +
    `${itemsList}\n` +
    `----------------------------------\n` +
    `📦 ចំនួនសរុប ៖ ${totalQty} ឈុត\n` +
    `💵 តម្លៃទំនិញ ៖ $${subtotal.toFixed(2)}\n` +
    `🚚 សេវាដឹកជញ្ជូន ៖ +$${(inv.shipping_fee || 2.0).toFixed(2)}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💰 សរុបត្រូវទូទាត់ ៖ $${inv.total_amount.toFixed(2)} / ${totalKhr} រៀល\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🏦 គណនីវេរប្រាក់ (ABA / KHQR) ៖\n` +
    `💳 លេខកុង ABA ៖ ${settings.bakong_id}\n` +
    `👤 ឈ្មោះគណនី ៖ ${settings.merchant_name}\n\n` +
    `🙏 សូមបងជួយវេរប្រាក់ និងផ្ញើ Slip មកកាន់ប្រអប់ឆាតនេះ ដើម្បីខាងប្អូនបញ្ចេញកញ្ចប់អីវ៉ាន់ជូន Delivery ដឹកជូនភ្លាមៗចា៎ 🥰`;

  // Find recent comment ID if any
  const recentComment = rawComments.find(c => c.invoice_id === cleanId || c.facebook_name === customerName);
  const commentId = recentComment?.comment_id || null;

  const replyRes = await sendFacebookReply(commentId, inv.facebook_user_id, vipMsg);

  if (replyRes.success) {
    inv.msg_status = 'SENT';
    inv.msg_error = '';
    bumpDataRevision();
    res.json({ success: true, message: 'បានផ្ញើសារ VIP ជោគជ័យ!', vip_message: vipMsg });
  } else {
    inv.msg_status = 'FAILED';
    inv.msg_error = replyRes.error || 'Failed to dispatch';
    bumpDataRevision();
    res.json({ success: false, error: replyRes.error, vip_message: vipMsg });
  }
});

// POST /api/update_customer_contact
router.post('/update_customer_contact', (req: Request, res: Response) => {
  const { invoice_id, facebook_name, phone, address } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);

  if (inv) {
    if (phone) inv.phone_number = String(phone).trim();
    if (address) inv.address = String(address).trim();
  }

  const cust = customers.find(c => c.facebook_name.toLowerCase() === String(facebook_name || '').trim().toLowerCase());
  if (cust) {
    if (phone) cust.phone_number = String(phone).trim();
    if (address) cust.address = String(address).trim();
  }

  bumpDataRevision();
  res.json({ success: true });
});

// POST /api/set_item_qty_direct
router.post('/set_item_qty_direct', (req: Request, res: Response) => {
  const { invoice_id, code, new_qty } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const cleanCode = String(code).trim().toUpperCase();
  const targetQty = Math.max(0, parseInt(String(new_qty || 0), 10));

  const inv = invoices.find(i => i.invoice_id === cleanId);
  if (!inv) {
    return res.status(404).json({ success: false, message: 'រកមិនឃើញវិក្កយបត្រ' });
  }

  const itemIdx = inv.items.findIndex(it => it.product_code.toUpperCase() === cleanCode);
  if (itemIdx === -1) {
    return res.status(404).json({ success: false, message: `រកមិនឃើញកូដ [${cleanCode}]` });
  }

  const currentItem = inv.items[itemIdx];
  const delta = targetQty - currentItem.quantity;

  const prod = products.find(p => p.code.toUpperCase() === cleanCode);
  if (prod) {
    if (delta > 0 && prod.stock_qty < delta) {
      return res.json({ success: false, message: `ខ្វះស្តុក (សល់តែ ${prod.stock_qty})` });
    }
    prod.stock_qty -= delta;
  }

  if (targetQty === 0) {
    inv.items.splice(itemIdx, 1);
  } else {
    currentItem.quantity = targetQty;
  }

  recalculateInvoice(inv);
  bumpDataRevision();

  res.json({
    success: true,
    message: 'កែប្រែចំនួនជោគជ័យ',
    item: { code: cleanCode, quantity: targetQty }
  });
});

// POST /api/add_item_to_invoice
router.post('/add_item_to_invoice', (req: Request, res: Response) => {
  const { invoice_id, code, quantity, comment_text } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const cleanCode = String(code).trim().toUpperCase();
  const addQty = Math.max(1, parseInt(String(quantity || 1), 10));

  const inv = invoices.find(i => i.invoice_id === cleanId);
  if (!inv) {
    return res.status(404).json({ success: false, message: 'រកមិនឃើញវិក្កយបត្រ' });
  }

  let prod = products.find(p => p.code.toUpperCase() === cleanCode);
  if (!prod) {
    const nextProdId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
    prod = {
      id: nextProdId,
      code: cleanCode,
      name: `កូដ [${cleanCode}]`,
      stock_qty: 100,
      price: 5.0,
      cost_price: 3.0
    };
    products.push(prod);
  }

  if (prod.stock_qty < addQty) {
    prod.stock_qty = addQty + 50; // Auto replenish for live manual allocation
  }

  prod.stock_qty -= addQty;

  const existingItem = inv.items.find(it => it.product_code.toUpperCase() === cleanCode);
  let finalQty = addQty;
  if (existingItem) {
    existingItem.quantity += addQty;
    finalQty = existingItem.quantity;
    if (comment_text) existingItem.item_comment = comment_text;
  } else {
    const nextItemId = inv.items.length > 0 ? Math.max(...inv.items.map(it => it.id)) + 1 : 1;
    inv.items.push({
      id: nextItemId,
      invoice_id: cleanId,
      product_id: prod.id,
      product_code: prod.code,
      product_name: prod.name,
      quantity: addQty,
      price: prod.price,
      is_packed: false,
      item_comment: comment_text || ''
    });
  }

  // Remove comment from unmatched if provided
  if (comment_text && inv.unmatched_comments) {
    inv.unmatched_comments = inv.unmatched_comments.filter(c => c !== comment_text);
  }

  recalculateInvoice(inv);
  bumpDataRevision();

  res.json({
    success: true,
    message: `បានបន្ថែម [${cleanCode} x${addQty}] ចូលកន្ត្រក #${cleanId} រួចរាល់!`,
    item: {
      code: cleanCode,
      product_name: prod.name,
      quantity: finalQty,
      price: prod.price,
      total_amount: inv.total_amount
    }
  });
});

// POST /api/dismiss_unmatched_comment - Dismiss an unmatched comment from the pending list without deleting it from invoice.comments history
router.post('/dismiss_unmatched_comment', (req: Request, res: Response) => {
  const { invoice_id, comment_text } = req.body;
  const cleanId = parseInt(String(invoice_id), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId || i.basket_no === cleanId);
  if (!inv) {
    return res.status(404).json({ success: false, message: 'រកមិនឃើញវិក្កយបត្រ' });
  }

  if (comment_text && inv.unmatched_comments) {
    inv.unmatched_comments = inv.unmatched_comments.filter(c => c.trim() !== String(comment_text).trim());
  }
  bumpDataRevision();

  res.json({
    success: true,
    message: 'បានបិទខមិននេះរួចរាល់ (រក្សាទុកក្នុងប្រវត្តិ)'
  });
});

// GET /api/picking_list
router.get('/picking_list', (req: Request, res: Response) => {
  const liveId = (req.query.live_id as string) || activeLiveId;
  const targetInvoices = liveId ? invoices.filter(i => i.live_id === liveId && i.status !== 'Cancelled') : invoices;

  const summaryMap = new Map<string, { code: string; product_name: string; price: number; total_qty: number }>();

  for (const inv of targetInvoices) {
    for (const it of inv.items) {
      const existing = summaryMap.get(it.product_code);
      if (existing) {
        existing.total_qty += it.quantity;
      } else {
        summaryMap.set(it.product_code, {
          code: it.product_code,
          product_name: it.product_name,
          price: it.price,
          total_qty: it.quantity
        });
      }
    }
  }

  const sorted = Array.from(summaryMap.values()).sort((a, b) => b.total_qty - a.total_qty);
  res.json(sorted);
});

// GET /api/dispatched_today_report
router.get('/dispatched_today_report', (_req: Request, res: Response) => {
  const dispatched = invoices.filter(i => i.status === 'Dispatched' || i.status === 'Packed');
  let ppCount = 0;
  const packerStats: Record<string, number> = {};

  dispatched.forEach(inv => {
    if (inv.location_zone === 'PP') ppCount += 1;
    const p = inv.staged_by || 'បុគ្គលិក';
    packerStats[p] = (packerStats[p] || 0) + 1;
  });

  const payload = {
    total: dispatched.length,
    pp_count: ppCount,
    province_count: dispatched.length - ppCount,
    today_live_count: dispatched.filter(i => i.live_id === activeLiveId).length,
    old_live_count: dispatched.filter(i => i.live_id !== activeLiveId).length,
    packer_stats: packerStats,
    items: dispatched.map(inv => ({
      invoice_id: inv.invoice_id,
      basket_no: inv.basket_no || inv.invoice_id,
      facebook_name: inv.facebook_name,
      phone_number: inv.phone_number,
      cust_address: inv.address,
      location_zone: inv.location_zone,
      total_amount: inv.total_amount,
      packer_name: inv.staged_by || 'បុគ្គលិក',
      packed_at: inv.staged_at || inv.created_at
    }))
  };

  res.json(payload);
});

// POST /api/send_telegram_dispatch_report
router.post('/send_telegram_dispatch_report', async (req: Request, res: Response) => {
  const token = settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.json({
      success: false,
      error: 'មិនទាន់កំណត់ Telegram Token ឬ Chat ID ក្នុង Settings ឡើយ!'
    });
  }

  const { total, pp_count, province_count, today_live_count, old_live_count, packer_stats } = req.body;
  const packerStr = Object.entries(packer_stats || {})
    .map(([k, v]) => `  • ${k} ៖ ${v} កញ្ចប់`)
    .join('\n') || '  • បុគ្គលិកទូទៅ';

  const dateStr = new Date().toLocaleDateString('km-KH');
  const timeStr = new Date().toLocaleTimeString('km-KH');

  const text =
    `📦 របាយការណ៍បញ្ចេញទំនិញប្រចាំថ្ងៃ (Daily Dispatch)\n` +
    `📅 កាលបរិច្ឆេទ ៖ ថ្ងៃទី ${dateStr}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚚 សរុបកញ្ចប់ចេញដឹក ៖ ${total || 0} កញ្ចប់\n` +
    `  🏙️ រាជធានីភ្នំពេញ ៖ ${pp_count || 0} កញ្ចប់\n` +
    `  🏞️ បណ្តាខេត្ត ៖ ${province_count || 0} កញ្ចប់\n` +
    `--------------------------------------\n` +
    `🎥 ប្រភពកន្ត្រក ៖\n` +
    `  • Live ថ្ងៃនេះ ៖ ${today_live_count || 0} កញ្ចប់\n` +
    `  • Live ម្សិលមិញ ៖ ${old_live_count || 0} កញ្ចប់\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 ស្នាដៃបុគ្គលិកច្រក ៖\n` +
    `${packerStr}\n` +
    `⏰ ពេលវេលារាយការណ៍ ៖ ${timeStr}`;

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const tgData = await tgRes.json();
    return res.json({ success: tgData.ok, message: tgData.ok ? 'បានផ្ញើទៅ Telegram រួចរាល់!' : tgData.description });
  } catch (err: any) {
    return res.json({ success: false, error: err.message });
  }
});

// GET /api/packer_history
router.get('/packer_history', (req: Request, res: Response) => {
  const packerName = (req.query.name as string || '').trim().toLowerCase();
  let logs = packerLogs;
  if (packerName) {
    logs = packerLogs.filter(l => l.packer_name.toLowerCase() === packerName);
  }
  res.json(logs);
});

// GET /api/packer_leaderboard
router.get('/packer_leaderboard', (_req: Request, res: Response) => {
  const statsMap = new Map<string, { packer_name: string; total_bags: number; total_items: number; total_duration: number }>();
  for (const log of packerLogs) {
    const p = log.packer_name;
    const existing = statsMap.get(p);
    if (existing) {
      existing.total_bags += 1;
      existing.total_items += log.items_count;
      existing.total_duration += log.duration_seconds;
    } else {
      statsMap.set(p, {
        packer_name: p,
        total_bags: 1,
        total_items: log.items_count,
        total_duration: log.duration_seconds
      });
    }
  }

  const list = Array.from(statsMap.values()).map(s => ({
    packer_name: s.packer_name,
    total_bags: s.total_bags,
    total_items: s.total_items,
    avg_duration: Math.round(s.total_duration / s.total_bags)
  })).sort((a, b) => b.total_bags - a.total_bags);

  res.json(list);
});

// GET /api/live_sessions
router.get('/live_sessions', (_req: Request, res: Response) => {
  const uniqueLiveIds = Array.from(new Set(invoices.map(i => i.live_id))).filter(Boolean).map(liveId => {
    const sample = invoices.find(i => i.live_id === liveId);
    const count = invoices.filter(i => i.live_id === liveId && i.items && i.items.length > 0).length;
    return {
      live_id: liveId,
      created_at: sample?.created_at || new Date().toISOString(),
      basket_count: count,
      is_active: liveId === activeLiveId
    };
  });
  if (activeLiveId && !uniqueLiveIds.some(l => l.live_id === activeLiveId)) {
    const count = invoices.filter(i => i.live_id === activeLiveId && i.items && i.items.length > 0).length;
    uniqueLiveIds.unshift({
      live_id: activeLiveId,
      created_at: new Date().toISOString(),
      basket_count: count,
      is_active: true
    });
  }
  // Sort so sessions with baskets come first
  uniqueLiveIds.sort((a, b) => b.basket_count - a.basket_count);
  res.json({
    sessions: uniqueLiveIds,
    active_live_id: activeLiveId
  });
});

// POST /api/set_active_live_id
router.post('/set_active_live_id', (req: Request, res: Response) => {
  const { live_id } = req.body;
  if (live_id) {
    setActiveLiveId(live_id);
    bumpDataRevision();
    return res.json({ success: true, active_live_id: live_id });
  }
  res.status(400).json({ success: false, error: 'Missing live_id' });
});

// POST /api/create_live_session
router.post('/create_live_session', (req: Request, res: Response) => {
  const { live_id } = req.body;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const newId = (live_id && String(live_id).trim()) || `LIVE_${dateStr}_${timeStr}`;

  setActiveLiveId(newId);
  bumpDataRevision();
  res.json({
    success: true,
    message: `បានបង្កើត និងប្តូរទៅកាន់វគ្គ Live ថ្មី៖ ${newId}`,
    live_id: newId
  });
});

// POST /api/comments/test_simulate - Process a test or simulated live comment
router.post('/comments/test_simulate', (req: Request, res: Response) => {
  const { text, user_name, user_id, live_id } = req.body;
  const result = parseAndAllocateComment(
    user_id || `sim_${Date.now()}`,
    user_name || 'អតិថិជន Live',
    text || '',
    live_id || activeLiveId
  );
  res.json(result);
});

// GET /api/comments/recent
router.get('/comments/recent', (_req: Request, res: Response) => {
  res.json(rawComments.slice(-30).reverse());
});

// -------------------------------------------------------------
// ✈️ Telegram Stock & Image Sync Endpoints (Bot Token Only)
// -------------------------------------------------------------

// GET /api/telegram/config - Get current Telegram configuration
router.get('/telegram/config', (_req: Request, res: Response) => {
  const token = settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || '';
  res.json({
    has_token: !!token,
    token: token,
    chat_id: settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || ''
  });
});

// POST /api/telegram/save_token - Save Bot Token
router.post('/telegram/save_token', (req: Request, res: Response) => {
  const { token, chat_id } = req.body;
  if (token !== undefined) {
    settings.telegram_token = String(token).trim();
  }
  if (chat_id !== undefined) {
    settings.telegram_chat_id = String(chat_id).trim();
  }
  saveDatabaseToDisk();
  res.json({ success: true, message: 'បានរក្សាទុក Bot Token រួចរាល់!', settings });
});

// POST /api/telegram/test_token - Verify Bot Token with Telegram getMe
router.post('/telegram/test_token', async (req: Request, res: Response) => {
  const token = (req.body.token || settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const result = await testTelegramBotToken(token);
  res.json(result);
});

// POST /api/telegram/fetch_stock - Get codes, prices & photos from Telegram via Bot Token only
router.post('/telegram/fetch_stock', async (req: Request, res: Response) => {
  const { token, default_qty, auto_import, mark_read, save_token } = req.body;
  const activeToken = (token || settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();

  if (!activeToken) {
    return res.status(400).json({
      success: false,
      error: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!'
    });
  }

  if (save_token) {
    settings.telegram_token = activeToken;
    saveDatabaseToDisk();
  }

  const result = await fetchTelegramStockUpdates({
    token: activeToken,
    defaultQty: Number(default_qty || 200),
    markRead: !!mark_read
  });

  if (!result.success) {
    return res.json(result);
  }

  let importedCount = 0;
  if (auto_import && result.items.length > 0) {
    const importRes = bulkImportStockItems(result.items.map(it => ({
      code: it.code,
      name: it.name,
      price: it.price,
      stock_qty: it.stock_qty,
      image_file: it.image_url
    })), 'merge', {
      keepExistingStockQty: req.body.keep_existing_stock_qty !== false
    });
    importedCount = importRes.imported + importRes.updated;
  }

  res.json({
    ...result,
    auto_imported: !!auto_import,
    imported_count: importedCount
  });
});

// -------------------------------------------------------------
// 📦 Stock Bulk Import & Export Endpoints
// -------------------------------------------------------------

// POST /api/stock/bulk_import
router.post('/stock/bulk_import', (req: Request, res: Response) => {
  const { items, mode, keep_existing_stock_qty } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'មិនមានទិន្នន័យសម្រាប់នាំចូលឡើយ' });
  }

  const result = bulkImportStockItems(items, mode || 'merge', {
    keepExistingStockQty: keep_existing_stock_qty !== false
  });
  res.json(result);
});

// GET /api/stock/export_csv
router.get('/stock/export_csv', (_req: Request, res: Response) => {
  // UTF-8 BOM for Excel compatibility with Khmer script
  const BOM = '\uFEFF';
  const header = 'Code,Name,Price,Stock_Qty,Cost_Price,Image_URL\n';
  const rows = products.map(p => {
    const code = `"${(p.code || '').replace(/"/g, '""')}"`;
    const name = `"${(p.name || '').replace(/"/g, '""')}"`;
    const price = p.price ?? 0;
    const stock = p.stock_qty ?? 0;
    const cost = p.cost_price ?? 0;
    const img = `"${(p.image_file || '').replace(/"/g, '""')}"`;
    return `${code},${name},${price},${stock},${cost},${img}`;
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=stock_inventory_${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(BOM + header + rows);
});

// -------------------------------------------------------------
// 🖨️ Standalone Printable Thermal Slip Endpoint
// -------------------------------------------------------------
// GET /api/print_slip/:invoice_id
router.get('/print_slip/:invoice_id', (req: Request, res: Response) => {
  const invId = parseInt(req.params.invoice_id, 10);
  const invoice = invoices.find(i => i.invoice_id === invId || i.basket_no === invId);

  if (!invoice) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>រកមិនឃើញវិក្កយបត្រ</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>❌ រកមិនឃើញកន្ត្រក #${req.params.invoice_id} ឡើយ!</h2>
          <p><a href="/">ត្រឡប់ទៅកាន់ផ្ទាំងដើម</a></p>
        </body>
      </html>
    `);
  }

  recalculateInvoice(invoice);

  // Automatically advance to STAGED (Tab 2: រង់ចាំលុយ) when print slip is generated/printed
  if (invoice.packing_stage === 'UNPICKED' || !invoice.packing_stage) {
    invoice.packing_stage = 'STAGED';
    invoice.staged_by = 'ព្រីនវិក្កយបត្រ';
    invoice.staged_at = new Date().toISOString();
    bumpDataRevision();
  }

  const subtotal = invoice.items.reduce((s, it) => s + (it.price * it.quantity), 0);
  const totalQty = invoice.items.reduce((s, it) => s + it.quantity, 0);
  const rielTotal = Math.round(invoice.total_amount * 4100).toLocaleString('en-US');
  const now = new Date();
  const dateStr = now.toLocaleDateString('km-KH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // Format Plain Text for RawBT Thermal ESC/POS printing
  const rawbtLines: string[] = [
    '================================',
    '       LIVE ORDER RECEIPT       ',
    '================================',
    `កន្ត្រក / BASKET: #${invoice.basket_no || invoice.invoice_id}`,
    `កាលបរិច្ឆេទ: ${dateStr} ${timeStr}`,
    '--------------------------------',
    `អតិថិជន: ${invoice.facebook_name}`,
    `ទូរស័ព្ទ: ${invoice.phone_number || '(គ្មាន)'}`,
    `ទីតាំង: ${invoice.address || '(គ្មាន)'}`,
    `តំបន់: ${invoice.location_label || (invoice.location_zone === 'PP' ? 'ភ្នំពេញ' : 'តាមខេត្ត')}`,
    '--------------------------------',
    'មុខទំនិញ          ចំនួន  តម្លៃ  សរុប',
    '--------------------------------',
    ...invoice.items.map(it => {
      const codePart = `កូដ [${it.product_code}]`.padEnd(14, ' ').slice(0, 14);
      const qtyPart = `x${it.quantity}`.padStart(5, ' ');
      const pricePart = `$${it.price.toFixed(2)}`.padStart(6, ' ');
      const totalPart = `$${(it.price * it.quantity).toFixed(2)}`.padStart(7, ' ');
      return `${codePart} ${qtyPart} ${pricePart} ${totalPart}`;
    }),
    '--------------------------------',
    `សរុបទំនិញ (${totalQty} មុខ): $${subtotal.toFixed(2)}`,
    `ថ្លៃដឹក: $${(invoice.shipping_fee || 2.0).toFixed(2)}`,
    `សរុបត្រូវទូទាត់: $${invoice.total_amount.toFixed(2)} (${rielTotal} ៛)`,
    `ស្ថានភាព: ${invoice.status === 'Paid' ? 'PAID (បង់រួច)' : 'UNPAID (រង់ចាំបង់)'}`,
    '================================',
    '      អរគុណសម្រាប់ការគាំទ្រ!    ',
    '================================\n\n\n'
  ];
  const rawbtBase64 = Buffer.from(rawbtLines.join('\n')).toString('base64');
  const rawbtIntentUrl = `intent:${rawbtBase64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;S.browser_fallback_url=https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter;end;`;

  const itemsHtml = invoice.items.map(it => {
    const custom = (it.product_name || '')
      .replace(new RegExp(`^ទំនិញកូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
      .replace(new RegExp(`^កូដ\\s*\\[?${it.product_code}\\]?`, 'i'), '')
      .replace(new RegExp(`\\[?${it.product_code}\\]?`, 'i'), '')
      .replace(/^ទំនិញ\s*/i, '')
      .replace(/\s*ទំនិញ$/i, '')
      .trim();
    const hasCustom = custom && custom !== 'ទំនិញ';

    return `
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; font-size: 13px; line-height: 1.25; color: #000; font-weight: 800;">
        <span style="width: 48%; word-break: break-word; color: #000;">
          <span style="font-family: 'JetBrains Mono', monospace; font-weight: 900; color: #000;">[${it.product_code}]</span>
          ${hasCustom ? `<span style="margin-left: 2px; font-weight: 800; color: #000;">${custom}</span>` : ''}
        </span>
        <span style="font-weight: 900; width: 14%; text-align: center; font-size: 14px; font-family: 'JetBrains Mono', monospace; color: #000;">x${it.quantity}</span>
        <span style="width: 18%; text-align: right; color: #000; font-family: 'JetBrains Mono', monospace; font-weight: 800;">$${it.price.toFixed(2)}</span>
        <span style="font-weight: 900; width: 20%; text-align: right; color: #000; font-family: 'JetBrains Mono', monospace;">$${(it.price * it.quantity).toFixed(2)}</span>
      </div>
      ${it.item_comment ? `<div style="font-size: 11px; color: #000; font-weight: 800; margin-left: 6px; margin-bottom: 2px;">↳ "${it.item_comment}"</div>` : ''}
    `;
  }).join('');

  const phoneText = invoice.phone_number && invoice.phone_number !== 'គ្មានលេខ' ? invoice.phone_number : '';
  const addressText = invoice.address && !invoice.address.includes('មិនទាន់មាន') ? invoice.address : '';
  const locationBadge = invoice.location_label || (invoice.location_zone === 'PP' ? 'ភ្នំពេញ' : 'តាមខេត្ត');

  const html = `
    <!DOCTYPE html>
    <html lang="km">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>វិក្កយបត្រ #${invoice.basket_no || invoice.invoice_id} - ${invoice.facebook_name}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Battambang:wght@700;900&family=JetBrains+Mono:wght@700;900&family=Kantumruy+Pro:wght@600;700;800;900&display=swap" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Battambang:wght@700;900&family=JetBrains+Mono:wght@700;900&family=Kantumruy+Pro:wght@600;700;800;900&display=swap');

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Kantumruy Pro', 'Battambang', 'Siemreap', 'Khmer OS', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.35;
          }
          body {
            background: #0a0f1d;
            color: #fff;
            padding: 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
          }
          .control-panel {
            width: 100%;
            max-width: 360px;
            background: #151d30;
            border: 1px solid #2a3b5c;
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          }
          .control-title {
            font-size: 13px;
            font-weight: bold;
            color: #38bdf8;
            margin-bottom: 8px;
            text-align: center;
          }
          .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            padding: 11px;
            margin-bottom: 7px;
            border-radius: 8px;
            font-weight: 900;
            font-size: 13.5px;
            cursor: pointer;
            text-decoration: none;
            border: none;
            transition: all 0.2s;
          }
          .btn:active { transform: scale(0.98); }
          .btn-primary { background: linear-gradient(135deg, #0284c7, #06b6d4); color: #fff; box-shadow: 0 4px 14px rgba(6,182,212,0.4); }
          .btn-rawbt { background: linear-gradient(135deg, #16a34a, #10b981); color: #fff; box-shadow: 0 4px 14px rgba(16,185,129,0.4); }
          .btn-secondary { background: #1e293b; color: #cbd5e1; border: 1px solid #334155; }
          
          .guide-box {
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 8px;
            padding: 8px 10px;
            margin-top: 6px;
            font-size: 11px;
            line-height: 1.4;
            color: #94a3b8;
          }
          .guide-box strong { color: #38bdf8; }

          /* Ultra-Compact High-Contrast Thermal 80mm Slip */
          .receipt {
            background: #ffffff;
            color: #000000;
            width: 100%;
            max-width: 350px;
            padding: 8px 10px;
            border-radius: 6px;
            box-shadow: 0 6px 24px rgba(0,0,0,0.6);
            font-size: 12.5px;
            border: 2px solid #000000;
            font-weight: 800;
          }

          /* Force all print text to pure pitch-black and bold */
          .receipt * {
            color: #000000 !important;
            font-weight: 800;
            -webkit-text-stroke: 0.12px #000;
          }

          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #000000;
            padding-bottom: 3px;
            margin-bottom: 4px;
          }
          .basket-title {
            font-size: 26px;
            font-weight: 900;
            font-family: 'JetBrains Mono', monospace;
            line-height: 1;
            color: #000000;
          }
          .zone-pill {
            font-size: 12.5px;
            font-weight: 900;
            border: 1.8px solid #000000;
            padding: 1px 7px;
            border-radius: 4px;
            color: #000000;
          }
          .datetime-tag {
            font-size: 10.5px;
            font-weight: 800;
            color: #000000;
            text-align: right;
            line-height: 1.2;
          }

          .customer-row {
            border-bottom: 1.5px dashed #000000;
            padding-bottom: 3px;
            margin-bottom: 4px;
            font-size: 12.5px;
            line-height: 1.3;
            color: #000000;
          }

          .table-header {
            display: flex;
            justify-content: space-between;
            font-weight: 900;
            font-size: 12px;
            color: #000000;
            border-bottom: 1.5px solid #000000;
            padding-bottom: 2px;
            margin-bottom: 4px;
          }

          .totals-section {
            border-top: 1.5px dashed #000000;
            padding-top: 3px;
            margin-top: 3px;
            line-height: 1.35;
          }
          .total-box {
            border: 2px solid #000000;
            padding: 3px 6px;
            border-radius: 4px;
            margin-top: 3px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #ffffff;
          }

          .footer-note {
            text-align: center;
            font-size: 11px;
            font-weight: 900;
            margin-top: 4px;
            padding-top: 3px;
            color: #000000;
          }

          @media print {
            @page {
              size: 80mm auto;
              margin: 0mm !important;
            }
            html, body {
              width: 80mm !important;
              max-width: 80mm !important;
              background: #ffffff !important;
              color: #000000 !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .control-panel { display: none !important; }
            .receipt {
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              padding: 2mm 3mm !important;
              margin: 0 !important;
              width: 80mm !important;
              max-width: 80mm !important;
              font-family: 'Kantumruy Pro', 'Battambang', sans-serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .receipt * {
              color: #000000 !important;
              -webkit-text-stroke: 0.15px #000 !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="control-panel">
          <div class="control-title">🖨️ បញ្ជាព្រីនវិក្កយបត្រ (ក្បាល/កន្ទុយខ្លី ខ្មៅដិតច្បាស់)</div>
          
          <!-- Direct Browser / AirPrint Print -->
          <button class="btn btn-primary" onclick="window.print()">
            <span>🖨️</span>
            <span>ចុចព្រីន (Print Receipt / AirPrint)</span>
          </button>

          <!-- RawBT 1-Tap Direct Graphic Image Print -->
          <button class="btn btn-rawbt" id="rawbt-btn" onclick="printWithRawBtImage()">
            <span>⚡</span>
            <span id="rawbt-btn-text">ព្រីនត្រង់ទៅ RawBT (រូបភាពច្បាស់ 100%)</span>
          </button>

          <!-- Copy Text -->
          <button class="btn btn-secondary" onclick="copyReceiptText()">
            <span id="copy-icon">📋</span>
            <span id="copy-label">ចម្លងអត្ថបទវិក្កយបត្រ</span>
          </button>

          <div class="guide-box">
            <strong>💡 ដើម្បីកុំឱ្យចេញ Link វេបសាយ (1/1 https://...) ៖</strong><br>
            ក្នុងផ្ទាំង Print សូមដោះធីក (Uncheck) <strong>«Headers and footers / ក្បាលទំព័រនិងបាតកថា»</strong> នោះវានឹងកាត់ក្បាលកន្ទុយយ៉ាងស្អាត មិនខាតក្រដាស!<br>
            <strong>⚡ RawBT ៖</strong> ចុចប៊ូតុងបៃតង វានឹង Render ជារូបភាពខ្មៅដិត 100% អក្សរខ្មែរស្អាត មិនរញ៉េរញ៉ៃ!
          </div>
        </div>

        <!-- Thermal Receipt Slip (Ultra-Compact, Pure Black Bold) -->
        <div class="receipt" id="receipt-slip">
          <!-- Compact Header: Basket + Zone + Date/Time in 1 Line -->
          <div class="header-row">
            <div style="display: flex; align-items: baseline; gap: 6px;">
              <span class="basket-title">#${invoice.basket_no || invoice.invoice_id}</span>
              <span class="zone-pill">${locationBadge}</span>
            </div>
            <div class="datetime-tag">
              <div>${dateStr}</div>
              <div>${timeStr}</div>
            </div>
          </div>

          <!-- Customer Info: Compact 1-2 lines, pure black bold -->
          <div class="customer-row">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <span>👤 <strong>${invoice.facebook_name}</strong></span>
              ${phoneText ? `<span>📞 <strong>${phoneText}</strong></span>` : ''}
            </div>
            ${addressText ? `<div style="margin-top: 1px;">📍 ${addressText}</div>` : ''}
          </div>

          <!-- Items Table: Tight, Bold -->
          <div class="table-header">
            <span style="width: 48%;">មុខទំនិញ</span>
            <span style="width: 14%; text-align: center;">ចំនួន</span>
            <span style="width: 18%; text-align: right;">តម្លៃ</span>
            <span style="width: 20%; text-align: right;">សរុប</span>
          </div>

          ${itemsHtml}

          <!-- Compact Totals & Tail -->
          <div class="totals-section">
            <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; color: #000;">
              <span>ទំនិញ (${totalQty} មុខ): <strong>$${subtotal.toFixed(2)}</strong></span>
              <span>ថ្លៃដឹក: <strong>$${(invoice.shipping_fee || 0).toFixed(2)}</strong></span>
            </div>

            <div class="total-box">
              <div>
                <span style="font-size: 13px; font-weight: 900;">សរុប ៖</span>
                <span style="font-size: 21px; font-weight: 900; font-family: 'JetBrains Mono', monospace; line-height: 1;">$${invoice.total_amount.toFixed(2)}</span>
                <span style="font-size: 11px; font-weight: 800; margin-left: 2px;">(${rielTotal}៛)</span>
              </div>
              <span style="font-size: 12px; font-weight: 900; border: 1.5px solid #000; padding: 1px 6px; border-radius: 3px;">
                ${invoice.status === 'Paid' ? '✅ PAID' : '⏳ UNPAID'}
              </span>
            </div>
          </div>

          <!-- 1-Line Compact Footer -->
          <div class="footer-note">
            🙏 អរគុណសម្រាប់ការគាំទ្រ! (#${invoice.basket_no || invoice.invoice_id})
          </div>
        </div>

        <script>
          function copyReceiptText() {
            const txt = atob('${rawbtBase64}');
            navigator.clipboard.writeText(txt).then(function() {
              document.getElementById('copy-label').innerText = '✅ បានចម្លងរួចរាល់!';
              setTimeout(function() {
                document.getElementById('copy-label').innerText = 'ចម្លងអត្ថបទវិក្កយបត្រ';
              }, 2500);
            }).catch(function() {
              alert('ចម្លងមិនបាន');
            });
          }

          async function printWithRawBtImage() {
            const el = document.getElementById('receipt-slip');
            const btnText = document.getElementById('rawbt-btn-text');
            if (!el) return;

            try {
              btnText.innerText = '⚡ កំពុង Render រូបភាព...';
              
              // Stage pack on backend
              fetch('/api/stage_pack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoice_id: ${invoice.invoice_id}, packer_name: 'RawBT' }),
                keepalive: true
              });

              if (typeof html2canvas !== 'undefined') {
                const canvas = await html2canvas(el, {
                  scale: 2,
                  backgroundColor: '#ffffff',
                  useCORS: true,
                  logging: false
                });
                const base64Data = canvas.toDataURL('image/png').replace(/^data:image\\/png;base64,/, '');
                btnText.innerText = '✅ បានបញ្ជូនទៅ RawBT!';
                window.location.href = 'rawbt:data:image/png;base64,' + base64Data;
              } else {
                window.print();
              }
            } catch (err) {
              console.error(err);
              window.print();
            } finally {
              setTimeout(function() {
                btnText.innerText = 'ព្រីនត្រង់ទៅ RawBT (រូបភាពច្បាស់ 100%)';
              }, 3000);
            }
          }

          // Auto open print if opened directly from external tab
          window.addEventListener('load', function() {
            setTimeout(function() {
              if (window.location.search.includes('autoprint=true')) {
                window.print();
              }
            }, 500);
          });
        </script>
      </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;
