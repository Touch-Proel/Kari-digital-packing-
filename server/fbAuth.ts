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
      return JSON.parse(text);
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
        message: netErr?.message || 'Network error connecting to Facebook API'
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
export async function fetchFacebookComments(targetPostId: string, pageAccessToken?: string, maxLimit = 5000) {
  const token = pageAccessToken || activeFacebookPage?.access_token;
  const isSimulatedTarget = !targetPostId || targetPostId.startsWith('LIVE_') || targetPostId.startsWith('sim_') || targetPostId.startsWith('POST_');

  if (!token || token.startsWith('simulated_') || isSimulatedTarget) {
    return { data: getSimulatedSampleComments(), isSimulated: true };
  }

  try {
    const cleanId = targetPostId.includes('_') ? targetPostId.split('_').pop() : targetPostId;
    const allComments: any[] = [];
    let nextUrl: string | null = `https://graph.facebook.com/v21.0/${cleanId}/comments?fields=from{id,name,picture},message,id,created_time&order=chronological&limit=100&access_token=${token}`;
    let pageCount = 0;
    const maxPages = Math.ceil(maxLimit / 100);

    while (nextUrl && pageCount < maxPages && allComments.length < maxLimit) {
      pageCount++;
      const data: any = await safeGraphApiFetch(nextUrl);

      if (data.error) {
        console.error(`Facebook Graph API error on page ${pageCount}:`, data.error);
        // If first page failed with error, return simulated fallback comments or error
        if (allComments.length === 0) {
          console.log(`[FB Sync Fallback]: Returning simulated live comments due to Graph API notice: ${data.error.message}`);
          return { data: getSimulatedSampleComments(), isSimulated: true, error: data.error.message };
        }
        break;
      }

      const items = data.data || [];
      if (items.length === 0) break;

      allComments.push(...items);
      console.log(`[FB Sync] Page ${pageCount}: fetched ${items.length} comments (Total: ${allComments.length})`);

      if (data.paging && data.paging.next) {
        nextUrl = data.paging.next;
      } else {
        nextUrl = null;
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

// Send Messenger Private Reply or Comment Reply with Dual-Layer Fallback & KHQR Image Attachment
export async function sendFacebookReply(
  commentId: string | null,
  userId: string | null,
  messageText: string,
  token?: string,
  imageUrl?: string,
  imageBuffer?: Buffer
): Promise<{ success: boolean; error?: string; method?: 'PRIVATE_REPLY' | 'SEND_API' | 'PUBLIC_COMMENT' | 'SIMULATED' }> {
  const activeToken = token || activeFacebookPage?.access_token;
  if (!activeToken || activeToken.startsWith('simulated_') || activeToken.length < 20) {
    console.log(`[VIP INVOICE NOTICE] No real Facebook Page Access Token configured. Message prepared for manual copy.`);
    return {
      success: false,
      error: 'មិនទាន់បានភ្ជាប់ Facebook Page Token (ឬ Token មិនត្រឹមត្រូវ) ➔ បានចម្លងអត្ថបទវិក្កយបត្ររួចរាល់ សូមចុច «ឆាតផ្ទាល់» ដើម្បីផ្ញើទៅកាន់ Messenger!'
    };
  }

  const cleanUid = String(userId || '').trim();
  const cleanCid = String(commentId || '').trim();
  const targetCidSuffix = cleanCid.includes('_') ? cleanCid.split('_').pop() || '' : '';
  const commentIdCandidates = Array.from(new Set([cleanCid, targetCidSuffix])).filter(
    c => c && !c.startsWith('sys_') && !c.startsWith('manual_') && c.length >= 6
  );

  console.log(`\n=======================================================`);
  console.log(`🚀 [VIP DISPATCH]: Sending VIP message & KHQR...`);
  console.log(`   ↳ User ID: ${cleanUid || 'None'} | Comment IDs: ${commentIdCandidates.join(', ') || 'None'}`);
  if (imageBuffer) console.log(`   ↳ Image Buffer Attachment: ${imageBuffer.length} bytes`);
  else if (imageUrl) console.log(`   ↳ Image URL Attachment: ${imageUrl}`);

  let lastApiError = '';

  // Helper to send image attachment via Send API
  const sendImageAttachment = async (recipientId: string) => {
    if (!recipientId || recipientId === 'None' || recipientId.startsWith('FB_USER_ID')) return;
    try {
      if (imageBuffer && imageBuffer.length > 0) {
        // Direct multipart upload (does NOT require Facebook to crawl external URL)
        const form = new FormData();
        form.append('recipient', JSON.stringify({ id: recipientId }));
        form.append('message', JSON.stringify({
          attachment: {
            type: 'image',
            payload: { is_reusable: true }
          }
        }));
        form.append('messaging_type', 'RESPONSE');
        const blob = new Blob([imageBuffer], { type: 'image/png' });
        form.append('filedata', blob, 'bakong_khqr.png');

        const imgData = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${activeToken}`, {
          method: 'POST',
          body: form
        });
        if (imgData.message_id || imgData.recipient_id) {
          console.log(`📸 [KHQR IMAGE BINARY SENT]: Successfully uploaded & delivered KHQR image to (${recipientId})!`);
        } else {
          console.warn(`[KHQR IMAGE UPLOAD RESPONSE]:`, imgData);
        }
      } else if (imageUrl) {
        await safeGraphApiFetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${activeToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: {
              attachment: {
                type: 'image',
                payload: {
                  url: imageUrl,
                  is_reusable: true
                }
              }
            },
            messaging_type: 'RESPONSE'
          })
        });
        console.log(`📸 [KHQR IMAGE SENT]: Successfully attached KHQR image to User ID (${recipientId})`);
      }
    } catch (imgErr) {
      console.warn(`[KHQR IMAGE ATTACH NOTE]:`, imgErr);
    }
  };

  // ---------------------------------------------------------------------
  // Layer 1 (PRIORITY FOR LIVE ORDERS): Private Reply by Comment ID
  // 💡 Private Replies API is exempt from the 24-hour messaging window rule!
  // ---------------------------------------------------------------------
  for (const cid of commentIdCandidates) {
    try {
      const data = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${activeToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { comment_id: cid },
          message: { text: messageText }
        })
      });
      if (data.message_id || data.recipient_id) {
        console.log(`🎉 [PRIVATE REPLY SUCCESS]: Sent VIP message via Comment ID (${cid}) - 24h Window Bypassed!`);
        const targetRecipient = data.recipient_id || cleanUid;
        if (targetRecipient && (imageUrl || imageBuffer)) {
          await sendImageAttachment(targetRecipient);
        }
        console.log(`=======================================================\n`);
        return { success: true, method: 'PRIVATE_REPLY' };
      } else if (data.error) {
        lastApiError = data.error.message || `Error code ${data.error.code}`;
        console.log(`🔄 [PRIVATE REPLY NOTE]: Comment (${cid}) reply responded with: ${lastApiError}`);
      }
    } catch (e: any) {
      lastApiError = e?.message || 'Network error';
      console.warn(`[PRIVATE REPLY NOTE]: ${lastApiError}`);
    }
  }

  // ---------------------------------------------------------------------
  // Layer 2: Send API via User ID (Standard Response & Message Tag Fallback)
  // ---------------------------------------------------------------------
  if (cleanUid && !['FB_USER_ID_STREAM', 'MANUAL_USER_ID', 'NONE', 'None', '', 'null', 'undefined'].includes(cleanUid)) {
    // 1. Try standard RESPONSE first (compliant with Graph API v21+)
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
        console.log(`📩 [SEND API SUCCESS]: Sent VIP message to User ID (${cleanUid})`);
        if (imageUrl || imageBuffer) {
          await sendImageAttachment(cleanUid);
        }
        console.log(`=======================================================\n`);
        return { success: true, method: 'SEND_API' };
      } else if (data.error) {
        lastApiError = data.error.message || `Error code ${data.error.code}`;
      }
    } catch (e: any) {
      lastApiError = e?.message || 'Send API error';
    }

    // 2. Try with CONFIRMED_EVENT_UPDATE if supported
    try {
      const dataTagged = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${activeToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: cleanUid },
          message: { text: messageText },
          messaging_type: 'MESSAGE_TAG',
          tag: 'CONFIRMED_EVENT_UPDATE'
        })
      });
      if (dataTagged.message_id) {
        console.log(`📩 [SEND API TAGGED SUCCESS]: Sent VIP invoice to User ID (${cleanUid}) via CONFIRMED_EVENT_UPDATE`);
        if (imageUrl || imageBuffer) {
          await sendImageAttachment(cleanUid);
        }
        console.log(`=======================================================\n`);
        return { success: true, method: 'SEND_API' };
      } else if (dataTagged.error && dataTagged.error.error_subcode !== 1893061) {
        lastApiError = dataTagged.error.message || `Error code ${dataTagged.error.code}`;
      }
    } catch (tagErr: any) {
      // Ignore tag deprecation errors
    }
  }

  // ---------------------------------------------------------------------
  // Layer 3: Fallback to Public Comment Reply if Private Reply was blocked
  // ---------------------------------------------------------------------
  for (const cid of commentIdCandidates) {
    try {
      const pubData = await safeGraphApiFetch(`https://graph.facebook.com/v21.0/${cid}/comments?access_token=${activeToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText })
      });
      if (pubData.id) {
        console.log(`💬 [PUBLIC COMMENT SUCCESS]: Posted VIP reply on Comment ID (${cid})`);
        console.log(`=======================================================\n`);
        return { success: true, method: 'PUBLIC_COMMENT' };
      } else if (pubData.error) {
        lastApiError = pubData.error.message || `Error code ${pubData.error.code}`;
      }
    } catch (pubErr: any) {
      console.warn(`[PUBLIC COMMENT ERROR]:`, pubErr);
    }
  }

  const reasonDetail = lastApiError ? ` (${lastApiError})` : '';
  console.log(`ℹ️ [DISPATCH RESULT]: Direct automated delivery unavailable for this specific recipient: ${lastApiError || 'Facebook 24h Window / permissions restriction'}`);
  console.log(`=======================================================\n`);
  return {
    success: false,
    error: `Facebook API មិនទាន់អាចផ្ញើសារស្វ័យប្រវត្តិចូល Inbox បានទេ${reasonDetail} ➔ អត្ថបទត្រូវបាន Copy រួចរាល់ សូមចុច "ឆាតផ្ទាល់" ដើម្បី Paste ផ្ញើជូនភ្ញៀវ!`
  };
}


