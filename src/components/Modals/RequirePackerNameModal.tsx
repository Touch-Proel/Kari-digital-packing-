import React, { useState } from 'react';

interface RequirePackerNameModalProps {
  isOpen: boolean;
  currentPackerName: string;
  onSavePackerName: (name: string, role?: 'admin' | 'staff') => void;
  onOpenAdminPinModal?: () => void;
}

const COMMON_PACKER_NAMES = [
  'សុខា',
  'ស្រីពៅ',
  'ម៉ានិត',
  'ចាន់ណា',
  'សុភាព',
  'វឌ្ឍនៈ'
];

export const RequirePackerNameModal: React.FC<RequirePackerNameModalProps> = ({
  isOpen,
  currentPackerName,
  onSavePackerName,
  onOpenAdminPinModal
}) => {
  const [selectedName, setSelectedName] = useState(currentPackerName || '');
  const [customInput, setCustomInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleConfirm = (nameToUse?: string) => {
    const finalName = (nameToUse || customInput || selectedName).trim();
    if (!finalName) {
      setErrorMsg('សូមជ្រើសរើស ឬវាយបញ្ចូលឈ្មោះរបស់អ្នករៀបអីវ៉ាន់!');
      return;
    }
    setErrorMsg('');
    onSavePackerName(finalName, 'staff');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-md bg-[#091326] border-2 border-cyan-400 rounded-3xl p-6 shadow-[0_0_40px_rgba(6,182,212,0.3)] text-white relative">
        
        {/* Header */}
        <div className="text-center space-y-2 pb-4 border-b border-slate-800">
          <div className="w-16 h-16 rounded-full bg-cyan-950 border-2 border-cyan-400 flex items-center justify-center text-3xl mx-auto shadow-lg">
            👤
          </div>
          <h2 className="text-xl font-black text-cyan-400 tracking-wide">
            សូមកំណត់ឈ្មោះរបស់អ្នករៀបអីវ៉ាន់
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed font-medium">
            ដើម្បីការពារកុំឱ្យច្រកអីវ៉ាន់ <span className="text-amber-300 font-bold">«ជាន់គ្នា»</span> ជាមួយបុគ្គលិកផ្សេង សូមជ្រើសរើស ឬបញ្ចូលឈ្មោះរបស់អ្នកជាមុនសិន ៖
          </p>
        </div>

        {/* Quick Presets */}
        <div className="mt-5 space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            ជ្រើសរើសឈ្មោះលឿន ៖
          </label>
          <div className="grid grid-cols-2 gap-2">
            {COMMON_PACKER_NAMES.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setSelectedName(name);
                  setCustomInput('');
                  handleConfirm(name);
                }}
                className={`py-2.5 px-3 rounded-2xl text-sm font-black transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                  selectedName === name && !customInput
                    ? 'bg-cyan-500 border-cyan-300 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)] scale-102'
                    : 'bg-[#050B17] border-slate-700 text-slate-200 hover:border-cyan-500/60'
                }`}
              >
                <span>👤</span>
                <span>{name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Input */}
        <div className="mt-4 space-y-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            ឬវាយបញ្ចូលឈ្មោះផ្សេង ៖
          </label>
          <input
            type="text"
            value={customInput}
            onChange={e => {
              setCustomInput(e.target.value);
              if (e.target.value) setSelectedName('');
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') handleConfirm();
            }}
            placeholder="ឧទាហរណ៍ ៖ ស្រីពៅ..."
            className="w-full bg-[#050B17] border-2 border-slate-700 focus:border-cyan-400 rounded-2xl px-4 py-3 text-sm font-bold text-white outline-none transition-all placeholder:text-slate-600"
          />
        </div>

        {errorMsg && (
          <p className="mt-3 text-xs font-bold text-rose-400 text-center animate-bounce">
            ⚠️ {errorMsg}
          </p>
        )}

        {/* Action Button */}
        <button
          onClick={() => handleConfirm()}
          type="button"
          className="mt-5 w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-black text-base rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
        >
          <span>✅</span>
          <span>រក្សាទុក & ចាប់ផ្តើមច្រកអីវ៉ាន់</span>
        </button>

        {/* Admin Login Option */}
        {onOpenAdminPinModal && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 text-center">
            <button
              type="button"
              onClick={onOpenAdminPinModal}
              className="text-xs font-black text-amber-400 hover:text-amber-300 flex items-center justify-center gap-1.5 mx-auto py-1 px-3 rounded-xl bg-amber-950/40 hover:bg-amber-950/70 border border-amber-500/30 transition-all cursor-pointer"
            >
              <span>👑</span>
              <span>ចូលជាម្ចាស់ហាង (Admin Mode)</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
