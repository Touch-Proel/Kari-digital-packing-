import React from 'react';

interface GamifiedHudProps {
  topPackerName: string;
  mySessionPacks: number;
  backlogCount?: number;
  allLivePaidCount?: number;
  isAllLiveQcActive?: boolean;
  onToggleAllLiveQc?: () => void;
  onOpenFastCheck?: () => void;
  onOpenBacklog?: () => void;
  onOpenLeaderboard: () => void;
  onOpenMyHistory: () => void;
  onOpenPickingModal?: () => void;
  onOpenNoBasketModal?: () => void;
}

export function GamifiedHud({
  topPackerName,
  mySessionPacks,
  backlogCount = 0,
  onOpenFastCheck,
  onOpenBacklog,
  onOpenLeaderboard,
  onOpenPickingModal,
  onOpenNoBasketModal
}: GamifiedHudProps) {
  return (
    <div className="bg-gradient-to-r from-[#060D1E]/95 via-[#08152E]/95 to-[#060D1E]/95 border border-[#162746] px-2.5 py-1.5 rounded-2xl shadow-lg backdrop-blur-md flex items-center justify-between gap-2 overflow-x-auto custom-scroll no-scrollbar">
      
      {/* 🏆 Leaderboard Summary (Clickable to open rankings) */}
      <button
        type="button"
        onClick={onOpenLeaderboard}
        className="flex items-center gap-1.5 min-w-0 bg-[#040A17]/80 hover:bg-[#07132B] border border-amber-500/30 hover:border-amber-400 px-2 py-1 rounded-xl active:scale-98 transition-all cursor-pointer text-left flex-shrink-0 shadow-sm"
        title="ចុចដើម្បីមើលតារាងជើងខ្លាំងច្រកប្រចាំថ្ងៃ"
      >
        <span className="w-5 h-5 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-[11px] flex-shrink-0">
          🏆
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-black text-xs text-white truncate max-w-[90px] sm:max-w-[140px]">
            {topPackerName || 'អ្នកច្រក'}
          </span>
          <span className="text-[10px] text-amber-300 font-mono font-black bg-amber-500/15 border border-amber-400/30 px-1.5 py-0.2 rounded-md whitespace-nowrap">
            {mySessionPacks} ខ្ញុំ
          </span>
        </div>
      </button>

      {/* Action Tools: ប្រមូល, គ្មានកន្ត្រក, Fast-Check, Backlog Alert */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        
        {/* Backlog Alert (Only shows when older unpicked baskets exist) */}
        {backlogCount > 0 && onOpenBacklog && (
          <button
            type="button"
            onClick={onOpenBacklog}
            className="flex items-center gap-1 h-7 px-2 rounded-xl bg-rose-950/90 border border-rose-500 text-rose-200 text-[11px] font-black animate-pulse cursor-pointer active:scale-95 transition-all shadow-sm"
            title={`មានកន្ត្រកកកស្ទះ ${backlogCount} នាក់ ពី Live មុនៗ`}
          >
            <span>🚨</span>
            <span className="font-mono font-bold">{backlogCount}</span>
            <span className="hidden sm:inline text-[10px] font-normal">កកស្ទះ</span>
          </button>
        )}

        {/* 📋 Picking List (ប្រមូល) Button */}
        {onOpenPickingModal && (
          <button
            type="button"
            onClick={onOpenPickingModal}
            className="h-7 px-2.5 rounded-xl bg-gradient-to-r from-emerald-950/90 to-teal-950/90 hover:from-emerald-900 hover:to-teal-900 border border-emerald-500/60 hover:border-emerald-400 text-emerald-300 hover:text-emerald-100 font-black text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm whitespace-nowrap"
            title="បើកបញ្ជីប្រមូលទំនិញតាមកូដ (Picking List)"
          >
            <span className="text-xs">📋</span>
            <span>ប្រមូល</span>
          </button>
        )}

        {/* ⚠️ Non-Basket Users (គ្មានកន្ត្រក) Button */}
        {onOpenNoBasketModal && (
          <button
            type="button"
            onClick={onOpenNoBasketModal}
            className="h-7 px-2.5 rounded-xl bg-gradient-to-r from-rose-950/80 via-amber-950/70 to-rose-950/80 hover:from-rose-900 hover:to-amber-900 border border-amber-500/50 hover:border-amber-400 text-amber-200 hover:text-white font-black text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm whitespace-nowrap"
            title="ពិនិត្យអ្នកខំមិនដែលប្រព័ន្ធមិនបានបង្កើតកន្ត្រក"
          >
            <span className="text-xs">⚠️</span>
            <span>គ្មានកន្ត្រក</span>
          </button>
        )}

        {/* ⚡ Fast-Check (Slip scan tool) */}
        {onOpenFastCheck && (
          <button
            type="button"
            onClick={onOpenFastCheck}
            className="h-7 px-2.5 rounded-xl bg-gradient-to-r from-indigo-600/85 via-purple-600/85 to-indigo-600/85 hover:from-indigo-500 hover:to-purple-500 border border-indigo-400/60 hover:border-indigo-300 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm whitespace-nowrap"
            title="ស្កេនរូបភាព Slips ដើម្បីផ្ទៀងផ្ទាត់បង់រួចស្វ័យប្រវត្តិ"
          >
            <span className="text-xs">⚡</span>
            <span>Fast-Check</span>
          </button>
        )}
      </div>
    </div>
  );
}
