// Utility helpers for consistent Live session formatting across the entire app

/**
 * Returns formatted title for Live session, matching ManageLiveSessionsModal & Header
 * Examples:
 * - 'LIVE_20260913_VIP' -> 'Live VIP (13/09)'
 * - '102094263212256_2190167734893349' -> 'Live #2190167734893349'
 * - '2190167734893349' -> 'Live #2190167734893349'
 */
export function getLiveDisplayTitle(liveId?: string | null): string {
  if (!liveId || liveId === 'ALL') return '🌐 គ្រប់ Live (ទាំងអស់)';
  
  const cleanId = liveId.includes('_') && !liveId.startsWith('LIVE_')
    ? liveId.split('_').pop() || liveId
    : liveId;

  if (cleanId.startsWith('LIVE_')) {
    const parts = cleanId.replace('LIVE_', '').split('_');
    if (parts.length >= 2) {
      const d = parts[0];
      const day = d.slice(6, 8);
      const month = d.slice(4, 6);
      return `Live ${parts[1]} (${day}/${month})`;
    }
    return `Live ${cleanId.replace('LIVE_', '')}`;
  }
  
  return `Live #${cleanId}`;
}

/**
 * Returns clean short badge label for compact UI cards (e.g. BasketCard)
 * Examples:
 * - 'LIVE_20260913_VIP' -> '#VIP'
 * - '102094263212256_2190167734893349' -> '#2190167734893349'
 */
export function formatLiveShortBadge(liveId?: string | null): string {
  if (!liveId || liveId === 'ALL') return '';
  
  const cleanId = liveId.includes('_') && !liveId.startsWith('LIVE_')
    ? liveId.split('_').pop() || liveId
    : liveId;

  if (cleanId.startsWith('LIVE_')) {
    const parts = cleanId.replace('LIVE_', '').split('_');
    if (parts.length >= 2) {
      return `#${parts[1]}`;
    }
    return `#${cleanId.replace('LIVE_', '')}`;
  }
  
  return `#${cleanId}`;
}

/**
 * Normalizes any live session ID to ensure no composite page_id prefix remains
 */
export function normalizeLiveId(liveId?: string | null): string {
  if (!liveId) return '';
  if (liveId.includes('_') && !liveId.startsWith('LIVE_')) {
    return liveId.split('_').pop() || liveId;
  }
  return liveId;
}
