import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If running as standalone app, hide install button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop Install Flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        type="button"
        className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-black text-xs px-3 py-1.5 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all active:scale-95 cursor-pointer animate-pulse"
      >
        <span className="text-sm">📲</span>
        <span>ដំឡើង App លើទូរស័ព្ទ (Full Screen)</span>
      </button>
    );
  }

  // iOS Safari Flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          type="button"
          className="flex items-center gap-1.5 bg-[#091B33] border border-cyan-400/80 hover:border-cyan-400 text-cyan-300 font-bold text-xs px-2.5 py-1.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <span className="text-sm">📲</span>
          <span>ដំឡើង App លើ iPhone / iPad</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl bg-[#091326] border-2 border-cyan-400 p-6 shadow-2xl text-white">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-black text-cyan-400 flex items-center gap-2">
                  <span>📲</span>
                  <span>របៀបដំឡើងលើ iPhone / iPad</span>
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-white text-lg font-black px-2"
                >
                  ✕
                </button>
              </div>
              <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-200">
                <p className="flex items-start gap-2">
                  <span className="bg-cyan-500 text-black font-black w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">1</span>
                  <span>ចុចប៊ូតុង **Share (ចែករំលែក)** ຢູ່បាត Safari ខាងក្រោម ៛</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="bg-cyan-500 text-black font-black w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">2</span>
                  <span>អូសចុះក្រោម រួចជ្រើសរើស **"Add to Home Screen" (បន្ថែមទៅអេក្រង់ដើម)** ➕</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="bg-cyan-500 text-black font-black w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">3</span>
                  <span>ចុច **"Add"** ខាងលើស្តាំ ជាការស្រេច! App នឹងបង្ហាញពេញអេក្រង់ Full Screen គ្មានរបារ URL ឡើយ។</span>
                </p>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                type="button"
                className="mt-5 w-full rounded-2xl bg-cyan-400 hover:bg-cyan-300 py-2.5 text-xs font-black text-black transition-all shadow-lg cursor-pointer"
              >
                យល់ព្រម (បិទ)
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback trigger button for mobile browser header if prompt hasn't fired yet
  return (
    <>
      <button
        onClick={() => setShowIOSGuide(true)}
        type="button"
        className="flex items-center gap-1.5 bg-[#08152A] border border-cyan-500/60 hover:border-cyan-400 text-cyan-300 font-bold text-xs px-2.5 py-1.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
        title="ដំឡើង App លើអេក្រង់ដើម"
      >
        <span className="text-sm">📲</span>
        <span className="hidden sm:inline">ដំឡើង App</span>
      </button>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#091326] border-2 border-cyan-400 p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-black text-cyan-400 flex items-center gap-2">
                <span>📲</span>
                <span>របៀបដំឡើង App លើអេក្រង់ទូរស័ព្ទ</span>
              </h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="text-slate-400 hover:text-white text-lg font-black px-2"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-200">
              <p>
                ដើម្បីឱ្យកម្មវិធីបង្ហាញ **Full Screen ពេញអេក្រង់** ដោយគ្មានឃើញរបារអាសយដ្ឋាន URL៖
              </p>
              <div className="p-3 bg-[#040A17] rounded-2xl border border-slate-800 space-y-2">
                <p className="font-bold text-amber-300">📱 លើ Android (Chrome / Brave) ៖</p>
                <p>ចុចលើសញ្ញាចុច៣ **(⋮)** ខាងលើស្តាំ ➔ ជ្រើសរើស **"Add to Home screen"** ឬ **"Install app"**។</p>
              </div>
              <div className="p-3 bg-[#040A17] rounded-2xl border border-slate-800 space-y-2">
                <p className="font-bold text-cyan-300">🍎 លើ iPhone / iPad (Safari) ៖</p>
                <p>ចុចប៊ូតុង **Share (ចែករំលែក)** ➔ ជ្រើសរើស **"Add to Home Screen"**។</p>
              </div>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              type="button"
              className="mt-5 w-full rounded-2xl bg-cyan-400 hover:bg-cyan-300 py-2.5 text-xs font-black text-black transition-all shadow-lg cursor-pointer"
            >
              យល់ព្រម (បិទ)
            </button>
          </div>
        </div>
      )}
    </>
  );
};
