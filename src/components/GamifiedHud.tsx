import React from 'react';

interface GamifiedHudProps {
  topPackerName?: string;
  mySessionPacks?: number;
  backlogCount?: number;
  allLivePaidCount?: number;
  isAllLiveQcActive?: boolean;
  onToggleAllLiveQc?: () => void;
  onOpenBacklog?: () => void;
  onOpenPickingModal?: () => void;
  onOpenNoBasketModal?: () => void;
  onOpenFastCheck?: () => void;
}

export function GamifiedHud({
  backlogCount = 0,
  onOpenBacklog,
  onOpenPickingModal,
  onOpenNoBasketModal,
  onOpenFastCheck
}: GamifiedHudProps) {
  return (
    <div className="hud-container bg-gradient-to-r from-[#060D1E]/95 via-[#08152E]/95 to-[#060D1E]/95 border border-[#162746] px-2.5 py-1.5 rounded-2xl shadow-lg backdrop-blur-md flex items-center justify-start gap-2 overflow-x-auto custom-scroll no-scrollbar">
      
      {/* 📋 Picking List (ប្រមូល) Button */}
      {onOpenPickingModal && (
        <button
          type="button"
          onClick={onOpenPickingModal}
          className="flex-1 sm:flex-none h-8 px-3 rounded-xl bg-gradient-to-r from-emerald-950/90 to-teal-950/90 hover:from-emerald-900 hover:to-teal-900 border border-emerald-500/60 hover:border-emerald-400 text-emerald-300 hover:text-emerald-100 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm whitespace-nowrap"
          title="បើកបញ្ជីប្រមូលទំនិញតាមកូដ (Picking List)"
        >
          <span className="text-sm">📋</span>
          <span>ប្រមូលទំនិញ</span>
        </button>
      )}

      {/* ⚠️ Non-Basket Users (គ្មានកន្ត្រក) Button */}
      {onOpenNoBasketModal && (
        <button
          type="button"
          onClick={onOpenNoBasketModal}
          className="flex-1 sm:flex-none h-8 px-3 rounded-xl bg-gradient-to-r from-rose-950/80 via-amber-950/70 to-rose-950/80 hover:from-rose-900 hover:to-amber-900 border border-amber-500/50 hover:border-amber-400 text-amber-200 hover:text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm whitespace-nowrap"
          title="ពិនិត្យអ្នកខំមិនដែលប្រព័ន្ធមិនបានបង្កើតកន្ត្រក"
        >
          <span className="text-sm">⚠️</span>
          <span>គ្មានកន្ត្រក</span>
        </button>
      )}

      {/* 📑 Slips Button (ខ្លី: Slips ដាក់ក្បែរ គ្មានកន្ត្រក) */}
      {onOpenFastCheck && (
        <button
          type="button"
          onClick={onOpenFastCheck}
          className="flex-1 sm:flex-none h-8 px-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 border border-indigo-400/80 hover:border-indigo-300 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-[0_0_12px_rgba(99,102,241,0.35)] whitespace-nowrap"
          title="បើកផ្ទៀងផ្ទាត់វិក្កយបត្រ Slips (Fast Check & 1-Click Approve)"
        >
          <span className="text-sm">📑</span>
          <span>Slips</span>
        </button>
      )}

      {/* Backlog Alert (Only shows when older unpicked baskets exist) */}
      {backlogCount > 0 && onOpenBacklog && (
        <button
          type="button"
          onClick={onOpenBacklog}
          className="h-8 px-3 rounded-xl bg-rose-950/90 border border-rose-500 text-rose-200 text-xs font-black animate-pulse cursor-pointer active:scale-95 transition-all shadow-sm flex items-center gap-1.5 flex-shrink-0"
          title={`មានកន្ត្រកកកស្ទះ ${backlogCount} នាក់ ពី Live មុនៗ`}
        >
          <span>🚨</span>
          <span className="font-mono font-bold">{backlogCount}</span>
          <span>កកស្ទះ Live មុន</span>
        </button>
      )}
    </div>
  );
}
