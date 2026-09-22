import { Request, Response } from 'express';
import { activeFacebookPage, setActiveFacebookPage, bumpDataRevision } from './db';
import { FacebookPage, FacebookPost } from './types';

export const DEFAULT_APP_ID = process.env.FB_APP_ID || '1240481003109421';
export const DEFAULT_APP_SECRET = process.env.FB_APP_SECRET || '482483f6d5890d34442ef6558b1cf8d2';

let userAccessToken = '';
let availablePages: FacebookPage[] = [];

export function getRedirectUri(req: Request): string {
  if (process.env.APP_URL) {
    const base = process.env.APP_URL.replace(/\/$/, '');
    return `${base}/auth/callback`;
  }
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}/auth/callback`;
}

// Generate OAuth URL for Popup
export function getFacebookOAuthUrl(req: Request): { url: string; redirectUri: string; appId: string } {
  const appId = DEFAULT_APP_ID;
  const redirectUri = getRedirectUri(req);
  const scopes = [
    'pages_read_engagement',
    'pages_read_user_content',
    'pages_manage_metadata',
    'pages_show_list',
    'publish_video',
    'pages_messaging'
  ].join(',');

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    auth_type: 'rerequest'
  });

  const url = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  return { url, redirectUri, appId };
}

// Helper to safely parse JSON from Facebook Graph API responses without throwing SyntaxError on HTML/error pages
async function safeGraphApiFetch(url: string, options?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error?.message) {
        // Redact any access_token parameters from error messages to protect credentials per Meta Data Security Policy
        parsed.error.message = parsed.error.message.replace(/access_token=[a-zA-Z0-9_-]+/gi, 'access_token=[REDACTED]');
      }
      return parsed;
    } catch {
      return {
        error: {
          message: `Facebook Graph API returned non-JSON response (${res.status} ${res.statusText})`
        }
      };
    }
  } catch (netErr: any) {
    return {
      error: {
        message: (netErr?.message || 'Network error connecting to Facebook API').replace(/access_token=[a-zA-Z0-9_-]+/gi, 'access_token=[REDACTED]')
      }
    };
  }
}

// Exchange Code for Access Tokens
export async function handleOAuthCallback(req: Request, res: Response) {
  const code = req.query.code as string;
  const error = req.query.error as string;
  const errorDescription = req.query.error_description as string;

  if (error || !code) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Facebook Login Cancelled</title>
          <style>
            body { font-family: sans-serif; background: #0b1426; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 24px; border-radius: 16px; text-align: center; max-width: 400px; }
            button { background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; margin-top: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <h3>⚠️ ការភ្ជាប់ Facebook ត្រូវបានបដិសេធ</h3>
            <p style="color: #94a3b8; font-size: 14px;">${errorDescription || 'អ្នកបានបិទផ្ទាំង ឬបដិសេធការអនុញ្ញាត។'}</p>
            <button onclick="window.close()">បិទផ្ទាំងនេះ</button>
          </div>
        </body>
      </html>
    `);
  }

  const redirectUri = getRedirectUri(req);
  const tokenUrl = 'https://graph.facebook.com/v21.0/oauth/access_token';

  try {
    const tokenParams = new URLSearchParams({
      client_id: DEFAULT_APP_ID,
      client_secret: DEFAULT_APP_SECRET,
      redirect_uri: redirectUri,
      code
    });

    const tokenData = await safeGraphApiFetch(`${tokenUrl}?${tokenParams.toString()}`);

    if (tokenData.access_token) {
      userAccessToken = tokenData.access_token;

      // Extend to long-lived token
      try {
        const extParams = new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: DEFAULT_APP_ID,
          client_secret: DEFAULT_APP_SECRET,
          fb_exchange_token: userAccessToken
        });
        const extData = await safeGraphApiFetch(`${tokenUrl}?${extParams.toString()}`);
        if (extData.access_token) {
          userAccessToken = extData.access_token;
        }
      } catch (err) {
        console.warn('Long-lived token exchange warning:', err);
      }

      // Fetch user's managed Facebook Pages
      const pagesData = await safeGraphApiFetch(
        `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,category,picture&limit=50`
      );
      availablePages = pagesData.data || [];

      if (availablePages.length > 0) {
        setActiveFacebookPage(availablePages[0]);
      }
      bumpDataRevision();

      // Return popup success script matching oauth-integration skill
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Facebook Connected</title>
            <style>
              body { font-family: sans-serif; background: #030712; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .card { background: #0f172a; border: 1.5px solid #10b981; padding: 32px; border-radius: 20px; text-align: center; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
              h2 { color: #34d399; margin-top: 0; }
              p { color: #94a3b8; font-size: 15px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>✨ ភ្ជាប់គណនី Facebook ជោគជ័យ!</h2>
              <p>បានទាញយកទំព័រ Facebook Pages (${availablePages.length}) រួចរាល់។ កំពុងបិទផ្ទាំងនេះ...</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'OAUTH_AUTH_SUCCESS',
                  provider: 'facebook',
                  pageCount: ${availablePages.length}
                }, '*');
                setTimeout(() => window.close(), 1200);
              } else {
                setTimeout(() => { window.location.href = '/'; }, 1500);
              }
            </script>
          </body>
        </html>
      `);
    } else {
      throw new Error(tokenData.error?.message || 'Failed to exchange token');
    }
  } catch (err: any) {
    console.error('Facebook OAuth Error:', err);
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Error</title></head>
        <body style="background:#0b1426;color:white;padding:30px;font-family:sans-serif;">
          <h3>❌ ការភ្ជាប់ Facebook មិនជោគជ័យ</h3>
          <p style="color:#ef4444;">${err.message || 'Unknown error'}</p>
          <button onclick="window.close()" style="background:#3b82f6;color:white;padding:8px 16px;border:none;border-radius:6px;cursor:pointer;">បិទ</button>
        </body>
      </html>
    `);
  }
}

// Get Connected Pages
export function getAvailablePages(): FacebookPage[] {
  if (availablePages.length === 0 && activeFacebookPage) {
    return [activeFacebookPage];
  }
  return availablePages;
}

// Select Active Page
export function selectPageById(pageId: string): FacebookPage | null {
  const page = availablePages.find(p => p.id === pageId);
  if (page) {
    setActiveFacebookPage(page);
    bumpDataRevision();
    return page;
  }
  return null;
}

// Fetch Page Live Videos & Posts
export async function fetchPageVideosAndPosts(pageId?: string, accessToken?: string): Promise<FacebookPost[]> {
  const targetPage = activeFacebookPage;
  const token = accessToken || targetPage?.access_token;

  if (!token || token.startsWith('simulated_')) {
    // Provide simulated sample posts/live streams so the app functions instantly
    return [
      {
        id: 'LIVE_20260913_VIP',
        message: '🔴 [LIVE STREAM] ប្រូម៉ូសិនពិសេស Live លក់សម្លៀកបំពាក់នាំចូល និងរ៉ូបប្រណិត KARI ARNETT 🛍️',
        created_time: '2026-09-13T14:00:00+0700',
        is_live: true,
        live_status: 'LIVE',
        status_type: 'added_video'
      },
      {
        id: 'LIVE_20260912_NIGHT',
        message: '🎥 [LIVE STREAM] មេឃភ្លៀង Live លក់ខោខូវប៊យ និងអាវយឺតកូរ៉េ VIP 12/09',
        created_time: '2026-09-12T20:00:00+0700',
        is_live: false,
        live_status: 'VOD',
        status_type: 'added_video'
      },
      {
        id: 'POST_20260911_NEW',
        message: '📸 រ៉ូបសាច់ក្រណាត់ផ្កា និងខោខូវប៊យម៉ូតថ្មីទើបមកដល់ស្តុកចា៎ ខំមិនកូដកាត់ឥឡូវនេះ!',
        created_time: '2026-09-11T10:00:00+0700',
        is_live: false,
        status_type: 'mobile_status_update'
      }
    ];
  }

  // 1. Auto-heal activeFacebookPage ID and Name from Facebook /me
  try {
    const meData = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${token}`);
    if (meData.id && meData.name && activeFacebookPage) {
      activeFacebookPage.id = meData.id;
      activeFacebookPage.name = meData.name;
      if (meData.picture?.data?.url) {
        activeFacebookPage.picture = meData.picture;
      }
      bumpDataRevision();
    }
  } catch (e) {
    console.warn('Auto-heal Facebook Page ID error:', e);
  }

  const posts: FacebookPost[] = [];

  // 2. Fetch live videos from /me/live_videos
  try {
    const liveUrl = `https://graph.facebook.com/v21.0/me/live_videos?fields=id,title,description,status,creation_time,video{id,description,permalink_url},embed_html&limit=25&access_token=${token}`;
    const liveData = await safeGraphApiFetch(liveUrl);

    if (liveData.data && Array.isArray(liveData.data)) {
      for (const lv of liveData.data) {
        const isLiveNow = lv.status === 'LIVE_NOW' || lv.status === 'LIVE';
        const rawDesc = lv.title || lv.description || lv.video?.description || '';
        const displayTitle = rawDesc.trim()
          ? (isLiveNow ? `🔴 [LIVE NOW] ${rawDesc}` : `📼 [Live Stream] ${rawDesc}`)
          : (isLiveNow ? `🔴 វីដេអូកំពុងផ្សាយផ្ទាល់ (Live Now)` : `📼 វីដេអូផ្សាយផ្ទាល់ #${lv.id.slice(-6)} (${lv.status || 'VOD'})`);

        posts.push({
          id: lv.id,
          message: displayTitle,
          created_time: lv.creation_time || new Date().toISOString(),
          is_live: isLiveNow,
          live_status: lv.status || (isLiveNow ? 'LIVE' : 'VOD'),
          permalink_url: lv.video?.permalink_url || `https://www.facebook.com/watch/?v=${lv.id}`,
          status_type: 'added_video'
        });
      }
    }
  } catch (err) {
    console.error('Error fetching live_videos:', err);
  }

  // 3. Fetch page published posts & feeds
  try {
    const postsUrl = `https://graph.facebook.com/v21.0/me/posts?fields=id,message,created_time,status_type,permalink_url,story&limit=25&access_token=${token}`;
    const postsData = await safeGraphApiFetch(postsUrl);

    if (postsData.data && Array.isArray(postsData.data)) {
      for (const p of postsData.data) {
        if (!posts.some(existing => existing.id === p.id)) {
          const isLiveStory = p.story && p.story.toLowerCase().includes('live');
          const cleanText = p.message || p.story || `Post #${p.id.split('_').pop()}`;
          const formattedText = isLiveStory ? `🎥 ${cleanText}` : `📝 ${cleanText}`;

          posts.push({
            id: p.id,
            message: formattedText,
            created_time: p.created_time || new Date().toISOString(),
            is_live: isLiveStory,
            live_status: isLiveStory ? 'VOD' : undefined,
            permalink_url: p.permalink_url,
            status_type: p.status_type || 'status'
          });
        }
      }
    }
  } catch (err) {
    console.error('Error fetching posts:', err);
  }

  // Fallback to sample demo posts if Facebook returned zero items
  if (posts.length === 0) {
    return [
      {
        id: 'LIVE_20260913_VIP',
        message: '🔴 [LIVE DEMO] ប្រូម៉ូសិនពិសេស Live លក់សម្លៀកបំពាក់នាំចូល និងរ៉ូបប្រណិត KARI ARNETT 🛍️',
        created_time: '2026-09-13T14:00:00+0700',
        is_live: true,
        live_status: 'LIVE',
        status_type: 'added_video'
      },
      {
        id: 'LIVE_20260912_NIGHT',
        message: '🎥 [LIVE DEMO] Live លក់ខោខូវប៊យ និងអាវយឺតកូរ៉េ VIP 12/09',
        created_time: '2026-09-12T20:00:00+0700',
        is_live: false,
        live_status: 'VOD',
        status_type: 'added_video'
      }
    ];
  }

  return posts;
}

// Generate realistic simulated sample comments for local/demo live testing
function getSimulatedSampleComments() {
  const now = Date.now();
  return [
    {
      id: `cm_${now}_1`,
      from: {
        id: '100088991122334',
        name: 'សុខ ស្រីម៉ៅ (Srey Mao)',
        picture: { data: { url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80' } }
      },
      message: '30=2 យកពណ៍ផ្ទៃមេឃ 012889772 ភ្នំពេញ',
      created_time: new Date(now - 150000).toISOString()
    },
    {
      id: `cm_${now}_2`,
      from: {
        id: '100099887766554',
        name: 'គីម ហុង (Kim Hong)',
        picture: { data: { url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80' } }
      },
      message: 'A12=2 ខោខូវប៊យ 098776655 សៀមរាប',
      created_time: new Date(now - 110000).toISOString()
    },
    {
      id: `cm_${now}_3`,
      from: {
        id: '100077665544332',
        name: 'ម៉ៅ ចិន្តា (Chenda Mao)',
        picture: { data: { url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' } }
      },
      message: '54=1 អាវយឺត និង 30=1 077334455 កំពង់ចាម',
      created_time: new Date(now - 70000).toISOString()
    },
    {
      id: `cm_${now}_4`,
      from: {
        id: '100066554433221',
        name: 'លីណា ស្តាយ (Lina Style)',
        picture: { data: { url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80' } }
      },
      message: 'K99=1 អាវប៉ាក់ 015998877 ភ្នំពេញ',
      created_time: new Date(now - 30000).toISOString()
    }
  ];
}

// Fetch Comments for a Post or Live Stream with full pagination
export async function fetchFacebookComments(targetPostId: string, pageAccessToken?: string, maxLimit = 10000) {
  const token = pageAccessToken || activeFacebookPage?.access_token;
  const isSimulatedTarget = !targetPostId || targetPostId.startsWith('LIVE_') || targetPostId.startsWith('sim_') || targetPostId.startsWith('POST_');

  if (!token || token.startsWith('simulated_') || isSimulatedTarget) {
    return { data: getSimulatedSampleComments(), isSimulated: true };
  }

  try {
    const rawTarget = targetPostId.trim();
    const cleanId = rawTarget.includes('_') ? rawTarget.split('_').pop() : rawTarget;
    const allComments: any[] = [];
    const seenCommentIds = new Set<string>();

    // Try fetching with filter=stream and live_filter=all_comments to bypass Facebook's spam/relevance filter and fetch all comments
    const tryTargetIds = [cleanId];
    if (rawTarget !== cleanId) {
      tryTargetIds.push(rawTarget);
    }

    for (const targetId of tryTargetIds) {
      if (allComments.length > 0) break;

      let nextUrl: string | null = `https://graph.facebook.com/v21.0/${targetId}/comments?fields=from{id,name,picture},message,id,created_time&filter=stream&live_filter=all_comments&order=chronological&limit=100&access_token=${token}`;
      let pageCount = 0;
      const maxPages = Math.ceil(maxLimit / 100);

      while (nextUrl && pageCount < maxPages && allComments.length < maxLimit) {
        pageCount++;
        const data: any = await safeGraphApiFetch(nextUrl);

        if (data.error) {
          console.error(`Facebook Graph API error on target ${targetId} page ${pageCount}:`, data.error);
          // If stream filter failed (e.g. standard post doesn't support live_filter), fallback to standard query
          if (pageCount === 1 && data.error.code !== 190) {
            const fallbackUrl = `https://graph.facebook.com/v21.0/${targetId}/comments?fields=from{id,name,picture},message,id,created_time&filter=stream&order=chronological&limit=100&access_token=${token}`;
            const fallbackData: any = await safeGraphApiFetch(fallbackUrl);
            if (fallbackData?.data && Array.isArray(fallbackData.data)) {
              for (const itm of fallbackData.data) {
                if (itm.id && !seenCommentIds.has(itm.id)) {
                  seenCommentIds.add(itm.id);
                  allComments.push(itm);
                }
              }
              if (fallbackData.paging?.next) {
                nextUrl = fallbackData.paging.next;
                continue;
              }
            }
          }
          break;
        }

        const items = data.data || [];
        if (items.length === 0) break;

        for (const itm of items) {
          if (itm.id && !seenCommentIds.has(itm.id)) {
            seenCommentIds.add(itm.id);
            allComments.push(itm);
          }
        }
        console.log(`[FB Sync] Target ${targetId} Page ${pageCount}: fetched ${items.length} comments (Total Unique: ${allComments.length})`);

        if (data.paging && data.paging.next) {
          nextUrl = data.paging.next;
        } else {
          nextUrl = null;
        }
      }
    }

    // Sort chronologically (oldest first) so that customers who commented first get stock first
    allComments.sort((a, b) => {
      const timeA = a.created_time ? new Date(a.created_time).getTime() : 0;
      const timeB = b.created_time ? new Date(b.created_time).getTime() : 0;
      return timeA - timeB;
    });

    console.log(`[FB Sync Complete] Total comments retrieved for ${cleanId}: ${allComments.length}`);
    return { data: allComments.length > 0 ? allComments : getSimulatedSampleComments(), isSimulated: allComments.length === 0 };
  } catch (err: any) {
    console.error('Error fetching FB comments:', err);
    return { data: getSimulatedSampleComments(), isSimulated: true, error: String(err?.message || err) };
  }
}

// Send Messenger Invoice with Multi-Tier Fallback:
// Method 1: Direct Messenger Send API (Inbox)
// Method 2: Private Reply via Comment ID (24-Hour Policy Exempt)
// Fallback: Manual Clipboard Copy & 1-Tap Messenger Link
export interface FacebookReplyResult {
  success: boolean;
  error?: string;
  method?: 'SEND_API' | 'PRIVATE_REPLY' | 'MANUAL_COPIED' | 'SIMULATED';
  methodTitle?: string;
  detail?: string;
  attemptLogs?: string[];
}

export async function sendFacebookReply(
  commentId: string | null,
  userId: string | null,
  messageText: string,
  token?: string,
  imageUrl?: string,
  imageBuffer?: Buffer,
  extraCommentIds?: string[]
): Promise<FacebookReplyResult> {
  const activeToken = token || activeFacebookPage?.access_token;
  if (!activeToken || activeToken.startsWith('simulated_') || activeToken.length < 20) {
    console.log(`[VIP INVOICE NOTICE] No real Facebook Page Access Token configured. Message prepared for manual copy.`);
    return {
      success: false,
      method: 'MANUAL_COPIED',
      methodTitle: 'ផ្ញើដោយផ្ទាល់ (ចម្លងរួចរាល់)',
      error: 'មិនទាន់បានភ្ជាប់ Facebook Page Token (ឬ Token មិនត្រឹមត្រូវ) ➔ បានចម្លងអត្ថបទវិក្កយបត្ររួចរាល់ សូមចុច «ឆាតផ្ទាល់» ដើម្បីផ្ញើទៅកាន់ Messenger!'
    };
  }

  const cleanUid = String(userId || '').trim();
  const attemptLogs: string[] = [];

  // Build ordered list of unique comment ID candidates
  const rawIdPool: string[] = [];
  if (commentId) rawIdPool.push(String(commentId).trim());
  if (Array.isArray(extraCommentIds)) {
    for (const ec of extraCommentIds) {
      if (ec) rawIdPool.push(String(ec).trim());
    }
  }

  const isValidCid = (cid: string) => {
    if (!cid || typeof cid !== 'string') return false;
    const clean = cid.trim();
    return /^[\d_]+$/.test(clean) && clean.replace(/_/g, '').length >= 6;
  };

  const candidateCommentIds: string[] = [];
  for (const raw of rawIdPool) {
    if (!raw || raw.startsWith('sys_') || raw.startsWith('manual_')) continue;
    // Skip simulated IDs like c_17269... unless purely numeric
    if (raw.startsWith('c_') && !/^\d+$/.test(raw.replace(/^c_/, ''))) continue;

    const cleaned = raw.replace(/^c_/, '');
    if (isValidCid(cleaned)) {
      candidateCommentIds.push(cleaned);
      if (cleaned.includes('_')) {
        const parts = cleaned.split('_');
        const suffix = parts[parts.length - 1];
        if (suffix && isValidCid(suffix)) {
          candidateCommentIds.push(suffix);
        }
      }
    }
  }

  const commentIdCandidates = Array.from(new Set(candidateCommentIds));

  console.log(`\n=======================================================`);
  console.log(`🚀 [VIP MULTI-METHOD DISPATCH]: Starting 3-method delivery cascade...`);
  console.log(`   ↳ Recipient User ID: ${cleanUid || 'None'}`);
  console.log(`   ↳ Candidate Comment IDs: ${commentIdCandidates.length > 0 ? commentIdCandidates.join(', ') : 'None'}`);
  if (imageBuffer) console.log(`   ↳ Image Buffer: ${imageBuffer.length} bytes`);
  else if (imageUrl) console.log(`   ↳ Image URL: ${imageUrl}`);

  let lastApiError = '';
  let privateReplyFailReason = '';
  let directInboxFailReason = '';
  const safeDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper to send image attachment via Send API with Meta 24-Hour Policy compliance
  const sendImageAttachment = async (recipientId: string, useTag = false): Promise<boolean> => {
    if (!recipientId || recipientId === 'None' || recipientId.startsWith('FB_USER_ID')) return false;
    try {
      const messagingType = useTag ? 'MESSAGE_TAG' : 'RESPONSE';

      if (imageBuffer && imageBuffer.length > 0) {
        const form = new FormData();
        form.append('recipient', JSON.stringify({ id: recipientId }));
        form.append('message', JSON.stringify({
          attachment: {
            type: 'image',
            payload: { is_reusable: true }
          }
        }));
        form.append('messaging_type', messagingType);
        if (useTag) {
          form.append('tag', 'POST_PURCHASE_UPDATE');
        }
        const blob = new Blob([imageBuffer], { type: 'image/png' });
        form.append('filedata', blob, 'bakong_khqr.png');

        const imgData = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${activeToken}`, {
          method: 'POST',
          body: form
        });
        if (imgData.message_id || imgData.recipient_id) {
          console.log(`📸 [KHQR BINARY ATTACHED]: Delivered KHQR image to User ID (${recipientId}) [${messagingType}]!`);
          return true;
        } else if (imgData.error?.error_subcode === 2018278 && !useTag) {
          // If standard response failed due to 24h window, retry with compliant POST_PURCHASE_UPDATE tag
          return await sendImageAttachment(recipientId, true);
        }
      } else if (imageUrl) {
        const payloadBody: any = {
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: 'image',
              payload: { url: imageUrl, is_reusable: true }
            }
          },
          messaging_type: messagingType
        };
        if (useTag) {
          payloadBody.tag = 'POST_PURCHASE_UPDATE';
        }

        const imgData = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${activeToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadBody)
        });
        if (imgData.message_id) {
          console.log(`📸 [KHQR IMAGE SENT]: Attached KHQR image to User ID (${recipientId}) [${messagingType}]`);
          return true;
        } else if (imgData.error?.error_subcode === 2018278 && !useTag) {
          return await sendImageAttachment(recipientId, true);
        }
      }
    } catch (imgErr) {
      console.warn(`[KHQR ATTACH NOTE]:`, imgErr);
    }
    return false;
  };

  // =====================================================================
  // 1️⃣ METHOD 1: Private Reply via Comment ID (Meta Official Send API)
  // Endpoint: POST /v21.0/me/messages with { "recipient": { "comment_id": target_cid } }
  // Meta official standard: exempt from 24-hour messaging policy window!
  // Meta policy rules:
  // - 1 message per comment only (error 10900 if already replied)
  // - Comment must be within 7 days
  // - Stop immediately after 1 successful reply (no spam)
  // =====================================================================
  let isDelivered = false;

  if (commentIdCandidates.length > 0) {
    console.log(`\n👉 [TRY METHOD 1]: Meta Official Private Reply via Comment ID (${commentIdCandidates.join(', ')})...`);

    for (let i = 0; i < commentIdCandidates.length; i++) {
      if (isDelivered) break;

      const rawCid = commentIdCandidates[i];
      const cleanCid = String(rawCid || '').trim();
      const targetCid = cleanCid.includes('_') ? cleanCid.split('_').pop() || cleanCid : cleanCid;

      // Prepare IDs to test: exact compound ID first, then numeric suffix
      const cidsToTest = [cleanCid];
      if (cleanCid !== targetCid && isValidCid(targetCid)) {
        cidsToTest.push(targetCid);
      }

      for (const testCid of cidsToTest) {
        if (isDelivered) break;
        if (!isValidCid(testCid)) continue;

        // Polite delay between requests to prevent triggering Meta API rate limits
        if (i > 0) {
          await safeDelay(150);
        }

        try {
          console.log(`   ↳ Dispatching POST /v21.0/me/messages with recipient.comment_id: ${testCid}...`);
          let msgData = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${activeToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { comment_id: testCid },
              message: { text: messageText }
            })
          });

          // Secondary fallback: test direct /{comment_id}/private_replies endpoint
          if (!msgData.message_id && !msgData.recipient_id && msgData.error?.code !== 10900) {
            try {
              const prData = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/${testCid}/private_replies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: messageText,
                  access_token: activeToken
                })
              });
              if (prData.id || prData.recipient_id) {
                msgData = { message_id: prData.id || prData.recipient_id, ...prData };
              }
            } catch {}
          }

          if (msgData.message_id || msgData.recipient_id) {
            console.log(`🎉 [META OFFICIAL PRIVATE REPLY SUCCESS]: Delivered via recipient.comment_id (${testCid})!`);
            isDelivered = true;
            const targetRecipient = msgData.recipient_id || cleanUid;
            if (targetRecipient && (imageUrl || imageBuffer)) {
              await sendImageAttachment(targetRecipient, false);
            }
            attemptLogs.push(`✅ វិធីទី ១ (Private Reply តាមខមិន) ជោគជ័យ ៖ បានផ្ញើតាម Comment ID #${testCid} ចូល Messenger រួចផុតពីកំហិត ២៤ ម៉ោង`);
            console.log(`=======================================================\n`);
            return {
              success: true,
              method: 'PRIVATE_REPLY',
              methodTitle: 'Private Reply (តាម Comment ID)',
              detail: `បានផ្ញើ Private Reply តាម Comment #${testCid} ចូល Messenger ស្របតាមគោលការណ៍ Meta!`,
              attemptLogs
            };
          } else if (msgData.error) {
            const mErr = msgData.error.message || `Error code ${msgData.error.code}`;
            const code = msgData.error.code;
            const subCode = msgData.error.error_subcode;
            console.log(`   ↳ Comment ID ${testCid} response: [${code}/${subCode || ''}] ${mErr}`);
            lastApiError = mErr;

            let reasonKh = mErr;
            if (code === 10900 || mErr.toLowerCase().includes('already has a private reply')) {
              reasonKh = `ខមិន #${testCid} ត្រូវបានឆ្លើយតប Private Reply ម្តងរួចហើយ (Meta អនុញ្ញាតត្រឹម ១ ដងក្នុង ១ ខមិន)`;
            } else if (mErr.toLowerCase().includes('7 days') || mErr.toLowerCase().includes('seven days')) {
              reasonKh = `ខមិន #${testCid} ផុតកំណត់លើស ៧ ថ្ងៃ (Meta មិនអនុញ្ញាត Private Reply លើស ៧ ថ្ងៃឡើយ)`;
            } else if (code === 100 || subCode === 33 || mErr.toLowerCase().includes('does not exist')) {
              reasonKh = `រកមិនឃើញខមិន #${testCid} ឬខមិននេះត្រូវបានលុបចេញពី Facebook`;
            }
            privateReplyFailReason = reasonKh;
            attemptLogs.push(`⚠️ វិធីទី ១ (Private Reply តាម Comment #${testCid}) ៖ ${reasonKh}`);

            // Meta Rate Limit circuit breaker: halt immediately to protect Page health
            if ([4, 17, 32, 613].includes(msgData.error.code)) {
              console.warn(`[META POLICY]: Rate limit warning (code ${msgData.error.code}). Halting automated attempts to keep Page safe.`);
              attemptLogs.push(`⚠️ Meta API Rate Limit: កំពុងកំណត់ចំនួនហៅ Graph API - បានប្តូរទៅជម្រើសផ្ញើផ្ទាល់ដោយសុវត្ថិភាព`);
              break;
            }
          }
        } catch (cidErr: any) {
          console.warn(`   ↳ Comment ID ${testCid} error:`, cidErr?.message);
          lastApiError = cidErr?.message || 'Private reply network error';
        }
      }
    }
  } else {
    console.log(`ℹ️ [METHOD 1 SKIPPED]: No comment ID available for this customer.`);
    privateReplyFailReason = 'កន្ត្រកនេះមិនមាន Comment ID ឡើយ (កន្ត្រកបង្កើតផ្ទាល់ ឬគ្មានខមិន)';
    attemptLogs.push(`ℹ️ វិធីទី ១ (Private Reply) រំលង ៖ កន្ត្រកនេះមិនមាន Comment ID ឡើយ (កន្ត្រកបង្កើតផ្ទាល់ ឬគ្មានខមិន)`);
  }

  // =====================================================================
  // 2️⃣ METHOD 2: Direct Messenger Send API (User PSID)
  // Endpoint: POST /v21.0/me/messages with { "recipient": { "id": cleanUid }, "messaging_type": "RESPONSE" }
  // Meta policy rules:
  // - Standard messaging window: 24 hours
  // - Outside 24 hours: Strictly use official tag 'POST_PURCHASE_UPDATE' for e-commerce invoices/receipts
  // =====================================================================
  const isValidUserUid = Boolean(
    cleanUid &&
    !['FB_USER_ID_STREAM', 'MANUAL_USER_ID', 'NONE', 'None', '', 'null', 'undefined'].includes(cleanUid) &&
    cleanUid.length >= 6
  );

  if (!isDelivered && isValidUserUid) {
    console.log(`\n👉 [TRY METHOD 2]: Direct Messenger Inbox (User ID: ${cleanUid})...`);
    try {
      const data = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${activeToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: cleanUid },
          message: { text: messageText },
          messaging_type: 'RESPONSE'
        })
      });

      if (data.message_id) {
        console.log(`🎉 [METHOD 2 SUCCESS]: VIP message delivered directly to Inbox (${cleanUid})!`);
        isDelivered = true;
        if (imageUrl || imageBuffer) {
          await sendImageAttachment(cleanUid, false);
        }
        attemptLogs.push(`✅ វិធីទី ២ ជោគជ័យ៖ ផ្ញើចូល Inbox របស់ភ្ញៀវដោយផ្ទាល់ (ក្នុង ២៤ ម៉ោង)`);
        console.log(`=======================================================\n`);
        return {
          success: true,
          method: 'SEND_API',
          methodTitle: 'Direct Messenger (តាម User ID)',
          detail: 'បានផ្ញើសារវិក្កយបត្រ & KHQR ចូលប្រអប់សារ Messenger ដោយផ្ទាល់!',
          attemptLogs
        };
      } else if (data.error) {
        lastApiError = data.error.message || `Error code ${data.error.code}`;
        console.log(`⚠️ [METHOD 2 FAILED]: ${lastApiError}`);

        // Check if error is due to Meta 24-hour window policy (Error code 10, subcode 2018278)
        const is24hWindowError = data.error.code === 10 || data.error.error_subcode === 2018278 || lastApiError.toLowerCase().includes('24 hour') || lastApiError.toLowerCase().includes('allowed window');

        if (is24hWindowError) {
          directInboxFailReason = 'ប្រអប់សារ Messenger ផុតកំណត់ ២៤ ម៉ោង (អតិថិជនមិនបានឆាតក្នុងរយៈពេល ២៤ ម៉ោងចុងក្រោយ)';
          attemptLogs.push(`⚠️ វិធីទី ២ (Direct Inbox) ផុត ២៤ ម៉ោង ៖ អតិថិជនមិនបានឆាតក្នុង Messenger រយៈពេល ២៤ ម៉ោងចុងក្រោយ`);

          // Under Meta Messenger Policy: Use POST_PURCHASE_UPDATE for transactional receipts/invoices
          console.log(`   ↳ Customer outside 24h window. Attempting Meta compliant POST_PURCHASE_UPDATE message tag...`);
          try {
            await safeDelay(200);
            const taggedRes = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${activeToken}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: { id: cleanUid },
                message: { text: messageText },
                messaging_type: 'MESSAGE_TAG',
                tag: 'POST_PURCHASE_UPDATE'
              })
            });

            if (taggedRes.message_id) {
              console.log(`🎉 [METHOD 2 POST_PURCHASE_UPDATE SUCCESS]: Delivered via Meta official POST_PURCHASE_UPDATE tag!`);
              isDelivered = true;
              if (imageUrl || imageBuffer) await sendImageAttachment(cleanUid, true);
              attemptLogs.push(`✅ វិធីទី ២ (POST_PURCHASE_UPDATE Tag) ជោគជ័យ ៖ ស្របតាមគោលការណ៍ Messenger សម្រាប់វិក្កយបត្រ`);
              console.log(`=======================================================\n`);
              return {
                success: true,
                method: 'SEND_API',
                methodTitle: 'Direct Messenger (POST_PURCHASE_UPDATE)',
                detail: 'បានផ្ញើសារវិក្កយបត្រចូលប្រអប់សារ Messenger ដោយជោគជ័យ (POST_PURCHASE_UPDATE)!',
                attemptLogs
              };
            } else if (taggedRes.error) {
              const tagErr = taggedRes.error.message || `Error code ${taggedRes.error.code}`;
              console.log(`   ↳ Tagged attempt response: ${tagErr}`);
              attemptLogs.push(`⚠️ វិធីទី ២ Tagged (POST_PURCHASE_UPDATE) មិនអាចផ្ញើបាន ៖ ${tagErr}`);
            }
          } catch (tagErr: any) {
            console.warn(`   ↳ Tagged dispatch exception:`, tagErr?.message);
          }
        } else {
          directInboxFailReason = lastApiError;
          attemptLogs.push(`⚠️ វិធីទី ២ (Direct Inbox) មិនអាចផ្ញើបាន ៖ ${lastApiError}`);
        }
      }
    } catch (m2Err: any) {
      lastApiError = m2Err?.message || 'Send API error';
      directInboxFailReason = lastApiError;
      console.log(`⚠️ [METHOD 2 EXCEPTION]: ${lastApiError}`);
      attemptLogs.push(`⚠️ វិធីទី ២ ជួបបញ្ហា ៖ ${lastApiError}`);
    }
  } else if (!isDelivered) {
    console.log(`ℹ️ [METHOD 2 SKIPPED]: No valid Facebook User PSID available.`);
    directInboxFailReason = 'មិនមាន Facebook User PSID របស់អតិថិជនឡើយ';
    attemptLogs.push(`ℹ️ វិធីទី ២ រំលង (មិនមាន User PSID)`);
  }

  // =====================================================================
  // Fallback: Smart Manual Fallback (100% Policy-Safe)
  // Clipboard copied + One-tap button to open customer Messenger thread
  // Zero risk of Meta page penalty or automated flag
  // =====================================================================
  let failureSummary = '';
  if (privateReplyFailReason && directInboxFailReason) {
    failureSummary = `វិធីទី ១ (Private Reply)៖ ${privateReplyFailReason} | វិធីទី ២ (Direct Inbox)៖ ${directInboxFailReason}`;
  } else if (privateReplyFailReason) {
    failureSummary = `វិធីទី ១ (Private Reply)៖ ${privateReplyFailReason}`;
  } else if (directInboxFailReason) {
    failureSummary = `វិធីទី ២ (Direct Inbox)៖ ${directInboxFailReason}`;
  } else if (lastApiError) {
    failureSummary = lastApiError;
  } else {
    failureSummary = 'Facebook 24h Window ឬកំហិតសិទ្ធិរបស់ Meta';
  }

  console.log(`ℹ️ [DISPATCH RESULT]: Automated Facebook API unavailable for this recipient: ${failureSummary}`);
  console.log(`=======================================================\n`);

  attemptLogs.push(`📋 ជម្រើសផ្ញើផ្ទាល់ ៖ បានចម្លងអត្ថបទវិក្កយបត្រ VIP ចូលក្នុងក្តារចុច (Clipboard) រួចរាល់ អាចចុច Paste ក្នុង Messenger បានភ្លាមៗ`);

  return {
    success: false,
    method: 'MANUAL_COPIED',
    methodTitle: 'ផ្ញើដោយផ្ទាល់ (ចម្លងរួចរាល់)',
    error: `Facebook API មិនទាន់អាចផ្ញើស្វ័យប្រវត្តិចូល Inbox បានទេ (${failureSummary}) ➔ អត្ថបទត្រូវបាន Copy រួចរាល់ សូមចុច "ឆាតផ្ទាល់" ដើម្បី Paste ផ្ញើជូនភ្ញៀវ!`,
    attemptLogs
  };
}


