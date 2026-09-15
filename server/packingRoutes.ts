import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import net from 'net';
import https from 'https';
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
  saveDatabaseToDisk,
  activeFacebookPage
} from './db';
import { getSqliteDatabaseBuffer, persistToSqlite } from './sqlite';
import { parseAndAllocateComment } from './parser';
import { detectDeliveryZone } from './locationHelper';
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
    if (image_file !== undefined) {
      const imgVal = image_file || '';
      prod.image_file = imgVal;
      // Cascade image ONLY to the currently ACTIVE live session and ONLY unpicked pending invoices
      for (const inv of invoices) {
        if (
          inv.live_id === activeLiveId &&
          inv.status === 'Pending' &&
          inv.packing_stage === 'UNPICKED'
        ) {
          for (const it of inv.items) {
            if (it.product_code.toUpperCase() === cleanCode) {
              it.image_file = imgVal;
            }
          }
        }
      }
    }

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
router.post('/upload_product_image', async (req: Request, res: Response) => {
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

    // Format Date YYYYMMDD (e.g. 20260914)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    const filename = `${cleanCode}_${dateStr}.jpg`;
    const filePath = path.join(uploadDir, filename);

    // Process image to 500x500 Square HD Center Crop using Sharp
    const processedBuffer = await sharp(fileBuffer)
      .rotate()
      .resize(500, 500, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    fs.writeFileSync(filePath, processedBuffer);

    const publicUrl = `/uploads/${filename}`;

    // Automatically update product if code provided
    if (code) {
      const targetProd = products.find(p => p.code.toUpperCase() === String(code).trim().toUpperCase());
      if (targetProd) {
        targetProd.image_file = publicUrl;
      }
      // Cascade to unpicked pending baskets in the active live session only
      for (const inv of invoices) {
        if (
          inv.live_id === activeLiveId &&
          inv.status === 'Pending' &&
          inv.packing_stage === 'UNPICKED'
        ) {
          for (const orderItem of inv.items) {
            if (orderItem.product_code.toUpperCase() === cleanCode) {
              orderItem.image_file = publicUrl;
            }
          }
        }
      }
      bumpDataRevision();
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

// POST /api/send_vip_invoice & /api/notify_customer_packed
router.post(['/send_vip_invoice', '/notify_customer_packed', '/api/send_vip_invoice', '/api/notify_customer_packed'], async (req: Request, res: Response) => {
  const { invoice_id, facebook_name, custom_message } = req.body;
  const cleanId = typeof invoice_id === 'number' ? invoice_id : parseInt(String(invoice_id || '').replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);

  if (!inv) {
    return res.status(404).json({ success: false, error: `រកមិនឃើញកន្ត្រក #${cleanId}` });
  }

  const customerName = inv.facebook_name || facebook_name || 'អតិថិជន VIP';
  const phone = inv.phone_number && inv.phone_number !== 'គ្មានលេខ' ? inv.phone_number : 'មិនទាន់មាន';
  const address = inv.address && !inv.address.includes('មិនទាន់មាន') ? inv.address : 'មិនទាន់មាន';

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
  const freeShipLimit = settings.free_ship_threshold || 0.0;
  const isFreeShip = freeShipLimit > 0 && subtotal >= freeShipLimit;
  const shippingFee = isFreeShip ? 0.0 : (inv.shipping_fee && inv.shipping_fee > 0 ? inv.shipping_fee : (settings.default_shipping_fee || 2.0));
  const exactTotal = Number((subtotal + shippingFee).toFixed(2));
  const totalKhr = Math.round(exactTotal * (settings.exchange_rate || 4100)).toLocaleString('en-US');

  const vipMsg = custom_message || (
    `🎉 ជម្រាបសួរចា៎បង ${customerName}! អីវ៉ាន់កន្ត្រក #${inv.basket_no || cleanId} ត្រូវបានរៀបចំច្រករួចរាល់ហើយចា៎ 🛍️\n\n` +
    `🧾 វិក្កយបត្រកុម្ម៉ង់ទំនិញ (VIP INVOICE)\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 អតិថិជន ៖ ${customerName}\n` +
    `📞 ទូរស័ព្ទ  ៖ ${phone}\n` +
    `📍 ទីតាំង   ៖ ${address}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 បញ្ជីទំនិញកាត់បាន ៖\n` +
    `${itemsList || '  🔹 ទំនិញទូទៅ'}\n` +
    `----------------------------------\n` +
    `📦 ចំនួនសរុប ៖ ${totalQty} ឈុត\n` +
    `💵 តម្លៃទំនិញ ៖ $${subtotal.toFixed(2)}\n` +
    `🚚 សេវាដឹកជញ្ជូន ៖ ${shippingFee === 0 ? 'FREE ហ្វ្រីដឹក' : `+$${shippingFee.toFixed(2)}`}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💰 សរុបត្រូវទូទាត់ ៖ $${exactTotal.toFixed(2)} / ${totalKhr} រៀល\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🏦 គណនីវេរប្រាក់ (ABA / KHQR) ៖\n` +
    `💳 លេខកុង ABA ៖ ${settings.bakong_id || '000474559@aba'}\n` +
    `👤 ឈ្មោះគណនី ៖ ${settings.merchant_name || 'KARI ARNETT'}\n\n` +
    `🙏 សូមបងជួយវេរប្រាក់ និងផ្ញើ Slip មកកាន់ប្រអប់ឆាតនេះ ដើម្បីខាងប្អូនបញ្ចេញកញ្ចប់អីវ៉ាន់ជូន Delivery ដឹកជូនភ្លាមៗចា៎ 🥰`
  );

  // Find recent comment ID if any
  let commentId: string | null = null;
  const recentComment = rawComments.find(c => 
    (c.invoice_id === cleanId || c.facebook_name?.toLowerCase() === customerName.toLowerCase() || (inv.facebook_user_id && c.facebook_user_id === inv.facebook_user_id)) &&
    c.comment_id && !c.comment_id.startsWith('sys_') && !c.comment_id.startsWith('manual_')
  );
  if (recentComment?.comment_id) {
    commentId = recentComment.comment_id;
  }

  let replyRes: { success: boolean; error?: string } = { success: true };
  try {
    replyRes = await sendFacebookReply(commentId, inv.facebook_user_id, vipMsg);
  } catch (err: any) {
    console.warn('[VIP] sendFacebookReply error:', err);
    replyRes = { success: false, error: err?.message || 'Meta API error' };
  }

  // Update invoice message status accurately
  if (replyRes.success) {
    inv.msg_status = 'SENT';
    inv.msg_error = '';
  } else {
    inv.msg_status = 'FAILED';
    inv.msg_error = replyRes.error || 'Facebook Meta API rejected message';
  }
  bumpDataRevision();
  saveDatabaseToDisk();

  res.json({
    success: replyRes.success,
    msg_status: inv.msg_status,
    error: replyRes.error,
    message: replyRes.success ? 'បានផ្ញើវិក្កយបត្រ VIP ទៅកាន់ Messenger ជោគជ័យ!' : (replyRes.error || 'មិនអាចផ្ញើសារបានទេ ➔ សូមចុចឆាតផ្ទាល់'),
    vip_message: vipMsg,
    recipient_name: customerName,
    facebook_user_id: inv.facebook_user_id,
    fb_delivery: replyRes
  });
});

// POST /api/update_customer_contact
router.post('/update_customer_contact', (req: Request, res: Response) => {
  const { invoice_id, facebook_name, phone, address } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);

  if (inv) {
    if (phone) inv.phone_number = String(phone).trim();
    if (address !== undefined) {
      inv.address = String(address).trim();
      const allText = `${inv.address || ''} ${(inv.comments || []).join(' ')} ${inv.phone_number || ''}`.trim();
      const { zone, label } = detectDeliveryZone(allText);
      inv.location_zone = zone;
      inv.location_label = label;
    }
  }

  const cust = customers.find(c => c.facebook_name.toLowerCase() === String(facebook_name || '').trim().toLowerCase());
  if (cust) {
    if (phone) cust.phone_number = String(phone).trim();
    if (address !== undefined) cust.address = String(address).trim();
  }

  bumpDataRevision();
  res.json({ success: true, location_zone: inv?.location_zone, location_label: inv?.location_label });
});

function isInvoiceLockedByOther(invoiceId: number, reqPackerName?: string): { locked: boolean; lockedBy?: string } {
  cleanExpiredLocks();
  const lock = activeInvoiceLocks.get(invoiceId);
  if (!lock) return { locked: false };
  if (!reqPackerName || lock.packer_name.trim().toLowerCase() !== String(reqPackerName).trim().toLowerCase()) {
    return { locked: true, lockedBy: lock.packer_name };
  }
  return { locked: false };
}

// POST /api/set_item_qty_direct
router.post('/set_item_qty_direct', (req: Request, res: Response) => {
  const { invoice_id, code, new_qty, packer_name } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const cleanCode = String(code).trim().toUpperCase();
  const targetQty = Math.max(0, parseInt(String(new_qty || 0), 10));

  const lockCheck = isInvoiceLockedByOther(cleanId, packer_name);
  if (lockCheck.locked) {
    return res.status(409).json({
      success: false,
      message: `កន្ត្រកនេះត្រូវបានចាក់សោដោយ «${lockCheck.lockedBy}»!`
    });
  }

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
  const { invoice_id, code, quantity, comment_text, packer_name } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const cleanCode = String(code).trim().toUpperCase();
  const addQty = Math.max(1, parseInt(String(quantity || 1), 10));

  const lockCheck = isInvoiceLockedByOther(cleanId, packer_name);
  if (lockCheck.locked) {
    return res.status(409).json({
      success: false,
      message: `កន្ត្រកនេះត្រូវបានចាក់សោដោយ «${lockCheck.lockedBy}»!`
    });
  }

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
      item_comment: comment_text || '',
      image_file: prod.image_file || ''
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
    const count = invoices.filter(i => i.live_id === liveId && i.status !== 'Cancelled').length;
    return {
      live_id: liveId,
      created_at: sample?.created_at || new Date().toISOString(),
      basket_count: count,
      is_active: liveId === activeLiveId
    };
  });
  if (activeLiveId && !uniqueLiveIds.some(l => l.live_id === activeLiveId)) {
    const count = invoices.filter(i => i.live_id === activeLiveId && i.status !== 'Cancelled').length;
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

// POST /api/delete_live_session - Delete a live session and all associated baskets
router.post('/delete_live_session', (req: Request, res: Response) => {
  const { live_id } = req.body;
  if (!live_id) {
    return res.status(400).json({ success: false, error: 'Missing live_id' });
  }

  const cleanLiveId = String(live_id).trim();

  // Remove invoices for this live session
  const initialInvoiceCount = invoices.length;
  for (let i = invoices.length - 1; i >= 0; i--) {
    if (invoices[i].live_id === cleanLiveId) {
      invoices.splice(i, 1);
    }
  }
  const deletedInvoicesCount = initialInvoiceCount - invoices.length;

  // Remove raw comments associated with this live session
  for (let i = rawComments.length - 1; i >= 0; i--) {
    if (rawComments[i].live_id === cleanLiveId) {
      rawComments.splice(i, 1);
    }
  }

  // If the deleted session was currently the activeLiveId, switch to another remaining session
  if (activeLiveId === cleanLiveId) {
    const remainingLiveIds = Array.from(new Set(invoices.map(i => i.live_id))).filter(Boolean);
    if (remainingLiveIds.length > 0) {
      setActiveLiveId(remainingLiveIds[0]);
    } else {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      setActiveLiveId(`LIVE_${dateStr}_${timeStr}`);
    }
  }

  bumpDataRevision();
  saveDatabaseToDisk();

  console.log(`[Live Session Deleted] Deleted live #${cleanLiveId.slice(-8)} with ${deletedInvoicesCount} invoices.`);

  res.json({
    success: true,
    message: `បានលុបវគ្គ Live #${cleanLiveId.slice(-8)} (សរុប ${deletedInvoicesCount} កន្ត្រក) ជោគជ័យ!`,
    deleted_live_id: cleanLiveId,
    deleted_baskets_count: deletedInvoicesCount,
    active_live_id: activeLiveId
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
    markRead: !!mark_read,
    clearCache: !!req.body.clear_cache
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

  const phoneText = invoice.phone_number && invoice.phone_number !== 'គ្មានលេខ' ? invoice.phone_number : '';
  const addressText = invoice.address && !invoice.address.includes('មិនទាន់មាន') ? invoice.address : '';
  const locationBadge = invoice.location_label || (invoice.location_zone === 'PP' ? 'ភ្នំពេញ' : 'តាមខេត្ត');
  const avatarUrl = invoice.picture_url || (invoice.facebook_user_id && !['FB_USER_ID_STREAM', 'MANUAL_USER_ID', 'NONE'].includes(invoice.facebook_user_id)
    ? `https://graph.facebook.com/v21.0/${invoice.facebook_user_id}/picture?type=square&width=120&height=120`
    : null);

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
      <div style="display: flex; flex-direction: column; font-size: 17px; line-height: 1.3; color: #000; margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; font-weight: 800;">
          <span style="width: 48%; word-break: break-word; color: #000; display: flex; align-items: baseline; gap: 4px;">
            <span style="border: 2px solid #000; border-radius: 3px; width: 16px; height: 16px; display: inline-block; flex-shrink: 0;"></span>
            <span style="font-family: 'JetBrains Mono', monospace; font-weight: 900; font-size: 20px; color: #000;">[${it.product_code}]</span>
            ${hasCustom ? `<span style="margin-left: 4px; font-weight: 800; color: #000; font-size: 15px;">${custom}</span>` : ''}
          </span>
          <span style="font-weight: 900; width: 16%; text-align: center; font-size: 24px; font-family: 'JetBrains Mono', monospace; color: #000;">x${it.quantity}</span>
          <span style="width: 18%; text-align: right; color: #000; font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 16px;">$${it.price.toFixed(2)}</span>
          <span style="font-weight: 900; width: 18%; text-align: right; color: #000; font-family: 'JetBrains Mono', monospace; font-size: 19px;">$${(it.price * it.quantity).toFixed(2)}</span>
        </div>
        ${it.item_comment ? `<div style="font-size: 14px; color: #000; font-weight: 800; margin-left: 24px; margin-top: 2px;">↳ Note: "${it.item_comment}"</div>` : ''}
      </div>
    `;
  }).join('');

  const plainReceiptLines = [
    `កន្ត្រក #${invoice.basket_no || invoice.invoice_id} | ${invoice.facebook_name}`,
    `ទូរស័ព្ទ: ${phoneText || 'គ្មាន'}`,
    `ទីតាំង: ${locationBadge} ${addressText ? ' - ' + addressText : ''}`,
    `--------------------------------`,
    ...invoice.items.map(it => `[${it.product_code}] x${it.quantity} = $${(it.price * it.quantity).toFixed(2)}`),
    `--------------------------------`,
    `សរុប: $${invoice.total_amount.toFixed(2)} (${rielTotal} ៛)`,
    `អ្នកវេចខ្ចប់: ${invoice.staged_by || 'Counter'}`
  ].join('\n');
  const plainReceiptBase64 = Buffer.from(plainReceiptLines, 'utf8').toString('base64');

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

          /* High-Contrast Full 80mm Thermal Slip */
          .receipt {
            background: #ffffff;
            color: #000000;
            width: 100%;
            max-width: 480px;
            padding: 14px 14px 20px 14px;
            border-radius: 8px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.7);
            font-size: 16px;
            border: 2px solid #000000;
            font-weight: 800;
            line-height: 1.35;
          }

          /* Force all print text to pure pitch-black and bold */
          .receipt * {
            color: #000000 !important;
            font-weight: 800;
            -webkit-text-stroke: 0.15px #000;
          }

          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #000000;
            padding-bottom: 6px;
            margin-bottom: 8px;
          }
          .basket-title {
            font-size: 38px;
            font-weight: 900;
            font-family: 'JetBrains Mono', monospace;
            line-height: 1;
            color: #000000;
          }
          .zone-pill {
            font-size: 16px;
            font-weight: 900;
            border: 2px solid #000000;
            padding: 2px 8px;
            border-radius: 4px;
            color: #000000;
          }
          .datetime-tag {
            font-size: 13px;
            font-weight: 900;
            color: #000000;
            text-align: right;
            line-height: 1.25;
          }

          .customer-row {
            border-bottom: 2px dashed #000000;
            padding-bottom: 6px;
            margin-bottom: 8px;
            font-size: 17px;
            line-height: 1.35;
            color: #000000;
          }

          .table-header {
            display: flex;
            justify-content: space-between;
            font-weight: 900;
            font-size: 16px;
            color: #000000;
            border-bottom: 2.5px solid #000000;
            padding-bottom: 4px;
            margin-bottom: 8px;
          }

          .totals-section {
            border-top: 2px dashed #000000;
            padding-top: 6px;
            margin-top: 8px;
            line-height: 1.35;
          }
          .total-box {
            border: 3px solid #000000;
            padding: 6px 10px;
            border-radius: 6px;
            margin-top: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #ffffff;
          }

          .footer-note {
            text-align: center;
            font-size: 15px;
            font-weight: 900;
            margin-top: 10px;
            padding-top: 6px;
            color: #000000;
          }

          .cut-line {
            text-align: center;
            font-size: 13px;
            font-weight: 800;
            margin-top: 8px;
            border-top: 1px dashed #000000;
            padding-top: 6px;
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
              padding: 2mm 2mm 26mm 2mm !important;
              margin: 0 !important;
              width: 80mm !important;
              max-width: 80mm !important;
              font-family: 'Kantumruy Pro', 'Battambang', sans-serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .receipt * {
              color: #000000 !important;
              -webkit-text-stroke: 0.18px #000 !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="control-panel">
          <div class="control-title">🖨️ បញ្ជាព្រីនវិក្កយបត្រ 80mm (កាត់ក្រដាស & ចេញពេញ)</div>
          
          <!-- Print Agent Direct Print with Auto-Cut -->
          <button class="btn btn-primary" id="agent-btn" onclick="printWithAgent()">
            <span>🏪</span>
            <span id="agent-btn-text">ព្រីនតាម Shop Agent (កាត់ក្រដាសស្វ័យប្រវត្តិ)</span>
          </button>

          <!-- Direct Browser / AirPrint Print -->
          <button class="btn btn-secondary" onclick="window.print()">
            <span>🖨️</span>
            <span>ចុចព្រីនផ្ទាល់ (Browser / AirPrint)</span>
          </button>

          <!-- Copy Text -->
          <button class="btn btn-secondary" onclick="copyReceiptText()">
            <span id="copy-icon">📋</span>
            <span id="copy-label">ចម្លងអត្ថបទវិក្កយបត្រ</span>
          </button>

          <div class="guide-box">
            <strong>✂️ បញ្ជាកាត់ក្រដាសស្វ័យប្រវត្តិ (Auto-Cut) ៖</strong><br>
            ប៊ូតុងពណ៌ខៀវ «ព្រីនតាម Shop Agent» នឹងបញ្ជូនកិច្ចការព្រីនទៅកាន់ Print Agent ក្នុងហាង ហើយកាត់ក្រដាសស្វ័យប្រវត្តិភ្លាម!<br>
            <strong>💡 ពេលព្រីន Browser ៖</strong> សូមដោះធីក (Uncheck) <strong>«Headers and footers»</strong> ដើម្បីកុំឱ្យខាតក្រដាស។
          </div>
        </div>

        <!-- Thermal Receipt Slip (High-Contrast, Pure Black Bold) -->
        <div class="receipt" id="receipt-slip">
          <!-- 1. Store Header (Matching Python main_window / print_manager) -->
          <div style="text-align: center; border-bottom: 3px solid #000; padding-bottom: 6px; margin-bottom: 8px;">
            <div style="font-size: 24px; font-weight: 900; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 1px; color: #000;">
              KARI ARNETT BOUTIQUE
            </div>
            <div style="font-size: 13px; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 0.5px;">
              PREMIUM LIVE FULFILLMENT
            </div>
          </div>

          <!-- 2. Basket / Invoice No + Zone + Date/Time -->
          <div class="header-row">
            <div style="display: flex; align-items: baseline; gap: 6px;">
              <span style="font-size: 14px; font-weight: 900;">វិក្កយបត្រ ៖</span>
              <span class="basket-title">#${invoice.basket_no || invoice.invoice_id}</span>
              <span class="zone-pill">${locationBadge}</span>
            </div>
            <div class="datetime-tag">
              <div>${dateStr}</div>
              <div>${timeStr}</div>
            </div>
          </div>

          <!-- 3. Customer Info (with Profile Avatar next to customer info) -->
          <div class="customer-row" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div style="flex: 1;">
              <div>
                <span style="font-size: 14px; font-weight: 800;">អតិថិជន ៖ </span>
                <strong style="font-size: 19px; font-weight: 900;">${invoice.facebook_name}</strong>
              </div>
              ${phoneText ? `
                <div style="margin-top: 2px;">
                  <span style="font-size: 14px; font-weight: 800;">ទូរស័ព្ទ  ៖ </span>
                  <strong style="font-size: 19px; font-weight: 900; font-family: 'JetBrains Mono', monospace;">${phoneText}</strong>
                </div>
              ` : ''}
              ${addressText ? `<div style="margin-top: 3px; font-size: 15px;">📍 ${addressText}</div>` : ''}
            </div>
            ${avatarUrl ? `
              <div style="width: 60px; height: 60px; border-radius: 50%; border: 2.5px solid #000; overflow: hidden; flex-shrink: 0;">
                <img src="${avatarUrl}" alt="" style="width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous" />
              </div>
            ` : ''}
          </div>

          <!-- 4. Items Table: Checklist with Checkboxes [ ] -->
          <div class="table-header">
            <span style="width: 48%;">📋 បញ្ជីទំនិញ (PACKING LIST)</span>
            <span style="width: 16%; text-align: center;">ចំនួន</span>
            <span style="width: 18%; text-align: right;">តម្លៃ</span>
            <span style="width: 18%; text-align: right;">សរុប</span>
          </div>

          ${itemsHtml}

          <!-- 5. Totals Section -->
          <div class="totals-section">
            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; color: #000;">
              <span>ចំនួនសរុប ៖</span>
              <strong>${totalQty} ឈុត</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; color: #000; margin-top: 2px;">
              <span>តម្លៃទំនិញ ៖</span>
              <strong>$${subtotal.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; color: #000; margin-top: 2px;">
              <span>សេវាដឹក ៖</span>
              <strong>${invoice.shipping_fee === 0 ? 'FREE SHIPPING' : '+$' + (invoice.shipping_fee || 2.0).toFixed(2)}</strong>
            </div>

            <div class="total-box">
              <div style="display: flex; align-items: baseline; gap: 6px;">
                <span style="font-size: 16px; font-weight: 900;">TOTAL :</span>
                <span style="font-size: 28px; font-weight: 900; font-family: 'JetBrains Mono', monospace; line-height: 1;">$${invoice.total_amount.toFixed(2)}</span>
                <span style="font-size: 14px; font-weight: 800; margin-left: 3px;">(${rielTotal} R)</span>
              </div>
              <span style="font-size: 14px; font-weight: 900; border: 2px solid #000; padding: 2px 8px; border-radius: 4px;">
                ${invoice.status === 'Paid' ? '✅ PAID' : '⏳ UNPAID'}
              </span>
            </div>
          </div>

          <!-- 6. Store Policy Footer (Matching Python print_manager) -->
          <div class="footer-note" style="line-height: 1.35;">
            <div>អរគុណចំពោះការគាំទ្រ KARI ARNETT!</div>
            <div style="font-size: 13px; font-weight: 800;">ទំនិញទិញហើយមិនអាចប្តូរវិញបានទេ</div>
          </div>

          <!-- 7. Cut Marker -->
          <div class="cut-line">
            - - - - - - - - - - [ កាត់ត្រង់នេះ ✂️ ] - - - - - - - - - -
          </div>
        </div>

        <script>
          function copyReceiptText() {
            const txt = atob('${plainReceiptBase64}');
            navigator.clipboard.writeText(txt).then(function() {
              document.getElementById('copy-label').innerText = '✅ បានចម្លងរួចរាល់!';
              setTimeout(function() {
                document.getElementById('copy-label').innerText = 'ចម្លងអត្ថបទវិក្កយបត្រ';
              }, 2500);
            }).catch(function() {
              alert('ចម្លងមិនបាន');
            });
          }

          // ESC/POS Raster image converter for 80mm thermal with auto-cut
          function canvasToEscPos(canvas) {
            const width = canvas.width;
            const height = canvas.height;
            const ctx = canvas.getContext('2d');
            const imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;

            const widthBytes = Math.ceil(width / 8);
            const rasterBytes = [];

            for (let y = 0; y < height; y++) {
              for (let b = 0; b < widthBytes; b++) {
                let byteVal = 0;
                for (let bit = 0; bit < 8; bit++) {
                  const x = b * 8 + bit;
                  if (x < width) {
                    const idx = (y * width + x) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const bVal = data[idx + 2];
                    const a = data[idx + 3];
                    const luminance = a < 128 ? 255 : (0.299 * r + 0.587 * g + 0.114 * bVal);
                    if (luminance < 165) {
                      byteVal |= (1 << (7 - bit));
                    }
                  }
                }
                rasterBytes.push(byteVal);
              }
            }

            const commands = [];
            // Init printer
            commands.push(0x1B, 0x40);
            // Center alignment
            commands.push(0x1B, 0x61, 0x01);
            // Raster command GS v 0
            const xL = widthBytes & 0xFF;
            const xH = (widthBytes >> 8) & 0xFF;
            const yL = height & 0xFF;
            const yH = (height >> 8) & 0xFF;
            commands.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

            for (let i = 0; i < rasterBytes.length; i++) {
              commands.push(rasterBytes[i]);
            }

            // Feed 5 lines past printhead
            commands.push(0x1B, 0x64, 0x05);
            // Auto-Cut commands (GS V 66 0 & GS V 0)
            commands.push(0x1D, 0x56, 0x42, 0x00);
            commands.push(0x1D, 0x56, 0x00);

            return new Uint8Array(commands);
          }

          function uint8ToBase64(bytes) {
            let binary = '';
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            return window.btoa(binary);
          }

          async function printWithAgent() {
            const el = document.getElementById('receipt-slip');
            const btnText = document.getElementById('agent-btn-text');
            if (!el) return;

            try {
              btnText.innerText = '⚡ កំពុង Render & បង្កើតកូដកាត់ក្រដាស...';
              
              if (typeof html2canvas !== 'undefined') {
                // 576 dots is exact 80mm thermal printable width at 203 DPI (72mm)
                const canvas = await html2canvas(el, {
                  width: 576,
                  scale: 1,
                  backgroundColor: '#ffffff',
                  useCORS: true,
                  logging: false
                });

                const escPosBytes = canvasToEscPos(canvas);
                const b64 = uint8ToBase64(escPosBytes);

                btnText.innerText = '📡 កំពុងបញ្ជូនទៅ Shop Print Agent...';

                const res = await fetch('/api/print_agent/job', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    invoice_id: ${invoice.invoice_id},
                    basket_no: '${invoice.basket_no || invoice.invoice_id}',
                    customer_name: '${invoice.facebook_name || ''}',
                    escpos_base64: b64,
                    packer_name: 'Shop Agent Web'
                  })
                });

                const data = await res.json();
                if (data.success) {
                  if (data.is_agent_online) {
                    btnText.innerText = '✅ បានព្រីនតាម Shop Agent រួចរាល់!';
                  } else {
                    btnText.innerText = '⚠️ បញ្ជូនចូល Queue រួច (Agent Offline)';
                    alert('⚠️ Print Agent ក្នុងហាងមិនទាន់បើកដំណើរការ (Offline)។ សូមបើក pos-agent.js លើកុំព្យូទ័រហាង ឬប្រើប្រាស់ Browser Print!');
                  }
                } else {
                  window.print();
                }
              } else {
                window.print();
              }
            } catch (err) {
              console.error(err);
              window.print();
            } finally {
              setTimeout(function() {
                btnText.innerText = 'ព្រីនតាម Shop Agent (កាត់ក្រដាសស្វ័យប្រវត្តិ)';
              }, 3500);
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

// -------------------------------------------------------------
// 🌐 Direct Wi-Fi / LAN Network POS Printing Endpoint (Port 9100)
// -------------------------------------------------------------
function isPrivateLanIp(ip: string): boolean {
  const clean = ip.trim();
  return /^192\.168\./.test(clean) || /^10\./.test(clean) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean) || clean === '127.0.0.1' || clean === 'localhost';
}

// POST /api/print_lan
router.post('/print_lan', async (req: Request, res: Response) => {
  try {
    const { invoice_id, printer_ip, printer_port = 9100, escpos_base64, packer_name } = req.body;

    if (!printer_ip || !String(printer_ip).trim()) {
      return res.status(400).json({
        success: false,
        error: 'សូមបញ្ចូលអាសយដ្ឋាន IP ម៉ាស៊ីនព្រីន (ឧ. 192.168.0.200)'
      });
    }

    const cleanIp = String(printer_ip).trim();
    const port = parseInt(String(printer_port || 9100), 10);
    const isPrivate = isPrivateLanIp(cleanIp);

    if (invoice_id) {
      const invId = Number(invoice_id);
      const inv = invoices.find(i => i.invoice_id === invId || i.basket_no === invId);
      if (inv && (inv.packing_stage === 'UNPICKED' || !inv.packing_stage)) {
        inv.packing_stage = 'STAGED';
        inv.staged_by = packer_name || 'POS Wi-Fi/LAN';
        inv.staged_at = new Date().toISOString();
        bumpDataRevision();
      }
    }

    let buffer: Buffer;
    if (escpos_base64) {
      buffer = Buffer.from(escpos_base64, 'base64');
    } else {
      // Basic ESC/POS fallback test slip
      const init = Buffer.from([0x1B, 0x40, 0x1B, 0x61, 0x01]);
      const content = Buffer.from(`\n=== POS NETWORK TEST ===\nPRINTER: ${cleanIp}:${port}\nDATE: ${new Date().toLocaleString()}\n\n`, 'utf8');
      const cut = Buffer.from([0x1D, 0x56, 0x42, 0x00, 0x1D, 0x56, 0x00]);
      buffer = Buffer.concat([init, content, cut]);
    }

    const socket = new net.Socket();
    socket.setTimeout(2500);

    await new Promise<void>((resolve, reject) => {
      socket.connect(port, cleanIp, () => {
        socket.write(buffer, () => {
          socket.end();
          resolve();
        });
      });
      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });
      socket.on('timeout', () => {
        socket.destroy();
        if (isPrivate) {
          reject(new Error(`ម៉ាស៊ីនមេ Online (Cloud) មិនអាចបាញ់ចូល IP ក្នុងផ្ទះ/ហាង ${cleanIp}:${port} បានឡើយ (Private LAN Network)។ សូមប្រើប្រាស់ជម្រើស «⚡ Bluetooth POS» (ភ្ជាប់ទូរស័ព្ទផ្ទាល់ 1-Tap) ឬ «🖨️ AirPrint» ឬ «📱 RawBT (Wi-Fi 192.168.0.200)»!`));
        } else {
          reject(new Error(`ភ្ជាប់ទៅកាន់ម៉ាស៊ីនព្រីន ${cleanIp}:${port} ហួសពេលកំណត់ (Timeout)! សូមពិនិត្យមើល IP និងសេវា Wi-Fi!`));
        }
      });
    });

    return res.json({
      success: true,
      message: `បានព្រីន និងបញ្ជាកាត់ក្រដាសទៅម៉ាស៊ីន Wi-Fi ${cleanIp}:${port} ជោគជ័យ!`
    });
  } catch (err: any) {
    const cleanIp = String(req.body.printer_ip || '').trim();
    const isPrivate = isPrivateLanIp(cleanIp);
    if (isPrivate) {
      console.warn('[Print LAN Notice]: Cloud server cannot reach local private IP:', cleanIp);
    } else {
      console.error('[Print LAN Error]:', err?.message || err);
    }
    return res.status(200).json({
      success: false,
      isCloudPrivateIp: isPrivate,
      error: err?.message || 'មិនអាចភ្ជាប់ទៅកាន់ម៉ាស៊ីនព្រីនតាម Wi-Fi/LAN បានទេ!'
    });
  }
});

// POST /api/test_lan_printer
router.post('/test_lan_printer', async (req: Request, res: Response) => {
  try {
    const { printer_ip, printer_port = 9100 } = req.body;
    if (!printer_ip) {
      return res.status(400).json({ success: false, error: 'Printer IP ត្រូវបានទាមទារ!' });
    }

    const cleanIp = String(printer_ip).trim();
    const port = parseInt(String(printer_port || 9100), 10);
    const isPrivate = isPrivateLanIp(cleanIp);

    const init = Buffer.from([0x1B, 0x40, 0x1B, 0x61, 0x01]);
    const content = Buffer.from(
      `\n================================\n` +
      `      KARI ARNETT BOUTIQUE      \n` +
      `    POS NETWORK PRINTER TEST    \n` +
      `================================\n` +
      `IP   : ${cleanIp}:${port}\n` +
      `TIME : ${new Date().toLocaleTimeString()}\n` +
      `STATUS: CONNECTED OK!\n` +
      `================================\n\n\n`,
      'utf8'
    );
    const cut = Buffer.from([0x1D, 0x56, 0x42, 0x00, 0x1D, 0x56, 0x00]);
    const buffer = Buffer.concat([init, content, cut]);

    const socket = new net.Socket();
    socket.setTimeout(2500);

    await new Promise<void>((resolve, reject) => {
      socket.connect(port, cleanIp, () => {
        socket.write(buffer, () => {
          socket.end();
          resolve();
        });
      });
      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });
      socket.on('timeout', () => {
        socket.destroy();
        if (isPrivate) {
          reject(new Error(`ម៉ាស៊ីនមេ Online (Cloud) មិនអាចបាញ់ចូល IP ក្នុងផ្ទះ/ហាង ${cleanIp}:${port} បានឡើយ (Private LAN Network)។ សូមប្រើប្រាស់ជម្រើស «⚡ Bluetooth POS» (ភ្ជាប់ទូរស័ព្ទផ្ទាល់ 1-Tap) ឬ «🖨️ AirPrint» ឬ «📱 RawBT (Wi-Fi)»!`));
        } else {
          reject(new Error(`Timeout connecting to ${cleanIp}:${port}`));
        }
      });
    });

    return res.json({
      success: true,
      message: `ម៉ាស៊ីនព្រីន ${cleanIp}:${port} ភ្ជាប់បានជោគជ័យ!`
    });
  } catch (err: any) {
    const cleanIp = String(req.body.printer_ip || '').trim();
    const isPrivate = isPrivateLanIp(cleanIp);
    if (isPrivate) {
      console.warn('[Test LAN Notice]: Cloud server cannot reach local private IP:', cleanIp);
    } else {
      console.error('[Test LAN Error]:', err?.message || err);
    }
    return res.status(200).json({
      success: false,
      isCloudPrivateIp: isPrivate,
      error: err?.message || 'បរាជ័យក្នុងការតេស្តម៉ាស៊ីនព្រីន Network'
    });
  }
});

// -------------------------------------------------------------
// 🏪 SHOP PRINT AGENT BACKEND (Cloud Relay for Store Thermal Printers)
// -------------------------------------------------------------
interface AgentPrintJob {
  id: string;
  invoice_id: number;
  basket_no: string;
  customer_name: string;
  escpos_base64: string;
  created_at: number;
  status: 'PENDING' | 'PRINTED' | 'FAILED';
  error?: string;
}

let agentHeartbeat: {
  agent_name: string;
  printer_target: string;
  last_seen: number;
} | null = null;

let pendingAgentJobs: AgentPrintJob[] = [];
const waitingAgentPollers: Array<(jobs: AgentPrintJob[]) => void> = [];

// GET /api/print_agent/status - Check if shop agent is currently online
router.get('/print_agent/status', (_req: Request, res: Response) => {
  const isOnline = agentHeartbeat !== null && (Date.now() - agentHeartbeat.last_seen < 65000);
  res.json({
    success: true,
    online: isOnline,
    agent: isOnline ? agentHeartbeat : null,
    pending_count: pendingAgentJobs.length,
    last_seen_seconds_ago: agentHeartbeat ? Math.round((Date.now() - agentHeartbeat.last_seen) / 1000) : null
  });
});

// POST /api/print_agent/heartbeat - Sent by the local pos-agent.js running in store
router.post('/print_agent/heartbeat', (req: Request, res: Response) => {
  const { agent_name = 'Store PC', printer_target = '192.168.0.200:9100' } = req.body || {};
  agentHeartbeat = {
    agent_name: String(agent_name),
    printer_target: String(printer_target),
    last_seen: Date.now()
  };
  res.json({ success: true, timestamp: Date.now(), pending: pendingAgentJobs.length });
});

// POST /api/print_agent/job - Enqueue print job from mobile phone or web UI
router.post('/print_agent/job', (req: Request, res: Response) => {
  try {
    const { invoice_id, basket_no, customer_name, escpos_base64, packer_name } = req.body || {};

    if (!escpos_base64) {
      return res.status(400).json({ success: false, error: 'ទិន្នន័យ ESC/POS base64 ត្រូវបានទាមទារ!' });
    }

    // Auto stage invoice (UNPICKED -> STAGED)
    if (invoice_id) {
      const invId = Number(invoice_id);
      const inv = invoices.find(i => i.invoice_id === invId || i.basket_no === invId);
      if (inv && (inv.packing_stage === 'UNPICKED' || !inv.packing_stage)) {
        inv.packing_stage = 'STAGED';
        inv.staged_by = packer_name || 'Shop Print Agent';
        inv.staged_at = new Date().toISOString();
        bumpDataRevision();
      }
    }

    const job: AgentPrintJob = {
      id: 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      invoice_id: Number(invoice_id || 0),
      basket_no: String(basket_no || invoice_id || ''),
      customer_name: String(customer_name || ''),
      escpos_base64: String(escpos_base64),
      created_at: Date.now(),
      status: 'PENDING'
    };

    // If there is an agent currently waiting in long-poll, dispatch immediately!
    if (waitingAgentPollers.length > 0) {
      const poller = waitingAgentPollers.shift();
      if (poller) {
        poller([job]);
      }
    } else {
      pendingAgentJobs.push(job);
      // Keep max 20 jobs
      if (pendingAgentJobs.length > 20) {
        pendingAgentJobs.shift();
      }
    }

    const isOnline = agentHeartbeat !== null && (Date.now() - agentHeartbeat.last_seen < 30000);

    // Only fallback to ntfy.sh relay if the agent is offline / not polling directly
    if (!isOnline && waitingAgentPollers.length === 0) {
      try {
        const ntfyReq = https.request('https://ntfy.sh/kari_pos_bfc84ed2_jobs', {
          method: 'POST',
          headers: {
            'Title': `Basket #${job.basket_no} - ${job.customer_name}`,
            'Content-Type': 'application/json'
          }
        });
        ntfyReq.on('error', () => {});
        ntfyReq.write(JSON.stringify({
          basket_no: job.basket_no,
          customer_name: job.customer_name,
          escpos_base64: job.escpos_base64
        }));
        ntfyReq.end();
      } catch {}
    }

    return res.json({
      success: true,
      job_id: job.id,
      is_agent_online: isOnline,
      message: isOnline
        ? `✅ បានបញ្ជូនទៅកាន់ Shop Print Agent (${agentHeartbeat?.printer_target || 'Printer'}) ជោគជ័យ!`
        : `⚠️ បានដាក់ចូលជួរ (Queue) ប៉ុន្តែ Print Agent ក្នុងហាងហាក់ដូចជាមិនទាន់បើក (Offline)`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to enqueue print job' });
  }
});

// GET /api/print_agent/poll - Long-poll endpoint for pos-agent.js
router.get('/print_agent/poll', (req: Request, res: Response) => {
  // Update heartbeat on poll
  if (agentHeartbeat) {
    agentHeartbeat.last_seen = Date.now();
  }

  // If there are pending jobs, return immediately
  if (pendingAgentJobs.length > 0) {
    const jobs = [...pendingAgentJobs];
    pendingAgentJobs = [];
    return res.json({ success: true, jobs });
  }

  // Long-poll: wait up to 12 seconds for new jobs
  let hasResponded = false;
  const timeoutId = setTimeout(() => {
    if (!hasResponded) {
      hasResponded = true;
      // Remove this poller callback
      const idx = waitingAgentPollers.indexOf(deliverJobs);
      if (idx !== -1) waitingAgentPollers.splice(idx, 1);
      res.json({ success: true, jobs: [] });
    }
  }, 12000);

  const deliverJobs = (jobs: AgentPrintJob[]) => {
    if (!hasResponded) {
      hasResponded = true;
      clearTimeout(timeoutId);
      res.json({ success: true, jobs });
    }
  };

  waitingAgentPollers.push(deliverJobs);

  req.on('close', () => {
    hasResponded = true;
    clearTimeout(timeoutId);
    const idx = waitingAgentPollers.indexOf(deliverJobs);
    if (idx !== -1) waitingAgentPollers.splice(idx, 1);
  });
});

// POST /api/print_agent/ack - Acknowledge completion of a job
router.post('/print_agent/ack', (req: Request, res: Response) => {
  const { job_id, status = 'PRINTED', error } = req.body || {};
  console.log(`[Shop Agent Job Ack]: ${job_id} -> ${status} ${error ? '(' + error + ')' : ''}`);
  res.json({ success: true });
});

// GET /api/print_agent/download_script - Download pos-agent.js with auto-configured server URL
router.get('/print_agent/download_script', (req: Request, res: Response) => {
  try {
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    const protocol = (String(host).includes('run.app') || req.headers['x-forwarded-proto'] === 'https') ? 'https' : (req.protocol || 'https');
    const serverUrl = `${protocol}://${host}`;

    const filePath = path.join(process.cwd(), 'pos-agent.js');
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('pos-agent.js not found');
    }

    let content = fs.readFileSync(filePath, 'utf8');
    // Replace default server URL with the caller's actual cloud URL
    content = content.replace(
      /SERVER_URL = process\.argv\[3\] \|\| process\.env\.SERVER_URL \|\| '.*?';/,
      `SERVER_URL = process.argv[3] || process.env.SERVER_URL || '${serverUrl}';`
    );

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pos-agent.js"');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Error generating agent script: ' + err.message);
  }
});

// GET /api/print_agent/download_python - Download pos_agent.py with auto-configured server URL
router.get('/print_agent/download_python', (req: Request, res: Response) => {
  try {
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    const protocol = (String(host).includes('run.app') || req.headers['x-forwarded-proto'] === 'https') ? 'https' : (req.protocol || 'https');
    const serverUrl = `${protocol}://${host}`;

    const filePath = path.join(process.cwd(), 'pos_agent.py');
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('pos_agent.py not found');
    }

    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(
      /DEFAULT_SERVER_URL = ".*?"/,
      `DEFAULT_SERVER_URL = "${serverUrl}"`
    );

    res.setHeader('Content-Type', 'text/x-python; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pos_agent.py"');
    res.send(content);
  } catch (err: any) {
    res.status(500).send('Error generating Python script: ' + err.message);
  }
});

// GET /api/print_agent/download_bat - Download 1-Click Windows Launcher Batch File
router.get('/print_agent/download_bat', (_req: Request, res: Response) => {
  const batContent = `@echo off
chcp 65001 >nul
title KARI ARNETT POS - SHOP PRINT AGENT (XP-80C)
color 0A
cls
echo =========================================================================
echo    🏪 KARI ARNETT POS - SHOP PRINT AGENT (1-CLICK LAUNCHER)
echo =========================================================================
echo.
echo [1/2] ឆែក Python ក្នុងកុំព្យូទ័រ...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] មិនទាន់មាន Python ក្នុងកុំព្យូទ័រទេ!
    echo សូមដំឡើង Python ពី https://www.python.org/downloads/ រួចបើកម្ដងទៀត។
    pause
    exit /b 1
)

echo [2/2] កំពុងដំណើរការ Print Agent សម្រាប់ USB XP-80C...
echo.
python "%~dp0pos_agent.py" usb
pause
`;
  res.setHeader('Content-Type', 'application/x-bat');
  res.setHeader('Content-Disposition', 'attachment; filename="START_PRINT_AGENT.bat"');
  res.send(batContent);
});

// -------------------------------------------------------------
// 🗄️ SQLite Database Backup & Historical Verification Endpoints
// -------------------------------------------------------------

// GET /api/db/backup - Download raw SQLite pos.db file
router.get('/db/backup', async (_req: Request, res: Response) => {
  try {
    await persistToSqlite({
      activeLiveId,
      settings,
      products,
      invoices,
      customers,
      packerLogs,
      activeFacebookPage
    });
    const buffer = getSqliteDatabaseBuffer();
    if (!buffer) {
      return res.status(404).send('SQLite database not initialized yet.');
    }
    const filename = `pos_backup_${new Date().toISOString().split('T')[0]}.db`;
    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).send('Error downloading SQLite database: ' + err.message);
  }
});

// GET /api/history/dates - Get list of live stream dates for historical verification
router.get('/history/dates', (_req: Request, res: Response) => {
  const dateMap = new Map<string, { date: string; live_ids: Set<string>; total_invoices: number; total_revenue: number; staged_count: number; verified_count: number; paid_count: number }>();

  invoices.forEach(inv => {
    const rawDate = inv.created_at || new Date().toISOString();
    const dateStr = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.split(' ')[0];

    const current = dateMap.get(dateStr) || {
      date: dateStr,
      live_ids: new Set<string>(),
      total_invoices: 0,
      total_revenue: 0,
      staged_count: 0,
      verified_count: 0,
      paid_count: 0
    };

    if (inv.live_id) current.live_ids.add(inv.live_id);
    current.total_invoices += 1;
    current.total_revenue += Number(inv.total_amount || 0);
    if (inv.packing_stage === 'STAGED') current.staged_count += 1;
    if (inv.packing_stage === 'DISPATCHED') current.verified_count += 1;
    if (inv.status === 'Paid') current.paid_count += 1;

    dateMap.set(dateStr, current);
  });

  const datesList = Array.from(dateMap.values())
    .map(d => ({
      ...d,
      live_ids: Array.from(d.live_ids),
      total_revenue: Number(d.total_revenue.toFixed(2))
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  res.json({
    success: true,
    total_dates: datesList.length,
    dates: datesList
  });
});

// GET /api/history/invoices - Filter invoices by specific date (e.g. ?date=2026-09-14)
router.get('/history/invoices', (req: Request, res: Response) => {
  const { date, live_id } = req.query;

  let filtered = invoices;

  if (date && typeof date === 'string') {
    filtered = filtered.filter(inv => {
      const invDate = (inv.created_at || '').split('T')[0].split(' ')[0];
      return invDate === date;
    });
  }

  if (live_id && typeof live_id === 'string') {
    filtered = filtered.filter(inv => inv.live_id === live_id);
  }

  res.json({
    success: true,
    filter_date: date || null,
    filter_live_id: live_id || null,
    count: filtered.length,
    total_revenue: Number(filtered.reduce((sum, inv) => sum + (inv.total_amount || 0), 0).toFixed(2)),
    invoices: filtered
  });
});

// GET /api/db/stats - Return database engine info
router.get('/db/stats', (_req: Request, res: Response) => {
  const dbBuffer = getSqliteDatabaseBuffer();
  res.json({
    engine: 'SQLite 3 (via sql.js + WAL Persistence)',
    db_file: 'server/pos.db',
    file_size_bytes: dbBuffer ? dbBuffer.length : 0,
    total_invoices: invoices.length,
    total_products: products.length,
    total_customers: customers.length,
    total_packer_logs: packerLogs.length,
    active_live_id: activeLiveId
  });
});

export default router;
