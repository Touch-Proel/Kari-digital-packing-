import { Router, Request, Response } from 'express';
import { customers, invoices, rawComments, activeFacebookPage, activeLiveId, bumpDataRevision } from './db';
import { Customer, CustomerCRMRecord, DeliveryZone } from './types';
import { sendFacebookReply } from './fbAuth';

const router = Router();

/**
 * Helper to compute eligibility & CRM record for a customer
 */
function buildCRMRecord(c: Customer, allInvoices: typeof invoices): CustomerCRMRecord {
  const now = Date.now();

  // Find all invoices associated with this customer
  const cleanCustName = (c.facebook_name || '').trim().toLowerCase();
  const targetUserId = c.facebook_user_id && c.facebook_user_id !== 'FB_USER_ID_STREAM' ? c.facebook_user_id : null;

  const matchedInvoices = allInvoices.filter(inv => {
    if (targetUserId && inv.facebook_user_id && inv.facebook_user_id !== 'FB_USER_ID_STREAM') {
      return inv.facebook_user_id === targetUserId;
    }
    const invName = (inv.facebook_name || '').trim().toLowerCase();
    return invName && invName === cleanCustName;
  });

  const validInvoices = matchedInvoices.filter(i => i.status !== 'Cancelled');
  const totalOrders = validInvoices.length;
  const totalSpent = validInvoices.reduce((sum, i) => sum + (Number(i.total_amount) || 0), 0);
  const successfulOrders = validInvoices.filter(i =>
    i.status === 'Paid' ||
    i.packing_stage === 'DISPATCHED' ||
    (i as any).payment_status === 'Paid'
  ).length;

  // Find latest order date
  let lastOrderDate: string | undefined;
  let lastLiveId: string | undefined;
  if (matchedInvoices.length > 0) {
    const sorted = [...matchedInvoices].sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });
    lastOrderDate = sorted[0].created_at;
    lastLiveId = sorted[0].live_id;

    // Fill missing customer fields from latest invoice if available
    if ((!c.phone_number || c.phone_number === 'គ្មានលេខ') && sorted[0].phone_number && sorted[0].phone_number !== 'គ្មានលេខ') {
      c.phone_number = sorted[0].phone_number;
    }
    if ((!c.address || c.address.includes('មិនទាន់មាន')) && sorted[0].address && !sorted[0].address.includes('មិនទាន់មាន')) {
      c.address = sorted[0].address;
    }
    if (!c.picture_url && sorted[0].picture_url) {
      c.picture_url = sorted[0].picture_url;
    }
    if (!c.location_zone) {
      c.location_zone = sorted[0].location_zone === 'PP' ? 'PP' : 'PROVINCE';
      c.location_label = sorted[0].location_label || (c.location_zone === 'PP' ? '🏙️ ភ្នំពេញ' : '🏞️ តាមខេត្ត');
    }
  }

  // Days since last order
  let daysSinceLastOrder: number | undefined;
  if (lastOrderDate) {
    const orderTime = new Date(lastOrderDate).getTime();
    if (!isNaN(orderTime)) {
      daysSinceLastOrder = Math.max(0, Math.floor((now - orderTime) / (1000 * 60 * 60 * 24)));
    }
  }

  // Latest interaction timestamp for 24h eligibility check
  const latestInteractionStr = c.last_interaction_at || lastOrderDate;
  let hoursAgo = 9999;
  if (latestInteractionStr) {
    const interactionTime = new Date(latestInteractionStr).getTime();
    if (!isNaN(interactionTime)) {
      hoursAgo = Math.max(0, Math.floor((now - interactionTime) / (1000 * 60 * 60)));
    }
  }

  // Find all comment IDs for this customer from invoices & rawComments
  let lastCommentId: string | undefined;
  const commentIdsSet = new Set<string>();
  const recentLiveComments: Array<{
    comment_id: string;
    comment_text?: string;
    created_time?: string;
    live_id?: string;
  }> = [];

  // 1. Check matched invoices
  if (matchedInvoices.length > 0) {
    const sortedByDate = [...matchedInvoices].sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });
    for (const inv of sortedByDate) {
      if (inv.last_comment_id) {
        if (!lastCommentId) lastCommentId = inv.last_comment_id;
        commentIdsSet.add(inv.last_comment_id);
      }
      if (Array.isArray(inv.comment_ids)) {
        for (const cid of inv.comment_ids) {
          if (cid) {
            if (!lastCommentId) lastCommentId = cid;
            commentIdsSet.add(cid);
          }
        }
      }
    }
  }

  // 2. Check rawComments (from live stream)
  if (Array.isArray(rawComments)) {
    const matchedComments = rawComments.filter(cm => {
      if (targetUserId && cm.facebook_user_id && cm.facebook_user_id !== 'FB_USER_ID_STREAM') {
        return cm.facebook_user_id === targetUserId;
      }
      const cmName = (cm.facebook_name || '').trim().toLowerCase();
      return cmName && cmName === cleanCustName;
    });

    for (const cm of matchedComments) {
      if (cm.comment_id) {
        if (!lastCommentId) lastCommentId = cm.comment_id;
        commentIdsSet.add(cm.comment_id);
        recentLiveComments.push({
          comment_id: cm.comment_id,
          comment_text: cm.comment_text,
          created_time: cm.created_at || (cm as any).created_time,
          live_id: cm.live_id
        });
      }
    }
  }

  const allCommentIds = Array.from(commentIdsSet);

  // Determine eligibility status (< 24h = SAFE_24H, has comment = RECENT_7D with private reply, else EXPIRED)
  let eligibilityStatus: 'SAFE_24H' | 'RECENT_7D' | 'EXPIRED' = 'EXPIRED';
  let eligibilityLabel = '🔒 ផុតកំណត់ (> 7 ថ្ងៃ)';
  let eligibilityDesc = 'Facebook បានបិទសិទ្ធិផ្ញើសារ — ត្រូវចម្លងឈ្មោះទៅស្វែងរកក្នុង Meta Business Suite ឬខល/Telegram';
  let eligibilityColor = 'slate';
  let canMessage = false;

  if (hoursAgo <= 24) {
    eligibilityStatus = 'SAFE_24H';
    eligibilityLabel = '✅ អាចឆាតបាន (<24h)';
    eligibilityDesc = 'អន្តរកម្មក្រោម ២៤ ម៉ោង — សុវត្ថិភាពខ្ពស់ក្នុងការផ្ញើសារ Remarketing Direct';
    eligibilityColor = 'emerald';
    canMessage = true;
  } else if (allCommentIds.length > 0) {
    eligibilityStatus = 'RECENT_7D';
    eligibilityLabel = `💬 មាន Comment (${allCommentIds.length}) Private Reply`;
    eligibilityDesc = `មាន Comment ID ចំនួន ${allCommentIds.length} ក្នុង Live — អាចប្រើ Private Reply ផ្ញើសារចូល Messenger បាន!`;
    eligibilityColor = 'amber';
    canMessage = true;
  } else if (hoursAgo <= 24 * 7) {
    eligibilityStatus = 'RECENT_7D';
    eligibilityLabel = '⚠️ ហួស 24h (< 7 ថ្ងៃ)';
    eligibilityDesc = 'ហួស ២៤ ម៉ោង — ត្រូវចម្លងឈ្មោះទៅស្វែងរកក្នុង Meta Business Suite ឬខល/Telegram';
    eligibilityColor = 'amber';
    canMessage = false;
  }

  // VIP Tier determination
  let vipTier: 'DIAMOND' | 'GOLD' | 'SILVER' | 'REGULAR' | 'NEW' | 'INACTIVE' = 'NEW';
  if (c.is_vip || totalSpent >= 200 || totalOrders >= 8) {
    vipTier = 'DIAMOND';
  } else if (totalSpent >= 80 || totalOrders >= 4) {
    vipTier = 'GOLD';
  } else if (totalSpent >= 30 || totalOrders >= 2) {
    vipTier = 'SILVER';
  } else if (daysSinceLastOrder !== undefined && daysSinceLastOrder > 14 && totalOrders > 0) {
    vipTier = 'INACTIVE';
  } else if (totalOrders > 0) {
    vipTier = 'REGULAR';
  }

  return {
    ...c,
    location_zone: c.location_zone === 'PP' ? 'PP' : 'PROVINCE',
    location_label: c.location_label || (c.location_zone === 'PP' ? '🏙️ ភ្នំពេញ' : '🏞️ តាមខេត្ត'),
    total_orders: totalOrders,
    total_spent: Number(totalSpent.toFixed(2)),
    successful_orders: successfulOrders,
    last_order_date: lastOrderDate,
    last_live_id: lastLiveId,
    last_comment_id: lastCommentId,
    comment_ids: allCommentIds,
    recent_live_comments: recentLiveComments.slice(0, 10),
    days_since_last_order: daysSinceLastOrder,
    vip_tier: vipTier,
    eligibility: {
      status: eligibilityStatus,
      label: eligibilityLabel,
      can_message: canMessage,
      description: eligibilityDesc,
      color: eligibilityColor,
      hours_ago: hoursAgo
    }
  };
}

/**
 * Synchronize customers from existing invoices so no historical customer is missing
 */
function autoSyncCustomersFromInvoices() {
  for (const inv of invoices) {
    const invName = (inv.facebook_name || '').trim();
    if (!invName) continue;
    const invLower = invName.toLowerCase();
    const invFbId = inv.facebook_user_id && inv.facebook_user_id !== 'FB_USER_ID_STREAM' ? inv.facebook_user_id : null;

    let existing = invFbId
      ? customers.find(c => c.facebook_user_id === invFbId)
      : customers.find(c => c.facebook_name.toLowerCase() === invLower);

    if (!existing) {
      const nextId = customers.length > 0 ? Math.max(...customers.map(c => c.customer_id)) + 1 : 1;
      const newCust: Customer = {
        customer_id: nextId,
        facebook_user_id: inv.facebook_user_id || 'FB_USER_ID_STREAM',
        facebook_name: inv.facebook_name,
        picture_url: inv.picture_url,
        phone_number: inv.phone_number !== 'គ្មានលេខ' ? inv.phone_number : undefined,
        address: !inv.address?.includes('មិនទាន់មាន') ? inv.address : undefined,
        location_zone: inv.location_zone === 'PP' ? 'PP' : 'PROVINCE',
        location_label: inv.location_label || (inv.location_zone === 'PP' ? '🏙️ ភ្នំពេញ' : '🏞️ តាមខេត្ត'),
        is_zone_locked: false,
        is_vip: false,
        is_blacklist: false,
        notes: '',
        tags: [],
        last_interaction_at: inv.created_at
      };
      customers.push(newCust);
    } else {
      if ((!existing.phone_number || existing.phone_number === 'គ្មានលេខ') && inv.phone_number && inv.phone_number !== 'គ្មានលេខ') {
        existing.phone_number = inv.phone_number;
      }
      if ((!existing.address || existing.address.includes('មិនទាន់មាន')) && inv.address && !inv.address.includes('មិនទាន់មាន')) {
        existing.address = inv.address;
      }
      if (!existing.picture_url && inv.picture_url) {
        existing.picture_url = inv.picture_url;
      }
      if (inv.created_at && (!existing.last_interaction_at || new Date(inv.created_at).getTime() > new Date(existing.last_interaction_at).getTime())) {
        existing.last_interaction_at = inv.created_at;
      }
    }
  }
}

/**
 * GET /api/crm/customers
 * Returns all customers with aggregated order statistics and remarketing eligibility
 */
router.get('/customers', (_req: Request, res: Response) => {
  try {
    autoSyncCustomersFromInvoices();

    const records: CustomerCRMRecord[] = customers.map(c => buildCRMRecord(c, invoices));

    // Sort by total_spent descending (highest spenders first)
    records.sort((a, b) => {
      if (b.total_spent !== a.total_spent) return b.total_spent - a.total_spent;
      return (b.total_orders || 0) - (a.total_orders || 0);
    });

    const safe24hCount = records.filter(r => r.eligibility.status === 'SAFE_24H').length;
    const vipCount = records.filter(r => r.vip_tier === 'DIAMOND' || r.vip_tier === 'GOLD' || r.is_vip).length;
    const inactiveCount = records.filter(r => r.days_since_last_order !== undefined && r.days_since_last_order > 14).length;
    const ppCount = records.filter(r => r.location_zone === 'PP').length;
    const provinceCount = records.filter(r => r.location_zone !== 'PP').length;
    const totalRevenue = records.reduce((sum, r) => sum + r.total_spent, 0);

    return res.json({
      success: true,
      stats: {
        total_customers: records.length,
        safe_24h_count: safe24hCount,
        vip_count: vipCount,
        inactive_count: inactiveCount,
        pp_count: ppCount,
        province_count: provinceCount,
        total_revenue: Number(totalRevenue.toFixed(2))
      },
      customers: records
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * POST /api/crm/customers/:id/update
 * Updates customer details (phone, address, zone, notes, tags, is_vip, is_blacklist)
 */
router.post('/customers/:id/update', (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const cust = customers.find(c => c.customer_id === customerId);

    if (!cust) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const {
      phone_number,
      address,
      location_zone,
      is_zone_locked,
      is_vip,
      is_blacklist,
      notes,
      tags
    } = req.body;

    if (phone_number !== undefined) cust.phone_number = String(phone_number).trim();
    if (address !== undefined) cust.address = String(address).trim();
    if (location_zone !== undefined) {
      cust.location_zone = location_zone === 'PP' ? 'PP' : 'PROVINCE';
      cust.location_label = cust.location_zone === 'PP' ? '🏙️ ភ្នំពេញ' : '🏞️ តាមខេត្ត';
    }
    if (is_zone_locked !== undefined) cust.is_zone_locked = Boolean(is_zone_locked);
    if (is_vip !== undefined) cust.is_vip = Boolean(is_vip);
    if (is_blacklist !== undefined) cust.is_blacklist = Boolean(is_blacklist);
    if (notes !== undefined) cust.notes = String(notes).trim();
    if (tags !== undefined && Array.isArray(tags)) cust.tags = tags;

    // Cascade update to current/active invoices for this customer
    const cleanCustName = cust.facebook_name.toLowerCase();
    const targetUserId = cust.facebook_user_id && cust.facebook_user_id !== 'FB_USER_ID_STREAM' ? cust.facebook_user_id : null;

    for (const inv of invoices) {
      const match = targetUserId && inv.facebook_user_id && inv.facebook_user_id !== 'FB_USER_ID_STREAM'
        ? inv.facebook_user_id === targetUserId
        : inv.facebook_name.toLowerCase() === cleanCustName;

      if (match) {
        if (cust.phone_number) inv.phone_number = cust.phone_number;
        if (cust.address) inv.address = cust.address;
        if (cust.location_zone && cust.is_zone_locked) {
          inv.location_zone = cust.location_zone;
          inv.location_label = cust.location_label;
        }
      }
    }

    bumpDataRevision();

    const record = buildCRMRecord(cust, invoices);
    return res.json({ success: true, customer: record });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * POST /api/crm/customers/:id/log_remarket
 * Logs remarketing interaction timestamp
 */
router.post('/customers/:id/log_remarket', (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const cust = customers.find(c => c.customer_id === customerId);

    if (!cust) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    cust.last_remarketed_at = new Date().toISOString();
    bumpDataRevision();

    return res.json({ success: true, last_remarketed_at: cust.last_remarketed_at });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

/**
 * POST /api/crm/customers/:id/send_private_reply
 * Dispatches Meta Graph API Private Reply to customer's live comment
 */
router.post('/customers/:id/send_private_reply', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const cust = customers.find(c => c.customer_id === customerId);

    if (!cust) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const { comment_id, message } = req.body;
    const record = buildCRMRecord(cust, invoices);

    const targetCommentId = comment_id || record.last_comment_id || (record.comment_ids && record.comment_ids[0]);
    if (!targetCommentId) {
      return res.status(400).json({
        success: false,
        error: 'មិនមាន Comment ID សម្រាប់អតិថិជននេះទេ — សូមប្រើវិធីចម្លងឈ្មោះ ឬឆាតផ្ទាល់'
      });
    }

    const cleanName = cust.facebook_name || 'អូន';
    const msgText = message || `ជម្រាបសួរអូន ${cleanName} ចាស! ចែឃើញអូនបានខមិនក្នុង Live អាវយឺតកាលពីយប់មិញ ម៉ូតដែលអូនចាប់អារម្មណ៍ឥឡូវចូលស្តុកគ្រប់ Size (S, M, L, XL, Oversize) ណាអូន! បើអូនចង់បានអាចតបឆាតនេះបានចាស 🥰✨👕`;

    // Attempt Meta Graph API Private Reply
    const replyResult = await sendFacebookReply(
      targetCommentId,
      cust.facebook_user_id || null,
      msgText,
      activeFacebookPage?.access_token,
      undefined,
      undefined,
      record.comment_ids
    );

    // Record last remarketed timestamp
    cust.last_remarketed_at = new Date().toISOString();
    bumpDataRevision();

    return res.json({
      success: replyResult.success || replyResult.method === 'MANUAL_COPIED',
      method: replyResult.method || 'PRIVATE_REPLY',
      methodTitle: replyResult.methodTitle || 'Private Reply (តាម Comment ID)',
      detail: replyResult.detail || replyResult.error || `បានចាត់ចែង Private Reply តាម Comment #${targetCommentId}`,
      comment_id: targetCommentId,
      last_remarketed_at: cust.last_remarketed_at
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

export default router;
