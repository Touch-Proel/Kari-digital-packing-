/**
 * Helper to open Meta Business Suite Inbox directly in browser tab
 * Format: https://business.facebook.com/latest/inbox/messenger?selected_item_id={USER_ID}&mailbox_id={PAGE_ID}&thread_type=FB_MESSAGE
 */
export function openMetaInboxDirect(userId?: string, pageId?: string) {
  const cleanUid = String(userId || '').trim();
  const hasValidId = Boolean(
    cleanUid &&
    !['FB_USER_ID_STREAM', 'MANUAL_USER_ID', 'NONE', 'None', 'undefined', 'null', ''].includes(cleanUid) &&
    cleanUid.length > 3
  );

  const cleanMailboxId = String(pageId || '102094263212256').trim();

  const params = new URLSearchParams();
  if (hasValidId) {
    params.set('selected_item_id', cleanUid);
  }
  if (cleanMailboxId) {
    params.set('mailbox_id', cleanMailboxId);
  }
  params.set('thread_type', 'FB_MESSAGE');

  const webUrl = `https://business.facebook.com/latest/inbox/messenger?${params.toString()}`;

  // Use standard, safe tab navigation
  try {
    const newWindow = window.open(webUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      // Fallback if popup blocked
      const link = document.createElement('a');
      link.href = webUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch {
    window.open(webUrl, '_blank');
  }
}

