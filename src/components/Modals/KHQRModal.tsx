import React, { useState, useEffect, useRef } from 'react';
import { Invoice } from '../../types';
import {
  generateBakongKHQRString,
  generateKHQRDataUrl,
  getKHQRConfig,
  saveKHQRConfig,
  parseBakongKHQRString,
  decodeQRFromImageFile,
  KHQRConfig,
  DEFAULT_KHQR_CONFIG
} from '../../utils/khqr';
import { playPureTone, playSuccessFanfare } from '../../utils/audio';

interface KHQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onOpenReceiptModal?: (inv: Invoice) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export function KHQRModal({
  isOpen,
  onClose,
  invoice,
  onOpenReceiptModal,
  onShowToast
}: KHQRModalProps) {
  const [config, setConfig] = useState<KHQRConfig>(() => getKHQRConfig());
  const [currency, setCurrency] = useState<'USD' | 'KHR'>('USD');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [qrMode, setQrMode] = useState<'dynamic' | 'static' | 'original'>('dynamic');
  const [qrString, setQrString] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isEditingSettings, setIsEditingSettings] = useState<boolean>(false);
  const [tempConfig, setTempConfig] = useState<KHQRConfig>(() => getKHQRConfig());
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync config from server on open
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/khqr/config')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.config) {
          const cfg = saveKHQRConfig(data.config);
          setConfig(cfg);
          setTempConfig(cfg);
          if (cfg.qrMode) setQrMode(cfg.qrMode);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Compute amount
  const invoiceSubtotal = invoice
    ? invoice.items.reduce((s, it) => s + it.price * it.quantity, 0)
    : 0;
  const invoiceShipping = invoice
    ? (invoice.shipping_fee !== undefined && invoice.shipping_fee > 0 ? invoice.shipping_fee : 2.0)
    : 0;
  const invoiceTotalUsd = invoice ? Number((invoiceSubtotal + invoiceShipping).toFixed(2)) : 0;
  const invoiceTotalKhr = Math.round(invoiceTotalUsd * 4100);

  const activeAmountUsd = invoice
    ? invoiceTotalUsd
    : (customAmount ? Math.max(0, Number(customAmount) || 0) : 0);
  const activeAmountKhr = Math.round(activeAmountUsd * 4100);

  const amountToCharge = qrMode === 'static'
    ? 0
    : (currency === 'KHR' ? activeAmountKhr : activeAmountUsd);

  // Generate QR string & image
  useEffect(() => {
    if (!isOpen) return;

    try {
      if (qrMode === 'original' && config.originalQRImageUrl) {
        setQrDataUrl(config.originalQRImageUrl);
        setQrString(config.originalQRString || '');
        return;
      }

      const qrStr = generateBakongKHQRString({
        amount: amountToCharge,
        currency,
        billNumber: invoice ? (invoice.basket_no || invoice.invoice_id) : undefined,
        storeLabel: config.merchantName || 'Kari Arnett',
        config: {
          ...config,
          qrMode
        }
      });

      setQrString(qrStr);
      generateKHQRDataUrl(qrStr, { width: 360, margin: 1 })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('KHQR data URL failed:', err));
    } catch (err) {
      console.error('Failed to generate KHQR string:', err);
    }
  }, [isOpen, invoice, amountToCharge, currency, config, qrMode]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    if (!qrString) return;
    navigator.clipboard.writeText(qrString);
    playPureTone(1000, 0.08);
    onShowToast('📋 បានចម្លងកូដ KHQR ទៅ Clipboard រួចរាល់!');
  };

  const handleDownloadPng = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    const filename = invoice
      ? `KHQR_Basket_${invoice.basket_no || invoice.invoice_id}_${currency}.png`
      : `KHQR_KariArnett_${currency}.png`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    playSuccessFanfare();
    onShowToast('📥 បានទាញយករូបភាព QR code រួចរាល់!');
  };

  const handleSaveSettings = () => {
    const saved = saveKHQRConfig({
      ...tempConfig,
      qrMode
    });
    setConfig(saved);
    setIsEditingSettings(false);
    playSuccessFanfare();
    onShowToast('✅ បានរក្សាទុកព័ត៌មាន ABA / KHQR រួចរាល់!');
  };

  // Upload and decode original ABA QR screenshot
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    try {
      const { qrString: decodedStr, error } = await decodeQRFromImageFile(file);

      if (!decodedStr) {
        onShowToast(error || 'រកមិនឃើញ QR កូដក្នុងរូបភាពនេះទេ', 'error');
        setIsProcessingImage(false);
        return;
      }

      // Convert file to data URL for original image display
      const reader = new FileReader();
      reader.onload = (ev) => {
        const originalDataUrl = ev.target?.result as string;
        const parsed = parseBakongKHQRString(decodedStr);

        const updated: Partial<KHQRConfig> = {
          originalQRString: decodedStr,
          originalQRImageUrl: originalDataUrl,
          qrMode: 'dynamic'
        };

        if (parsed.bakongAccountId) {
          updated.bakongAccountId = parsed.bakongAccountId;
        }
        if (parsed.accountNumber) {
          updated.accountNumber = parsed.accountNumber;
        }
        if (parsed.merchantName) {
          updated.merchantName = parsed.merchantName;
        }
        if (parsed.merchantCity) {
          updated.merchantCity = parsed.merchantCity;
        }

        if (parsed.merchantType) {
          updated.merchantType = parsed.merchantType;
        }
        if (parsed.acquiringBank) {
          updated.acquiringBank = parsed.acquiringBank;
        }

        const saved = saveKHQRConfig(updated);
        setConfig(saved);
        setTempConfig(saved);
        playSuccessFanfare();
        onShowToast(`🎉 បានអានកូដ ABA QR ជោគជ័យ!`);
        setIsProcessingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Failed to parse uploaded QR:', err);
      onShowToast('មិនអាចដំណើរការរូបភាពបានឡើយ', 'error');
      setIsProcessingImage(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#0A1326] border-2 border-red-500/80 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-fadeIn my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Hidden file input for QR upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Top Header */}
        <div className="bg-[#E11925] text-white p-3 sm:p-3.5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="bg-white text-[#E11925] font-black text-xs px-2 py-0.5 rounded-md shadow-sm">
              KHQR
            </span>
            <div>
              <h2 className="font-black text-sm sm:text-base leading-tight">
                Bakong KHQR Payment
              </h2>
              <p className="text-[11px] text-white/90">
                {config.bankName} ‧ ស្កេនបានគ្រប់ធនាគារក្នុងប្រទេសកម្ពុជា
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsEditingSettings(prev => !prev)}
              className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center text-xs font-bold transition-all cursor-pointer"
              title="ការកំណត់ KHQR (Settings)"
            >
              ⚙️
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center font-bold text-sm cursor-pointer transition-all"
              title="បិទ (Close)"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 flex flex-col items-center gap-3">
          {/* Invoice Info Bar (If opened from Basket) */}
          {invoice && !isEditingSettings && (
            <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl font-black font-mono text-cyan-400">
                  #{invoice.basket_no || invoice.invoice_id}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate max-w-[160px]">
                    {invoice.facebook_name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {invoice.items.length} មុខទំនិញ ‧ {invoice.location_zone === 'PROVINCE' ? '🏕️ ខេត្ត' : '🏙️ ភ្នំពេញ'}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-emerald-400 font-mono font-black text-sm">
                  ${invoiceTotalUsd.toFixed(2)}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {invoiceTotalKhr.toLocaleString('en-US')} ៛
                </div>
              </div>
            </div>
          )}

          {/* Standalone Amount Input (If opened without invoice and dynamic mode) */}
          {!invoice && !isEditingSettings && qrMode === 'dynamic' && (
            <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-300 flex justify-between items-center">
                <span>ចំនួនទឹកប្រាក់គិតថ្លៃ (Amount) ៖</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 font-black text-base">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-sm outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          )}

          {/* Currency Switcher Pill (Only if dynamic) */}
          {!isEditingSettings && qrMode === 'dynamic' && (
            <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 w-full justify-center gap-2">
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={`flex-1 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  currency === 'USD'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>💵 USD</span>
                <span className="font-mono">(${activeAmountUsd > 0 ? activeAmountUsd.toFixed(2) : '0.00'})</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrency('KHR')}
                className={`flex-1 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  currency === 'KHR'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>៛ KHR</span>
                <span className="font-mono">({activeAmountKhr > 0 ? activeAmountKhr.toLocaleString('en-US') : '0'} ៛)</span>
              </button>
            </div>
          )}

          {/* Main Visual QR Display Card */}
          {!isEditingSettings ? (
            <div className="bg-white rounded-3xl p-3 sm:p-4 w-full flex flex-col items-center shadow-xl border-4 border-red-500/90 text-black">
              {/* Red Header inside QR box */}
              <div className="w-full bg-[#E11925] text-white py-1 px-3 rounded-lg flex items-center justify-between mb-2 shadow-sm">
                <div className="flex items-center gap-1.5 font-black text-xs">
                  <span className="bg-white text-[#E11925] px-1 rounded font-black text-[10px]">KHQR</span>
                  <span>{config.bankName}</span>
                </div>
                <span className="font-mono text-xs font-black tracking-wider">
                  {qrMode === 'static'
                    ? 'SCAN TO PAY'
                    : (currency === 'KHR' ? `${activeAmountKhr.toLocaleString('en-US')} ៛` : `$${activeAmountUsd.toFixed(2)}`)}
                </span>
              </div>

              {/* QR Image */}
              {qrDataUrl ? (
                <div className="relative p-1 bg-white rounded-2xl border border-slate-200">
                  <img
                    src={qrDataUrl}
                    alt="Bakong KHQR"
                    className="w-52 h-52 sm:w-56 sm:h-56 object-contain rounded-xl"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  {qrMode !== 'original' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-8 h-8 rounded-full bg-white border-2 border-red-600 flex items-center justify-center shadow-sm">
                        <span className="text-[10px] font-black text-[#E11925]">KH</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-xs font-bold text-slate-400">
                  កំពុងបង្កើត QR...
                </div>
              )}

              {/* Merchant Details */}
              <div className="text-center mt-2 w-full">
                <div className="text-xs sm:text-sm font-mono font-black text-slate-900">
                  {config.bankName}: <span className="text-blue-700 underline">{config.accountNumber}</span>
                </div>
                <div className="text-xs text-slate-700 font-bold mt-0.5">
                  ឈ្មោះគណនី ៖ <span className="text-black font-black">{config.accountName}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  ឈ្មោះហាង ៖ <span className="font-bold text-slate-800">{config.merchantName}</span>
                </div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5 bg-slate-100 py-0.5 px-2 rounded-md inline-block">
                  {config.merchantType !== 'individual' ? (
                    <span>ស្តង់ដារ ៖ <strong className="text-blue-700">Tag 30 (គណនី ABA {config.accountNumber})</strong></span>
                  ) : (
                    <span>Bakong ID: <span className="font-bold text-slate-900">{config.bakongAccountId}</span></span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Settings View */
            <div className="w-full bg-slate-900/95 border border-cyan-500/70 rounded-2xl p-3 sm:p-4 flex flex-col gap-2.5 text-xs">
              <div className="font-black text-cyan-300 pb-2 border-b border-slate-800 flex items-center justify-between">
                <span>⚙️ កែប្រែព័ត៌មាន ABA & KHQR</span>
                <button
                  type="button"
                  onClick={() => setIsEditingSettings(false)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕ ត្រឡប់
                </button>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  ទម្រង់ស្តង់ដារ KHQR (Standard Routing)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTempConfig(prev => ({ ...prev, merchantType: 'merchant' }))}
                    className={`p-2 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                      tempConfig.merchantType !== 'individual'
                        ? 'bg-blue-600/30 border-blue-400 text-blue-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-white flex items-center gap-1">
                      <span>🏢 Tag 30 (គណនី ABA)</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      ណែនាំបំផុតសម្រាប់លេខគណនី {tempConfig.accountNumber} (ACLEDA អាចស្កេនបាន)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTempConfig(prev => ({ ...prev, merchantType: 'individual' }))}
                    className={`p-2 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                      tempConfig.merchantType === 'individual'
                        ? 'bg-purple-600/30 border-purple-400 text-purple-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-white flex items-center gap-1">
                      <span>👤 Tag 29 (Bakong ID)</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      សម្រាប់អ្នកមាន Bakong ID ផ្ទាល់ខ្លួន (@abaa)
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-amber-300 block mb-1">
                  ★ Bakong Account ID / Gateway
                </label>
                <input
                  type="text"
                  value={tempConfig.bakongAccountId}
                  onChange={e => setTempConfig(prev => ({ ...prev, bakongAccountId: e.target.value.trim() }))}
                  className="w-full bg-slate-950 border border-amber-500/60 rounded-xl px-3 py-1.5 text-amber-200 font-mono font-bold outline-none focus:border-amber-400"
                  placeholder="abaakhppxxx@abaa ឬ proel_toch@abaa"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 សម្រាប់គណនី ABA ទុក <code>abaakhppxxx@abaa</code> ជាស្តង់ដារ ឬដាក់ឈ្មោះ Bakong ផ្ទាល់ខ្លួន
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  លេខគណនី ABA (Account Number)
                </label>
                <input
                  type="text"
                  value={tempConfig.accountNumber}
                  onChange={e => setTempConfig(prev => ({ ...prev, accountNumber: e.target.value.trim() }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono font-bold outline-none"
                  placeholder="000474559"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  ឈ្មោះម្ចាស់គណនី (Account Name)
                </label>
                <input
                  type="text"
                  value={tempConfig.accountName}
                  onChange={e => setTempConfig(prev => ({ ...prev, accountName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-bold outline-none"
                  placeholder="Proel Toch"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  ឈ្មោះហាង (Merchant Name)
                </label>
                <input
                  type="text"
                  value={tempConfig.merchantName}
                  onChange={e => setTempConfig(prev => ({ ...prev, merchantName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-bold outline-none"
                  placeholder="Kari Arnett"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTempConfig({ ...DEFAULT_KHQR_CONFIG })}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl cursor-pointer"
                >
                  កំណត់ដើម
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black rounded-xl shadow-md cursor-pointer hover:opacity-95"
                >
                  រក្សាទុក
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons Row */}
          {!isEditingSettings && (
            <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyCode}
                className="py-2 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                title="ចម្លងកូដ KHQR ទៅ Clipboard"
              >
                <span>📋</span>
                <span>ចម្លងកូដ</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPng}
                className="py-2 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                title="ទាញយករូបភាព QR code ជា PNG"
              >
                <span>📥</span>
                <span>ទាញយក</span>
              </button>

              {invoice && onOpenReceiptModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenReceiptModal(invoice);
                  }}
                  className="py-2 px-2 bg-blue-950/90 hover:bg-blue-900 border border-blue-500 text-sky-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                  title="បើកវិក្កយបត្រដើម្បីព្រីន"
                >
                  <span>🖨️</span>
                  <span>ព្រីន</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setTempConfig({ ...config });
                  setIsEditingSettings(true);
                }}
                className="py-2 px-2 bg-slate-900 hover:bg-slate-800 border border-cyan-500/50 text-cyan-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                title="កែប្រែគណនី ABA & KHQR"
              >
                <span>⚙️</span>
                <span>កែប្រែ</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
