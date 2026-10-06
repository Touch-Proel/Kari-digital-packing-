import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { products, invoices, activeLiveId, recalculateInvoice, settings, saveDatabaseToDisk, bumpDataRevision, syncAllActiveInvoicesWithStock } from './db';
import { Product } from './types';
import { broadcastSSE } from './packingRoutes';

// Optimize Sharp for low memory footprint on VPS / Cloud Run
try {
  sharp.cache(false);
  sharp.concurrency(1);
} catch {}

export interface TelegramItemParsed {
  code: string;
  name: string;
  price: number;
  stock_qty: number;
  cost_price?: number;
  image_url?: string;
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

// 3. Helper to find existing product image on disk
export function findImageOnDiskForCode(code: string, liveId?: string): string | null {
  try {
    if (!code) return null;
    const clean = code.trim().toLowerCase();
    const targetLive = liveId || activeLiveId;
    
    const existingProd = products.find(p => p.live_id === targetLive && p.code && p.code.trim().toLowerCase() === clean && p.image_file && p.image_file.trim() !== '');
    if (existingProd?.image_file && existingProd.image_file.startsWith('/uploads/')) {
      const relPath = existingProd.image_file.replace(/^\//, '');
      if (fs.existsSync(path.join(process.cwd(), 'public', relPath)) || fs.existsSync(path.join(process.cwd(), 'dist', relPath))) {
        return existingProd.image_file;
      }
    }
  } catch {}
  return null;
}

// 4. Download and save Telegram photo with HD 500x500 Sharp Progressive Optimization
export async function downloadTelegramPhoto(
  token: string,
  fileId: string,
  codeHint: string,
  dateHint?: string | number,
  forceFresh: boolean = false
): Promise<string | undefined> {
  const safeCode = codeHint ? codeHint.replace(/[^A-Za-z0-9_\u1780-\u17B3-]/g, '') : 'item';
  const cleanFileKey = fileId.replace(/[^a-zA-Z0-9]/g, '').slice(-16) || 'img';
  const standardFilename = `tg_${safeCode}_${cleanFileKey}.jpg`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  const distUploadDir = path.join(process.cwd(), 'dist', 'uploads');

  if (!forceFresh) {
    if (downloadedPhotoCache.has(fileId)) {
      const cached = downloadedPhotoCache.get(fileId);
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
          downloadedPhotoCache.set(fileId, cachedUrl);
          return cachedUrl;
        }
      } catch {}
    } else if (fs.existsSync(existingDistPath)) {
      try {
        const stat = fs.statSync(existingDistPath);
        if (stat.size > 1000) {
          const cachedUrl = `/uploads/${standardFilename}`;
          downloadedPhotoCache.set(fileId, cachedUrl);
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

    // ⚡ Fast Sharp Progressive JPEG processing (500x500 HD Cover Crop)
    const processedBuffer = await sharp(rawBuffer)
      .rotate()
      .resize(500, 500, {
        fit: 'cover',
        position: 'center',
        fastShrinkOnLoad: true
      })
      .jpeg({ quality: 82, progressive: false })
      .toBuffer();

    fs.writeFileSync(localSavePath, processedBuffer);

    if (fs.existsSync(distUploadDir)) {
      try {
        fs.writeFileSync(path.join(distUploadDir, filename), processedBuffer);
      } catch {}
    }

    const resultUrl = `/uploads/${filename}`;
    downloadedPhotoCache.set(fileId, resultUrl);
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
    .replace(/^(?:កូដ|code|no\.?|លេខ)\s*/i, '')
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

  // 1. Initial sanitization: remove bot mentions, bot commands, hashtags
  let cleanText = rawText
    .replace(/^\/[a-zA-Z0-9_]+(@[a-zA-Z0-9_]+)?\s*/gim, '')
    .replace(/@[a-zA-Z0-9_]+\b/gi, ' ')
    .trim();

  if (!cleanText) return [];

  // =========================================================================
  // PASS 1: Inline Multi-Item Matching (e.g. "A01=3.5, A02=4, A03=5.5" or "100=3.5 101=4" or "A01 3.5$ A02 4$")
  // =========================================================================
  // Regex to find repeated code-price pairs: (CODE) (= / - / : / space) ($?PRICE)
  const inlinePairRegex = /(?:^|[\s,;|/•👉*]+)(?:កូដ\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,15})\s*(?:=|-|:|\sx\s|\sX\s|\s+)\s*(?:តម្លៃ\s*)?\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ|៛)?(?:\s+([A-Za-z\u1780-\u17B3\s]{2,20}))?(?=[\s,;|/•👉*]+(?:កូដ\s*)?[A-Za-z0-9_\u1780-\u17B3]{1,15}\s*(?:=|-|:|\s)|\s*$)/gi;

  let inlineMatch: RegExpExecArray | null;
  const inlineFound: Array<{ code: string; price: number; name?: string }> = [];

  while ((inlineMatch = inlinePairRegex.exec(cleanText)) !== null) {
    const rawCode = inlineMatch[1];
    const rawPrice = inlineMatch[2];
    const rawName = inlineMatch[3]?.trim();

    const code = cleanProductCode(rawCode);
    const price = parseFloat(rawPrice);

    if (code && !isNaN(price) && price >= 0 && price < 10000 && code.length >= 1 && code.length <= 15) {
      // Avoid false positive where code is pure small english word like "AND", "OR", "USD"
      if (!['USD', 'KHR', 'BOT', 'TEL', 'PAGE', 'LIVE'].includes(code)) {
        inlineFound.push({ code, price, name: rawName || undefined });
        seenCodes.add(code);
      }
    }
  }

  if (inlineFound.length > 1) {
    return inlineFound;
  }

  // =========================================================================
  // PASS 2: Line-by-Line & Multi-Line Block Parsing
  // =========================================================================
  const rawLines = cleanText.split(/[\r\n;,|]+/);
  const normalizedLines: string[] = [];

  for (const l of rawLines) {
    let t = l.trim();
    if (!t) continue;
    // Strip leading list numbers/bullets: "1. A01=3.5" or "- A01=3.5" or "• A01=3.5"
    t = t.replace(/^(?:\d+[\.\)\/]|[-•👉*~✓✔︎])\s*/i, '').trim();
    // Strip hashtags
    t = t.replace(/^#+/, '').trim();
    if (t) normalizedLines.push(t);
  }

  // Check for Multi-Line Key-Value Blocks (e.g. Line 0: "A01" or "កូដ A01", Line 1: "3.5$" or "តម្លៃ 3.5$", Line 2: "រ៉ូប")
  if (normalizedLines.length >= 2 && items.length === 0) {
    for (let i = 0; i < normalizedLines.length; i++) {
      const line = normalizedLines[i];
      const nextLine = normalizedLines[i + 1] || '';
      const nextNextLine = normalizedLines[i + 2] || '';

      // Check if current line is pure Code
      const codeMatch = line.match(/^(?:កូដ\s*|code\s*:?\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,15})$/i);
      // Check if next line is pure Price
      const priceMatch = nextLine.match(/^(?:តម្លៃ\s*|price\s*:?\s*)?\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?$/i);

      if (codeMatch && priceMatch) {
        const code = cleanProductCode(codeMatch[1]);
        const price = parseFloat(priceMatch[1]);
        let name: string | undefined = undefined;

        if (nextNextLine && !nextNextLine.match(/^(?:កូដ|code|តម្លៃ|price|[0-9]+)/i)) {
          name = nextNextLine.trim();
          i++; // Skip name line too
        }

        if (code && !isNaN(price) && price >= 0 && !seenCodes.has(code)) {
          items.push({ code, price, name });
          seenCodes.add(code);
          i++; // Skip price line
          continue;
        }
      }
    }
  }

  // Standard Individual Line Pattern Matching
  for (const line of normalizedLines) {
    if (!line) continue;

    // Pattern A: Explicit Delimiter (A01=3.5, 100:4.5$, A01-3.5, A01/3.5, 100 x 3.5, 100->3.5)
    const patA = /^(?:កូដ\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,15})\s*(?:=|-|:|\/|~|->|\sx\s|\sX\s)\s*(?:តម្លៃ\s*)?\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?\s*(.*)$/i;
    const mA = line.match(patA);
    if (mA) {
      const code = cleanProductCode(mA[1]);
      const price = parseFloat(mA[2]);
      let name = mA[3]?.trim();
      if (name) name = name.replace(/^(\$|usd|USD|ដុល្លារ|តម្លៃ|ថ្លៃ|ក្បាល|ឈុត|មុខ)\s*/i, '').trim();
      if (code && !isNaN(price) && price >= 0 && !seenCodes.has(code)) {
        items.push({ code, price, name: name || undefined });
        seenCodes.add(code);
        continue;
      }
    }

    // Pattern B: Khmer explicit: កូដ <Code> [តម្លៃ] <Price>$ [name]
    const patB = /^កូដ\s*([A-Za-z0-9_\u1780-\u17B3]{1,15})\s*(?:តម្លៃ|ថ្លៃ)?\s*\$?([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?\s*(.*)$/i;
    const mB = line.match(patB);
    if (mB) {
      const code = cleanProductCode(mB[1]);
      const price = parseFloat(mB[2]);
      let name = mB[3]?.trim();
      if (name) name = name.replace(/^(\$|usd|USD|ដុល្លារ|តម្លៃ|ថ្លៃ)\s*/i, '').trim();
      if (code && !isNaN(price) && price >= 0 && !seenCodes.has(code)) {
        items.push({ code, price, name: name || undefined });
        seenCodes.add(code);
        continue;
      }
    }

    // Pattern C: Space with dollar sign: "100 3.7$" or "100 $3.7" or "A01 4$"
    const patC = /^([A-Za-z0-9_\u1780-\u17B3]{1,15})\s+(?:\$\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?(?:\s+(.+))?$/i;
    const mC = line.match(patC);
    if (mC) {
      const code = cleanProductCode(mC[1]);
      const price = parseFloat(mC[2]);
      const name = mC[3]?.trim();
      if (code && !isNaN(price) && price >= 0 && !seenCodes.has(code)) {
        items.push({ code, price, name });
        seenCodes.add(code);
        continue;
      }
    }

    // Pattern D: Plain two numbers separated by space (e.g. "100 3.5")
    const patD = /^([A-Za-z0-9]{1,10})\s+([0-9]+(?:\.[0-9]+)?)(?:\s+(.+))?$/;
    const mD = line.match(patD);
    if (mD) {
      const code = cleanProductCode(mD[1]);
      const price = parseFloat(mD[2]);
      const name = mD[3]?.trim();
      if (code && !isNaN(price) && price >= 0 && price < 2000 && !seenCodes.has(code)) {
        items.push({ code, price, name });
        seenCodes.add(code);
        continue;
      }
    }

    // Pattern E: Standalone Code without explicit price (e.g. "100", "A05", "កូដ 100")
    // Only if nothing else matched and line length is short
    const patE = /^(?:កូដ\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,10})$/i;
    const mE = line.match(patE);
    if (mE) {
      const code = cleanProductCode(mE[1]);
      if (code && !['OK', 'HI', 'YES', 'NO', 'LIVE', 'PAGE'].includes(code) && !seenCodes.has(code)) {
        items.push({ code, price: 5.0, name: `កូដ ${code}` });
        seenCodes.add(code);
        continue;
      }
    }
  }

  return items;
}

// In-memory cache of scanned items to prevent losing data after Telegram offset acknowledgement
export let cachedTelegramItems: TelegramItemParsed[] = [];

export function clearScannedTelegramCache() {
  cachedTelegramItems = [];
  lastScannedUpdateId = undefined;
  downloadedPhotoCache.clear();
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
      items: cachedTelegramItems,
      messagesScanned: 0,
      totalFound: cachedTelegramItems.length,
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

      // Also register photo into media buffer
      if (photoFileId) {
        addMediaToBuffer({
          file_id: photoFileId,
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

      // Tier 4: Sliding Window Media Buffer Fallback
      if (!assignedPhotoFileId) {
        const bufferedMatch = recentTelegramMediaBuffer.find(
          b => (!m.chat_id || b.chat_id === m.chat_id) && Math.abs(m.date - b.date_sec) < 3600
        );
        if (bufferedMatch?.file_id) {
          assignedPhotoFileId = bufferedMatch.file_id;
        }
      }

      // Record items
      for (const item of parsedLines) {
        const existingDiskImage = findImageOnDiskForCode(item.code);

        newlyParsedMap.set(item.code, {
          code: item.code,
          name: item.name || `កូដ ${item.code}`,
          price: item.price,
          stock_qty: defaultQty,
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

    // 6. Download fresh photos
    const downloadEntries = Array.from(photoToDownloadMap.entries());
    const concurrency = 2;
    for (let i = 0; i < downloadEntries.length; i += concurrency) {
      const chunk = downloadEntries.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async ([code, { fileId, messageDate, isFresh }]) => {
          try {
            const url = await downloadTelegramPhoto(token, fileId, code, messageDate, isFresh || !!options.clearCache);
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

    // 7. Merge with cached items
    const combinedMap = new Map<string, TelegramItemParsed>();
    for (const it of cachedTelegramItems) {
      combinedMap.set(it.code, it);
    }
    for (const [code, it] of newlyParsedMap.entries()) {
      const existing = combinedMap.get(code);
      if (existing) {
        combinedMap.set(code, {
          ...existing,
          ...it,
          image_url: it.image_url || existing.image_url
        });
      } else {
        combinedMap.set(code, it);
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

  const targetLive = options?.targetLiveId || activeLiveId;

  if (mode === 'replace') {
    for (let i = products.length - 1; i >= 0; i--) {
      if ((products[i].live_id || activeLiveId) === targetLive) {
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

    const existing = products.find(p => (p.live_id || activeLiveId) === targetLive && p.code.toUpperCase() === cleanCode);
    if (existing) {
      existing.live_id = targetLive;
      if (it.price !== undefined && it.price !== null) {
        existing.price = Number(it.price);
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
      updatedCount++;
    } else {
      const resolvedImage = (it.image_file && it.image_file.trim() !== '')
        ? it.image_file.trim()
        : findImageOnDiskForCode(cleanCode, targetLive) || '';

      const nextId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      const newProd: Product = {
        id: nextId,
        live_id: targetLive,
        code: cleanCode,
        name: it.name?.trim() || `កូដ ${cleanCode}`,
        price: Number(it.price || 0),
        stock_qty: Number(it.stock_qty !== undefined ? it.stock_qty : 200),
        cost_price: Number(it.cost_price || 0),
        image_file: resolvedImage || ''
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
    const res = await fetchTelegramStockUpdates({
      token: activeToken,
      defaultQty: 200,
      markRead: false,
      clearCache: false
    });

    if (!res.success) {
      tgAutoSyncState.lastError = res.error || 'បរាជ័យក្នុងការទាញទិន្នន័យពី Telegram';
      tgAutoSyncState.running = false;
      return { success: false, imported: 0, scanned: 0, error: tgAutoSyncState.lastError };
    }

    tgAutoSyncState.lastScannedCount = res.items.length;
    tgAutoSyncState.lastSyncAt = new Date().toISOString();
    tgAutoSyncState.lastError = null;

    if (res.items.length > 0) {
      const itemsToImport = res.items.map(it => ({
        code: it.code,
        name: it.name,
        price: it.price,
        stock_qty: it.stock_qty,
        cost_price: it.cost_price,
        image_file: it.image_url
      }));

      const importRes = bulkImportStockItems(itemsToImport, 'merge', {
        keepExistingStockQty: true,
        targetLiveId: tgAutoSyncState.targetLiveId || activeLiveId
      });

      tgAutoSyncState.lastImportedCount = importRes.imported + importRes.updated;
      tgAutoSyncState.totalProductsCount = products.length;

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
