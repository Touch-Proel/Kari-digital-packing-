/**
 * Helper to open Meta Business Suite Inbox directly in browser tab
 */
export function openMetaInboxDirect(userId?: string, pageId?: string) {
  const cleanMailboxId = String(pageId || '102094263212256').trim();
  const cleanUid = String(userId || '').trim();
  const hasValidId = Boolean(
    cleanUid &&
    !['FB_USER_ID_STREAM', 'MANUAL_USER_ID', 'NONE', 'None', 'undefined', 'null', ''].includes(cleanUid) &&
    cleanUid.length > 3
  );

  const targetUrl = hasValidId
    ? `https://business.facebook.com/latest/inbox/messenger?selected_item_id=${cleanUid}&mailbox_id=${cleanMailboxId}&thread_type=FB_MESSAGE`
    : `https://business.facebook.com/latest/inbox/messenger?mailbox_id=${cleanMailboxId}&thread_type=FB_MESSAGE`;

  try {
    const newWindow = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      const link = document.createElement('a');
      link.href = targetUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch {
    window.open(targetUrl, '_blank');
  }
}

