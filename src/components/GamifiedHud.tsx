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
}

export function GamifiedHud({
  topPackerName,
  mySessionPacks,
  backlogCount = 0,
  onOpenFastCheck,
  onOpenBacklog,
  onOpenLeaderboard,
}: GamifiedHudProps) {
  return (
    <div className="bg-[#070D1B]/95 border border-slate-800/80 px-2.5 py-1.5 rounded-xl shadow-lg backdrop-blur-md flex items-center justify-between gap-2">
      {/* 🏆 Leaderboard Summary (Clickable to open rankings) */}
      <button
        type="button"
        onClick={onOpenLeaderboard}
        className="flex items-center gap-1.5 min-w-0 hover:opacity-90 active:scale-98 transition-all cursor-pointer text-left"
        title="ចុចដើម្បីមើលតារាងជើងខ្លាំងច្រកប្រចាំថ្ងៃ"
      >
        <span className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-xs flex-shrink-0">
          🏆
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-black text-xs text-white truncate max-w-[120px] sm:max-w-[180px]">
            {topPackerName || 'អ្នកច្រក'}
          </span>
          <span className="text-[10px] text-amber-300 font-bold bg-amber-500/15 border border-amber-400/30 px-1.5 py-0.2 rounded-md whitespace-nowrap">
            {mySessionPacks} ខ្ញុំ
          </span>
        </div>
      </button>

      {/* Right Controls: Backlog Alert (if any) + Fast-Check Button */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Backlog Alert (Only shows when older unpicked baskets exist) */}
        {backlogCount > 0 && (
          <button
            type="button"
            onClick={onOpenBacklog}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-950/90 border border-rose-500 text-rose-200 text-[11px] font-black animate-pulse cursor-pointer active:scale-95 transition-all shadow-sm"
            title={`មានកន្ត្រកកកស្ទះ ${backlogCount} នាក់ ពី Live មុនៗ`}
          >
            <span>🚨</span>
            <span className="font-mono font-bold">{backlogCount}</span>
            <span className="hidden sm:inline text-[10px] font-normal">កកស្ទះ</span>
          </button>
        )}


        {/* ⚡ Fast-Check (Slip scan tool) */}
        {onOpenFastCheck && (
          <button
            type="button"
            onClick={onOpenFastCheck}
            className="h-[30px] px-2.5 rounded-lg bg-gradient-to-r from-indigo-600/80 to-purple-600/80 hover:from-indigo-500 hover:to-purple-500 border border-indigo-400/60 text-white shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all text-xs font-black"
            title="ស្កេនរូបភាព Slips ដើម្បីផ្ទៀងផ្ទាត់បង់រួចស្វ័យប្រវត្តិ"
          >
            <span className="text-xs">⚡</span>
            <span className="whitespace-nowrap">Fast-Check</span>
            <span className="bg-indigo-900/90 text-indigo-200 text-[9px] font-bold px-1 rounded font-mono hidden sm:inline">
              Slip
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
