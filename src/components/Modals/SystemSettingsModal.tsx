import React, { useState, useEffect } from 'react';
import { FacebookPage } from '../../types';
import { PWAInstallButton } from '../PWAInstallButton';
import { playPureTone } from '../../utils/audio';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  packerName: string;
  onChangePackerName: () => void;
  onOpenPackerHistory: () => void;
  onOpenPackerLeaderboard: () => void;
  onOpenKHQRModal: () => void;
  dispatchedCount: number;
  onOpenDispatchModal: () => void;
  activePage: FacebookPage | null;
  onOpenFbModal: () => void;
  onOpenDatabaseModal: () => void;
  khmerFont: string;
  onChangeKhmerFont: (font: string) => void;
  fontScale: number;
  onAdjustFontSize: (delta: number) => void;
  onResetFontSize: () => void;
  userRole?: 'admin' | 'staff';
  onLockAdmin?: () => void;
}

export function SystemSettingsModal({
  isOpen,
  onClose,
  packerName,
  onChangePackerName,
  onOpenPackerHistory,
  onOpenPackerLeaderboard,
  onOpenKHQRModal,
  dispatchedCount,
  onOpenDispatchModal,
  activePage,
  onOpenFbModal,
  onOpenDatabaseModal,
  khmerFont,
  onChangeKhmerFont,
  fontScale,
  onAdjustFontSize,
  onResetFontSize,
  userRole = 'staff',
  onLockAdmin
}: SystemSettingsModalProps) {
  const [strictCatalogMode, setStrictCatalogMode] = useState(false);
  const [loadingStrict, setLoadingStrict] = useState(false);

  // Admin PIN Change State
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<string | null>(null);
  const [showPinSection, setShowPinSection] = useState(false);

  // Gemini API Key State
  const [geminiStatus, setGeminiStatus] = useState<{
    hasKey: boolean;
    maskedKey: string;
    isFromEnv: boolean;
    hasCustomKey: boolean;
  }>({ hasKey: false, maskedKey: '', isFromEnv: false, hasCustomKey: false });
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [isSavingGemini, setIsSavingGemini] = useState(false);
  const [geminiFeedback, setGeminiFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/parser/settings')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.parser_strict_catalog === 'boolean') {
          setStrictCatalogMode(data.parser_strict_catalog);
        }
      })
      .catch(() => {});

    fetch('/api/fast_check/gemini_status')
      .then(res => res.json())
      .then(data => {
        if (data && data.success) {
          setGeminiStatus({
            hasKey: Boolean(data.hasKey),
            maskedKey: data.maskedKey || '',
            isFromEnv: Boolean(data.isFromEnv),
            hasCustomKey: Boolean(data.hasCustomKey)
          });
        }
      })
      .catch(() => {});

    fetch('/api/telegram/config')
      .then(res => res.json())
      .then(data => {
        if (data) {
          setTgConfig({
            has_token: !!data.has_token,
            token: data.token || '',
            chat_id: data.chat_id || ''
          });
          setTgTokenInput(data.token || '');
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Telegram Bot Token State
  const [tgConfig, setTgConfig] = useState<{ has_token: boolean; token: string; chat_id: string }>({ has_token: false, token: '', chat_id: '' });
  const [tgTokenInput, setTgTokenInput] = useState('');
  const [isSavingTg, setIsSavingTg] = useState(false);
  const [tgFeedback, setTgFeedback] = useState<string | null>(null);
  const [showTgGuide, setShowTgGuide] = useState(false);

  const handleChangeAdminPin = async () => {
    if (!currentPinInput.trim() || !newPinInput.trim()) {
      setPinFeedback('⚠️ សូមវាយបញ្ចូលលេខ PIN ចាស់ និង PIN ថ្មី!');
      return;
    }
    if (newPinInput.trim().length < 4) {
      setPinFeedback('⚠️ លេខកូដ PIN ថ្មីត្រូវមានយ៉ាងតិច ៤ ខ្ទង់!');
      return;
    }

    setIsChangingPin(true);
    setPinFeedback(null);
    try {
      const res = await fetch('/api/auth/change_pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_pin: currentPinInput.trim(),
          new_pin: newPinInput.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setPinFeedback('✅ បានប្តូរលេខកូដ Admin PIN ជោគជ័យ!');
        setCurrentPinInput('');
        setNewPinInput('');
        setShowPinSection(false);
        playPureTone(880, 0.1);
      } else {
        setPinFeedback(`❌ ${data.message || 'បរាជ័យក្នុងការប្តូរ PIN'}`);
      }
    } catch {
      setPinFeedback('❌ មានបញ្ហាតភ្ជាប់');
    } finally {
      setIsChangingPin(false);
      setTimeout(() => setPinFeedback(null), 4000);
    }
  };

  const handleSaveTgToken = async () => {
    setIsSavingTg(true);
    setTgFeedback(null);
    try {
      const res = await fetch('/api/telegram/save_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tgTokenInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setTgConfig(prev => ({ ...prev, has_token: !!tgTokenInput.trim(), token: tgTokenInput.trim() }));
        setTgFeedback('✅ បានរក្សាទុក Telegram Bot Token ជោគជ័យ!');
        playPureTone(880, 0.1);
      } else {
        setTgFeedback('❌ បរាជ័យក្នុងការរក្សាទុក');
      }
    } catch {
      setTgFeedback('❌ មានបញ្ហាតភ្ជាប់');
    } finally {
      setIsSavingTg(false);
      setTimeout(() => setTgFeedback(null), 3500);
    }
  };

  const handleSaveGeminiKey = async () => {
    if (!geminiKeyInput.trim() && !geminiStatus.hasKey) return;
    setIsSavingGemini(true);
    setGeminiFeedback(null);
    try {
      const res = await fetch('/api/fast_check/save_gemini_key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: geminiKeyInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setGeminiStatus({
          hasKey: Boolean(data.hasKey),
          maskedKey: data.maskedKey || '',
          isFromEnv: false,
          hasCustomKey: Boolean(geminiKeyInput.trim())
        });
        setGeminiKeyInput('');
        setGeminiFeedback('✅ បានរក្សាទុក Key ជោគជ័យ!');
        playPureTone(880, 0.1);
      } else {
        setGeminiFeedback('❌ បរាជ័យក្នុងការរក្សាទុក');
      }
    } catch {
      setGeminiFeedback('❌ មានបញ្ហាតភ្ជាប់');
    } finally {
      setIsSavingGemini(false);
      setTimeout(() => setGeminiFeedback(null), 3000);
    }
  };

  const handleToggleStrict = async () => {
    const nextVal = !strictCatalogMode;
    setLoadingStrict(true);
    try {
      const res = await fetch('/api/parser/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parser_strict_catalog: nextVal })
      });
      const data = await res.json();
      if (data.success) {
        setStrictCatalogMode(nextVal);
        playPureTone(nextVal ? 800 : 600, 0.05);
      }
    } catch {
      // silent
    } finally {
      setLoadingStrict(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-[#0B1325] border border-[#1C2B4B] w-full max-w-lg rounded-3xl shadow-[0_15px_40px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[92vh] animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#0F1E3A] via-[#122B55] to-[#0F1E3A] border-b border-[#1C2B4B] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <h2 className="text-base font-black bg-gradient-to-r from-[#00F0FF] to-[#38BDF8] bg-clip-text text-transparent">
                KARI ARNETT OS
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">ការកំណត់ទូទៅ & ប្រព័ន្ធគ្រប់គ្រង</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm transition-all cursor-pointer active:scale-95"
            title="បិទ (Close)"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-slate-200 text-xs">
          
          {/* Section 0: Admin Security & Role Status */}
          <div className="bg-[#0c1629] border-2 border-amber-500/50 rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">👑</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-300 text-sm">សិទ្ធិគ្រប់គ្រង (Admin Mode)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-400/50">
                      ម្ចាស់ហាង
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">គ្រប់គ្រងការកំណត់, បង្កើត/លុប Live, និងប្រព័ន្ធសុវត្ថិភាព</p>
                </div>
              </div>

              {onLockAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLockAdmin();
                  }}
                  className="bg-amber-950/80 hover:bg-rose-950 border border-amber-500/60 hover:border-rose-500 text-amber-300 hover:text-rose-300 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-sm"
                  title="ចាកចេញពី Admin ដើម្បីប្តូរទៅជា Staff Mode"
                >
                  <span>🔒</span>
                  <span>ចាក់សោរ</span>
                </button>
              )}
            </div>

            {/* Change PIN Accordion */}
            <div className="pt-1 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowPinSection(!showPinSection)}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>{showPinSection ? '▼ បិទផ្ទាំងប្តូរ PIN' : '🔑 ចុចទីនេះដើម្បីប្តូរលេខកូដ Admin PIN'}</span>
              </button>

              {showPinSection && (
                <div className="mt-2.5 p-3 bg-slate-950 border border-amber-500/30 rounded-xl space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10.5px] text-slate-400 mb-1">PIN ចាស់ (បច្ចុប្បន្ន) ៖</label>
                      <input
                        type="password"
                        maxLength={8}
                        value={currentPinInput}
                        onChange={e => setCurrentPinInput(e.target.value)}
                        placeholder="ឧ. 1688"
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-1.5 text-xs text-amber-200 outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] text-slate-400 mb-1">PIN ថ្មី (យ៉ាងតិច ៤ ខ្ទង់) ៖</label>
                      <input
                        type="password"
                        maxLength={8}
                        value={newPinInput}
                        onChange={e => setNewPinInput(e.target.value)}
                        placeholder="PIN ថ្មី..."
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-1.5 text-xs text-amber-200 outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-500">PIN លំនាំដើម ៖ 1688</span>
                    <button
                      type="button"
                      disabled={isChangingPin || !currentPinInput || !newPinInput}
                      onClick={handleChangeAdminPin}
                      className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-black px-4 py-1.5 rounded-xl text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
                    >
                      {isChangingPin ? '⏳ កំពុងប្តូរ...' : '💾 រក្សាទុក PIN ថ្មី'}
                    </button>
                  </div>

                  {pinFeedback && (
                    <div className="text-[11px] font-bold text-amber-300 animate-fade-in pt-1">
                      {pinFeedback}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section 1: Packer Profile */}
          <div className="bg-[#080F1E] border border-cyan-500/30 rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">👤</span>
                <div>
                  <span className="font-bold text-cyan-300 text-sm">អ្នករៀបចំអីវ៉ាន់ (Packer)</span>
                  <p className="text-[11px] text-slate-400">កំណត់ឈ្មោះដើម្បីកត់ត្រាចំនួនកន្ត្រកដែលបានច្រក</p>
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onChangePackerName();
                }}
                className="bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/70 text-cyan-300 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                <span>✏️ ប្តូរឈ្មោះ</span>
              </button>
            </div>
            <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl">
              <span className="text-slate-400">ឈ្មោះបច្ចុប្បន្ន ៖</span>
              <span className="font-bold text-sm text-cyan-200 font-mono">
                {packerName || 'មិនទាន់កំណត់'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  onClose();
                  onOpenPackerLeaderboard();
                }}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <span>🏆 តារាងជើងខ្លាំង</span>
              </button>
              <button
                onClick={() => {
                  onClose();
                  onOpenPackerHistory();
                }}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <span>📜 ប្រវត្តិច្រករបស់ខ្ញុំ</span>
              </button>
            </div>
          </div>

          {/* Section 2: KHQR ABA Bank Payment & Dispatch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* KHQR */}
            <div className="bg-[#17080B] border border-red-500/40 rounded-2xl p-3 flex flex-col justify-between gap-2 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="bg-[#E11925] text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow">
                  KHQR
                </span>
                <span className="font-bold text-rose-300">ស្កេនទូទាត់ ABA</span>
              </div>
              <p className="text-[11px] text-slate-400">បង្កើត QR កូដស្កេនលុយ ឬ Upload រូប QR ហាង</p>
              <button
                onClick={() => {
                  onClose();
                  onOpenKHQRModal();
                }}
                className="w-full bg-[#E11925] hover:bg-[#c91420] text-white font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-[0_0_12px_rgba(225,25,37,0.35)]"
              >
                <span>📷 បើកស្កេន KHQR</span>
              </button>
            </div>

            {/* Dispatch Tracker */}
            <div className="bg-[#051811] border border-emerald-500/40 rounded-2xl p-3 flex flex-col justify-between gap-2 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🚀</span>
                  <span className="font-bold text-emerald-300">ចេញដឹកថ្ងៃនេះ</span>
                </div>
                <span className="bg-emerald-950 text-emerald-400 font-mono font-black px-2 py-0.5 rounded-lg border border-emerald-500/50">
                  {dispatchedCount} កញ្ចប់
                </span>
              </div>
              <p className="text-[11px] text-slate-400">ផ្ទៀងផ្ទាត់កញ្ចប់អីវ៉ាន់ដែលបានចេញដឹក</p>
              <button
                onClick={() => {
                  onClose();
                  onOpenDispatchModal();
                }}
                className="w-full bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 border border-emerald-500/60 font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <span>📦 មើលបញ្ជីចេញដឹក</span>
              </button>
            </div>
          </div>

          {/* Section 3: Facebook Page Connection & Store Database Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* FB Page */}
            <div className="bg-[#0A1628] border border-blue-500/30 rounded-2xl p-3 flex flex-col justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-bold text-sky-300">Facebook Page</span>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 px-2.5 py-1.5 rounded-xl truncate font-mono text-[11px] text-sky-200">
                {activePage ? activePage.name : 'មិនទាន់ភ្ជាប់'}
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenFbModal();
                }}
                className="w-full bg-blue-950 hover:bg-blue-900 border border-blue-500/60 text-sky-300 font-bold py-1.5 rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                🔗 គ្រប់គ្រង Page & Token
              </button>
            </div>

            {/* Database & Store Settings */}
            <div className="bg-[#081524] border border-cyan-500/30 rounded-2xl p-3 flex flex-col justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base">⚙️</span>
                <span className="font-bold text-cyan-300">ទិន្នន័យ & ការកំណត់ហាង</span>
              </div>
              <p className="text-[11px] text-slate-400">SQLite Database, Backup & Store Config</p>
              <button
                onClick={() => {
                  onClose();
                  onOpenDatabaseModal();
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 font-bold py-1.5 rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                ⚙️ បើកការកំណត់ហាង
              </button>
            </div>
          </div>

          {/* Section 3.5: Safety Guardrail - Strict Catalog vs Auto-Create Products */}
          <div className={`border rounded-2xl p-3.5 flex flex-col gap-2 transition-all ${
            strictCatalogMode
              ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
              : 'bg-[#081527] border-cyan-500/40 text-cyan-200'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{strictCatalogMode ? '🛡️' : '⚡'}</span>
                <div>
                  <div className="font-bold text-sm flex items-center gap-2">
                    <span>{strictCatalogMode ? 'របៀបសុវត្ថិភាព ៖ ចាប់តែកូដក្នុងស្តុក (Strict Mode)' : 'របៀបទូលាយ ៖ បង្កើតកូដ Auto (Flexible Mode)'}</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {strictCatalogMode
                      ? '🔒 ប្រព័ន្ធចាប់កាត់តែកូដទំនិញណាដែលមានក្នុងស្តុកប៉ុណ្ណោះ ការពារមិនឱ្យច្រឡំខំមិនសួរនាំ'
                      : '⚡ អនុញ្ញាតឱ្យចាប់កូដថ្មីៗស្វ័យប្រវត្តិ (ឧ. 10=1, 12=5) ទោះមិនទាន់បញ្ចូលកូដទុកមុន'}
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={strictCatalogMode}
                disabled={loadingStrict}
                onClick={handleToggleStrict}
                className={`w-13 h-7 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 focus:outline-none shadow-inner flex-shrink-0 ${
                  strictCatalogMode ? 'bg-amber-500 justify-end' : 'bg-slate-700 justify-start'
                }`}
                title="ចុចដើម្បីប្តូររបៀបចាប់កូដទំនិញ"
              >
                <div className="bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300" />
              </button>
            </div>
          </div>

          {/* Section 4: Google Gemini AI Key (For VPS / AI Fast-Check) */}
          <div className="bg-[#0A1526] border border-indigo-500/40 rounded-2xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">✨</span>
                <div>
                  <span className="font-bold text-indigo-300 text-sm">Google Gemini AI Key (ស្កេន Slips)</span>
                  <p className="text-[11px] text-slate-400">សម្រាប់ដំណើរការស្កេនវិក្កយបត្ររូបភាព AI លើ VPS</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                geminiStatus.hasKey
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              }`}>
                {geminiStatus.hasKey ? '✅ សកម្ម (Active)' : '⚠️ មិនទាន់កំណត់'}
              </span>
            </div>

            {geminiStatus.hasKey && (
              <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl text-[11px]">
                <span className="text-slate-400">Key បច្ចុប្បន្ន ៖</span>
                <span className="font-mono text-emerald-400 font-bold">{geminiStatus.maskedKey}</span>
                <span className="text-[9.5px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded">
                  {geminiStatus.isFromEnv ? 'ENV' : 'Custom'}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="password"
                value={geminiKeyInput}
                onChange={e => setGeminiKeyInput(e.target.value)}
                placeholder={geminiStatus.hasKey ? 'បញ្ចូល Key ថ្មីដើម្បីប្តូរ...' : 'បញ្ចូល Gemini API Key (AIzaSy...)'}
                className="flex-1 bg-slate-950 border border-indigo-500/50 focus:border-indigo-400 rounded-xl px-3 py-2 text-xs text-indigo-100 placeholder-slate-500 outline-none font-mono"
              />
              <button
                type="button"
                disabled={isSavingGemini || !geminiKeyInput.trim()}
                onClick={handleSaveGeminiKey}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                {isSavingGemini ? '...' : '💾 រក្សាទុក'}
              </button>
            </div>

            {geminiFeedback && (
              <div className="text-[11px] font-bold text-cyan-300 animate-fade-in">
                {geminiFeedback}
              </div>
            )}

            <div className="flex items-center justify-between text-[10.5px]">
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 hover:underline"
              >
                ✨ យក API Key ឥតគិតថ្លៃ (Free 100%) ↗
              </a>
              {geminiStatus.hasCustomKey && (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch('/api/fast_check/save_gemini_key', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ gemini_api_key: '' })
                    });
                    const d = await res.json();
                    if (d.success) {
                      setGeminiStatus({ hasKey: false, maskedKey: '', isFromEnv: false, hasCustomKey: false });
                      setGeminiFeedback('🗑️ បានលុប Key ផ្ទាល់ខ្លួនរួច');
                    }
                  }}
                  className="text-rose-400 hover:text-rose-300 hover:underline"
                >
                  🗑️ លុប Key ផ្ទាល់ខ្លួន
                </button>
              )}
            </div>
          </div>

          {/* Section 4.5: Telegram Bot Assistant & Slip AI Scanner */}
          <div className="bg-[#0A162B] border border-sky-500/40 rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <div>
                  <span className="font-bold text-sky-300 text-sm">Telegram Bot Assistant &amp; Slip Auto-Tick</span>
                  <p className="text-[11px] text-slate-400">ស្កេនរូប Slip តាម Telegram Auto-Tick &amp; បញ្ជាឆាត</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                tgConfig.has_token
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              }`}>
                {tgConfig.has_token ? '✅ Bot កំពុងដំណើរការ' : '⚠️ មិនទាន់កំណត់ Token'}
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                value={tgTokenInput}
                onChange={e => setTgTokenInput(e.target.value)}
                placeholder="បញ្ចូល Telegram Bot Token (ឧ. 123456:ABC-DEF...)"
                className="flex-1 bg-slate-950 border border-sky-500/50 focus:border-sky-400 rounded-xl px-3 py-2 text-xs text-sky-100 placeholder-slate-500 outline-none font-mono"
              />
              <button
                type="button"
                disabled={isSavingTg || !tgTokenInput.trim()}
                onClick={handleSaveTgToken}
                className="bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                {isSavingTg ? '...' : '💾 រក្សាទុក'}
              </button>
            </div>

            {tgFeedback && (
              <div className="text-[11px] font-bold text-cyan-300 animate-fade-in">
                {tgFeedback}
              </div>
            )}

            {/* Quick Command Guide Accordion */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowTgGuide(!showTgGuide)}
                className="text-[11px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>{showTgGuide ? '▼ បិទការណែនាំពាក្យបញ្ជា' : '▶ មើលរបៀបប្រើ & ពាក្យបញ្ជា Bot (/check, /paid, Slip...)'}</span>
              </button>

              {showTgGuide && (
                <div className="mt-2 p-3 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2 text-[11px] text-slate-300">
                  <div className="font-bold text-sky-300 flex items-center gap-1">
                    <span>📸 ១. របៀបស្កេនរូបភាព Slip (Option 1) ៖</span>
                  </div>
                  <p className="text-slate-400">
                    គ្រាន់តែ <b>Forward រូបថតវិក្កយបត្រ (ABA/ACLEDA/KHQR)</b> ពីឆាតភ្ញៀវចូលក្នុង Bot ឬ Group ដែលមាន Bot នោះ AI នឹងអានទិន្នន័យ និង Tick [បង់រួច] លើ Web Dashboard ស្វ័យប្រវត្តិតែម្តង!
                  </p>

                  <div className="font-bold text-sky-300 flex items-center gap-1 pt-1 border-t border-slate-800/80">
                    <span>💬 ២. ពាក្យបញ្ជា Chat ក្នុង Telegram (Option 3) ៖</span>
                  </div>
                  <ul className="space-y-1 font-mono text-[10.5px]">
                    <li><b className="text-emerald-400">/check &lt;លេខកន្ត្រក ឬ ឈ្មោះ&gt;</b> <span className="text-slate-400">- មើលទំនិញ តម្លៃ និងស្ថានភាព</span></li>
                    <li><b className="text-emerald-400">/paid &lt;លេខកន្ត្រក&gt;</b> <span className="text-slate-400">- Tick បង់រួចលើកន្ត្រក</span></li>
                    <li><b className="text-emerald-400">/unpaid &lt;លេខកន្ត្រក&gt;</b> <span className="text-slate-400">- ប្តូរទៅមិនទាន់បង់វិញ</span></li>
                    <li><b className="text-emerald-400">/today</b> <span className="text-slate-400">- របាយការណ៍សរុបប្រចាំថ្ងៃ &amp; ចំណូល</span></li>
                    <li><b className="text-emerald-400">/stock &lt;កូដ&gt;</b> <span className="text-slate-400">- ស្វែងរកស្តុក និងតម្លៃ</span></li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Font & UI Zoom Settings */}
          <div className="bg-[#0A1526] border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-3">
            <span className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
              <span>🎨</span> ការកំណត់ពុម្ពអក្សរ & ទំហំមើល (Typography & Zoom)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
              {/* Font Selector */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">ពុម្ពអក្សរខ្មែរ ៖</label>
                <select
                  value={khmerFont}
                  onChange={e => onChangeKhmerFont(e.target.value)}
                  className="w-full bg-slate-950 text-cyan-300 border border-[#1C2B4B] focus:border-cyan-400 px-3 py-2 rounded-xl font-bold text-xs outline-none cursor-pointer"
                >
                  <option value="kantumruy">✨ Kantumruy Pro</option>
                  <option value="santepheap">🌿 Santepheap</option>
                  <option value="battambang">🏛️ Battambang</option>
                  <option value="koulen">🔥 Koulen</option>
                </select>
              </div>

              {/* Font Size Zoom */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">ទំហំអក្សរទូទៅ ៖</label>
                <div className="flex items-center h-9 bg-slate-950 border border-[#1C2B4B] rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => onAdjustFontSize(-0.1)}
                    className="flex-1 bg-slate-900 hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-300 font-black text-xs active:scale-95 transition-all h-full flex items-center justify-center cursor-pointer border-r border-[#1C2B4B]"
                    title="បង្រួមអក្សរ"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={onResetFontSize}
                    className="flex-1 bg-slate-950 text-cyan-400 font-mono font-bold text-xs active:scale-95 transition-all h-full flex items-center justify-center cursor-pointer border-r border-[#1C2B4B]"
                    title="ទំហំដើម 100%"
                  >
                    {Math.round(fontScale * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => onAdjustFontSize(0.1)}
                    className="flex-1 bg-slate-900 hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-300 font-black text-xs active:scale-95 transition-all h-full flex items-center justify-center cursor-pointer"
                    title="ពង្រីកអក្សរ"
                  >
                    A+
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: App Links & Fullscreen */}
          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
            <PWAInstallButton />
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 flex items-center gap-1 active:scale-95 transition-all shadow-sm"
            >
              <span>↗️ បើក Tab ពេញលេញ</span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#080E1C] border-t border-[#1C2B4B] flex items-center justify-end">
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-5 py-2 rounded-xl text-xs active:scale-95 transition-all cursor-pointer"
          >
            រួចរាល់ (Done)
          </button>
        </div>
      </div>
    </div>
  );
}
