import React, { useState, useRef, useEffect } from 'react';
import { FastCheckResultItem } from '../../../server/fastCheckRoutes';
import { playSuccessFanfare, playWarningBuzzer } from '../../utils/audio';

interface FastCheckSlipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedCount: number) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}

export function FastCheckSlipsModal({
  isOpen,
  onClose,
  onSuccess,
  onShowToast
}: FastCheckSlipsModalProps) {
  const [activeTab, setActiveTab] = useState<'SLIPS' | 'NAMES'>('SLIPS');
  const [selectedFiles, setSelectedFiles] = useState<{ name: string; data: string; mimeType: string }[]>([]);
  const [namesText, setNamesText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<FastCheckResultItem[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Gemini API Key State for VPS / Direct UI Config
  const [geminiStatus, setGeminiStatus] = useState<{
    hasKey: boolean;
    maskedKey: string;
    isFromEnv: boolean;
    hasCustomKey: boolean;
  }>({ hasKey: false, maskedKey: '', isFromEnv: false, hasCustomKey: false });
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check Gemini Key Status on mount/open
  const fetchGeminiStatus = async () => {
    try {
      const res = await fetch('/api/fast_check/gemini_status');
      if (res.ok) {
        const data = await res.json();
        setGeminiStatus({
          hasKey: Boolean(data.hasKey),
          maskedKey: data.maskedKey || '',
          isFromEnv: Boolean(data.isFromEnv),
          hasCustomKey: Boolean(data.hasCustomKey)
        });
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchGeminiStatus();
    }
  }, [isOpen]);

  const handleSaveGeminiKey = async () => {
    if (!apiKeyInput.trim() && !geminiStatus.hasKey) {
      onShowToast('សូមបញ្ចូល Gemini API Key ជាមុនសិន!', 'warning');
      return;
    }

    setIsSavingKey(true);
    try {
      const res = await fetch('/api/fast_check/save_gemini_key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: apiKeyInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setGeminiStatus(prev => ({
          ...prev,
          hasKey: data.hasKey,
          maskedKey: data.maskedKey || '',
          hasCustomKey: Boolean(apiKeyInput.trim())
        }));
        setApiKeyInput('');
        setShowKeyConfig(false);
        playSuccessFanfare();
        onShowToast(data.message || 'បានរក្សាទុក Gemini API Key រួចរាល់!', 'success');
      } else {
        onShowToast(data.error || 'បរាជ័យក្នុងការរក្សាទុក Key', 'error');
      }
    } catch {
      onShowToast('មានបញ្ហាក្នុងការតភ្ជាប់ Server', 'error');
    } finally {
      setIsSavingKey(false);
    }
  };

  // Handle clipboard paste (Ctrl+V / Cmd+V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const newFiles: { name: string; data: string; mimeType: string }[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              if (base64) {
                setSelectedFiles(prev => [
                  ...prev,
                  {
                    name: `Pasted_Slip_${Date.now()}_${prev.length + 1}.png`,
                    data: base64,
                    mimeType: blob.type || 'image/png'
                  }
                ]);
              }
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  if (!isOpen) return null;

  // File selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList: File[] = Array.from(files);
    let loadedCount = 0;
    const newItems: { name: string; data: string; mimeType: string }[] = [];

    fileList.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        if (base64) {
          newItems.push({
            name: file.name,
            data: base64,
            mimeType: file.type || 'image/jpeg'
          });
        }
        loadedCount++;
        if (loadedCount === fileList.length) {
          setSelectedFiles(prev => [...prev, ...newItems]);
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Run Scan for Images (Gemini Flash Free Tier)
  const handleScanSlips = async () => {
    if (selectedFiles.length === 0) {
      onShowToast('សូមជ្រើសរើសរូប Screenshot វិក្កយបត្រជាមុនសិន!', 'warning');
      return;
    }

    setIsScanning(true);
    setResults([]);
    setScanProgress({ current: 0, total: selectedFiles.length });

    try {
      // Chunk requests in batches of 5 to remain well within free tier limits
      const batchSize = 5;
      const allResults: FastCheckResultItem[] = [];

      for (let i = 0; i < selectedFiles.length; i += batchSize) {
        const batch = selectedFiles.slice(i, i + batchSize);
        setScanProgress({ current: i + 1, total: selectedFiles.length });

        const res = await fetch('/api/fast_check/scan_slips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: batch })
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.results)) {
            allResults.push(...json.results);
            setResults([...allResults]);
          }
        }
      }

      setScanProgress({ current: selectedFiles.length, total: selectedFiles.length });
      playSuccessFanfare();
      onShowToast(`🎉 បានស្កេនវិភាគចប់សព្វគ្រប់ ${allResults.length} រូប!`, 'success');
    } catch (err: any) {
      console.error('Scan error:', err);
      playWarningBuzzer();
      onShowToast('⚠️ មានបញ្ហាក្នុងការស្កេនរូប សូមព្យាយាមម្តងទៀត', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // Run Text Scan for Names (100% Free Instant Match)
  const handleScanNames = async () => {
    if (!namesText.trim()) {
      onShowToast('សូម Paste បញ្ជីឈ្មោះ Facebook ជាមុនសិន!', 'warning');
      return;
    }

    setIsScanning(true);
    setResults([]);

    try {
      const res = await fetch('/api/fast_check/scan_names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namesText })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.results)) {
          setResults(json.results);
          playSuccessFanfare();
          onShowToast(`🎉 បានផ្គូផ្គងរួចរាល់ ${json.results.length} ឈ្មោះ!`, 'success');
        }
      }
    } catch (err: any) {
      console.error('Scan names error:', err);
      onShowToast('⚠️ មិនអាចស្វែងរកឈ្មោះបានទេ', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // Change candidate selection for ambiguous or not-found results
  const handleSelectCandidate = (itemIndex: number, candidate: any) => {
    playSuccessFanfare();
    onShowToast(`✅ បានផ្គូផ្គងជាមួយកន្ត្រក #${candidate.basket_no} (${candidate.facebook_name})!`, 'success');
    setResults(prev => {
      const copy = [...prev];
      copy[itemIndex] = {
        ...copy[itemIndex],
        status: 'MATCHED',
        confidence: 100,
        matched_invoice: candidate
      };
      return copy;
    });
  };

  // Confirm and mark all matched invoices as Paid
  const handleConfirmAll = async () => {
    const matchedItems = results.filter(r => r.status === 'MATCHED' && r.matched_invoice);
    if (matchedItems.length === 0) {
      onShowToast('មិនមានកន្ត្រកដែលបានផ្គូផ្គងត្រឹមត្រូវសម្រាប់បញ្ជាក់ទេ!', 'warning');
      return;
    }

    setIsConfirming(true);
    try {
      const matches = matchedItems.map(item => ({
        invoice_id: item.matched_invoice!.invoice_id,
        slip_url: item.slip_url,
        paid_amount: item.extracted.paid_amount,
        paid_by: 'Fast-Check AI'
      }));

      const res = await fetch('/api/fast_check/confirm_matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches, packerName: 'Fast-Check AI' })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          playSuccessFanfare();
          onShowToast(`✅ បានប្តូរទៅ [បង់រួច] ជោគជ័យ ${json.updated_count} កន្ត្រក!`, 'success');
          onSuccess(json.updated_count);
          onClose();
        }
      } else {
        throw new Error('Failed to confirm');
      }
    } catch (err: any) {
      playWarningBuzzer();
      onShowToast('⚠️ មានបញ្ហាក្នុងការបញ្ជាក់បង់រួច!', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const matchedCount = results.filter(r => r.status === 'MATCHED').length;
  const ambiguousCount = results.filter(r => r.status === 'MULTIPLE_CANDIDATES').length;
  const notFoundCount = results.filter(r => r.status === 'NOT_FOUND').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border-2 border-indigo-500/70 rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.25)] overflow-hidden text-slate-100">
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border-b border-indigo-500/30 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/50 flex items-center justify-center text-2xl shadow-inner flex-shrink-0">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                  Fast-Check Slips & ផ្ទៀងផ្ទាត់បង់រួច
                </h2>
                <button
                  type="button"
                  onClick={() => setShowKeyConfig(!showKeyConfig)}
                  className={`text-[10.5px] font-black px-2.5 py-1 rounded-full border transition-all cursor-pointer flex items-center gap-1 shadow-sm active:scale-95 ${
                    geminiStatus.hasKey
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30'
                      : 'bg-amber-500/25 text-amber-300 border-amber-500/60 hover:bg-amber-500/35 animate-pulse'
                  }`}
                  title="ចុចដើម្បីកំណត់ ឬប្តូរ Gemini API Key សម្រាប់ VPS"
                >
                  <span>{geminiStatus.hasKey ? '✅ Gemini AI Active' : '⚠️ មិនទាន់កំណត់ API Key'}</span>
                  <span className="text-[10px] opacity-80">⚙️ កំណត់ Key</span>
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                ស្កេនរូបវិក្កយបត្រ (ABA/ACLEDA/KHQR) ឬ Paste ឈ្មោះ ដើម្បី Tick [បង់រួច] គ្រប់ Live ស្វ័យប្រវត្តិ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center font-bold text-base transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Gemini API Key Configuration Panel (For VPS / Front-end input) */}
        {(showKeyConfig || (!geminiStatus.hasKey && activeTab === 'SLIPS')) && (
          <div className="mx-4 mt-3 p-3.5 bg-gradient-to-r from-slate-950 via-[#0B1528] to-slate-950 border border-indigo-500/40 rounded-2xl shadow-md text-xs space-y-2.5 animate-in slide-in-from-top duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🔑</span>
                <div>
                  <span className="font-bold text-indigo-200 text-sm">កំណត់ Gemini API Key (សម្រាប់ដំណើរការលើ VPS)</span>
                  <p className="text-[11px] text-slate-400">
                    បញ្ចូល Google Gemini API Key ដើម្បីឱ្យប្រព័ន្ធស្កេន Slip រូបភាព AI ដំណើរការលើ VPS
                  </p>
                </div>
              </div>
              {geminiStatus.hasKey && (
                <button
                  type="button"
                  onClick={() => setShowKeyConfig(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1"
                >
                  ✕ បិទ
                </button>
              )}
            </div>

            {geminiStatus.hasKey && (
              <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl text-[11.5px]">
                <span className="text-slate-400">Key បច្ចុប្បន្ន ៖</span>
                <span className="font-mono text-emerald-400 font-bold">{geminiStatus.maskedKey}</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
                  {geminiStatus.isFromEnv ? 'ENV (.env)' : 'UI Settings'}
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="បិទភ្ជាប់ Gemini API Key ទីនេះ (ឧ. AIzaSy...)"
                className="flex-1 bg-slate-900 border border-indigo-500/50 focus:border-indigo-400 rounded-xl px-3 py-2 text-xs text-indigo-100 placeholder-slate-500 outline-none font-mono"
              />
              <button
                type="button"
                disabled={isSavingKey || !apiKeyInput.trim()}
                onClick={handleSaveGeminiKey}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all active:scale-95 shadow-md flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>{isSavingKey ? 'កំពុងរក្សាទុក...' : '💾 រក្សាទុក Key'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-0.5 text-[11px]">
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
              >
                <span>✨ យក Gemini API Key ឥតគិតថ្លៃ (Free 100%) ពី Google AI Studio ↗</span>
              </a>
              {geminiStatus.hasCustomKey && (
                <button
                  type="button"
                  onClick={async () => {
                    setApiKeyInput('');
                    const res = await fetch('/api/fast_check/save_gemini_key', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ gemini_api_key: '' })
                    });
                    const d = await res.json();
                    if (d.success) {
                      setGeminiStatus({ hasKey: false, maskedKey: '', isFromEnv: false, hasCustomKey: false });
                      onShowToast('បានលុប Key ចេញរួចរាល់', 'warning');
                    }
                  }}
                  className="text-rose-400 hover:text-rose-300 hover:underline"
                >
                  🗑️ លុប Key ផ្ទាល់ខ្លួន
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="px-4 pt-3 pb-2 bg-slate-900/90 border-b border-slate-800 flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('SLIPS')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all ${
              activeTab === 'SLIPS'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <span>📷 ស្កេនរូបភាព Slips (Auto-Scan)</span>
            {selectedFiles.length > 0 && (
              <span className="bg-white/20 text-white text-[11px] px-1.5 py-0.2 rounded-full font-mono">
                {selectedFiles.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('NAMES')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all ${
              activeTab === 'NAMES'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <span>📋 Paste បញ្ជីឈ្មោះ (Fast Match)</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'SLIPS' ? (
            <div>
              {/* Dropzone & File Selector */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-500/50 hover:border-indigo-400 rounded-2xl p-5 text-center cursor-pointer bg-indigo-950/20 hover:bg-indigo-950/40 transition-all group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  accept="image/*"
                  className="hidden"
                />
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">
                  📥
                </div>
                <div className="text-sm font-bold text-slate-200">
                  ចុចទីនេះដើម្បីជ្រើសរើសរូប Screenshot វិក្កយបត្រ (ច្រើនសន្លឹកក្នុងពេលតែមួយ)
                </div>
                <div className="text-xs text-indigo-300/80 mt-1">
                  💡 ឬអាចចុច <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">Ctrl + V</kbd> ដើម្បី Paste រូបពី Clipboard ចូលបានភ្លាមៗ!
                </div>
              </div>

              {/* Selected Files Thumbnails Preview */}
              {selectedFiles.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span>រូបភាពដែលបានជ្រើសរើស ({selectedFiles.length} រូប)</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFiles([]);
                        setResults([]);
                      }}
                      className="text-rose-400 hover:underline"
                    >
                      លុបចេញទាំងអស់
                    </button>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-950/50 rounded-xl border border-slate-800">
                    {selectedFiles.map((file, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-700 aspect-square bg-slate-800">
                        <img
                          src={file.data}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFiles(prev => prev.filter((_, idx) => idx !== i));
                          }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center opacity-80 hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Scan Button */}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleScanSlips}
                      disabled={isScanning}
                      className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-sm shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] transition-all"
                    >
                      {isScanning ? (
                        <>
                          <span className="animate-spin text-base">⏳</span>
                          <span>កំពុងស្កេនវិភាគរូបភាព ({scanProgress.current}/{scanProgress.total})...</span>
                        </>
                      ) : (
                        <>
                          <span>⚡ ចាប់ផ្តើមស្កេនវិភាគ ({selectedFiles.length} រូប)</span>
                          <span>➔</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Names Text Area */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">
                  Paste បញ្ជីឈ្មោះ Facebook ភ្ញៀវ (១ បន្ទាត់ ១ ឈ្មោះ ឬកាត់ដោយសញ្ញាក្បៀស)
                </label>
                <textarea
                  rows={5}
                  value={namesText}
                  onChange={e => setNamesText(e.target.value)}
                  placeholder="Mak Banhapich&#10;Malin Mon&#10;Sreypov Neang..."
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 font-sans"
                />
                <button
                  type="button"
                  onClick={handleScanNames}
                  disabled={isScanning || !namesText.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isScanning ? 'កំពុងស្វែងរក...' : '🔍 ផ្គូផ្គងស្វែងរកកន្ត្រកភ្លាមៗ'}
                </button>
              </div>
            </div>
          )}

          {/* Results Section */}
          {results.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Summary Stats Header */}
              <div className="flex items-center justify-between p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex-wrap gap-2">
                <div className="text-xs font-bold text-slate-300">
                  លទ្ធផលស្កេនសរុប ៖ <span className="text-white font-mono">{results.length}</span> សន្លឹក
                </div>
                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="text-emerald-400">🟢 ត្រូវ ១០០%: {matchedCount}</span>
                  <span className="text-amber-400">🟡 ស្ទួន: {ambiguousCount}</span>
                  <span className="text-rose-400">🔴 រកមិនឃើញ: {notFoundCount}</span>
                </div>
              </div>

              {/* Scanned Cards List */}
              <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
                {results.map((item, idx) => {
                  const isMatched = item.status === 'MATCHED' && item.matched_invoice;
                  const isAmbiguous = item.status === 'MULTIPLE_CANDIDATES';
                  const isNotFound = item.status === 'NOT_FOUND';

                  return (
                    <div
                      key={item.id || idx}
                      className={`p-3 rounded-xl border transition-all ${
                        isMatched
                          ? 'bg-emerald-950/30 border-emerald-500/50'
                          : isAmbiguous
                          ? 'bg-amber-950/30 border-amber-500/60'
                          : 'bg-rose-950/20 border-rose-800/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Left: Thumbnail & Extracted Info */}
                        <div className="flex items-center gap-3 min-w-0">
                          {item.slip_url ? (
                            <img
                              src={item.slip_url}
                              alt="Slip"
                              onClick={() => setPreviewImage(item.slip_url)}
                              className="w-12 h-12 object-cover rounded-lg border border-slate-700 cursor-pointer hover:opacity-80 flex-shrink-0"
                              title="ចុចមើលរូបធំ"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-lg flex-shrink-0">
                              📋
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-white truncate">
                                {item.extracted.customer_name || 'មិនស្គាល់ឈ្មោះ'}
                              </span>
                              {item.extracted.paid_amount > 0 && (
                                <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
                                  {item.extracted.paid_amount.toLocaleString()} {item.extracted.currency}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              {item.extracted.bank_name && <span>🏦 {item.extracted.bank_name}</span>}
                              {item.extracted.phone_number && <span>📞 {item.extracted.phone_number}</span>}
                              {item.extracted.trans_ref && <span className="font-mono">Ref: {item.extracted.trans_ref}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Right: Match Badge */}
                        <div className="text-right flex-shrink-0">
                          {isMatched && (
                            <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-black px-2.5 py-1 rounded-full border border-emerald-500/40 flex items-center gap-1">
                              <span>✅</span> ត្រូវកន្ត្រក #{item.matched_invoice?.basket_no || item.matched_invoice?.invoice_id}
                            </span>
                          )}
                          {isAmbiguous && (
                            <span className="bg-amber-500/20 text-amber-300 text-[11px] font-black px-2.5 py-1 rounded-full border border-amber-500/40 flex items-center gap-1 animate-pulse">
                              <span>⚠️</span> ស្ទួន {item.candidates?.length} កន្ត្រក
                            </span>
                          )}
                          {isNotFound && (
                            <span className="bg-rose-500/20 text-rose-300 text-[11px] font-black px-2.5 py-1 rounded-full border border-rose-500/40">
                              ❌ រកមិនឃើញកន្ត្រក
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Matched Details */}
                      {isMatched && (
                        <div className="mt-2 pt-2 border-t border-emerald-500/20 flex items-center justify-between text-xs text-emerald-200">
                          <div>
                            👉 កន្ត្រក: <span className="font-black text-white">#{item.matched_invoice?.basket_no}</span> (តម្លៃ: ${item.matched_invoice?.total_amount.toFixed(2)})
                            <span className="text-slate-400 ml-2">🎥 Live: {item.matched_invoice?.live_id}</span>
                          </div>
                          <span className="text-[11px] bg-emerald-600 text-white px-2 py-0.5 rounded font-bold">
                            ត្រៀមប្តូរទៅ [បង់រួច]
                          </span>
                        </div>
                      )}

                      {/* Error Message if AI experienced high demand spike */}
                      {item.error_message && (
                        <div className="mt-2 p-2 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>{item.error_message}</span>
                        </div>
                      )}

                      {/* Candidate Selection Dropdown */}
                      {(isAmbiguous || isNotFound) && item.candidates && item.candidates.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-amber-500/30">
                          <div className="text-[11px] text-amber-300 font-bold mb-1.5 flex items-center justify-between">
                            <span>👉 {isAmbiguous ? 'រកឃើញកន្ត្រកដែលមានឈ្មោះស្រដៀងគ្នា' : 'ជ្រើសរើសកន្ត្រកដែលត្រូវគ្នានឹងវិក្កយបត្រនេះ'} ៖</span>
                            <span className="text-[10px] text-slate-400">ចុចរើសកន្ត្រក</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {item.candidates.map((cand, cIdx) => (
                              <button
                                key={cIdx}
                                type="button"
                                onClick={() => handleSelectCandidate(idx, cand)}
                                className="text-left p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-xs text-slate-200 flex items-center justify-between group transition-colors"
                              >
                                <div>
                                  <span className="font-bold text-white">#{cand.basket_no}</span> - {cand.facebook_name}
                                  <div className="text-[10px] text-slate-400">
                                    តម្លៃ: ${cand.total_amount.toFixed(2)} | Live: {cand.live_id}
                                  </div>
                                </div>
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold group-hover:bg-amber-500 group-hover:text-black">
                                  រើសយក
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
          <div className="text-xs text-slate-400">
            {matchedCount > 0 ? (
              <span>មាន <strong className="text-emerald-400 font-mono">{matchedCount}</strong> កន្ត្រកត្រៀមប្តូរទៅ [បង់រួច]</span>
            ) : (
              <span>ជ្រើសរើសរូបរួចចុចស្កេន</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
            >
              បោះបង់
            </button>
            <button
              type="button"
              onClick={handleConfirmAll}
              disabled={isConfirming || matchedCount === 0}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-emerald-500/30 flex items-center gap-2 disabled:opacity-40 active:scale-98 transition-all"
            >
              {isConfirming ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>កំពុងកត់ត្រា...</span>
                </>
              ) : (
                <>
                  <span>✅ យល់ព្រមប្តូរទៅ [បង់រួច] ទាំងអស់ ({matchedCount})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Image Zoom Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4 cursor-pointer"
        >
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
