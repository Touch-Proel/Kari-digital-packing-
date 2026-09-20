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
  allLivePaidCount = 0,
  isAllLiveQcActive = false,
  onToggleAllLiveQc,
  onOpenFastCheck,
  onOpenBacklog,
  onOpenLeaderboard,
  onOpenMyHistory
}: GamifiedHudProps) {
  return (
    <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-[1.5px] border-emerald-500/50 p-2 rounded-2xl shadow-xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center gap-2">
      {/* 1. Mobile Leaderboard Strip (Shows as a neat top bar on small screens) */}
      <div className="flex sm:hidden items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/60 shadow-inner">
        <div
          onClick={onOpenLeaderboard}
          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer active:scale-98 transition-transform"
          title="ចុចដើម្បីមើលតារាងជើងខ្លាំងច្រកប្រចាំថ្ងៃ"
        >
          <span className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-xs flex-shrink-0">
            🏆
          </span>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-black text-xs text-white truncate">
              {topPackerName || 'អ្នកច្រក'}
            </span>
            <span className="text-[10px] text-amber-300 font-bold bg-amber-500/15 border border-amber-400/30 px-1.5 py-0.5 rounded-md truncate">
              ជើងខ្លាំង ({mySessionPacks} ខ្ញុំ)
            </span>
          </div>
        </div>

        {backlogCount > 0 ? (
          <div
            onClick={onOpenBacklog}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-950/90 border border-rose-500 text-rose-200 text-xs font-black animate-pulse cursor-pointer active:scale-95"
            title={`មានកន្ត្រកកកស្ទះ ${backlogCount} នាក់ ពី Live មុនៗ`}
          >
            <span className="text-xs">🚨</span>
            <span className="font-mono">{backlogCount}</span>
          </div>
        ) : (
          <div
            onClick={onOpenLeaderboard}
            className="text-[10px] text-slate-400 hover:text-amber-300 flex items-center gap-0.5 cursor-pointer flex-shrink-0 font-medium"
          >
            <span>តារាង</span>
            <span className="text-[9px]">❯</span>
          </div>
        )}
      </div>

      {/* 1b. Desktop Leaderboard Card (Hidden on mobile, visible on sm:) */}
      <div
        onClick={onOpenLeaderboard}
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/60 hover:border-amber-400/80 cursor-pointer active:scale-98 transition-all flex-shrink-0 shadow-sm"
        title="ចុចដើម្បីមើលតារាងជើងខ្លាំងច្រកប្រចាំថ្ងៃ"
      >
        <span className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-sm flex-shrink-0">
          🏆
        </span>
        <div className="min-w-0">
          <div className="font-black text-xs text-white truncate max-w-[110px]">
            {topPackerName || 'អ្នកច្រក'}
          </div>
          <div className="text-[10px] text-amber-300 font-bold truncate flex items-center gap-1">
            <span>ជើងខ្លាំង</span>
            <span className="text-slate-400 font-normal">({mySessionPacks} ខ្ញុំ)</span>
          </div>
        </div>
      </div>

      {/* Action Buttons Container (Grid on mobile: 50% / 50% perfectly symmetrical; Flex-1 on desktop) */}
      <div className="grid grid-cols-2 sm:flex sm:flex-1 items-center gap-2">
        {/* 2. Button: 🔍 បង់រួច - QC All Live */}
        <button
          type="button"
          onClick={onToggleAllLiveQc}
          className={`sm:flex-1 h-[48px] py-1 px-2.5 rounded-xl border flex items-center justify-between gap-1.5 shadow-md transition-all active:scale-98 cursor-pointer ${
            isAllLiveQcActive
              ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 border-emerald-300 text-white ring-2 ring-emerald-400/50 shadow-emerald-500/30'
              : 'bg-gradient-to-r from-emerald-950/90 via-teal-950/80 to-emerald-950/90 border-emerald-500/60 hover:border-emerald-400 text-emerald-100'
          }`}
          title="ចុចដើម្បីពិនិត្យផ្ទៀងផ្ទាត់កន្ត្រកបង់រួចទាំងអស់ពីគ្រប់ Live ទាំងអស់"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-emerald-500/30 border border-emerald-400/50 flex items-center justify-center text-xs sm:text-sm flex-shrink-0">
              🔍
            </span>
            <div className="text-left min-w-0">
              <div className="font-black text-[11px] sm:text-xs text-white flex items-center gap-1 truncate">
                <span>QC All Live</span>
                {isAllLiveQcActive && (
                  <span className="bg-emerald-300 text-slate-950 text-[8px] font-black px-1 rounded-full uppercase">
                    On
                  </span>
                )}
              </div>
              <div className="text-[9.5px] sm:text-[10px] text-emerald-300/90 font-medium truncate">
                {isAllLiveQcActive ? 'កំពុងមើល' : 'បង់រួចគ្រប់ Live'}
              </div>
            </div>
          </div>

          <span className="bg-emerald-400 text-slate-950 font-black text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg shadow-sm font-mono flex-shrink-0">
            {allLivePaidCount}
          </span>
        </button>

        {/* 3. Button: ⚡ AI Fast-Check Slips (Polished, Equal Height & Visual Symmetry) */}
        <button
          type="button"
          onClick={onOpenFastCheck}
          className="sm:flex-1 h-[48px] py-1 px-2.5 rounded-xl bg-gradient-to-r from-indigo-950/90 via-purple-950/90 to-indigo-950/90 border border-indigo-400/70 hover:border-indigo-300 text-white shadow-md flex items-center justify-between gap-1.5 cursor-pointer active:scale-98 transition-all group"
          title="ស្កេនរូបភាព Slips ឬ Paste ឈ្មោះដើម្បី Tick បង់រួចស្វ័យប្រវត្តិ"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-indigo-500/30 border border-indigo-400/50 flex items-center justify-center text-xs sm:text-sm flex-shrink-0 shadow-inner group-hover:scale-110 transition-transform">
              ⚡
            </span>
            <div className="text-left min-w-0">
              <div className="font-black text-[11px] sm:text-xs text-indigo-100 truncate">
                Fast-Check
              </div>
              <div className="text-[9.5px] sm:text-[10px] text-indigo-300 font-medium truncate">
                ស្កេនរូប Slips
              </div>
            </div>
          </div>

          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 text-slate-950 font-black text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md sm:rounded-lg shadow-sm font-mono flex-shrink-0">
            AI Free
          </span>
        </button>
      </div>

      {/* 4. Desktop Backlog pill (visible on sm: if backlog exists) */}
      {backlogCount > 0 && (
        <div
          onClick={onOpenBacklog}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-950/90 border border-rose-500 hover:border-rose-400 cursor-pointer active:scale-98 transition-all flex-shrink-0 animate-pulse"
          title={`មានកន្ត្រកកកស្ទះ ${backlogCount} នាក់ ពី Live មុនៗ`}
        >
          <span className="text-xs">🚨</span>
          <span className="text-rose-200 text-xs font-black font-mono">{backlogCount}</span>
        </div>
      )}
    </div>
  );
}
