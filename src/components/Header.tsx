import React from 'react';
import { FacebookPage } from '../types';
import { getLiveDisplayTitle } from '../utils/liveUtils';

interface HeaderProps {
  onOpenSystemSettings: () => void;
  onOpenFullStockManager: () => void;
  productsCount?: number;
  outStockCount?: number;
  activePage: FacebookPage | null;
  packerName: string;
  dispatchedCount: number;
  liveSessions: { live_id: string; created_at: string; basket_count?: number }[];
  selectedLiveId: string;
  onSelectLiveId: (id: string) => void;
  onCreateLiveSession?: () => void;
  onOpenManageLiveModal?: () => void;
  onOpenPickingModal: () => void;
  onToggleCommentStream: () => void;
  isStreamOpen: boolean;
  totalBasketCount?: number;
}

export function Header({
  onOpenSystemSettings,
  onOpenFullStockManager,
  productsCount = 0,
  outStockCount = 0,
  activePage,
  packerName,
  dispatchedCount,
  liveSessions,
  selectedLiveId,
  onSelectLiveId,
  onCreateLiveSession,
  onOpenManageLiveModal,
  onOpenPickingModal,
  onToggleCommentStream,
  isStreamOpen,
  totalBasketCount
}: HeaderProps) {
  return (
    <div className="bg-[#081122]/95 backdrop-blur-md border border-[#182848] p-2.5 rounded-2xl flex flex-col gap-2 shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
      {/* 2 Big Top Buttons Side-by-Side (ទទឹមគ្នា ២ ប៊ូតុងធំៗ) */}
      <div className="grid grid-cols-2 gap-2">
        {/* Button 1 (Left): KARI ARNETT OS (Settings & System) */}
        <button
          type="button"
          onClick={onOpenSystemSettings}
          className="bg-gradient-to-br from-[#0B1E3D] via-[#102A54] to-[#0A1830] hover:from-[#0E264D] hover:to-[#0F203D] border-[1.5px] border-cyan-500/60 hover:border-cyan-400 p-2 rounded-xl flex flex-col justify-between items-start text-left shadow-[0_4px_15px_rgba(6,182,212,0.15)] active:scale-[0.98] transition-all cursor-pointer group min-h-[64px]"
          title="ចុចដើម្បីបើកការកំណត់ទូទៅ ប្រព័ន្ធ និង Profile អ្នកច្រក"
        >
          <div className="w-full flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 font-black text-xs bg-gradient-to-r from-[#00F0FF] to-[#38BDF8] bg-clip-text text-transparent whitespace-nowrap">
              <span>⚡</span>
              <span>KARI OS</span>
            </div>
            <span className="text-[10px] text-cyan-400 bg-cyan-950/90 px-1.5 py-0.5 rounded border border-cyan-500/40 font-bold group-hover:scale-105 transition-transform flex-shrink-0 whitespace-nowrap">
              ⚙️ កំណត់
            </span>
          </div>

          {/* Subtitle & Quick Status Info */}
          <div className="w-full flex items-center justify-between gap-1 text-[10px] text-slate-300 font-medium pt-1 border-t border-cyan-900/40">
            <span className="truncate flex items-center gap-1 max-w-[95px]">
              <span className="text-slate-400">👤</span>
              <span className="truncate text-cyan-200 font-bold">{packerName || 'អ្នកច្រក'}</span>
            </span>
            <span className="flex items-center gap-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-bold text-[9.5px]">ON</span>
            </span>
          </div>
        </button>

        {/* Button 2 (Right): គ្រប់គ្រងស្តុក LIVE (Stock Management Full-Screen) */}
        <button
          type="button"
          onClick={onOpenFullStockManager}
          className="bg-gradient-to-br from-[#0B2544] via-[#0E325C] to-[#081B33] hover:from-[#0D2D52] hover:to-[#0B2444] border-[1.5px] border-[#0284C7] hover:border-sky-400 p-2 rounded-xl flex flex-col justify-between items-start text-left shadow-[0_4px_15px_rgba(2,132,199,0.2)] active:scale-[0.98] transition-all cursor-pointer group min-h-[64px]"
          title="ចុចដើម្បីបើកផ្ទាំងគ្រប់គ្រងស្តុកធំពេញអេក្រង់ (Full Screen Stock Manager)"
        >
          <div className="w-full flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 font-black text-xs text-sky-300 group-hover:text-cyan-200 whitespace-nowrap">
              <span>📦</span>
              <span>ស្តុក LIVE</span>
            </div>
            <span className="text-[10px] bg-sky-950/90 text-cyan-300 border border-sky-500/50 px-1.5 py-0.5 rounded font-mono font-bold flex-shrink-0 whitespace-nowrap">
              {productsCount} មុខ
            </span>
          </div>

          {/* Subtitle & Stock Quick Alert */}
          <div className="w-full flex items-center justify-between gap-1 text-[10px] font-medium pt-1 border-t border-sky-900/40">
            <span className="text-emerald-400 font-bold flex items-center gap-1 flex-shrink-0 text-[9.5px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span>LIVE</span>
            </span>
            {outStockCount > 0 ? (
              <span className="text-rose-300 bg-rose-950/90 px-1.5 py-0.5 rounded text-[9px] font-bold border border-rose-500/50 flex-shrink-0 whitespace-nowrap">
                🔴 អស់ ({outStockCount})
              </span>
            ) : (
              <span className="text-cyan-400 text-[9.5px] font-bold flex-shrink-0 whitespace-nowrap">
                🔍 មើលស្តុក ➔
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Sleek Live Session Bar (បន្ទាត់ជ្រើសរើស Live ខាងក្រោម) */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-[#15233E]">
        {/* Live Session Selector */}
        <div className="flex-1 min-w-0">
          {(() => {
            const currentLiveSession = liveSessions.find(s => s.live_id === selectedLiveId);
            let liveDisplayTitle = '🌐 គ្រប់ Live (ទាំងអស់)';
            if (selectedLiveId && selectedLiveId !== 'ALL') {
              const displayTitle = getLiveDisplayTitle(selectedLiveId);
              const displayCount = totalBasketCount !== undefined ? totalBasketCount : (currentLiveSession?.basket_count ?? 0);
              const countLabel = ` (${displayCount} កន្ត្រក)`;
              
              if (currentLiveSession?.created_at) {
                const raw = currentLiveSession.created_at;
                const day = raw.slice(8, 10);
                const month = raw.slice(5, 7);
                const time = raw.slice(11, 16);
                const dateDisp = day && month ? `${day}/${month}${time ? ` (${time})` : ''} ‧ ` : '';
                liveDisplayTitle = `🎥 ${dateDisp}${displayTitle}${countLabel}`;
              } else {
                liveDisplayTitle = `🎥 ${displayTitle}${countLabel}`;
              }
            }

            return (
              <button
                type="button"
                onClick={onOpenManageLiveModal}
                className="w-full bg-[#050B16] hover:bg-[#091428] text-sky-300 border border-sky-600/40 hover:border-cyan-400 px-2.5 py-1 rounded-xl text-xs font-bold truncate flex items-center justify-between gap-1 shadow-inner active:scale-[0.98] transition-all cursor-pointer text-left h-8"
                title="ចុចដើម្បីប្តូរ ឬលុបវគ្គ Live"
              >
                <span className="truncate">{liveDisplayTitle}</span>
                <span className="text-[10px] text-sky-400/80 flex-shrink-0">▼</span>
              </button>
            );
          })()}
        </div>

        {/* Add New Live Button */}
        {onCreateLiveSession && (
          <button
            type="button"
            onClick={onCreateLiveSession}
            className="w-8 h-8 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-500/60 text-cyan-300 text-xs font-black active:scale-95 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer shadow-sm"
            title="បង្កើតវគ្គ Live ថ្មី"
          >
            <span>➕</span>
          </button>
        )}

        {/* Picking List (ប្រមូល) Button */}
        <button
          type="button"
          onClick={onOpenPickingModal}
          className="bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/70 px-2 py-1 rounded-xl font-bold text-xs whitespace-nowrap active:scale-95 transition-all shadow-sm flex items-center gap-1 h-8 flex-shrink-0 cursor-pointer"
          title="បើកបញ្ជីប្រមូលទំនិញ (Picking List)"
        >
          <span>📋</span>
          <span>ប្រមូល</span>
        </button>

        {/* Live Comments Toggle (ខំមិន) */}
        <button
          type="button"
          onClick={onToggleCommentStream}
          className={`px-2 py-1 rounded-xl font-bold text-xs border flex items-center gap-1 transition-all h-8 flex-shrink-0 cursor-pointer ${
            isStreamOpen
              ? 'bg-rose-950/90 border-rose-500 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
              : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:border-slate-500'
          }`}
          title="បើក/បិទ ផ្ទាំងចាប់ខំមិន Live"
        >
          <span>💬</span>
          <span>ខំមិន</span>
        </button>
      </div>
    </div>
  );
}
