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
  const [qrMode, setQrMode] = useState<'original' | 'dynamic'>(() => {
    const c = getKHQRConfig();
    return (c.qrMode === 'dynamic') ? 'dynamic' : 'original';
  });
  const [qrString, setQrString] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isEditingSettings, setIsEditingSettings] = useState<boolean>(false);
  const [tempConfig, setTempConfig] = useState<KHQRConfig>(() => getKHQRConfig());
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
          if (cfg.qrMode === 'dynamic') {
            setQrMode('dynamic');
          } else {
            setQrMode('original');
          }
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

  const isOriginalMode = qrMode === 'original';
  const amountToCharge = isOriginalMode
    ? 0
    : (currency === 'KHR' ? activeAmountKhr : activeAmountUsd);

  // Generate QR string & image
  useEffect(() => {
    if (!isOpen) return;

    try {
      // 1. If Original Mode and user uploaded a photo/custom string
      if (isOriginalMode && config.originalQRImageUrl) {
        setQrDataUrl(config.originalQRImageUrl);
        setQrString(config.originalQRString || '');
        return;
      }

      // 2. Generate Bakong KHQR String
      const qrStr = (isOriginalMode && config.originalQRString)
        ? config.originalQRString
        : generateBakongKHQRString({
            amount: amountToCharge,
            currency: isOriginalMode ? 'USD' : currency,
            billNumber: invoice ? (invoice.basket_no || invoice.invoice_id) : undefined,
            storeLabel: config.merchantName || 'TOCH PROEL',
            config: {
              ...config,
              qrMode: isOriginalMode ? 'static' : 'dynamic'
            }
          });

      setQrString(qrStr);
      generateKHQRDataUrl(qrStr, { width: 380, margin: 1 })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('KHQR data URL failed:', err));
    } catch (err) {
      console.error('Failed to generate KHQR string:', err);
    }
  }, [isOpen, invoice, amountToCharge, currency, config, qrMode, isOriginalMode]);

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
    const filename = isOriginalMode
      ? `ABA_KHQR_TOCH_PROEL_DualCurrency.png`
      : (invoice
          ? `KHQR_Basket_${invoice.basket_no || invoice.invoice_id}_${currency}.png`
          : `KHQR_TOCH_PROEL_${currency}.png`);
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
    onShowToast('✅ បានរក្សាទុកព័ត៌មាន ABA & KHQR រួចរាល់!');
  };

  // Upload and decode original ABA QR screenshot/photo
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    try {
      const { qrString: decodedStr, error } = await decodeQRFromImageFile(file);

      // Convert file to data URL for display
      const reader = new FileReader();
      reader.onload = (ev) => {
        const originalDataUrl = ev.target?.result as string;
        const parsed = decodedStr ? parseBakongKHQRString(decodedStr) : null;

        const updated: Partial<KHQRConfig> = {
          originalQRImageUrl: originalDataUrl,
          qrMode: 'original'
        };

        if (decodedStr) {
          updated.originalQRString = decodedStr;
        }

        if (parsed && 'bakongAccountId' in parsed && parsed.bakongAccountId) {
          updated.bakongAccountId = parsed.bakongAccountId;
        }
        if (parsed && 'accountNumber' in parsed && parsed.accountNumber) {
          updated.accountNumber = parsed.accountNumber;
        }
        if (parsed && 'merchantName' in parsed && parsed.merchantName) {
          updated.merchantName = parsed.merchantName;
        }

        const saved = saveKHQRConfig(updated);
        setConfig(saved);
        setTempConfig(saved);
        setQrMode('original');
        setQrDataUrl(originalDataUrl);
        if (decodedStr) setQrString(decodedStr);

        playSuccessFanfare();
        if (decodedStr) {
          onShowToast(`🎉 បានអានកូដ ABA QR ជោគជ័យ!`);
        } else {
          onShowToast(`📸 បានបញ្ចូលរូបភាព QR ដើមរួចរាល់!`);
        }
        setIsProcessingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Failed to parse uploaded QR:', err);
      onShowToast('មិនអាចដំណើរការរូបភាពបានឡើយ', 'error');
      setIsProcessingImage(false);
    }
  };

  const handleRemoveOriginalImage = () => {
    const updated = saveKHQRConfig({
      originalQRImageUrl: '',
      originalQRString: ''
    });
    setConfig(updated);
    setTempConfig(updated);
    onShowToast('🔄 បានលុបរូបភាព QR ដើមរួចរាល់');
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
              <h2 className="font-black text-sm sm:text-base leading-tight flex items-center gap-1.5">
                <span>{config.bankName}</span>
                <span className="text-xs font-normal text-white/80">‧</span>
                <span className="text-white font-black">{config.accountName || 'TOCH PROEL'}</span>
              </h2>
              <p className="text-[11px] text-white/90">
                ដុល្លារ ($) និង ខ្មែរ (៛) តែ១ ‧ ស្កេនបានគ្រប់ធនាគារ
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsEditingSettings(prev => !prev)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${
                isEditingSettings ? 'bg-white text-red-600 shadow-md' : 'bg-black/20 hover:bg-black/40 text-white'
              }`}
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
                  <div className="text-xs font-bold text-white truncate max-w-[150px]">
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
                <div className="text-[10px] font-mono text-slate-400 font-bold">
                  {invoiceTotalKhr.toLocaleString('en-US')} ៛
                </div>
              </div>
            </div>
          )}

          {/* Mode Switcher Tabs: QR ដើម (1 QR ទាំង $ & ៛) vs Dynamic QR */}
          {!isEditingSettings && (
            <div className="grid grid-cols-2 gap-1.5 w-full bg-slate-900/90 p-1 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setQrMode('original');
                  saveKHQRConfig({ qrMode: 'original' });
                }}
                className={`py-2 px-2 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center cursor-pointer ${
                  isOriginalMode
                    ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg scale-[1.02]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-1 text-[12px]">
                  <span>✨ QR ដើម</span>
                  <span className="text-[10px] bg-white/20 px-1 rounded font-bold">QR តែ១</span>
                </div>
                <span className="text-[9.5px] font-normal text-white/85 mt-0.5">
                  ដុល្លារ ($) & ខ្មែរ (៛) តែមួយ
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setQrMode('dynamic');
                  saveKHQRConfig({ qrMode: 'dynamic' });
                }}
                className={`py-2 px-2 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center cursor-pointer ${
                  !isOriginalMode
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg scale-[1.02]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-1 text-[12px]">
                  <span>⚡ Dynamic QR</span>
                </div>
                <span className="text-[9.5px] font-normal text-white/85 mt-0.5">
                  បូកទឹកប្រាក់ស្វ័យប្រវត្ត
                </span>
              </button>
            </div>
          )}

          {/* Dynamic Mode: Currency Switcher & Custom Amount */}
          {!isEditingSettings && !isOriginalMode && (
            <div className="w-full flex flex-col gap-2">
              <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 w-full justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrency('USD')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    currency === 'USD'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>💵 USD ($)</span>
                  <span className="font-mono">(${activeAmountUsd > 0 ? activeAmountUsd.toFixed(2) : '0.00'})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrency('KHR')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    currency === 'KHR'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>៛ KHR (៛)</span>
                  <span className="font-mono">({activeAmountKhr > 0 ? activeAmountKhr.toLocaleString('en-US') : '0'} ៛)</span>
                </button>
              </div>

              {!invoice && (
                <div className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-2 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">បញ្ចូលទឹកប្រាក់ ៖</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono font-bold text-sm outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs text-cyan-400 font-bold">$</span>
                </div>
              )}
            </div>
          )}

          {/* MAIN VISUAL QR CARD (Modeled after official ABA Stand Poster) */}
          {!isEditingSettings ? (
            <div className="bg-white rounded-3xl p-3.5 sm:p-4 w-full flex flex-col items-center shadow-2xl border-4 border-red-500/90 text-black animate-fadeIn">
              {/* Official Poster Header: ABA' QR & KHQR Logo */}
              <div className="w-full flex items-center justify-between pb-2 mb-2 border-b-2 border-red-100">
                <div className="flex items-center gap-1.5">
                  <div className="bg-[#002D62] text-white font-black text-sm px-2 py-0.5 rounded tracking-wide font-sans">
                    ABA<span className="text-cyan-400">'</span> QR
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold hidden sm:inline">
                    ស្កេនបង់ប្រាក់
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="bg-[#E11925] text-white px-2 py-0.5 rounded font-black text-[11px] shadow-sm tracking-wider">
                    KHQR
                  </span>
                </div>
              </div>

              {/* Merchant / Account Name */}
              <div className="text-center mb-2">
                <h3 className="text-base sm:text-lg font-black text-slate-950 tracking-wide uppercase font-sans">
                  {config.accountName || 'TOCH PROEL'}
                </h3>
                <p className="text-[10px] text-slate-500 font-bold">
                  {isOriginalMode
                    ? 'ដុល្លារ និង ខ្មែរ តែ១ QR តែ១'
                    : `ទឹកប្រាក់បង់ ៖ ${currency === 'KHR' ? `${activeAmountKhr.toLocaleString('en-US')} ៛` : `$${activeAmountUsd.toFixed(2)} USD`}`}
                </p>
              </div>

              {/* QR Image Display */}
              {qrDataUrl ? (
                <div className="relative p-2 bg-white rounded-2xl border-2 border-slate-200 shadow-inner">
                  <img
                    src={qrDataUrl}
                    alt="Bakong KHQR"
                    className="w-52 h-52 sm:w-60 sm:h-60 object-contain rounded-xl"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  {!config.originalQRImageUrl && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-9 h-9 rounded-full bg-white border-2 border-[#E11925] flex items-center justify-center shadow-md">
                        <span className="text-[11px] font-black text-[#E11925]">KH</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-52 h-52 sm:w-60 sm:h-60 flex items-center justify-center text-xs font-bold text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  កំពុងបង្កើត QR...
                </div>
              )}

              {/* Dual Accounts Box (Matches the ABA Poster: ៛ KHR and $ USD) */}
              <div className="w-full mt-3 bg-gradient-to-b from-slate-50 to-slate-100 rounded-2xl p-2.5 border border-slate-200 shadow-sm flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs sm:text-sm font-black font-mono px-1">
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <span className="bg-emerald-100 text-emerald-800 w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs">
                      ៛
                    </span>
                    <span>គណនី KHR ៖</span>
                  </div>
                  <span className="text-slate-900 tracking-wider font-bold">
                    {config.khrAccountNumber || '003 491 232'}
                  </span>
                </div>

                <div className="h-px bg-slate-200 w-full" />

                <div className="flex items-center justify-between text-xs sm:text-sm font-black font-mono px-1">
                  <div className="flex items-center gap-1.5 text-blue-800">
                    <span className="bg-blue-100 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs">
                      $
                    </span>
                    <span>គណនី USD ៖</span>
                  </div>
                  <span className="text-slate-900 tracking-wider font-bold">
                    {config.accountNumber || '000 474 559'}
                  </span>
                </div>
              </div>

              {/* Footer text (Official ABA slogan) */}
              <div className="mt-2.5 text-center text-[10px] font-black tracking-wider text-slate-500 uppercase font-sans">
                ABA' BANK <span className="text-slate-300">|</span> NATIONAL BANK OF CANADA GROUP
              </div>

              {/* Informative Sub-badge */}
              <div className="mt-1.5 text-[10.5px] text-center font-bold text-slate-600 bg-slate-100 px-3 py-0.5 rounded-full">
                {isOriginalMode
                  ? '✨ ស្កេន QR តែមួយនេះ អាចជ្រើសផ្ទេរជា ដុល្លារ ($) ឬ រៀល (៛) តាមចិត្ត'
                  : '⚡ បង្កើតកូដ KHQR ស្វ័យប្រវត្តតាមទំហំទឹកប្រាក់'}
              </div>
            </div>
          ) : (
            /* Settings View */
            <div className="w-full bg-slate-900/95 border border-cyan-500/70 rounded-2xl p-3.5 sm:p-4 flex flex-col gap-3 text-xs">
              <div className="font-black text-cyan-300 pb-2 border-b border-slate-800 flex items-center justify-between">
                <span>⚙️ កំណត់គណនី ABA & QR ដើម</span>
                <button
                  type="button"
                  onClick={() => setIsEditingSettings(false)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕ ត្រឡប់
                </button>
              </div>

              {/* Dual Accounts Inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-blue-300 block mb-1">
                    $ លេខគណនី USD
                  </label>
                  <input
                    type="text"
                    value={tempConfig.accountNumber}
                    onChange={e => setTempConfig(prev => ({ ...prev, accountNumber: e.target.value.trim() }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono font-bold outline-none focus:border-cyan-400"
                    placeholder="000474559"
                  />
                </div>

                <div>
                  <label className="font-bold text-emerald-300 block mb-1">
                    ៛ លេខគណនី KHR
                  </label>
                  <input
                    type="text"
                    value={tempConfig.khrAccountNumber || ''}
                    onChange={e => setTempConfig(prev => ({ ...prev, khrAccountNumber: e.target.value.trim() }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono font-bold outline-none focus:border-cyan-400"
                    placeholder="003491232"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  ឈ្មោះម្ចាស់គណនី (Account Name)
                </label>
                <input
                  type="text"
                  value={tempConfig.accountName}
                  onChange={e => setTempConfig(prev => ({ ...prev, accountName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-bold outline-none focus:border-cyan-400"
                  placeholder="TOCH PROEL"
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-bold outline-none focus:border-cyan-400"
                  placeholder="TOCH PROEL"
                />
              </div>

              {/* Upload Original Poster Photo */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">
                    📷 រូបភាព QR ដើម (ABA Poster Stand)
                  </span>
                  {config.originalQRImageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveOriginalImage}
                      className="text-red-400 hover:text-red-300 text-[11px] font-bold cursor-pointer"
                    >
                      🗑️ លុបរូបចេញ
                    </button>
                  )}
                </div>
                <p className="text-[10.5px] text-slate-400">
                  អ្នកអាចផ្ទុករូបថតផ្ទាំង QR ដែល ABA ផ្តល់ជូន ដើម្បីបង្ហាញរូបដើមផ្ទាល់៖
                </p>
                <button
                  type="button"
                  disabled={isProcessingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <span>📷</span>
                  <span>{isProcessingImage ? 'កំពុងអានរូបភាព...' : 'ជ្រើសរើសរូបថត QR ពីទូរស័ព្ទ / កុំព្យូទ័រ'}</span>
                </button>
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
            <div className="w-full flex flex-col gap-2 pt-1">
              {/* Quick Upload Button in Original Mode if user wants to upload their poster */}
              {isOriginalMode && (
                <div className="w-full flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isProcessingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-red-500/50 hover:border-red-400 text-red-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                    title="ផ្ទុករូបភាព QR ដើម (Upload Photo)"
                  >
                    <span>📷</span>
                    <span>{isProcessingImage ? 'កំពុងអានរូបភាព...' : (config.originalQRImageUrl ? 'ប្តូររូបភាព QR ដើម' : 'ផ្ទុករូបថត QR ដើម')}</span>
                  </button>

                  {config.originalQRImageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveOriginalImage}
                      className="py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-red-400 font-bold text-xs rounded-xl cursor-pointer"
                      title="លុបរូបដើម ហើយប្រើកូដឌីជីថល"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              )}

              <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
