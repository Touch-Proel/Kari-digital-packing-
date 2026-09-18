import React, { useState } from 'react';
import { playPureTone, playSuccessFanfare, playWarningBuzzer } from '../../utils/audio';

interface CreateLiveSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLiveId: string;
  unsoldStockCount: number;
  totalStockCount: number;
  onCreateSession: (options: {
    live_id?: string;
    mode: 'blank' | 'clone_unsold';
    source_live_id: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function CreateLiveSessionModal({
  isOpen,
  onClose,
  currentLiveId,
  unsoldStockCount,
  totalStockCount,
  onCreateSession,
  isLoading = false
}: CreateLiveSessionModalProps) {
  const [mode, setMode] = useState<'blank' | 'clone_unsold'>('blank');
  const [customLiveName, setCustomLiveName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const suggestedId = `LIVE_${dateStr}_${timeStr}`;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onCreateSession({
        live_id: customLiveName.trim() || suggestedId,
        mode,
        source_live_id: currentLiveId
      });
      onClose();
    } catch (e) {
      // Error handled by parent
    } finally {
      setSubmitting(false);
    }
  };

  const currentDisplayLabel = currentLiveId.length > 10 ? `Live #${currentLiveId.slice(-8)}` : currentLiveId;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div
        className="bg-slate-900 border border-cyan-500/40 w-full max-w-lg rounded-3xl shadow-[0_0_50px_rgba(6,182,212,0.2)] flex flex-col overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-cyan-900/60 bg-gradient-to-r from-slate-950 via-cyan-950/50 to-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-2xl shadow-inner">
              🎥
            </div>
            <div>
              <h2 className="text-lg font-black text-cyan-200 tracking-wide flex items-center gap-2">
                បង្កើតវគ្គ Live ថ្មី & ស្តុកដាច់ដោយឡែក
              </h2>
              <p className="text-xs text-slate-400">
                ធានា 100% ការពារជាន់កូដ ជាន់រូប និងតម្លៃរវាង Live ផ្សេងគ្នា
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              playPureTone(400, 0.05);
              onClose();
            }}
            disabled={submitting || isLoading}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-rose-950 hover:text-rose-300 border border-slate-700 flex items-center justify-center text-slate-400 font-bold transition-all text-sm"
          >
            ✕
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Custom Live Session ID Input (Optional) */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3">
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>🏷️ ឈ្មោះ ឬលេខសម្គាល់ Live ថ្មី</span>
              <span className="text-[11px] text-slate-500 font-normal">អាចទុកទំនេរសម្រាប់បង្កើតស្វ័យប្រវត្តិ</span>
            </label>
            <input
              type="text"
              value={customLiveName}
              onChange={e => setCustomLiveName(e.target.value)}
              placeholder={`ឧ. ${suggestedId}`}
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 focus:border-cyan-400 rounded-xl text-xs font-mono text-cyan-300 placeholder-slate-600 outline-none transition-all"
            />
          </div>

          {/* Prompt heading */}
          <div>
            <div className="text-xs font-black text-cyan-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>⚙️ ជ្រើសរើសរបៀបគ្រប់គ្រងស្តុកសម្រាប់ Live ថ្មីនេះ ៖</span>
            </div>

            {/* Option 1: Blank New Stock */}
            <div
              onClick={() => {
                playPureTone(550, 0.05);
                setMode('blank');
              }}
              className={`cursor-pointer rounded-2xl p-3.5 border transition-all mb-3 ${
                mode === 'blank'
                  ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500'
                  : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <input
                    type="radio"
                    name="stock_mode"
                    checked={mode === 'blank'}
                    onChange={() => setMode('blank')}
                    className="w-4 h-4 text-cyan-500 accent-cyan-500 cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm text-slate-100 flex items-center gap-1.5">
                      <span>✨ ជម្រើស ក ៖ បង្កើតស្តុកថ្មីទទេស្រឡាង (Blank Stock)</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-700/60">
                      🛡️ សុវត្ថិភាព 100%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    ចាប់ផ្តើមស្តុកទទេស្អាតល្អ (០ មុខ)។ មិនមានទំនិញ ឬរូបភាពពី Live ចាស់ឡើយ។ ការពារកុំឱ្យជាន់រូប តម្លៃ និងកូដទំនិញចាស់ៗ 100%។
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                    <span>• ស្តុកចាប់ផ្តើម ៖ 0 មុខ</span>
                    <span>• Live ចាស់ ៖ រក្សាដដែលមិនប៉ះពាល់</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Option 2: Clone Remaining Stock */}
            <div
              onClick={() => {
                playPureTone(650, 0.05);
                setMode('clone_unsold');
              }}
              className={`cursor-pointer rounded-2xl p-3.5 border transition-all ${
                mode === 'clone_unsold'
                  ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500'
                  : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <input
                    type="radio"
                    name="stock_mode"
                    checked={mode === 'clone_unsold'}
                    onChange={() => setMode('clone_unsold')}
                    className="w-4 h-4 text-cyan-500 accent-cyan-500 cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm text-slate-100 flex items-center gap-1.5">
                      <span>📦 ជម្រើស ខ ៖ ចម្លងទំនិញសល់ពី {currentDisplayLabel}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700/60">
                      សល់ {unsoldStockCount} មុខ
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    ចម្លងតែមុខទំនិញដែលនៅសល់ស្តុក (Stock &gt; 0) ពី Live បច្ចុប្បន្នមកកាន់ Live ថ្មីនេះ។ ទំនិញដែលចម្លងរួចនឹងក្លាយជាស្តុកឯករាជ្យ ដាច់ដោយឡែកពី Live មុន។
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-amber-400/90 font-mono bg-amber-950/30 px-2.5 py-1 rounded-lg border border-amber-800/40">
                    <span>• ចម្លងទំនិញសល់ ៖ {unsoldStockCount} / {totalStockCount} មុខ</span>
                    <span>• ទំនិញដាច់ស្តុក (0) ៖ មិនចម្លងឡើយ</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notice Banner */}
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
            <span className="text-base">💡</span>
            <span>
              វគ្គ Live ចាស់ និងកន្ត្រកអតិថិជនកាលពីម្សិលមិញត្រូវបានការពារដាច់ខាត (Frozen) មិនមានការប្រែប្រួលតម្លៃ ឬទិន្នន័យឡើយ។
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => {
              playPureTone(400, 0.05);
              onClose();
            }}
            disabled={submitting || isLoading}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all active:scale-95 cursor-pointer"
          >
            បោះបង់
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || isLoading}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs shadow-lg shadow-cyan-900/30 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting || isLoading ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>កំពុងបង្កើត...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>
                  {mode === 'blank'
                    ? 'បង្កើត Live ស្តុកថ្មីទទេស្រឡាង'
                    : `បង្កើត Live & ចម្លងទំនិញសល់ (${unsoldStockCount} មុខ)`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
