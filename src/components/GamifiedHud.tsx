interface GamifiedHudProps {
  topPackerName: string;
  mySessionPacks: number;
  backlogCount?: number;
  onOpenBacklog?: () => void;
  onOpenLeaderboard: () => void;
  onOpenMyHistory: () => void;
}

export function GamifiedHud({
  topPackerName,
  mySessionPacks,
  backlogCount = 0,
  onOpenBacklog,
  onOpenLeaderboard,
  onOpenMyHistory
}: GamifiedHudProps) {
  // 🚨 When there is Backlog from previous lives (> 0), transform this entire banner into high-priority Alert!
  if (backlogCount > 0) {
    return (
      <div
        onClick={onOpenBacklog}
        className="bg-gradient-to-r from-rose-950 via-red-950/95 to-amber-950 border-2 border-rose-500 rounded-2xl p-2.5 flex items-center justify-between shadow-[0_0_25px_rgba(244,63,94,0.45)] cursor-pointer hover:border-rose-400 active:scale-[0.99] transition-all group animate-pulse"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-rose-500/30 border border-rose-400/60 flex items-center justify-center text-lg flex-shrink-0 animate-bounce">
            🚨
          </span>
          <div className="flex flex-col text-left min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-rose-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                កន្ត្រកកកស្ទះ (Backlog)
              </span>
              <span className="font-black text-rose-200 text-xs sm:text-sm">
                {backlogCount} នាក់ (ពី Live មុនៗមិនទាន់ចេញដឹក)
              </span>
            </div>
            <span className="text-[11px] text-amber-200/90 font-medium truncate mt-0.5">
              👉 ភ្ញៀវបង់លុយរួចហើយ តែមិនទាន់ចេញដឹក! ចុចដើម្បីពិនិត្យ & ចេញដឹកភ្លាម
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onOpenBacklog?.();
          }}
          className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg group-hover:scale-105 transition-transform whitespace-nowrap flex-shrink-0 ml-2"
        >
          <span>ពិនិត្យឥឡូវ</span>
          <span>➔</span>
        </button>
      </div>
    );
  }

  // 🟢 Normal state (Backlog = 0): Shows Backlog 0 status + Leaderboard & Packer stats
  return (
    <div className="bg-gradient-to-r from-emerald-950/90 via-teal-900/80 to-emerald-900/90 border-[1.5px] border-emerald-500 p-2 rounded-xl flex justify-between items-center shadow-md">
      {/* Backlog Quick Status & Trigger (Always accessible) */}
      <div
        onClick={onOpenBacklog}
        className="flex items-center gap-2 pr-2.5 hover:opacity-90 cursor-pointer active:scale-98 transition-all flex-shrink-0"
        title="ពិនិត្យកន្ត្រកកកស្ទះពី Live មុនៗ (ចុចដើម្បីបើកមើល)"
      >
        <div className="w-7 h-7 rounded-lg bg-emerald-900/80 border border-emerald-400/50 flex items-center justify-center text-sm flex-shrink-0">
          🚨
        </div>
        <div>
          <div className="font-black text-xs text-white flex items-center gap-1.5">
            <span>Backlog:</span>
            <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded text-[11px] font-mono border border-emerald-400/40">0</span>
          </div>
          <div className="text-[10px] text-emerald-300 font-bold hover:underline">គ្មានកកស្ទះ (ចុចមើល)</div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-7 w-[1px] bg-white/20 flex-shrink-0"></div>

      {/* Top Packer */}
      <div
        onClick={onOpenLeaderboard}
        className="flex items-center gap-2 px-2 hover:opacity-90 cursor-pointer active:scale-98 transition-all min-w-0"
      >
        <span className="text-xl flex-shrink-0">🏆</span>
        <div className="min-w-0">
          <div className="font-black text-xs text-white truncate max-w-[120px] sm:max-w-[160px]">{topPackerName}</div>
          <div className="text-[10.5px] text-emerald-300 font-bold truncate">ជើងខ្លាំងច្រក (ចុចមើលតារាង)</div>
        </div>
      </div>

      {/* Current Session Packs */}
      <div
        onClick={e => {
          e.stopPropagation();
          onOpenMyHistory();
        }}
        className="flex items-center gap-2 border-l border-white/20 pl-2.5 hover:opacity-90 cursor-pointer active:scale-98 transition-all flex-shrink-0"
      >
        <span className="text-xl">🔥</span>
        <div>
          <div className="font-black text-xs text-white">{mySessionPacks} កន្ត្រក</div>
          <div className="text-[10.5px] text-emerald-300 font-bold">អ្នកច្រកបាន (ចុចមើល)</div>
        </div>
      </div>
    </div>
  );
}
