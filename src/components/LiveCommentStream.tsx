import { useState, useEffect } from 'react';
import { playSuccessFanfare, playWarningBuzzer, playPureTone } from '../utils/audio';

interface RecentLiveOrder {
  id: string;
  customer_name: string;
  picture_url?: string;
  comment_text: string;
  created_at: string;
  invoice_id: number;
  basket_no: number;
  allocated_items: {
    code: string;
    product_name: string;
    quantity: number;
    price: number;
  }[];
  phone_number?: string;
  address?: string;
  location_label?: string;
  total_amount: number;
}

interface LiveCommentStreamProps {
  isOpen: boolean;
  onClose: () => void;
  activeLiveId: string;
  onCommentProcessed: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export function LiveCommentStream({
  isOpen,
  onClose,
  activeLiveId,
  onCommentProcessed,
  onShowToast
}: LiveCommentStreamProps) {
  const [activeTab, setActiveTab] = useState<'feed' | 'simulator'>('feed');
  const [commentText, setCommentText] = useState('');
  const [customerName, setCustomerName] = useState('ម៉ៅ ស្រីពៅ');
  const [submitting, setSubmitting] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [recentOrders, setRecentOrders] = useState<RecentLiveOrder[]>([]);
  const [totalSynced, setTotalSynced] = useState(0);
  const [recentLogs, setRecentLogs] = useState<string[]>([
    '🟢 ប្រព័ន្ធទាញខំមិន Real-time Auto-Sync កំពុងរង់ចាំខំមិន...',
  ]);

  // Fetch live auto-sync status and recent orders
  const fetchLiveSyncStatus = async () => {
    try {
      const res = await fetch('/api/fb/live_auto_sync');
      const data = await res.json();
      if (data) {
        setAutoSyncEnabled(Boolean(data.enabled));
        setTotalSynced(data.totalCommentsSynced || 0);
        if (Array.isArray(data.recentOrders)) {
          setRecentOrders(data.recentOrders);
        }
      }
    } catch (e) {
      // silent catch
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchLiveSyncStatus();
    const timer = setInterval(fetchLiveSyncStatus, 2500);
    return () => clearInterval(timer);
  }, [isOpen, activeLiveId]);

  if (!isOpen) return null;

  const handleTriggerSyncNow = async () => {
    setSyncingNow(true);
    playPureTone(750, 0.05);
    try {
      const res = await fetch('/api/fb/live_auto_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_now: true, live_id: activeLiveId })
      });
      const data = await res.json();
      if (data.success) {
        if (data.new_orders > 0) {
          playSuccessFanfare();
          onShowToast(`🎉 បានកាត់ចូលកន្ត្រក ${data.new_orders} ជួរថ្មីដោយជោគជ័យ!`);
        } else {
          onShowToast(`✅ បានទាញយកខំមិនរួចរាល់ (ខំមិនសរុប ${data.total_synced || 0})`);
        }
        fetchLiveSyncStatus();
        onCommentProcessed();
      } else {
        onShowToast(data.error || 'បរាជ័យក្នុងការទាញខំមិន', 'error');
      }
    } catch (e) {
      onShowToast('Network error triggering live sync', 'error');
    } finally {
      setSyncingNow(false);
    }
  };

  const handleToggleAutoSync = async () => {
    const nextState = !autoSyncEnabled;
    try {
      const res = await fetch('/api/fb/live_auto_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState, live_id: activeLiveId })
      });
      const data = await res.json();
      setAutoSyncEnabled(nextState);
      onShowToast(nextState ? '🟢 បានបើក Real-time Auto-Sync!' : '⏸️ បានផ្អាក Auto-Sync!');
    } catch {
      onShowToast('បរាជ័យក្នុងការប្តូរស្ថានភាព Auto-Sync', 'error');
    }
  };

  const handleTestComment = async (customText?: string, customName?: string) => {
    const textToSend = customText || commentText;
    const nameToSend = customName || customerName;

    if (!textToSend.trim()) return;

    setSubmitting(true);
    playPureTone(700, 0.04);

    try {
      const res = await fetch('/api/comments/test_simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSend.trim(),
          user_name: nameToSend.trim(),
          live_id: activeLiveId
        })
      });
      const data = await res.json();

      if (data.status === 'SUCCESS') {
        playSuccessFanfare();
        onShowToast(data.message);
        setRecentLogs(prev => [data.message, ...prev.slice(0, 8)]);
        if (!customText) setCommentText('');
        onCommentProcessed();
        fetchLiveSyncStatus();
      } else if (data.status === 'CONTACT_SAVED' || data.status === 'QUESTION_SAVED' || data.status === 'UNMATCHED_SAVED') {
        playPureTone(880, 0.08);
        onShowToast(data.message);
        setRecentLogs(prev => [data.message, ...prev.slice(0, 8)]);
        if (!customText) setCommentText('');
        onCommentProcessed();
        fetchLiveSyncStatus();
      } else {
        playWarningBuzzer();
        onShowToast(data.message || 'Comment រក្សាទុកក្នុងបញ្ជី', 'error');
        setRecentLogs(prev => [`⚠️ ${data.message}: "${textToSend}"`, ...prev.slice(0, 8)]);
      }
    } catch (e) {
      playWarningBuzzer();
      onShowToast('Network error processing comment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const sampleQuickComments = [
    { name: 'Ly Ly', text: '016773399 12=5' },
    { name: 'ម៉ាក់ រីយ៉ា', text: '10=1សុកូលា/សន្ធរមុក/0967760868' },
    { name: 'Kim Sreng', text: '10=1ស្វាយ. 0319999237.ភូមិទួលកណ្ដោល.ត្បូងឃ្មុំ' },
    { name: 'Chan Thy', text: '10=2សុកកាឡា​ សាច់​ 0965651050ចោមចៅ' },
    { name: 'ស្រី តូច', text: 'កូត10ឈាមជ្រូកវត្តភ្នំ' }
  ];

  return (
    <div className="bg-gradient-to-br from-[#0B1426] via-slate-900 to-[#070D1B] border-[1.5px] border-sky-500/60 rounded-2xl p-3 flex flex-col gap-2.5 shadow-2xl animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
          </span>
          <span className="font-black text-xs text-rose-400">🔴 REAL-TIME LIVE COMMENTS & BASKET ALLOCATION</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xs font-black bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded-md cursor-pointer transition-all"
        >
          ✕
        </button>
      </div>

      {/* Auto-Sync Live Status Bar */}
      <div className="bg-slate-950/90 border border-sky-600/30 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-inner">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 font-bold text-xs text-sky-200">
            <span className="text-cyan-400">🎥</span>
            <span className="font-mono text-cyan-300">Live #{activeLiveId}</span>
          </div>
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 ${
            autoSyncEnabled
              ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
              : 'bg-amber-950 text-amber-300 border-amber-500/50'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${autoSyncEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{autoSyncEnabled ? 'Auto-Sync 3s (សកម្ម)' : 'Auto-Sync ផ្អាក'}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleTriggerSyncNow}
            disabled={syncingNow}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-2.5 py-1 rounded-lg active:scale-95 transition-all shadow flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="ទាញខំមិនឥឡូវនេះ"
          >
            <span>{syncingNow ? '⏳' : '⚡'}</span>
            <span>ទាញខំមិនឥឡូវ</span>
          </button>
          <button
            onClick={handleToggleAutoSync}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 font-bold text-xs px-2 py-1 rounded-lg active:scale-95 transition-all cursor-pointer"
            title="បើក/បិទ Auto-Sync"
          >
            {autoSyncEnabled ? '⏸️ ផ្អាក' : '▶️ បើក Auto'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('feed')}
          className={`pb-1 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'feed'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>📡 កន្ត្រកកាត់ថ្មីៗ Real-time</span>
          {recentOrders.length > 0 && (
            <span className="bg-cyan-950 text-cyan-300 border border-cyan-500/40 text-[9px] px-1.5 rounded-full font-mono">
              {recentOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('simulator')}
          className={`pb-1 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'simulator'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>🧪 ម៉ាស៊ីនតេស្តខំមិន (Simulator)</span>
        </button>
      </div>

      {activeTab === 'feed' ? (
        <div className="flex flex-col gap-2">
          {recentOrders.length === 0 ? (
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-2">
              <span className="text-2xl animate-bounce">⚡</span>
              <div className="text-xs font-bold text-sky-300">
                ប្រព័ន្ធកំពុងទាញខំមិនពី Facebook Live #{activeLiveId}
              </div>
              <div className="text-[11px] text-slate-400 max-w-sm">
                រាល់ពេលភ្ញៀវខំមិនកូដទំនិញ (ឧ. 10=1, 12=5, 10=សុកូឡា) ប្រព័ន្ធនឹងទាញស្វ័យប្រវត្តិកាត់ចូលកន្ត្រកភ្លាមៗ!
              </div>
              <button
                onClick={handleTriggerSyncNow}
                disabled={syncingNow}
                className="mt-1 bg-cyan-600 hover:bg-cyan-500 text-black font-black text-xs px-3 py-1.5 rounded-lg active:scale-95 transition-all shadow cursor-pointer"
              >
                🔄 ទាញយកខំមិន Live ឥឡូវនេះ
              </button>
            </div>
          ) : (
            <div className="max-h-[220px] overflow-y-auto flex flex-col gap-1.5 pr-0.5">
              {recentOrders.map((order, idx) => (
                <div
                  key={order.id || idx}
                  className="bg-slate-950/90 border border-slate-800 hover:border-cyan-500/50 rounded-xl p-2 flex items-center justify-between gap-2 shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center text-xs font-bold text-sky-300">
                      {order.picture_url ? (
                        <img src={order.picture_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span>{order.customer_name?.charAt(0) || '👤'}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">{order.customer_name}</span>
                        {order.phone_number && order.phone_number !== 'គ្មានលេខ' && (
                          <span className="text-[10px] text-emerald-400 font-mono font-bold">
                            {order.phone_number}
                          </span>
                        )}
                        {order.location_label && (
                          <span className="text-[9.5px] text-slate-400 truncate">
                            • {order.location_label}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-sky-300/90 truncate font-mono">
                        "{order.comment_text}"
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="text-right">
                      <span className="bg-sky-950 text-cyan-300 border border-sky-500/50 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold">
                        កន្ត្រក #{order.basket_no}
                      </span>
                      <div className="text-[10px] text-emerald-400 font-bold mt-0.5">
                        {order.allocated_items.map(it => `${it.code}x${it.quantity}`).join(', ')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Simulator input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="ឈ្មោះភ្ញៀវ Facebook"
                className="w-1/3 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-sky-300 font-bold outline-none focus:border-cyan-400"
              />
              <input
                type="text"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTestComment();
                }}
                placeholder="វាយ Comment ឧ. 10=1, 12=5 012888999 ភ្នំពេញ..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400 font-medium"
              />
            </div>

            <button
              onClick={() => handleTestComment()}
              disabled={submitting || !commentText.trim()}
              className="w-full py-2 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              <span>⚡</span>
              <span>{submitting ? 'កំពុងកាត់...' : 'កាត់ចូលកន្ត្រកភ្លាមៗ (Auto Allocate & Deduct Stock)'}</span>
            </button>
          </div>

          {/* Quick click test buttons */}
          <div>
            <div className="text-[10.5px] text-slate-400 font-bold mb-1">💡 ចុចតេស្តខំមិន Live ពិតជាក់ស្តែង ៖</div>
            <div className="flex flex-wrap gap-1.5">
              {sampleQuickComments.map((sc, i) => (
                <button
                  key={i}
                  onClick={() => handleTestComment(sc.text, sc.name)}
                  className="bg-slate-900 border border-slate-700 hover:border-cyan-400 text-slate-300 text-[11px] px-2 py-1 rounded-lg truncate max-w-full font-medium active:scale-95 cursor-pointer"
                >
                  💬 <strong className="text-sky-400">{sc.name}</strong>: "{sc.text}"
                </button>
              ))}
            </div>
          </div>

          {/* Real-time event log */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2 max-h-[75px] overflow-y-auto text-[11px] flex flex-col gap-1 font-mono">
            {recentLogs.map((log, i) => (
              <div key={i} className="text-emerald-300 font-sans truncate">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
