interface WorkflowTabsProps {
  currentStage: number; // 1: មិនទាន់រើស, 2: រង់ចាំបង់, 3: QC, 4: ចេញដឹកហើយ
  onSwitchStage: (stage: number) => void;
  unpickedCount: number;
  emptyBasketsCount?: number;
  onCleanEmptyBaskets?: () => void;
  waitingCount: number;
  paidQcCount: number;
  dispatchedCount: number;
  backlogCount?: number;
  onOpenBacklog?: () => void;
  isAllLiveQc?: boolean;
  onToggleAllLiveQc?: () => void;
  allLivePaidCount?: number;
  delayedPaidCount?: number;
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
  activeSubFilter: 'ALL' | 'AMOUNT_DESC' | 'PP' | 'PROVINCE' | 'EMPTY' | 'DELAYED_FIRST';
  onSetSubFilter: (flt: 'ALL' | 'AMOUNT_DESC' | 'PP' | 'PROVINCE' | 'EMPTY' | 'DELAYED_FIRST') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  totalFilteredBaskets: number;
  onOpenScanner?: () => void;
}

export function WorkflowTabs({
  currentStage,
  onSwitchStage,
  unpickedCount,
  emptyBasketsCount = 0,
  onCleanEmptyBaskets,
  waitingCount,
  paidQcCount,
  dispatchedCount,
  isAllLiveQc = true,
  onToggleAllLiveQc,
  allLivePaidCount = 0,
  delayedPaidCount = 0,
  isAllLiveDispatched = true,
  onToggleAllLiveDispatched,
  allLiveDispatchedStats,
  dispatchedTimeFilter = 'ALL',
  onSetDispatchedTimeFilter,
  activeSubFilter,
  onSetSubFilter,
  searchQuery,
  onSearchChange,
  totalFilteredBaskets,
  onOpenScanner
}: WorkflowTabsProps) {
  const qcDisplayCount = isAllLiveQc ? allLivePaidCount : paidQcCount;
  const dispatchedDisplayCount = isAllLiveDispatched
    ? (allLiveDispatchedStats?.total ?? dispatchedCount)
    : dispatchedCount;

  return (
    <div className="flex flex-col gap-2">
      {/* 🧭 ROW 1: THE 4 CORE WORKFLOW STAGES (១ ជួរគត់ ស្រឡះភ្នែក និងលឿនបំផុត) */}
      <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#070D1B]/95 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md">
        {/* Stage 1: 🛒 មិនទាន់រើស */}
        <button
          type="button"
          onClick={() => onSwitchStage(1)}
          className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 border cursor-pointer ${
            currentStage === 1
              ? 'bg-gradient-to-b from-sky-600/40 via-sky-950/60 to-[#0A1226] border-sky-400 text-white shadow-[0_0_16px_rgba(56,189,248,0.4)]'
              : 'bg-[#050A14] border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-800'
          }`}
        >
          <div className="flex items-center gap-1">
            <span className="text-xs">🛒</span>
            <span className="text-[11px] sm:text-xs font-black truncate">មិនទាន់រើស</span>
          </div>
          <span
            className={`font-mono text-sm sm:text-base font-black leading-tight ${
              currentStage === 1 ? 'text-sky-300' : 'text-slate-300'
            }`}
          >
            {unpickedCount}
          </span>
        </button>

        {/* Stage 2: ⏳ រង់ចាំបង់ */}
        <button
          type="button"
          onClick={() => onSwitchStage(2)}
          className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 border cursor-pointer ${
            currentStage === 2
              ? 'bg-gradient-to-b from-amber-600/40 via-amber-950/60 to-[#140E05] border-amber-400 text-white shadow-[0_0_16px_rgba(245,158,11,0.4)]'
              : 'bg-[#050A14] border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-800'
          }`}
        >
          <div className="flex items-center gap-1">
            <span className="text-xs">⏳</span>
            <span className="text-[11px] sm:text-xs font-black truncate">រង់ចាំបង់</span>
          </div>
          <span
            className={`font-mono text-sm sm:text-base font-black leading-tight ${
              currentStage === 2 ? 'text-amber-300' : 'text-slate-300'
            }`}
          >
            {waitingCount}
          </span>
        </button>

        {/* Stage 3: 🔍 វេចខ្ចប់ QC */}
        <button
          type="button"
          onClick={() => onSwitchStage(3)}
          className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 border cursor-pointer relative overflow-visible ${
            currentStage === 3
              ? 'bg-gradient-to-b from-emerald-600/40 via-emerald-950/60 to-[#05140E] border-emerald-400 text-white shadow-[0_0_16px_rgba(16,185,129,0.4)]'
              : 'bg-[#050A14] border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-800'
          }`}
        >
          <div className="flex items-center gap-1">
            <span className="text-xs">🔍</span>
            <span className="text-[11px] sm:text-xs font-black truncate">វេចខ្ចប់ QC</span>
            {delayedPaidCount > 0 && (
              <span className="bg-rose-500 text-white text-[8px] font-black px-1 rounded-full animate-pulse whitespace-nowrap shadow-sm">
                +{delayedPaidCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 leading-tight">
            <span
              className={`font-mono text-sm sm:text-base font-black ${
                currentStage === 3 ? 'text-emerald-300' : 'text-slate-300'
              }`}
            >
              {qcDisplayCount}
            </span>
          </div>
        </button>

        {/* Stage 4: 🚚 ចេញដឹក */}
        <button
          type="button"
          onClick={() => onSwitchStage(4)}
          className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 border cursor-pointer ${
            currentStage === 4
              ? 'bg-gradient-to-b from-indigo-600/40 via-indigo-950/60 to-[#0A0D1F] border-indigo-400 text-white shadow-[0_0_16px_rgba(129,140,248,0.4)]'
              : 'bg-[#050A14] border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-800'
          }`}
        >
          <div className="flex items-center gap-1">
            <span className="text-xs">🚚</span>
            <span className="text-[11px] sm:text-xs font-black truncate">ចេញដឹក</span>
          </div>
          <span
            className={`font-mono text-sm sm:text-base font-black leading-tight ${
              currentStage === 4 ? 'text-indigo-300' : 'text-slate-300'
            }`}
          >
            {dispatchedDisplayCount}
          </span>
        </button>
      </div>

      {/* ⚡ ROW 2: CONTEXTUAL SUB-FILTERS (ត្រឹម ១ ជួរតូចល្មម មិនស្អេកស្កះ) */}

      {/* === SUB-FILTERS FOR STAGE 1 & 2 === */}
      {(currentStage === 1 || currentStage === 2) && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5">
          <button
            type="button"
            onClick={() => onSetSubFilter('ALL')}
            className={`py-1 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
              activeSubFilter === 'ALL'
                ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            🌐 ទាំងអស់
          </button>

          <button
            type="button"
            onClick={() => onSetSubFilter(activeSubFilter === 'AMOUNT_DESC' ? 'ALL' : 'AMOUNT_DESC')}
            className={`py-1 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
              activeSubFilter === 'AMOUNT_DESC'
                ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            💰 ច្រើនមុន
          </button>

          <button
            type="button"
            onClick={() => onSetSubFilter(activeSubFilter === 'PP' ? 'ALL' : 'PP')}
            className={`py-1 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
              activeSubFilter === 'PP'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            🏙️ ភ្នំពេញ
          </button>

          <button
            type="button"
            onClick={() => onSetSubFilter(activeSubFilter === 'PROVINCE' ? 'ALL' : 'PROVINCE')}
            className={`py-1 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
              activeSubFilter === 'PROVINCE'
                ? 'bg-purple-500/20 border-purple-400 text-purple-200'
                : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            🏕️ ខេត្ត
          </button>

          {emptyBasketsCount > 0 && (
            <button
              type="button"
              onClick={() => onSetSubFilter(activeSubFilter === 'EMPTY' ? 'ALL' : 'EMPTY')}
              className={`py-1 px-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ml-auto ${
                activeSubFilter === 'EMPTY'
                  ? 'bg-rose-500/30 border-rose-400 text-rose-200'
                  : 'bg-rose-950/30 border-rose-900/50 text-rose-300 hover:border-rose-700'
              }`}
            >
              🗑️ ទទេ ({emptyBasketsCount})
            </button>
          )}
        </div>
      )}

      {/* === SUB-FILTERS FOR STAGE 3 (QC) === */}
      {currentStage === 3 && (
        <div className="flex flex-col gap-1.5">
          {/* Quick Scope & Location Filters in 1 single horizontal bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5">
            {/* Minimal Scope Toggle: All Live vs This Live */}
            <div className="flex items-center bg-[#050A14] p-0.5 rounded-lg border border-slate-800 flex-shrink-0">
              <button
                type="button"
                onClick={() => !isAllLiveQc && onToggleAllLiveQc?.()}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  isAllLiveQc
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🌐 គ្រប់ឡាយ ({allLivePaidCount})
              </button>
              <button
                type="button"
                onClick={() => isAllLiveQc && onToggleAllLiveQc?.()}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  !isAllLiveQc
                    ? 'bg-emerald-600 text-white font-black shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🎥 Live នេះ ({paidQcCount})
              </button>
            </div>

            {/* Quick Filters */}
            <button
              type="button"
              onClick={() => onSetSubFilter('ALL')}
              className={`py-1 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
                activeSubFilter === 'ALL'
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                  : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              ទាំងអស់
            </button>

            {delayedPaidCount > 0 && (
              <button
                type="button"
                onClick={() => onSetSubFilter(activeSubFilter === 'DELAYED_FIRST' ? 'ALL' : 'DELAYED_FIRST')}
                className={`py-1 px-2.5 rounded-lg text-xs font-black whitespace-nowrap transition-all active:scale-95 border cursor-pointer flex items-center gap-1 ${
                  activeSubFilter === 'DELAYED_FIRST'
                    ? 'bg-gradient-to-r from-amber-600 to-rose-600 border-amber-300 text-white shadow-md'
                    : 'bg-amber-950/50 border-amber-500/60 text-amber-300 hover:border-amber-400 animate-pulse'
                }`}
              >
                <span>🚨 យឺតមុន ({delayedPaidCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onSetSubFilter(activeSubFilter === 'PP' ? 'ALL' : 'PP')}
              className={`py-1 px-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
                activeSubFilter === 'PP'
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                  : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              🏙️ ភ្នំពេញ
            </button>

            <button
              type="button"
              onClick={() => onSetSubFilter(activeSubFilter === 'PROVINCE' ? 'ALL' : 'PROVINCE')}
              className={`py-1 px-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
                activeSubFilter === 'PROVINCE'
                  ? 'bg-purple-500/25 border-purple-400 text-purple-200'
                  : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              🏕️ ខេត្ត
            </button>
          </div>

          {/* Slim 1-line Delayed Orders Alert Banner (only when delayed orders exist and not currently viewing delayed) */}
          {delayedPaidCount > 0 && activeSubFilter !== 'DELAYED_FIRST' && (
            <div
              onClick={() => onSetSubFilter('DELAYED_FIRST')}
              className="flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-r from-amber-950/80 via-[#261404] to-amber-950/80 border border-amber-500/60 rounded-xl cursor-pointer hover:border-amber-400 transition-all text-xs"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm">🚨</span>
                <span className="text-amber-200 font-bold truncate">
                  មាន <strong className="text-white underline">{delayedPaidCount} កញ្ចប់</strong> ភ្ញៀវវេលុយយឺត (ឡាយចាស់) ត្រូវចេញថ្ងៃនេះ!
                </span>
              </div>
              <span className="text-[11px] font-black text-amber-300 hover:text-white flex-shrink-0 ml-2">
                មើលឥឡូវ →
              </span>
            </div>
          )}
        </div>
      )}

      {/* === SUB-FILTERS FOR STAGE 4 (DISPATCHED) === */}
      {currentStage === 4 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5">
          {/* Scope Toggle */}
          <div className="flex items-center bg-[#050A14] p-0.5 rounded-lg border border-slate-800 flex-shrink-0">
            <button
              type="button"
              onClick={() => !isAllLiveDispatched && onToggleAllLiveDispatched?.()}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                isAllLiveDispatched
                  ? 'bg-indigo-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🌐 គ្រប់ឡាយ
            </button>
            <button
              type="button"
              onClick={() => isAllLiveDispatched && onToggleAllLiveDispatched?.()}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                !isAllLiveDispatched
                  ? 'bg-indigo-600 text-white font-black shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🎥 Live នេះ ({dispatchedCount})
            </button>
          </div>

          {/* Quick Filters */}
          {allLiveDispatchedStats && (
            <>
              <button
                type="button"
                onClick={() => onSetDispatchedTimeFilter?.(dispatchedTimeFilter === 'TODAY' ? 'ALL' : 'TODAY')}
                className={`py-1 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
                  dispatchedTimeFilter === 'TODAY'
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                    : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                📅 ចេញថ្ងៃនេះ ({allLiveDispatchedStats.today})
              </button>

              <button
                type="button"
                onClick={() => onSetDispatchedTimeFilter?.(dispatchedTimeFilter === 'PP' ? 'ALL' : 'PP')}
                className={`py-1 px-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
                  dispatchedTimeFilter === 'PP'
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                    : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                🏙️ ភ្នំពេញ ({allLiveDispatchedStats.pp})
              </button>

              <button
                type="button"
                onClick={() => onSetDispatchedTimeFilter?.(dispatchedTimeFilter === 'PROVINCE' ? 'ALL' : 'PROVINCE')}
                className={`py-1 px-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
                  dispatchedTimeFilter === 'PROVINCE'
                    ? 'bg-purple-500/25 border-purple-400 text-purple-200'
                    : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                🏕️ ខេត្ត ({allLiveDispatchedStats.province})
              </button>

              <button
                type="button"
                onClick={() => onSetDispatchedTimeFilter?.('ALL')}
                className={`py-1 px-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all active:scale-95 border cursor-pointer ${
                  dispatchedTimeFilter === 'ALL'
                    ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200'
                    : 'bg-[#080E1C] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                ទាំងអស់ ({allLiveDispatchedStats.total})
              </button>
            </>
          )}
        </div>
      )}

      {/* 🧹 EMPTY BASKETS BULK CLEANUP BANNER */}
      {(currentStage === 1 || currentStage === 2) && activeSubFilter === 'EMPTY' && (
        <div className="flex items-center justify-between p-2 bg-[#1a080c]/90 border border-rose-500/40 rounded-xl shadow-md">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base">🗑️</span>
            <span className="text-xs font-bold text-rose-200 truncate">
              កន្ត្រកទទេគ្មានទំនិញ ({totalFilteredBaskets} កន្ត្រក)
            </span>
          </div>
          {onCleanEmptyBaskets && totalFilteredBaskets > 0 && (
            <button
              type="button"
              onClick={onCleanEmptyBaskets}
              className="px-2.5 py-1 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white rounded-lg text-xs font-black shadow-sm flex items-center gap-1 active:scale-95 transition-all border border-rose-400/50 cursor-pointer flex-shrink-0"
            >
              <span>🧹 សម្អាត ({totalFilteredBaskets})</span>
            </button>
          )}
        </div>
      )}

      {/* 🔍 ROW 3: SEARCH BAR & SCANNER & BASKET COUNT */}
      <div className="flex gap-1.5 items-center">
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="🔍 ស្វែងរកកូដ, ឈ្មោះ, លេខ, កន្ត្រក #..."
          className="flex-1 bg-slate-900/90 border border-slate-700 text-white px-3 py-1.5 sm:py-2 rounded-xl text-xs outline-none focus:border-cyan-400 transition-all placeholder:text-slate-500 font-medium"
        />

        {/* 📷 In-App Camera Scanner Button */}
        {onOpenScanner && (
          <button
            type="button"
            onClick={onOpenScanner}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-2.5 py-1.5 sm:py-2 rounded-xl font-black text-xs whitespace-nowrap shadow-sm active:scale-95 transition-all flex items-center gap-1 border border-cyan-400/50 cursor-pointer flex-shrink-0"
            title="ស្កេនកាមេរ៉ា (QR & Barcode)"
          >
            <span>📷</span>
            <span className="hidden sm:inline">ស្កេន</span>
          </button>
        )}

        <div className="bg-slate-900 border border-slate-700 text-slate-300 px-2.5 py-1.5 sm:py-2 rounded-xl font-bold text-xs whitespace-nowrap font-mono shadow-sm flex-shrink-0">
          📦 {totalFilteredBaskets}
        </div>
      </div>
    </div>
  );
}
