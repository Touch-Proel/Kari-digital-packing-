import fs from 'fs';
import path from 'path';
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

// 2. Download and save Telegram photo to public/uploads
async function downloadTelegramPhoto(token: string, fileId: string, codeHint: string): Promise<string | undefined> {
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
    const buffer = Buffer.from(arrayBuf);

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const safeCode = codeHint ? codeHint.replace(/[^A-Za-z0-9_-]/g, '') : 'tg';
    const ext = path.extname(filePath) || '.jpg';
    const filename = `tg_${Date.now()}_${safeCode}_${Math.random().toString(36).slice(2, 6)}${ext}`;
    const localSavePath = path.join(uploadDir, filename);

    fs.writeFileSync(localSavePath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('[Telegram Photo Download Error]:', err);
    return undefined;
  }
}

// 3. Helper to parse text/caption into code, price, and optional name
export function parseLinesForStockItems(rawText: string, defaultQty: number = 200): Array<{ code: string; price: number; name?: string }> {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/[\r\n;,]+/);
  const items: Array<{ code: string; price: number; name?: string }> = [];

  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Remove bot commands (e.g. /stock, /add@Pitoubot_bot) and bot mentions (e.g. @Pitoubot_bot)
    trimmed = trimmed
      .replace(/^\/[a-zA-Z0-9_]+(@[a-zA-Z0-9_]+)?\s*/i, '')
      .replace(/@[a-zA-Z0-9_]+\b/gi, ' ')
      .trim();

    if (!trimmed) continue;

    // Pattern 1: [កូដ] <code> [= / : / - / x] [តម្លៃ] <price> [$ / usd] [name]
    // Examples: 100=3.7, 95=4, 99=1.5, A12: 4.5$, 100=3.7 អាវយឺត, កូដ 100 តម្លៃ 3.7$
    const pat1 = /(?:កូដ\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,15})\s*(?:=|-|:|\sx\s|\sX\s)\s*(?:តម្លៃ\s*)?\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?(?:\s+(.+))?/i;
    const m1 = trimmed.match(pat1);
    if (m1) {
      const code = m1[1].trim().toUpperCase();
      const price = parseFloat(m1[2]);
      const name = m1[3]?.trim();
      if (code && !isNaN(price) && price > 0) {
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
      if (code && !isNaN(price) && price > 0) {
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
      if (code && !isNaN(price) && price > 0) {
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
      // Heuristic: price is usually < 1000 for clothing/general items in USD
      if (code && !isNaN(price) && price > 0 && price < 2000) {
        items.push({ code, price, name });
        continue;
      }
    }
  }

  return items;
}

// 4. Fetch and Parse stock updates from Telegram via Bot Token Only
export async function fetchTelegramStockUpdates(options: {
  token?: string;
  defaultQty?: number;
  markRead?: boolean;
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

  // 1. Verify Bot Token
  const botRes = await testTelegramBotToken(token);
  if (!botRes.success || !botRes.bot) {
    return {
      success: false,
      items: [],
      messagesScanned: 0,
      totalFound: 0,
      error: botRes.error || 'Bot Token មិនត្រឹមត្រូវ'
    };
  }

  const defaultQty = options.defaultQty || 200;
  const limit = options.limit || 100;

  try {
    // 2. Fetch updates from Telegram
    const updatesRes = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=${limit}&allowed_updates=["message","channel_post","edited_message"]`
    );
    const updatesData = await updatesRes.json();

    if (!updatesData.ok || !Array.isArray(updatesData.result)) {
      let desc = updatesData.description || 'បរាជ័យក្នុងការទាញ getUpdates ពី Telegram';
      if (desc.includes('Conflict: terminated by other getUpdates request')) {
        desc = '⚠️ ជាន់គ្នាជាមួយកម្មវិធីផ្សេង (Conflict) ៖ Bot នេះកំពុងមានកម្មវិធីផ្សេង (ដូចជាប្រព័ន្ធ Attendance ឬ Server ផ្សេង) បើកដំណើរការទទួលសារស្របពេលគ្នា។ Telegram អនុញ្ញាតឱ្យតែ ១ កម្មវិធីគត់ទទួលសារពី Bot ក្នុងពេលតែមួយ។ សូមបង្កើត Bot ថ្មីមួយផ្សេងទៀតក្នុង @BotFather សម្រាប់តែស្តុក!';
      }
      return {
        success: false,
        bot: botRes.bot,
        items: [],
        messagesScanned: 0,
        totalFound: 0,
        error: desc
      };
    }

    const updates = updatesData.result;
    const parsedItemsMap = new Map<string, TelegramItemParsed>();
    let highestUpdateId = 0;

    for (const u of updates) {
      if (u.update_id && u.update_id > highestUpdateId) {
        highestUpdateId = u.update_id;
      }

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

      // If photo exists, download the highest resolution photo or image document
      let downloadedImageUrl: string | undefined = undefined;
      if (hasPhoto) {
        let fileIdToDownload: string | undefined = undefined;
        if (isPhoto) {
          const largestPhoto = msg.photo[msg.photo.length - 1];
          fileIdToDownload = largestPhoto?.file_id;
        } else if (msg.document?.file_id) {
          fileIdToDownload = msg.document.file_id;
        }

        if (fileIdToDownload) {
          const firstCode = parsedLines[0]?.code || 'item';
          downloadedImageUrl = await downloadTelegramPhoto(token, fileIdToDownload, firstCode);
        }
      }

      // Add each parsed item
      for (let i = 0; i < parsedLines.length; i++) {
        const item = parsedLines[i];
        const finalImg = (i === 0 || !parsedItemsMap.has(item.code)) ? downloadedImageUrl : undefined;

        parsedItemsMap.set(item.code, {
          code: item.code,
          name: item.name || `កូដ ${item.code}`,
          price: item.price,
          stock_qty: defaultQty,
          image_url: finalImg,
          chat_id: msg.chat?.id,
          chat_title: chatTitle,
          sender_name: senderName,
          message_date: messageDate,
          original_text: rawText,
          message_id: msg.message_id
        });
      }
    }

    // Optional: Mark updates as read so they won't repeat
    if (options.markRead && highestUpdateId > 0) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${highestUpdateId + 1}&limit=1`);
      } catch (err) {}
    }

    const items = Array.from(parsedItemsMap.values());
    const isPrivacyRestricted = botRes.bot?.can_read_all_group_messages === false;
    const privacyNotice = (isPrivacyRestricted && items.length === 0)
      ? `Bot Privacy Mode កំពុងបើក (can_read_all_group_messages=false)។ ដើម្បីឱ្យ Bot អាចមើលឃើញសារក្នុង Group សូមចូល @BotFather រួចវាយ /setprivacy -> ជ្រើស Bot @${botRes.bot?.username || 'bot'} -> ចុច 'Disable' រួចផ្ញើរូបភាព/កូដថ្មីក្នុង Group (ឬ Mention @${botRes.bot?.username || 'bot'} ក្នុង Caption)!`
      : undefined;

    return {
      success: true,
      bot: botRes.bot,
      items,
      messagesScanned: updates.length,
      totalFound: items.length,
      privacyNotice
    };
  } catch (err: any) {
    return {
      success: false,
      bot: botRes.bot,
      items: [],
      messagesScanned: 0,
      totalFound: 0,
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
  }
): { success: boolean; imported: number; updated: number; total: number } {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, imported: 0, updated: 0, total: products.length };
  }

  if (mode === 'replace') {
    products.length = 0;
  }

  let importedCount = 0;
  let updatedCount = 0;
  const keepStock = options?.keepExistingStockQty ?? true;

  for (const it of items) {
    const cleanCode = String(it.code).trim().toUpperCase();
    if (!cleanCode) continue;

    const existing = products.find(p => p.code.toUpperCase() === cleanCode);
    if (existing) {
      if (it.price !== undefined && it.price !== null) {
        const newPrice = Number(it.price);
        existing.price = newPrice;

        // Auto-update price for this code in all pending unpicked baskets of active live
        for (const inv of invoices) {
          if (
            inv.live_id === activeLiveId &&
            inv.status === 'Pending' &&
            inv.packing_stage === 'UNPICKED'
          ) {
            let invChanged = false;
            for (const orderItem of inv.items) {
              if (orderItem.product_code.toUpperCase() === cleanCode) {
                orderItem.price = newPrice;
                if (it.name && it.name !== `កូដ ${cleanCode}`) {
                  orderItem.product_name = it.name.trim();
                }
                invChanged = true;
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
      if (it.image_file) existing.image_file = it.image_file;
      updatedCount++;
    } else {
      const nextId = products.length > 0 ? Math.max(...products.map(p => p.id || 0)) + 1 : 1;
      const newProd: Product = {
        id: nextId,
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
