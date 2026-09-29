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
  onToggleCommentStream: () => void;
  isStreamOpen: boolean;
  totalBasketCount?: number;
  userRole?: 'admin' | 'staff';
}

export function Header({
  onOpenSystemSettings,
  onOpenFullStockManager,
  productsCount = 0,
  outStockCount = 0,
  packerName,
  liveSessions,
  selectedLiveId,
  onCreateLiveSession,
  onOpenManageLiveModal,
  onToggleCommentStream,
  isStreamOpen,
  totalBasketCount,
  userRole = 'staff'
}: HeaderProps) {
  return (
    <div className="bg-[#081122]/95 backdrop-blur-md border border-[#182848] p-2.5 rounded-2xl flex flex-col gap-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
      {/* 2 Big Top Action Buttons Side-by-Side (ទទឹមគ្នា ២ ប៊ូតុងធំៗ) */}
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
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold group-hover:scale-105 transition-transform flex-shrink-0 whitespace-nowrap ${
              userRole === 'admin'
                ? 'text-amber-300 bg-amber-950/90 border-amber-500/50'
                : 'text-cyan-400 bg-cyan-950/90 border-cyan-500/40'
            }`}>
              {userRole === 'admin' ? '👑 Admin' : '⚙️ កំណត់'}
            </span>
          </div>

          {/* Subtitle & Quick Status Info */}
          <div className="w-full flex items-center justify-between gap-1 text-[10px] text-slate-300 font-medium pt-1 border-t border-cyan-900/40">
            <span className="truncate flex items-center gap-1 max-w-[95px]">
              <span className="text-slate-400">{userRole === 'admin' ? '👑' : '👤'}</span>
              <span className={`truncate font-bold ${userRole === 'admin' ? 'text-amber-300' : 'text-cyan-200'}`}>
                {userRole === 'admin' ? 'ម្ចាស់ហាង' : (packerName || 'អ្នកច្រក')}
              </span>
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

      {/* Spacious Clean Live Session & Comment Control Bar (ប្រអប់ Live Session និងប៊ូតុងខំមិន ស្រឡះស្អាត) */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#15233E]">
        {/* Live Session Selector Box */}
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
                className="w-full bg-[#050E1F] hover:bg-[#091834] text-sky-200 hover:text-white border border-cyan-500/40 hover:border-cyan-400 px-3 py-1.5 rounded-xl text-xs font-black truncate flex items-center justify-between gap-1.5 shadow-inner active:scale-[0.98] transition-all cursor-pointer text-left h-9 shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                title="ចុចដើម្បីប្តូរ ឬលុបវគ្គ Live"
              >
                <span className="truncate flex items-center gap-1.5">
                  <span className="text-cyan-400 text-sm">🎥</span>
                  <span className="truncate">{liveDisplayTitle.replace(/^🎥\s*/, '')}</span>
                </span>
                <span className="text-[10px] text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-500/30 font-bold flex-shrink-0">
                  ប្តូរ ▼
                </span>
              </button>
            );
          })()}
        </div>

        {/* Add New Live Button */}
        {onCreateLiveSession && (
          <button
            type="button"
            onClick={onCreateLiveSession}
            className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-950 via-[#0C244A] to-cyan-900 hover:from-cyan-900 hover:to-cyan-800 border border-cyan-500/60 text-cyan-300 hover:text-white text-xs font-black active:scale-95 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer shadow-md shadow-cyan-950/50"
            title="បង្កើតវគ្គ Live ថ្មី"
          >
            <span className="text-sm">➕</span>
          </button>
        )}

        {/* Live Comments Toggle (ខំមិន) */}
        <button
          type="button"
          onClick={onToggleCommentStream}
          className={`h-9 px-3.5 rounded-xl font-black text-xs border flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer shadow-md active:scale-95 ${
            isStreamOpen
              ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 border-rose-400 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse'
              : 'bg-gradient-to-r from-[#0C2145] to-[#0A1A36] hover:from-[#102B5A] hover:to-[#0D2248] border-cyan-500/40 text-cyan-300 hover:text-white shadow-sm'
          }`}
          title="បើក/បិទ ផ្ទាំងចាប់ខំមិន Live"
        >
          <span className="text-sm">{isStreamOpen ? '🔴' : '💬'}</span>
          <span>{isStreamOpen ? 'Live ខំមិន' : 'ខំមិន'}</span>
        </button>
      </div>
    </div>
  );
}
