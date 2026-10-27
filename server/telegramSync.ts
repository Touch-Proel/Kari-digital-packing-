import fs from 'fs';
import path from 'path';
import {
  products,
  invoices,
  activeLiveId,
  normalizeLiveId,
  setActiveLiveId,
  getPhnomPenhDateKey,
  getSessionOriginalDateKey,
  isLiveSessionFromPreviousDay,
  resolveSafeTargetLiveForTelegram,
  recalculateInvoice,
  settings,
  saveDatabaseToDisk,
  bumpDataRevision,
  syncAllActiveInvoicesWithStock
} from './db.ts';
import type { Product } from './types.ts';
import { broadcastSSE } from './packingRoutes.ts';

export interface TelegramItemParsed {
  code: string;
  name: string;
  price: number;
  stock_qty: number;
  cost_price?: number;
  image_url?: string;
  live_id?: string;
  chat_id?: number | string;
  chat_title?: string;
  sender_name?: string;
  message_date?: string;
  original_text?: string;
  message_id?: number;
  is_fresh_image?: boolean;
}

export interface TelegramBotInfo {
  id: number;
  username: string;
  first_name: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
}

export interface BufferedMediaItem {
  file_id: string;
  live_id?: string;
  chat_id?: number | string;
  chat_title?: string;
  sender_name?: string;
  message_id: number;
  date_sec: number;
  date_iso: string;
  media_group_id?: string;
  caption?: string;
  photo_url?: string;
  matched_codes?: string[];
  created_at: number;
}

// In-memory media sliding window buffer (keeps last 100 media messages for up to 60 minutes)
export const recentTelegramMediaBuffer: BufferedMediaItem[] = [];
const MAX_MEDIA_BUFFER_SIZE = 120;
const MEDIA_BUFFER_EXPIRY_MS = 60 * 60 * 1000; // 60 minutes

export function addMediaToBuffer(item: BufferedMediaItem) {
  // Clean expired items
  const now = Date.now();
  for (let i = recentTelegramMediaBuffer.length - 1; i >= 0; i--) {
    if (now - recentTelegramMediaBuffer[i].created_at > MEDIA_BUFFER_EXPIRY_MS) {
      recentTelegramMediaBuffer.splice(i, 1);
    }
  }

  // Deduplicate by file_id
  const existingIdx = recentTelegramMediaBuffer.findIndex(m => m.file_id === item.file_id);
  if (existingIdx >= 0) {
    recentTelegramMediaBuffer[existingIdx] = { ...recentTelegramMediaBuffer[existingIdx], ...item };
  } else {
    recentTelegramMediaBuffer.unshift(item);
    if (recentTelegramMediaBuffer.length > MAX_MEDIA_BUFFER_SIZE) {
      recentTelegramMediaBuffer.pop();
    }
  }
}

// 1. Verify Telegram Bot Token
const downloadedPhotoCache = new Map<string, string>();
const botInfoCache = new Map<string, TelegramBotInfo>();
let lastScannedUpdateId: number | undefined = undefined;

/**
 * Delete any active Webhook on the Bot so that getUpdates polling works properly
 */
export async function deleteTelegramWebhook(token: string): Promise<{ success: boolean; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token.trim()}/deleteWebhook?drop_pending_updates=false`, {
      signal: AbortSignal.timeout(6000)
    });
    const data = await res.json();
    return { success: !!data.ok, description: data.description };
  } catch (err: any) {
    return { success: false, description: err?.message };
  }
}

export async function testTelegramBotToken(token: string): Promise<{ success: boolean; bot?: TelegramBotInfo; error?: string }> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { success: false, error: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន' };
  }

  if (botInfoCache.has(cleanToken)) {
    return { success: true, bot: botInfoCache.get(cleanToken) };
  }

  try {
    // Proactively clear any stale webhook
    deleteTelegramWebhook(cleanToken).catch(() => {});

    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`, {
      signal: AbortSignal.timeout(6000)
    });
    const data = await res.json();
    if (data.ok && data.result) {
      const botInfo: TelegramBotInfo = {
        id: data.result.id,
        username: data.result.username,
        first_name: data.result.first_name,
        can_join_groups: data.result.can_join_groups,
        can_read_all_group_messages: data.result.can_read_all_group_messages
      };
      botInfoCache.set(cleanToken, botInfo);
      return { success: true, bot: botInfo };
    }
    return { success: false, error: data.description || 'Bot Token មិនត្រឹមត្រូវ' };
  } catch (err: any) {
    return { success: false, error: err.message || 'មិនអាចភ្ជាប់ទៅកាន់ Telegram API បានទេ' };
  }
}

// 2. Helper to find best photo file_id from telegram message
export function extractBestPhotoFileId(msg: any): string | undefined {
  if (!msg) return undefined;

  // 1. Direct photo array (Telegram provides thumbnails ascending: [90px, 320px, 800px, 1280px+])
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const chosen = msg.photo[msg.photo.length - 1];
    return chosen?.file_id;
  }

  // 2. Document if sent as uncompressed image file
  if (
    msg.document &&
    (msg.document.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|bmp)$/i.test(msg.document.file_name || ''))
  ) {
    return msg.document.file_id;
  }

  return undefined;
}

// 3. Helper to find existing product image on disk (strictly scoped to targetLive)
export function findImageOnDiskForCode(code: string, liveId?: string): string | null {
  try {
    if (!code) return null;
    const clean = code.trim().toLowerCase();
    const targetLive = normalizeLiveId(liveId || activeLiveId);
    if (!targetLive) return null;

    const existingProd = products.find(
      p => normalizeLiveId(p.live_id || '') === targetLive && p.code && p.code.trim().toLowerCase() === clean && p.image_file && p.image_file.trim() !== ''
    );
    if (existingProd?.image_file && existingProd.image_file.startsWith('/uploads/')) {
      const relPath = existingProd.image_file.replace(/^\//, '');
      if (fs.existsSync(path.join(process.cwd(), 'public', relPath)) || fs.existsSync(path.join(process.cwd(), 'dist', relPath))) {
        return existingProd.image_file;
      }
    }
  } catch {}
  return null;
}

// 4. Download and save Telegram photo with Live Session isolation in filename
export async function downloadTelegramPhoto(
  token: string,
  fileId: string,
  codeHint: string,
  dateHint?: string | number,
  forceFresh: boolean = false,
  liveId?: string
): Promise<string | undefined> {
  const safeCode = codeHint ? codeHint.replace(/[^A-Za-z0-9_\u1780-\u17B3-]/g, '') : 'item';
  const targetLive = normalizeLiveId(liveId || activeLiveId || 'live');
  const safeLiveTag = targetLive.replace(/[^a-zA-Z0-9_-]/g, '').slice(-8) || 'live';
  const cleanFileKey = fileId.replace(/[^a-zA-Z0-9]/g, '').slice(-16) || 'img';
  const standardFilename = `tg_${safeLiveTag}_${safeCode}_${cleanFileKey}.jpg`;
  const cacheKey = `${safeLiveTag}_${fileId}`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  const distUploadDir = path.join(process.cwd(), 'dist', 'uploads');

  if (!forceFresh) {
    if (downloadedPhotoCache.has(cacheKey)) {
      const cached = downloadedPhotoCache.get(cacheKey);
      if (cached) {
        const p1 = path.join(process.cwd(), 'public', cached.replace(/^\//, ''));
        const p2 = path.join(process.cwd(), 'dist', cached.replace(/^\//, ''));
        if (fs.existsSync(p1) || fs.existsSync(p2)) {
          return cached;
        }
      }
    }

    const existingPath = path.join(uploadDir, standardFilename);
    const existingDistPath = path.join(distUploadDir, standardFilename);
    if (fs.existsSync(existingPath)) {
      try {
        const stat = fs.statSync(existingPath);
        if (stat.size > 1000) {
          const cachedUrl = `/uploads/${standardFilename}`;
          downloadedPhotoCache.set(cacheKey, cachedUrl);
          return cachedUrl;
        }
      } catch {}
    } else if (fs.existsSync(existingDistPath)) {
      try {
        const stat = fs.statSync(existingDistPath);
        if (stat.size > 1000) {
          const cachedUrl = `/uploads/${standardFilename}`;
          downloadedPhotoCache.set(cacheKey, cachedUrl);
          return cachedUrl;
        }
      } catch {}
    }
  }

  try {
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`, {
      signal: AbortSignal.timeout(8000)
    });
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      return undefined;
    }

    const filePath = fileInfo.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const imgRes = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(10000)
    });
    if (!imgRes.ok) return undefined;

    const arrayBuf = await imgRes.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuf);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = standardFilename;
    const localSavePath = path.join(uploadDir, filename);

    // Save Telegram's pre-compressed JPEG directly without native C++ sharp overhead
    await fs.promises.writeFile(localSavePath, rawBuffer);

    if (fs.existsSync(distUploadDir)) {
      try {
        await fs.promises.writeFile(path.join(distUploadDir, filename), rawBuffer);
      } catch {}
    }

    const resultUrl = `/uploads/${filename}`;
    downloadedPhotoCache.set(cacheKey, resultUrl);
    return resultUrl;
  } catch (err) {
    console.error(`[Telegram Photo Download Error for ${safeCode}]:`, err);
    return undefined;
  }
}

// ----------------------------------------------------------------------
// 5. Intelligent Multi-Format Parser for Telegram Live Selling Groups
// ----------------------------------------------------------------------

/**
 * Clean and normalize single code token
 */
function cleanProductCode(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/^#+/, '')
    .replace(/^(?:កូដ|code|no\.?|n°|num|លេខ)\s*/i, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Parse a raw text or caption from Telegram into structured product items.
 * Handles single lines, multi-line blocks, multi-item comma/space lists, Khmer letter prefixes, and price tags.
 */
export function parseLinesForStockItems(rawText: string, defaultQty: number = 200): Array<{ code: string; price: number; name?: string }> {
  if (!rawText || !rawText.trim()) return [];

  const items: Array<{ code: string; price: number; name?: string }> = [];
  const seenCodes = new Set<string>();

  const addItem = (codeRaw: string, priceRaw: number | string, nameRaw?: string) => {
    const code = cleanProductCode(codeRaw);
    const price = typeof priceRaw === 'string' ? parseFloat(priceRaw) : priceRaw;
    if (code && !isNaN(price) && price >= 0 && price < 100000 && code.length >= 1 && code.length <= 15) {
      if (!['USD', 'KHR', 'BOT', 'TEL', 'PAGE', 'LIVE'].includes(code) && !seenCodes.has(code)) {
        let cleanName = nameRaw?.trim();
        if (cleanName) {
          cleanName = cleanName.replace(/^(\$|usd|USD|ដុល្លារ|តម្លៃ|ថ្លៃ|ក្បាល|ឈុត|មុខ)\s*/i, '').trim();
        }
        items.push({ code, price, name: cleanName || undefined });
        seenCodes.add(code);
      }
    }
  };

  // 1. Initial sanitization: remove bot mentions, bot commands
  let cleanText = rawText
    .replace(/^\/[a-zA-Z0-9_]+(@[a-zA-Z0-9_]+)?\s*/gim, '')
    .replace(/@[a-zA-Z0-9_]+\b/gi, ' ')
    .trim();

  if (!cleanText) return [];

  // 2. Check for multi-line block (Line 0: Code, Line 1: Price)
  const rawLines = cleanText.split(/[\r\n;,|]+/);
  const normalizedLines: string[] = [];

  for (const l of rawLines) {
    let t = l.trim();
    if (!t) continue;
    // Strip leading list numbers/bullets: "1. 27=1.25" or "- 27=1.25"
    t = t.replace(/^(?:\d+[\.\)\/]|[-•👉*~✓✔︎])\s*/i, '').trim();
    t = t.replace(/^#+/, '').trim();
    if (t) normalizedLines.push(t);
  }

  if (normalizedLines.length >= 2) {
    for (let i = 0; i < normalizedLines.length; i++) {
      const line = normalizedLines[i];
      const nextLine = normalizedLines[i + 1] || '';
      const nextNextLine = normalizedLines[i + 2] || '';

      const codeMatch = line.match(/^(?:កូដ\s*|code\s*:?\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,15})$/i);
      const priceMatch = nextLine.match(/^(?:តម្លៃ\s*|price\s*:?\s*)?\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?$/i);

      if (codeMatch && priceMatch) {
        let name: string | undefined = undefined;
        if (nextNextLine && !nextNextLine.match(/^(?:កូដ|code|តម្លៃ|price|[0-9]+)/i)) {
          name = nextNextLine.trim();
          i++;
        }
        addItem(codeMatch[1], priceMatch[1], name);
        i++;
      }
    }
  }

  // 3. Process each line individually
  for (const line of normalizedLines) {
    if (!line) continue;

    // Check if line has multiple items separated by spaces (e.g. "27=1.25 28=3.5" or "A01=5$ A02=6$")
    const inlineTokens = line.match(/(?:(?:កូដ\s*)?[A-Za-z0-9_\u1780-\u17B3]{1,15}\s*(?:=|-|:|\/)\s*\$?[0-9]+(?:\.[0-9]+)?(?:\$|usd|USD|ដុល្លារ)?(?:\s*[A-Za-z\u1780-\u17B3]{2,20})?)/gi);
    if (inlineTokens && inlineTokens.length > 1) {
      for (const tok of inlineTokens) {
        const m = tok.match(/^(?:កូដ\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,15})\s*(?:=|-|:|\/)\s*\$?([0-9]+(?:\.[0-9]+)?)(?:\$|usd|USD|ដុល្លារ)?(?:\s*(.*))?$/i);
        if (m) addItem(m[1], m[2], m[3]);
      }
      continue;
    }

    // Pattern A: Explicit delimiter (=, -, :, /, ~, ->, x)
    // Supports 27=1.25, 28=3.5ដៃខ្លីជើងខ្លី, 29=4.5 រ៉ូប, A01: 5$, A01-3.5, no. 27=1.25
    const patA = /^(?:កូដ\s*|code\s*:?\s*|no\.?\s*|លេខ\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,15})\s*(?:=|-|:|\/|~|->|\sx\s|\sX\s)\s*(?:តម្លៃ\s*)?\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?\s*(.*)$/i;
    const mA = line.match(patA);
    if (mA) {
      addItem(mA[1], mA[2], mA[3]);
      continue;
    }

    // Pattern B: Khmer explicit (កូដ 28 តម្លៃ 3.5$ ដៃខ្លី)
    const patB = /^កូដ\s*([A-Za-z0-9_\u1780-\u17B3]{1,15})\s*(?:តម្លៃ|ថ្លៃ)?\s*\$?([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?\s*(.*)$/i;
    const mB = line.match(patB);
    if (mB) {
      addItem(mB[1], mB[2], mB[3]);
      continue;
    }

    // Pattern C: Space separated with dollar sign (28 3.5$ ដៃខ្លី or A01 $5)
    const patC = /^([A-Za-z0-9_\u1780-\u17B3]{1,15})\s+(?:\$\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)\s*(.*)$/i;
    const mC = line.match(patC);
    if (mC) {
      addItem(mC[1], mC[2], mC[3]);
      continue;
    }

    // Pattern D: Plain two numbers separated by space (28 3.5 or 100 2.50)
    const patD = /^([A-Za-z0-9]{1,10})\s+([0-9]+(?:\.[0-9]+)?)(?:\s+(.*))?$/;
    const mD = line.match(patD);
    if (mD) {
      addItem(mD[1], mD[2], mD[3]);
      continue;
    }

    // Pattern E: Standalone code (28 or A01)
    const patE = /^(?:កូដ\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,10})$/i;
    const mE = line.match(patE);
    if (mE) {
      const code = cleanProductCode(mE[1]);
      if (code && !['OK', 'HI', 'YES', 'NO', 'LIVE', 'PAGE'].includes(code)) {
        addItem(code, 5.0, `កូដ ${code}`);
        continue;
      }
    }
  }

  return items;
}

// In-memory cache of scanned items to prevent losing data after Telegram offset acknowledgement
export let cachedTelegramItems: TelegramItemParsed[] = [];
let cachedTelegramLiveId: string = '';

export function clearScannedTelegramCache() {
  cachedTelegramItems = [];
  lastScannedUpdateId = undefined;
  downloadedPhotoCache.clear();
}

/**
 * Reset Telegram in-memory cache and auto-sync target whenever switching or creating a new Live Session.
 * Prevents 100+ items from a previous Live session from leaking into the new Live session!
 */
export function resetTelegramStateForNewLiveSession(newLiveId: string) {
  const cleanNew = normalizeLiveId(newLiveId);
  if (!cleanNew) return;
  if (cachedTelegramLiveId !== cleanNew) {
    cachedTelegramItems = cachedTelegramItems.filter(it => normalizeLiveId(it.live_id || '') === cleanNew);
    for (let i = recentTelegramMediaBuffer.length - 1; i >= 0; i--) {
      if (recentTelegramMediaBuffer[i].live_id && normalizeLiveId(recentTelegramMediaBuffer[i].live_id || '') !== cleanNew) {
        recentTelegramMediaBuffer.splice(i, 1);
      }
    }
    cachedTelegramLiveId = cleanNew;
  }
  tgAutoSyncState.targetLiveId = cleanNew;
}

// ----------------------------------------------------------------------
// 6. Advanced Telegram Synchronization Engine
// ----------------------------------------------------------------------
export async function fetchTelegramStockUpdates(options: {
  token?: string;
  defaultQty?: number;
  markRead?: boolean;
  clearCache?: boolean;
  limit?: number;
  targetLiveId?: string;
}): Promise<{
  success: boolean;
  bot?: TelegramBotInfo;
  items: TelegramItemParsed[];
  messagesScanned: number;
  totalFound: number;
  privacyNotice?: string;
  error?: string;
}> {
  const token = (options.token || settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const resolvedLive = resolveSafeTargetLiveForTelegram(options.targetLiveId || activeLiveId, undefined, true);
  const targetLive = resolvedLive.targetLiveId;
  if (targetLive && cachedTelegramLiveId && cachedTelegramLiveId !== targetLive) {
    resetTelegramStateForNewLiveSession(targetLive);
  } else if (targetLive) {
    cachedTelegramLiveId = targetLive;
  }
  const sessionCachedItems = cachedTelegramItems.filter(it => !it.live_id || normalizeLiveId(it.live_id) === targetLive);

  if (!token) {
    return {
      success: false,
      items: [],
      messagesScanned: 0,
      totalFound: 0,
      error: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!'
    };
  }

  if (options.clearCache) {
    cachedTelegramItems = [];
    lastScannedUpdateId = undefined;
  }

  // 1. Verify Bot Token
  const botRes = await testTelegramBotToken(token);
  if (!botRes.success || !botRes.bot) {
    return {
      success: false,
      items: sessionCachedItems,
      messagesScanned: 0,
      totalFound: sessionCachedItems.length,
      error: botRes.error || 'Bot Token មិនត្រឹមត្រូវ'
    };
  }

  const defaultQty = options.defaultQty || 200;

  try {
    // 2. Fetch updates from Telegram using Loop Pagination (up to 2,000 messages)
    const maxPages = 20;
    const allUpdates: any[] = [];
    let currentOffset: number | undefined = (!options.clearCache && lastScannedUpdateId) ? lastScannedUpdateId + 1 : undefined;
    let highestUpdateId = lastScannedUpdateId || 0;

    for (let page = 0; page < maxPages; page++) {
      const url = currentOffset !== undefined
        ? `https://api.telegram.org/bot${token}/getUpdates?offset=${currentOffset}&limit=100&allowed_updates=["message","channel_post","edited_message"]`
        : `https://api.telegram.org/bot${token}/getUpdates?limit=100&allowed_updates=["message","channel_post","edited_message"]`;

      let updatesRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
      let updatesData = await updatesRes.json();

      if (!updatesData.ok && updatesData.description && (updatesData.description.includes('webhook is active') || updatesData.description.includes('deleteWebhook'))) {
        await deleteTelegramWebhook(token);
        updatesRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
        updatesData = await updatesRes.json();
      }

      if (!updatesData.ok || !Array.isArray(updatesData.result)) {
        if (page === 0 && !currentOffset) {
          let desc = updatesData.description || 'បរាជ័យក្នុងការទាញ getUpdates ពី Telegram';
          if (desc.includes('Conflict: terminated by other getUpdates request')) {
            desc = '⚠️ ជាន់គ្នាជាមួយកម្មវិធីផ្សេង (Conflict) ៖ Bot នេះកំពុងមានកម្មវិធីផ្សេងបើកទទួលសារ។ សូមបង្កើត Bot ថ្មីមួយក្នុង @BotFather សម្រាប់តែស្តុក!';
          }
          return {
            success: false,
            bot: botRes.bot,
            items: cachedTelegramItems,
            messagesScanned: 0,
            totalFound: cachedTelegramItems.length,
            error: desc
          };
        }
        break;
      }

      const batch = updatesData.result;
      if (batch.length === 0) break;

      for (const u of batch) {
        if (u.update_id && u.update_id > highestUpdateId) {
          highestUpdateId = u.update_id;
        }
        allUpdates.push(u);
      }

      currentOffset = highestUpdateId + 1;
      if (batch.length < 100) break;
    }

    if (highestUpdateId > 0) {
      lastScannedUpdateId = highestUpdateId;
    }

    // 3. Extract and normalize all messages
    interface NormalizedMessage {
      update_id: number;
      message_id: number;
      date: number;
      date_iso: string;
      chat_id?: number | string;
      chat_title: string;
      sender_name: string;
      sender_id?: number | string;
      raw_text: string;
      photo_file_id?: string;
      media_group_id?: string;
      reply_to_message_id?: number;
      reply_to_photo_file_id?: string;
    }

    const messagesList: NormalizedMessage[] = [];

    for (const u of allUpdates) {
      const msg = u.message || u.channel_post || u.edited_message;
      if (!msg) continue;

      const rawText = (msg.caption || msg.text || '').trim();
      const photoFileId = extractBestPhotoFileId(msg);
      const replyPhotoFileId = msg.reply_to_message ? extractBestPhotoFileId(msg.reply_to_message) : undefined;
      const chatTitle = msg.chat?.title || msg.chat?.username || 'Telegram Group';
      const senderName = msg.from ? `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() : 'Admin';
      const msgDateSec = msg.date || 0;
      const dateIso = msgDateSec ? new Date(msgDateSec * 1000).toISOString() : new Date().toISOString();

      const norm: NormalizedMessage = {
        update_id: u.update_id,
        message_id: msg.message_id || 0,
        date: msgDateSec,
        date_iso: dateIso,
        chat_id: msg.chat?.id,
        chat_title: chatTitle,
        sender_name: senderName,
        sender_id: msg.from?.id,
        raw_text: rawText,
        photo_file_id: photoFileId,
        media_group_id: msg.media_group_id ? String(msg.media_group_id) : undefined,
        reply_to_message_id: msg.reply_to_message?.message_id,
        reply_to_photo_file_id: replyPhotoFileId
      };

      messagesList.push(norm);

      // Also register photo into media buffer (scoped to targetLive)
      if (photoFileId) {
        addMediaToBuffer({
          file_id: photoFileId,
          live_id: targetLive,
          chat_id: msg.chat?.id,
          chat_title: chatTitle,
          sender_name: senderName,
          message_id: msg.message_id || 0,
          date_sec: msgDateSec,
          date_iso: dateIso,
          media_group_id: msg.media_group_id ? String(msg.media_group_id) : undefined,
          caption: rawText,
          created_at: Date.now()
        });
      }
    }

    // Sort chronologically (oldest to newest) so newest updates take precedence
    messagesList.sort((a, b) => {
      if (a.date !== b.date) return a.date - b.date;
      return a.message_id - b.message_id;
    });

    // Cross-Day Telegram Message Filter:
    // Telegram getUpdates retains messages for 24 hours. If messagesList contains messages from multiple
    // calendar days (e.g. yesterday AND today in Asia/Phnom_Penh), keep ONLY the messages matching
    // the target Live session's calendar day (or the latest day in the batch) so yesterday's & today's stock never mix!
    const targetSessionDateKey = getSessionOriginalDateKey(targetLive) || getPhnomPenhDateKey();
    const sameDayMessages = messagesList.filter(m => !m.date || getPhnomPenhDateKey(m.date) === targetSessionDateKey);
    if (sameDayMessages.length > 0 && sameDayMessages.length < messagesList.length) {
      messagesList.length = 0;
      messagesList.push(...sameDayMessages);
    }

    // 4. Group by media_group_id (Albums)
    const mediaGroupMap = new Map<string, NormalizedMessage[]>();
    for (const m of messagesList) {
      if (m.media_group_id) {
        if (!mediaGroupMap.has(m.media_group_id)) {
          mediaGroupMap.set(m.media_group_id, []);
        }
        mediaGroupMap.get(m.media_group_id)!.push(m);
      }
    }

    // Index all photo-only messages by message_id
    const messageIdMap = new Map<number, NormalizedMessage>();
    messagesList.forEach(m => {
      if (m.message_id) messageIdMap.set(m.message_id, m);
    });

    // 5. Advanced Association Engine
    const newlyParsedMap = new Map<string, TelegramItemParsed>();
    const photoToDownloadMap = new Map<string, { fileId: string; code: string; messageDate?: string; isFresh: boolean }>();

    for (let idx = 0; idx < messagesList.length; idx++) {
      const m = messagesList[idx];
      if (!m.raw_text) continue;

      const parsedLines = parseLinesForStockItems(m.raw_text, defaultQty);
      if (parsedLines.length === 0) continue;

      let assignedPhotoFileId: string | undefined = m.photo_file_id;

      // Tier 1: Reply-To Photo
      if (!assignedPhotoFileId && m.reply_to_photo_file_id) {
        assignedPhotoFileId = m.reply_to_photo_file_id;
      }
      if (!assignedPhotoFileId && m.reply_to_message_id && messageIdMap.has(m.reply_to_message_id)) {
        const repliedMsg = messageIdMap.get(m.reply_to_message_id);
        if (repliedMsg?.photo_file_id) {
          assignedPhotoFileId = repliedMsg.photo_file_id;
        }
      }

      // Tier 2: Album Pairing
      if (m.media_group_id && mediaGroupMap.has(m.media_group_id)) {
        const albumMessages = mediaGroupMap.get(m.media_group_id)!;
        const albumPhotos = albumMessages.map(am => am.photo_file_id).filter(Boolean) as string[];

        if (parsedLines.length > 1 && albumPhotos.length > 1) {
          for (let lIdx = 0; lIdx < parsedLines.length; lIdx++) {
            const lineItem = parsedLines[lIdx];
            const linePhoto = albumPhotos[lIdx] || albumPhotos[0];

            newlyParsedMap.set(lineItem.code, {
              code: lineItem.code,
              name: lineItem.name || `កូដ ${lineItem.code}`,
              price: lineItem.price,
              stock_qty: defaultQty,
              live_id: targetLive,
              chat_id: m.chat_id,
              chat_title: m.chat_title,
              sender_name: m.sender_name,
              message_date: m.date_iso,
              original_text: m.raw_text,
              message_id: m.message_id,
              is_fresh_image: !!linePhoto
            });

            if (linePhoto) {
              photoToDownloadMap.set(lineItem.code, { fileId: linePhoto, code: lineItem.code, messageDate: m.date_iso, isFresh: true });
            }
          }
          continue;
        } else if (!assignedPhotoFileId && albumPhotos.length > 0) {
          assignedPhotoFileId = albumPhotos[0];
        }
      }

      // Tier 3: Deep Proximity Search (Up to 20 messages before/after or within 3600 seconds)
      if (!assignedPhotoFileId) {
        for (let backStep = 1; backStep <= 20; backStep++) {
          const candidate = messagesList[idx - backStep];
          if (!candidate) break;
          const timeDiff = Math.abs(m.date - candidate.date);
          if (timeDiff > 3600) break;
          if (candidate.photo_file_id && (!candidate.raw_text || candidate.raw_text.trim() === '') && (candidate.chat_id === m.chat_id)) {
            assignedPhotoFileId = candidate.photo_file_id;
            break;
          }
        }

        if (!assignedPhotoFileId) {
          for (let fwdStep = 1; fwdStep <= 20; fwdStep++) {
            const candidate = messagesList[idx + fwdStep];
            if (!candidate) break;
            const timeDiff = Math.abs(candidate.date - m.date);
            if (timeDiff > 3600) break;
            if (candidate.photo_file_id && (!candidate.raw_text || candidate.raw_text.trim() === '') && (candidate.chat_id === m.chat_id)) {
              assignedPhotoFileId = candidate.photo_file_id;
              break;
            }
          }
        }
      }

      // Tier 4: Sliding Window Media Buffer Fallback (strictly within same Live session)
      if (!assignedPhotoFileId) {
        const bufferedMatch = recentTelegramMediaBuffer.find(
          b => (!b.live_id || normalizeLiveId(b.live_id) === targetLive) &&
               (!m.chat_id || b.chat_id === m.chat_id) &&
               Math.abs(m.date - b.date_sec) < 3600
        );
        if (bufferedMatch?.file_id) {
          assignedPhotoFileId = bufferedMatch.file_id;
        }
      }

      // Record items
      for (const item of parsedLines) {
        const existingDiskImage = findImageOnDiskForCode(item.code, targetLive);

        newlyParsedMap.set(item.code, {
          code: item.code,
          name: item.name || `កូដ ${item.code}`,
          price: item.price,
          stock_qty: defaultQty,
          live_id: targetLive,
          chat_id: m.chat_id,
          chat_title: m.chat_title,
          sender_name: m.sender_name,
          message_date: m.date_iso,
          original_text: m.raw_text,
          message_id: m.message_id,
          image_url: assignedPhotoFileId ? undefined : existingDiskImage || undefined,
          is_fresh_image: !!assignedPhotoFileId
        });

        if (assignedPhotoFileId) {
          photoToDownloadMap.set(item.code, { fileId: assignedPhotoFileId, code: item.code, messageDate: m.date_iso, isFresh: true });
        }
      }
    }

    // 6. Download fresh photos (scoped to targetLive)
    const downloadEntries = Array.from(photoToDownloadMap.entries());
    const concurrency = 2;
    for (let i = 0; i < downloadEntries.length; i += concurrency) {
      const chunk = downloadEntries.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async ([code, { fileId, messageDate, isFresh }]) => {
          try {
            const url = await downloadTelegramPhoto(token, fileId, code, messageDate, isFresh || !!options.clearCache, targetLive);
            const item = newlyParsedMap.get(code);
            if (item && url) {
              item.image_url = url;
            }
          } catch (err) {
            console.error(`[Telegram Photo Download Failed for ${code}]:`, err);
          }
        })
      );
      if (i + concurrency < downloadEntries.length) {
        await new Promise(r => setTimeout(r, 20));
      }
    }

    // 7. Merge ONLY with cached items belonging to this exact targetLive
    const combinedMap = new Map<string, TelegramItemParsed>();
    for (const it of cachedTelegramItems) {
      if (!it.live_id || normalizeLiveId(it.live_id) === targetLive) {
        combinedMap.set(it.code, { ...it, live_id: targetLive });
      }
    }
    for (const [code, it] of newlyParsedMap.entries()) {
      const existing = combinedMap.get(code);
      if (existing) {
        combinedMap.set(code, {
          ...existing,
          ...it,
          live_id: targetLive,
          image_url: it.image_url || existing.image_url
        });
      } else {
        combinedMap.set(code, { ...it, live_id: targetLive });
      }
    }

    cachedTelegramItems = Array.from(combinedMap.values());

    const items = cachedTelegramItems;
    const isPrivacyRestricted = botRes.bot?.can_read_all_group_messages === false;
    const privacyNotice = (isPrivacyRestricted && items.length === 0)
      ? `Bot Privacy Mode កំពុងបើក (can_read_all_group_messages=false)។ ដើម្បីឱ្យ Bot មើលឃើញសារក្នុង Group សូមចូល @BotFather រួចវាយ /setprivacy -> ជ្រើស Bot @${botRes.bot?.username || 'bot'} -> ចុច 'Disable' រួចផ្ញើរូបភាព/កូដថ្មីក្នុង Group!`
      : undefined;

    return {
      success: true,
      bot: botRes.bot,
      items,
      messagesScanned: allUpdates.length,
      totalFound: items.length,
      privacyNotice
    };
  } catch (err: any) {
    return {
      success: false,
      bot: botRes.bot,
      items: cachedTelegramItems,
      messagesScanned: 0,
      totalFound: cachedTelegramItems.length,
      error: err.message || 'Error communicating with Telegram Bot API'
    };
  }
}

// ----------------------------------------------------------------------
// 7. Bulk Import stock items into Database & Real-Time Live Sync
// ----------------------------------------------------------------------
export function bulkImportStockItems(
  items: Array<{
    code: string;
    name?: string;
    price: number;
    stock_qty?: number;
    cost_price?: number;
    image_file?: string;
  }>,
  mode: 'merge' | 'replace' = 'merge',
  options?: {
    keepExistingStockQty?: boolean;
    targetLiveId?: string;
  }
): { success: boolean; imported: number; updated: number; total: number } {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, imported: 0, updated: 0, total: products.length };
  }

  const targetLive = normalizeLiveId(options?.targetLiveId || activeLiveId);

  if (mode === 'replace') {
    for (let i = products.length - 1; i >= 0; i--) {
      if (normalizeLiveId(products[i].live_id || '') === targetLive) {
        products.splice(i, 1);
      }
    }
  }

  let importedCount = 0;
  let updatedCount = 0;
  const keepStock = options?.keepExistingStockQty ?? true;

  for (const it of items) {
    const cleanCode = String(it.code).trim().toUpperCase();
    if (!cleanCode) continue;

    const existing = products.find(p => normalizeLiveId(p.live_id || '') === targetLive && p.code.toUpperCase() === cleanCode);
    if (existing) {
      existing.live_id = targetLive;
      const incomingPrice = (it.price !== undefined && it.price !== null) ? Number(it.price) : existing.price;
      const incomingImg = (it.image_file && it.image_file.trim() !== '') ? it.image_file.trim() : existing.image_file;

      // Save previous photo & price backup before overwriting so any accidental overwrite can be restored
      if (incomingImg && existing.image_file && incomingImg !== existing.image_file) {
        existing.previous_image_file = existing.image_file;
      }
      if (incomingPrice > 0 && existing.price > 0 && Math.abs(incomingPrice - existing.price) > 0.001) {
        existing.previous_price = existing.price;
      }
      if (it.name && existing.name && it.name.trim() !== existing.name) {
        existing.previous_name = existing.name;
      }

      if (it.price !== undefined && it.price !== null) {
        existing.price = incomingPrice;
      }
      if (!keepStock && it.stock_qty !== undefined && it.stock_qty !== null) {
        existing.stock_qty = Number(it.stock_qty);
      }
      if (it.name && it.name !== `កូដ ${cleanCode}`) existing.name = it.name.trim();
      if (it.cost_price !== undefined) existing.cost_price = Number(it.cost_price);

      // Always update image_file if provided from fresh scan
      if (it.image_file && it.image_file.trim() !== '') {
        existing.image_file = it.image_file.trim();
      }
      existing.updated_at = new Date().toISOString();
      updatedCount++;
    } else {
      const resolvedImage = (it.image_file && it.image_file.trim() !== '')
        ? it.image_file.trim()
        : findImageOnDiskForCode(cleanCode, targetLive) || '';

      const nextId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      const nowIso = new Date().toISOString();
      const newProd: Product = {
        id: nextId,
        live_id: targetLive,
        code: cleanCode,
        name: it.name?.trim() || `កូដ ${cleanCode}`,
        price: Number(it.price || 0),
        stock_qty: Number(it.stock_qty !== undefined ? it.stock_qty : 200),
        cost_price: Number(it.cost_price || 0),
        image_file: resolvedImage || '',
        created_at: nowIso,
        updated_at: nowIso
      };
      products.push(newProd);
      importedCount++;
    }
  }

  // Auto-sync all imported/updated stock prices, names, and photos to ALL active baskets
  syncAllActiveInvoicesWithStock(targetLive);

  bumpDataRevision();
  saveDatabaseToDisk();

  // Broadcast real-time update event
  broadcastSSE('stock_updated', { live_id: targetLive, count: products.length });

  return {
    success: true,
    imported: importedCount,
    updated: updatedCount,
    total: products.length
  };
}

// -------------------------------------------------------------
// 8. Auto Real-Time Telegram Stock Sync Manager
// -------------------------------------------------------------
export interface TelegramAutoSyncStatus {
  enabled: boolean;
  intervalSec: number;
  lastSyncAt: string | null;
  lastScannedCount: number;
  lastImportedCount: number;
  totalProductsCount: number;
  lastError: string | null;
  running: boolean;
  targetLiveId?: string | null;
}

const tgAutoSyncState: TelegramAutoSyncStatus = {
  enabled: false,
  intervalSec: 10,
  lastSyncAt: null,
  lastScannedCount: 0,
  lastImportedCount: 0,
  totalProductsCount: products.length,
  lastError: null,
  running: false,
  targetLiveId: null
};

let tgAutoSyncTimer: NodeJS.Timeout | null = null;

export async function executeTelegramAutoSyncOnce(force = false): Promise<{
  success: boolean;
  imported: number;
  scanned: number;
  error?: string;
}> {
  if (!force && !tgAutoSyncState.enabled) {
    return { success: true, imported: 0, scanned: 0 };
  }

  if (tgAutoSyncState.running) {
    return { success: true, imported: 0, scanned: 0 };
  }

  const activeToken = (settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!activeToken) {
    tgAutoSyncState.lastError = 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន';
    return { success: false, imported: 0, scanned: 0, error: tgAutoSyncState.lastError };
  }

  tgAutoSyncState.running = true;

  try {
    const resolved = resolveSafeTargetLiveForTelegram(tgAutoSyncState.targetLiveId || activeLiveId, undefined, true);
    const currentTargetLive = resolved.targetLiveId;
    if (resolved.autoCreatedNewSession) {
      tgAutoSyncState.targetLiveId = currentTargetLive;
    }

    const res = await fetchTelegramStockUpdates({
      token: activeToken,
      defaultQty: 200,
      markRead: false,
      clearCache: false,
      targetLiveId: currentTargetLive
    });

    if (!res.success) {
      tgAutoSyncState.lastError = res.error || 'បរាជ័យក្នុងការទាញទិន្នន័យពី Telegram';
      tgAutoSyncState.running = false;
      return { success: false, imported: 0, scanned: 0, error: tgAutoSyncState.lastError };
    }

    const sessionItems = res.items.filter(it => !it.live_id || normalizeLiveId(it.live_id) === currentTargetLive);
    tgAutoSyncState.lastScannedCount = sessionItems.length;
    tgAutoSyncState.lastSyncAt = new Date().toISOString();
    tgAutoSyncState.lastError = null;

    if (sessionItems.length > 0) {
      const itemsToImport = sessionItems.map(it => ({
        code: it.code,
        name: it.name,
        price: it.price,
        stock_qty: it.stock_qty,
        cost_price: it.cost_price,
        image_file: it.image_url
      }));

      const importRes = bulkImportStockItems(itemsToImport, 'merge', {
        keepExistingStockQty: true,
        targetLiveId: currentTargetLive
      });

      tgAutoSyncState.lastImportedCount = importRes.imported + importRes.updated;
      tgAutoSyncState.totalProductsCount = products.filter(p => normalizeLiveId(p.live_id || '') === currentTargetLive).length;

      tgAutoSyncState.running = false;
      return {
        success: true,
        imported: tgAutoSyncState.lastImportedCount,
        scanned: res.items.length
      };
    }

    tgAutoSyncState.running = false;
    return { success: true, imported: 0, scanned: 0 };
  } catch (err: any) {
    tgAutoSyncState.lastError = err.message || 'Auto-sync failed unexpectedly';
    tgAutoSyncState.running = false;
    return { success: false, imported: 0, scanned: 0, error: tgAutoSyncState.lastError };
  }
}

export interface DiskPhotoEntry {
  filename: string;
  url: string;
  code: string;
  liveTag: string;
  mtimeMs: number;
  dateKey: string;
}

/**
 * Scans public/uploads (and dist/uploads) for all saved product photos matching a given liveId (or code).
 */
export function scanUploadedPhotosForLive(liveId?: string): Map<string, DiskPhotoEntry[]> {
  const result = new Map<string, DiskPhotoEntry[]>();
  const targetLive = normalizeLiveId(liveId || activeLiveId);
  const safeLiveTag = targetLive.replace(/[^a-zA-Z0-9_-]/g, '').slice(-8) || 'live';
  const dirs = [
    path.join(process.cwd(), 'public', 'uploads'),
    path.join(process.cwd(), 'dist', 'uploads')
  ];

  const seenFiles = new Set<string>();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (seenFiles.has(file)) continue;
        // Match tg_<liveTag>_<code>_<fileKey>.jpg or code_<liveTag>_<code>_<ts>.jpg
        const tgMatch = file.match(/^tg_([a-zA-Z0-9_-]+)_([A-Za-z0-9_\u1780-\u17B3-]+)_([a-zA-Z0-9]+)\.(?:jpg|jpeg|png|webp)$/i);
        const codeMatch = !tgMatch
          ? file.match(/^code_([a-zA-Z0-9_-]+)_([A-Za-z0-9_\u1780-\u17B3-]+)_(\d+)\.(?:jpg|jpeg|png|webp)$/i)
          : null;
        const m = tgMatch || codeMatch;
        if (!m) continue;

        const fileLiveTag = m[1];
        const rawCode = m[2].toUpperCase();
        if (liveId && fileLiveTag !== safeLiveTag) continue;

        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.size < 500) continue;

        seenFiles.add(file);
        const entry: DiskPhotoEntry = {
          filename: file,
          url: `/uploads/${file}`,
          code: rawCode,
          liveTag: fileLiveTag,
          mtimeMs: stat.mtimeMs,
          dateKey: getPhnomPenhDateKey(stat.mtime)
        };

        if (!result.has(rawCode)) {
          result.set(rawCode, []);
        }
        result.get(rawCode)!.push(entry);
      }
    } catch {}
  }

  for (const [, list] of result.entries()) {
    list.sort((a, b) => a.mtimeMs - b.mtimeMs);
  }
  return result;
}

/**
 * Returns all historical photos on disk for a specific product code in a Live session
 */
export function getProductPhotoHistoryOnDisk(code: string, liveId?: string): DiskPhotoEntry[] {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return [];
  const map = scanUploadedPhotosForLive(liveId);
  return map.get(cleanCode) || [];
}

/**
 * FORENSIC RECOVERY & SPLIT ENGINE:
 * When today's Telegram photos/prices accidentally overwrote yesterday's Live Session (e.g. #18102916):
 * 1. Finds all products in `oldLiveId` that have photos uploaded TODAY (or `previous_image_file` / multiple disk photos across days).
 * 2. Copies today's new items (with today's photo & price) into today's new Live Session (`LIVE_YYYYMMDD`).
 * 3. Restores yesterday's original photo (`olderFiles` from disk or `previous_image_file`) and `previous_price` back onto `oldLiveId` products & customer baskets!
 * 4. Removes any purely-today items from `oldLiveId` that had no yesterday photo and were never ordered in any `oldLiveId` basket.
 */
export function recoverOverwrittenLiveSessionStock(options?: {
  oldLiveId?: string;
  newTodayLiveId?: string;
  switchToNewLive?: boolean;
}): {
  success: boolean;
  oldLiveId: string;
  newTodayLiveId: string;
  restoredPhotosCount: number;
  restoredPricesCount: number;
  movedToTodayCount: number;
  removedPureTodayFromOldCount: number;
  updatedBasketsCount: number;
  message: string;
} {
  const todayDateKey = getPhnomPenhDateKey();
  const todayCompact = todayDateKey.replace(/-/g, '');
  const oldLiveId = normalizeLiveId(options?.oldLiveId || activeLiveId);
  const newTodayLiveId = normalizeLiveId(options?.newTodayLiveId || `LIVE_${todayCompact}`);

  if (!oldLiveId || oldLiveId === newTodayLiveId) {
    return {
      success: false,
      oldLiveId,
      newTodayLiveId,
      restoredPhotosCount: 0,
      restoredPricesCount: 0,
      movedToTodayCount: 0,
      removedPureTodayFromOldCount: 0,
      updatedBasketsCount: 0,
      message: 'វគ្គ Live នេះគឺជាវគ្គថ្ងៃនេះរួចហើយ មិនចាំបាច់បំបែកទេ។'
    };
  }

  const sessionOriginalDate = getSessionOriginalDateKey(oldLiveId) || '';
  const diskPhotosByCode = scanUploadedPhotosForLive(oldLiveId);

  // Collect all product codes that were actually ordered in oldLiveId customer baskets
  const oldSessionInvoices = invoices.filter(
    inv => normalizeLiveId(inv.live_id || '') === oldLiveId && inv.status !== 'Cancelled'
  );
  const codesOrderedInOldBaskets = new Set<string>();
  const basketItemPriceFallback = new Map<string, number>();

  for (const inv of oldSessionInvoices) {
    for (const it of inv.items || []) {
      const c = (it.product_code || '').trim().toUpperCase();
      if (c) {
        codesOrderedInOldBaskets.add(c);
        // If a dispatched or paid basket has an older price, keep as reference
        if ((inv.status === 'Dispatched' || inv.status === 'Paid') && it.price > 0) {
          basketItemPriceFallback.set(c, it.price);
        }
      }
    }
  }

  let restoredPhotosCount = 0;
  let restoredPricesCount = 0;
  let movedToTodayCount = 0;
  let removedPureTodayFromOldCount = 0;

  const oldSessionProducts = products.filter(p => normalizeLiveId(p.live_id || '') === oldLiveId);
  const productsToRemoveFromOld = new Set<number>();

  for (const prod of oldSessionProducts) {
    const cleanCode = (prod.code || '').trim().toUpperCase();
    if (!cleanCode) continue;

    const codePhotos = diskPhotosByCode.get(cleanCode) || [];
    // Photos from before today (yesterday or earlier)
    const olderPhotos = codePhotos.filter(ph =>
      sessionOriginalDate && sessionOriginalDate < todayDateKey
        ? ph.dateKey <= sessionOriginalDate
        : ph.dateKey < todayDateKey
    );
    // Photos downloaded today
    const todayPhotos = codePhotos.filter(ph => ph.dateKey >= todayDateKey);

    // Check if current prod.image_file is a file modified today
    let currentImgIsFromToday = todayPhotos.length > 0;
    let currentImgUrl = (prod.image_file || '').split('?')[0].trim();
    if (!currentImgIsFromToday && currentImgUrl.startsWith('/uploads/')) {
      try {
        const fullP = path.join(process.cwd(), 'public', currentImgUrl.replace(/^\//, ''));
        if (fs.existsSync(fullP)) {
          const st = fs.statSync(fullP);
          if (getPhnomPenhDateKey(st.mtime) >= todayDateKey) {
            currentImgIsFromToday = true;
          }
        }
      } catch {}
    }

    const wasUpdatedToday =
      currentImgIsFromToday ||
      Boolean(prod.previous_image_file) ||
      Boolean(prod.previous_price !== undefined) ||
      (prod.updated_at ? getPhnomPenhDateKey(prod.updated_at) >= todayDateKey : false);

    if (!wasUpdatedToday) continue;

    // 1. Copy/Update Today's Version into newTodayLiveId (`LIVE_YYYYMMDD`)
    const todayPhotoUrl =
      todayPhotos.length > 0
        ? todayPhotos[todayPhotos.length - 1].url
        : currentImgUrl;

    const existingInToday = products.find(
      p => normalizeLiveId(p.live_id || '') === newTodayLiveId && (p.code || '').trim().toUpperCase() === cleanCode
    );
    const nowIso = new Date().toISOString();

    if (existingInToday) {
      existingInToday.price = prod.price;
      existingInToday.name = prod.name;
      if (todayPhotoUrl) existingInToday.image_file = todayPhotoUrl;
      existingInToday.updated_at = nowIso;
    } else {
      const nextId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      products.push({
        id: nextId,
        live_id: newTodayLiveId,
        code: cleanCode,
        name: prod.name || `កូដ ${cleanCode}`,
        price: prod.price,
        stock_qty: 200,
        cost_price: prod.cost_price || 0,
        image_file: todayPhotoUrl || '',
        created_at: nowIso,
        updated_at: nowIso
      });
    }
    movedToTodayCount++;

    // 2. Restore Yesterday's Original Photo & Price on `oldLiveId`
    let restoredOldPhoto: string | null = null;
    if (olderPhotos.length > 0) {
      restoredOldPhoto = olderPhotos[olderPhotos.length - 1].url;
    } else if (prod.previous_image_file && prod.previous_image_file !== todayPhotoUrl) {
      restoredOldPhoto = prod.previous_image_file;
    } else if (codePhotos.length >= 2) {
      // If multiple photos exist for this code in oldLiveId, pick the one before the latest overwrite
      restoredOldPhoto = codePhotos[codePhotos.length - 2].url;
    }

    if (restoredOldPhoto) {
      if (prod.image_file !== restoredOldPhoto) {
        prod.image_file = restoredOldPhoto;
        restoredPhotosCount++;
      }
      if (prod.previous_price !== undefined && prod.previous_price > 0 && prod.price !== prod.previous_price) {
        prod.price = prod.previous_price;
        restoredPricesCount++;
      } else if (basketItemPriceFallback.has(cleanCode)) {
        const fbPrice = basketItemPriceFallback.get(cleanCode)!;
        if (fbPrice > 0 && prod.price !== fbPrice) {
          prod.price = fbPrice;
          restoredPricesCount++;
        }
      }
      if (prod.previous_name) {
        prod.name = prod.previous_name;
      }
      delete prod.previous_image_file;
      delete prod.previous_price;
      delete prod.previous_name;
    } else if (!codesOrderedInOldBaskets.has(cleanCode)) {
      // This code had NO yesterday photo AND was never ordered by any customer in yesterday's Live session!
      // It is 100% a brand-new item uploaded today, so remove it from yesterday's session after moving to today's session.
      productsToRemoveFromOld.add(prod.id);
      removedPureTodayFromOldCount++;
    }
  }

  if (productsToRemoveFromOld.size > 0) {
    for (let i = products.length - 1; i >= 0; i--) {
      if (productsToRemoveFromOld.has(products[i].id)) {
        products.splice(i, 1);
      }
    }
  }

  // 3. Re-sync yesterday's customer baskets in `oldLiveId` so their photos & prices match yesterday's restored stock!
  let updatedBasketsCount = 0;
  for (const inv of oldSessionInvoices) {
    let changed = false;
    for (const item of inv.items || []) {
      const cleanCode = (item.product_code || '').trim().toUpperCase();
      if (!cleanCode) continue;

      const prod = products.find(
        p => normalizeLiveId(p.live_id || '') === oldLiveId && (p.code || '').trim().toUpperCase() === cleanCode
      );
      if (prod) {
        if (prod.image_file && item.image_file !== prod.image_file) {
          item.image_file = prod.image_file;
          changed = true;
        }
        if (prod.price > 0 && Math.abs((item.price || 0) - prod.price) > 0.001 && restoredPricesCount > 0) {
          item.price = prod.price;
          changed = true;
        }
      } else {
        // Also check disk olderPhotos directly
        const codePhotos = diskPhotosByCode.get(cleanCode) || [];
        const olderPhotos = codePhotos.filter(ph => ph.dateKey < todayDateKey);
        if (olderPhotos.length > 0) {
          const bestOldUrl = olderPhotos[olderPhotos.length - 1].url;
          if (item.image_file !== bestOldUrl) {
            item.image_file = bestOldUrl;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      recalculateInvoice(inv);
      updatedBasketsCount++;
    }
  }

  // Also move cachedTelegramItems from today into newTodayLiveId
  for (const cItem of cachedTelegramItems) {
    if (normalizeLiveId(cItem.live_id || '') === oldLiveId) {
      cItem.live_id = newTodayLiveId;
    }
  }

  if (options?.switchToNewLive) {
    setActiveLiveId(newTodayLiveId);
  }

  bumpDataRevision();
  saveDatabaseToDisk();
  broadcastSSE('stock_updated', { live_id: oldLiveId, count: products.length });
  broadcastSSE('stock_updated', { live_id: newTodayLiveId, count: products.length });

  const message =
    restoredPhotosCount > 0 || movedToTodayCount > 0
      ? `✅ បានស្តាររូបភាពដើមរបស់ Live #${oldLiveId.slice(-8)} ចំនួន ${restoredPhotosCount} មុខ (កន្ត្រកភ្ញៀវ ${updatedBasketsCount}) និងបំបែកស្តុកថ្ងៃនេះចំនួន ${movedToTodayCount} មុខ ទៅកាន់ Live ថ្មី (${newTodayLiveId}) ជោគជ័យ!`
      : `ℹ️ មិនរកឃើញរូបភាពជាន់គ្នាឆ្លងថ្ងៃក្នុង Live #${oldLiveId.slice(-8)} ទេ។`;

  return {
    success: true,
    oldLiveId,
    newTodayLiveId,
    restoredPhotosCount,
    restoredPricesCount,
    movedToTodayCount,
    removedPureTodayFromOldCount,
    updatedBasketsCount,
    message
  };
}

/**
 * Automatically inspects all previous-day Live sessions on startup and heals any cross-day Telegram photo overwrites.
 */
export function autoHealCrossDayTelegramOverwrites(): void {
  try {
    const todayDateKey = getPhnomPenhDateKey();
    const allLiveIds = Array.from(
      new Set([
        ...invoices.map(i => normalizeLiveId(i.live_id || '')),
        ...products.map(p => normalizeLiveId(p.live_id || ''))
      ])
    ).filter(Boolean);

    for (const liveId of allLiveIds) {
      if (!isLiveSessionFromPreviousDay(liveId, todayDateKey)) continue;

      const diskMap = scanUploadedPhotosForLive(liveId);
      let hasCrossDayOverwrite = false;
      for (const [, photos] of diskMap.entries()) {
        const hasOld = photos.some(p => p.dateKey < todayDateKey);
        const hasToday = photos.some(p => p.dateKey >= todayDateKey);
        if (hasOld && hasToday) {
          hasCrossDayOverwrite = true;
          break;
        }
      }

      if (hasCrossDayOverwrite) {
        const res = recoverOverwrittenLiveSessionStock({
          oldLiveId: liveId,
          switchToNewLive: false
        });
        console.log(`🛡️ [Auto-Heal Cross-Day Telegram Stock] ${res.message}`);
      }
    }
  } catch (err) {
    console.warn('[Auto-Heal Cross-Day Telegram Stock] Warning:', err);
  }
}

export function startTelegramAutoSync(intervalSec = 10, targetLiveId?: string): TelegramAutoSyncStatus {
  tgAutoSyncState.enabled = true;
  tgAutoSyncState.intervalSec = Math.max(5, intervalSec);
  if (targetLiveId) tgAutoSyncState.targetLiveId = targetLiveId;

  if (tgAutoSyncTimer) clearInterval(tgAutoSyncTimer);

  executeTelegramAutoSyncOnce(true).catch(() => {});

  tgAutoSyncTimer = setInterval(() => {
    executeTelegramAutoSyncOnce(false).catch(() => {});
  }, tgAutoSyncState.intervalSec * 1000);

  return { ...tgAutoSyncState };
}

export function stopTelegramAutoSync(): TelegramAutoSyncStatus {
  tgAutoSyncState.enabled = false;
  if (tgAutoSyncTimer) {
    clearInterval(tgAutoSyncTimer);
    tgAutoSyncTimer = null;
  }
  return { ...tgAutoSyncState };
}

export function getTelegramAutoSyncStatus(): TelegramAutoSyncStatus {
  tgAutoSyncState.totalProductsCount = products.length;
  return { ...tgAutoSyncState };
}
