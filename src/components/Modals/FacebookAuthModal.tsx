import { useState, useEffect } from 'react';
import { FacebookPage, FacebookPost } from '../../types';
import { playSuccessFanfare, playWarningBuzzer } from '../../utils/audio';

interface FacebookAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePage: FacebookPage | null;
  onPageSelected: (page: FacebookPage) => void;
  activeLiveId: string;
  onSelectLiveId: (liveId: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  onSyncSuccess?: (liveId: string, ordersCount: number, basketsCount: number) => void;
}

export function FacebookAuthModal({
  isOpen,
  onClose,
  activePage,
  onPageSelected,
  activeLiveId,
  onSelectLiveId,
  onShowToast,
  onSyncSuccess
}: FacebookAuthModalProps) {
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [syncingComments, setSyncingComments] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualPageName, setManualPageName] = useState('');
  const [customPostId, setCustomPostId] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCallbackUrl(`${window.location.origin}/auth/callback`);
    }
  }, []);

  // Fetch status and pages when modal opens
  const fetchFbStatus = async () => {
    try {
      const res = await fetch('/api/fb/status');
      if (res.ok) {
        const data = await res.json();
        setPages(data.pages || []);
        if (data.activePage) {
          onPageSelected(data.activePage);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPosts = async () => {
    setLoadingPosts(true);
    try {
      const res = await fetch(`/api/fb/page_posts${activePage?.id ? `?page_id=${activePage.id}` : ''}`);
      if (res.ok) {
        const list = await res.json();
        setPosts(list);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPosts(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFbStatus();
      fetchPosts();
    }
  }, [isOpen, activePage?.id]);

  // Listen for OAuth success message from popup window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        playSuccessFanfare();
        onShowToast('✨ បានភ្ជាប់ Facebook OAuth ជោគជ័យ!');
        fetchFbStatus();
        fetchPosts();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!isOpen) return null;

  // Open Facebook OAuth Popup
  const handleConnectFacebook = async () => {
    try {
      onShowToast('⏳ កំពុងទាញយក OAuth URL...');
      const res = await fetch('/api/auth/facebook/url');
      if (!res.ok) throw new Error('Failed to get auth URL');
      const { url } = await res.json();

      const popup = window.open(
        url,
        'fb_oauth_popup',
        'width=600,height=720,menubar=no,status=no'
      );

      if (!popup) {
        alert('សូមអនុញ្ញាតបើក Pop-up លើកម្មវិធីរុករក (Browser) របស់អ្នកដើម្បីចូលគណនី Facebook!');
      }
    } catch (err: any) {
      playWarningBuzzer();
      onShowToast(err.message || 'Error opening Facebook login', 'error');
    }
  };

  const handleSelectPage = async (pageId: string) => {
    try {
      const res = await fetch('/api/fb/page/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: pageId })
      });
      const data = await res.json();
      if (data.success && data.activePage) {
        onPageSelected(data.activePage);
        onShowToast(`✅ បានជ្រើសរើសទំព័រ៖ ${data.activePage.name}`);
        fetchPosts();
      }
    } catch (e) {
      onShowToast('Error selecting page', 'error');
    }
  };

  const handleManualConnect = async () => {
    if (!manualToken.trim()) {
      alert('សូមបញ្ចូល Page Access Token!');
      return;
    }
    try {
      const res = await fetch('/api/fb/manual_connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_name: manualPageName.trim() || undefined,
          access_token: manualToken.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        onPageSelected(data.activePage);
        onShowToast(`✅ បានភ្ជាប់ទំព័រ ${data.activePage.name} (ID: ${data.activePage.id}) ដោយជោគជ័យ!`);
        setShowManualForm(false);
        fetchFbStatus();
        fetchPosts();
      } else {
        onShowToast(data.error || 'Invalid token', 'error');
      }
    } catch (e) {
      onShowToast('Error connecting token', 'error');
    }
  };

  const handleSelectLive = async (liveId: string) => {
    onSelectLiveId(liveId);
    try {
      await fetch('/api/fb/active_live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_id: liveId })
      });
    } catch (e) {
      console.warn('Set active live warning:', e);
    }
    onShowToast(`🎥 បានជ្រើសរើសវគ្គ Live៖ ${liveId.slice(-8)}`);
  };

  const handleApplyCustomId = () => {
    if (!customPostId.trim()) return;
    let clean = customPostId.trim();
    // Parse URL if pasted
    const match = clean.match(/(?:videos\/|watch\/\?v=|reel\/|posts\/)?(\d{10,})/);
    if (match && match[1]) {
      clean = match[1];
    }
    handleSelectLive(clean);
    setCustomPostId('');
  };

  const handleSyncComments = async () => {
    setSyncingComments(true);
    const displayLiveId = activeLiveId.length > 12 ? activeLiveId.slice(-8) : activeLiveId;
    onShowToast(`🔄 កំពុងទាញយកខំមិនពី Live #${displayLiveId}...`);
    try {
      const res = await fetch('/api/fb/sync_comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: activeLiveId })
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = { success: false, error: 'ការឆ្លើយតបពីម៉ាស៊ីនបម្រើមិនត្រឹមត្រូវ' };
      }
      if (data.success) {
        playSuccessFanfare();
        const targetId = data.target_live_id || activeLiveId;
        onSelectLiveId(targetId);
        onShowToast(`🎉 បានទាញយកខំមិន ${data.total_synced} ជួរ និងបង្កើតបាន ${data.total_baskets || 0} កន្ត្រកដោយជោគជ័យ!`);
        if (onSyncSuccess) {
          onSyncSuccess(targetId, data.total_orders || 0, data.total_baskets || 0);
        }
      } else {
        onShowToast(data.error || 'មិនអាចទាញយកខំមិនបានឡើយ', 'error');
      }
    } catch (e: any) {
      onShowToast(e?.message || 'Network error while syncing comments', 'error');
    } finally {
      setSyncingComments(false);
    }
  };

  const formatPostTime = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
      const d = new Date(timeStr);
      return d.toLocaleDateString('km-KH', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return timeStr.slice(0, 16);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0B1426] border-[1.5px] border-sky-500 rounded-2xl w-full max-w-[480px] max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-3.5 bg-gradient-to-r from-blue-950 to-[#0F2442] border-b-[1.5px] border-sky-500 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔵</span>
            <div>
              <div className="font-black text-sky-300 text-[14.5px]">គ្រប់គ្រង FACEBOOK PAGES & LIVE STREAM</div>
              <div className="text-[11px] text-sky-400 font-semibold tracking-wider">
                OAUTH & PAGE ACCESS FOR LIVE ORDERS
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-3.5 overflow-y-auto flex flex-col gap-3 bg-[#070D1B] max-h-[78vh]">
          {/* Active Connected Page Pill */}
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 flex flex-col gap-2">
            <div className="text-xs text-slate-400 font-bold flex justify-between items-center">
              <span>ទំព័រ FACEBOOK PAGE សកម្ម ៖</span>
              <span className="text-emerald-400 text-[11px] font-mono font-black flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> បានភ្ជាប់
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-black text-sm">{activePage?.name || 'Kari Arnett'}</div>
                <div className="text-sky-400 font-mono text-xs font-bold">ID: {activePage?.id || '102094263212256'}</div>
              </div>
              <button
                onClick={handleConnectFacebook}
                className="bg-[#1877F2] hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95"
              >
                <span>🌐 Login FB</span>
              </button>
            </div>
          </div>

          {/* Connected Pages Selection if multiple */}
          {pages.length > 1 && (
            <div>
              <label className="text-xs text-slate-400 font-bold block mb-1">ជ្រើសរើសទំព័រ Facebook ផ្សេងទៀត ៖</label>
              <select
                value={activePage?.id || ''}
                onChange={e => handleSelectPage(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-sky-300 font-bold rounded-xl px-3 py-2 text-xs outline-none"
              >
                {pages.map((p, pIdx) => (
                  <option key={p.id ? `fb-page-${p.id}` : `fb-page-${pIdx}`} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Live Streams and Posts Selector */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-300 font-black flex items-center gap-1.5">
                <span>🎥</span> វីដេអូផ្សាយផ្ទាល់ & Posts ({posts.length})
              </span>
              <button
                onClick={fetchPosts}
                disabled={loadingPosts}
                className="text-[11px] text-sky-400 hover:underline font-bold flex items-center gap-1"
              >
                <span className={loadingPosts ? 'animate-spin' : ''}>🔄</span>
                {loadingPosts ? 'កំពុងទាញ...' : 'Refresh'}
              </button>
            </div>

            {/* List of fetched live streams and posts */}
            {loadingPosts ? (
              <div className="p-6 text-center text-xs text-sky-300 flex flex-col items-center justify-center gap-2">
                <span className="animate-spin text-xl">⏳</span>
                <span>កំពុងទាញយក Live Streams & Posts ពី Facebook...</span>
              </div>
            ) : posts.length === 0 ? (
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 text-center text-xs text-slate-400 flex flex-col gap-2">
                <div>មិនទាន់មានវីដេអូ ឬ Posts ក្នុងទំព័រនេះទេ</div>
                <button
                  onClick={fetchPosts}
                  className="bg-slate-800 text-sky-300 px-3 py-1 rounded-lg text-[11px] font-bold self-center"
                >
                  🔄 ព្យាយាមទាញឡើងវិញ
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scroll">
                {posts.map((p, pIdx) => {
                  const isSelected = p.id === activeLiveId;
                  const isLive = p.is_live;
                  return (
                    <div
                      key={p.id ? `fb-post-${p.id}` : `fb-post-idx-${pIdx}`}
                      onClick={() => handleSelectLive(p.id)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex flex-col gap-1.5 relative ${
                        isSelected
                          ? 'bg-sky-950/60 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.35)]'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex justify-between items-center gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isLive ? (
                            <span className="bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                              ● LIVE NOW
                            </span>
                          ) : p.live_status === 'VOD' ? (
                            <span className="bg-amber-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1">
                              📼 LIVE VOD
                            </span>
                          ) : (
                            <span className="bg-slate-700 text-slate-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                              📝 POST
                            </span>
                          )}
                          <span className="font-mono font-bold text-sky-400 text-[11px]">
                            ID: {p.id.length > 20 ? p.id.split('_').pop() : p.id}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {isSelected && (
                            <span className="text-emerald-400 font-bold text-[10px] bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                              ✓ ជ្រើសរើស
                            </span>
                          )}
                          {p.permalink_url && (
                            <a
                              href={p.permalink_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-sky-400 hover:text-sky-200 bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-800/40"
                              title="មើលលើ Facebook"
                            >
                              ↗ FB
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="text-slate-100 font-medium line-clamp-2 leading-relaxed text-[11.5px]">
                        {p.message}
                      </div>

                      <div className="text-[10px] text-slate-400 flex justify-between items-center">
                        <span>{formatPostTime(p.created_time)}</span>
                        <span className="text-cyan-400/80 font-mono text-[9px] truncate max-w-[120px]">
                          {p.id}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Direct Custom Post/Live ID Input */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
              <div className="text-[11px] text-slate-300 font-bold flex items-center justify-between">
                <span>🎯 បញ្ចូល Live ID ឬ Link វីដេអូដោយផ្ទាល់ ៖</span>
                <span className="text-[10px] text-slate-400 font-mono">ID: {activeLiveId.slice(-8)}</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={customPostId}
                  onChange={e => setCustomPostId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleApplyCustomId()}
                  placeholder="e.g. 1613298173588634 ឬ link វីដេអូ"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-sky-300 font-mono outline-none focus:border-cyan-400 placeholder:text-slate-600"
                />
                <button
                  onClick={handleApplyCustomId}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-3 py-1.5 rounded-lg text-xs active:scale-95 whitespace-nowrap shadow"
                >
                  កំណត់
                </button>
              </div>
            </div>

            {/* Sync Comments Trigger */}
            <button
              onClick={handleSyncComments}
              disabled={syncingComments}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg active:scale-98"
            >
              <span>{syncingComments ? '⏳ កំពុងទាញយក...' : `🔄 ទាញយក Comment ទាំងអស់ពី Live #${activeLiveId.slice(-8)}`}</span>
            </button>
          </div>

          {/* Toggle Manual Access Token Form */}
          <div className="border-t border-slate-800 pt-2 flex flex-col gap-2">
            <button
              onClick={() => setShowManualForm(!showManualForm)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center justify-between font-bold"
            >
              <span>⚙️ ជម្រើសកំណត់ដោយដៃ (Page Access Token / App Settings)</span>
              <span>{showManualForm ? '▲' : '▼'}</span>
            </button>

            {showManualForm && (
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 flex flex-col gap-2.5">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-0.5">ឈ្មោះ Facebook Page ៖</label>
                  <input
                    type="text"
                    value={manualPageName}
                    onChange={e => setManualPageName(e.target.value)}
                    placeholder="e.g. Kari Arnett"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-0.5">Page Access Token (EAAR...) ៖</label>
                  <textarea
                    rows={2}
                    value={manualToken}
                    onChange={e => setManualToken(e.target.value)}
                    placeholder="Paste Page Access Token from Graph API Explorer..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-sky-300 font-mono outline-none focus:border-cyan-400"
                  />
                </div>
                <button
                  onClick={handleManualConnect}
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow"
                >
                  💾 រក្សាទុក & ភ្ជាប់ Token នេះ
                </button>
              </div>
            )}
          </div>

          {/* OAuth Callback Info box for Facebook Dev Console */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1 text-[11px] text-slate-400">
            <div className="font-bold text-slate-300">📋 Facebook App OAuth Valid Redirect URI ៖</div>
            <code className="bg-slate-900 text-sky-400 p-1.5 rounded font-mono break-all text-[10px] select-all">
              {callbackUrl}
            </code>
            <div className="text-[10px] text-slate-500">
              បន្ថែម URL នេះទៅក្នុង Facebook Login Settings ក្នុង Meta Developer Portal។
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
