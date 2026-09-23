import React, { useState, useEffect } from 'react';
import { playPureTone, playSuccessFanfare, playWarningBuzzer } from '../../utils/audio';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'បញ្ចូលលេខកូដសម្ងាត់ Admin',
  description = 'មុខងារនេះតម្រូវឱ្យមានការអនុញ្ញាតពីម្ចាស់ហាង (Admin Only)'
}) => {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setErrorMsg('');
      setIsVerifying(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length >= 4 && !isVerifying) {
          handleVerify();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, isVerifying]);

  if (!isOpen) return null;

  const handleKeyPress = (digit: string) => {
    if (pin.length < 8) {
      playPureTone(700 + pin.length * 50, 0.04);
      setPin(prev => prev + digit);
      setErrorMsg('');
    }
  };

  const handleBackspace = () => {
    playPureTone(500, 0.04);
    setPin(prev => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg('');
  };

  const handleVerify = async (pinToTest?: string) => {
    const finalPin = pinToTest || pin;
    if (!finalPin) {
      setErrorMsg('សូមវាយបញ្ចូលលេខកូដ PIN');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch('/api/auth/verify_pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: finalPin })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        localStorage.setItem('userRole', 'admin');
        onSuccess();
        onClose();
      } else {
        playWarningBuzzer();
        setErrorMsg(data.message || 'លេខកូដ PIN មិនត្រឹមត្រូវ!');
        setPin('');
      }
    } catch {
      playWarningBuzzer();
      setErrorMsg('ដាច់សេវា WiFi / Server!');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="w-full max-w-sm bg-[#091326] border-2 border-amber-400/80 rounded-3xl p-5 shadow-[0_0_50px_rgba(245,158,11,0.25)] text-white relative flex flex-col items-center">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-base w-8 h-8 rounded-full bg-slate-800/80 flex items-center justify-center transition-colors"
        >
          ✕
        </button>

        {/* Top Icon */}
        <div className="w-14 h-14 rounded-2xl bg-amber-950/80 border-2 border-amber-400 flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(245,158,11,0.3)] mb-3">
          👑
        </div>

        {/* Title */}
        <h3 className="text-base font-black text-amber-400 text-center">
          {title}
        </h3>
        <p className="text-[11px] text-slate-400 text-center mt-1 max-w-[260px] leading-relaxed">
          {description}
        </p>

        {/* PIN Indicators (Dots) */}
        <div className="flex items-center justify-center gap-3 my-4">
          {[0, 1, 2, 3].map(idx => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                pin.length > idx
                  ? 'bg-amber-400 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.8)] scale-110'
                  : 'bg-slate-900 border-slate-700'
              }`}
            />
          ))}
          {pin.length > 4 && (
            <span className="text-xs font-mono font-bold text-amber-300">+{pin.length - 4}</span>
          )}
        </div>

        {/* Error Message */}
        {errorMsg ? (
          <div className="text-xs font-bold text-rose-400 bg-rose-950/80 border border-rose-600/60 px-3 py-1 rounded-xl mb-3 animate-shake text-center">
            ⚠️ {errorMsg}
          </div>
        ) : (
          <div className="h-6 mb-1 text-[10.5px] text-slate-500">
            PIN លំនាំដើម៖ <span className="font-mono text-slate-400 font-bold">1688</span>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px] mt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleKeyPress(num)}
              className="h-12 rounded-2xl bg-[#0F1E38] hover:bg-[#162B50] border border-slate-700/80 hover:border-amber-400/50 text-white font-mono font-black text-lg flex items-center justify-center active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              {num}
            </button>
          ))}

          {/* Bottom row: Clear, 0, Backspace */}
          <button
            type="button"
            onClick={handleClear}
            className="h-12 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-400 text-xs font-bold flex items-center justify-center active:scale-95 transition-all cursor-pointer"
          >
            លុបអស់
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="h-12 rounded-2xl bg-[#0F1E38] hover:bg-[#162B50] border border-slate-700/80 hover:border-amber-400/50 text-white font-mono font-black text-lg flex items-center justify-center active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-12 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 text-base font-bold flex items-center justify-center active:scale-95 transition-all cursor-pointer"
          >
            ⌫
          </button>
        </div>

        {/* Submit Button */}
        <button
          type="button"
          disabled={pin.length < 4 || isVerifying}
          onClick={() => handleVerify()}
          className="w-full mt-4 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-95 transition-all cursor-pointer"
        >
          {isVerifying ? (
            <span>⏳ កំពុងផ្ទៀងផ្ទាត់...</span>
          ) : (
            <>
              <span>🔓</span>
              <span>ដោះសោរ Admin</span>
            </>
          )}
        </button>

      </div>
    </div>
  );
};
