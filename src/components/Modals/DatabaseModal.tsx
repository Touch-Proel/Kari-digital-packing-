import React, { useState, useEffect, useRef } from 'react';
import {
  getKHQRConfig,
  saveKHQRConfig,
  decodeQRFromImageFile,
  parseBakongKHQRString,
  generateBakongKHQRString,
  generateKHQRDataUrl,
  KHQRConfig,
  DEFAULT_KHQR_CONFIG
} from '../../utils/khqr';

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDateFilter?: (date: string) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error') => void;
}

interface DateHistoryItem {
  date: string;
  live_ids: string[];
  total_invoices: number;
  total_revenue: number;
  staged_count: number;
  verified_count: number;
  paid_count: number;
}

interface DbStats {
  engine: string;
  db_file: string;
  file_size_bytes: number;
  total_invoices: number;
  total_products: number;
  total_customers: number;
  total_packer_logs: number;
  active_live_id: string;
}

export function DatabaseModal({ isOpen, onClose, onSelectDateFilter, onShowToast }: DatabaseModalProps) {
  const [activeTab, setActiveTab] = useState<'khqr' | 'db'>('khqr');
  const [stats, setStats] = useState<DbStats | null>(null);
  const [dates, setDates] = useState<DateHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // KHQR Configuration State
  const [khqrConfig, setKhqrConfig] = useState<KHQRConfig>(() => getKHQRConfig());
  const [sampleQrDataUrl, setSampleQrDataUrl] = useState<string>('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [isEditingManual, setIsEditingManual] = useState(false);
  const [manualForm, setManualForm] = useState<KHQRConfig>(() => getKHQRConfig());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDbInfo = async () => {
    setLoading(true);
    try {
      const [statsRes, datesRes] = await Promise.all([
        fetch('/api/db/stats'),
        fetch('/api/history/dates')
      ]);
      if (statsRes.ok) {
        const sData = await statsRes.json();
        setStats(sData);
      }
      if (datesRes.ok) {
        const dData = await datesRes.json();
        setDates(dData.dates || []);
      }
    } catch (err) {
      console.error('Failed to fetch DB stats:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync KHQR config with server
  const loadKhqrFromServer = async () => {
    try {
      const res = await fetch('/api/khqr/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          const cfg = saveKHQRConfig(data.config);
          setKhqrConfig(cfg);
          setManualForm(cfg);
        }
      }
    } catch (e) {
      console.error('Failed to sync KHQR config:', e);
    }
  };

  // Generate a live sample preview QR code
  useEffect(() => {
    try {
      const qrStr = generateBakongKHQRString({
        amount: 1.00,
        currency: 'USD',
        billNumber: 'SAMPLE',
        config: khqrConfig
      });
      generateKHQRDataUrl(qrStr, { width: 180, margin: 1 })
        .then(url => setSampleQrDataUrl(url))
        .catch(() => {});
    } catch (e) {
      console.error('Failed to render sample KHQR preview:', e);
    }
  }, [khqrConfig]);

  useEffect(() => {
    if (isOpen) {
      fetchDbInfo();
      loadKhqrFromServer();
      setUploadSuccessMsg(null);
    }
  }, [isOpen]);

  const handleDownloadBackup = () => {
    setDownloading(true);
    window.location.href = '/api/backup/download';
    setTimeout(() => setDownloading(false), 2000);
  };

  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);

  const handleRestoreJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('តើអ្នកពិតជាចង់ Restore ទិន្នន័យពីឯកសារ Backup នេះមែនទេ? ទិន្នន័យបច្ចុប្បន្ននឹងត្រូវជំនួសដោយឯកសារនេះ។')) {
      e.target.value = '';
      return;
    }

    setRestoring(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast(data.message, 'success');
        fetchDbInfo();
      } else {
        if (onShowToast) onShowToast(data.error || 'Restore បរាជ័យ', 'error');
      }
    } catch (err: any) {
      if (onShowToast) onShowToast('បរាជ័យក្នុងការអានឯកសារ JSON: ' + err.message, 'error');
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  // Handle uploaded real KHQR screenshot
  const handleProcessQrFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      if (onShowToast) onShowToast('សូមជ្រើសរើសឯកសារជារូបភាព (PNG/JPG)', 'error');
      return;
    }

    setIsProcessingImage(true);
    setUploadSuccessMsg(null);

    try {
      const { qrString: decodedStr, error } = await decodeQRFromImageFile(file);

      if (!decodedStr) {
        if (onShowToast) onShowToast(`❌ ${error || 'រកមិនឃើញ QR កូដក្នុងរូបភាពឡើយ'}`, 'error');
        setIsProcessingImage(false);
        return;
      }

      const parsed = parseBakongKHQRString(decodedStr);

      const updated: Partial<KHQRConfig> = {
        originalQRString: decodedStr,
        enabled: true
      };

      if (parsed.bakongAccountId) updated.bakongAccountId = parsed.bakongAccountId;
      if (parsed.accountNumber) updated.accountNumber = parsed.accountNumber;
      if (parsed.merchantName) updated.merchantName = parsed.merchantName;
      if (parsed.merchantCity) updated.merchantCity = parsed.merchantCity;
      if (parsed.merchantType) updated.merchantType = parsed.merchantType;

      const saved = saveKHQRConfig(updated);
      setKhqrConfig(saved);
      setManualForm(saved);

      const successText = `🎉 បានស្គាល់ Bakong ID: ${saved.bakongAccountId} (ABA: ${saved.accountNumber}) ដោយជោគជ័យ!`;
      setUploadSuccessMsg(successText);
      if (onShowToast) onShowToast(successText, 'success');
    } catch (err: any) {
      console.error('Failed to parse uploaded QR:', err);
      if (onShowToast) onShowToast('❌ បរាជ័យក្នុងការអាន QR កូដ', 'error');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessQrFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessQrFile(file);
    }
  };

  const handleSaveManual = () => {
    const saved = saveKHQRConfig(manualForm);
    setKhqrConfig(saved);
    setIsEditingManual(false);
    if (onShowToast) onShowToast('✅ បានរក្សាទុកព័ត៌មាន ABA / KHQR រួចរាល់!', 'success');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0B132B] border border-cyan-500/40 w-full max-w-xl rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={jsonFileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleRestoreJsonFile}
        />

        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-[#0B132B] to-slate-900 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="text-sm font-black text-white">ការកំណត់ប្រព័ន្ធ & ទិន្នន័យ SQLite</h2>
              <p className="text-[11px] text-cyan-400">Store Settings, KHQR Configuration & Local Database</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Top Tab Bar */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-950/80 border-b border-slate-800 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('khqr')}
            className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'khqr'
                ? 'bg-[#E11925] text-white shadow-[0_0_12px_rgba(225,25,37,0.4)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <span className="bg-white text-[#E11925] text-[10px] font-black px-1 rounded">KHQR</span>
            <span>កំណត់ ABA KHQR (Upload)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('db')}
            className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'db'
                ? 'bg-cyan-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <span>🗄️</span>
            <span>SQLite & ប្រវត្តិ Live តាមថ្ងៃ</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'khqr' ? (
            /* TAB 1: KHQR STORE SETTINGS WITH REAL QR UPLOAD */
            <div className="space-y-3.5">
              {/* Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-red-500/50 hover:border-red-400 bg-red-950/20 hover:bg-red-950/30 rounded-2xl p-4 text-center cursor-pointer transition-all space-y-2 group"
              >
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#E11925]/20 text-[#E11925] border border-red-500/40 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform shadow-sm">
                  📷
                </div>
                <div>
                  <div className="text-white font-black text-sm flex items-center justify-center gap-1.5">
                    <span>{isProcessingImage ? '⏳ កំពុងអានទិន្នន័យ QR...' : 'ចុច ឬទម្លាក់រូបភាព Screenshot QR ដើមពី ABA Mobile'}</span>
                  </div>
                  <p className="text-slate-400 text-[11px] mt-1 max-w-sm mx-auto leading-relaxed">
                    បើក <strong>ABA Mobile</strong> ➔ ចុច <strong>Receive Money (ទទួលប្រាក់)</strong> ➔ <strong>Screenshot</strong> ➔ ដាក់រូបទីនេះ។ ប្រព័ន្ធនឹងអានស្គាល់ Bakong Account ID ស្វ័យប្រវត្តិ!
                  </p>
                </div>
                <div className="pt-1">
                  <span className="inline-block px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] rounded-lg shadow-sm">
                    {isProcessingImage ? 'កំពុងដំណើរការ...' : '📂 ជ្រើសរើសរូបភាពពីកុំព្យូទ័រ / ទូរស័ព្ទ'}
                  </span>
                </div>
              </div>

              {/* Success Notification Banner */}
              {uploadSuccessMsg && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500 text-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
                  <span>✅</span>
                  <span>{uploadSuccessMsg}</span>
                </div>
              )}

              {/* Active KHQR Status Card with Live Sample Preview */}
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#E11925] text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm">
                      KHQR
                    </span>
                    <span className="font-black text-white text-xs">
                      ព័ត៌មានគណនី ABA & Bakong បច្ចុប្បន្ន
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/40">
                    ✓ ACTIVE (ស្កេនបានគ្រប់ធនាគារ)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                  {/* Left: Account Details */}
                  <div className="sm:col-span-2 space-y-1.5 text-[11px]">
                    <div className="flex justify-between py-1 border-b border-slate-800/80">
                      <span className="text-slate-400">ធនាគារ ៖</span>
                      <strong className="text-white font-bold">{khqrConfig.bankName}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/80">
                      <span className="text-slate-400">លេខគណនី ABA ៖</span>
                      <strong className="text-cyan-300 font-mono font-bold text-xs">{khqrConfig.accountNumber}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/80">
                      <span className="text-slate-400">ឈ្មោះម្ចាស់គណនី ៖</span>
                      <strong className="text-amber-300 font-bold">{khqrConfig.accountName}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/80">
                      <span className="text-slate-400">ឈ្មោះហាង ៖</span>
                      <strong className="text-emerald-300 font-bold">{khqrConfig.merchantName}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/80">
                      <span className="text-slate-400">Bakong Account ID ៖</span>
                      <strong className="text-purple-300 font-mono font-bold text-[11px]">{khqrConfig.bakongAccountId}</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">ស្តង់ដារ EMVCo ៖</span>
                      <span className="text-blue-400 font-bold">
                        {khqrConfig.merchantType !== 'individual' ? 'Tag 30 (គណនី ABA ផ្លូវការ)' : 'Tag 29 (Bakong ID)'}
                      </span>
                    </div>
                  </div>

                  {/* Right: Live Preview QR */}
                  <div className="flex flex-col items-center justify-center p-2 bg-white rounded-xl shadow-inner">
                    {sampleQrDataUrl ? (
                      <img
                        src={sampleQrDataUrl}
                        alt="Sample KHQR Preview"
                        className="w-28 h-28 object-contain"
                      />
                    ) : (
                      <div className="w-28 h-28 bg-slate-100 flex items-center justify-center text-slate-400 text-[10px]">
                        កំពុងបង្កើត QR...
                      </div>
                    )}
                    <span className="text-[10px] text-slate-600 font-mono mt-1 font-bold">
                      ស្កេនតេស្តបាន
                    </span>
                  </div>
                </div>

                {/* Edit Manual Toggle */}
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">
                    ត្រូវការកែប្រែដោយដៃ?
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingManual(!isEditingManual)}
                    className="text-cyan-400 hover:text-cyan-300 text-[11px] font-bold underline cursor-pointer"
                  >
                    {isEditingManual ? '▲ បិទការកែប្រែ' : '✏️ កែប្រែឈ្មោះ ឬលេខគណនី'}
                  </button>
                </div>

                {/* Manual Edit Form */}
                {isEditingManual && (
                  <div className="pt-2 space-y-2 border-t border-slate-800 animate-in fade-in duration-150">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">លេខគណនី ABA</label>
                        <input
                          type="text"
                          value={manualForm.accountNumber}
                          onChange={e => setManualForm({ ...manualForm, accountNumber: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">ឈ្មោះម្ចាស់គណនី</label>
                        <input
                          type="text"
                          value={manualForm.accountName}
                          onChange={e => setManualForm({ ...manualForm, accountName: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">ឈ្មោះហាង</label>
                        <input
                          type="text"
                          value={manualForm.merchantName}
                          onChange={e => setManualForm({ ...manualForm, merchantName: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Bakong ID / Gateway</label>
                        <input
                          type="text"
                          value={manualForm.bakongAccountId}
                          onChange={e => setManualForm({ ...manualForm, bakongAccountId: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setManualForm({ ...DEFAULT_KHQR_CONFIG });
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold cursor-pointer"
                      >
                        Reset Default
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveManual}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer shadow-sm"
                      >
                        💾 រក្សាទុក
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* TAB 2: SQLITE ENGINE STATS & DATE HISTORY */
            <div className="space-y-4">
              {/* SQLite Engine Status Card */}
              <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-black text-cyan-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>SQLite 3 Engine (Local SSD WAL)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/40">
                    ACTIVE
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400">វិក្កយបត្រសរុប</div>
                    <div className="text-base font-black text-amber-400 font-mono">
                      {stats ? stats.total_invoices : '...'}
                    </div>
                  </div>

                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400">មុខទំនិញកូដ</div>
                    <div className="text-base font-black text-sky-400 font-mono">
                      {stats ? stats.total_products : '...'}
                    </div>
                  </div>

                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400">អតិថិជន</div>
                    <div className="text-base font-black text-purple-400 font-mono">
                      {stats ? stats.total_customers : '...'}
                    </div>
                  </div>

                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-400">ទំហំ SQLite File</div>
                    <div className="text-base font-black text-emerald-400 font-mono">
                      {stats && stats.file_size_bytes ? `${(stats.file_size_bytes / 1024).toFixed(0)} KB` : '...'}
                    </div>
                  </div>
                </div>

                {/* 1-Click Backup & Restore Buttons */}
                <div className="pt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={handleDownloadBackup}
                    disabled={downloading}
                    className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all cursor-pointer"
                  >
                    <span>💾</span>
                    <span>{downloading ? 'កំពុងទាញយក...' : 'ទាញយក Backup (.json)'}</span>
                  </button>

                  <button
                    onClick={() => jsonFileInputRef.current?.click()}
                    disabled={restoring}
                    className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all cursor-pointer"
                  >
                    <span>📂</span>
                    <span>{restoring ? 'កំពុង Restore...' : 'បញ្ចូលទិន្នន័យ (Restore)'}</span>
                  </button>
                </div>
              </div>

              {/* Historical Dates List for Verification */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-white flex items-center gap-1.5">
                    <span>📅</span>
                    <span>ប្រវត្តិ Live & វិក្កយបត្រតាមថ្ងៃនីមួយៗ ({dates.length} ថ្ងៃ)</span>
                  </h3>
                  <button
                    onClick={fetchDbInfo}
                    className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                  >
                    🔄 Refresh
                  </button>
                </div>

                {loading ? (
                  <div className="py-6 text-center text-slate-400">កំពុងទាញទិន្នន័យពី SQLite...</div>
                ) : dates.length === 0 ? (
                  <div className="py-6 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
                    មិនទាន់មានប្រវត្តិកាលបរិច្ឆេទនៅឡើយទេ។
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {dates.map(item => (
                      <div
                        key={item.date}
                        className="p-3 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/40 rounded-xl flex items-center justify-between transition-all"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-white text-xs bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                              📆 {item.date}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              ({item.live_ids.length} វគ្គ Live)
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-300">
                            <span>📦 សរុប: <strong className="text-amber-400">{item.total_invoices}</strong> កន្ត្រក</span>
                            <span>💵 ប្រាក់: <strong className="text-emerald-400">${item.total_revenue.toFixed(2)}</strong></span>
                            <span>✅ ខ្ចប់: <strong className="text-sky-400">{item.staged_count}</strong></span>
                          </div>
                        </div>

                        {onSelectDateFilter && (
                          <button
                            onClick={() => {
                              onSelectDateFilter(item.date);
                              onClose();
                            }}
                            className="px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 font-bold rounded-lg border border-cyan-500/50 text-[11px] active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                          >
                            មើលកន្ត្រកថ្ងៃនេះ 🔍
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
          >
            បិទផ្ទាំង
          </button>
        </div>
      </div>
    </div>
  );
}
