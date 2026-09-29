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
import { playPureTone, playSuccessFanfare } from '../../utils/audio';

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDateFilter?: (date: string) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error') => void;
  packerName?: string;
  onChangePackerName?: (newName: string) => void;
  userRole?: 'admin' | 'staff';
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

export function DatabaseModal({
  isOpen,
  onClose,
  onSelectDateFilter,
  onShowToast,
  packerName = '',
  onChangePackerName,
  userRole = 'staff'
}: DatabaseModalProps) {
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'profile' | 'khqr' | 'db'>('leaderboard');
  const [stats, setStats] = useState<DbStats | null>(null);
  const [dates, setDates] = useState<DateHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Leaderboard & Packer History State
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [packerHistory, setPackerHistory] = useState<any[]>([]);
  const [loadingPackerData, setLoadingPackerData] = useState(false);

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

  const fetchPackerData = async () => {
    setLoadingPackerData(true);
    try {
      const [lRes, hRes] = await Promise.all([
        fetch('/api/packer_leaderboard'),
        fetch(`/api/packer_history?name=${encodeURIComponent(packerName || '')}`)
      ]);
      if (lRes.ok) {
        const lData = await lRes.json();
        setLeaderboard(Array.isArray(lData) ? lData : []);
      }
      if (hRes.ok) {
        const hData = await hRes.json();
        setPackerHistory(Array.isArray(hData) ? hData : []);
      }
    } catch (err) {
      console.error('Failed to fetch packer data:', err);
    } finally {
      setLoadingPackerData(false);
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
      fetchPackerData();
      loadKhqrFromServer();
      setUploadSuccessMsg(null);
    }
  }, [isOpen, packerName]);

  const handleDownloadBackup = () => {
    setDownloading(true);
    window.location.href = '/api/db/backup';
    setTimeout(() => setDownloading(false), 2000);
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
      if (parsed.merchantName) updated.merchantName = parsed.merchantName;
      if (parsed.merchantCity) updated.merchantCity = parsed.merchantCity;
      if (parsed.acquiringBank) updated.acquiringBank = parsed.acquiringBank;

      const saved = saveKHQRConfig(updated);
      setKhqrConfig(saved);
      setManualForm(saved);

      await fetch('/api/khqr/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: saved })
      });

      playSuccessFanfare();
      const successText = `✨ បានចាប់ KHQR របស់ «${saved.merchantName || saved.bakongAccountId}» ដោយជោគជ័យ!`;
      setUploadSuccessMsg(successText);
      if (onShowToast) onShowToast(successText, 'success');
    } catch (err: any) {
      console.error(err);
      if (onShowToast) onShowToast('បរាជ័យក្នុងការអាន QR កូដ', 'error');
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

  const handleSaveManualForm = async () => {
    const saved = saveKHQRConfig(manualForm);
    setKhqrConfig(saved);
    setIsEditingManual(false);

    try {
      await fetch('/api/khqr/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: saved })
      });
      playPureTone(800, 0.05);
      if (onShowToast) onShowToast('💾 បានរក្សាទុកការកំណត់ KHQR ដោយជោគជ័យ!', 'success');
    } catch (e) {
      if (onShowToast) onShowToast('Failed to save KHQR config to server', 'error');
    }
  };

  const handleResetToDefault = async () => {
    if (confirm('តើអ្នកពិតជាចង់កំណត់ KHQR ទៅជា Default របស់ហាងវិញមែនទេ?')) {
      const saved = saveKHQRConfig(DEFAULT_KHQR_CONFIG);
      setKhqrConfig(saved);
      setManualForm(saved);
      setIsEditingManual(false);

      await fetch('/api/khqr/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: saved })
      });

      if (onShowToast) onShowToast('🔄 បានកំណត់ KHQR ទៅជា Default រួចរាល់');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-fadeIn">
      <div className="bg-[#0B132B] border border-cyan-500/40 w-full max-w-xl rounded-3xl shadow-[0_15px_50px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-[#0B132B] to-slate-900 border-b border-cyan-500/20 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">⚡</span>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <span>KARI OS SYSTEM & SETTINGS</span>
                <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full font-mono">
                  v2.5
                </span>
              </h2>
              <p className="text-[11px] text-cyan-400 font-medium">តារាងជើងខ្លាំង, Profile អ្នកច្រក, KHQR & ទិន្នន័យ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 4 Tabs Navigation */}
        <div className="grid grid-cols-4 p-1.5 bg-slate-950/90 border-b border-slate-800 gap-1 text-[11px]">
          {/* Tab 1: Leaderboard */}
          <button
            type="button"
            onClick={() => { playPureTone(500, 0.03); setActiveTab('leaderboard'); }}
            className={`py-2 px-1.5 rounded-xl font-bold flex items-center justify-center gap-1 transition-all cursor-pointer truncate ${
              activeTab === 'leaderboard'
                ? 'bg-amber-500 text-slate-950 font-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <span>🏆</span>
            <span className="truncate">ជើងខ្លាំង</span>
          </button>

          {/* Tab 2: Profile */}
          <button
            type="button"
            onClick={() => { playPureTone(500, 0.03); setActiveTab('profile'); }}
            className={`py-2 px-1.5 rounded-xl font-bold flex items-center justify-center gap-1 transition-all cursor-pointer truncate ${
              activeTab === 'profile'
                ? 'bg-cyan-500 text-slate-950 font-black shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <span>👤</span>
            <span className="truncate">Profile</span>
          </button>

          {/* Tab 3: KHQR */}
          <button
            type="button"
            onClick={() => { playPureTone(500, 0.03); setActiveTab('khqr'); }}
            className={`py-2 px-1.5 rounded-xl font-bold flex items-center justify-center gap-1 transition-all cursor-pointer truncate ${
              activeTab === 'khqr'
                ? 'bg-[#E11925] text-white font-black shadow-[0_0_12px_rgba(225,25,37,0.4)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <span>💳</span>
            <span className="truncate">KHQR</span>
          </button>

          {/* Tab 4: Database */}
          <button
            type="button"
            onClick={() => { playPureTone(500, 0.03); setActiveTab('db'); }}
            className={`py-2 px-1.5 rounded-xl font-bold flex items-center justify-center gap-1 transition-all cursor-pointer truncate ${
              activeTab === 'db'
                ? 'bg-indigo-600 text-white font-black shadow-[0_0_12px_rgba(79,70,229,0.4)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <span>🗄️</span>
            <span className="truncate">ទិន្នន័យ</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs flex-1 custom-scroll">
          
          {/* TAB 1: LEADERBOARD */}
          {activeTab === 'leaderboard' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-gradient-to-r from-amber-950/40 to-[#0A1A36] p-3 rounded-2xl border border-amber-500/30">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <div className="font-black text-amber-300 text-sm">តារាងជើងខ្លាំងច្រកប្រចាំថ្ងៃ</div>
                    <div className="text-[11px] text-slate-400">គិតតាមល្បឿន និងចំនួនកន្ត្រកដែលច្រកបានជោគជ័យ</div>
                  </div>
                </div>
                <button
                  onClick={fetchPackerData}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-bold border border-amber-400/40"
                >
                  🔄
                </button>
              </div>

              {loadingPackerData ? (
                <div className="py-10 text-center text-slate-400 flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span>កំពុងទាញយកតារាងជើងខ្លាំង...</span>
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
                  <span className="text-3xl block mb-2">📦</span>
                  មិនទាន់មានទិន្នន័យច្រកថ្ងៃនេះឡើយ
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((p, idx) => {
                    const isTop1 = idx === 0;
                    const isMe = packerName && p.packer_name && p.packer_name.toLowerCase() === packerName.toLowerCase();
                    return (
                      <div
                        key={p.packer_name}
                        className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                          isTop1
                            ? 'bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 border-amber-400/70 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                            : isMe
                            ? 'bg-gradient-to-r from-cyan-950/60 to-slate-900 border-cyan-400/70'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black font-mono text-xs ${
                            idx === 0
                              ? 'bg-amber-400 text-slate-950 shadow'
                              : idx === 1
                              ? 'bg-slate-300 text-slate-950'
                              : idx === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <strong className="text-white text-sm">{p.packer_name}</strong>
                              {isMe && (
                                <span className="text-[10px] bg-cyan-950 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-500/40 font-bold">
                                  ខ្ញុំ
                                </span>
                              )}
                            </div>
                            <div className="text-[10.5px] text-slate-400">
                              ⏱️ មធ្យម {Math.round(p.avg_duration || 0)}s ក្នុង ១ កន្ត្រក
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono font-black text-amber-300 text-sm sm:text-base">
                            {p.total_bags} <span className="text-xs text-slate-400 font-sans">កន្ត្រក</span>
                          </div>
                          <div className="text-[10.5px] text-emerald-400 font-mono font-bold">
                            {p.total_items || 0} មុខទំនិញ
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PACKER PROFILE & HISTORY */}
          {activeTab === 'profile' && (
            <div className="space-y-3">
              {/* Profile Card */}
              <div className="bg-[#07132B] border border-cyan-500/40 rounded-2xl p-3.5 flex flex-col gap-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-0.5 flex items-center justify-center font-black text-white text-base">
                      👤
                    </div>
                    <div>
                      <div className="text-white font-black text-sm">{packerName || 'មិនទាន់មានឈ្មោះ'}</div>
                      <div className="text-[11px] text-cyan-400 font-medium">
                        {userRole === 'admin' ? '👑 តួនាទី: Admin / ម្ចាស់ហាង' : '👷 តួនាទី: បុគ្គលិកច្រកទំនិញ (Packer)'}
                      </div>
                    </div>
                  </div>

                  {onChangePackerName && (
                    <button
                      onClick={() => {
                        const newName = prompt('សូមបញ្ចូលឈ្មោះរបស់អ្នក ៖', packerName);
                        if (newName && newName.trim()) {
                          onChangePackerName(newName.trim());
                          if (onShowToast) onShowToast(`✅ បានប្តូរឈ្មោះជា «${newName.trim()}»`);
                        }
                      }}
                      className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      ✏️ ប្តូរឈ្មោះ
                    </button>
                  )}
                </div>
              </div>

              {/* Personal Packed History */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <h3 className="font-bold text-slate-300">ប្រវត្តិច្រកកន្ត្រករបស់ខ្ញុំ ({packerHistory.length}) ៖</h3>
                  <button onClick={fetchPackerData} className="text-cyan-400 hover:underline text-[11px]">
                    🔄 Refresh
                  </button>
                </div>

                {loadingPackerData ? (
                  <div className="py-8 text-center text-slate-400">កំពុងទាញយកប្រវត្តិច្រក...</div>
                ) : packerHistory.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
                    មិនទាន់មានប្រវត្តិច្រកនៅឡើយទេ
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scroll pr-1">
                    {packerHistory.map((d: any) => (
                      <div
                        key={d.log_id}
                        className="bg-slate-900/70 border border-slate-800 p-2.5 rounded-xl flex justify-between items-center"
                      >
                        <div>
                          <div className="font-black text-cyan-400 text-xs font-mono">
                            #{d.invoice_id} ‧ <span className="text-white font-sans">{d.facebook_name || 'ភ្ញៀវ'}</span>
                          </div>
                          <div className="text-[10.5px] text-slate-400 mt-0.5">
                            📦 {d.items_count} មុខ ‧ ⏱️ {Math.round(d.duration_seconds)}s ‧ {d.packed_at?.slice(11, 16) || ''}
                          </div>
                        </div>
                        <div className="text-amber-400 font-mono font-bold text-xs">
                          ${Number(d.total_amount || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: KHQR STORE SETTINGS */}
          {activeTab === 'khqr' && (
            <div className="space-y-4">
              {/* Upload KHQR Banner */}
              <div className="bg-gradient-to-br from-red-950/40 via-slate-900 to-slate-900 border border-red-500/40 p-3.5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white p-1 flex items-center justify-center flex-shrink-0 shadow">
                    <span className="bg-[#E11925] text-white text-xs font-black px-1.5 py-0.5 rounded">KHQR</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-xs sm:text-sm">Upload រូបថត ABA KHQR របស់ហាង</h3>
                    <p className="text-[11px] text-slate-300">ប្រព័ន្ធនឹងអាន Bakong Account ID និង Merchant Name ស្វ័យប្រវត្តិ</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingImage}
                  className="w-full sm:w-auto px-4 py-2 bg-[#E11925] hover:bg-red-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(225,25,37,0.4)] active:scale-95 transition-all cursor-pointer flex-shrink-0"
                >
                  {isProcessingImage ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>កំពុងអាន QR...</span>
                    </>
                  ) : (
                    <>
                      <span>📷</span>
                      <span>Upload រូប KHQR</span>
                    </>
                  )}
                </button>
              </div>

              {uploadSuccessMsg && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-emerald-300 text-xs font-bold animate-fadeIn">
                  {uploadSuccessMsg}
                </div>
              )}

              {/* Current Active KHQR Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Info Card */}
                <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl space-y-2">
                  <div className="text-slate-400 font-bold border-b border-slate-800 pb-1 flex justify-between items-center">
                    <span>ព័ត៌មានគណនី KHQR បច្ចុប្បន្ន</span>
                    <span className="text-emerald-400 text-[10px] font-mono">● សកម្ម</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div>
                      <span className="text-slate-400">ឈ្មោះហាង (Merchant): </span>
                      <strong className="text-white">{khqrConfig.merchantName || 'KARI ARNETT'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Bakong Account: </span>
                      <strong className="text-cyan-400 font-mono break-all">{khqrConfig.bakongAccountId || 'kari_arnett@aba'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">ទីក្រុង (City): </span>
                      <strong className="text-white">{khqrConfig.merchantCity || 'Phnom Penh'}</strong>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingManual(!isEditingManual)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold rounded-lg text-[11px] border border-cyan-500/30 active:scale-95 transition-all"
                    >
                      ✏️ កែប្រែដោយដៃ
                    </button>
                    <button
                      type="button"
                      onClick={handleResetToDefault}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-[11px] active:scale-95 transition-all"
                    >
                      🔄 Reset Default
                    </button>
                  </div>
                </div>

                {/* Live Sample Preview QR */}
                <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-[11px] text-slate-400 font-bold">គំរូ QR កូដស្កេនបង់ប្រាក់ពិតប្រាកដ</span>
                  {sampleQrDataUrl ? (
                    <div className="p-2 bg-white rounded-xl shadow-lg border border-red-500/40">
                      <img src={sampleQrDataUrl} alt="KHQR Preview" className="w-28 h-28 object-contain" />
                    </div>
                  ) : (
                    <div className="w-28 h-28 bg-slate-950 rounded-xl flex items-center justify-center text-slate-500">
                      Loading...
                    </div>
                  )}
                  <span className="text-[10px] text-emerald-400 font-bold">✨ គាំទ្រគ្រប់ធនាគារក្នុងប្រទេសកម្ពុជា</span>
                </div>
              </div>

              {/* Manual Form (If expanded) */}
              {isEditingManual && (
                <div className="p-3 bg-slate-900 border border-cyan-500/40 rounded-xl space-y-3 animate-fadeIn">
                  <h4 className="font-bold text-white text-xs">កែប្រែទិន្នន័យ Bakong KHQR ដោយដៃ ៖</h4>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-0.5">Bakong Account ID / Phone ៖</label>
                      <input
                        type="text"
                        value={manualForm.bakongAccountId}
                        onChange={e => setManualForm({ ...manualForm, bakongAccountId: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono text-xs outline-none focus:border-cyan-400"
                        placeholder="e.g. 012345678@abaa or name@bkng"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-0.5">ឈ្មោះ Merchant / ហាង ៖</label>
                      <input
                        type="text"
                        value={manualForm.merchantName}
                        onChange={e => setManualForm({ ...manualForm, merchantName: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs outline-none focus:border-cyan-400"
                        placeholder="e.g. KARI ARNETT STORE"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-0.5">ទីក្រុង (Merchant City) ៖</label>
                      <input
                        type="text"
                        value={manualForm.merchantCity}
                        onChange={e => setManualForm({ ...manualForm, merchantCity: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs outline-none focus:border-cyan-400"
                        placeholder="e.g. Phnom Penh"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingManual(false)}
                      className="px-3 py-1 bg-slate-800 text-slate-300 rounded-lg text-xs"
                    >
                      បោះបង់
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveManualForm}
                      className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg text-xs"
                    >
                      💾 រក្សាទុក
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SQLITE DATABASE & DATE HISTORY */}
          {activeTab === 'db' && (
            <div className="space-y-4">
              {/* SQLite Engine Card */}
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-3 shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🗄️</span>
                    <div>
                      <h3 className="font-bold text-white text-xs sm:text-sm">SQLite Engine Status</h3>
                      <p className="text-[11px] text-slate-400 font-mono">{stats?.db_file || 'server/pos.db'}</p>
                    </div>
                  </div>
                  <span className="text-emerald-400 text-[10px] font-mono font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                    ONLINE (WAL)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block">ទំហំឯកសារ</span>
                    <strong className="text-cyan-300 font-mono text-xs">
                      {((stats?.file_size_bytes || 0) / 1024).toFixed(1)} KB
                    </strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block">កន្ត្រកសរុប</span>
                    <strong className="text-amber-400 font-mono text-xs">{stats?.total_invoices || 0}</strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block">មុខទំនិញ</span>
                    <strong className="text-indigo-400 font-mono text-xs">{stats?.total_products || 0}</strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block">អតិថិជន</span>
                    <strong className="text-emerald-400 font-mono text-xs">{stats?.total_customers || 0}</strong>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">ទាញយក Backup ឯកសារ Database SQLite ៖</span>
                  <button
                    onClick={handleDownloadBackup}
                    disabled={downloading}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>💾</span>
                    <span>{downloading ? 'កំពុងទាញ...' : 'Download pos.db'}</span>
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
                    {(dates || []).map(item => (
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
                              ({(item.live_ids || []).length} វគ្គ Live)
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
