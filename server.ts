// Set timezone to Cambodia (Asia/Phnom_Penh - UTC+7) for the entire server
process.env.TZ = 'Asia/Phnom_Penh';

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import packingRoutes from './server/packingRoutes';
import fastCheckRoutes from './server/fastCheckRoutes';
import chatbotRoutes from './server/chatbotRoutes';
import { initChatbotStore } from './server/chatbotEngine';
import {
  getFacebookOAuthUrl,
  handleOAuthCallback,
  getAvailablePages,
  selectPageById,
  refreshFacebookAccounts,
  fetchPageVideosAndPosts,
  fetchFacebookComments,
  fetchAllManagedFacebookPages
} from './server/fbAuth';
import {
  activeFacebookPage,
  setActiveFacebookPage,
  activeLiveId,
  setActiveLiveId,
  bumpDataRevision,
  invoices,
  addOrUpdateConnectedPage,
  batchAddConnectedPages,
  removeConnectedPage,
  clearAllConnectedPages,
  getConnectedFacebookPages,
  getFacebookUserAccessToken,
  setFacebookUserAccessToken
} from './server/db';
import { parseAndAllocateComment } from './server/parser';
import { startLiveCommentsAutoSync } from './server/liveSync';
import { initTelegramBotService } from './server/telegramBotService';

dotenv.config();

const app = express();
const PORT = 3000;

// Enable trust proxy for Nginx / Cloudflare reverse proxies (crucial for https://chatbotkh.com)
app.set('trust proxy', true);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

import sharp from 'sharp';

// ⚡ In-Memory High Speed Buffer Cache for instant 0ms responses
interface MemoryImageCacheItem {
  buffer: Buffer;
  contentType: string;
  etag: string;
  timestamp: number;
}
const memoryImageCache = new Map<string, MemoryImageCacheItem>();
const MAX_MEMORY_CACHE_ITEMS = 400;

function setMemoryCache(key: string, buffer: Buffer, contentType: string, etag: string) {
  if (memoryImageCache.size >= MAX_MEMORY_CACHE_ITEMS) {
    // Evict oldest 50 items
    const keys = Array.from(memoryImageCache.keys()).slice(0, 50);
    for (const k of keys) memoryImageCache.delete(k);
  }
  memoryImageCache.set(key, { buffer, contentType, etag, timestamp: Date.now() });
}

// In-flight deduplication to avoid redundant parallel network fetches
const inFlightFetches = new Map<string, Promise<{ buffer: Buffer; contentType: string } | null>>();

// ⚡ Ultra-Fast Cached Image Proxy (Fixes slow loading, CDN throttling & mobile lag)
app.get('/api/image_proxy', async (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  const targetUrl = String(req.query.url || '').trim();
  const widthParam = parseInt(String(req.query.w || '0'), 10);
  const targetWidth = !isNaN(widthParam) && widthParam > 0 ? Math.min(widthParam, 1800) : 0;

  if (!targetUrl) {
    return res.status(400).send('Missing url');
  }

  const cacheKey = `${targetUrl}_w${targetWidth}`;

  // 1. Check ultra-fast In-Memory RAM Cache (0ms latency)
  const memHit = memoryImageCache.get(cacheKey);
  if (memHit) {
    if (req.headers['if-none-match'] === memHit.etag) {
      return res.status(304).end();
    }
    res.setHeader('Content-Type', memHit.contentType);
    res.setHeader('ETag', memHit.etag);
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    return res.end(memHit.buffer);
  }

  // 2. Handle Local /uploads/ files (including full origin URLs)
  if (targetUrl.includes('/uploads/')) {
    const filename = path.basename(targetUrl.split('?')[0]);
    const cwd = process.cwd();
    const possibleDirs = [
      path.join(cwd, 'public', 'uploads'),
      path.join(cwd, 'dist', 'uploads'),
      path.join(cwd, 'uploads')
    ];
    let localPath = '';
    for (const dir of possibleDirs) {
      const p = path.join(dir, filename);
      if (fs.existsSync(p)) {
        localPath = p;
        break;
      }
    }

    if (localPath) {
      try {
        let fileBuf = fs.readFileSync(localPath);
        let contentType = 'image/jpeg';
        const ext = path.extname(filename).toLowerCase();
        if (ext === '.png') contentType = 'image/png';
        else if (ext === '.webp') contentType = 'image/webp';
        else if (ext === '.svg') contentType = 'image/svg+xml';

        // If thumbnail width is requested and image is raster, resize with Sharp
        if (targetWidth > 0 && ext !== '.svg') {
          try {
            fileBuf = await sharp(fileBuf)
              .rotate()
              .resize({ width: targetWidth, fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 80, effort: 3 })
              .toBuffer();
            contentType = 'image/webp';
          } catch {
            // fallback to original buffer if sharp fails
          }
        }

        const etag = `"${crypto.createHash('md5').update(fileBuf).digest('hex')}"`;
        setMemoryCache(cacheKey, fileBuf, contentType, etag);

        if (req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        return res.end(fileBuf);
      } catch (err) {
        console.error('Local image read error:', err);
      }
    }
  }

  // 3. Check On-Disk Cache for Remote URLs
  const urlHash = crypto.createHash('md5').update(cacheKey).digest('hex');
  const cacheDir = path.join(process.cwd(), 'public', 'uploads', 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const cachedFile = path.join(cacheDir, `${urlHash}.webp`);

  if (fs.existsSync(cachedFile)) {
    try {
      const buf = fs.readFileSync(cachedFile);
      const etag = `"${crypto.createHash('md5').update(buf).digest('hex')}"`;
      setMemoryCache(cacheKey, buf, 'image/webp', etag);

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      return res.end(buf);
    } catch {
      // ignore and refetch
    }
  }

  // 4. Remote Fetch with In-Flight Deduplication
  try {
    let fetchPromise = inFlightFetches.get(cacheKey);
    if (!fetchPromise) {
      fetchPromise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
          const remoteRes = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
          });
          clearTimeout(timeoutId);

          if (!remoteRes.ok) return null;

          const arrayBuf = await remoteRes.arrayBuffer();
          const rawBuf = Buffer.from(arrayBuf);

          // Optimize & compress with Sharp
          let optimizedBuf: Buffer;
          let outContentType = 'image/webp';
          try {
            let sharpPipeline = sharp(rawBuf).rotate();
            if (targetWidth > 0) {
              sharpPipeline = sharpPipeline.resize({ width: targetWidth, fit: 'inside', withoutEnlargement: true });
            } else {
              sharpPipeline = sharpPipeline.resize({ width: 1400, fit: 'inside', withoutEnlargement: true });
            }
            optimizedBuf = await sharpPipeline.webp({ quality: 80, effort: 3 }).toBuffer();
          } catch {
            optimizedBuf = rawBuf;
            outContentType = remoteRes.headers.get('content-type') || 'image/jpeg';
          }

          try {
            fs.writeFileSync(cachedFile, optimizedBuf);
          } catch {}

          return { buffer: optimizedBuf, contentType: outContentType };
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          return null;
        } finally {
          inFlightFetches.delete(cacheKey);
        }
      })();
      inFlightFetches.set(cacheKey, fetchPromise);
    }

    const result = await fetchPromise;
    if (!result) {
      // Return subtle fallback SVG placeholder
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1E293B"/><text x="50" y="55" font-size="28" text-anchor="middle" fill="#64748B">🖼️</text></svg>`;
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(fallbackSvg);
    }

    const etag = `"${crypto.createHash('md5').update(result.buffer).digest('hex')}"`;
    setMemoryCache(cacheKey, result.buffer, result.contentType, etag);

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    return res.end(result.buffer);
  } catch {
    return res.status(502).send('Proxy error');
  }
});

// ⚡ High-speed image serving for /uploads with multi-folder resolution, ETag, CORS, and browser caching
app.get('/uploads/:filename', async (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  const rawFilename = req.params.filename;
  const filename = path.basename(rawFilename);
  if (!filename) {
    return res.status(400).send('Invalid filename');
  }

  const cwd = process.cwd();
  const possibleDirs = [
    path.join(cwd, 'public', 'uploads'),
    path.join(cwd, 'dist', 'uploads'),
    path.join(cwd, 'uploads')
  ];

  for (const dir of possibleDirs) {
    const fullPath = path.join(dir, filename);
    if (fs.existsSync(fullPath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.png') res.setHeader('Content-Type', 'image/png');
      else if (ext === '.webp') res.setHeader('Content-Type', 'image/webp');
      else if (ext === '.svg') res.setHeader('Content-Type', 'image/svg+xml');
      else res.setHeader('Content-Type', 'image/jpeg');

      return res.sendFile(fullPath);
    }
  }

  // If missing, return 404 image status so browser doesn't receive SPA HTML bundle
  return res.status(404).json({ error: 'Image not found' });
});

app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads'), {
  maxAge: '30d',
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// -------------------------------------------------------------
// 🔑 Facebook OAuth & Graph API Endpoints
// -------------------------------------------------------------

// 1. Get OAuth Authorization URL (For Popup window)
app.get('/api/auth/facebook/url', (req: Request, res: Response) => {
  const authInfo = getFacebookOAuthUrl(req);
  res.json(authInfo);
});

// 2. OAuth Callback handler (postMessage back to parent window & closes popup)
app.get(['/auth/callback', '/auth/callback/'], handleOAuthCallback);

// Facebook Compliance Pages (Required by Meta Developer Platform for public domains like chatbotkh.com)
app.get(['/privacy-policy', '/privacy'], (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html><html lang="km"><head><meta charset="utf-8"><title>Privacy Policy - ChatbotKH POS</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b1329;color:#e2e8f0;padding:24px;max-width:800px;margin:0 auto;line-height:1.7}h1{color:#38bdf8}h2{color:#7dd3fc;margin-top:24px}.card{background:#1e293b;padding:24px;border-radius:16px;border:1px solid #334155}</style></head><body><div class="card"><h1>គោលការណ៍ភាពឯកជន (Privacy Policy)</h1><p>ChatbotKH POS («យើង») ផ្តល់សេវាកម្មគ្រប់គ្រងការលក់ Live Stream, សារ Messenger និងការផ្ទៀងផ្ទាត់វិក្កយបត្រផ្ទេរប្រាក់។</p><h2>១. ទិន្នន័យដែលយើងប្រមូល</h2><p>យើងប្រមូលតែទិន្នន័យចាំបាច់សម្រាប់ការគ្រប់គ្រងការលក់ រួមមាន ៖ ឈ្មោះអតិថិជនលើ Facebook, មតិយោបល់ (Comments) លើការផ្សាយផ្ទាល់ Live Stream, សារក្នុង Inbox Messenger និងវិក្កយបត្រផ្ទេរប្រាក់ដែលអតិថិជនផ្ញើចូល។</p><h2>២. ការប្រើប្រាស់ទិន្នន័យ</h2><p>ទិន្នន័យទាំងអស់ត្រូវបានប្រើប្រាស់សម្រាប់តែគោលបំណងចាត់ចែងការបញ្ជាទិញ បង្កើតកន្ត្រកទំនិញ និងផ្ទៀងផ្ទាត់ការបង់ប្រាក់តែប៉ុណ្ណោះ។ យើងមិនដែលលក់ ឬចែករំលែកទិន្នន័យទាំងនេះទៅភាគីទីបីឡើយ។</p><h2>៣. សំណើលុបទិន្នន័យ</h2><p>អ្នកប្រើប្រាស់អាចស្នើសុំលុបទិន្នន័យរបស់ខ្លួនបានគ្រប់ពេលវេលាតាមរយៈទំព័រ <a href="/data-deletion" style="color:#38bdf8">លុបទិន្នន័យ (Data Deletion)</a>។</p></div></body></html>`);
});

app.get(['/terms', '/terms-of-service'], (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html><html lang="km"><head><meta charset="utf-8"><title>Terms of Service - ChatbotKH POS</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b1329;color:#e2e8f0;padding:24px;max-width:800px;margin:0 auto;line-height:1.7}h1{color:#38bdf8}h2{color:#7dd3fc;margin-top:24px}.card{background:#1e293b;padding:24px;border-radius:16px;border:1px solid #334155}</style></head><body><div class="card"><h1>លក្ខខណ្ឌប្រើប្រាស់ (Terms of Service)</h1><p>សូមស្វាគមន៍មកកាន់ ChatbotKH POS។ ដោយការប្រើប្រាស់ប្រព័ន្ធនេះ អ្នកយល់ព្រមគោរពតាមលក្ខខណ្ឌទាំងអស់ដែលមានចែងនៅទីនេះ។</p><h2>១. ការប្រើប្រាស់គណនី</h2><p>ម្ចាស់អាជីវកម្មទទួលខុសត្រូវលើការរក្សាការសម្ងាត់នៃ Page Access Token និងគណនី Facebook របស់ខ្លួន។</p><h2>២. សិទ្ធិគ្រប់គ្រង</h2><p>ប្រព័ន្ធនេះត្រូវបានរចនាឡើងដើម្បីជួយសម្រួលដល់ដំណើរការលក់ Live Stream និងការគ្រប់គ្រងឃ្លាំងទំនិញប៉ុណ្ណោះ។</p></div></body></html>`);
});

app.get(['/data-deletion', '/user-data-deletion'], (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html><html lang="km"><head><meta charset="utf-8"><title>Data Deletion Instructions - ChatbotKH POS</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b1329;color:#e2e8f0;padding:24px;max-width:800px;margin:0 auto;line-height:1.7}h1{color:#38bdf8}h2{color:#7dd3fc;margin-top:24px}.card{background:#1e293b;padding:24px;border-radius:16px;border:1px solid #334155}</style></head><body><div class="card"><h1>ការណែនាំអំពីការលុបទិន្នន័យ (Data Deletion Instructions)</h1><p>ប្រសិនបើអ្នកចង់លុបទិន្នន័យរបស់អ្នកចេញពីកម្មវិធី ChatbotKH POS ៖</p><ol style="padding-left:20px;line-height:2"><li>ចូលទៅកាន់គណនី Facebook របស់អ្នក រួចចូល Settings & Privacy > Settings > Apps and Websites។</li><li>ស្វែងរកកម្មវិធី <strong>ChatbotKH POS</strong> រួចចុច Remove។</li><li>ដើម្បីស្នើសុំលុបទិន្នន័យទាំងអស់ជាស្ថាពរ សូមផ្ញើសារមកកាន់អ្នកគ្រប់គ្រងប្រព័ន្ធ នោះទិន្នន័យរបស់អ្នកនឹងត្រូវលុបចោលទាំងស្រុងក្នុងរយៈពេល ៤៨ ម៉ោង។</li></ol></div></body></html>`);
});

// 3. Facebook Connection Status
app.get('/api/fb/status', (_req: Request, res: Response) => {
  res.json({
    connected: !!activeFacebookPage,
    activePage: activeFacebookPage,
    pages: getAvailablePages(),
    hasUserToken: !!getFacebookUserAccessToken(),
    activeLiveId
  });
});

// 4. Select Active Facebook Page
app.post('/api/fb/page/select', (req: Request, res: Response) => {
  const { page_id } = req.body;
  const page = selectPageById(page_id);
  if (page) {
    res.json({ success: true, activePage: page, pages: getAvailablePages() });
  } else {
    res.status(404).json({ success: false, error: 'Page not found' });
  }
});

// 5. Manual Page Token & Multi-Page Batch Connect (Supports single page token, multi-line tokens, JSON, and User Access Token with /me/accounts)
app.post(['/api/fb/manual_connect', '/api/fb/import_pages'], async (req: Request, res: Response) => {
  const { page_id, page_name, access_token, tokens } = req.body;
  const rawInput = String(access_token || tokens || '').trim();
  if (!rawInput) {
    return res.status(400).json({ success: false, error: 'សូមបញ្ចូល Access Token ឬបញ្ជី Page Tokens!' });
  }

  const collectedPages: any[] = [];
  const candidateTokenList: string[] = [];

  // Check if JSON array was pasted
  if (rawInput.startsWith('[') && rawInput.endsWith(']')) {
    try {
      const parsedArray = JSON.parse(rawInput);
      if (Array.isArray(parsedArray)) {
        for (const item of parsedArray) {
          if (typeof item === 'string' && item.trim()) {
            candidateTokenList.push(item.trim());
          } else if (item && typeof item === 'object') {
            if (item.access_token) {
              candidateTokenList.push(String(item.access_token).trim());
            } else if (item.token) {
              candidateTokenList.push(String(item.token).trim());
            }
          }
        }
      }
    } catch {}
  }

  // If not JSON array, parse line by line or comma-separated
  if (candidateTokenList.length === 0) {
    const lines = rawInput.split(/[\r\n,]+/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      // If formatted as "Page Name: EAAB..." or "ID: EAAB...", extract token part
      const tokenMatch = line.match(/(EA[A-Za-z0-9_-]{30,})/);
      if (tokenMatch && tokenMatch[1]) {
        candidateTokenList.push(tokenMatch[1]);
      } else if (line.length > 20) {
        candidateTokenList.push(line);
      }
    }
  }

  // Deduplicate tokens
  const uniqueTokens = Array.from(new Set(candidateTokenList));

  for (const token of uniqueTokens) {
    try {
      const pagesForToken = await fetchAllManagedFacebookPages(token);
      if (pagesForToken.length > 0) {
        collectedPages.push(...pagesForToken);
        // If this token discovered multiple pages or user pages, save as user access token
        if (pagesForToken.length > 1 || !getFacebookUserAccessToken()) {
          setFacebookUserAccessToken(token);
        }
      } else {
        // Fallback for custom page entry
        collectedPages.push({
          id: page_id || `manual_page_${Date.now()}`,
          name: page_name || `Facebook Page`,
          access_token: token
        });
      }
    } catch (err) {
      console.warn('Facebook token validation error for token:', err);
      collectedPages.push({
        id: page_id || `manual_page_${Date.now()}`,
        name: page_name || 'Facebook Page',
        access_token: token
      });
    }
  }

  // Deduplicate collected pages by ID
  const pageMap = new Map<string, any>();
  for (const p of collectedPages) {
    if (p.id) pageMap.set(p.id, p);
  }
  const finalPages = Array.from(pageMap.values());

  if (finalPages.length === 0) {
    return res.status(400).json({ success: false, error: 'មិនអាចទាញយកទំព័រ Facebook ពី Token នេះបានទេ។ សូមពិនិត្យមើល Token ម្តងទៀត!' });
  }

  batchAddConnectedPages(finalPages, true);
  bumpDataRevision();

  res.json({
    success: true,
    imported_count: finalPages.length,
    activePage: activeFacebookPage,
    pages: getAvailablePages(),
    message: `បានភ្ជាប់ Facebook Pages សរុប ${finalPages.length} ដោយជោគជ័យ!`
  });
});

// 5.1 Remove / Disconnect a Facebook Page
app.delete('/api/fb/page/:page_id', (req: Request, res: Response) => {
  const { page_id } = req.params;
  removeConnectedPage(page_id);
  res.json({ success: true, activePage: activeFacebookPage, pages: getAvailablePages() });
});

// 5.2 Force Refresh All Managed Pages from Facebook
app.post(['/api/fb/refresh_pages', '/api/fb/pages/refresh'], async (_req: Request, res: Response) => {
  try {
    const pages = await refreshFacebookAccounts();
    res.json({ success: true, activePage: activeFacebookPage, pages });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to refresh pages' });
  }
});

// 5.3 Clear / Disconnect All Facebook Pages
app.post(['/api/fb/pages/clear', '/api/fb/clear_all'], (_req: Request, res: Response) => {
  clearAllConnectedPages();
  res.json({ success: true, activePage: null, pages: [] });
});

// 5.5 Set Active Live ID
app.post('/api/fb/active_live', (req: Request, res: Response) => {
  const { live_id } = req.body;
  if (live_id) {
    const cleanId = String(live_id).trim();
    setActiveLiveId(cleanId);
    startLiveCommentsAutoSync(3, cleanId);
    bumpDataRevision();
    return res.json({ success: true, activeLiveId: cleanId });
  }
  res.status(400).json({ success: false, error: 'live_id is required' });
});

// 6. Get Facebook Page Posts & Live Streams
app.get('/api/fb/page_posts', async (req: Request, res: Response) => {
  const pageId = req.query.page_id as string;
  const posts = await fetchPageVideosAndPosts(pageId);
  res.json(posts);
});

// Cache for customer profile pictures
interface AvatarCacheItem {
  buffer: Buffer;
  contentType: string;
  url?: string;
  expiresAt: number;
}
const avatarCache = new Map<string, AvatarCacheItem>();

function generateFallbackAvatarSvg(name: string): string {
  const cleanName = String(name || '').trim();
  const initial = (cleanName.charAt(0) || '👤').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0891B2"/>
        <stop offset="100%" stop-color="#0E7490"/>
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#g)"/>
    <text x="50" y="58" font-size="42" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${initial}</text>
  </svg>`;
}

// 6.5 Get Facebook User Profile Picture (with Token Authentication & Binary Caching)
app.get('/api/fb/avatar/:userId', async (req: Request, res: Response) => {
  const userId = String(req.params.userId || '').trim();
  const fallbackName = String(req.query.name || 'User').trim();

  // If userId is missing or simulation placeholder
  if (!userId || userId === 'FB_USER_ID_STREAM' || userId.startsWith('sim_')) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(generateFallbackAvatarSvg(fallbackName));
  }

  // 1. Check in-memory image buffer cache
  const cached = avatarCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.end(cached.buffer);
  }

  // 2. Fetch using Page Access Token from Graph API
  const token = activeFacebookPage?.access_token;
  if (token && !token.startsWith('simulated_')) {
    try {
      const graphUrl = `https://graph.facebook.com/v21.0/${userId}/picture?type=normal&redirect=false&access_token=${token}`;
      const fbRes = await fetch(graphUrl);
      const fbData: any = await fbRes.json();

      if (fbData?.data?.url) {
        const picUrl = fbData.data.url;
        // Download image binary so we serve it directly with zero CORS and zero referer issues
        const imgRes = await fetch(picUrl);
        if (imgRes.ok) {
          const arrayBuf = await imgRes.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

          avatarCache.set(userId, {
            buffer: buf,
            contentType,
            url: picUrl,
            expiresAt: Date.now() + 12 * 3600 * 1000 // 12 hours cache
          });

          // Also populate picture_url onto matching invoices in memory
          for (const inv of invoices) {
            if (inv.facebook_user_id === userId && !inv.picture_url) {
              inv.picture_url = picUrl;
            }
          }

          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
          return res.end(buf);
        }
      }
    } catch (err) {
      console.warn(`[Avatar API] Failed to fetch FB picture for ${userId}:`, err);
    }
  }

  // 3. Fallback SVG avatar
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(generateFallbackAvatarSvg(fallbackName));
});

// 6.6 Resolve Direct Meta Business Suite Inbox URL for a User ID / PSID or Search
app.get('/api/fb/inbox_link/:userId', async (req: Request, res: Response) => {
  const userId = String(req.params.userId || '').trim();
  const nameQuery = String(req.query.name || '').trim();
  const isSearch = req.query.search === '1' || req.query.search === 'true';
  const token = activeFacebookPage?.access_token;
  const pageId = activeFacebookPage?.id || '102094263212256';

  // If search mode is requested (e.g. for expired >24h window customers)
  if (isSearch || nameQuery) {
    const searchTarget = nameQuery || userId;
    const searchUrl = `https://business.facebook.com/latest/inbox/all?mailbox_id=${pageId}&search_query=${encodeURIComponent(searchTarget)}`;
    return res.json({
      success: true,
      mode: 'SEARCH',
      searchTarget,
      pageId,
      url: searchUrl
    });
  }

  let selectedItemId = userId;

  if (userId && token && !token.startsWith('simulated_')) {
    try {
      const fbRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/conversations?user_id=${userId}&access_token=${token}`);
      const fbJson: any = await fbRes.json();
      if (fbJson?.data?.[0]?.link) {
        const linkStr = String(fbJson.data[0].link);
        // Extract thread folder ID from link: /102094263212256/inbox/4738716172883352/?section=messages
        const match = linkStr.match(/\/inbox\/(\d+)/) || linkStr.match(/threadid=(\d+)/);
        if (match && match[1]) {
          selectedItemId = match[1];
        }
      }
    } catch (err) {
      console.warn(`[Inbox Link Resolver] Failed to resolve thread for ${userId}:`, err);
    }
  }

  const directUrl = selectedItemId
    ? `https://business.facebook.com/latest/inbox/messenger?selected_item_id=${selectedItemId}&mailbox_id=${pageId}&thread_type=FB_MESSAGE`
    : `https://business.facebook.com/latest/inbox/messenger?mailbox_id=${pageId}&thread_type=FB_MESSAGE`;

  res.json({
    success: true,
    mode: 'DIRECT',
    userId,
    selectedItemId,
    pageId,
    url: directUrl
  });
});

// 7. Sync Live Comments from Facebook Graph API and Auto-Allocate into Baskets
app.all('/api/fb/sync_comments', async (req: Request, res: Response) => {
  try {
    const post_id = req.body?.post_id || req.query?.post_id as string;
    const targetId = post_id || activeLiveId;

    if (targetId && targetId !== activeLiveId) {
      setActiveLiveId(targetId);
    }

    const result = await fetchFacebookComments(targetId);
    if (result.error && (!result.data || result.data.length === 0)) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }
    const comments = result.data || [];
    const processedResults: any[] = [];

    for (const c of comments) {
      const parsed = parseAndAllocateComment(
        c.from?.id || '',
        c.from?.name || 'អតិថិជន Facebook',
        c.message || '',
        targetId,
        c.id,
        c.from?.picture?.data?.url
      );
      processedResults.push({ comment: c, parsed });
    }

    bumpDataRevision();

    const createdBaskets = invoices.filter(i => i.live_id === targetId && i.items.length > 0);
    const totalAllocated = processedResults.filter(r => r.parsed?.status === 'SUCCESS').length;

    res.json({
      success: true,
      target_live_id: targetId,
      total_synced: comments.length,
      total_orders: totalAllocated,
      total_baskets: createdBaskets.length,
      is_simulated: result.isSimulated || false,
      results: processedResults
    });
  } catch (err: any) {
    console.error('[Sync Comments Error]', err);
    res.status(500).json({
      success: false,
      error: err.message || 'កំហុសបណ្តាញក្នុងការទាញយកខមិន'
    });
  }
});

// -------------------------------------------------------------
// 📥 Download Helper Scripts Endpoints
// -------------------------------------------------------------
app.get('/api/download/:filename', (req: Request, res: Response) => {
  const allowed = ['pos_agent.py', 'build_exe.bat', 'run_agent.bat'];
  const filename = req.params.filename;
  if (!allowed.includes(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath, filename);
});

// -------------------------------------------------------------
// 📦 Digital Packing API Routes
// -------------------------------------------------------------
app.use('/api', packingRoutes);
app.use('/api/fast_check', fastCheckRoutes);
app.use('/api', fastCheckRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api', chatbotRoutes);

// Shortcut routes for printing slips and payment screen directly in any tab
app.get(['/print/:invoice_id', '/print_slip/:invoice_id'], (req: Request, res: Response) => {
  res.redirect(`/api/print_slip/${req.params.invoice_id}`);
});

app.get(['/pay/:invoice_id', '/khqr/:invoice_id'], (req: Request, res: Response) => {
  res.redirect(`/api/pay/${req.params.invoice_id}`);
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Fallback JSON handler for any unmatched /api/* endpoints
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.path}`
  });
});

// -------------------------------------------------------------
// 🚀 Vite Middleware (Dev) vs Static Dist (Production)
// -------------------------------------------------------------
async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' || (hasDist && process.env.FORCE_DEV !== 'true');

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/server/**', '**/dist/**', '**/*.db*', '**/db_store.json', '**/uploads/**']
        }
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (${isProduction ? 'Production Static Build' : 'Vite Dev Mode'})`);
    initChatbotStore();
    initTelegramBotService();
  });
}

startServer();
