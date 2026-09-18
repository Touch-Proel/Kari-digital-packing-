import { fetchFacebookComments } from './fbAuth';
import { parseAndAllocateComment } from './parser';
import {
  activeLiveId,
  setActiveLiveId,
  invoices,
  bumpDataRevision,
  saveDatabaseToDisk,
  settings
} from './db';

export interface RecentLiveOrder {
  id: string;
  timestamp: string;
  customer_name: string;
  customer_id?: string;
  comment_text: string;
  basket_no: number | string;
  codes: string[];
  total_amount: number;
}

export interface LiveCommentsAutoSyncStatus {
  enabled: boolean;
  intervalSec: number;
  activeLiveId: string;
  lastSyncAt: string | null;
  totalCommentsSynced: number;
  totalOrdersAllocated: number;
  lastNewOrdersCount: number;
  lastError: string | null;
  running: boolean;
  recentOrders: RecentLiveOrder[];
}

const liveSyncState: LiveCommentsAutoSyncStatus = {
  enabled: true,
  intervalSec: 3, // Default 3 seconds for real-time live comments
  activeLiveId: activeLiveId || '1630588828526235',
  lastSyncAt: null,
  totalCommentsSynced: 0,
  totalOrdersAllocated: 0,
  lastNewOrdersCount: 0,
  lastError: null,
  running: false,
  recentOrders: []
};

let liveSyncTimer: NodeJS.Timeout | null = null;

// Auto-boot background sync loop
setTimeout(() => {
  if (!liveSyncTimer && liveSyncState.enabled) {
    startLiveCommentsAutoSync(3, liveSyncState.activeLiveId);
  }
}, 3000);

// Keep last 25 recent orders for real-time live feed
function recordRecentOrder(order: RecentLiveOrder) {
  liveSyncState.recentOrders.unshift(order);
  if (liveSyncState.recentOrders.length > 25) {
    liveSyncState.recentOrders.pop();
  }
}

/**
 * Execute one iteration of pulling Facebook comments and allocating to baskets
 */
export async function executeLiveCommentsSyncOnce(customLiveId?: string, force = false): Promise<{
  success: boolean;
  target_live_id: string;
  total_synced: number;
  new_orders: number;
  total_baskets: number;
  error?: string;
  is_simulated?: boolean;
}> {
  if (!force && !liveSyncState.enabled) {
    return {
      success: true,
      target_live_id: customLiveId || liveSyncState.activeLiveId || activeLiveId,
      total_synced: 0,
      new_orders: 0,
      total_baskets: invoices.filter(i => i.live_id === (customLiveId || activeLiveId) && i.status !== 'Cancelled').length
    };
  }

  if (liveSyncState.running) {
    return {
      success: true,
      target_live_id: liveSyncState.activeLiveId,
      total_synced: 0,
      new_orders: 0,
      total_baskets: invoices.filter(i => i.live_id === liveSyncState.activeLiveId && i.status !== 'Cancelled').length
    };
  }

  const targetId = customLiveId || liveSyncState.activeLiveId || activeLiveId;
  if (!targetId) {
    return {
      success: false,
      target_live_id: '',
      total_synced: 0,
      new_orders: 0,
      total_baskets: 0,
      error: 'មិនទាន់មានលេខសម្គាល់ Live Video (Live ID) ឡើយ'
    };
  }

  liveSyncState.running = true;
  liveSyncState.activeLiveId = targetId;
  if (targetId !== activeLiveId) {
    setActiveLiveId(targetId);
  }

  try {
    const result = await fetchFacebookComments(targetId);
    if (result.error && (!result.data || result.data.length === 0)) {
      liveSyncState.lastError = result.error;
      liveSyncState.lastSyncAt = new Date().toISOString();
      return {
        success: false,
        target_live_id: targetId,
        total_synced: 0,
        new_orders: 0,
        total_baskets: 0,
        error: result.error
      };
    }

    const comments = result.data || [];
    let newAllocatedCount = 0;

    for (const c of comments) {
      const parsed = parseAndAllocateComment(
        c.from?.id || '',
        c.from?.name || 'អតិថិជន Facebook',
        c.message || '',
        targetId,
        c.id,
        c.from?.picture?.data?.url
      );

      if (parsed.status === 'SUCCESS') {
        newAllocatedCount++;
        liveSyncState.totalOrdersAllocated++;

        // Find basket info
        const matchingInv = invoices.find(
          i => i.live_id === targetId &&
               i.status !== 'Cancelled' &&
               (i.facebook_user_id === (c.from?.id || '') || i.facebook_name === (c.from?.name || ''))
        );

        recordRecentOrder({
          id: c.id || `ord_${Date.now()}_${Math.random()}`,
          timestamp: new Date().toISOString(),
          customer_name: c.from?.name || 'អតិថិជន Facebook',
          customer_id: c.from?.id,
          comment_text: c.message || '',
          basket_no: matchingInv?.basket_no || '?',
          codes: matchingInv?.items.map(it => `${it.product_code}x${it.quantity}`) || [],
          total_amount: matchingInv?.total_amount || 0
        });
      }
    }

    liveSyncState.lastSyncAt = new Date().toISOString();
    liveSyncState.totalCommentsSynced += comments.length;
    liveSyncState.lastNewOrdersCount = newAllocatedCount;
    liveSyncState.lastError = null;

    if (newAllocatedCount > 0) {
      bumpDataRevision();
      saveDatabaseToDisk();
      console.log(`🎉 [Live Real-Time Sync]: Allocated ${newAllocatedCount} new orders into baskets from Live #${targetId}!`);
    }

    const activeBaskets = invoices.filter(i => i.live_id === targetId && i.status !== 'Cancelled');

    return {
      success: true,
      target_live_id: targetId,
      total_synced: comments.length,
      new_orders: newAllocatedCount,
      total_baskets: activeBaskets.length,
      is_simulated: result.isSimulated || false
    };
  } catch (err: any) {
    liveSyncState.lastError = err.message || 'Error pulling live comments';
    liveSyncState.lastSyncAt = new Date().toISOString();
    return {
      success: false,
      target_live_id: targetId,
      total_synced: 0,
      new_orders: 0,
      total_baskets: 0,
      error: err.message || 'Error communicating with Facebook API'
    };
  } finally {
    liveSyncState.running = false;
  }
}

/**
 * Start real-time live comments background polling
 */
export function startLiveCommentsAutoSync(intervalSec = 3, liveId?: string) {
  if (intervalSec < 2) intervalSec = 2; // Safeguard minimum 2 seconds
  liveSyncState.intervalSec = intervalSec;
  if (liveId) {
    liveSyncState.activeLiveId = liveId;
    setActiveLiveId(liveId);
  }
  liveSyncState.enabled = true;

  if (liveSyncTimer) {
    clearInterval(liveSyncTimer);
    liveSyncTimer = null;
  }

  // Trigger immediate first pull
  executeLiveCommentsSyncOnce(liveSyncState.activeLiveId);

  // Set recurring interval
  liveSyncTimer = setInterval(() => {
    if (liveSyncState.enabled) {
      executeLiveCommentsSyncOnce(liveSyncState.activeLiveId);
    }
  }, liveSyncState.intervalSec * 1000);

  console.log(`🔴 [Live Comments Auto-Sync STARTED]: Polling Live #${liveSyncState.activeLiveId} every ${liveSyncState.intervalSec}s`);
  return getLiveCommentsAutoSyncStatus();
}

/**
 * Stop real-time live comments background polling
 */
export function stopLiveCommentsAutoSync() {
  liveSyncState.enabled = false;
  if (liveSyncTimer) {
    clearInterval(liveSyncTimer);
    liveSyncTimer = null;
  }
  console.log(`⏹️ [Live Comments Auto-Sync STOPPED]`);
  return getLiveCommentsAutoSyncStatus();
}

/**
 * Get current live auto sync status
 */
export function getLiveCommentsAutoSyncStatus(): LiveCommentsAutoSyncStatus {
  return {
    ...liveSyncState,
    activeLiveId: liveSyncState.activeLiveId || activeLiveId
  };
}
