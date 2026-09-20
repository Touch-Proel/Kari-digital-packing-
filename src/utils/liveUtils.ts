// Utility helpers for consistent Live session formatting across the entire app

/**
 * Returns formatted title for Live session, matching ManageLiveSessionsModal & Header
 * Examples:
 * - 'LIVE_20260913_VIP' -> 'Live VIP (13/09)'
 * - '1629734345109466' -> 'Live #85109466' (last 8 digits)
 * - '85109466' -> 'Live #85109466'
 */
export function getLiveDisplayTitle(liveId?: string | null): string {
  if (!liveId || liveId === 'ALL') return '🌐 គ្រប់ Live (ទាំងអស់)';
  
  if (liveId.startsWith('LIVE_')) {
    const parts = liveId.replace('LIVE_', '').split('_');
    if (parts.length >= 2) {
      const d = parts[0];
      const day = d.slice(6, 8);
      const month = d.slice(4, 6);
      return `Live ${parts[1]} (${day}/${month})`;
    }
    return `Live ${liveId.replace('LIVE_', '')}`;
  }
  
  if (/^\d+$/.test(liveId)) {
    const shortId = liveId.length > 8 ? liveId.slice(-8) : liveId;
    return `Live #${shortId}`;
  }
  
  return `Live #${liveId}`;
}

/**
 * Returns clean short badge label for compact UI cards (e.g. BasketCard)
 * Examples:
 * - 'LIVE_20260913_VIP' -> '#VIP'
 * - '1629734345109466' -> '#85109466' (last 8 digits matching Live list)
 * - '85109466' -> '#85109466'
 */
export function formatLiveShortBadge(liveId?: string | null): string {
  if (!liveId || liveId === 'ALL') return '';
  
  if (liveId.startsWith('LIVE_')) {
    const parts = liveId.replace('LIVE_', '').split('_');
    if (parts.length >= 2) {
      return `#${parts[1]}`;
    }
    return `#${liveId.replace('LIVE_', '')}`;
  }
  
  if (/^\d+$/.test(liveId)) {
    const shortId = liveId.length > 8 ? liveId.slice(-8) : liveId;
    return `#${shortId}`;
  }
  
  return `#${liveId}`;
}
