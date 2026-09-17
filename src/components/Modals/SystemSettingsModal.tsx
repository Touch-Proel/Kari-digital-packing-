import React, { useState } from 'react';
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
  onResetFontSize
}: SystemSettingsModalProps) {
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

          {/* Section 4: Font & UI Zoom Settings */}
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
