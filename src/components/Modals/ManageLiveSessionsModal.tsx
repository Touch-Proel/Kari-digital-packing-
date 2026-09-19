import React, { useState } from 'react';
import { playPureTone, playSuccessFanfare, playWarningBuzzer } from '../../utils/audio';

interface LiveSessionItem {
  live_id: string;
  created_at: string;
  basket_count?: number;
  product_count?: number;
  unsold_product_count?: number;
  is_active?: boolean;
}

interface ManageLiveSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveSessions: LiveSessionItem[];
  activeLiveId: string;
  onSelectLiveId: (liveId: string) => void;
  onCreateNewLive: () => void;
  onRefreshLiveSessions: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export function ManageLiveSessionsModal({
  isOpen,
  onClose,
  liveSessions,
  activeLiveId,
  onSelectLiveId,
  onCreateNewLive,
  onRefreshLiveSessions,
  onShowToast
}: ManageLiveSessionsModalProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen) return null;

  // Filter sessions
  const filteredSessions = liveSessions.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.live_id.toLowerCase().includes(q) || (s.created_at && s.created_at.includes(q));
  });

  const handleDeleteSession = async (liveId: string) => {
    setDeletingId(liveId);
    try {
      const res = await fetch('/api/delete_live_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_id: liveId })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        playSuccessFanfare();
        onShowToast(data.message || 'បានលុបវគ្គ Live ជោគជ័យ!', 'success');
        setConfirmDeleteId(null);
        onRefreshLiveSessions();
      } else {
        playWarningBuzzer();
        onShowToast(data.error || 'មិនអាចលុបវគ្គ Live បានទេ', 'error');
      }
    } catch (err: any) {
      playWarningBuzzer();
      onShowToast(`កំហុសបណ្តាញ៖ ${err.message}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Helper to format date cleanly without breaking
  const formatSessionDate = (raw?: string) => {
    if (!raw) return { date: 'មិនមានកាលបរិច្ឆេទ', time: '' };
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return {
          date: `${day}/${month}/${year}`,
          time: `${hours}:${minutes}`
        };
      }
    } catch {
      // fallback
    }
    const day = raw.slice(8, 10);
    const month = raw.slice(5, 7);
    const year = raw.slice(0, 4);
    const time = raw.slice(11, 16);
    if (day && month && year) {
      return {
        date: `${day}/${month}/${year}`,
        time: time || ''
      };
    }
    return { date: raw, time: '' };
  };

  // Helper for title
  const getLiveDisplayTitle = (liveId: string) => {
    if (liveId.startsWith('LIVE_')) {
      const parts = liveId.replace('LIVE_', '').split('_');
      if (parts.length >= 2) {
        const d = parts[0];
        const day = d.slice(6, 8);
        const month = d.slice(4, 6);
        return `Live ${parts[1]} (${day}/${month})`;
      }
      return `Live ${liveId.replace('LIVE_', '')}`;
    }
    if (/^\d+$/.test(liveId)) {
      return `Live #${liveId.length > 8 ? liveId.slice(-8) : liveId}`;
    }
    return `Live #${liveId}`;
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div
        className="bg-[#0b1320] border border-cyan-500/40 w-full max-w-xl rounded-3xl shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-cyan-900/50 bg-gradient-to-r from-slate-950 via-[#071d2e] to-slate-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-400/50 flex items-center justify-center text-2xl shadow-inner flex-shrink-0">
              🎥
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                  គ្រប់គ្រងវគ្គ Live ទាំងអស់
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm">
                  {liveSessions.length} វគ្គ
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                ជ្រើសរើសវគ្គ Live សម្រាប់វេចខ្ចប់ ប្តូរវគ្គ ឬលុបវគ្គចាស់ៗ
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              playPureTone(400, 0.05);
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-slate-800/90 hover:bg-rose-900/80 hover:text-white border border-slate-700 hover:border-rose-500/50 flex items-center justify-center text-slate-400 font-bold transition-all text-base flex-shrink-0 active:scale-90"
            title="បិទផ្ទាំង"
          >
            ✕
          </button>
        </div>

        {/* Action & Search Bar */}
        <div className="p-3 sm:p-4 border-b border-slate-800 bg-[#070e1a] flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              placeholder="ស្វែងរក Live # ឬកាលបរិច្ឆេទ..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-700/80 focus:border-cyan-400 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs w-5 h-5 flex items-center justify-center rounded-full bg-slate-800"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={() => {
              playPureTone(650, 0.08);
              onCreateNewLive();
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 via-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs sm:text-sm font-black shadow-[0_0_15px_rgba(6,182,212,0.35)] active:scale-95 transition-all flex items-center justify-center gap-1.5 flex-shrink-0 cursor-pointer border border-cyan-300/30"
          >
            <span className="text-base leading-none">➕</span>
            <span>បង្កើត Live ថ្មី</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-3 flex-1 divide-none">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs sm:text-sm bg-slate-900/40 rounded-2xl border border-slate-800/80">
              <span className="text-4xl block mb-2 opacity-60">📭</span>
              មិនមានវគ្គ Live ត្រូវតាមការស្វែងរកឡើយ
            </div>
          ) : (
            filteredSessions.map(session => {
              const isSelected = activeLiveId === session.live_id;
              const isConfirmingThis = confirmDeleteId === session.live_id;
              const isDeletingThis = deletingId === session.live_id;
              const title = getLiveDisplayTitle(session.live_id);
              const { date, time } = formatSessionDate(session.created_at);

              return (
                <div
                  key={session.live_id}
                  className={`rounded-2xl p-3.5 sm:p-4 transition-all flex flex-col gap-3 ${
                    isSelected
                      ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900/90 to-[#071d20] border-2 border-emerald-400/90 shadow-[0_0_24px_rgba(16,185,129,0.2)]'
                      : 'bg-slate-900/80 hover:bg-slate-900 border border-slate-700/80 hover:border-slate-600 shadow-sm'
                  }`}
                >
                  {/* Top Row: Title + Status + Delete */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-lg">🎥</span>
                      <h3 className="font-mono font-black text-white text-base sm:text-lg tracking-wide truncate">
                        {title}
                      </h3>
                      {isSelected && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.3)] flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          កំពុងដំណើរការ (ACTIVE)
                        </span>
                      )}
                    </div>

                    {/* Delete button (top right) */}
                    {!isConfirmingThis && (
                      <button
                        onClick={() => {
                          playPureTone(350, 0.06);
                          setConfirmDeleteId(session.live_id);
                        }}
                        className="w-8 h-8 rounded-xl bg-rose-950/40 hover:bg-rose-900/80 border border-rose-800/50 hover:border-rose-500 text-rose-300 hover:text-white text-sm font-bold transition-all active:scale-90 flex items-center justify-center flex-shrink-0 cursor-pointer shadow-sm"
                        title="លុបវគ្គ Live នេះ"
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                  {/* Middle Row: Clean Metrics Pills (Baskets, Products, In-Stock) */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {/* Baskets */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                        <span>📦</span> កន្ត្រក
                      </span>
                      <span className="font-mono font-black text-cyan-300 text-sm sm:text-base mt-0.5">
                        {session.basket_count || 0}
                      </span>
                    </div>

                    {/* Total Products */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                        <span>🏷️</span> មុខទំនិញ
                      </span>
                      <span className="font-mono font-black text-indigo-300 text-sm sm:text-base mt-0.5">
                        {session.product_count || 0}
                      </span>
                    </div>

                    {/* Remaining */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                        <span>🟢</span> សល់ស្តុក
                      </span>
                      <span className="font-mono font-black text-emerald-300 text-sm sm:text-base mt-0.5">
                        {session.unsold_product_count ?? (session.product_count || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: Date & Action Button */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center gap-1 text-[11px] sm:text-xs text-slate-400">
                      <span>📅</span>
                      <span className="font-medium">{date}</span>
                      {time && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-300 font-mono">{time}</span>
                        </>
                      )}
                    </div>

                    {/* Switch / Active Button */}
                    <div>
                      {isSelected ? (
                        <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-xs font-black flex items-center gap-1 shadow-sm">
                          <span>✓</span>
                          <span>កំពុងជ្រើសរើស</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            playPureTone(520, 0.06);
                            onSelectLiveId(session.live_id);
                            onClose();
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 hover:from-cyan-600 hover:to-blue-600 border border-slate-600/80 hover:border-cyan-400 text-slate-100 hover:text-white text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 shadow cursor-pointer"
                        >
                          <span>⚡</span>
                          <span>ប្តូរទៅ Live នេះ</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline Delete Confirmation Banner */}
                  {isConfirmingThis && (
                    <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-500 text-rose-100 text-xs flex flex-col gap-2 animate-in fade-in duration-150">
                      <div className="flex items-start gap-2">
                        <span className="text-lg leading-none">⚠️</span>
                        <div className="flex-1">
                          <p className="font-bold text-white">
                            តើបងពិតជាចង់លុប {title} នេះមែនទេ?
                          </p>
                          <p className="text-rose-200/80 text-[11px] mt-0.5">
                            រាល់ទិន្នន័យទាំងអស់ ({session.basket_count || 0} កន្ត្រក) ក្នុងវគ្គនេះនឹងត្រូវលុបចេញពីប្រព័ន្ធ!
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end pt-1 border-t border-rose-900/60">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={isDeletingThis}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer"
                        >
                          ទេ (បោះបង់)
                        </button>
                        <button
                          onClick={() => handleDeleteSession(session.live_id)}
                          disabled={isDeletingThis}
                          className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow transition-all flex items-center gap-1 cursor-pointer"
                        >
                          {isDeletingThis ? 'កំពុងលុប...' : '🗑️ យល់ព្រម លុបចោល'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-[#070e1a] flex items-center justify-between gap-2 text-xs text-slate-400">
          <button
            onClick={() => {
              playPureTone(520, 0.05);
              onSelectLiveId('');
              onClose();
            }}
            className="px-3 sm:px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 hover:border-cyan-500/50 text-slate-200 border border-slate-700 font-bold transition-all text-xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
            title="បង្ហាញទិន្នន័យកន្ត្រកគ្រប់វគ្គ Live ទាំងអស់"
          >
            <span>🌐</span>
            <span>មើលគ្រប់ Live (ទាំងអស់)</span>
          </button>
          <button
            onClick={() => {
              playPureTone(400, 0.05);
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black transition-all text-xs active:scale-95 cursor-pointer border border-slate-700"
          >
            បិទ
          </button>
        </div>
      </div>
    </div>
  );
}
