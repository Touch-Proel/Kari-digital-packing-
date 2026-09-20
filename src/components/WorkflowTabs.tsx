interface WorkflowTabsProps {
  currentStage: number; // 1: មិនទាន់រើស, 2: រង់ចាំបង់, 3: QC, 4: ចេញដឹកហើយ
  onSwitchStage: (stage: number) => void;
  unpickedCount: number;
  emptyBasketsCount?: number;
  waitingCount: number;
  paidQcCount: number;
  dispatchedCount: number;
  backlogCount?: number;
  onOpenBacklog?: () => void;
  isAllLiveQc?: boolean;
  onToggleAllLiveQc?: () => void;
  allLivePaidCount?: number;
  isAllLiveDispatched?: boolean;
  onToggleAllLiveDispatched?: () => void;
  allLiveDispatchedStats?: {
    total: number;
    today: number;
    pp: number;
    province: number;
    today_pp: number;
    today_province: number;
  };
  dispatchedTimeFilter?: 'ALL' | 'TODAY' | 'PP' | 'PROVINCE';
  onSetDispatchedTimeFilter?: (flt: 'ALL' | 'TODAY' | 'PP' | 'PROVINCE') => void;
  activeSubFilter: 'ALL' | 'AMOUNT_DESC' | 'PP' | 'PROVINCE' | 'EMPTY';
  onSetSubFilter: (flt: 'ALL' | 'AMOUNT_DESC' | 'PP' | 'PROVINCE' | 'EMPTY') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  totalFilteredBaskets: number;
}

export function WorkflowTabs({
  currentStage,
  onSwitchStage,
  unpickedCount,
  emptyBasketsCount = 0,
  waitingCount,
  paidQcCount,
  dispatchedCount,
  isAllLiveQc = false,
  onToggleAllLiveQc,
  allLivePaidCount = 0,
  isAllLiveDispatched = false,
  onToggleAllLiveDispatched,
  allLiveDispatchedStats,
  dispatchedTimeFilter = 'ALL',
  onSetDispatchedTimeFilter,
  activeSubFilter,
  onSetSubFilter,
  searchQuery,
  onSearchChange,
  totalFilteredBaskets
}: WorkflowTabsProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {/* 🚀 TIER 1: 4-STAGE WORKFLOW TABS */}
      <div className="grid grid-cols-4 gap-1.5 bg-[#0B1325]/95 p-1.5 rounded-2xl border-[1.5px] border-sky-400/25 shadow-xl">
        {/* Tab 1: Unpicked */}
        <button
          onClick={() => onSwitchStage(1)}
          className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 border ${
            currentStage === 1
              ? 'bg-gradient-to-b from-sky-500/30 to-slate-900 border-[#00F0FF] shadow-[0_0_18px_rgba(0,240,255,0.35)] text-white'
              : 'bg-[#070D1B] border-white/5 text-slate-400 hover:border-slate-700'
          }`}
        >
          <span className="text-[10.5px] sm:text-[12px] font-extrabold whitespace-nowrap">🛒 មិនទាន់រើស</span>
          <span
            className={`font-mono text-lg sm:text-2xl font-black leading-tight mt-0.5 ${
              currentStage === 1 ? 'text-[#00F0FF] drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]' : 'text-slate-300'
            }`}
          >
            {unpickedCount}
          </span>
        </button>

        {/* Tab 2: Pending Payment */}
        <button
          onClick={() => onSwitchStage(2)}
          className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 border ${
            currentStage === 2
              ? 'bg-gradient-to-b from-amber-500/30 to-slate-900 border-[#F59E0B] shadow-[0_0_18px_rgba(245,158,11,0.35)] text-white'
              : 'bg-[#070D1B] border-white/5 text-slate-400 hover:border-slate-700'
          }`}
        >
          <span className="text-[10.5px] sm:text-[12px] font-extrabold whitespace-nowrap">⏳ រង់ចាំបង់</span>
          <span
            className={`font-mono text-lg sm:text-2xl font-black leading-tight mt-0.5 ${
              currentStage === 2 ? 'text-[#F59E0B] drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'text-slate-300'
            }`}
          >
            {waitingCount}
          </span>
        </button>

        {/* Tab 3: Paid-QC */}
        <button
          onClick={() => onSwitchStage(3)}
          className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 border ${
            currentStage === 3
              ? 'bg-gradient-to-b from-emerald-500/35 to-slate-900 border-[#10B981] shadow-[0_0_20px_rgba(16,185,129,0.45)] text-white'
              : 'bg-[#070D1B] border-white/5 text-slate-400 hover:border-slate-700'
          }`}
        >
          <span className="text-[10px] sm:text-[12px] font-extrabold whitespace-nowrap flex items-center gap-1">
            <span>🔍 បង់រួច-QC</span>
            {isAllLiveQc && (
              <span className="bg-emerald-400 text-slate-950 text-[8.5px] font-black px-1 rounded-full uppercase">
                All
              </span>
            )}
          </span>
          <span className="font-mono text-lg sm:text-2xl font-black leading-tight mt-0.5 text-[#10B981] drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]">
            {isAllLiveQc ? allLivePaidCount : paidQcCount}
          </span>
        </button>

        {/* Tab 4: Dispatched */}
        <button
          onClick={() => onSwitchStage(4)}
          className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 border ${
            currentStage === 4
              ? 'bg-gradient-to-b from-indigo-500/35 to-slate-900 border-indigo-400 shadow-[0_0_20px_rgba(129,140,248,0.45)] text-white'
              : 'bg-[#070D1B] border-white/5 text-slate-400 hover:border-slate-700'
          }`}
        >
          <span className="text-[10px] sm:text-[12px] font-extrabold whitespace-nowrap flex items-center gap-1">
            <span>🚚 ចេញដឹកហើយ</span>
            {isAllLiveDispatched && (
              <span className="bg-indigo-400 text-slate-950 text-[8.5px] font-black px-1 rounded-full uppercase">
                All
              </span>
            )}
          </span>
          <span className="font-mono text-lg sm:text-2xl font-black leading-tight mt-0.5 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]">
            {isAllLiveDispatched ? (allLiveDispatchedStats?.total ?? dispatchedCount) : dispatchedCount}
          </span>
        </button>
      </div>

      {/* 🌟 STAGE 3 SPECIAL MODE: LIVE vs ALL-LIVE TOGGLE */}
      {currentStage === 3 && (
        <div className="p-1 bg-[#06101E]/95 rounded-2xl border border-emerald-500/40 shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-md">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#030812] rounded-xl border border-emerald-950/80">
            <button
              type="button"
              onClick={() => isAllLiveQc && onToggleAllLiveQc?.()}
              className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 active:scale-98 ${
                !isAllLiveQc
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] border border-emerald-400/60 ring-1 ring-emerald-300/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="text-sm">🎥</span>
              <span className="whitespace-nowrap tracking-wide">Live បច្ចុប្បន្ន</span>
              <span className={`font-mono text-xs px-2 py-0.5 rounded-full font-black ${
                !isAllLiveQc
                  ? 'bg-emerald-950/90 text-emerald-200 border border-emerald-400/50 shadow-inner'
                  : 'bg-slate-800/90 text-slate-400 border border-slate-700'
              }`}>
                {paidQcCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => !isAllLiveQc && onToggleAllLiveQc?.()}
              className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 active:scale-98 ${
                isAllLiveQc
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-[0_0_18px_rgba(20,184,166,0.5)] border border-teal-200 ring-1 ring-teal-200 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="text-sm">🌐</span>
              <span className="whitespace-nowrap tracking-wide">គ្រប់ឡាយ All Live</span>
              <span className={`font-mono text-xs px-2 py-0.5 rounded-full font-black ${
                isAllLiveQc
                  ? 'bg-slate-950 text-emerald-300 border border-emerald-400/60 shadow-inner'
                  : 'bg-slate-800/90 text-slate-400 border border-slate-700'
              }`}>
                {allLivePaidCount}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 🚚 STAGE 4 SPECIAL MODE: LIVE vs ALL-LIVE DISPATCHED TOGGLE & DAILY STATS */}
      {currentStage === 4 && (
        <div className="flex flex-col gap-2 p-1.5 bg-[#080E21]/95 rounded-2xl border border-indigo-500/40 shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-md">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#030614] rounded-xl border border-indigo-950/80">
            <button
              type="button"
              onClick={() => isAllLiveDispatched && onToggleAllLiveDispatched?.()}
              className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 active:scale-98 ${
                !isAllLiveDispatched
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] border border-indigo-400/60 ring-1 ring-indigo-300/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="text-sm">🎥</span>
              <span className="whitespace-nowrap tracking-wide">Live បច្ចុប្បន្ន</span>
              <span className={`font-mono text-xs px-2 py-0.5 rounded-full font-black ${
                !isAllLiveDispatched
                  ? 'bg-indigo-950/90 text-indigo-200 border border-indigo-400/50 shadow-inner'
                  : 'bg-slate-800/90 text-slate-400 border border-slate-700'
              }`}>
                {dispatchedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => !isAllLiveDispatched && onToggleAllLiveDispatched?.()}
              className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 active:scale-98 ${
                isAllLiveDispatched
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-slate-950 shadow-[0_0_18px_rgba(129,140,248,0.5)] border border-indigo-200 ring-1 ring-indigo-200 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="text-sm">🌐</span>
              <span className="whitespace-nowrap tracking-wide">គ្រប់ឡាយ All Live</span>
              <span className={`font-mono text-xs px-2 py-0.5 rounded-full font-black ${
                isAllLiveDispatched
                  ? 'bg-slate-950 text-indigo-300 border border-indigo-400/60 shadow-inner'
                  : 'bg-slate-800/90 text-slate-400 border border-slate-700'
              }`}>
                {allLiveDispatchedStats?.total || 0}
              </span>
            </button>
          </div>

          {/* 📊 Daily Output Summary Strip (ដឹងថ្ងៃនឹងគ្រប់ឡាយចេញបានប៉ុន្មាន) */}
          {isAllLiveDispatched && allLiveDispatchedStats && (
            <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-indigo-500/30 text-center">
              {/* 1. Today Filter */}
              <button
                type="button"
                onClick={() => onSetDispatchedTimeFilter?.(dispatchedTimeFilter === 'TODAY' ? 'ALL' : 'TODAY')}
                className={`rounded-xl py-1.5 px-1 border transition-all text-center flex flex-col items-center justify-center active:scale-95 ${
                  dispatchedTimeFilter === 'TODAY'
                    ? 'bg-amber-500/35 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.5)] ring-1 ring-amber-300'
                    : 'bg-indigo-900/40 border-indigo-400/20 text-slate-300 hover:border-indigo-400/50 hover:bg-indigo-900/60'
                }`}
              >
                <span className="text-[9.5px] font-black text-amber-300">📅 ចេញថ្ងៃនេះ</span>
                <span className="text-sm font-black text-amber-300 font-mono">
                  {allLiveDispatchedStats.today} <span className="text-[9px] font-normal">កញ្ចប់</span>
                </span>
              </button>

              {/* 2. PP Filter */}
              <button
                type="button"
                onClick={() => onSetDispatchedTimeFilter?.(dispatchedTimeFilter === 'PP' ? 'ALL' : 'PP')}
                className={`rounded-xl py-1.5 px-1 border transition-all text-center flex flex-col items-center justify-center active:scale-95 ${
                  dispatchedTimeFilter === 'PP'
                    ? 'bg-emerald-600/40 border-emerald-400 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.5)] ring-1 ring-emerald-300'
                    : 'bg-indigo-900/40 border-indigo-400/20 text-slate-300 hover:border-indigo-400/50 hover:bg-indigo-900/60'
                }`}
              >
                <span className="text-[9.5px] font-bold text-emerald-300">🏙️ ភ្នំពេញ</span>
                <span className="text-sm font-black text-emerald-400 font-mono">
                  {allLiveDispatchedStats.pp} <span className="text-[9px] font-normal text-slate-300">កញ្ចប់</span>
                </span>
              </button>

              {/* 3. Province Filter */}
              <button
                type="button"
                onClick={() => onSetDispatchedTimeFilter?.(dispatchedTimeFilter === 'PROVINCE' ? 'ALL' : 'PROVINCE')}
                className={`rounded-xl py-1.5 px-1 border transition-all text-center flex flex-col items-center justify-center active:scale-95 ${
                  dispatchedTimeFilter === 'PROVINCE'
                    ? 'bg-purple-600/40 border-purple-400 text-purple-100 shadow-[0_0_12px_rgba(168,85,247,0.5)] ring-1 ring-purple-300'
                    : 'bg-indigo-900/40 border-indigo-400/20 text-slate-300 hover:border-indigo-400/50 hover:bg-indigo-900/60'
                }`}
              >
                <span className="text-[9.5px] font-bold text-purple-300">🏞️ ខេត្ត</span>
                <span className="text-sm font-black text-purple-300 font-mono">
                  {allLiveDispatchedStats.province} <span className="text-[9px] font-normal text-slate-300">កញ្ចប់</span>
                </span>
              </button>

              {/* 4. All Filter */}
              <button
                type="button"
                onClick={() => onSetDispatchedTimeFilter?.('ALL')}
                className={`rounded-xl py-1.5 px-1 border transition-all text-center flex flex-col items-center justify-center active:scale-95 ${
                  dispatchedTimeFilter === 'ALL'
                    ? 'bg-indigo-600/40 border-indigo-400 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] ring-1 ring-indigo-300'
                    : 'bg-indigo-900/40 border-indigo-400/20 text-slate-300 hover:border-indigo-400/50 hover:bg-indigo-900/60'
                }`}
              >
                <span className="text-[9.5px] font-bold text-sky-300">📦 សរុបទាំងអស់</span>
                <span className="text-sm font-black text-sky-300 font-mono">
                  {allLiveDispatchedStats.total} <span className="text-[9px] font-normal text-slate-300">កញ្ចប់</span>
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 🎯 TIER 2: SUB-FILTERS (Only for Tab 1: មិនទាន់រើស) */}
      {currentStage === 1 && (
        <div className="grid grid-cols-5 gap-1.5 bg-[#0B1325]/95 p-1.5 rounded-2xl border-[1.5px] border-sky-400/20 shadow-md">
          <button
            onClick={() => onSetSubFilter('ALL')}
            className={`py-2 px-1 rounded-xl text-[10.5px] sm:text-[11px] font-black whitespace-nowrap flex items-center justify-center gap-1 transition-all active:scale-95 border ${
              activeSubFilter === 'ALL'
                ? 'bg-gradient-to-r from-sky-600/40 to-blue-900 border-sky-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                : 'bg-[#070D1B] border-white/5 text-slate-400 hover:text-white'
            }`}
          >
            🌐 ទាំងអស់
          </button>

          <button
            onClick={() => onSetSubFilter('AMOUNT_DESC')}
            className={`py-2 px-1 rounded-xl text-[10.5px] sm:text-[11px] font-black whitespace-nowrap flex items-center justify-center gap-1 transition-all active:scale-95 border ${
              activeSubFilter === 'AMOUNT_DESC'
                ? 'bg-gradient-to-r from-amber-600/40 to-amber-950 border-amber-500 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                : 'bg-[#070D1B] border-white/5 text-slate-400 hover:text-white'
            }`}
          >
            💰 ច្រើនមុន
          </button>

          <button
            onClick={() => onSetSubFilter('PP')}
            className={`py-2 px-1 rounded-xl text-[10.5px] sm:text-[11px] font-black whitespace-nowrap flex items-center justify-center gap-1 transition-all active:scale-95 border ${
              activeSubFilter === 'PP'
                ? 'bg-gradient-to-r from-emerald-600/40 to-emerald-950 border-emerald-500 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                : 'bg-[#070D1B] border-white/5 text-slate-400 hover:text-white'
            }`}
          >
            🏙️ ភ្នំពេញ
          </button>

          <button
            onClick={() => onSetSubFilter('PROVINCE')}
            className={`py-2 px-1 rounded-xl text-[10.5px] sm:text-[11px] font-black whitespace-nowrap flex items-center justify-center gap-1 transition-all active:scale-95 border ${
              activeSubFilter === 'PROVINCE'
                ? 'bg-gradient-to-r from-purple-600/40 to-purple-950 border-purple-500 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                : 'bg-[#070D1B] border-white/5 text-slate-400 hover:text-white'
            }`}
          >
            🏞️ ខេត្ត
          </button>

          <button
            onClick={() => onSetSubFilter('EMPTY')}
            className={`py-2 px-1 rounded-xl text-[10.5px] sm:text-[11px] font-black whitespace-nowrap flex items-center justify-center gap-1 transition-all active:scale-95 border ${
              activeSubFilter === 'EMPTY'
                ? 'bg-gradient-to-r from-rose-600/40 to-rose-950 border-rose-500 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                : emptyBasketsCount > 0
                  ? 'bg-rose-950/20 border-rose-800/40 text-rose-300/80 hover:text-rose-200 hover:border-rose-600'
                  : 'bg-[#070D1B] border-white/5 text-slate-500 hover:text-slate-300'
            }`}
            title="កន្ត្រកដែលដកកូដចេញអស់ ($0.00 / 0 មុខ)"
          >
            <span>🗑️ ទទេ</span>
            {emptyBasketsCount > 0 && (
              <span className={`text-[9px] font-mono px-1 py-0.2 rounded-full font-black ${
                activeSubFilter === 'EMPTY' ? 'bg-rose-500 text-white' : 'bg-rose-900/80 text-rose-200 border border-rose-700/60'
              }`}>
                {emptyBasketsCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* 🔍 SEARCH HUD */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="🔍 ស្វែងរកកូដ, ឈ្មោះ, លេខ, កន្ត្រក #..."
          className="flex-1 bg-slate-900/90 border-[1.5px] border-slate-700 text-white px-3.5 py-2 rounded-xl text-xs outline-none focus:border-cyan-400 transition-all placeholder:text-slate-500 font-medium"
        />
        <div className="bg-slate-900 border-[1.5px] border-cyan-400/80 text-cyan-400 px-3 py-2 rounded-xl font-black text-xs whitespace-nowrap font-mono shadow-sm">
          📦 {totalFilteredBaskets} កន្ត្រក
        </div>
      </div>
    </div>
  );
}
