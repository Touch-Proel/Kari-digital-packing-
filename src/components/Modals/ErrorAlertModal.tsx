import React, { useEffect } from 'react';
import { playPureTone, playWarningBuzzer } from '../../utils/audio';

export interface ErrorModalData {
  title?: string;
  message: string;
  errorType?: 'quota' | 'auth' | 'network' | 'validation' | 'general';
  code?: string | number;
  hint?: string;
  onRetry?: () => void;
}

interface ErrorAlertModalProps {
  data: ErrorModalData | null;
  onClose: () => void;
}

export const ErrorAlertModal: React.FC<ErrorAlertModalProps> = ({ data, onClose }) => {
  useEffect(() => {
    if (data) {
      playWarningBuzzer();
    }
  }, [data]);

  useEffect(() => {
    if (!data) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, onClose]);

  if (!data) return null;

  // Classify error type automatically if not explicitly given
  const isQuota = data.errorType === 'quota' || 
    data.message.toLowerCase().includes('quota') || 
    data.message.toLowerCase().includes('rate limit') || 
    data.message.toLowerCase().includes('429') ||
    data.message.toLowerCase().includes('resource_exhausted');

  const isAuth = data.errorType === 'auth' || 
    data.message.toLowerCase().includes('api key') || 
    data.message.toLowerCase().includes('invalid api key') || 
    data.message.toLowerCase().includes('401') || 
    data.message.toLowerCase().includes('403');

  const isNetwork = data.errorType === 'network' || 
    data.message.toLowerCase().includes('wifi') || 
    data.message.toLowerCase().includes('network') || 
    data.message.toLowerCase().includes('fetch');

  const defaultTitle = isQuota
    ? '⚠️ AI អស់ Quota (Quota Exceeded)'
    : isAuth
    ? '🔑 បញ្ហា Gemini API Key'
    : isNetwork
    ? '📡 បញ្ហាបណ្តាញ WiFi / Network'
    : '⚠️ ការជូនដំណឹងកំហុស (Error Alert)';

  const defaultHint = isQuota
    ? 'Gemini AI បានប្រើប្រាស់ដល់កម្រិតកំណត់ (Rate Limit / Free Tier Quota)។ សូមរង់ចាំ 30-60 វិនាទី ឬប្តូរ API Key ថ្មី។ លោកអ្នកក៏អាចកាត់ទំនិញដោយដៃ ឬចុចកែប្រែចំនួនផ្ទាល់នៅលើកន្ត្រកបានយ៉ាងងាយស្រួល។'
    : isAuth
    ? 'សូមពិនិត្យមើល GEMINI_API_KEY នៅក្នុងប្រព័ន្ធ Settings ដើម្បីធានាថា API Key មានសុពលភាព និងអាចប្រើប្រាស់បាន។'
    : isNetwork
    ? 'សូមពិនិត្យមើលការភ្ជាប់អ៊ីនធឺណិត WiFi ឬសាកល្បង Refresh ទំព័រឡើងវិញ។'
    : 'លោកអ្នកអាចបន្តដំណើរការកាត់ទំនិញ ឬកែប្រែកន្ត្រកដោយផ្ទាល់ដោយដៃបាន។';

  return (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-gradient-to-b from-[#180A0E] via-[#0F0A14] to-[#080D1A] border-2 border-rose-500/80 rounded-3xl p-6 sm:p-7 shadow-[0_0_50px_rgba(244,63,94,0.35)] flex flex-col gap-5 text-white animate-scaleUp"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-rose-500 to-transparent rounded-full shadow-[0_0_15px_#f43f5e]" />

        {/* Top Header with Icon */}
        <div className="flex items-start gap-4">
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-rose-500/25 to-amber-500/20 border-2 border-rose-500/60 flex items-center justify-center text-2xl sm:text-3xl shadow-[0_0_20px_rgba(244,63,94,0.3)] flex-shrink-0 animate-pulse">
            {isQuota ? '⏳' : isAuth ? '🔑' : isNetwork ? '📡' : '⚠️'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] sm:text-xs font-mono font-black uppercase px-2.5 py-0.5 rounded-full border ${
                isQuota
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                  : isAuth
                  ? 'bg-purple-950/80 text-purple-300 border-purple-500/60 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                  : 'bg-rose-950/80 text-rose-300 border-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
              }`}>
                {isQuota ? 'AI Rate Limit / Quota' : isAuth ? 'Authentication Error' : isNetwork ? 'Network Offline' : 'Action Failed'}
              </span>
            </div>

            <h2 className="text-lg sm:text-xl font-black text-rose-200 mt-1 tracking-wide leading-snug">
              {data.title || defaultTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-slate-700 active:scale-95"
            title="បិទ (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Prominent Error Message Card */}
        <div className="bg-rose-950/40 border border-rose-500/50 rounded-2xl p-4 sm:p-5 flex flex-col gap-2.5 shadow-inner">
          <div className="flex items-center gap-2 text-rose-300 text-xs font-bold uppercase tracking-wider">
            <span>🛑</span>
            <span>សារកំហុសលម្អិត (Error Details)៖</span>
          </div>

          <div className="text-white font-medium text-sm sm:text-base leading-relaxed bg-black/40 p-3.5 rounded-xl border border-rose-900/60 font-mono select-all break-words">
            {data.message}
          </div>
        </div>

        {/* Helpful Explanation & Next Steps Box */}
        <div className="bg-gradient-to-r from-amber-950/30 via-slate-900/60 to-slate-900/80 border border-amber-500/40 rounded-2xl p-3.5 sm:p-4 flex items-start gap-3">
          <span className="text-xl sm:text-2xl flex-shrink-0 pt-0.5">💡</span>
          <div className="flex flex-col gap-1 text-xs sm:text-sm text-slate-200 leading-relaxed">
            <span className="font-bold text-amber-300">ដំណោះស្រាយ & ការណែនាំ៖</span>
            <p className="text-slate-300 text-xs sm:text-[13px]">
              {data.hint || defaultHint}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {data.onRetry && (
            <button
              type="button"
              onClick={() => {
                onClose();
                data.onRetry?.();
              }}
              className="px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <span>🔄</span>
              <span>សាកល្បងម្តងទៀត</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial px-6 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 via-rose-500 to-rose-600 hover:from-rose-500 hover:to-rose-400 text-white font-black text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-[0_4px_20px_rgba(244,63,94,0.4)] border border-rose-400/60 flex items-center justify-center gap-2"
          >
            <span>✓</span>
            <span>យល់ព្រម (បិទ)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
