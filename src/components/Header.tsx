import { FacebookPage } from '../types';

interface HeaderProps {
  activePage: FacebookPage | null;
  onOpenFbModal: () => void;
  dispatchedCount: number;
  onOpenDispatchModal: () => void;
  packerName: string;
  onOpenPackerHistory: () => void;
  liveSessions: { live_id: string; created_at: string; basket_count?: number }[];
  selectedLiveId: string;
  onSelectLiveId: (id: string) => void;
  onCreateLiveSession?: () => void;
  onOpenPickingModal: () => void;
  onToggleCommentStream: () => void;
  isStreamOpen: boolean;
  onAdjustFontSize: (delta: number) => void;
  khmerFont?: string;
  onChangeKhmerFont?: (font: string) => void;
}

export function Header({
  activePage,
  onOpenFbModal,
  dispatchedCount,
  onOpenDispatchModal,
  packerName,
  onOpenPackerHistory,
  liveSessions,
  selectedLiveId,
  onSelectLiveId,
  onCreateLiveSession,
  onOpenPickingModal,
  onToggleCommentStream,
  isStreamOpen,
  onAdjustFontSize,
  khmerFont = 'kantumruy',
  onChangeKhmerFont
}: HeaderProps) {
  return (
    <div className="bg-[#0B1325]/95 backdrop-blur-md border border-[#1C2B4B] p-2.5 rounded-2xl flex flex-col gap-2 shadow-[0_8px_25px_rgba(0,0,0,0.6)]">
      {/* Top Row: Brand & Badges */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-black text-sm bg-gradient-to-r from-[#00F0FF] to-[#38BDF8] bg-clip-text text-transparent">
            <span>⚡</span>
            <span>KARI ARNETT OS</span>
          </div>

          <a
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 flex items-center gap-1 active:scale-95 transition-all shadow-sm"
            title="បើកក្នុង Tab ថ្មីពេញលេញរបស់ Google Chrome ជៀសវាងការ Block Print ក្នុង Preview"
          >
            <span>↗️</span>
            <span>ផ្ទាំងពេញ</span>
          </a>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Facebook Connection Status Button */}
          <button
            onClick={onOpenFbModal}
            className={`px-2 py-1 rounded-xl text-[11px] font-black border flex items-center gap-1 transition-all ${
              activePage
                ? 'bg-blue-950/80 border-blue-500 text-sky-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
            title="គ្រប់គ្រង Facebook Page & Live"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="truncate max-w-[85px]">{activePage ? activePage.name : 'FB Page'}</span>
          </button>

          {/* Dispatched Count Pill */}
          <button
            onClick={onOpenDispatchModal}
            className="bg-gradient-to-r from-emerald-950/70 to-emerald-900/60 border-[1.5px] border-emerald-500 text-emerald-300 rounded-xl px-2 py-1 text-xs font-black flex items-center gap-1 shadow-sm active:scale-95 transition-all"
            title="ផ្ទៀងផ្ទាត់កញ្ចប់ចេញដឹកថ្ងៃនេះ"
          >
            <span>🚀</span>
            <span id="cnt-dispatched-today" className="text-emerald-400 font-mono font-black">
              {dispatchedCount}
            </span>
          </button>

          {/* Packer Tag */}
          <button
            onClick={onOpenPackerHistory}
            className="bg-gradient-to-r from-blue-900 to-blue-700 text-white px-2.5 py-1 rounded-xl text-xs font-black border border-blue-400 shadow-sm active:scale-95 transition-all truncate max-w-[80px]"
            title="ចុចមើលប្រវត្តិ ឬប្តូរឈ្មោះ"
          >
            👤 {packerName}
          </button>
        </div>
      </div>

      {/* Bottom Row: Tools & Selectors */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 items-center">
        {/* Live Session Selector + Quick New Live Button */}
        <div className="flex gap-1 min-w-0">
          <select
            value={selectedLiveId}
            onChange={e => {
              if (e.target.value === '__NEW_LIVE__') {
                onCreateLiveSession?.();
              } else {
                onSelectLiveId(e.target.value);
              }
            }}
            className="bg-slate-950/90 text-sky-400 border border-sky-600/40 px-2 py-1.5 rounded-xl text-xs font-bold outline-none truncate flex-1 shadow-inner focus:border-cyan-400"
          >
            <option value="">🌐 គ្រប់ Live (ទាំងអស់)</option>
            {liveSessions.map(session => {
              const raw = session.created_at || '';
              const day = raw.slice(8, 10);
              const month = raw.slice(5, 7);
              const time = raw.slice(11, 16);
              const dateDisp = day && month ? `${day}/${month}${time ? ` (${time})` : ''} ‧ ` : '';
              const countLabel = session.basket_count !== undefined ? ` (${session.basket_count} កន្ត្រក)` : '';
              const idLabel = session.live_id.length > 10 ? `Live #${session.live_id.slice(-8)}` : session.live_id;
              return (
                <option key={session.live_id} value={session.live_id}>
                  🎥 {dateDisp}{idLabel}{countLabel}
                </option>
              );
            })}
            {onCreateLiveSession && (
              <option value="__NEW_LIVE__">➕ បង្កើត Live ថ្មី...</option>
            )}
          </select>

          {onCreateLiveSession && (
            <button
              onClick={onCreateLiveSession}
              className="px-2 py-1.5 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-500/80 text-cyan-300 text-xs font-black active:scale-95 transition-all flex items-center gap-1 flex-shrink-0 cursor-pointer shadow-sm"
              title="បង្កើតវគ្គ Live ថ្មី (ការពារកុំឱ្យច្រឡំកូដ & តម្លៃពីម្សិលមិញ)"
            >
              <span>➕</span>
              <span className="hidden sm:inline">Live ថ្មី</span>
            </button>
          )}
        </div>

        {/* Live Comment Stream Toggle */}
        <button
          onClick={onToggleCommentStream}
          className={`px-2 py-1.5 rounded-xl font-black text-xs border flex items-center gap-1 transition-all ${
            isStreamOpen
              ? 'bg-rose-950 border-rose-500 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
              : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
          }`}
          title="បើក/បិទ ផ្ទាំងចាប់ខំមិន Live"
        >
          <span>💬</span>
          <span className="hidden sm:inline">ខំមិន</span>
        </button>

        {/* Picking List */}
        <button
          onClick={onOpenPickingModal}
          className="bg-[#064E3B] text-emerald-300 border border-emerald-500 px-2.5 py-1.5 rounded-xl font-extrabold text-xs whitespace-nowrap active:scale-95 transition-all shadow-sm"
        >
          📋 បញ្ជីប្រមូល
        </button>

        {/* Font Selection & Scaling Controls */}
        <div className="flex items-center gap-1">
          {onChangeKhmerFont && (
            <select
              value={khmerFont}
              onChange={e => onChangeKhmerFont(e.target.value)}
              className="bg-[#121E38] text-cyan-300 border border-[#1C2B4B] hover:border-cyan-400/80 px-2 py-1.5 rounded-xl font-bold text-xs outline-none cursor-pointer shadow-sm transition-all max-w-[130px] sm:max-w-none"
              title="ជ្រើសរើសពុម្ពអក្សរខ្មែរ (Khmer Font Style)"
            >
              <option value="kantumruy">✨ Kantumruy Pro (ស្រទន់)</option>
              <option value="santepheap">🌿 Koh Santepheap (ស្រឡះ)</option>
              <option value="battambang">🏛️ Battambang (បុរាណ)</option>
              <option value="koulen">🔥 Koulen (អក្សរឆ្លាក់)</option>
            </select>
          )}

          <div className="flex gap-0.5">
            <button
              onClick={() => onAdjustFontSize(0.08)}
              className="bg-[#121E38] text-white border border-[#1C2B4B] px-2 py-1.5 rounded-l-xl font-black text-xs hover:border-cyan-400 active:scale-95 transition-all"
              title="ពង្រីកអក្សរ (Increase Font)"
            >
              A+
            </button>
            <button
              onClick={() => onAdjustFontSize(-0.08)}
              className="bg-[#121E38] text-white border border-[#1C2B4B] px-2 py-1.5 rounded-r-xl font-black text-xs hover:border-cyan-400 active:scale-95 transition-all"
              title="បង្រួមអក្សរ (Decrease Font)"
            >
              A-
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
