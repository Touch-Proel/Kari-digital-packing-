import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { products, invoices, activeLiveId, recalculateInvoice, settings, saveDatabaseToDisk, bumpDataRevision } from './db';
import { Product } from './types';

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
}

export interface TelegramBotInfo {
  id: number;
  username: string;
  first_name: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
}

// 1. Verify Telegram Bot Token
const downloadedPhotoCache = new Map<string, string>();

export async function testTelegramBotToken(token: string): Promise<{ success: boolean; bot?: TelegramBotInfo; error?: string }> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { success: false, error: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const data = await res.json();
    if (data.ok && data.result) {
      return {
        success: true,
        bot: {
          id: data.result.id,
          username: data.result.username,
          first_name: data.result.first_name,
          can_join_groups: data.result.can_join_groups,
          can_read_all_group_messages: data.result.can_read_all_group_messages
        }
      };
    }
    return { success: false, error: data.description || 'Bot Token មិនត្រឹមត្រូវ' };
  } catch (err: any) {
    return { success: false, error: err.message || 'មិនអាចភ្ជាប់ទៅកាន់ Telegram API បានទេ' };
  }
}

// 2. Download and save Telegram photo to public/uploads (Cropped 500x500 HD Center Crop)
async function downloadTelegramPhoto(
  token: string,
  fileId: string,
  codeHint: string,
  dateHint?: string | number
): Promise<string | undefined> {
  const safeCode = codeHint ? codeHint.replace(/[^A-Za-z0-9_-]/g, '') : 'item';

  // Format Date YYYYMMDD (e.g. 20260914)
  let d = new Date();
  if (dateHint) {
    if (typeof dateHint === 'number') {
      d = new Date(dateHint > 10000000000 ? dateHint : dateHint * 1000);
    } else {
      const parsed = new Date(dateHint);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const standardFilename = `${safeCode}_${dateStr}.jpg`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  const distUploadDir = path.join(process.cwd(), 'dist', 'uploads');

  // 1. In-memory cache check
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

  // 2. Fast disk check: if photo for this code & date is already downloaded and valid, reuse immediately (0ms)
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

  try {
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      return undefined;
    }

    const filePath = fileInfo.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const imgRes = await fetch(downloadUrl);
    if (!imgRes.ok) return undefined;

    const arrayBuf = await imgRes.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuf);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    let filename = standardFilename;
    let localSavePath = path.join(uploadDir, filename);

    // ⚡ Fast Progressive JPEG processing with Sharp (Lightweight 35KB, 15x faster than mozjpeg)
    const processedBuffer = await sharp(rawBuffer)
      .rotate() // auto-orient based on EXIF orientation
      .resize(500, 500, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 84, progressive: true })
      .toBuffer();

    fs.writeFileSync(localSavePath, processedBuffer);

    // Also sync to dist/uploads if production build folder exists
    if (fs.existsSync(distUploadDir)) {
      try {
        fs.writeFileSync(path.join(distUploadDir, filename), processedBuffer);
      } catch {}
    }

    const resultUrl = `/uploads/${filename}`;
    downloadedPhotoCache.set(fileId, resultUrl);
    return resultUrl;
  } catch (err) {
    console.error('[Telegram Photo Download Error]:', err);
    return undefined;
  }
}

// 3. Helper to parse text/caption into code, price, and optional name
export function parseLinesForStockItems(rawText: string, defaultQty: number = 200): Array<{ code: string; price: number; name?: string }> {
  if (!rawText || !rawText.trim()) return [];

  // Support splitting by newlines, semicolons, commas, pipes, and slashes
  const lines = rawText.split(/[\r\n;,|/]+/);
  const items: Array<{ code: string; price: number; name?: string }> = [];

  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;

    // Remove bot commands (e.g. /stock, /add@Pitoubot_bot) and bot mentions (e.g. @Pitoubot_bot)
    trimmed = trimmed
      .replace(/^\/[a-zA-Z0-9_]+(@[a-zA-Z0-9_]+)?\s*/i, '')
      .replace(/@[a-zA-Z0-9_]+\b/gi, ' ')
      .trim();

    // Strip leading hashtags (e.g. #100=3.7 or #A1: 4$) - DO NOT skip lines with hashtags!
    trimmed = trimmed.replace(/^#+/, '').trim();

    if (!trimmed) continue;

    // Pattern 1: [កូដ] <code> [= / : / - / x] [តម្លៃ] <price> [$ / usd] [name]
    // Examples: 100=3.7, 95=4, 99=1.5, 105: 4.5$, 100=3.7 អាវយឺត, កូដ 100 តម្លៃ 3.7$
    const pat1 = /(?:កូដ\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,15})\s*(?:=|-|:|\sx\s|\sX\s)\s*(?:តម្លៃ\s*)?\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?(?:\s+(.+))?/i;
    const m1 = trimmed.match(pat1);
    if (m1) {
      const code = m1[1].trim().toUpperCase();
      const price = parseFloat(m1[2]);
      const name = m1[3]?.trim();
      if (code && !isNaN(price) && price >= 0) {
        items.push({ code, price, name });
        continue;
      }
    }

    // Pattern 2: Khmer explicit: កូដ <Code> [តម្លៃ] <Price>$
    // Examples: កូដ 105 5$, កូដ A01 តម្លៃ 4.5
    const pat2 = /កូដ\s*([A-Za-z0-9_\u1780-\u17B3]{1,15})\s*(?:តម្លៃ|ថ្លៃ)?\s*\$?([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?(?:\s+(.+))?/i;
    const m2 = trimmed.match(pat2);
    if (m2) {
      const code = m2[1].trim().toUpperCase();
      const price = parseFloat(m2[2]);
      const name = m2[3]?.trim();
      if (code && !isNaN(price) && price >= 0) {
        items.push({ code, price, name });
        continue;
      }
    }

    // Pattern 3: Space with dollar sign: 100 3.7$ or 100 $3.7
    const pat3 = /^([A-Za-z0-9_\u1780-\u17B3]{1,15})\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)(?:\s+(.+))?$/i;
    const m3 = trimmed.match(pat3);
    if (m3) {
      const code = m3[1].trim().toUpperCase();
      const price = parseFloat(m3[2]);
      const name = m3[3]?.trim();
      if (code && !isNaN(price) && price >= 0) {
        items.push({ code, price, name });
        continue;
      }
    }

    // Pattern 4: Plain two numbers separated by space if short code (e.g. "100 3.5")
    const pat4 = /^([A-Za-z0-9]{1,10})\s+([0-9]+(?:\.[0-9]+)?)(?:\s+(.+))?$/;
    const m4 = trimmed.match(pat4);
    if (m4) {
      const code = m4[1].trim().toUpperCase();
      const price = parseFloat(m4[2]);
      const name = m4[3]?.trim();
      // Heuristic: price is usually < 2000 for clothing/general items in USD
      if (code && !isNaN(price) && price >= 0 && price < 2000) {
        items.push({ code, price, name });
        continue;
      }
    }

    // Pattern 5: Standalone Code without explicit price (e.g. "100", "A05", "កូដ 100")
    // When a photo is sent with just the code as caption
    const pat5 = /^(?:កូដ\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,10})$/i;
    const m5 = trimmed.match(pat5);
    if (m5) {
      const code = m5[1].trim().toUpperCase();
      // Look up if product exists to keep its price, else default to 0 or 5
      const existing = products.find(p => p.code.toUpperCase() === code);
      const price = existing?.price || 5.0;
      items.push({ code, price, name: existing?.name || `កូដ ${code}` });
      continue;
    }
  }

  return items;
}

// In-memory cache of scanned items to prevent losing data after Telegram offset acknowledgement
export let cachedTelegramItems: TelegramItemParsed[] = [];

export function clearScannedTelegramCache() {
  cachedTelegramItems = [];
}

// 4. Fetch and Parse stock updates from Telegram via Bot Token Only
// Upgraded with Multi-Page Loop Pagination (bypasses Telegram's 100 updates hard limit)
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
    // 2. Fetch updates from Telegram using Loop Pagination
    // Telegram Bot API getUpdates has a HARD CEILING of 100 updates per request!
    // To scan hundreds or thousands of products (not just 99/100), we loop with offset.
    const maxPages = 30; // Scans up to 3,000 Telegram updates
    const allUpdates: any[] = [];
    let currentOffset: number | undefined = undefined;
    let highestUpdateId = 0;

    for (let page = 0; page < maxPages; page++) {
      const url = currentOffset !== undefined
        ? `https://api.telegram.org/bot${token}/getUpdates?offset=${currentOffset}&limit=100&allowed_updates=["message","channel_post","edited_message"]`
        : `https://api.telegram.org/bot${token}/getUpdates?limit=100&allowed_updates=["message","channel_post","edited_message"]`;

      const updatesRes = await fetch(url);
      const updatesData = await updatesRes.json();

      if (!updatesData.ok || !Array.isArray(updatesData.result)) {
        if (page === 0) {
          let desc = updatesData.description || 'បរាជ័យក្នុងការទាញ getUpdates ពី Telegram';
          if (desc.includes('Conflict: terminated by other getUpdates request')) {
            desc = '⚠️ ជាន់គ្នាជាមួយកម្មវិធីផ្សេង (Conflict) ៖ Bot នេះកំពុងមានកម្មវិធីផ្សេង (ដូចជាប្រព័ន្ធ Attendance ឬ Server ផ្សេង) បើកដំណើរការទទួលសារស្របពេលគ្នា។ Telegram អនុញ្ញាតឱ្យតែ ១ កម្មវិធីគត់ទទួលសារពី Bot ក្នុងពេលតែមួយ។ សូមបង្កើត Bot ថ្មីមួយផ្សេងទៀតក្នុង @BotFather សម្រាប់តែស្តុក!';
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
      if (batch.length === 0) {
        break;
      }

      for (const u of batch) {
        if (u.update_id && u.update_id > highestUpdateId) {
          highestUpdateId = u.update_id;
        }
        allUpdates.push(u);
      }

      currentOffset = highestUpdateId + 1;

      // If Telegram returned fewer than 100 in this batch, all pending updates have been retrieved
      if (batch.length < 100) {
        break;
      }
    }

    // 3. Parse all retrieved messages
    const newlyParsedMap = new Map<string, TelegramItemParsed>();
    const photoToDownloadMap = new Map<string, { fileId: string; code: string; messageDate?: string }>();

    for (const u of allUpdates) {
      const msg = u.message || u.channel_post || u.edited_message;
      if (!msg) continue;

      const rawText = msg.caption || msg.text || '';
      const isPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
      const isImageDoc = Boolean(
        msg.document &&
        (msg.document.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(msg.document.file_name || ''))
      );
      const hasPhoto = isPhoto || isImageDoc;
      const chatTitle = msg.chat?.title || msg.chat?.username || 'Telegram Group';
      const senderName = msg.from ? `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() : 'Admin';
      const messageDate = msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString();

      const parsedLines = parseLinesForStockItems(rawText, defaultQty);
      if (parsedLines.length === 0) continue;

      // Record photo candidate for each code
      let photoFileId: string | undefined = undefined;
      if (hasPhoto) {
        if (isPhoto) {
          // ⚡ Choose optimal photo resolution (600px - 1000px):
          // In Telegram, photo array has sizes: [small (90px), medium (320px), large (800px), extra-large (1280px), full-raw (4000px)]
          // Downloading the 4K raw photo (5-15MB) across VPS causes slow downloads and memory stalls.
          // Choosing ~800px gives 100% crisp 500x500 crop quality, while downloading in milliseconds (~50KB)!
          let chosenPhoto = msg.photo[msg.photo.length - 1]; // fallback
          for (let pIdx = msg.photo.length - 1; pIdx >= 0; pIdx--) {
            const p = msg.photo[pIdx];
            if ((p.width >= 500 || p.height >= 500) && (p.width <= 1280 || p.height <= 1280)) {
              chosenPhoto = p;
              break;
            }
          }
          photoFileId = chosenPhoto?.file_id;
        } else if (msg.document?.file_id) {
          photoFileId = msg.document.file_id;
        }
      }

      for (let i = 0; i < parsedLines.length; i++) {
        const item = parsedLines[i];
        newlyParsedMap.set(item.code, {
          code: item.code,
          name: item.name || `កូដ ${item.code}`,
          price: item.price,
          stock_qty: defaultQty,
          chat_id: msg.chat?.id,
          chat_title: chatTitle,
          sender_name: senderName,
          message_date: messageDate,
          original_text: rawText,
          message_id: msg.message_id
        });

        if (photoFileId) {
          photoToDownloadMap.set(item.code, { fileId: photoFileId, code: item.code, messageDate });
        }
      }
    }

    // 4. Download photos in parallel batches of 6 (prevents timeout when downloading 100+ images)
    const downloadEntries = Array.from(photoToDownloadMap.entries());
    const concurrency = 6;
    for (let i = 0; i < downloadEntries.length; i += concurrency) {
      const chunk = downloadEntries.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async ([code, { fileId, messageDate }]) => {
          try {
            const url = await downloadTelegramPhoto(token, fileId, code, messageDate);
            const item = newlyParsedMap.get(code);
            if (item && url) {
              item.image_url = url;
            }
          } catch (err) {
            console.error(`[Telegram Photo Download Failed for ${code}]:`, err);
          }
        })
      );
    }

    // 5. Merge with cached items (keeps previously scanned items even if Telegram queue clears)
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
      ? `Bot Privacy Mode កំពុងបើក (can_read_all_group_messages=false)។ ដើម្បីឱ្យ Bot អាចមើលឃើញសារក្នុង Group សូមចូល @BotFather រួចវាយ /setprivacy -> ជ្រើស Bot @${botRes.bot?.username || 'bot'} -> ចុច 'Disable' រួចផ្ញើរូបភាព/កូដថ្មីក្នុង Group (ឬ Mention @${botRes.bot?.username || 'bot'} ក្នុង Caption)!`
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

// 5. Bulk Import stock items into Database
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
        const newPrice = Number(it.price);
        existing.price = newPrice;

        // Fill price into unpicked pending baskets of active live ONLY IF price is missing/zero or name was generic
        for (const inv of invoices) {
          if (
            inv.live_id === targetLive &&
            inv.status === 'Pending' &&
            inv.packing_stage === 'UNPICKED'
          ) {
            let invChanged = false;
            for (const orderItem of inv.items) {
              if (orderItem.product_code.toUpperCase() === cleanCode) {
                const isGenericName = !orderItem.product_name ||
                  orderItem.product_name.startsWith('កូដ ') ||
                  orderItem.product_name.startsWith('ទំនិញកូដ ');
                const isZeroPrice = !orderItem.price || orderItem.price === 0;

                // Only update price & name if the item was created as a generic/placeholder item
                if (isZeroPrice || isGenericName) {
                  if (isZeroPrice && newPrice > 0) {
                    orderItem.price = newPrice;
                  }
                  if (isGenericName && it.name && it.name !== `កូដ ${cleanCode}`) {
                    orderItem.product_name = it.name.trim();
                  }
                  invChanged = true;
                }
              }
            }
            if (invChanged) {
              recalculateInvoice(inv);
            }
          }
        }
      }
      if (!keepStock && it.stock_qty !== undefined && it.stock_qty !== null) {
        existing.stock_qty = Number(it.stock_qty);
      }
      if (it.name && it.name !== `កូដ ${cleanCode}`) existing.name = it.name.trim();
      if (it.cost_price !== undefined) existing.cost_price = Number(it.cost_price);
      if (it.image_file) {
        existing.image_file = it.image_file;
        // Cascade image ONLY IF order item currently has no image
        for (const inv of invoices) {
          if (
            inv.live_id === targetLive &&
            inv.status === 'Pending' &&
            inv.packing_stage === 'UNPICKED'
          ) {
            for (const orderItem of inv.items) {
              if (orderItem.product_code.toUpperCase() === cleanCode) {
                if (!orderItem.image_file) {
                  orderItem.image_file = it.image_file;
                }
              }
            }
          }
        }
      }
      updatedCount++;
    } else {
      const nextId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      const newProd: Product = {
        id: nextId,
        live_id: targetLive,
        code: cleanCode,
        name: it.name?.trim() || `កូដ ${cleanCode}`,
        price: Number(it.price || 5.0),
        stock_qty: Number(it.stock_qty !== undefined ? it.stock_qty : 200),
        cost_price: Number(it.cost_price || 2.5),
        image_file: it.image_file || ''
      };
      products.push(newProd);
      importedCount++;
    }
  }

  bumpDataRevision();
  saveDatabaseToDisk();

  return {
    success: true,
    imported: importedCount,
    updated: updatedCount,
    total: products.length
  };
}

// -------------------------------------------------------------
// 🔄 Auto Real-Time Telegram Stock Sync Manager
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
      tgAutoSyncState.lastError = res.error || 'Auto-sync error';
      tgAutoSyncState.lastSyncAt = new Date().toISOString();
      return { success: false, imported: 0, scanned: 0, error: res.error };
    }

    let importedCount = 0;
    if (res.items.length > 0) {
      const targetLive = tgAutoSyncState.targetLiveId || activeLiveId;
      const impRes = bulkImportStockItems(
        res.items.map(it => ({
          code: it.code,
          name: it.name,
          price: it.price,
          stock_qty: it.stock_qty,
          image_file: it.image_url
        })),
        'merge',
        {
          keepExistingStockQty: true,
          targetLiveId: targetLive
        }
      );
      importedCount = impRes.imported + impRes.updated;
    }

    tgAutoSyncState.lastSyncAt = new Date().toISOString();
    tgAutoSyncState.lastScannedCount = res.messagesScanned;
    tgAutoSyncState.lastImportedCount = importedCount;
    tgAutoSyncState.totalProductsCount = products.length;
    tgAutoSyncState.lastError = null;

    if (importedCount > 0) {
      console.log(`🔄 [Telegram Stock Auto-Sync]: Successfully synced ${importedCount} items into Live #${tgAutoSyncState.targetLiveId || activeLiveId}!`);
    }

    return {
      success: true,
      imported: importedCount,
      scanned: res.messagesScanned
    };
  } catch (err: any) {
    tgAutoSyncState.lastError = err.message || 'Auto sync network error';
    tgAutoSyncState.lastSyncAt = new Date().toISOString();
    return { success: false, imported: 0, scanned: 0, error: err.message };
  } finally {
    tgAutoSyncState.running = false;
  }
}

export function startTelegramAutoSync(intervalSec = 10, targetLiveId?: string) {
  if (intervalSec < 5) intervalSec = 5;
  tgAutoSyncState.intervalSec = intervalSec;
  tgAutoSyncState.enabled = true;
  if (targetLiveId) {
    tgAutoSyncState.targetLiveId = targetLiveId;
  }

  if (tgAutoSyncTimer) {
    clearInterval(tgAutoSyncTimer);
    tgAutoSyncTimer = null;
  }

  // Trigger immediate background sync
  executeTelegramAutoSyncOnce();

  tgAutoSyncTimer = setInterval(() => {
    if (tgAutoSyncState.enabled) {
      executeTelegramAutoSyncOnce();
    }
  }, tgAutoSyncState.intervalSec * 1000);

  console.log(`🔄 [Telegram Stock Auto-Sync STARTED]: Polling Telegram every ${tgAutoSyncState.intervalSec}s (Target Live: ${tgAutoSyncState.targetLiveId || 'Active Live'})`);
  return getTelegramAutoSyncStatus();
}

export function stopTelegramAutoSync() {
  tgAutoSyncState.enabled = false;
  if (tgAutoSyncTimer) {
    clearInterval(tgAutoSyncTimer);
    tgAutoSyncTimer = null;
  }
  console.log(`⏹️ [Telegram Stock Auto-Sync STOPPED]`);
  return getTelegramAutoSyncStatus();
}

export function getTelegramAutoSyncStatus(): TelegramAutoSyncStatus {
  return {
    ...tgAutoSyncState,
    totalProductsCount: products.length
  };
}

