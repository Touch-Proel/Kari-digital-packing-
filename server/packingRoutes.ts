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
  activeFacebookPage,
  syncAllActiveInvoicesWithStock
} from './db';
import { getSqliteDatabaseBuffer, persistToSqlite } from './sqlite';
import { parseAndAllocateComment, convertKhmerDigitsToArabic, CLOTHING_SIZES_SET, NON_PRODUCT_CODES } from './parser';
import { detectDeliveryZone } from './locationHelper';
import { sendFacebookReply, fetchFacebookComments } from './fbAuth';
import { generateServerKHQRPNG } from './khqrServer';
import {
  testTelegramBotToken,
  fetchTelegramStockUpdates,
  clearScannedTelegramCache,
  bulkImportStockItems,
  startTelegramAutoSync,
  stopTelegramAutoSync,
  getTelegramAutoSyncStatus,
  executeTelegramAutoSyncOnce,
  deleteTelegramWebhook
} from './telegramSync';
import {
  startLiveCommentsAutoSync,
  stopLiveCommentsAutoSync,
  getLiveCommentsAutoSyncStatus,
  executeLiveCommentsSyncOnce,
  recordRecentOrder
} from './liveSync';
import { aiSmartAuditFullBasket } from './aiSmartParser';

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
router.get('/obs_data', (req: Request, res: Response) => {
  const targetLiveId = (req.query.live_id as string) || activeLiveId;
  const liveProducts = products.filter(p => (p.live_id || activeLiveId) === targetLiveId);
  const topProducts = liveProducts.map(p => ({
    id: p.id,
    code: p.code,
    name: p.name,
    price: p.price,
    cost_price: p.cost_price,
    stock_qty: p.stock_qty,
    image_file: p.image_file || '',
    live_id: p.live_id || targetLiveId
  }));

  // Find recent winner
  const liveInvoices = invoices.filter(inv => inv.live_id === targetLiveId);
  const allItems = liveInvoices.flatMap(inv =>
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
router.get('/products', (req: Request, res: Response) => {
  const targetLiveId = (req.query.live_id as string) || activeLiveId;
  const liveProducts = products
    .filter(p => (p.live_id || activeLiveId) === targetLiveId)
    .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' }));
  res.json(liveProducts);
});

// POST /api/update_product_stock_price
router.post('/update_product_stock_price', async (req: Request, res: Response) => {
  const { product_id, code, stock_qty, add_qty, price, name, cost_price, image_file, new_code, live_id } = req.body;
  if (!code && !product_id) {
    return res.status(400).json({ success: false, error: 'Code or product_id is required' });
  }

  const targetLive = (live_id && String(live_id).trim()) || activeLiveId;
  const cleanCode = String(code || '').trim().toUpperCase();
  const rawCode = cleanCode.replace(/^\[|\]$/g, '').trim();

  let prod = products.find(p => {
    if (product_id && p.id === Number(product_id)) return true;
    if ((p.live_id || activeLiveId) !== targetLive) return false;
    const pCode = (p.code || '').trim().toUpperCase();
    const pRaw = pCode.replace(/^\[|\]$/g, '').trim();
    return pCode === cleanCode || pRaw === rawCode;
  });

  // Helper to process and persist image
  const processImage = async (imgData: string, itemCode: string): Promise<string> => {
    if (!imgData || typeof imgData !== 'string') return '';
    const trimmed = imgData.trim();
    if (!trimmed.startsWith('data:image/')) {
      return trimmed;
    }
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      const matches = trimmed.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      const fileBuffer = matches ? Buffer.from(matches[2], 'base64') : Buffer.from(trimmed.split(',')[1] || trimmed, 'base64');
      const safeCode = (itemCode || 'item').replace(/[^A-Za-z0-9_-]/g, '');
      const safeLiveTag = targetLive.replace(/[^a-zA-Z0-9_-]/g, '').slice(-8);
      const filename = `${safeCode}_${safeLiveTag}_${Date.now()}.jpg`;
      const filePath = path.join(uploadDir, filename);

      const processedBuffer = await sharp(fileBuffer)
        .rotate()
        .resize(500, 500, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();

      fs.writeFileSync(filePath, processedBuffer);
      return `/uploads/${filename}`;
    } catch (err) {
      console.error('Sharp image processing error in update_product_stock_price:', err);
      return trimmed;
    }
  };

  let resolvedImage = image_file;
  if (image_file && typeof image_file === 'string' && image_file.startsWith('data:image/')) {
    resolvedImage = await processImage(image_file, rawCode || cleanCode);
  }

  if (!prod) {
    prod = {
      id: products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1,
      live_id: targetLive,
      code: rawCode || cleanCode,
      name: name?.trim() || `កូដ ${rawCode || cleanCode}`,
      stock_qty: Number(stock_qty || 50),
      price: Number(price || 5.0),
      cost_price: Number(cost_price || 3.0),
      image_file: resolvedImage || ''
    };
    products.push(prod);
  } else {
    prod.live_id = targetLive;
    if (name) prod.name = name.trim();
    if (cost_price !== undefined) prod.cost_price = Number(cost_price);
    if (resolvedImage !== undefined) {
      prod.image_file = resolvedImage || '';
    }

    // If user changed the code itself
    if (new_code && String(new_code).trim().toUpperCase() !== cleanCode) {
      const cleanNewCode = String(new_code).trim().toUpperCase().replace(/^\[|\]$/g, '');
      const existingNew = products.find(
        p => (p.live_id || activeLiveId) === targetLive && p.code.toUpperCase().replace(/^\[|\]$/g, '') === cleanNewCode && p.id !== prod?.id
      );
      if (existingNew) {
        return res.status(400).json({ success: false, error: `កូដ [${cleanNewCode}] មានរួចហើយក្នុងស្តុក Live នេះ!` });
      }
      prod.code = cleanNewCode;
    }

    if (stock_qty !== undefined && stock_qty !== null) {
      prod.stock_qty = Math.max(0, Number(stock_qty));
    } else if (add_qty) {
      prod.stock_qty = Math.max(0, prod.stock_qty + Number(add_qty));
    }

    if (price !== undefined && price !== null) {
      prod.price = Number(price);
    }
  }

  // Automatically cascade updated price/image/name to ALL active baskets in this live session
  syncAllActiveInvoicesWithStock(targetLive);

  bumpDataRevision();
  saveDatabaseToDisk();
  res.json({ success: true, data: prod });
});

// -------------------------------------------------------------
// 🌐 Public Customer Order Portal Endpoints (No Auth Required)
// -------------------------------------------------------------

// GET /api/find_basket?basket=2712
router.get('/find_basket', (req: Request, res: Response) => {
  const basketQuery = String(req.query.basket || req.query.q || req.query.invoice_id || req.query.open_basket || '').trim().replace(/^#/, '');
  const targetLive = req.query.live ? String(req.query.live).trim() : '';

  if (!basketQuery) {
    return res.status(400).json({ success: false, error: 'Basket query is required' });
  }

  // 1. Check in invoices by basket_no or invoice_id with live priority
  let match = invoices.find(inv => {
    const isLiveMatch = targetLive ? inv.live_id === targetLive : true;
    const isNoMatch = String(inv.basket_no) === basketQuery || String(inv.invoice_id) === basketQuery;
    return isLiveMatch && isNoMatch;
  });

  // 2. If not found in target live, search across ALL lives
  if (!match) {
    match = invoices.find(inv => String(inv.basket_no) === basketQuery || String(inv.invoice_id) === basketQuery);
  }

  if (!match) {
    return res.status(404).json({
      success: false,
      found: false,
      message: `រកមិនឃើញកន្ត្រក #${basketQuery} ក្នុងប្រព័ន្ធឡើយ!`
    });
  }

  // Determine stage (1: Unpicked, 2: Staged/Waiting Payment, 3: QC/Paid, 4: Dispatched)
  let stage = 1;
  let stageName = 'មិនទាន់រើស';
  if (match.status === 'Dispatched' || match.status === 'Packed' || match.packing_stage === 'DISPATCHED') {
    stage = 4;
    stageName = 'ចេញរួចហើយ';
  } else if (match.status === 'Paid' || match.payment_status === 'Paid' || Boolean(match.paid_at)) {
    stage = 3;
    stageName = 'បង្កក-QC';
  } else if (match.packing_stage === 'STAGED') {
    stage = 2;
    stageName = 'រង់ចាំបង់';
  } else {
    stage = 1;
    stageName = 'មិនទាន់រើស';
  }

  return res.json({
    success: true,
    found: true,
    invoice: match,
    basket_no: match.basket_no,
    invoice_id: match.invoice_id,
    live_id: match.live_id,
    stage,
    stage_name: stageName
  });
});

// GET /api/public/order/:id
router.get('/public/order/:id', (req: Request, res: Response) => {
  const invId = parseInt(req.params.id, 10);
  if (isNaN(invId)) {
    return res.status(400).json({ success: false, error: 'Invalid invoice ID' });
  }

  const inv = invoices.find(i => i.invoice_id === invId);
  if (!inv) {
    return res.status(404).json({ success: false, error: 'រកមិនឃើញវិក្កយបត្រនេះទេ' });
  }

  // Enrich items with product data (images, names, prices)
  const enrichedItems = (inv.items || []).map(it => {
    const prod = products.find(p => {
      const pCode = p.code.toUpperCase().trim().replace(/^\[|\]$/g, '');
      const itCode = it.product_code.toUpperCase().trim().replace(/^\[|\]$/g, '');
      return pCode === itCode && (p.live_id || activeLiveId) === (inv.live_id || activeLiveId);
    });

    return {
      product_code: it.product_code,
      product_name: it.product_name || prod?.name || `កូដ ${it.product_code}`,
      quantity: it.quantity || 1,
      price: it.price !== undefined ? it.price : (prod?.price || 0),
      image_file: it.image_file || prod?.image_file || '',
      item_comment: it.item_comment
    };
  });

  const subtotal = enrichedItems.reduce((sum, it) => sum + (it.price * (it.quantity || 1)), 0);
  const shippingFee = inv.shipping_fee || 0;
  const total = inv.total_amount || (subtotal + shippingFee);

  const isPaid =
    (inv.payment_status as any) === 'Paid' ||
    (inv.payment_status as any) === 'PAID' ||
    (inv.status as any) === 'Paid' ||
    (inv.status as any) === 'PAID' ||
    Boolean((inv as any).paid_at);

  const isDispatched =
    inv.status === 'Dispatched' ||
    (inv.status as any) === 'DISPATCHED' ||
    inv.packing_stage === 'DISPATCHED' ||
    Boolean((inv as any).is_dispatched);

  const isPicked =
    inv.packing_stage === 'STAGED' ||
    inv.packing_stage === 'DISPATCHED' ||
    inv.status === 'Paid' ||
    (inv.status as any) === 'PAID' ||
    inv.status === 'Packed' ||
    inv.status === 'Dispatched' ||
    (inv.status as any) === 'DISPATCHED' ||
    isDispatched ||
    Boolean((inv as any).is_picked);

  return res.json({
    success: true,
    data: {
      invoice_id: inv.invoice_id,
      facebook_name: inv.facebook_name,
      customer_id: (inv as any).customer_id || inv.facebook_user_id,
      phone: inv.phone_number || (inv as any).phone,
      shipping_address: inv.address || (inv as any).shipping_address || (inv as any).delivery_address,
      status: inv.status,
      packing_stage: inv.packing_stage,
      payment_status: isPaid ? 'PAID' : 'UNPAID',
      is_paid: isPaid,
      paid_at: (inv as any).paid_at || null,
      items: enrichedItems,
      subtotal,
      shipping_fee: shippingFee,
      total_amount: total,
      comments: inv.comments || [],
      location_zone: inv.location_zone || 'PP',
      created_at: inv.created_at || (inv as any).timestamp,
      is_dispatched: isDispatched,
      is_picked: isPicked,
      packer_name: (inv as any).packer_name || (inv as any).packed_by,
      bakong_khqr: (settings as any)?.bakong_account_id || settings?.bakong_id ? {
        account_id: (settings as any)?.bakong_account_id || settings.bakong_id,
        merchant_name: (settings as any)?.bakong_merchant_name || settings.merchant_name || 'LIVE STORE'
      } : null
    }
  });
});

// POST /api/public/order/:id/update_info
router.post('/public/order/:id/update_info', (req: Request, res: Response) => {
  const invId = parseInt(req.params.id, 10);
  const { phone, address } = req.body;
  const inv = invoices.find(i => i.invoice_id === invId);
  if (!inv) {
    return res.status(404).json({ success: false, error: 'រកមិនឃើញវិក្កយបត្រនេះទេ' });
  }

  if (phone && phone.trim()) {
    inv.phone_number = String(phone).trim();
    (inv as any).phone = String(phone).trim();
  }
  if (address && address.trim()) {
    inv.address = String(address).trim();
    (inv as any).shipping_address = String(address).trim();
    (inv as any).delivery_address = String(address).trim();
  }

  bumpDataRevision();
  saveDatabaseToDisk();

  return res.json({
    success: true,
    message: 'ព័ត៌មានត្រូវបានរក្សាទុកជោគជ័យ!',
    data: {
      phone: inv.phone_number,
      shipping_address: inv.address
    }
  });
});

// -------------------------------------------------------------
// 🔐 Admin PIN Authentication Endpoints
// -------------------------------------------------------------

// POST /api/auth/verify_pin
router.post('/auth/verify_pin', (req: Request, res: Response) => {
  const { pin } = req.body;
  const currentSavedPin = String((settings as any).admin_pin || '1688').trim();
  const cleanPin = String(pin || '').trim();

  if (!cleanPin || cleanPin !== currentSavedPin) {
    return res.status(401).json({
      success: false,
      message: 'លេខកូដ PIN មិនត្រឹមត្រូវឡើយ!'
    });
  }

  return res.json({
    success: true,
    role: 'admin',
    message: 'ផ្ទៀងផ្ទាត់ Admin ជោគជ័យ!'
  });
});

// POST /api/auth/change_pin
router.post('/auth/change_pin', (req: Request, res: Response) => {
  const { current_pin, new_pin } = req.body;
  const currentSavedPin = String((settings as any).admin_pin || '1688').trim();
  const cleanCurrent = String(current_pin || '').trim();
  const cleanNew = String(new_pin || '').trim();

  if (!cleanCurrent || cleanCurrent !== currentSavedPin) {
    return res.status(401).json({
      success: false,
      message: 'លេខកូដ PIN ចាស់មិនត្រឹមត្រូវ!'
    });
  }

  if (!cleanNew || cleanNew.length < 4) {
    return res.status(400).json({
      success: false,
      message: 'លេខកូដ PIN ថ្មីត្រូវមានយ៉ាងតិច ៤ ខ្ទង់!'
    });
  }

  (settings as any).admin_pin = cleanNew;
  saveDatabaseToDisk();

  return res.json({
    success: true,
    message: `បានប្តូរលេខកូដ Admin PIN ទៅជា ${cleanNew} ដោយជោគជ័យ!`
  });
});

// POST /api/delete_product
router.post('/delete_product', (req: Request, res: Response) => {
  const { code, remove_from_baskets, live_id } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, error: 'Code is required' });
  }

  const targetLive = live_id || activeLiveId;
  const cleanCode = String(code).trim().toUpperCase();
  const withoutBrackets = cleanCode.replace(/^\[|\]$/g, '');

  const idx = products.findIndex(p => {
    const isLiveMatch = (p.live_id || activeLiveId) === targetLive;
    if (!isLiveMatch) return false;
    const pCode = p.code.toUpperCase().trim();
    return pCode === cleanCode || pCode === withoutBrackets || pCode.replace(/^\[|\]$/g, '') === withoutBrackets;
  });

  let removed: any = null;
  if (idx !== -1) {
    removed = products.splice(idx, 1)[0];
  }

  let removedFromBasketsCount = 0;
  if (remove_from_baskets) {
    const targetInvoices = invoices.filter(i => i.live_id === targetLive);
    for (const inv of targetInvoices) {
      const beforeLen = inv.items.length;
      inv.items = inv.items.filter(it => {
        const itCode = it.product_code.toUpperCase().trim();
        return itCode !== cleanCode && itCode !== withoutBrackets && itCode.replace(/^\[|\]$/g, '') !== withoutBrackets;
      });
      if (inv.items.length !== beforeLen) {
        removedFromBasketsCount += (beforeLen - inv.items.length);
        recalculateInvoice(inv);
      }
    }
  }

  if (idx === -1 && removedFromBasketsCount === 0) {
    return res.status(404).json({ success: false, error: `រកមិនឃើញកូដ [${cleanCode}] ក្នុងស្តុក Live #${targetLive.slice(-8)} ឡើយ!` });
  }

  bumpDataRevision();
  saveDatabaseToDisk();

  console.log(`[Product Deleted] Removed product [${cleanCode}] from Live #${targetLive.slice(-8)} stock, removed from ${removedFromBasketsCount} items in baskets.`);
  
  let msg = '';
  if (removed && removedFromBasketsCount > 0) {
    msg = `បានលុបកូដ [${cleanCode}] ចេញពីស្តុក និងដកចេញពី ${removedFromBasketsCount} កន្ត្រក Live ជោគជ័យ!`;
  } else if (removed) {
    msg = `បានលុបកូដ [${cleanCode}] ចេញពីស្តុកជោគជ័យ!`;
  } else {
    msg = `កូដ [${cleanCode}] គ្មានក្នុងតារាងស្តុកទេ ប៉ុន្តែបានដកចេញពី ${removedFromBasketsCount} កន្ត្រក Live រួចរាល់!`;
  }

  res.json({
    success: true,
    message: msg,
    deleted: removed,
    removed_from_baskets_count: removedFromBasketsCount
  });
});

// POST /api/upload_product_image
router.post('/upload_product_image', async (req: Request, res: Response) => {
  try {
    const { code, image_data, live_id } = req.body;
    if (!image_data) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    const targetLive = (live_id && String(live_id).trim()) || activeLiveId;
    const cleanCode = code ? String(code).trim().toUpperCase().replace(/^\[|\]$/g, '') : 'item';
    const safeCode = cleanCode.replace(/[^A-Za-z0-9_-]/g, '') || 'item';
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Check if image_data is a base64 data URL
    let fileBuffer: Buffer;

    if (image_data.startsWith('data:image/')) {
      const matches = image_data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches) {
        fileBuffer = Buffer.from(matches[2], 'base64');
      } else {
        fileBuffer = Buffer.from(image_data.split(',')[1] || image_data, 'base64');
      }
    } else {
      // If it's an external web URL, save directly on product
      if (image_data.startsWith('http://') || image_data.startsWith('https://')) {
        if (code || req.body.product_id) {
          const targetProd = products.find(p => {
            if (req.body.product_id && p.id === Number(req.body.product_id)) return true;
            if ((p.live_id || activeLiveId) !== targetLive) return false;
            const pCode = (p.code || '').trim().toUpperCase().replace(/^\[|\]$/g, '');
            return pCode === cleanCode;
          });
          if (targetProd) {
            targetProd.image_file = image_data.trim();
            bumpDataRevision();
            saveDatabaseToDisk();
          }
        }
        return res.json({ success: true, image_url: image_data.trim() });
      }
      return res.status(400).json({ success: false, error: 'Invalid image format' });
    }

    const safeLiveTag = targetLive.replace(/[^a-zA-Z0-9_-]/g, '').slice(-8);
    const filename = `${safeCode}_${safeLiveTag}_${Date.now()}.jpg`;
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

    // Automatically update product if code or product_id provided
    if (code || req.body.product_id) {
      const targetProd = products.find(p => {
        if (req.body.product_id && p.id === Number(req.body.product_id)) return true;
        if ((p.live_id || activeLiveId) !== targetLive) return false;
        const pCode = (p.code || '').trim().toUpperCase().replace(/^\[|\]$/g, '');
        return pCode === cleanCode;
      });
      if (targetProd) {
        targetProd.image_file = publicUrl;
      }
      // Cascade to all active baskets in this target live session
      syncAllActiveInvoicesWithStock(targetProd?.live_id || targetLive);
      bumpDataRevision();
      saveDatabaseToDisk();
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

  res.json({
    success: true,
    zone: inv.location_zone,
    shipping_fee: inv.shipping_fee,
    total_amount: inv.total_amount,
    invoice: inv
  });
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

// POST /api/mark_invoice_paid
router.post(['/mark_invoice_paid', '/api/mark_invoice_paid'], (req: Request, res: Response) => {
  const { invoice_id, packer_name, payment_method } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);

  if (!inv) {
    return res.status(404).json({ success: false, error: 'Invoice not found' });
  }

  inv.status = 'Paid';
  (inv as any).payment_status = 'Paid';
  inv.paid_by = String(packer_name || 'បុគ្គលិក');
  inv.paid_at = new Date().toISOString();
  if (payment_method) {
    inv.payment_method = payment_method;
  }
  // Ensure it has entered STAGED stage so it belongs in QC workflow
  if (inv.packing_stage === 'UNPICKED') {
    inv.packing_stage = 'STAGED';
    inv.staged_by = String(packer_name || 'បុគ្គលិក');
    inv.staged_at = new Date().toISOString();
  }

  activeInvoiceLocks.delete(cleanId);
  bumpDataRevision();
  saveDatabaseToDisk();

  res.json({
    success: true,
    message: `✅ កន្ត្រក #${cleanId} បានបង់ប្រាក់រួចរាល់ ➔ បញ្ជូនទៅផ្ទាំង បង់រួច-QC ជោគជ័យ!`,
    invoice: inv
  });
});

// POST /api/mark_invoice_unpaid
router.post(['/mark_invoice_unpaid', '/api/mark_invoice_unpaid'], (req: Request, res: Response) => {
  const { invoice_id } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);

  if (!inv) {
    return res.status(404).json({ success: false, error: 'Invoice not found' });
  }

  inv.status = 'Pending';
  (inv as any).payment_status = 'Unpaid';
  delete inv.paid_at;
  delete inv.paid_by;
  bumpDataRevision();
  saveDatabaseToDisk();

  res.json({
    success: true,
    message: `បានប្តូរកន្ត្រក #${cleanId} មកស្ថានភាព «រង់ចាំបង់» វិញ!`,
    invoice: inv
  });
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
  // Preserve payment state when moving to Dispatched
  if (inv.status === 'Paid' || inv.paid_at || (inv as any).payment_status === 'Paid') {
    (inv as any).payment_status = 'Paid';
    if (!inv.paid_at) {
      inv.paid_at = new Date().toISOString();
    }
  } else {
    (inv as any).payment_status = 'COD';
  }
  inv.status = 'Dispatched';
  (inv as any).dispatched_at = new Date().toISOString();
  (inv as any).dispatched_by = pName;
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
  saveDatabaseToDisk();

  res.json({
    success: true,
    message: `កញ្ចប់ #${cleanId} ត្រូវបានផ្ទៀងផ្ទាត់ និងបញ្ចេញដឹកជោគជ័យ!`
  });
});

// POST /api/undispatch_pack
router.post('/undispatch_pack', (req: Request, res: Response) => {
  const { invoice_id } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);
  if (!inv) {
    return res.status(404).json({ success: false, error: 'Invoice not found' });
  }
  inv.packing_stage = 'STAGED';
  inv.status = 'Paid';
  (inv as any).dispatched_at = undefined;
  (inv as any).dispatched_by = undefined;
  inv.items.forEach(it => { it.is_packed = false; });
  bumpDataRevision();
  saveDatabaseToDisk();
  res.json({ success: true, message: `បានត្រឡប់កន្ត្រក #${cleanId} មកផ្ទាំង QC វិញជោគជ័យ!` });
});

// GET /api/backlog_invoices
router.get('/backlog_invoices', (req: Request, res: Response) => {
  const currentLive = (req.query.current_live_id as string) || activeLiveId;
  // All invoices across all lives that are Paid but not yet Dispatched/Packed/Cancelled
  // Exclude the current live session so this specifically highlights OLD UNFINISHED lives
  const previousLiveBacklog = invoices.filter(inv =>
    inv.status === 'Paid' &&
    inv.packing_stage !== 'DISPATCHED' &&
    inv.live_id !== currentLive
  );

  // Group summary by live_id
  const summaryByLive: Record<string, { count: number; total_amount: number }> = {};
  for (const inv of previousLiveBacklog) {
    const lid = inv.live_id || 'UNKNOWN';
    if (!summaryByLive[lid]) {
      summaryByLive[lid] = { count: 0, total_amount: 0 };
    }
    summaryByLive[lid].count += 1;
    summaryByLive[lid].total_amount += inv.total_amount;
  }

  res.json({
    success: true,
    total_backlog: previousLiveBacklog.length,
    summary_by_live: summaryByLive,
    invoices: previousLiveBacklog
  });
});

// POST /api/send_vip_invoice & /api/notify_customer_packed
router.post(['/send_vip_invoice', '/notify_customer_packed', '/api/send_vip_invoice', '/api/notify_customer_packed'], async (req: Request, res: Response) => {
  const { invoice_id, facebook_name, custom_message, comment_id, comment_ids } = req.body;
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
    const label = hasCustom ? `[${it.product_code}] ${custom}` : `[${it.product_code}]`;
    return `• ${label} x${it.quantity} = $${(it.price * it.quantity).toFixed(2)}`;
  }).join('\n');

  const totalQty = inv.items.reduce((s, it) => s + it.quantity, 0);
  const subtotal = inv.items.reduce((s, it) => s + (it.price * it.quantity), 0);
  const freeShipLimit = settings.free_ship_threshold || 0.0;
  const isFreeShip = freeShipLimit > 0 && subtotal >= freeShipLimit;
  const shippingFee = isFreeShip ? 0.0 : (inv.shipping_fee && inv.shipping_fee > 0 ? inv.shipping_fee : (settings.default_shipping_fee || 2.0));
  const exactTotal = Number((subtotal + shippingFee).toFixed(2));
  const totalKhr = Math.round(exactTotal * (settings.exchange_rate || 4100)).toLocaleString('en-US');
  const phoneText = phone !== 'មិនទាន់មាន' ? ` (${phone})` : '';

  const rawHost = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();

  const vipMsg = custom_message || (
    `🛍️ វិក្កយបត្រកន្ត្រក #${inv.basket_no || cleanId} (${customerName})\n` +
    `📍 ទីតាំង ៖ ${address}${phoneText}\n\n` +
    `📋 បញ្ជីទំនិញ ៖\n` +
    `${itemsList || '• ទំនិញទូទៅ'}\n` +
    `------------------------\n` +
    `📦 សរុប ${totalQty} ឈុត ៖ $${subtotal.toFixed(2)}${shippingFee === 0 ? ' (ហ្វ្រីដឹក)' : ` + ដឹក $${shippingFee.toFixed(2)}`} = $${exactTotal.toFixed(2)}\n` +
    `💰 ទឹកប្រាក់ត្រូវបង់ ៖ $${exactTotal.toFixed(2)} (${totalKhr}៛)\n\n` +
    `🙏 វេររួចសូមផ្ញើ Slip មកកាន់ប្រអប់ឆាតនេះចា៎ 🥰`
  );

  // Collect all potential candidate comment IDs for multi-method fallback
  const candidateCommentIds: string[] = [];
  if (comment_id && typeof comment_id === 'string' && comment_id.trim()) {
    candidateCommentIds.push(comment_id.trim());
  }
  if (Array.isArray(comment_ids)) {
    for (const cid of comment_ids) {
      const clean = typeof cid === 'string' ? cid.trim() : String(cid || '').trim();
      if (clean && !candidateCommentIds.includes(clean)) {
        candidateCommentIds.push(clean);
      }
    }
  }
  if (inv.last_comment_id) {
    candidateCommentIds.push(inv.last_comment_id);
  }
  if (Array.isArray(inv.comment_ids)) {
    for (const cid of inv.comment_ids) {
      if (cid && !candidateCommentIds.includes(cid)) {
        candidateCommentIds.push(cid);
      }
    }
  }

  // Also harvest comment IDs from comments_json stored on invoice
  const invAny = inv as any;
  if (invAny.comments_json) {
    try {
      const parsedComments = typeof invAny.comments_json === 'string' ? JSON.parse(invAny.comments_json) : invAny.comments_json;
      if (Array.isArray(parsedComments)) {
        for (const c of parsedComments) {
          const cid = c?.comment_id || c?.id;
          if (cid && !candidateCommentIds.includes(String(cid).trim())) {
            candidateCommentIds.push(String(cid).trim());
          }
        }
      }
    } catch {}
  }

  // Also query rawComments for this invoice or customer (restrict to current live stream session to avoid fetching old comments)
  const targetLiveId = inv.live_id || activeLiveId;
  const cleanCustomerName = customerName.toLowerCase().trim();
  const matchingRawComments = rawComments
    .slice()
    .reverse()
    .filter(c => {
      if (!c.comment_id || c.comment_id.startsWith('sys_') || c.comment_id.startsWith('manual_')) return false;
      // Filter out comments from other live stream sessions to prevent pollution of old candidates
      if (c.live_id && targetLiveId && c.live_id !== targetLiveId) return false;

      if (c.invoice_id === cleanId) return true;
      if (inv.facebook_user_id && inv.facebook_user_id !== 'FB_USER_ID_STREAM' && c.facebook_user_id === inv.facebook_user_id) return true;
      const cName = (c.facebook_name || '').toLowerCase().trim();
      if (!cName) return false;
      if (cName === cleanCustomerName) return true;
      if (cleanCustomerName.length >= 3 && (cName.includes(cleanCustomerName) || cleanCustomerName.includes(cName))) return true;
      return false;
    });

  for (const rc of matchingRawComments) {
    if (rc.comment_id && !candidateCommentIds.includes(rc.comment_id)) {
      candidateCommentIds.push(rc.comment_id);
    }
  }

  // If candidateCommentIds is still empty, search active live stream comments via Facebook Graph API (up to 1000 comments)
  if (candidateCommentIds.length === 0 && activeFacebookPage?.access_token && activeLiveId && !activeLiveId.startsWith('LIVE_') && !activeLiveId.startsWith('sim_')) {
    try {
      const liveCommentsRes = await fetchFacebookComments(activeLiveId, activeFacebookPage.access_token, 1000);
      if (liveCommentsRes && liveCommentsRes.data && Array.isArray(liveCommentsRes.data)) {
        for (const item of liveCommentsRes.data) {
          const fromName = (item.from?.name || '').toLowerCase().trim();
          const fromId = String(item.from?.id || '').trim();
          const isNameMatch = fromName && cleanCustomerName && (fromName === cleanCustomerName || fromName.includes(cleanCustomerName) || cleanCustomerName.includes(fromName));
          const isIdMatch = fromId && inv.facebook_user_id && fromId === inv.facebook_user_id;

          // Cache all fetched comments to rawComments for future instant lookups
          if (item.id && !rawComments.some(r => r.comment_id === item.id)) {
            rawComments.push({
              comment_id: item.id,
              live_id: activeLiveId,
              facebook_user_id: fromId,
              facebook_name: item.from?.name || '',
              comment_text: item.message || '',
              created_at: item.created_time || new Date().toISOString()
            });
          }

          if ((isNameMatch || isIdMatch) && item.id) {
            if (!candidateCommentIds.includes(item.id)) {
              candidateCommentIds.push(item.id);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[VIP Comment Lookup] Failed to fetch live comments for customer:', e);
    }
  }

  // Store resolved comment IDs on invoice so they remain persistently cached
  if (candidateCommentIds[0]) {
    inv.last_comment_id = candidateCommentIds[0];
    if (!inv.comment_ids) inv.comment_ids = [];
    for (const cid of candidateCommentIds) {
      if (!inv.comment_ids.includes(cid)) inv.comment_ids.push(cid);
    }
  }

  const primaryCommentId = candidateCommentIds[0] || null;
  const extraCommentIds = candidateCommentIds.slice(1);

  let replyRes: any = { success: false };
  try {
    replyRes = await sendFacebookReply(
      primaryCommentId,
      inv.facebook_user_id,
      vipMsg,
      undefined,
      undefined, // QR Image URL removed to keep invoice clean & prevent Meta scam warning
      undefined, // QR PNG Buffer removed to keep invoice clean & prevent Meta scam warning
      extraCommentIds
    );
  } catch (err: any) {
    console.warn('[VIP] sendFacebookReply error:', err);
    replyRes = {
      success: false,
      method: 'MANUAL_COPIED',
      methodTitle: 'ផ្ញើដោយផ្ទាល់ (ចម្លងរួចរាល់)',
      error: err?.message || 'Meta API error'
    };
  }

  // Update invoice message status and delivery method
  if (replyRes.success) {
    inv.msg_status = 'SENT';
    inv.msg_delivery_method = replyRes.method;
    inv.msg_error = '';
  } else {
    inv.msg_status = 'FAILED';
    inv.msg_delivery_method = 'MANUAL_COPIED';
    inv.msg_error = replyRes.error || 'Facebook Meta API rejected message';
  }
  bumpDataRevision();
  saveDatabaseToDisk();

  res.json({
    success: replyRes.success,
    msg_status: inv.msg_status,
    msg_delivery_method: replyRes.method,
    method_title: replyRes.methodTitle,
    delivery_detail: replyRes.detail,
    attempt_logs: replyRes.attemptLogs || [],
    error: replyRes.error,
    message: replyRes.success 
      ? (replyRes.detail || 'បានផ្ញើវិក្កយបត្រ VIP ជោគជ័យ!') 
      : (replyRes.error || 'មិនអាចផ្ញើសារបានទេ ➔ សូមចុចឆាតផ្ទាល់'),
    vip_message: vipMsg,
    recipient_name: customerName,
    facebook_user_id: inv.facebook_user_id,
    fb_delivery: replyRes
  });
});

// POST /api/link_comment_to_invoice - Attach a Facebook comment ID to an invoice
router.post('/link_comment_to_invoice', (req: Request, res: Response) => {
  const { invoice_id, comment_id } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);
  if (!inv) return res.status(404).json({ success: false, error: 'រកមិនឃើញកន្ត្រកទេ' });
  const cid = String(comment_id || '').trim();
  if (!cid) return res.status(400).json({ success: false, error: 'សូមបញ្ចូល Comment ID' });
  inv.last_comment_id = cid;
  if (!inv.comment_ids) inv.comment_ids = [];
  if (!inv.comment_ids.includes(cid)) inv.comment_ids.unshift(cid);
  bumpDataRevision();
  saveDatabaseToDisk();
  res.json({ success: true, message: 'បានភ្ជាប់ Comment ID ជោគជ័យ', last_comment_id: cid });
});

// GET /api/invoices/:id/auto_resolve_comment - Look up and attach any missing comment ID from rawComments or Facebook Live
router.get('/invoices/:id/auto_resolve_comment', async (req: Request, res: Response) => {
  const cleanId = parseInt(String(req.params.id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId || i.basket_no === cleanId);
  if (!inv) return res.status(404).json({ success: false, error: 'រកមិនឃើញកន្ត្រកទេ' });

  if (inv.last_comment_id) {
    return res.json({ success: true, comment_id: inv.last_comment_id, comment_ids: inv.comment_ids || [inv.last_comment_id] });
  }

  const cleanCustomerName = (inv.facebook_name || '').toLowerCase().trim();
  const fbUserId = inv.facebook_user_id;

  // 1. Search in local rawComments
  const localMatch = rawComments.slice().reverse().find(c => {
    if (!c.comment_id || c.comment_id.startsWith('sys_') || c.comment_id.startsWith('manual_')) return false;
    if (c.invoice_id === cleanId) return true;
    if (fbUserId && fbUserId !== 'FB_USER_ID_STREAM' && c.facebook_user_id === fbUserId) return true;
    const cName = (c.facebook_name || '').toLowerCase().trim();
    if (cName && (cName === cleanCustomerName || (cleanCustomerName.length >= 3 && (cName.includes(cleanCustomerName) || cleanCustomerName.includes(cName))))) return true;
    return false;
  });

  if (localMatch && localMatch.comment_id) {
    inv.last_comment_id = localMatch.comment_id;
    if (!inv.comment_ids) inv.comment_ids = [];
    if (!inv.comment_ids.includes(localMatch.comment_id)) inv.comment_ids.unshift(localMatch.comment_id);
    bumpDataRevision();
    saveDatabaseToDisk();
    return res.json({ success: true, comment_id: localMatch.comment_id, comment_ids: inv.comment_ids });
  }

  // 2. Fetch from Facebook Live if active
  if (activeFacebookPage?.access_token && activeLiveId && !activeLiveId.startsWith('LIVE_') && !activeLiveId.startsWith('sim_')) {
    try {
      const liveCommentsRes = await fetchFacebookComments(activeLiveId, activeFacebookPage.access_token, 1000);
      if (liveCommentsRes && liveCommentsRes.data && Array.isArray(liveCommentsRes.data)) {
        for (const item of liveCommentsRes.data) {
          const fromName = (item.from?.name || '').toLowerCase().trim();
          const fromId = String(item.from?.id || '').trim();
          const isNameMatch = fromName && cleanCustomerName && (fromName === cleanCustomerName || fromName.includes(cleanCustomerName) || cleanCustomerName.includes(fromName));
          const isIdMatch = fromId && fbUserId && fromId === fbUserId;

          if (item.id && !rawComments.some(r => r.comment_id === item.id)) {
            rawComments.push({
              comment_id: item.id,
              live_id: activeLiveId,
              facebook_user_id: fromId,
              facebook_name: item.from?.name || '',
              comment_text: item.message || '',
              created_at: item.created_time || new Date().toISOString()
            });
          }

          if ((isNameMatch || isIdMatch) && item.id) {
            inv.last_comment_id = item.id;
            if (!inv.comment_ids) inv.comment_ids = [];
            if (!inv.comment_ids.includes(item.id)) inv.comment_ids.unshift(item.id);
            bumpDataRevision();
            saveDatabaseToDisk();
            return res.json({ success: true, comment_id: item.id, comment_ids: inv.comment_ids });
          }
        }
      }
    } catch (e) {
      console.warn('[Auto-Resolve Comment] Error:', e);
    }
  }

  res.json({ success: false, message: 'មិនមាន Comment ID សម្រាប់កន្ត្រកនេះទេ' });
});

// POST /api/toggle_msg_sent_status - Manually mark as SENT or UNSENT/FAILED
router.post('/toggle_msg_sent_status', (req: Request, res: Response) => {
  const { invoice_id, status } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId);

  if (!inv) {
    return res.status(404).json({ success: false, error: 'រកមិនឃើញវិក្កយបត្រទេ' });
  }

  const targetStatus = status || (inv.msg_status === 'SENT' ? 'UNSENT' : 'SENT');
  inv.msg_status = targetStatus;
  if (targetStatus === 'SENT') {
    inv.msg_error = '';
  }
  bumpDataRevision();
  saveDatabaseToDisk();

  res.json({
    success: true,
    invoice_id: inv.invoice_id,
    msg_status: inv.msg_status,
    message: inv.msg_status === 'SENT' ? 'បានសម្គាល់ថាបានផ្ញើឆាតជូនភ្ញៀវរួចរាល់' : 'បានដោះស្ថានភាពផ្ញើសារ'
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
      const { zone, label, detectedLocation } = detectDeliveryZone(allText);
      inv.location_zone = zone;
      inv.location_label = label;
      if (detectedLocation && (!inv.address || inv.address.includes('មិនទាន់មាន') || inv.address === '🏙️ ភ្នំពេញ' || inv.address === 'ភ្នំពេញ' || inv.address === '🏞️ តាមខេត្ត')) {
        inv.address = detectedLocation;
      }
    }
  }

  const cleanName = String(facebook_name || inv?.facebook_name || '').trim().toLowerCase();
  const targetUserId = inv?.facebook_user_id && inv.facebook_user_id !== 'FB_USER_ID_STREAM' ? inv.facebook_user_id : undefined;

  let cust = targetUserId
    ? customers.find(c => c.facebook_user_id === targetUserId)
    : customers.find(c => c.facebook_name.toLowerCase() === cleanName);

  if (cust) {
    if (phone) cust.phone_number = String(phone).trim();
    if (address !== undefined) cust.address = String(address).trim();
    if (targetUserId && (!cust.facebook_user_id || cust.facebook_user_id === 'FB_USER_ID_STREAM')) {
      cust.facebook_user_id = targetUserId;
    }
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

// POST /api/edit_basket_item_code - Directly change product code/price/qty on a basket item
router.post('/edit_basket_item_code', (req: Request, res: Response) => {
  const { invoice_id, old_code, new_code, new_qty, new_price, packer_name } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);
  const cleanOldCode = String(old_code || '').trim().toUpperCase();
  const cleanNewCode = String(new_code || '').trim().toUpperCase();

  if (!cleanNewCode) {
    return res.status(400).json({ success: false, message: 'សូមបញ្ចូលកូដថ្មី' });
  }

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

  const item = inv.items.find(it => it.product_code.toUpperCase() === cleanOldCode);
  if (!item) {
    return res.status(404).json({ success: false, message: `រកមិនឃើញកូដ [${cleanOldCode}] ក្នុងកន្ត្រកនេះទេ` });
  }

  // If changing to another code
  if (cleanOldCode !== cleanNewCode) {
    const liveId = inv.live_id || activeLiveId;
    // Return old product stock if tracked
    const oldProd = products.find(p => (p.live_id || activeLiveId) === liveId && p.code.toUpperCase() === cleanOldCode);
    if (oldProd) {
      oldProd.stock_qty += item.quantity;
    }

    // Find or create new product
    let newProd = products.find(p => (p.live_id || activeLiveId) === liveId && p.code.toUpperCase() === cleanNewCode);
    if (!newProd) {
      const nextProdId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      newProd = {
        id: nextProdId,
        live_id: liveId,
        code: cleanNewCode,
        name: `កូដ [${cleanNewCode}]`,
        stock_qty: 100,
        price: typeof new_price === 'number' && new_price > 0 ? new_price : (item.price || 5.0),
        cost_price: 3.0
      };
      products.push(newProd);
    }

    item.product_id = newProd.id;
    item.product_code = newProd.code;
    item.product_name = newProd.name;
    // Always pull image and price from stock product
    if (newProd.image_file && newProd.image_file.trim() !== '') {
      item.image_file = newProd.image_file;
    } else {
      delete (item as any).image_file;
    }

    if (typeof newProd.price === 'number' && newProd.price > 0) {
      item.price = newProd.price;
    } else if (typeof new_price === 'number' && new_price > 0) {
      item.price = new_price;
    }
  } else {
    // Same code: look up product in stock and sync latest image, price, and name
    const liveId = inv.live_id || activeLiveId;
    const sameProd = products.find(p => (p.live_id || activeLiveId) === liveId && p.code.toUpperCase() === cleanNewCode);
    if (sameProd) {
      if (sameProd.image_file && sameProd.image_file.trim() !== '') {
        item.image_file = sameProd.image_file.trim();
      }
      if (typeof sameProd.price === 'number' && sameProd.price > 0) {
        item.price = sameProd.price;
      } else if (typeof new_price === 'number' && new_price > 0) {
        item.price = new_price;
      }
      if (sameProd.name && sameProd.name.trim() !== '') {
        item.product_name = sameProd.name.trim();
      }
      item.product_id = sameProd.id;
    } else if (typeof new_price === 'number' && new_price > 0) {
      item.price = new_price;
    }
  }

  if (typeof new_qty === 'number' && new_qty > 0) {
    item.quantity = new_qty;
  }

  recalculateInvoice(inv);
  const newRev = bumpDataRevision();
  saveDatabaseToDisk();

  res.json({
    success: true,
    message: `បានកែប្រែកូដ [${cleanOldCode}] ទៅជា [${item.product_code}] រួចរាល់!`,
    item,
    invoice: inv,
    revision: newRev
  });
});

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

  const inv = invoices.find(i => i.invoice_id === cleanId || i.basket_no === cleanId);
  if (!inv) {
    return res.status(404).json({ success: false, message: 'រកមិនឃើញវិក្កយបត្រ' });
  }

  const itemIdx = inv.items.findIndex(it => it.product_code.toUpperCase() === cleanCode);
  if (itemIdx === -1) {
    return res.status(404).json({ success: false, message: `រកមិនឃើញកូដ [${cleanCode}]` });
  }

  const currentItem = inv.items[itemIdx];
  const delta = targetQty - currentItem.quantity;

  const liveId = inv.live_id || activeLiveId;
  const prod = products.find(p => (p.live_id || activeLiveId) === liveId && p.code.toUpperCase() === cleanCode);
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
  const newRev = bumpDataRevision();
  saveDatabaseToDisk();

  res.json({
    success: true,
    message: 'កែប្រែចំនួនជោគជ័យ',
    item: { code: cleanCode, quantity: targetQty },
    invoice: inv,
    revision: newRev
  });
});

// POST /api/add_item_to_invoice
router.post('/add_item_to_invoice', (req: Request, res: Response) => {
  const { invoice_id, code, quantity, items, comment_text, packer_name } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);

  const lockCheck = isInvoiceLockedByOther(cleanId, packer_name);
  if (lockCheck.locked) {
    return res.status(409).json({
      success: false,
      message: `កន្ត្រកនេះត្រូវបានចាក់សោដោយ «${lockCheck.lockedBy}»!`
    });
  }

  const inv = invoices.find(i => i.invoice_id === cleanId || i.basket_no === cleanId);
  if (!inv) {
    return res.status(404).json({ success: false, message: 'រកមិនឃើញវិក្កយបត្រ' });
  }

  const liveId = inv.live_id || activeLiveId;
  const rawItemList: { code: string; quantity: number }[] = [];

  if (Array.isArray(items) && items.length > 0) {
    for (const it of items) {
      const c = String(it.code || '').trim().toUpperCase();
      const q = Math.max(1, parseInt(String(it.quantity || it.qty || 1), 10));
      if (c) rawItemList.push({ code: c, quantity: q });
    }
  } else if (code) {
    const c = String(code).trim().toUpperCase();
    const q = Math.max(1, parseInt(String(quantity || 1), 10));
    if (c) rawItemList.push({ code: c, quantity: q });
  }

  if (rawItemList.length === 0) {
    return res.status(400).json({ success: false, message: 'សូមបញ្ចូលកូដទំនិញ' });
  }

  const addedItemsSummary: { code: string; quantity: number; name: string }[] = [];

  for (const it of rawItemList) {
    const cleanCode = it.code.toUpperCase().trim();
    const addQty = it.quantity;

    if (CLOTHING_SIZES_SET.has(cleanCode) || NON_PRODUCT_CODES.has(cleanCode)) {
      const existingInCatalog = products.find(p => (p.live_id || activeLiveId) === liveId && p.code.toUpperCase() === cleanCode);
      if (!existingInCatalog) {
        return res.status(400).json({
          success: false,
          message: `⚠️ [${cleanCode}] នេះជា Size ខោអាវ (Clothing Size) មិនមែនកូដទំនិញទេ! សូមបញ្ចូលកូដទំនិញពិតប្រាកដ (ឧ. A01, 47, 101...)`
        });
      }
    }

    // Look for product in current live first
    const rawCleanCode = cleanCode.replace(/^\[|\]$/g, '');
    let prod = products.find(p => {
      if ((p.live_id || activeLiveId) !== liveId) return false;
      const pCode = (p.code || '').trim().toUpperCase().replace(/^\[|\]$/g, '');
      return pCode === rawCleanCode;
    });

    if (!prod) {
      // Create new clean product for this live session ONLY (never leak/inherit from other lives)
      const nextProdId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      prod = {
        id: nextProdId,
        live_id: liveId,
        code: rawCleanCode,
        name: `កូដ [${rawCleanCode}]`,
        stock_qty: 100,
        price: 5.0,
        cost_price: 3.0,
        image_file: ''
      };
      products.push(prod);
    }

    if (prod.stock_qty < addQty) {
      prod.stock_qty = addQty + 50; // Auto replenish for live manual allocation
    }
    prod.stock_qty -= addQty;

    const existingItem = inv.items.find(item => item.product_code.toUpperCase() === cleanCode);
    let finalQty = addQty;
    if (existingItem) {
      existingItem.quantity += addQty;
      finalQty = existingItem.quantity;
      if (comment_text) existingItem.item_comment = comment_text;
      if (!existingItem.image_file && prod.image_file) {
        existingItem.image_file = prod.image_file;
      }
      if ((!existingItem.price || existingItem.price <= 0) && prod.price > 0) {
        existingItem.price = prod.price;
      }
    } else {
      const nextItemId = inv.items.length > 0 ? Math.max(...inv.items.map(item => item.id)) + 1 : 1;
      inv.items.push({
        id: nextItemId,
        invoice_id: inv.invoice_id,
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

    addedItemsSummary.push({ code: cleanCode, quantity: finalQty, name: prod.name });
  }

  // Remove comment from unmatched if provided (matching raw or normalized text)
  if (comment_text && inv.unmatched_comments) {
    const cleanComment = String(comment_text).trim();
    const normComment = convertKhmerDigitsToArabic(cleanComment).trim();
    inv.unmatched_comments = inv.unmatched_comments.filter(c => {
      const trimmed = c.trim();
      const normTrimmed = convertKhmerDigitsToArabic(trimmed).trim();
      return trimmed !== cleanComment && normTrimmed !== normComment;
    });
  }

  recalculateInvoice(inv);
  const newRev = bumpDataRevision();
  saveDatabaseToDisk();

  const summaryStr = addedItemsSummary.map(it => `${it.code} x${it.quantity}`).join(', ');

  res.json({
    success: true,
    message: `បានបន្ថែម [${summaryStr}] ចូលកន្ត្រក #${inv.basket_no || inv.invoice_id} រួចរាល់!`,
    item: addedItemsSummary[0],
    items: addedItemsSummary,
    invoice: inv,
    revision: newRev
  });
});

// POST /api/ai_smart_parse_basket - Use Gemini AI to audit and reconcile the entire basket against all customer comments
router.post('/ai_smart_parse_basket', async (req: Request, res: Response) => {
  const { invoice_id, packer_name, apply_direct } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);

  const lockCheck = isInvoiceLockedByOther(cleanId, packer_name);
  if (lockCheck.locked) {
    return res.status(409).json({
      success: false,
      message: `កន្ត្រកនេះត្រូវបានចាក់សោដោយ «${lockCheck.lockedBy}»!`
    });
  }

  const inv = invoices.find(i => i.invoice_id === cleanId || i.basket_no === cleanId);
  if (!inv) {
    return res.status(404).json({ success: false, message: 'រកមិនឃើញកន្ត្រកនេះឡើយ' });
  }

  // 1. Gather ALL historical and live comments for this customer
  const allCustomerComments: string[] = [];
  const seenComments = new Set<string>();

  // Add comments from inv.comments history
  if (Array.isArray(inv.comments)) {
    for (const c of inv.comments) {
      const clean = (c || '').trim();
      if (clean && !seenComments.has(clean)) {
        seenComments.add(clean);
        allCustomerComments.push(clean);
      }
    }
  }

  // Add comments from unmatched_comments
  if (Array.isArray(inv.unmatched_comments)) {
    for (const c of inv.unmatched_comments) {
      const clean = (c || '').trim();
      if (clean && !seenComments.has(clean)) {
        seenComments.add(clean);
        allCustomerComments.push(clean);
      }
    }
  }

  // Add item notes if they were sourced from comments
  if (Array.isArray(inv.items)) {
    for (const it of inv.items) {
      if (it.item_comment && !seenComments.has(it.item_comment.trim())) {
        seenComments.add(it.item_comment.trim());
        allCustomerComments.push(it.item_comment.trim());
      }
    }
  }

  if (allCustomerComments.length === 0) {
    return res.json({
      success: false,
      message: 'មិនមានខមិនរបស់អតិថិជនដើម្បីឱ្យ AI ផ្ទៀងផ្ទាត់ឡើយ'
    });
  }

  const liveId = inv.live_id || activeLiveId;
  const liveCatalog = products.filter(p => (p.live_id || activeLiveId) === liveId && p.code && p.code.trim().length > 0);

  const currentItemsSummary = (inv.items || []).map(it => ({
    code: it.product_code,
    quantity: it.quantity,
    notes: it.item_comment || ''
  }));

  try {
    const auditResult = await aiSmartAuditFullBasket(
      allCustomerComments,
      currentItemsSummary,
      inv.facebook_name || 'អតិថិជន',
      liveCatalog
    );

    // If apply_direct is true (default), reconcile and update the entire basket with authoritative AI audit result
    if (apply_direct !== false && auditResult.verified_items && auditResult.verified_items.length > 0) {
      const newInvoiceItems = [];
      let itemSeq = 1;

      for (const ver of auditResult.verified_items) {
        const clean = ver.code.toUpperCase().trim();
        if (!clean) continue;
        const exactQty = Math.max(1, ver.quantity || 1);

        let prod = liveCatalog.find(p => p.code.toUpperCase() === clean);
        if (!prod) {
          const nextProdId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
          const cleanName = ver.product_name && !ver.product_name.includes('[') 
            ? ver.product_name 
            : `កូដ ${clean}`;
          prod = {
            id: nextProdId,
            live_id: liveId,
            code: clean,
            name: cleanName,
            stock_qty: 100,
            price: ver.suggested_price || 3.0,
            cost_price: 2.0
          };
          products.push(prod);
        }

        const existingOld = (inv.items || []).find(it => it.product_code.toUpperCase().trim() === clean);

        // ALWAYS preserve the exact original customer comment for this item
        let bestNote = '';
        const matchingOriginals = allCustomerComments.filter(c => {
          const norm = convertKhmerDigitsToArabic(c || '').toUpperCase();
          const regex = new RegExp(`(?:^|[^A-Z0-9])${clean}(?:[^A-Z0-9]|$)`, 'i');
          return regex.test(norm) || norm.includes(clean);
        });

        if (matchingOriginals.length > 0) {
          bestNote = matchingOriginals.join(' | ');
        } else if (existingOld?.item_comment && existingOld.item_comment.trim()) {
          bestNote = existingOld.item_comment.trim();
        } else if (allCustomerComments.length === 1) {
          bestNote = allCustomerComments[0];
        } else if (ver.notes) {
          bestNote = ver.notes.trim();
        }

        newInvoiceItems.push({
          id: itemSeq++,
          invoice_id: inv.invoice_id,
          product_id: prod.id,
          product_code: prod.code,
          product_name: prod.name,
          quantity: exactQty, // Exactly applies the AI audited quantity (fixes regex mistaken numbers like x10 -> x1)
          price: prod.price || ver.suggested_price || existingOld?.price || 3.0,
          is_packed: false,
          item_comment: bestNote,
          image_file: prod.image_file || existingOld?.image_file || ''
        });
      }

      inv.items = newInvoiceItems;

      // 3. Update customer contact info if discovered
      if (auditResult.phone && (!inv.phone_number || inv.phone_number === 'គ្មានលេខ' || inv.phone_number.includes('មិនទាន់មាន') || inv.phone_number.length < 8)) {
        inv.phone_number = auditResult.phone;
        const cust = customers.find(c => c.facebook_name.toLowerCase() === (inv.facebook_name || '').toLowerCase());
        if (cust) cust.phone_number = auditResult.phone;
      }

      if (auditResult.address && (!inv.address || inv.address.includes('មិនទាន់មាន'))) {
        inv.address = auditResult.address;
        const cust = customers.find(c => c.facebook_name.toLowerCase() === (inv.facebook_name || '').toLowerCase());
        if (cust) cust.address = auditResult.address;
      }

      if (auditResult.zone) {
        inv.location_zone = auditResult.zone;
        inv.location_label = auditResult.zone === 'PP' ? 'ភ្នំពេញ' : 'ខេត្ត';
      }

      // 4. Clear unmatched comments as they have been fully audited by AI
      inv.unmatched_comments = [];

      recalculateInvoice(inv);
      const newRev = bumpDataRevision();
      saveDatabaseToDisk();

      const correctionsText = auditResult.corrections_made && auditResult.corrections_made.length > 0
        ? ` (${auditResult.corrections_made.join(', ')})`
        : '';

      return res.json({
        success: true,
        message: auditResult.summary ? `✨ ${auditResult.summary}${correctionsText}` : `✨ AI បានផ្ទៀងផ្ទាត់កន្ត្រកទាំងមូល និងកែសម្រួលរួចរាល់!`,
        parsed: auditResult,
        invoice: inv,
        revision: newRev
      });
    }

    return res.json({
      success: true,
      parsed: auditResult,
      invoice: inv
    });
  } catch (err: any) {
    const errorMsg = err?.message || 'AI Basket Audit បរាជ័យ';
    if (!errorMsg.includes('Quota') && !errorMsg.includes('429')) {
      console.warn('Notice in /api/ai_smart_parse_basket:', errorMsg);
    }
    return res.status(400).json({
      success: false,
      message: errorMsg
    });
  }
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
  const newRev = bumpDataRevision();
  saveDatabaseToDisk();

  res.json({
    success: true,
    message: 'បានបិទខមិននេះរួចរាល់ (រក្សាទុកក្នុងប្រវត្តិ)',
    invoice: inv,
    revision: newRev
  });
});

// POST /api/delete_basket - Delete a single basket completely
router.post('/delete_basket', (req: Request, res: Response) => {
  const { invoice_id, packer_name } = req.body;
  const cleanId = parseInt(String(invoice_id).replace('#', '').trim(), 10);

  const idx = invoices.findIndex(i => i.invoice_id === cleanId || i.basket_no === cleanId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'រកមិនឃើញវិក្កយបត្រនេះឡើយ' });
  }

  const targetInv = invoices[idx];

  // If there are any items with quantity, restore stock
  if (targetInv.items && targetInv.items.length > 0) {
    const liveId = targetInv.live_id || activeLiveId;
    for (const it of targetInv.items) {
      if (it.quantity > 0) {
        const prod = products.find(p => (p.live_id || activeLiveId) === liveId && p.code.toUpperCase() === it.product_code.toUpperCase());
        if (prod) {
          prod.stock_qty += it.quantity;
        }
      }
    }
  }

  const removedInv = invoices.splice(idx, 1)[0];
  const newRev = bumpDataRevision();
  saveDatabaseToDisk();

  console.log(`[Basket Deleted] Basket #${removedInv.basket_no || removedInv.invoice_id} deleted by ${packer_name || 'Staff'}.`);

  res.json({
    success: true,
    message: `បានលុបកន្ត្រក #${removedInv.basket_no || removedInv.invoice_id} (${removedInv.facebook_name}) រួចរាល់!`,
    deleted_invoice_id: removedInv.invoice_id,
    revision: newRev
  });
});

// POST /api/clean_empty_baskets - Bulk remove all empty ($0.00 / 0 items) baskets
router.post('/clean_empty_baskets', (req: Request, res: Response) => {
  const { live_id, all_lives } = req.body;
  const targetLive = live_id || activeLiveId;

  let deletedCount = 0;
  for (let i = invoices.length - 1; i >= 0; i--) {
    const inv = invoices[i];
    if (!all_lives && targetLive && inv.live_id !== targetLive) {
      continue;
    }

    // Never delete paid or dispatched baskets
    if (inv.status === 'Paid' || inv.payment_status === 'Paid' || inv.status === 'Dispatched' || inv.status === 'Packed' || inv.packing_stage === 'DISPATCHED') {
      continue;
    }

    // Check if basket is empty (no items or all items qty=0)
    const hasNoItems = !inv.items || inv.items.length === 0 || inv.items.every(it => !it.quantity || it.quantity === 0);
    if (hasNoItems) {
      invoices.splice(i, 1);
      deletedCount++;
    }
  }

  const newRev = bumpDataRevision();
  saveDatabaseToDisk();

  console.log(`[Bulk Clean] Cleaned ${deletedCount} empty baskets from ${all_lives ? 'all lives' : `Live #${targetLive}`}.`);

  res.json({
    success: true,
    deleted_count: deletedCount,
    message: `បានសម្អាតកន្ត្រកទទេចំនួន ${deletedCount} កញ្ចប់ចេញពីប្រព័ន្ធដោយជោគជ័យ!`,
    revision: newRev
  });
});

// GET /api/picking_list
router.get('/picking_list', (req: Request, res: Response) => {
  const liveId = (req.query.live_id as string) || activeLiveId;
  const targetInvoices = liveId ? invoices.filter(i => i.live_id === liveId && i.status !== 'Cancelled') : invoices;

  const summaryMap = new Map<string, {
    code: string;
    product_name: string;
    price: number;
    total_qty: number;
    exists_in_stock: boolean;
    stock_qty: number;
  }>();

  for (const inv of targetInvoices) {
    for (const it of inv.items) {
      const existing = summaryMap.get(it.product_code);
      if (existing) {
        existing.total_qty += it.quantity;
      } else {
        const prod = products.find(p => {
          if ((p.live_id || activeLiveId) !== liveId) return false;
          const pCode = p.code.toUpperCase().trim();
          const itCode = it.product_code.toUpperCase().trim();
          const cleanItCode = itCode.replace(/^\[|\]$/g, '');
          return pCode === itCode || pCode === cleanItCode || pCode.replace(/^\[|\]$/g, '') === cleanItCode;
        });

        summaryMap.set(it.product_code, {
          code: it.product_code,
          product_name: it.product_name,
          price: it.price,
          total_qty: it.quantity,
          exists_in_stock: !!prod,
          stock_qty: prod ? prod.stock_qty : 0
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

  const dateStr = new Date().toLocaleDateString('km-KH', { timeZone: 'Asia/Phnom_Penh' });
  const timeStr = new Date().toLocaleTimeString('km-KH', { timeZone: 'Asia/Phnom_Penh' });

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

// GET /api/live_sessions - Get all live sessions with count of baskets & stock items
router.get('/live_sessions', (_req: Request, res: Response) => {
  const allLiveIds = Array.from(new Set([
    ...invoices.map(i => i.live_id),
    ...products.map(p => p.live_id).filter(Boolean) as string[],
    activeLiveId
  ])).filter(Boolean);

  const getSessionTimestamp = (item: { created_at?: string; live_id: string }): number => {
    if (item.created_at) {
      const t = new Date(item.created_at).getTime();
      if (!isNaN(t) && t > 0) return t;

      const m = item.created_at.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (m) {
        const timeMatch = item.created_at.match(/(\d{1,2}):(\d{1,2})/);
        const hours = timeMatch ? parseInt(timeMatch[1], 10) : 0;
        const minutes = timeMatch ? parseInt(timeMatch[2], 10) : 0;
        const parsed = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), hours, minutes).getTime();
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }

    const dateMatch = item.live_id.match(/(\d{4})(\d{2})(\d{2})/);
    if (dateMatch) {
      const parsed = new Date(parseInt(dateMatch[1], 10), parseInt(dateMatch[2], 10) - 1, parseInt(dateMatch[3], 10)).getTime();
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    if (/^\d+$/.test(item.live_id)) {
      const num = parseInt(item.live_id.slice(0, 13), 10);
      if (!isNaN(num) && num > 100000000000) return num;
    }
    return 0;
  };

  const uniqueLiveIds = allLiveIds.map(liveId => {
    const sessionInvoices = invoices.filter(i => i.live_id === liveId);
    let sessionDate = '';
    if (sessionInvoices.length > 0) {
      const dates = sessionInvoices.map(i => i.created_at).filter(Boolean).sort().reverse();
      if (dates.length > 0) sessionDate = dates[0];
    }
    const sample = sessionInvoices[0];
    const count = sessionInvoices.filter(i => i.status !== 'Cancelled').length;
    const sessionProducts = products.filter(p => (p.live_id || activeLiveId) === liveId);
    const unsoldProducts = sessionProducts.filter(p => p.stock_qty > 0);
    return {
      live_id: liveId,
      created_at: sessionDate || sample?.created_at || new Date().toISOString(),
      basket_count: count,
      product_count: sessionProducts.length,
      unsold_product_count: unsoldProducts.length,
      is_active: liveId === activeLiveId
    };
  });

  // Sort:
  // 1. ACTIVE session ALWAYS goes to the very top (when active រត់ទៅ top)
  // 2. Newer dates first (ថ្ងៃថ្មីនៅ top / Descending order)
  // 3. Fallback: alphanumeric live_id descending
  uniqueLiveIds.sort((a, b) => {
    if (a.is_active && !b.is_active) return -1;
    if (!a.is_active && b.is_active) return 1;

    const tA = getSessionTimestamp(a);
    const tB = getSessionTimestamp(b);
    if (tA !== tB) {
      return tB - tA; // Newer date on top
    }

    return b.live_id.localeCompare(a.live_id, undefined, { numeric: true });
  });
  res.json({
    sessions: uniqueLiveIds,
    active_live_id: activeLiveId
  });
});

// GET /api/find_basket - Global Search for any basket/invoice across ALL live sessions!
router.get('/find_basket', (req: Request, res: Response) => {
  const rawBasket = String(req.query.basket || req.query.query || '').trim().replace(/^#/, '');
  if (!rawBasket) {
    return res.status(400).json({ success: false, error: 'Basket query is required' });
  }

  const numBasket = parseInt(rawBasket, 10);

  // 1. Search by exact basket_no or invoice_id
  let matched = invoices.find(i => 
    (!isNaN(numBasket) && (i.basket_no === numBasket || i.invoice_id === numBasket)) ||
    String(i.basket_no) === rawBasket ||
    String(i.invoice_id) === rawBasket
  );

  // 2. If not found by exact ID, search by customer phone or name or tracking code
  if (!matched) {
    matched = invoices.find(i => 
      (i.phone_number && i.phone_number.includes(rawBasket)) ||
      (i.facebook_name && i.facebook_name.toLowerCase().includes(rawBasket.toLowerCase()))
    );
  }

  if (!matched) {
    return res.json({
      success: true,
      found: false,
      message: `រកមិនឃើញកន្ត្រក #${rawBasket} ក្នុងប្រព័ន្ធឡើយ`
    });
  }

  const stage = matched.packing_stage || 'UNPICKED';
  let stageName = 'មិនទាន់រើស';
  if ((matched.status as any) === 'Paid' || (matched.payment_status as any) === 'Paid' || Boolean((matched as any).paid_at)) {
    stageName = 'បង់រួច - QC';
  } else if (stage === 'STAGED' || (stage as any) === 'WAITING_PAYMENT') {
    stageName = 'រង់ចាំបង់ប្រាក់';
  } else if (stage === 'DISPATCHED' || matched.status === 'Dispatched' || matched.status === 'Packed') {
    stageName = 'ចេញដឹកហើយ';
  }

  res.json({
    success: true,
    found: true,
    basket_no: matched.basket_no || matched.invoice_id,
    invoice_id: matched.invoice_id,
    live_id: matched.live_id,
    customer_name: matched.facebook_name,
    customer_phone: matched.phone_number,
    total_amount: matched.total_amount,
    stage: stage,
    stage_name: stageName,
    invoice: matched
  });
});

// POST /api/set_active_live_id
router.post('/set_active_live_id', (req: Request, res: Response) => {
  const { live_id } = req.body;
  if (live_id) {
    const clean = String(live_id).trim();
    setActiveLiveId(clean);
    bumpDataRevision();
    return res.json({ success: true, active_live_id: clean });
  }
  res.status(400).json({ success: false, error: 'Missing live_id' });
});

// POST /api/create_live_session
router.post('/create_live_session', (req: Request, res: Response) => {
  const { live_id, mode, source_live_id } = req.body;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const newId = (live_id && String(live_id).trim()) || `LIVE_${dateStr}_${timeStr}`;

  const previousLiveId = source_live_id || activeLiveId;
  let clonedCount = 0;

  if (mode === 'clone_unsold') {
    // Clone unsold remaining products (stock_qty > 0) from the previous live session
    const sourceProducts = products.filter(
      p => (p.live_id || activeLiveId) === previousLiveId && p.stock_qty > 0
    );
    for (const sp of sourceProducts) {
      const nextId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      products.push({
        id: nextId,
        live_id: newId,
        code: sp.code,
        name: sp.name,
        stock_qty: sp.stock_qty,
        price: sp.price,
        cost_price: sp.cost_price,
        image_file: sp.image_file
      });
      clonedCount++;
    }
  }

  setActiveLiveId(newId);
  bumpDataRevision();
  saveDatabaseToDisk();

  res.json({
    success: true,
    message: mode === 'clone_unsold'
      ? `🎉 បានបង្កើត Live ថ្មី៖ ${newId} និងចម្លងទំនិញសល់បាន ${clonedCount} មុខ!`
      : `✨ បានបង្កើត Live ថ្មី៖ ${newId} ជាមួយស្តុកទទេស្រឡាង!`,
    live_id: newId,
    mode: mode || 'blank',
    cloned_count: clonedCount
  });
});

// POST /api/delete_live_session - Delete a live session, its stock, and all associated baskets
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

  // Remove products associated with this live session
  const initialProductCount = products.length;
  for (let i = products.length - 1; i >= 0; i--) {
    if ((products[i].live_id || activeLiveId) === cleanLiveId) {
      products.splice(i, 1);
    }
  }
  const deletedProductCount = initialProductCount - products.length;

  // Remove raw comments associated with this live session
  for (let i = rawComments.length - 1; i >= 0; i--) {
    if (rawComments[i].live_id === cleanLiveId) {
      rawComments.splice(i, 1);
    }
  }

  // If the deleted session was currently the activeLiveId, switch to another remaining session
  if (activeLiveId === cleanLiveId) {
    const remainingLiveIds = Array.from(new Set([
      ...invoices.map(i => i.live_id),
      ...products.map(p => p.live_id).filter(Boolean) as string[]
    ])).filter(id => id && id !== cleanLiveId);

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

  console.log(`[Live Session Deleted] Deleted live #${cleanLiveId.slice(-8)} with ${deletedInvoicesCount} invoices and ${deletedProductCount} products.`);

  res.json({
    success: true,
    message: `បានលុបវគ្គ Live #${cleanLiveId.slice(-8)} (សរុប ${deletedInvoicesCount} កន្ត្រក, ${deletedProductCount} មុខទំនិញ) ជោគជ័យ!`,
    deleted_live_id: cleanLiveId,
    deleted_baskets_count: deletedInvoicesCount,
    deleted_products_count: deletedProductCount,
    active_live_id: activeLiveId
  });
});

// POST /api/clear_live_stock - Wipe all products for a specific live session
router.post('/clear_live_stock', (req: Request, res: Response) => {
  const { live_id, remove_from_baskets } = req.body;
  const targetLive = (live_id && String(live_id).trim()) || activeLiveId;
  if (!targetLive) {
    return res.status(400).json({ success: false, error: 'Live ID is required' });
  }

  let deletedCount = 0;
  for (let i = products.length - 1; i >= 0; i--) {
    if ((products[i].live_id || activeLiveId) === targetLive) {
      products.splice(i, 1);
      deletedCount++;
    }
  }

  let clearedBasketsCount = 0;
  if (remove_from_baskets) {
    invoices.forEach(inv => {
      if ((inv.live_id || activeLiveId) === targetLive && inv.status !== 'Dispatched') {
        if (inv.items && inv.items.length > 0) {
          inv.items = [];
          recalculateInvoice(inv);
          clearedBasketsCount++;
        }
      }
    });
  }

  bumpDataRevision();
  saveDatabaseToDisk();

  res.json({
    success: true,
    deleted_count: deletedCount,
    cleared_baskets_count: clearedBasketsCount,
    message: `🗑️ បានសម្អាតស្តុក Live #${targetLive.slice(-8)} អស់ ${deletedCount} មុខទំនិញជោគជ័យ!`
  });
});

router.get('/parser/settings', (_req: Request, res: Response) => {
  res.json({
    parser_strict_catalog: !!settings.parser_strict_catalog,
    parser_allow_standalone: settings.parser_allow_standalone !== false,
    auto_private_reply_enabled: !!settings.auto_private_reply_enabled,
    auto_private_reply_template: settings.auto_private_reply_template || ''
  });
});

// POST /api/parser/settings - Update regex parser configuration
router.post('/parser/settings', (req: Request, res: Response) => {
  const { parser_strict_catalog, parser_allow_standalone, auto_private_reply_enabled, auto_private_reply_template } = req.body;
  if (parser_strict_catalog !== undefined) {
    settings.parser_strict_catalog = !!parser_strict_catalog;
  }
  if (parser_allow_standalone !== undefined) {
    settings.parser_allow_standalone = !!parser_allow_standalone;
  }
  if (auto_private_reply_enabled !== undefined) {
    settings.auto_private_reply_enabled = !!auto_private_reply_enabled;
  }
  if (auto_private_reply_template !== undefined) {
    settings.auto_private_reply_template = String(auto_private_reply_template);
  }
  bumpDataRevision();
  saveDatabaseToDisk();
  res.json({
    success: true,
    settings: {
      parser_strict_catalog: settings.parser_strict_catalog,
      parser_allow_standalone: settings.parser_allow_standalone,
      auto_private_reply_enabled: settings.auto_private_reply_enabled,
      auto_private_reply_template: settings.auto_private_reply_template
    }
  });
});

// POST /api/comments/test_parse - Run comment parser simulation without database mutations
router.post('/comments/test_parse', (req: Request, res: Response) => {
  res.json({ success: true });
});

// POST /api/comments/test_simulate - Process a test or simulated live comment
router.post('/comments/test_simulate', (req: Request, res: Response) => {
  const { text, user_name, user_id, live_id } = req.body;
  const targetLiveId = live_id || activeLiveId;
  const result = parseAndAllocateComment(
    user_id || `sim_${Date.now()}`,
    user_name || 'អតិថិជន Live',
    text || '',
    targetLiveId
  );

  if (result.status === 'SUCCESS') {
    const matchingInv = invoices.find(i => i.invoice_id === result.invoice_id);
    recordRecentOrder({
      id: `ord_sim_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toISOString(),
      customer_name: user_name || 'អតិថិជន Live',
      customer_id: user_id,
      picture_url: matchingInv?.picture_url,
      comment_text: text || '',
      basket_no: matchingInv?.basket_no || '?',
      codes: (matchingInv?.items || []).map(it => `${it.product_code}x${it.quantity}`),
      allocated_items: (matchingInv?.items || []).map(it => ({
        code: it.product_code,
        product_name: it.product_name,
        quantity: it.quantity,
        price: it.price
      })),
      phone_number: matchingInv?.phone_number,
      address: matchingInv?.address,
      location_label: matchingInv?.location_label,
      total_amount: matchingInv?.total_amount || 0
    });
  }

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

// POST /api/telegram/delete_webhook - Explicitly remove any active webhook on Telegram Bot
router.post('/api/telegram/delete_webhook', async (req: Request, res: Response) => {
  const token = (req.body.token || settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) {
    return res.status(400).json({ success: false, error: 'សូមបញ្ចូល Bot Token ជាមុនសិន' });
  }
  const result = await deleteTelegramWebhook(token);
  res.json({
    success: result.success,
    message: result.success ? '✅ បានលុប Webhook ជោគជ័យ! Bot អាចទទួលទិន្នន័យបានធម្មតាវិញហើយ' : '❌ បរាជ័យក្នុងការលុប Webhook: ' + (result.description || '')
  });
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
    const targetLive = (req.body.live_id as string) || activeLiveId;
    const importRes = bulkImportStockItems(result.items.map(it => ({
      code: it.code,
      name: it.name,
      price: it.price,
      stock_qty: it.stock_qty,
      image_file: it.image_url
    })), 'merge', {
      keepExistingStockQty: req.body.keep_existing_stock_qty !== false,
      targetLiveId: targetLive
    });
    importedCount = importRes.imported + importRes.updated;
  }

  res.json({
    ...result,
    auto_imported: !!auto_import,
    imported_count: importedCount
  });
});

// POST /api/telegram/clear_cache - Clear cached scanned Telegram items
router.post('/telegram/clear_cache', (_req: Request, res: Response) => {
  clearScannedTelegramCache();
  res.json({ success: true, message: 'បានសម្អាតបញ្ជីកូដ Preview / Cache រួចរាល់' });
});

// GET /api/telegram/auto_sync - Get current Telegram Stock Auto-Sync Status
router.get('/telegram/auto_sync', (_req: Request, res: Response) => {
  res.json(getTelegramAutoSyncStatus());
});

// POST /api/telegram/auto_sync - Toggle or trigger Telegram Stock Auto-Sync
router.post('/telegram/auto_sync', async (req: Request, res: Response) => {
  const { enabled, interval_sec, trigger_now } = req.body;

  if (trigger_now) {
    const triggerRes = await executeTelegramAutoSyncOnce();
    return res.json({
      ...triggerRes,
      status: getTelegramAutoSyncStatus()
    });
  }

  if (enabled === true) {
    const targetLive = (req.body.live_id as string) || activeLiveId;
    const status = startTelegramAutoSync(Number(interval_sec || 10), targetLive);
    return res.json({ success: true, message: 'បានបើក Telegram Stock Auto-Sync!', status });
  } else if (enabled === false) {
    const status = stopTelegramAutoSync();
    return res.json({ success: true, message: 'បានបិទ Telegram Stock Auto-Sync!', status });
  }

  res.json({ success: true, status: getTelegramAutoSyncStatus() });
});

// GET /api/fb/live_auto_sync - Get current Facebook Live Comments Auto-Sync Status
router.get('/fb/live_auto_sync', (_req: Request, res: Response) => {
  res.json(getLiveCommentsAutoSyncStatus());
});

// POST /api/fb/live_auto_sync - Toggle or trigger Facebook Live Comments Auto-Sync
router.post('/fb/live_auto_sync', async (req: Request, res: Response) => {
  const { enabled, interval_sec, live_id, trigger_now } = req.body;

  if (trigger_now) {
    const syncRes = await executeLiveCommentsSyncOnce(live_id, true);
    return res.json({
      ...syncRes,
      status: getLiveCommentsAutoSyncStatus()
    });
  }

  if (enabled === true) {
    const status = startLiveCommentsAutoSync(Number(interval_sec || 3), live_id);
    return res.json({ success: true, message: 'បានបើក Real-time Live Comments Sync!', status });
  } else if (enabled === false) {
    const status = stopLiveCommentsAutoSync();
    return res.json({ success: true, message: 'បានបិទ Real-time Live Comments Sync!', status });
  }

  res.json({ success: true, status: getLiveCommentsAutoSyncStatus() });
});

// -------------------------------------------------------------
// 📦 Stock Bulk Import & Export Endpoints
// -------------------------------------------------------------

// POST /api/stock/bulk_import
router.post('/stock/bulk_import', (req: Request, res: Response) => {
  const { items, mode, keep_existing_stock_qty, live_id } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'មិនមានទិន្នន័យសម្រាប់នាំចូលឡើយ' });
  }

  const result = bulkImportStockItems(items, mode || 'merge', {
    keepExistingStockQty: keep_existing_stock_qty !== false,
    targetLiveId: (live_id as string) || activeLiveId
  });
  res.json(result);
});

// POST /api/stock/sync_baskets_price - Manually or automatically trigger sync of all active baskets with current stock prices
router.post('/stock/sync_baskets_price', (req: Request, res: Response) => {
  const targetLive = (req.body.live_id as string) || activeLiveId;
  const count = syncAllActiveInvoicesWithStock(targetLive);
  res.json({
    success: true,
    message: `បានធ្វើបច្ចុប្បន្នភាពតម្លៃទំនិញក្នុងកន្ត្រកចំនួន ${count} ដោយជោគជ័យ!`,
    updated_invoices: count
  });
});

// GET /api/stock/export_csv
router.get('/stock/export_csv', (req: Request, res: Response) => {
  const targetLive = (req.query.live_id as string) || activeLiveId;
  const targetProducts = products.filter(p => (p.live_id || activeLiveId) === targetLive);
  // UTF-8 BOM for Excel compatibility with Khmer script
  const BOM = '\uFEFF';
  const header = 'Code,Name,Price,Stock_Qty,Cost_Price,Image_URL\n';
  const rows = targetProducts.map(p => {
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
  const dateStr = now.toLocaleDateString('km-KH', { timeZone: 'Asia/Phnom_Penh', day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', hour12: true });

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
        ${it.item_comment ? `<div style="font-size: 14px; color: #000; font-weight: 800; margin-left: 24px; margin-top: 2px; word-break: break-word; overflow-wrap: break-word; line-height: 1.35;">↳ Note: "${it.item_comment}"</div>` : ''}
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
                ${(invoice.status === 'Paid' || invoice.paid_at || (invoice as any).payment_status === 'Paid') ? '✅ PAID' : (invoice.status === 'Dispatched' ? '💵 COD' : '⏳ UNPAID')}
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

// -------------------------------------------------------------
// 💰 Bakong Dynamic KHQR Endpoints (ABA Bank Integration)
// -------------------------------------------------------------

// GET /api/khqr/config - Get current KHQR store account settings
router.get('/khqr/config', (_req: Request, res: Response) => {
  const effectiveBakongId = (!settings.bakong_id || settings.bakong_id === '000474559@aba')
    ? 'abaakhppxxx@abaa'
    : settings.bakong_id;
  res.json({
    success: true,
    config: {
      bankName: settings.bank_name || 'ABA Bank',
      accountNumber: settings.account_number || '000474559',
      accountName: settings.account_name || 'Proel Toch',
      merchantName: settings.merchant_name || 'Kari Arnett',
      bakongAccountId: effectiveBakongId,
      merchantCity: settings.khqr_city || 'Phnom Penh',
      merchantType: (settings as any).khqr_merchant_type || 'merchant',
      qrMode: (settings as any).khqr_mode || 'dynamic',
      originalQRString: (settings as any).khqr_orig_string || '',
      originalQRImageUrl: (settings as any).khqr_orig_image || '',
      currency: 'USD',
      enabled: settings.khqr_enabled !== false
    }
  });
});

// POST /api/khqr/config - Update KHQR store account settings
router.post('/khqr/config', (req: Request, res: Response) => {
  const body = req.body || {};
  if (body.bankName !== undefined) settings.bank_name = String(body.bankName).trim();
  if (body.accountNumber !== undefined) settings.account_number = String(body.accountNumber).trim();
  if (body.accountName !== undefined) settings.account_name = String(body.accountName).trim();
  if (body.merchantName !== undefined) settings.merchant_name = String(body.merchantName).trim();
  if (body.bakongAccountId !== undefined) settings.bakong_id = String(body.bakongAccountId).trim();
  if (body.merchantCity !== undefined) settings.khqr_city = String(body.merchantCity).trim();
  if (body.merchantType !== undefined) (settings as any).khqr_merchant_type = String(body.merchantType).trim();
  if (body.qrMode !== undefined) (settings as any).khqr_mode = String(body.qrMode).trim();
  if (body.originalQRString !== undefined) (settings as any).khqr_orig_string = String(body.originalQRString);
  if (body.originalQRImageUrl !== undefined) (settings as any).khqr_orig_image = String(body.originalQRImageUrl);
  if (body.enabled !== undefined) settings.khqr_enabled = Boolean(body.enabled);

  saveDatabaseToDisk();
  res.json({
    success: true,
    message: 'បានរក្សាទុកការកំណត់ KHQR រួចរាល់!',
    config: {
      bankName: settings.bank_name,
      accountNumber: settings.account_number,
      accountName: settings.account_name,
      merchantName: settings.merchant_name,
      bakongAccountId: settings.bakong_id,
      merchantCity: settings.khqr_city,
      merchantType: (settings as any).khqr_merchant_type || 'merchant',
      qrMode: (settings as any).khqr_mode || 'dynamic',
      originalQRString: (settings as any).khqr_orig_string || '',
      originalQRImageUrl: (settings as any).khqr_orig_image || '',
      enabled: settings.khqr_enabled
    }
  });
});

// GET /api/khqr/image/:invoice_id - Return high-res Bakong KHQR image PNG for an invoice
router.get('/khqr/image/:invoice_id', async (req: Request, res: Response) => {
  try {
    const cleanId = parseInt(String(req.params.invoice_id).replace('#', '').trim(), 10);
    const inv = invoices.find(i => i.invoice_id === cleanId || i.basket_no === cleanId);
    const currency = (req.query.currency as string)?.toUpperCase() === 'KHR' ? 'KHR' : 'USD';

    let amount = 0;
    let billNumber: string | number = cleanId;
    let customerName = 'VIP Customer';

    if (inv) {
      const subtotal = inv.items.reduce((s, it) => s + (it.price * it.quantity), 0);
      const freeShipLimit = settings.free_ship_threshold || 0.0;
      const isFreeShip = freeShipLimit > 0 && subtotal >= freeShipLimit;
      const shippingFee = isFreeShip ? 0.0 : (inv.shipping_fee && inv.shipping_fee > 0 ? inv.shipping_fee : (settings.default_shipping_fee || 2.0));
      const exactUsd = Number((subtotal + shippingFee).toFixed(2));
      amount = currency === 'KHR' ? Math.round(exactUsd * (settings.exchange_rate || 4100)) : exactUsd;
      billNumber = inv.basket_no || inv.invoice_id;
      customerName = inv.facebook_name || customerName;
    } else if (req.query.amount) {
      amount = parseFloat(String(req.query.amount)) || 0;
    }

    const pngBuffer = await generateServerKHQRPNG({
      amount,
      currency,
      billNumber,
      customerName,
      storeLabel: settings.merchant_name || 'Kari Arnett'
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(pngBuffer);
  } catch (err: any) {
    console.error('Error generating KHQR image PNG:', err);
    res.status(500).json({ success: false, error: 'Failed to generate KHQR image' });
  }
});

// GET /api/khqr/image - Dynamic query-based KHQR Image
router.get('/khqr/image', async (req: Request, res: Response) => {
  try {
    const amount = parseFloat(String(req.query.amount || 0)) || 0;
    const currency = (req.query.currency as string)?.toUpperCase() === 'KHR' ? 'KHR' : 'USD';
    const billNumber = (req.query.basket || req.query.bill || '0') as string;
    const customerName = (req.query.customer || 'Customer') as string;

    const pngBuffer = await generateServerKHQRPNG({
      amount,
      currency,
      billNumber,
      customerName,
      storeLabel: settings.merchant_name || 'Kari Arnett'
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(pngBuffer);
  } catch (err: any) {
    console.error('Error generating generic KHQR image:', err);
    res.status(500).json({ success: false, error: 'Failed to generate KHQR image' });
  }
});

// GET /api/pay/:invoice_id - Rich Mobile Web Payment Screen with OpenGraph Metadata & Deep Links
router.get(['/pay/:invoice_id', '/invoice/pay/:invoice_id'], (req: Request, res: Response) => {
  const cleanId = parseInt(String(req.params.invoice_id).replace('#', '').trim(), 10);
  const inv = invoices.find(i => i.invoice_id === cleanId || i.basket_no === cleanId);

  const rawHost = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const baseUrl = `${proto}://${host}`;
  const khqrImgUrl = `${baseUrl}/api/khqr/image/${cleanId}`;

  const customerName = inv?.facebook_name || 'អតិថិជន VIP';
  const basketNo = inv?.basket_no || cleanId;
  const subtotal = inv ? inv.items.reduce((s, it) => s + (it.price * it.quantity), 0) : 0;
  const freeShipLimit = settings.free_ship_threshold || 0.0;
  const isFreeShip = freeShipLimit > 0 && subtotal >= freeShipLimit;
  const shippingFee = isFreeShip ? 0.0 : (inv?.shipping_fee !== undefined ? inv.shipping_fee : (settings.default_shipping_fee || 2.0));
  const exactUsd = Number((subtotal + shippingFee).toFixed(2));
  const exactKhr = Math.round(exactUsd * (settings.exchange_rate || 4100)).toLocaleString('en-US');
  const storeName = settings.merchant_name || 'Kari Arnett';
  const phone = inv?.phone_number || 'មិនទាន់បញ្ជាក់';
  const address = inv?.address || 'មិនទាន់បញ្ជាក់';

  const itemsHtml = inv && inv.items.length > 0
    ? inv.items.map(it => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.1); font-size: 14px;">
        <div style="color: #F1F5F9;">🔹 កូដ [${it.product_code}] x${it.quantity}</div>
        <div style="color: #38BDF8; font-weight: 700;">$${(it.price * it.quantity).toFixed(2)}</div>
      </div>
    `).join('')
    : '<div style="color: #94A3B8; text-align: center; padding: 12px 0;">ទំនិញកុម្ម៉ង់ទូទៅ</div>';

  const messengerUrl = inv?.facebook_user_id && !['FB_USER_ID_STREAM', 'MANUAL_USER_ID', 'NONE'].includes(inv.facebook_user_id)
    ? `https://www.facebook.com/messages/t/${inv.facebook_user_id}`
    : 'https://www.facebook.com/messages';

  const html = `<!DOCTYPE html>
<html lang="km">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>💳 ទូទាត់ប្រាក់ KHQR - កន្ត្រក #${basketNo} | ${storeName}</title>
  
  <!-- OpenGraph Metadata for Facebook Messenger Previews -->
  <meta property="og:title" content="💳 ស្កែនទូទាត់ប្រាក់ Bakong KHQR ($${exactUsd.toFixed(2)}) - ${storeName}">
  <meta property="og:description" content="វិក្កយបត្រកន្ត្រក #${basketNo} សម្រាប់ ${customerName} | សរុប $${exactUsd.toFixed(2)} / ${exactKhr} រៀល">
  <meta property="og:image" content="${khqrImgUrl}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="500">
  <meta property="og:image:height" content="700">
  <meta property="og:type" content="website">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700;800&display=swap" rel="stylesheet">

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Kantumruy Pro', -apple-system, sans-serif; }
    body { background: #060B14; color: #F8FAFC; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 16px; }
    .card { width: 100%; max-width: 440px; background: #0F172A; border: 1px solid #1E293B; border-radius: 28px; padding: 24px 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); text-align: center; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(225, 29, 72, 0.15); border: 1px solid rgba(225, 29, 72, 0.4); color: #FDA4AF; padding: 4px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; margin-bottom: 12px; }
    .title { font-size: 20px; font-weight: 800; color: #FFFFFF; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #94A3B8; margin-bottom: 18px; }
    .qr-container { background: #FFFFFF; border-radius: 20px; padding: 12px; display: inline-block; box-shadow: 0 8px 24px rgba(0,0,0,0.4); margin-bottom: 18px; width: 100%; max-width: 280px; }
    .qr-img { width: 100%; height: auto; border-radius: 12px; display: block; }
    .amount-box { background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9)); border: 1px solid #334155; border-radius: 18px; padding: 14px; margin-bottom: 18px; }
    .amount-usd { font-size: 28px; font-weight: 900; color: #22C55E; }
    .amount-khr { font-size: 14px; font-weight: 700; color: #FCD34D; margin-top: 2px; }
    .btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 14px; border-radius: 16px; font-size: 14px; font-weight: 800; text-decoration: none; border: none; cursor: pointer; transition: all 0.2s; margin-bottom: 10px; }
    .btn-download { background: #E11D48; color: white; box-shadow: 0 4px 16px rgba(225, 29, 72, 0.4); }
    .btn-download:hover { background: #BE123C; }
    .btn-messenger { background: #2563EB; color: white; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4); }
    .btn-messenger:hover { background: #1D4ED8; }
    .info-box { background: rgba(15, 23, 42, 0.6); border: 1px solid #1E293B; border-radius: 16px; padding: 14px; text-align: left; margin-top: 14px; font-size: 13px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 6px; color: #94A3B8; }
    .info-val { color: #E2E8F0; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🇰🇭 BAKONG KHQR PAYMENT</div>
    <div class="title">${storeName}</div>
    <div class="subtitle">អតិថិជន ៖ <strong>${customerName}</strong> (កន្ត្រក #${basketNo})</div>

    <!-- QR Code Image Card -->
    <div class="qr-container">
      <img src="${khqrImgUrl}" alt="KHQR Payment" class="qr-img">
    </div>

    <!-- Total Amount -->
    <div class="amount-box">
      <div style="font-size: 11px; color: #94A3B8; text-transform: uppercase; font-weight: 700;">ទឹកប្រាក់ត្រូវទូទាត់</div>
      <div class="amount-usd">$${exactUsd.toFixed(2)}</div>
      <div class="amount-khr">${exactKhr} រៀល</div>
    </div>

    <!-- Action Buttons -->
    <a href="${khqrImgUrl}" download="KHQR_Basket_${basketNo}.png" class="btn btn-download">
      <span>📥</span>
      <span>រក្សាទុករូបភាព QR (Save QR Code)</span>
    </a>

    <a href="${messengerUrl}" target="_blank" class="btn btn-messenger">
      <span>💬</span>
      <span>ផ្ញើ Slip ចូល Messenger ហាងវិញ</span>
    </a>

    <!-- Order Items Summary -->
    <div class="info-box">
      <div style="font-weight: 800; color: #F1F5F9; margin-bottom: 8px; border-bottom: 1px solid #334155; padding-bottom: 4px;">
        📦 បញ្ជីទំនិញក្នុងកន្ត្រក
      </div>
      ${itemsHtml}
      <div style="display: flex; justify-content: space-between; padding-top: 8px; font-size: 13px;">
        <span style="color: #94A3B8;">សេវាដឹកជញ្ជូន ៖</span>
        <span style="color: ${shippingFee === 0 ? '#4ADE80' : '#E2E8F0'}; font-weight: 700;">${shippingFee === 0 ? 'FREE ហ្វ្រីដឹក' : `$${shippingFee.toFixed(2)}`}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding-top: 4px; font-size: 13px; color: #94A3B8;">
        <span>ទូរស័ព្ទ / ទីតាំង ៖</span>
        <span style="color: #E2E8F0; font-weight: 600;">${phone} (${address})</span>
      </div>
    </div>

    <div style="font-size: 11px; color: #64748B; margin-top: 14px;">
      ✨ ស្កែនជាមួយកម្មវិធី ABA Mobile, ACLEDA ឬគ្រប់ធនាគារសមាជិកបាគង (Bakong)
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;

