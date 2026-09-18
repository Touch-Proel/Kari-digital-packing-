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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className="bg-slate-900 border border-cyan-500/40 w-full max-w-xl rounded-3xl shadow-[0_0_35px_rgba(6,182,212,0.15)] flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-cyan-900/60 bg-gradient-to-r from-slate-950 via-cyan-950/40 to-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-xl shadow-inner">
              🎥
            </div>
            <div>
              <h2 className="text-lg font-black text-cyan-200 tracking-wide flex items-center gap-2">
                គ្រប់គ្រងវគ្គ Live ទាំងអស់
                <span className="px-2 py-0.5 rounded-full text-xs bg-cyan-900/60 text-cyan-300 font-bold border border-cyan-700/50">
                  {liveSessions.length} វគ្គ
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                មើល ប្តូរវគ្គ Live ឬលុបវគ្គ Live ចាស់ៗ/តេស្តដែលមិនត្រូវការ
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              playPureTone(400, 0.05);
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-rose-950 hover:text-rose-300 border border-slate-700 flex items-center justify-center text-slate-400 font-bold transition-all text-sm"
          >
            ✕
          </button>
        </div>

        {/* Action Bar (Search & Create New Live) */}
        <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
            <input
              type="text"
              placeholder="ស្វែងរកតាមលេខ Live # ឬកាលបរិច្ឆេទ..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 focus:border-cyan-400 rounded-xl text-xs text-slate-200 placeholder-slate-500 outline-none"
            />
          </div>
          <button
            onClick={() => {
              playPureTone(650, 0.08);
              onCreateNewLive();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <span>➕</span>
            <span>បង្កើត Live ថ្មី</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-2.5 flex-1 divide-y divide-slate-800/60">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              <span className="text-3xl block mb-2 opacity-50">📭</span>
              មិនមានវគ្គ Live ត្រូវតាមការស្វែងរកឡើយ
            </div>
          ) : (
            filteredSessions.map(session => {
              const raw = session.created_at || '';
              const day = raw.slice(8, 10);
              const month = raw.slice(5, 7);
              const year = raw.slice(0, 4);
              const time = raw.slice(11, 16);
              const dateDisp = day && month ? `${day}/${month}/${year}${time ? ` (${time})` : ''}` : raw;
              const idLabel = session.live_id.length > 10 ? `Live #${session.live_id.slice(-8)}` : session.live_id;
              const isSelected = activeLiveId === session.live_id;
              const isConfirmingThis = confirmDeleteId === session.live_id;
              const isDeletingThis = deletingId === session.live_id;

              return (
                <div
                  key={session.live_id}
                  className={`pt-2.5 first:pt-0 flex flex-col gap-2 p-3 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-cyan-950/30 border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                      : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* Live Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-cyan-300 text-sm tracking-wide">
                          🎥 {idLabel}
                        </span>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/60">
                            កំពុងដំណើរការ (ACTIVE)
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          📦 {session.basket_count || 0} កន្ត្រក
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-700/60">
                          🏷️ {session.product_count || 0} មុខ (សល់ {session.unsold_product_count || 0})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <span>📅 កាលបរិច្ឆេទ ៖ {dateDisp}</span>
                        <span className="text-slate-600 font-mono text-[10px]">({session.live_id})</span>
                      </div>
                    </div>

                    {/* Quick Select & Delete Buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!isSelected && (
                        <button
                          onClick={() => {
                            playPureTone(520, 0.06);
                            onSelectLiveId(session.live_id);
                            onClose();
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-cyan-950 hover:border-cyan-500/60 border border-slate-700 text-slate-200 hover:text-cyan-300 text-xs font-bold transition-all active:scale-95"
                          title="ប្តូរទៅមើល Live នេះ"
                        >
                          ប្តូរទៅ Live នេះ
                        </button>
                      )}

                      {!isConfirmingThis ? (
                        <button
                          onClick={() => {
                            playPureTone(350, 0.06);
                            setConfirmDeleteId(session.live_id);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/80 border border-rose-800/60 text-rose-300 hover:text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1"
                          title="លុប Live នេះ"
                        >
                          <span>🗑️</span>
                          <span className="hidden sm:inline">លុប</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Inline Delete Confirmation Banner */}
                  {isConfirmingThis && (
                    <div className="mt-1 p-2.5 rounded-xl bg-rose-950/90 border border-rose-500/80 text-rose-200 text-xs flex flex-col sm:flex-row items-center justify-between gap-2 animate-in fade-in duration-100">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">⚠️</span>
                        <span>
                          តើបងពិតជាចង់លុប <strong>{idLabel}</strong> ({session.basket_count || 0} កន្ត្រក) មែនទេ?
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 w-full sm:w-auto justify-end">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={isDeletingThis}
                          className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-all"
                        >
                          ទេ (មិនលុប)
                        </button>
                        <button
                          onClick={() => handleDeleteSession(session.live_id)}
                          disabled={isDeletingThis}
                          className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow transition-all flex items-center gap-1"
                        >
                          {isDeletingThis ? 'កំពុងលុប...' : 'យល់ព្រម លុបចោល'}
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
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onSelectLiveId('');
                onClose();
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold transition-all text-xs"
            >
              🌐 មើលគ្រប់ Live (ទាំងអស់)
            </button>
          </div>
          <button
            onClick={() => {
              playPureTone(400, 0.05);
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black transition-all text-xs"
          >
            បិទ
          </button>
        </div>
      </div>
    </div>
  );
}
