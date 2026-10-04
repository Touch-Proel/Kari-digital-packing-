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
  onOpenNoBasketModal?: () => void;
}

export function FacebookAuthModal({
  isOpen,
  onClose,
  activePage,
  onPageSelected,
  activeLiveId,
  onSelectLiveId,
  onShowToast,
  onSyncSuccess,
  onOpenNoBasketModal
}: FacebookAuthModalProps) {
  const isHttpInsecure = typeof window !== 'undefined' && window.location.protocol === 'http:' && window.location.hostname !== 'localhost';
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [syncingComments, setSyncingComments] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualPageName, setManualPageName] = useState('');
  const [customPostId, setCustomPostId] = useState('');
  const [showManualForm, setShowManualForm] = useState(() => isHttpInsecure);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [isRefreshingPages, setIsRefreshingPages] = useState(false);

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
        setPosts(Array.isArray(list) ? list : []);
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
    if (isHttpInsecure) {
      setShowManualForm(true);
      onShowToast('⚠️ Facebook ប្លុក Pop-up លើ HTTP IP! សូមប្រើប្រាស់ប្រអប់ Page Access Token ខាងក្រោម។', 'error');
      return;
    }
    try {
      onShowToast('⏳ កំពុងទាញយក OAuth URL...');
      const clientRedirectUri = `${window.location.origin}/auth/callback`;
      const res = await fetch(`/api/auth/facebook/url?redirect_uri=${encodeURIComponent(clientRedirectUri)}`);
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

  const handleDeletePage = async (pageId: string, pageName: string) => {
    if (!window.confirm(`តើបងពិតជាចង់ផ្តាច់ទំព័រ «${pageName}» ចេញពីប្រព័ន្ធមែនទេ?`)) return;
    try {
      const res = await fetch(`/api/fb/page/${pageId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setPages(data.pages || []);
        if (data.activePage) {
          onPageSelected(data.activePage);
        }
        onShowToast(`🗑️ បានផ្តាច់ទំព័រ ${pageName} រួចរាល់!`, 'success');
        fetchPosts();
      }
    } catch {
      onShowToast('Error removing page', 'error');
    }
  };

  const handleRefreshPages = async () => {
    setIsRefreshingPages(true);
    onShowToast('⏳ កំពុងទាញយកបញ្ជី Facebook Pages ទាំងអស់...');
    try {
      const res = await fetch('/api/fb/refresh_pages', { method: 'POST' });
      const data = await res.json();
      if (data.success && Array.isArray(data.pages) && data.pages.length > 0) {
        setPages(data.pages);
        if (data.activePage) {
          onPageSelected(data.activePage);
        }
        playSuccessFanfare();
        onShowToast(`🎉 បានទាញយកទំព័រ Facebook សរុប ${data.pages.length} ដោយជោគជ័យ!`);
        fetchPosts();
      } else {
        await fetchFbStatus();
        onShowToast('✅ បានធ្វើបច្ចុប្បន្នភាពបញ្ជីទំព័រ Facebook រួចរាល់');
      }
    } catch {
      await fetchFbStatus();
    } finally {
      setIsRefreshingPages(false);
    }
  };

  const handleManualConnect = async () => {
    if (!manualToken.trim()) {
      alert('សូមបញ្ចូល Page Access Token ឬបញ្ជី Tokens!');
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
        if (data.pages && Array.isArray(data.pages)) {
          setPages(data.pages);
        }
        if (data.activePage) {
          onPageSelected(data.activePage);
        }
        const count = data.imported_count || data.pages?.length || 1;
        playSuccessFanfare();
        onShowToast(`🎉 បានភ្ជាប់ & នាំចូល Facebook Pages សរុប ${count} ដោយជោគជ័យ!`);
        setShowManualForm(false);
        setManualToken('');
        setManualPageName('');
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
    onShowToast(`🎥 បានជ្រើសរើស Live #${liveId} រួចរាល់!`);
    if (onSyncSuccess) {
      onSyncSuccess(liveId, 0, 0);
    }
  };

  const handleApplyCustomId = () => {
    if (!customPostId.trim()) return;
    let clean = customPostId.trim();
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
    onShowToast(`🔄 កំពុងទាញយកខំមិនទាំងអស់ (Full Sync) ពី Live #${displayLiveId}...`);
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
        onShowToast(`🎉 បានទាញយកខំមិនសរុប ${data.total_synced} និងបង្កើតបាន ${data.total_baskets || 0} កន្ត្រកដោយជោគជ័យ!`);
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

  const selectedPost = posts.find(p => p.id === activeLiveId || (p.id && activeLiveId && (p.id.endsWith(activeLiveId) || activeLiveId.endsWith(p.id))));

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#081226] border border-cyan-500/40 rounded-3xl w-full max-w-[500px] max-h-[94vh] flex flex-col overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
        
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-[#071938] via-[#0A2654] to-[#0A1830] border-b border-cyan-500/30 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#1877F2] to-cyan-400 p-0.5 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <div className="w-full h-full bg-[#07132B] rounded-[14px] flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
            </div>
            <div>
              <div className="font-black text-white text-[15px] tracking-tight">
                គ្រប់គ្រង FACEBOOK LIVE & POSTS
              </div>
              <div className="text-[11px] text-cyan-300 font-semibold tracking-wider">
                OAUTH & REAL-TIME LIVE ORDER SYNC
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-bold flex items-center justify-center transition-all border border-slate-700 active:scale-95"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex flex-col gap-3.5 bg-[#050C1C] max-h-[80vh] custom-scroll">
          
          {/* Insecure HTTP Warning Banner */}
          {isHttpInsecure && (
            <div className="bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/70 border border-amber-500/60 rounded-2xl p-3 text-xs text-amber-200 flex flex-col gap-1.5 shadow-md">
              <div className="font-black text-amber-300 flex items-center gap-1.5 text-xs">
                <span className="text-base">⚠️</span>
                <span>មូលហេតុដែល Facebook ចេញ «Insecure Login Blocked»</span>
              </div>
              <p className="text-[11.5px] text-slate-300 leading-relaxed">
                ដោយសារបងកំពុងប្រើប្រាស់តាម <strong>HTTP IP ({window?.location?.hostname})</strong> គ្មាន SSL (HTTPS) នោះ Facebook នឹងបិទមិនឱ្យប្រើប៊ូតុង Pop-up «ចូលគណនី FB» ឡើយ។
              </p>
              <div className="bg-slate-950/80 p-2 rounded-xl border border-amber-500/30 text-[11px] text-amber-300 font-bold flex items-center gap-1.5 mt-0.5">
                <span>👉</span>
                <span>ដំណោះស្រាយ ៖ សូមប្រើប្រាស់ប្រអប់ «Page Access Token» ខាងក្រោមនេះដើម្បីភ្ជាប់ភ្លាមៗ!</span>
              </div>
            </div>
          )}

          {/* Multi-Page Management Section */}
          <div className="bg-gradient-to-r from-slate-900/95 via-[#0A1A36] to-slate-900/95 border border-cyan-500/40 rounded-2xl p-3.5 flex flex-col gap-3 shadow-lg">
            <div className="text-xs text-slate-300 font-bold flex justify-between items-center flex-wrap gap-1.5">
              <span className="flex items-center gap-1.5">
                <span className="text-sm">🌐</span> គ្រប់គ្រងទំព័រ FACEBOOK PAGES ({pages.length > 0 ? pages.length : 1})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRefreshPages}
                  disabled={isRefreshingPages}
                  className="bg-slate-800 hover:bg-slate-700 text-teal-300 px-2 py-1 rounded-lg text-[10.5px] font-bold border border-slate-700 transition-all flex items-center gap-1 active:scale-95 disabled:opacity-60"
                  title="ទាញយកបញ្ជី Facebook Pages ទាំងអស់ពីគណនីឡើងវិញ"
                >
                  <span className={isRefreshingPages ? 'animate-spin' : ''}>🔄</span>
                  <span>{isRefreshingPages ? 'កំពុងទាញ...' : 'Refresh'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualForm(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-cyan-300 px-2 py-1 rounded-lg text-[10.5px] font-bold border border-slate-700 transition-all flex items-center gap-1 active:scale-95"
                >
                  <span>➕ បន្ថែម / Import</span>
                </button>
                <button
                  type="button"
                  onClick={handleConnectFacebook}
                  className="bg-gradient-to-r from-[#1877F2] to-[#0A60D4] hover:from-blue-600 hover:to-blue-700 text-white px-2.5 py-1 rounded-lg text-[10.5px] font-black flex items-center gap-1 shadow transition-all active:scale-95 border border-blue-400/30"
                >
                  <span>⚡ ចូល FB</span>
                </button>
              </div>
            </div>

            {/* List of Connected Pages */}
            <div className="flex flex-col gap-2">
              {(pages.length > 0 ? pages : (activePage ? [activePage] : [])).map((p, pIdx) => {
                const isActive = activePage?.id === p.id;
                return (
                  <div
                    key={p.id ? `connected-page-${p.id}` : `connected-page-idx-${pIdx}`}
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2.5 transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-[#0C2752] to-[#0E356E] border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 p-0.5 flex-shrink-0">
                        {p.picture?.data?.url ? (
                          <img src={p.picture.data.url} alt="page" className="w-full h-full object-cover rounded-[6px]" />
                        ) : (
                          <div className="w-full h-full bg-slate-900 rounded-[6px] flex items-center justify-center text-[10px] font-black text-cyan-300">
                            FB
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-white font-black text-xs truncate flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {isActive && (
                            <span className="text-[9.5px] text-emerald-400 font-mono bg-emerald-950/90 border border-emerald-500/40 px-1.5 py-0.2 rounded-full flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> សកម្ម
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400 font-mono text-[10.5px] truncate">
                          ID: {p.id}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!isActive ? (
                        <button
                          type="button"
                          onClick={() => handleSelectPage(p.id)}
                          className="bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 px-2.5 py-1 rounded-lg text-[10.5px] font-bold border border-cyan-600/50 transition-all active:scale-95"
                        >
                          🔄 ប្តូរមកផេកនេះ
                        </button>
                      ) : (
                        <span className="text-cyan-400 font-bold text-[10.5px] px-2 py-0.5">
                          ✓ កំពុងប្រើ
                        </span>
                      )}
                      {pages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeletePage(p.id, p.name)}
                          className="text-slate-500 hover:text-rose-400 p-1 rounded-lg hover:bg-rose-950/40 transition-colors"
                          title="ផ្តាច់ទំព័រនេះ"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-[10px] text-cyan-300/80 bg-cyan-950/40 p-2 rounded-xl border border-cyan-500/20 leading-relaxed">
              💡 <strong>Multi-Page Support ៖</strong> បងអាចភ្ជាប់ផេកច្រើនក្នុងពេលតែមួយ។ រាល់ពេលប្តូរផេក ការទាញយក Live, ខំមិន, Chatbot និងការចាប់ Slip នឹងរត់តាមផេកសកម្មដោយស្វ័យប្រវត្តិ!
            </div>
          </div>

          {/* Live Streams Section (10 Latest Live Streams) */}
          <div className="bg-[#08152E]/90 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-3 shadow-md">
            
            {/* Header & Refresh */}
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs text-white font-black flex items-center gap-1.5">
                <span>🎥</span> វីដេអូផ្សាយផ្ទាល់ Live Stream ({posts.length})
              </span>
              
              <button
                onClick={fetchPosts}
                disabled={loadingPosts}
                className="text-[11px] bg-slate-900 hover:bg-slate-800 text-cyan-300 px-2.5 py-1 rounded-lg border border-slate-700/80 font-bold flex items-center gap-1 transition-all active:scale-95"
                title="ទាញយកបញ្ជី Live ឡើងវិញ"
              >
                <span className={loadingPosts ? 'animate-spin' : ''}>🔄</span>
                <span>{loadingPosts ? 'កំពុងទាញ...' : 'Refresh'}</span>
              </button>
            </div>

            {/* List of fetched 10 live streams */}
            {loadingPosts ? (
              <div className="py-10 text-center text-xs text-cyan-300 flex flex-col items-center justify-center gap-2.5">
                <div className="w-7 h-7 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="font-semibold">កំពុងទាញយក Live Streams ពី Facebook...</span>
              </div>
            ) : posts.length === 0 ? (
              <div className="p-5 bg-slate-950/60 rounded-2xl border border-slate-800 text-center text-xs text-slate-400 flex flex-col gap-2">
                <div>មិនទាន់មានវីដេអូ Live ក្នុងទំព័រនេះទេ</div>
                <button
                  onClick={fetchPosts}
                  className="bg-slate-800 hover:bg-slate-700 text-cyan-300 px-3 py-1 rounded-lg text-[11px] font-bold self-center transition-all"
                >
                  🔄 ព្យាយាមទាញឡើងវិញ
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[280px] overflow-y-auto pr-1 custom-scroll">
                {posts.map((p, pIdx) => {
                  const isSelected = p.id === activeLiveId || (p.id && activeLiveId && (p.id.endsWith(activeLiveId) || activeLiveId.endsWith(p.id)));
                  const isLive = p.is_live;
                  const commentsCount = typeof p.comments_count === 'number' ? p.comments_count : 0;
                  const reactionsCount = typeof p.reactions_count === 'number' ? p.reactions_count : 0;
                  const displayId = p.id.length > 20 ? p.id.split('_').pop() || p.id : p.id;

                  return (
                    <div
                      key={p.id ? `fb-post-${p.id}` : `fb-post-idx-${pIdx}`}
                      onClick={() => handleSelectLive(p.id)}
                      className={`p-3 rounded-2xl border text-xs cursor-pointer transition-all flex flex-col gap-2 relative ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#0B254E] via-[#0E3166] to-[#0B254E] border-cyan-400 shadow-[0_0_18px_rgba(6,182,212,0.4)] ring-1 ring-cyan-400/50'
                          : 'bg-[#060E20]/90 border-slate-800 hover:border-slate-700 hover:bg-[#0A1630]'
                      }`}
                    >
                      {/* Top Meta Line: Badge + ID + Actions */}
                      <div className="flex justify-between items-center gap-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isLive ? (
                            <span className="bg-gradient-to-r from-rose-600 to-red-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-md shadow-rose-600/30 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span> កំពុង LIVE
                            </span>
                          ) : (
                            <span className="bg-gradient-to-r from-amber-600/90 to-amber-700/90 border border-amber-400/40 text-amber-100 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              <span>📼</span> វីដេអូឡាយ (បានចប់)
                            </span>
                          )}
                          <span className="font-mono font-bold text-sky-300 text-[11px]">
                            ID: {displayId}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isSelected && (
                            <span className="text-emerald-300 font-extrabold text-[10px] bg-emerald-950/90 border border-emerald-400/60 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                              <span>✓</span> ជ្រើសរើស
                            </span>
                          )}
                          {p.permalink_url && (
                            <a
                              href={p.permalink_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-[10.5px] text-cyan-400 hover:text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/60 px-2 py-0.5 rounded-lg border border-cyan-700/50 flex items-center gap-0.5 font-bold transition-all"
                              title="បើកមើលលើ Facebook"
                            >
                              <span>↗ FB</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Video Title / Post Content */}
                      <div className="text-slate-100 font-medium line-clamp-2 leading-snug text-[12px]">
                        {p.message}
                      </div>

                      {/* Bottom Stat Highlights: Total Comments, Reactions, Time */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5 flex-wrap">
                        
                        {/* Highlights Pill Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Total Comments Badge */}
                          <div
                            className={`px-2.5 py-0.5 rounded-lg font-black text-[11px] flex items-center gap-1 shadow-sm ${
                              commentsCount > 0
                                ? 'bg-gradient-to-r from-cyan-950 via-teal-950 to-cyan-950 border border-cyan-400/60 text-cyan-300'
                                : 'bg-slate-900 border border-slate-800 text-slate-400'
                            }`}
                          >
                            <span className="text-[11px]">💬</span>
                            <span className="font-mono font-black">{commentsCount.toLocaleString()}</span>
                            <span className="text-[9.5px] font-semibold opacity-80">ខំមិន</span>
                          </div>

                          {/* Reactions Badge */}
                          {reactionsCount > 0 && (
                            <div className="bg-slate-900/90 border border-slate-800 text-slate-300 px-2 py-0.5 rounded-lg text-[10.5px] font-mono flex items-center gap-1">
                              <span>👍</span>
                              <span>{reactionsCount.toLocaleString()}</span>
                            </div>
                          )}

                          {/* Views Badge */}
                          {typeof p.views_count === 'number' && p.views_count > 0 && (
                            <div className="bg-slate-900/90 border border-slate-800 text-slate-300 px-2 py-0.5 rounded-lg text-[10.5px] font-mono flex items-center gap-1">
                              <span>👁️</span>
                              <span>{p.views_count.toLocaleString()}</span>
                            </div>
                          )}
                        </div>

                        {/* Date Time */}
                        <div className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-auto">
                          📅 {formatPostTime(p.created_time)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Direct Custom Post/Live ID Input - Clean & Spacious Layout */}
            <div className="bg-gradient-to-b from-[#09152C] to-[#060E1E] border border-cyan-500/30 rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <span className="text-sm">🎯</span> បញ្ចូល ID ឬ Link Live ដោយដៃ ៖
                </span>
                <div className="flex items-center gap-1 self-start sm:self-auto bg-cyan-950/90 border border-cyan-500/40 px-2.5 py-0.5 rounded-lg text-[11px] font-mono text-cyan-300 font-bold max-w-full">
                  <span className="text-slate-400 font-sans text-[10px]">Live សកម្ម:</span>
                  <span className="truncate max-w-[150px]">#{activeLiveId.includes('_') ? activeLiveId.split('_').pop() : activeLiveId}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={customPostId}
                    onChange={e => setCustomPostId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleApplyCustomId()}
                    placeholder="បិទភ្ជាប់ (Paste) ID ឬ Link វីដេអូ Facebook..."
                    className="w-full bg-[#030914] border border-slate-700/90 focus:border-cyan-400 rounded-xl pl-3 pr-8 py-2 text-xs text-cyan-200 font-mono outline-none placeholder:text-slate-500 transition-all shadow-inner"
                  />
                  {customPostId && (
                    <button
                      type="button"
                      onClick={() => setCustomPostId('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleApplyCustomId}
                  className="bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs active:scale-95 shadow-lg shadow-cyan-500/20 cursor-pointer transition-all whitespace-nowrap flex-shrink-0"
                >
                  កំណត់ Live
                </button>
              </div>
            </div>

            {/* Sync Comments Trigger with Deep Pagination up to 10,000+ comments */}
            <button
              onClick={handleSyncComments}
              disabled={syncingComments}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 text-white rounded-2xl text-[12.5px] font-black flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(16,185,129,0.35)] active:scale-98 cursor-pointer transition-all border border-emerald-400/40 disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {syncingComments ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin flex-shrink-0" />
                  <span>កំពុងទាញយក Comment ទាំងអស់ (Full Sync)...</span>
                </>
              ) : (
                <>
                  <span className="text-base">⚡</span>
                  <span>
                    ទាញយក Comment ទាំងអស់ពី Live #{activeLiveId.includes('_') ? activeLiveId.split('_').pop() : activeLiveId}
                    {selectedPost?.comments_count ? ` (💬 ${selectedPost.comments_count.toLocaleString()})` : ''}
                  </span>
                </>
              )}
            </button>

            {/* Check Non-Basket Users Button */}
            {onOpenNoBasketModal && (
              <button
                onClick={onOpenNoBasketModal}
                className="w-full py-2.5 bg-gradient-to-r from-slate-900 via-[#101b33] to-slate-900 hover:from-slate-800 hover:to-slate-800 text-amber-300 hover:text-amber-200 rounded-2xl text-xs font-black flex items-center justify-center gap-2 border border-amber-500/40 shadow-sm active:scale-98 transition-all cursor-pointer"
              >
                <span>⚠️</span>
                <span>ពិនិត្យអ្នកខំមិនដែលគ្មានកន្ត្រក (Users គ្មានកន្ត្រក)</span>
                <span>➔</span>
              </button>
            )}
          </div>

          {/* Toggle Manual Access Token Form (Fastest & 100% Guaranteed Connection) */}
          <div className="border-t border-slate-800/80 pt-2.5 flex flex-col gap-2">
            <button
              onClick={() => setShowManualForm(!showManualForm)}
              className="text-xs text-cyan-300 hover:text-cyan-200 flex items-center justify-between font-bold px-1 transition-colors bg-cyan-950/40 p-2 rounded-xl border border-cyan-500/30"
            >
              <span className="flex items-center gap-1.5">
                <span>⚡</span> ជម្រើសភ្ជាប់លឿនបំផុត (Page Access Token / មិនបាច់ OAuth)
              </span>
              <span className="text-[10px]">{showManualForm ? '▲ បិទ' : '▼ បើក'}</span>
            </button>

            {showManualForm && (
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3 flex flex-col gap-2.5 shadow-inner">
                <div className="text-[11px] text-slate-300 bg-blue-950/60 p-2.5 rounded-xl border border-blue-500/30 leading-relaxed">
                  💡 <strong>គាំទ្រ Import ច្រើនផេកក្នុងពេលតែមួយ ៖</strong><br/>
                  • បើអ្នក Paste <strong>User Access Token</strong> ប្រព័ន្ធនឹងទាញយក <strong>Facebook Pages ទាំងអស់</strong> ដែលអ្នកគ្រប់គ្រងដោយស្វ័យប្រវត្តិ!<br/>
                  • ឬអាច Paste <strong>បញ្ជី Page Access Tokens ច្រើន</strong> (ចុះបន្ទាត់មួយ Token មួយ ឬទម្រង់ JSON) ដើម្បី Import ចូលទាំងអស់តែម្ដង។
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">ឈ្មោះ Facebook Page (ជម្រើសបន្ថែម / ទុកទំនេរបាន) ៖</label>
                  <input
                    type="text"
                    value={manualPageName}
                    onChange={e => setManualPageName(e.target.value)}
                    placeholder="e.g. ChatbotKH Store (ទុកទំនេរដើម្បីឱ្យប្រព័ន្ធស្វែងរកឈ្មោះពិត)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Access Token (EAAB... / EAAR...) ៖</label>
                  <textarea
                    rows={3}
                    value={manualToken}
                    onChange={e => setManualToken(e.target.value)}
                    placeholder="Paste Page Access Token (EAAB...) ឬ User Token ឬចុះបន្ទាត់ដាក់ច្រើន Token..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-cyan-300 font-mono outline-none focus:border-cyan-400 leading-tight"
                  />
                </div>
                <button
                  onClick={handleManualConnect}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl text-xs font-black shadow transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>💾 រក្សាទុក & នាំចូល Facebook Pages ទាំងអស់</span>
                </button>
              </div>
            )}
          </div>

          {/* OAuth Callback Info box for Facebook Dev Console */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 flex flex-col gap-2 text-[11px] text-slate-400">
            <div className="font-bold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>📋</span> ការកំណត់លើ developers.facebook.com ៖
              </span>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                chatbotkh.com
              </span>
            </div>

            <div className="flex items-center gap-2">
              <code className="bg-slate-900 text-cyan-300 p-2 rounded-xl font-mono break-all text-[10.5px] select-all border border-slate-800 flex-1">
                {callbackUrl || 'https://chatbotkh.com/auth/callback'}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(callbackUrl || 'https://chatbotkh.com/auth/callback');
                  onShowToast('📋 បានចម្លង OAuth Redirect URI!', 'success');
                }}
                className="bg-slate-800 hover:bg-slate-700 text-cyan-300 px-3 py-2 rounded-xl text-[11px] font-bold border border-slate-700 transition-all flex-shrink-0 active:scale-95"
              >
                Copy
              </button>
            </div>

            <div className="text-[10.5px] text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 flex flex-col gap-1 leading-relaxed">
              <div className="font-bold text-cyan-300">ជំហានកំណត់ក្នុង Meta Developer Dashboard ដើម្បីកុំឱ្យ Error ៖</div>
              <div>1. ចូល <strong>Facebook Login &gt; Settings</strong> &gt; បិទភ្ជាប់ (Paste) URL ខាងលើក្នុងប្រអប់ <strong>Valid OAuth Redirect URIs</strong>។</div>
              <div>2. ចូល <strong>App Settings &gt; Basic</strong> &gt; បន្ថែម <code>chatbotkh.com</code> ក្នុង <strong>App Domains</strong>។</div>
              <div>3. ត្រង់ <strong>Website &gt; Site URL</strong> បញ្ចូល <code>https://chatbotkh.com/</code>។</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
