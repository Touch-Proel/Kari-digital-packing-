import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import packingRoutes from './server/packingRoutes';
import fastCheckRoutes from './server/fastCheckRoutes';
import {
  getFacebookOAuthUrl,
  handleOAuthCallback,
  getAvailablePages,
  selectPageById,
  fetchPageVideosAndPosts,
  fetchFacebookComments
} from './server/fbAuth';
import {
  activeFacebookPage,
  setActiveFacebookPage,
  activeLiveId,
  setActiveLiveId,
  bumpDataRevision,
  invoices
} from './server/db';
import { parseAndAllocateComment } from './server/parser';
import { startLiveCommentsAutoSync } from './server/liveSync';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ⚡ High-speed image serving for /uploads with multi-folder resolution and browser caching
app.get('/uploads/:filename', (req: Request, res: Response) => {
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
      // Long-term immutable caching (images have timestamp/date in filename)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.png') res.setHeader('Content-Type', 'image/png');
      else if (ext === '.webp') res.setHeader('Content-Type', 'image/webp');
      else if (ext === '.svg') res.setHeader('Content-Type', 'image/svg+xml');
      else res.setHeader('Content-Type', 'image/jpeg');

      return res.sendFile(fullPath);
    }
  }

  // If missing, return 404 image status so browser doesn't receive SPA HTML bundle (index.html)
  return res.status(404).json({ error: 'Image not found' });
});

app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads'), {
  maxAge: '30d',
  immutable: true
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

// 3. Facebook Connection Status
app.get('/api/fb/status', (_req: Request, res: Response) => {
  res.json({
    connected: !!activeFacebookPage,
    activePage: activeFacebookPage,
    pages: getAvailablePages(),
    activeLiveId
  });
});

// 4. Select Active Facebook Page
app.post('/api/fb/page/select', (req: Request, res: Response) => {
  const { page_id } = req.body;
  const page = selectPageById(page_id);
  if (page) {
    res.json({ success: true, activePage: page });
  } else {
    res.status(404).json({ success: false, error: 'Page not found' });
  }
});

// 5. Manual Page Token Connect (Auto-detect real Page ID and Name from Graph API)
app.post('/api/fb/manual_connect', async (req: Request, res: Response) => {
  const { page_id, page_name, access_token } = req.body;
  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Page Access Token is required' });
  }

  const tokenStr = String(access_token).trim();
  let verifiedId = page_id || '';
  let verifiedName = String(page_name || '').trim();
  let pagePicture: any = undefined;

  // Query /me on Facebook Graph API to get the real Page ID and official name
  try {
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${tokenStr}`);
    const meData = await meRes.json();
    if (meData.id) {
      verifiedId = meData.id;
      verifiedName = meData.name || verifiedName;
      pagePicture = meData.picture;
    } else if (meData.error) {
      console.warn('Facebook token validation warning:', meData.error);
    }
  } catch (err) {
    console.warn('Failed to verify token with Facebook /me:', err);
  }

  const newPage = {
    id: verifiedId || `manual_page_${Date.now()}`,
    name: verifiedName || 'Facebook Page',
    access_token: tokenStr,
    picture: pagePicture
  };

  setActiveFacebookPage(newPage);
  bumpDataRevision();
  res.json({ success: true, activePage: newPage });
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
  });
}

startServer();
