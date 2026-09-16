import { FacebookPage } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  activePage: FacebookPage | null;
  onOpenFbModal: () => void;
  dispatchedCount: number;
  onOpenDispatchModal: () => void;
  onOpenDatabaseModal?: () => void;
  packerName: string;
  onOpenPackerHistory: () => void;
  onChangePackerName?: () => void;
  liveSessions: { live_id: string; created_at: string; basket_count?: number }[];
  selectedLiveId: string;
  onSelectLiveId: (id: string) => void;
  onCreateLiveSession?: () => void;
  onOpenManageLiveModal?: () => void;
  onOpenPickingModal: () => void;
  onToggleCommentStream: () => void;
  isStreamOpen: boolean;
  onAdjustFontSize: (delta: number) => void;
  khmerFont?: string;
  onChangeKhmerFont?: (font: string) => void;
  totalBasketCount?: number;
  onOpenKHQRModal?: () => void;
}

export function Header({
  activePage,
  onOpenFbModal,
  dispatchedCount,
  onOpenDispatchModal,
  onOpenDatabaseModal,
  packerName,
  onOpenPackerHistory,
  onChangePackerName,
  liveSessions,
  selectedLiveId,
  onSelectLiveId,
  onCreateLiveSession,
  onOpenManageLiveModal,
  onOpenPickingModal,
  onToggleCommentStream,
  isStreamOpen,
  onAdjustFontSize,
  khmerFont = 'kantumruy',
  onChangeKhmerFont,
  totalBasketCount,
  onOpenKHQRModal
}: HeaderProps) {
  return (
    <div className="bg-[#0B1325]/95 backdrop-blur-md border border-[#1C2B4B] p-2.5 rounded-2xl flex flex-col gap-2 shadow-[0_8px_25px_rgba(0,0,0,0.6)]">
      {/* Top Row: Brand & Badges */}
      <div className="flex flex-wrap sm:flex-nowrap justify-between items-center gap-2">
        {/* Brand & Open Fullscreen */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 font-black text-xs sm:text-sm bg-gradient-to-r from-[#00F0FF] to-[#38BDF8] bg-clip-text text-transparent">
            <span>⚡</span>
            <span>KARI ARNETT OS</span>
          </div>

          {/* PWA Install Button */}
          <PWAInstallButton />

          <a
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 flex items-center gap-1 active:scale-95 transition-all shadow-sm"
            title="បើកក្នុង Tab ថ្មីពេញលេញរបស់ Google Chrome"
          >
            <span>↗️</span>
            <span className="hidden xs:inline">ផ្ទាំងពេញ</span>
          </a>
        </div>

        {/* Action Pills */}
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap justify-end">
          {/* KHQR Quick Scan Button */}
          {onOpenKHQRModal && (
            <button
              onClick={onOpenKHQRModal}
              className="px-2.5 py-1 rounded-xl text-[11px] font-black border border-red-500/80 bg-[#E11925] hover:bg-[#c91420] text-white flex items-center gap-1 transition-all shadow-[0_0_12px_rgba(225,25,37,0.45)] active:scale-95 cursor-pointer"
              title="បើកស្កេន Bakong KHQR (ABA Bank)"
            >
              <span className="bg-white text-[#E11925] text-[10px] font-black px-1 rounded shadow-sm">
                KHQR
              </span>
              <span className="hidden xs:inline">ស្កេន ABA</span>
            </button>
          )}

          {/* Facebook Connection Status Button */}
          <button
            onClick={onOpenFbModal}
            className={`px-2 py-1 rounded-xl text-[11px] font-bold border flex items-center gap-1 transition-all ${
              activePage
                ? 'bg-blue-950/80 border-blue-500/60 text-sky-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
            title="គ្រប់គ្រង Facebook Page & Live"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></span>
            <span className="truncate max-w-[70px] sm:max-w-[100px]">{activePage ? activePage.name : 'FB Page'}</span>
          </button>

          {/* Settings & Database Button */}
          {onOpenDatabaseModal && (
            <button
              onClick={onOpenDatabaseModal}
              className="px-2.5 py-1 rounded-xl text-[11px] font-bold border bg-cyan-950/70 border-cyan-500/50 text-cyan-300 hover:bg-cyan-900 flex items-center gap-1 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="ការកំណត់ហាង, កំណត់ KHQR (Upload) & ទិន្នន័យ SQLite"
            >
              <span>⚙️</span>
              <span className="hidden xs:inline">Settings</span>
            </button>
          )}

          {/* Dispatched Count Pill */}
          <button
            onClick={onOpenDispatchModal}
            className="bg-emerald-950/70 border border-emerald-500/60 text-emerald-300 rounded-xl px-2 py-1 text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
            title="ផ្ទៀងផ្ទាត់កញ្ចប់ចេញដឹកថ្ងៃនេះ"
          >
            <span>🚀</span>
            <span id="cnt-dispatched-today" className="text-emerald-400 font-mono font-black">
              {dispatchedCount}
            </span>
          </button>

          {/* Packer Tag */}
          <button
            onClick={() => {
              if (onChangePackerName) {
                onChangePackerName();
              } else {
                onOpenPackerHistory();
              }
            }}
            className="bg-[#0D2847] hover:bg-[#12365E] text-cyan-200 border border-cyan-400/80 px-2.5 py-1 rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all truncate max-w-[100px] sm:max-w-[120px] flex items-center gap-1 cursor-pointer"
            title="ចុចដើម្បីប្តូរឈ្មោះអ្នករៀបអីវ៉ាន់"
          >
            <span>👤</span>
            <span className="truncate">{packerName || 'កំណត់ឈ្មោះ'}</span>
            <span className="text-[10px] text-amber-400">✏️</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: Tools & Selectors (Clean Flex Wrap Layout) */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-slate-800/60">
        {/* Live Session Selector + Quick Manage Buttons */}
        <div className="flex items-center gap-1 min-w-[160px] flex-1">
          {(() => {
            const currentLiveSession = liveSessions.find(s => s.live_id === selectedLiveId);
            let liveDisplayTitle = '🌐 គ្រប់ Live (ទាំងអស់)';
            if (selectedLiveId && currentLiveSession) {
              const raw = currentLiveSession.created_at || '';
              const day = raw.slice(8, 10);
              const month = raw.slice(5, 7);
              const time = raw.slice(11, 16);
              const dateDisp = day && month ? `${day}/${month}${time ? ` (${time})` : ''} ‧ ` : '';
              const idLabel = selectedLiveId.length > 10 ? `Live #${selectedLiveId.slice(-8)}` : selectedLiveId;
              const displayCount = totalBasketCount !== undefined ? totalBasketCount : (currentLiveSession.basket_count ?? 0);
              const countLabel = ` (${displayCount} កន្ត្រក)`;
              liveDisplayTitle = `🎥 ${dateDisp}${idLabel}${countLabel}`;
            } else if (selectedLiveId) {
              const displayCount = totalBasketCount !== undefined ? totalBasketCount : 0;
              liveDisplayTitle = `🎥 Live #${selectedLiveId.length > 10 ? selectedLiveId.slice(-8) : selectedLiveId} (${displayCount} កន្ត្រក)`;
            }

            return (
              <button
                type="button"
                onClick={onOpenManageLiveModal}
                className="bg-slate-950/90 text-sky-400 border border-sky-600/40 hover:border-cyan-400 px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none truncate flex-1 shadow-inner flex items-center justify-between gap-1 active:scale-[0.98] transition-all cursor-pointer text-left h-8"
                title="ចុចដើម្បីប្តូរ ឬលុបវគ្គ Live"
              >
                <span className="truncate">{liveDisplayTitle}</span>
                <span className="text-[10px] text-sky-500/80 flex-shrink-0">▼</span>
              </button>
            );
          })()}

          {onCreateLiveSession && (
            <button
              onClick={onCreateLiveSession}
              className="px-2 py-1.5 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-500/60 text-cyan-300 text-xs font-black active:scale-95 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer shadow-sm h-8"
              title="បង្កើតវគ្គ Live ថ្មី"
            >
              <span>➕</span>
            </button>
          )}

          {onOpenManageLiveModal && (
            <button
              onClick={onOpenManageLiveModal}
              className="px-2 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-300 text-xs font-black active:scale-95 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer shadow-sm h-8"
              title="គ្រប់គ្រង ឬលុបវគ្គ Live ចាស់ៗ"
            >
              <span>⚙️</span>
            </button>
          )}
        </div>

        {/* Right side buttons container */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Live Comment Stream Toggle */}
          <button
            onClick={onToggleCommentStream}
            className={`px-2.5 py-1.5 rounded-xl font-bold text-xs border flex items-center gap-1 transition-all h-8 ${
              isStreamOpen
                ? 'bg-rose-950/90 border-rose-500 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
            title="បើក/បិទ ផ្ទាំងចាប់ខំមិន Live"
          >
            <span>💬</span>
            <span className="hidden xs:inline">ខំមិន</span>
          </button>

          {/* Picking List */}
          <button
            onClick={onOpenPickingModal}
            className="bg-[#064E3B]/90 hover:bg-[#064E3B] text-emerald-300 border border-emerald-500/70 px-2.5 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap active:scale-95 transition-all shadow-sm flex items-center gap-1 h-8"
            title="បើកបញ្ជីប្រមូលទំនិញ"
          >
            <span>📋</span>
            <span>ប្រមូល</span>
          </button>

          {/* Font & Zoom Controls */}
          <div className="flex items-center gap-1">
            {onChangeKhmerFont && (
              <select
                value={khmerFont}
                onChange={e => onChangeKhmerFont(e.target.value)}
                className="bg-[#121E38] text-cyan-300 border border-[#1C2B4B] hover:border-cyan-400/80 px-2 py-1 rounded-xl font-bold text-xs outline-none cursor-pointer shadow-sm transition-all h-8 max-w-[105px] sm:max-w-[140px]"
                title="ជ្រើសរើសពុម្ពអក្សរខ្មែរ"
              >
                <option value="kantumruy">✨ Kantumruy</option>
                <option value="santepheap">🌿 Santepheap</option>
                <option value="battambang">🏛️ Battambang</option>
                <option value="koulen">🔥 Koulen</option>
              </select>
            )}

            <div className="flex items-center h-8">
              <button
                onClick={() => onAdjustFontSize(0.08)}
                className="bg-[#121E38] text-white border border-[#1C2B4B] px-1.5 py-1 rounded-l-xl font-black text-xs hover:border-cyan-400 active:scale-95 transition-all h-full"
                title="ពង្រីកអក្សរ (Increase Font)"
              >
                A+
              </button>
              <button
                onClick={() => onAdjustFontSize(-0.08)}
                className="bg-[#121E38] text-white border-y border-r border-[#1C2B4B] px-1.5 py-1 rounded-r-xl font-black text-xs hover:border-cyan-400 active:scale-95 transition-all h-full"
                title="បង្រួមអក្សរ (Decrease Font)"
              >
                A-
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
