interface WorkflowTabsProps {
  currentStage: number; // 1: មិនទាន់រើស, 2: រង់ចាំបង់, 3: QC, 4: ចេញដឹកហើយ
  onSwitchStage: (stage: number) => void;
  unpickedCount: number;
  waitingCount: number;
  paidQcCount: number;
  dispatchedCount: number;
  backlogCount?: number;
  onOpenBacklog?: () => void;
  activeSubFilter: 'ALL' | 'AMOUNT_DESC' | 'PP' | 'PROVINCE';
  onSetSubFilter: (flt: 'ALL' | 'AMOUNT_DESC' | 'PP' | 'PROVINCE') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  totalFilteredBaskets: number;
}

export function WorkflowTabs({
  currentStage,
  onSwitchStage,
  unpickedCount,
  waitingCount,
  paidQcCount,
  dispatchedCount,
  backlogCount = 0,
  onOpenBacklog,
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
          <span className="text-[10px] sm:text-[12px] font-extrabold whitespace-nowrap">🔍 បង់រួច-QC</span>
          <span className="font-mono text-lg sm:text-2xl font-black leading-tight mt-0.5 text-[#10B981] drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]">
            {paidQcCount}
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
          <span className="text-[10.5px] sm:text-[12px] font-extrabold whitespace-nowrap">🚚 ចេញដឹកហើយ</span>
          <span className="font-mono text-lg sm:text-2xl font-black leading-tight mt-0.5 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]">
            {dispatchedCount}
          </span>
        </button>
      </div>

      {/* 🎯 TIER 2: SUB-FILTERS */}
      <div className="grid grid-cols-4 gap-1.5 bg-[#0B1325]/95 p-1.5 rounded-2xl border-[1.5px] border-sky-400/20 shadow-md">
        <button
          onClick={() => onSetSubFilter('ALL')}
          className={`py-2 px-1 rounded-xl text-[11px] font-black whitespace-nowrap flex items-center justify-center gap-1 transition-all active:scale-95 border ${
            activeSubFilter === 'ALL'
              ? 'bg-gradient-to-r from-sky-600/40 to-blue-900 border-sky-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.4)]'
              : 'bg-[#070D1B] border-white/5 text-slate-400 hover:text-white'
          }`}
        >
          🌐 ទាំងអស់
        </button>

        <button
          onClick={() => onSetSubFilter('AMOUNT_DESC')}
          className={`py-2 px-1 rounded-xl text-[11px] font-black whitespace-nowrap flex items-center justify-center gap-1 transition-all active:scale-95 border ${
            activeSubFilter === 'AMOUNT_DESC'
              ? 'bg-gradient-to-r from-amber-600/40 to-amber-950 border-amber-500 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
              : 'bg-[#070D1B] border-white/5 text-slate-400 hover:text-white'
          }`}
        >
          💰 ច្រើនមុន
        </button>

        <button
          onClick={() => onSetSubFilter('PP')}
          className={`py-2 px-1 rounded-xl text-[11px] font-black whitespace-nowrap flex items-center justify-center gap-1 transition-all active:scale-95 border ${
            activeSubFilter === 'PP'
              ? 'bg-gradient-to-r from-emerald-600/40 to-emerald-950 border-emerald-500 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
              : 'bg-[#070D1B] border-white/5 text-slate-400 hover:text-white'
          }`}
        >
          🏙️ ភ្នំពេញ
        </button>

        <button
          onClick={() => onSetSubFilter('PROVINCE')}
          className={`py-2 px-1 rounded-xl text-[11px] font-black whitespace-nowrap flex items-center justify-center gap-1 transition-all active:scale-95 border ${
            activeSubFilter === 'PROVINCE'
              ? 'bg-gradient-to-r from-purple-600/40 to-purple-950 border-purple-500 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
              : 'bg-[#070D1B] border-white/5 text-slate-400 hover:text-white'
          }`}
        >
          🏞️ ខេត្ត
        </button>
      </div>

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
