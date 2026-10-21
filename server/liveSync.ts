import { fetchFacebookComments, clearLiveStreamCache } from './fbAuth.ts';
import { parseAndAllocateComment, syncProcessedCommentKeysWithInvoices } from './parser.ts';
import {
  activeLiveId,
  setActiveLiveId,
  getLinkedVideosForSession,
  invoices,
  bumpDataRevision,
  saveDatabaseToDisk,
  settings
} from './db.ts';

export interface RecentLiveOrder {
  id: string;
  timestamp: string;
  customer_name: string;
  customer_id?: string;
  picture_url?: string;
  comment_text: string;
  basket_no: number | string;
  codes: string[];
  allocated_items?: {
    code: string;
    product_name: string;
    quantity: number;
    price: number;
  }[];
  phone_number?: string;
  address?: string;
  location_label?: string;
  total_amount: number;
}

export interface LiveCommentsAutoSyncStatus {
  enabled: boolean;
  intervalSec: number;
  activeLiveId: string;
  linkedVideoIds?: string[];
  lastSyncAt: string | null;
  totalCommentsSynced: number;
  totalOrdersAllocated: number;
  lastNewOrdersCount: number;
  lastError: string | null;
  running: boolean;
  recentOrders: RecentLiveOrder[];
}

const liveSyncState: LiveCommentsAutoSyncStatus = {
  enabled: false,
  intervalSec: 3,
  activeLiveId: activeLiveId || '1630588828526235',
  linkedVideoIds: [],
  lastSyncAt: null,
  totalCommentsSynced: 0,
  totalOrdersAllocated: 0,
  lastNewOrdersCount: 0,
  lastError: null,
  running: false,
  recentOrders: []
};

let liveSyncTimer: NodeJS.Timeout | null = null;

// Keep last 25 recent orders for real-time live feed
export function recordRecentOrder(order: RecentLiveOrder) {
  liveSyncState.recentOrders.unshift(order);
  if (liveSyncState.recentOrders.length > 25) {
    liveSyncState.recentOrders.pop();
  }
}

/**
 * Execute one iteration of pulling Facebook comments from primary + all linked Live videos
 * and allocating to unified baskets in the primary session
 */
export async function executeLiveCommentsSyncOnce(customLiveId?: string, force = false): Promise<{
  success: boolean;
  target_live_id: string;
  linked_videos?: string[];
  total_synced: number;
  new_orders: number;
  total_baskets: number;
  error?: string;
  is_simulated?: boolean;
}> {
  if (!force && !liveSyncState.enabled) {
    const tId = customLiveId || liveSyncState.activeLiveId || activeLiveId;
    return {
      success: true,
      target_live_id: tId,
      linked_videos: getLinkedVideosForSession(tId),
      total_synced: 0,
      new_orders: 0,
      total_baskets: invoices.filter(i => i.live_id === tId && i.status !== 'Cancelled').length
    };
  }

  if (liveSyncState.running) {
    return {
      success: true,
      target_live_id: liveSyncState.activeLiveId,
      linked_videos: getLinkedVideosForSession(liveSyncState.activeLiveId),
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

  const videoIdsToPull = getLinkedVideosForSession(targetId);
  liveSyncState.linkedVideoIds = videoIdsToPull;

  try {
    const currentBasketsCount = invoices.filter(i => i.live_id === targetId && i.status !== 'Cancelled').length;
    const shouldForceFull = force || currentBasketsCount === 0;
    const isRealtime = !shouldForceFull;

    // Ensure processedCommentKeys matches current active baskets in targetId
    syncProcessedCommentKeysWithInvoices(targetId);
    if (shouldForceFull) {
      for (const vid of videoIdsToPull) {
        clearLiveStreamCache(vid);
      }
    }

    let totalCommentsFetched = 0;
    let newAllocatedCount = 0;
    let newProcessedCommentsCount = 0;
    let anySimulated = false;
    let firstError: string | null = null;
    let anySuccess = false;

    for (const videoId of videoIdsToPull) {
      const result = await fetchFacebookComments(
        videoId,
        undefined,
        shouldForceFull ? 15000 : 200,
        { isRealtimePoll: isRealtime, forceFullFetch: shouldForceFull }
      );

      if (result.error && (!result.data || result.data.length === 0)) {
        if (!firstError) firstError = result.error;
        continue;
      }

      anySuccess = true;
      if (result.isSimulated) anySimulated = true;
      const comments = result.data || [];
      totalCommentsFetched += comments.length;

      for (const c of comments) {
        // Allocate into the primary targetId session so Part 1 + Part 2 share 1 unified basket per customer!
        const parsed = parseAndAllocateComment(
          c.from?.id || '',
          c.from?.name || 'អតិថិជន Facebook',
          c.message || '',
          targetId,
          c.id,
          c.from?.picture?.data?.url,
          true // batchMode = true
        );

        if (parsed.status !== 'IGNORED') {
          newProcessedCommentsCount++;
        }

        if (parsed.status === 'SUCCESS') {
          newAllocatedCount++;
          liveSyncState.totalOrdersAllocated++;

          // Find basket info in primary targetId
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
            picture_url: c.from?.picture?.data?.url || matchingInv?.picture_url,
            comment_text: c.message || '',
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
      }
    }

    if (!anySuccess && firstError) {
      liveSyncState.lastError = firstError;
      liveSyncState.lastSyncAt = new Date().toISOString();
      return {
        success: false,
        target_live_id: targetId,
        linked_videos: videoIdsToPull,
        total_synced: 0,
        new_orders: 0,
        total_baskets: 0,
        error: firstError
      };
    }

    // Fast return if zero new comments in incremental poll
    if (totalCommentsFetched === 0 && isRealtime) {
      liveSyncState.lastSyncAt = new Date().toISOString();
      liveSyncState.lastError = null;
      return {
        success: true,
        target_live_id: targetId,
        linked_videos: videoIdsToPull,
        total_synced: liveSyncState.totalCommentsSynced,
        new_orders: 0,
        total_baskets: invoices.filter(i => i.live_id === targetId && i.status !== 'Cancelled').length
      };
    }

    liveSyncState.lastSyncAt = new Date().toISOString();
    liveSyncState.totalCommentsSynced += totalCommentsFetched;
    liveSyncState.lastNewOrdersCount = newAllocatedCount;
    liveSyncState.lastError = null;

    if (newProcessedCommentsCount > 0) {
      bumpDataRevision();
      console.log(`🎉 [Live Real-Time Sync]: Processed ${newProcessedCommentsCount} comments (${newAllocatedCount} new orders) across ${videoIdsToPull.length} linked video(s) into Live #${targetId}!`);
    }

    const activeBaskets = invoices.filter(i => i.live_id === targetId && i.status !== 'Cancelled');

    return {
      success: true,
      target_live_id: targetId,
      linked_videos: videoIdsToPull,
      total_synced: totalCommentsFetched,
      new_orders: newAllocatedCount,
      total_baskets: activeBaskets.length,
      is_simulated: anySimulated
    };
  } catch (err: any) {
    liveSyncState.lastError = err.message || 'Error pulling live comments';
    liveSyncState.lastSyncAt = new Date().toISOString();
    return {
      success: false,
      target_live_id: targetId,
      linked_videos: videoIdsToPull,
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
  liveSyncState.linkedVideoIds = getLinkedVideosForSession(liveSyncState.activeLiveId);
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

  console.log(`🔴 [Live Comments Auto-Sync STARTED]: Polling Live #${liveSyncState.activeLiveId} (${liveSyncState.linkedVideoIds.length} video(s)) every ${liveSyncState.intervalSec}s`);
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
  const currentId = liveSyncState.activeLiveId || activeLiveId;
  return {
    ...liveSyncState,
    activeLiveId: currentId,
    linkedVideoIds: getLinkedVideosForSession(currentId)
  };
}

