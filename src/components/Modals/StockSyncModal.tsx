import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../../types';
import { playPureTone, playWarningBuzzer, playSuccessFanfare } from '../../utils/audio';

interface StockSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  activeLiveId?: string;
  onStockUpdated: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  initialTab?: 'telegram' | 'paste' | 'file' | 'export';
}

interface ParsedTelegramItem {
  code: string;
  name: string;
  price: number;
  stock_qty: number;
  image_url?: string;
  chat_title?: string;
  sender_name?: string;
  original_text?: string;
}

export function StockSyncModal({
  isOpen,
  onClose,
  products,
  activeLiveId,
  onStockUpdated,
  onShowToast,
  initialTab = 'telegram'
}: StockSyncModalProps) {
  const [activeTab, setActiveTab] = useState<'telegram' | 'paste' | 'file' | 'export'>(initialTab);

  // Telegram States
  const [botToken, setBotToken] = useState<string>(() => localStorage.getItem('tg_bot_token') || '');
  const [botUsername, setBotUsername] = useState<string>('');
  const [testingToken, setTestingToken] = useState<boolean>(false);
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [canReadAllGroupMessages, setCanReadAllGroupMessages] = useState<boolean>(true);
  const [privacyAlert, setPrivacyAlert] = useState<string | null>(null);
  const [defaultQty, setDefaultQty] = useState<number>(200);
  const [markRead, setMarkRead] = useState<boolean>(false);
  const [keepExistingStockQty, setKeepExistingStockQty] = useState<boolean>(true);
  const [fetchingTg, setFetchingTg] = useState<boolean>(false);
  const [tgItems, setTgItems] = useState<ParsedTelegramItem[]>([]);
  const [importingTg, setImportingTg] = useState<boolean>(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(false);

  const fetchAutoSyncStatus = async () => {
    try {
      const res = await fetch('/api/telegram/auto_sync');
      const data = await res.json();
      if (data && typeof data.enabled === 'boolean') {
        setAutoSyncEnabled(data.enabled);
      }
    } catch (e) {}
  };

  const toggleAutoSync = async () => {
    const next = !autoSyncEnabled;
    try {
      const res = await fetch('/api/telegram/auto_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next, interval_sec: 10, live_id: activeLiveId })
      });
      const data = await res.json();
      if (data.success) {
        setAutoSyncEnabled(next);
        if (next) {
          playSuccessFanfare();
          onShowToast('🟢 បានបើក Telegram Auto-Sync រួចរាល់!');
        } else {
          playWarningBuzzer();
          onShowToast('🔴 បានបិទ Telegram Auto-Sync!');
        }
      }
    } catch (e) {
      onShowToast('⚠️ មិនអាចប្តូរស្ថានភាព Auto-Sync បានទេ', 'error');
    }
  };

  // Paste Text States
  const [pasteText, setPasteText] = useState<string>('');
  const [importingPaste, setImportingPaste] = useState<boolean>(false);
  const [previewZoomImage, setPreviewZoomImage] = useState<{ url: string; code: string; name?: string; price?: number } | null>(null);

  // Parse Text helper for Paste Tab
  const parsedPasteItems = React.useMemo(() => {
    if (!pasteText.trim()) return [];
    const lines = pasteText.split(/[\r\n;,]+/);
    const result: Array<{ code: string; price: number; name?: string }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Patterns: 32=3កន្សែង, 33=3.25, 100=3.7, 100:3.7, 100 3.7$, កូដ 100 តម្លៃ 3.7$
      const m1 = trimmed.match(/^(?:កូដ\s*)?([A-Za-z0-9_\u1780-\u17B3]{1,15})\s*(?:=|-|:|\sx\s|\sX\s)\s*(?:តម្លៃ\s*)?\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\$|usd|USD|ដុល្លារ)?\s*(.*)$/i);
      if (m1) {
        const code = m1[1].trim().toUpperCase();
        const price = parseFloat(m1[2]);
        let name = m1[3]?.trim();
        if (name) {
          name = name.replace(/^(\$|usd|USD|ដុល្លារ|តម្លៃ|ថ្លៃ)\s*/i, '').trim();
        }
        if (code && !isNaN(price) && price > 0) {
          result.push({ code, price, name: name || undefined });
          continue;
        }
      }
      const m2 = trimmed.match(/^([A-Za-z0-9_\u1780-\u17B3]{1,15})\s+\$?([0-9]+(?:\.[0-9]+)?)(?:\s+(.+))?$/);
      if (m2) {
        const code = m2[1].trim().toUpperCase();
        const price = parseFloat(m2[2]);
        if (code && !isNaN(price) && price > 0 && price < 2000) {
          result.push({ code, price, name: m2[3]?.trim() });
        }
      }
    }
    return result;
  }, [pasteText]);

  // File Upload States
  const [fileData, setFileData] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [importingFile, setImportingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync Baskets Price State
  const [syncingBaskets, setSyncingBaskets] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      fetchAutoSyncStatus();
      // Fetch current telegram config from server
      fetch('/api/telegram/config')
        .then(res => res.json())
        .then(data => {
          if (data && data.token) {
            setBotToken(data.token);
            testToken(data.token, false);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // 1. Test Bot Token
  const testToken = async (tokenToTest: string, showToastMsg: boolean = true) => {
    const clean = tokenToTest.trim();
    if (!clean) {
      setTokenStatus('invalid');
      if (showToastMsg) onShowToast('⚠️ សូមបញ្ចូល Bot Token ជាមុនសិន', 'error');
      return;
    }

    setTestingToken(true);
    try {
      const res = await fetch('/api/telegram/test_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: clean })
      });
      const data = await res.json();
      if (data.success && data.bot) {
        setTokenStatus('valid');
        setBotUsername(data.bot.username || data.bot.first_name || 'Bot');
        setCanReadAllGroupMessages(data.bot.can_read_all_group_messages !== false);
        localStorage.setItem('tg_bot_token', clean);
        if (showToastMsg) {
          playSuccessFanfare();
          onShowToast(`✅ បានភ្ជាប់ Bot @${data.bot.username} ជោគជ័យ!`);
        }
      } else {
        setTokenStatus('invalid');
        setBotUsername('');
        setCanReadAllGroupMessages(true);
        if (showToastMsg) {
          playWarningBuzzer();
          onShowToast(data.error || 'Token មិនត្រឹមត្រូវ', 'error');
        }
      }
    } catch (e) {
      setTokenStatus('invalid');
      if (showToastMsg) onShowToast('⚠️ មិនអាចភ្ជាប់ទៅ Telegram បានទេ', 'error');
    } finally {
      setTestingToken(false);
    }
  };

  // Save Token
  const handleSaveToken = async () => {
    const clean = botToken.trim();
    if (!clean) return;
    try {
      // Proactively clear webhook
      fetch('/api/telegram/delete_webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: clean })
      }).catch(() => {});

      const res = await fetch('/api/telegram/save_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: clean })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('tg_bot_token', clean);
        onShowToast('💾 បានរក្សាទុក Telegram Bot Token រួចរាល់!');
        testToken(clean, false);
      }
    } catch (e) {}
  };

  // Explicit Reset Webhook
  const handleResetWebhook = async () => {
    const clean = botToken.trim();
    if (!clean) {
      onShowToast('⚠️ សូមបញ្ចូល Bot Token ជាមុនសិន', 'error');
      return;
    }
    try {
      const res = await fetch('/api/telegram/delete_webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: clean })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast('✅ បានដោះស្រាយ Conflict & លុប Webhook ចាស់រួចរាល់! អាចស្កេនបានហើយ');
      } else {
        onShowToast(data.message || 'បរាជ័យក្នុងការលុប Webhook', 'error');
      }
    } catch {
      onShowToast('⚠️ មិនអាចតភ្ជាប់បានទេ', 'error');
    }
  };

  // Clear preview items and server cache completely
  const handleClearPreview = async () => {
    setTgItems([]);
    try {
      await fetch('/api/telegram/clear_cache', { method: 'POST' });
    } catch (e) {}
    onShowToast('🗑️ បានសម្អាតបញ្ជីកូដ Preview អស់ហើយ (0 មុខ)!');
  };

  // Fetch Stock & Photos from Telegram Group
  const handleFetchTelegramStock = async (autoImport: boolean = false, clearCache: boolean = false) => {
    const clean = botToken.trim();
    if (!clean) {
      onShowToast('⚠️ សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!', 'error');
      playWarningBuzzer();
      return;
    }

    if (clearCache) {
      setTgItems([]);
    }

    setFetchingTg(true);
    try {
      const res = await fetch('/api/telegram/fetch_stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: clean,
          default_qty: defaultQty,
          auto_import: autoImport,
          mark_read: markRead,
          save_token: true,
          clear_cache: clearCache,
          keep_existing_stock_qty: keepExistingStockQty,
          live_id: activeLiveId
        })
      });
      const data = await res.json();
      if (data.success) {
        setTgItems(data.items || []);
        if (data.bot) {
          setCanReadAllGroupMessages(data.bot.can_read_all_group_messages !== false);
        }
        if (data.privacyNotice) {
          setPrivacyAlert(data.privacyNotice);
        } else {
          setPrivacyAlert(null);
        }

        if (autoImport) {
          playSuccessFanfare();
          onShowToast(`🎉 បានធ្វើបច្ចុប្បន្នភាពស្តុកជោគជ័យ! (${data.imported_count || data.items?.length || 0} មុខ)`);
          onStockUpdated();
          onClose();
        } else {
          if (data.items?.length > 0) {
            playSuccessFanfare();
            onShowToast(`🔍 រកឃើញ ${data.items.length} មុខទំនិញពី Telegram (ស្កេនបាន ${data.messagesScanned || data.items.length} សារ)!`);
          } else {
            playWarningBuzzer();
            if (data.bot?.can_read_all_group_messages === false) {
              onShowToast('⚠️ Bot កំពុងជាប់ Privacy Mode នាំឱ្យ Telegram មិនបញ្ជូនរូប/សារមក! សូមមើលការណែនាំខាងក្រោម', 'error');
            } else {
              onShowToast(`ℹ️ មិនមានសារ ឬរូបភាពកូដថ្មីក្នុង Telegram ទេ (Scanned ${data.messagesScanned} messages)`);
            }
          }
        }
      } else {
        playWarningBuzzer();
        onShowToast(data.error || 'បរាជ័យក្នុងការទាញពី Telegram', 'error');
      }
    } catch (err) {
      playWarningBuzzer();
      onShowToast('⚠️ ដាច់សេវា WiFi / Network error!', 'error');
    } finally {
      setFetchingTg(false);
    }
  };

  // Import fetched Telegram Items
  const handleImportTgItems = async () => {
    if (tgItems.length === 0) return;
    setImportingTg(true);
    try {
      const res = await fetch('/api/stock/bulk_import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: tgItems.map(it => ({
            code: it.code,
            name: it.name,
            price: it.price,
            stock_qty: it.stock_qty,
            image_file: it.image_url
          })),
          mode: 'merge',
          keep_existing_stock_qty: keepExistingStockQty,
          live_id: activeLiveId
        })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        const msg = data.updated > 0 
          ? `✅ ជោគជ័យ! បានបញ្ចូលថ្មី ${data.imported} មុខ និងកែប្រែតម្លៃ/រូបភាព ${data.updated} មុខ!`
          : `✅ បានបញ្ចូល ${data.imported} មុខទំនិញចូលក្នុងស្តុកជោគជ័យ!`;
        onShowToast(msg);
        onStockUpdated();
        onClose();
      } else {
        onShowToast(data.error || 'បរាជ័យក្នុងការបញ្ចូល', 'error');
      }
    } catch (e) {
      onShowToast('⚠️ បរាជ័យក្នុងការបញ្ជូនទិន្នន័យ', 'error');
    } finally {
      setImportingTg(false);
    }
  };

  // Import Paste Items
  const handleImportPaste = async () => {
    if (parsedPasteItems.length === 0) {
      onShowToast('⚠️ សូមបញ្ចូលអត្ថបទកូដ និងតម្លៃជាមុនសិន!', 'error');
      return;
    }
    setImportingPaste(true);
    try {
      const res = await fetch('/api/stock/bulk_import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: parsedPasteItems.map(it => ({
            code: it.code,
            name: it.name || `កូដ ${it.code}`,
            price: it.price,
            stock_qty: defaultQty
          })),
          mode: 'merge',
          keep_existing_stock_qty: keepExistingStockQty,
          live_id: activeLiveId
        })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        const msg = data.updated > 0
          ? `✅ ជោគជ័យ! បានបញ្ចូលថ្មី ${data.imported} មុខ និងកែប្រែតម្លៃ ${data.updated} មុខ!`
          : `✅ បានបញ្ចូល ${data.imported} មុខទំនិញចូលក្នុងស្តុក!`;
        onShowToast(msg);
        onStockUpdated();
        onClose();
      } else {
        onShowToast(data.error || 'បរាជ័យក្នុងការបញ្ចូល', 'error');
      }
    } catch (e) {
      onShowToast('⚠️ បរាជ័យក្នុងការបញ្ជូនទិន្នន័យ', 'error');
    } finally {
      setImportingPaste(false);
    }
  };

  // Handle File Upload (CSV or JSON)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(text);
          const list = Array.isArray(parsed) ? parsed : (parsed.products || []);
          setFileData(list);
          onShowToast(`📁 បានអាន JSON រកឃើញ ${list.length} មុខទំនិញ`);
        } catch {
          onShowToast('ទម្រង់ JSON មិនត្រឹមត្រូវ', 'error');
        }
      } else {
        // CSV Parsing
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          const header = lines[0].toLowerCase().split(',').map(h => h.replace(/["\s]/g, ''));
          const codeIdx = header.findIndex(h => h.includes('code') || h.includes('កូដ'));
          const priceIdx = header.findIndex(h => h.includes('price') || h.includes('តម្លៃ'));
          const nameIdx = header.findIndex(h => h.includes('name') || h.includes('ឈ្មោះ'));
          const qtyIdx = header.findIndex(h => h.includes('qty') || h.includes('stock') || h.includes('ចំនួន'));
          const imgIdx = header.findIndex(h => h.includes('image') || h.includes('img') || h.includes('រូប'));

          const rows: any[] = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
            const cIdx = codeIdx >= 0 ? codeIdx : 0;
            const pIdx = priceIdx >= 0 ? priceIdx : 2;
            const code = cols[cIdx];
            const price = parseFloat(cols[pIdx]);
            if (code && !isNaN(price)) {
              rows.push({
                code: code.toUpperCase(),
                name: nameIdx >= 0 ? cols[nameIdx] : `កូដ ${code}`,
                price: price,
                stock_qty: qtyIdx >= 0 ? (parseInt(cols[qtyIdx], 10) || defaultQty) : defaultQty,
                image_file: imgIdx >= 0 ? cols[imgIdx] : ''
              });
            }
          }
          setFileData(rows);
          onShowToast(`📁 បានអាន CSV រកឃើញ ${rows.length} មុខទំនិញ`);
        }
      }
    };
    reader.readAsText(file);
  };

  // Import File Data
  const handleImportFileData = async () => {
    if (fileData.length === 0) return;
    setImportingFile(true);
    try {
      const res = await fetch('/api/stock/bulk_import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: fileData, mode: 'merge', live_id: activeLiveId })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast(`✅ បាននាំចូល ${data.imported + data.updated} មុខទំនិញពី File!`);
        onStockUpdated();
        onClose();
      } else {
        onShowToast(data.error || 'បរាជ័យក្នុងការនាំចូល', 'error');
      }
    } catch (e) {
      onShowToast('⚠️ បរាជ័យក្នុងការបញ្ជូនទិន្នន័យ', 'error');
    } finally {
      setImportingFile(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const exportUrl = activeLiveId ? `/api/stock/export_csv?live_id=${encodeURIComponent(activeLiveId)}` : '/api/stock/export_csv';
    window.open(exportUrl, '_blank');
    playSuccessFanfare();
    onShowToast('📥 កំពុងទាញយកឯកសារ Excel / CSV...');
  };

  // Export JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(products, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `stock_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    playSuccessFanfare();
    onShowToast('📥 បានទាញយក JSON Backup រួចរាល់!');
  };

  // Copy Text format (100=3.5)
  const copyAsText = () => {
    const text = products.map(p => `${p.code}=${p.price.toFixed(2)}`).join('\n');
    navigator.clipboard.writeText(text);
    playPureTone(880, 0.08);
    onShowToast('📋 បានចម្លងបញ្ជីកូដ និងតម្លៃទៅ Clipboard!');
  };

  const handleSyncBasketsPrice = async () => {
    setSyncingBaskets(true);
    try {
      const res = await fetch('/api/stock/sync_baskets_price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_id: activeLiveId })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast(`🔄 បានធ្វើបច្ចុប្បន្នភាពតម្លៃទំនិញក្នុងកន្ត្រក ${data.updated_invoices} ដោយជោគជ័យ!`);
        onStockUpdated();
      } else {
        onShowToast(data.error || 'បរាជ័យក្នុងការ sync តម្លៃ', 'error');
      }
    } catch {
      onShowToast('⚠️ បរាជ័យក្នុងការ sync តម្លៃកន្ត្រក', 'error');
    } finally {
      setSyncingBaskets(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl w-full max-w-[580px] flex flex-col overflow-hidden shadow-2xl max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-[#1e293b] border-b border-slate-700/80 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center text-lg border border-sky-500/30">
              📦
            </div>
            <div>
              <div className="font-black text-sm text-slate-100 flex items-center gap-2">
                <span>នាំចូល & នាំចេញស្តុក</span>
                {activeLiveId && (
                  <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-700/60">
                    🎥 #{activeLiveId.length > 10 ? activeLiveId.slice(-8) : activeLiveId}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400">គ្រប់គ្រងស្តុកតាម Telegram, Paste, CSV ឬ Excel</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncBasketsPrice}
              disabled={syncingBaskets}
              className="text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1.5 rounded-xl border border-emerald-400/40 shadow-sm flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              title="ធ្វើបច្ចុប្បន្នភាពតម្លៃទំនិញគ្រប់កន្ត្រកក្នុង Live នេះឱ្យត្រូវតាមតម្លៃស្តុកបច្ចុប្បន្នភ្លាមៗ"
            >
              <span>{syncingBaskets ? '⏳...' : '🔄'}</span>
              <span className="hidden sm:inline">Sync តម្លៃកន្ត្រក</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800/80 text-slate-300 hover:text-white font-bold flex items-center justify-center hover:bg-slate-700 active:scale-95 cursor-pointer border border-slate-700"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-4 bg-[#090e17] border-b border-slate-800/80 p-1.5 gap-1.5 flex-shrink-0">
          <button
            onClick={() => setActiveTab('telegram')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer text-center ${
              activeTab === 'telegram'
                ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-md font-black ring-1 ring-cyan-400/30'
                : 'text-slate-400 hover:text-sky-300 hover:bg-slate-800/60 font-semibold'
            }`}
          >
            <span className="text-base">✈️</span>
            <span className="text-xs truncate">Telegram Bot</span>
          </button>

          <button
            onClick={() => setActiveTab('paste')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer text-center ${
              activeTab === 'paste'
                ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-md font-black ring-1 ring-cyan-400/30'
                : 'text-slate-400 hover:text-sky-300 hover:bg-slate-800/60 font-semibold'
            }`}
          >
            <span className="text-base">📝</span>
            <span className="text-xs truncate">បិទភ្ជាប់ (Paste)</span>
          </button>

          <button
            onClick={() => setActiveTab('file')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer text-center ${
              activeTab === 'file'
                ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-md font-black ring-1 ring-cyan-400/30'
                : 'text-slate-400 hover:text-sky-300 hover:bg-slate-800/60 font-semibold'
            }`}
          >
            <span className="text-base">📁</span>
            <span className="text-xs truncate">File (CSV)</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer text-center ${
              activeTab === 'export'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md font-black ring-1 ring-emerald-400/30'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/60 font-semibold'
            }`}
          >
            <span className="text-base">📤</span>
            <span className="text-xs truncate">នាំចេញ</span>
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4 bg-[#0b1120]">

          {/* TAB 1: TELEGRAM BOT SYNC */}
          {activeTab === 'telegram' && (
            <div className="flex flex-col gap-3.5 animate-fadeIn">
              
              {/* Auto Sync Switch Card */}
              <div className="bg-gradient-to-r from-slate-900 to-[#131f37] border border-cyan-500/30 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${
                    autoSyncEnabled ? 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {autoSyncEnabled ? '⚡' : '⏱️'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-100">Auto-Sync ស្វ័យប្រវត្តិ</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        autoSyncEnabled 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {autoSyncEnabled ? 'កំពុងដំណើរការ (ON)' : 'បានបិទ (OFF)'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {autoSyncEnabled 
                        ? '🔄 ប្រព័ន្ធកំពុងឆែកទាញរូប & កូដពី Telegram ស្វ័យប្រវត្តិតាមពេលកំណត់'
                        : 'ចុចប៊ូតុងខាងស្តាំដើម្បីបើកការទាញទិន្នន័យស្វ័យប្រវត្តិរាល់ ១០ វិនាទីម្តង'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleAutoSync}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer flex-shrink-0 shadow-md ${
                    autoSyncEnabled
                      ? 'bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-400/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-400/30 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                  }`}
                >
                  <span>{autoSyncEnabled ? '⏹️ បិទ Auto Sync' : '▶️ បើក Auto Sync'}</span>
                </button>
              </div>

              {/* Bot Token Input Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-200 font-bold flex items-center gap-1.5">
                    <span>🔑 Telegram Bot Token</span>
                  </span>
                  {tokenStatus === 'valid' && (
                    <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/60 border border-emerald-600/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span>🟢 @{botUsername || 'Pitoubot_bot'}</span>
                    </span>
                  )}
                  {tokenStatus === 'invalid' && (
                    <span className="text-rose-400 font-bold text-[11px] bg-rose-950/60 border border-rose-600/50 px-2 py-0.5 rounded-full">
                      🔴 Token មិនត្រឹមត្រូវ
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="ឧ. 8123456789:AAHfkj_sdfk..."
                    value={botToken}
                    onChange={e => {
                      setBotToken(e.target.value);
                      setTokenStatus('idle');
                    }}
                    className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 transition-all placeholder:text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => testToken(botToken, true)}
                    disabled={testingToken || !botToken.trim()}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold active:scale-95 disabled:opacity-50 cursor-pointer flex-shrink-0"
                  >
                    {testingToken ? '⏳...' : 'តេស្ត'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetWebhook}
                    disabled={!botToken.trim()}
                    title="ដោះស្រាយបញ្ហា Conflict Webhook ជាមួយប្រព័ន្ធផ្សេង"
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/50 text-slate-300 hover:text-rose-300 text-xs font-bold active:scale-95 disabled:opacity-50 cursor-pointer flex-shrink-0"
                  >
                    🔄 Fix Webhook
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveToken}
                    disabled={!botToken.trim()}
                    className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold active:scale-95 disabled:opacity-50 cursor-pointer flex-shrink-0 shadow-sm"
                  >
                    💾 រក្សាទុក
                  </button>
                </div>
              </div>

              {/* Instructions Banner Accordion/Summary */}
              <div className="bg-sky-950/30 border border-sky-600/30 rounded-2xl p-3 text-xs text-sky-200 flex flex-col gap-1.5 leading-relaxed">
                <div className="font-bold text-cyan-300 flex items-center gap-1.5 text-xs">
                  <span>💡 វិធីប្រើ Telegram Sync (ស្ងាត់ ១០០%) ៖</span>
                </div>
                <div className="text-[11.5px] text-slate-300 space-y-1">
                  <div>1. បញ្ចូល <b>Bot Token</b> របស់អ្នក (ដែលបានពី @BotFather) ខាងលើ។</div>
                  <div>2. Add Bot ចូលក្នុង <b>Telegram Group</b> ឬ Channel របស់អ្នក (ឱ្យសិទ្ធិ Administrator)។</div>
                  <div>3. ផ្ញើរូបភាពទំនិញភ្ជាប់ជាមួយ Caption <b>100=3.7</b> ឬសរសេរកូដក្នុង Group។</div>
                  <div>4. ចុច <b>«ស្កេនទាញកូដ»</b> ឬបើក <b>«Auto-Sync»</b> ខាងលើ នោះប្រព័ន្ធនឹងទាញទិន្នន័យស្វ័យប្រវត្តិដោយគ្មានការផ្ញើសាររញ៉េរញ៉ៃចូល Group ឡើយ!</div>
                </div>
              </div>

              {/* Bot Group Privacy Mode Warning Banner */}
              {!canReadAllGroupMessages && tokenStatus === 'valid' && (
                <div className="bg-amber-950/40 border-[1.5px] border-amber-500/70 rounded-xl p-3 text-xs text-amber-100 flex flex-col gap-2 leading-relaxed animate-fadeIn shadow-lg">
                  <div className="font-black text-amber-300 flex items-center justify-between text-xs border-b border-amber-800/60 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className="text-base">⚠️</span>
                      <span>មូលហេតុស្កេនមិនឃើញ ៖ Bot ជាប់ Privacy Mode (Telegram Default)</span>
                    </span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-mono font-bold border border-amber-500/40">
                      Privacy: ON
                    </span>
                  </div>

                  <p className="text-[11.5px] text-amber-200/90">
                    Telegram កំណត់បិទមិនឱ្យ Bot មើលសារ ឬរូបភាពក្នុង Group ដោយស្វ័យប្រវត្តិឡើយ (ដើម្បីសុវត្ថិភាព)។ ដើម្បីឱ្យ Bot មើលឃើញរូបភាព និងកូដក្នុង Group <b>សូមធ្វើតាម ៤ ជំហានងាយៗខាងក្រោម</b>៖
                  </p>

                  <div className="bg-[#0b1322] rounded-xl p-2.5 font-mono text-[11px] text-amber-200 border border-amber-700/40 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span>1. បើក Telegram ឆាតទៅ <b className="text-cyan-300">@BotFather</b></span>
                    </div>
                    <div className="flex items-center justify-between bg-black/40 p-1.5 rounded-lg border border-slate-700/70">
                      <span>2. ផ្ញើពាក្យបញ្ជា ៖ <b className="text-white font-mono">/setprivacy</b></span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('/setprivacy');
                          onShowToast('📋 បានចម្លង /setprivacy ទៅកាន់ Clipboard រួចរាល់!');
                        }}
                        className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-sans font-bold cursor-pointer"
                      >
                        ចម្លង
                      </button>
                    </div>
                    <div>3. ចុចជ្រើសរើស Bot របស់អ្នក ៖ <b className="text-cyan-300">@{botUsername || 'Pitoubot_bot'}</b></div>
                    <div>4. ចុចជ្រើសរើសពាក្យ ៖ <b className="text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-600">Disable</b> (ដើម្បីបិទ Privacy Mode)</div>
                    <div className="text-[10.5px] text-sky-300 pt-1 border-t border-slate-800">
                      ✨ <b>បន្ទាប់ពីចុច Disable រួច</b> ៖ ចុច Remove Bot ចេញពី Group ហើយ Add ចូលវិញ (ឬគ្រាន់តែផ្ញើរូបភាពថ្មីក្នុង Group) រួចចុច <b>«ស្កេនទាញកូដ»</b> ម្តងទៀត នោះរូបភាពនឹងលោតចូលភ្លាមៗ!
                    </div>
                  </div>

                  <div className="text-[11px] text-amber-300/80 bg-amber-950/20 p-2 rounded-lg border border-amber-800/40">
                    💡 <b>វិធីជំនួស (មិនបាច់កែ @BotFather) ៖</b> បងអាចសរសេរ Mention ឈ្មោះ Bot ក្នុង Caption រូបភាព (ឧទាហរណ៍៖ <code className="text-cyan-300 font-mono">@{botUsername || 'Pitoubot_bot'} 95=4</code>) ឬផ្ញើរូបភាពឆាតផ្ទាល់ 1-on-1 ទៅកាន់ Bot ក៏ស្កេនចូលដូចគ្នា!
                  </div>
                </div>
              )}

              {/* Bot Ready Banner */}
              {canReadAllGroupMessages && tokenStatus === 'valid' && (
                <div className="bg-emerald-950/30 border border-emerald-500/50 rounded-xl p-3 text-xs text-emerald-100 flex flex-col gap-2 leading-relaxed animate-fadeIn shadow-sm">
                  <div className="font-bold text-emerald-300 flex items-center justify-between text-xs border-b border-emerald-800/40 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className="text-base">🟢</span>
                      <span>Bot បានបិទ Privacy រួចរាល់ (អាចអានសារ និងរូបភាពក្នុង Group បាន)</span>
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono font-bold border border-emerald-500/30">
                      Privacy: OFF
                    </span>
                  </div>

                  <div className="text-[11.5px] text-emerald-200/90 space-y-1.5">
                    <p>
                      👉 <b>ប្រសិនបើស្កេនមិនទាន់ឃើញ ៖</b> តាមច្បាប់របស់ Telegram នៅពេលទើបតែបិទ Privacy រួច បងគ្រាន់តែចូលក្នុង Group <b>Remove Bot ចេញ ហើយ Add ចូលវិញ</b> (ដើម្បីឱ្យ Telegram refresh cache របស់ Group)។
                    </p>
                    <div className="bg-slate-950/80 p-2 rounded-lg border border-emerald-600/40 text-[11px] text-sky-200 space-y-1">
                      <div className="font-bold text-amber-300">
                        ⚡ ប្រសិនបើ Bot នេះកំពុងប្រើជាមួយប្រព័ន្ធ Attendance ផ្សេង (Conflict) ៖
                      </div>
                      <p className="text-slate-300">
                        Telegram អនុញ្ញាតឱ្យតែ <b>១ កម្មវិធីគត់</b> ទទួលសារពី Bot ក្នុងពេលតែមួយ។ បើមានកម្មវិធី Attendance កំពុងបើកទទួលសារស្រាប់ វានឹងឆក់យកសារបាត់ភ្លាមៗ។
                      </p>
                      <p className="text-emerald-300 font-bold">
                        💡 ដំណោះស្រាយល្អបំផុត ៖ ចូល @BotFather វាយ <code>/newbot</code> បង្កើត Bot ថ្មីមួយដាច់ដោយឡែក (ឧ. <code>MyStock_bot</code>) សម្រាប់តែទាញស្តុក នោះនឹងមិនជាន់គ្នាឡើយ!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Options Row */}
              <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">ចំនួនស្តុកដើមសម្រាប់កូដថ្មី (Default Qty) ៖</label>
                  <input
                    type="number"
                    min="1"
                    value={defaultQty}
                    onChange={e => setDefaultQty(Math.max(1, parseInt(e.target.value, 10) || 100))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-sky-300 font-mono font-bold outline-none"
                  />
                </div>
                <div className="flex items-center pt-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 text-[11px]">
                    <input
                      type="checkbox"
                      checked={markRead}
                      onChange={e => setMarkRead(e.target.checked)}
                      className="w-4 h-4 rounded text-sky-500 cursor-pointer"
                    />
                    <span>Mark Read (កុំទាញសារចាស់ដដែល)</span>
                  </label>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-800/80 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 text-[11px]">
                    <input
                      type="checkbox"
                      checked={keepExistingStockQty}
                      onChange={e => setKeepExistingStockQty(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 cursor-pointer"
                    />
                    <span>🔄 <b>បើកូដដដែល</b> ៖ ធ្វើបច្ចុប្បន្នភាពតម្លៃ &amp; រូបភាពស្វ័យប្រវត្តិ (រក្សាចំនួនស្តុកនៅសល់ដដែល)</span>
                  </label>
                </div>
              </div>

              {/* Fetch Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleFetchTelegramStock(false, false)}
                  disabled={fetchingTg}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white font-black text-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all disabled:opacity-50 cursor-pointer shadow-md"
                >
                  <span>{fetchingTg ? '⏳ កំពុងស្កេន...' : '🔍 ស្កេនទាញកូដ (Preview)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFetchTelegramStock(false, true)}
                  disabled={fetchingTg}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-sky-500/50 text-sky-200 font-bold text-xs flex items-center justify-center gap-1 active:scale-98 transition-all disabled:opacity-50 cursor-pointer shadow-md flex-shrink-0"
                  title="សម្អាតទិន្នន័យចាស់ទាំងអស់ ហើយស្កេនទាញថ្មីពី Telegram ឡើងវិញ"
                >
                  <span>🔄 ស្កេនថ្មីទាំងអស់</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFetchTelegramStock(true, false)}
                  disabled={fetchingTg}
                  className="py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs flex items-center justify-center gap-1 active:scale-98 transition-all disabled:opacity-50 cursor-pointer shadow-md flex-shrink-0"
                  title="ស្កេន និងបញ្ចូលចូលក្នុងស្តុកភ្លាមៗតែ ១ ឃ្លីក"
                >
                  <span>⚡ ស្កេន & នាំចូល</span>
                </button>
              </div>

              {/* Telegram Scanned Items Preview */}
              {tgItems.length > 0 && (
                <div className="flex flex-col gap-2 mt-1 border-t border-slate-800 pt-3">
                  <div className="flex flex-wrap justify-between items-center gap-2 bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-emerald-400">
                        ✅ រកឃើញ {tgItems.length} មុខ ៖
                      </span>
                      <button
                        type="button"
                        onClick={handleClearPreview}
                        className="text-[11px] font-bold text-rose-300 hover:text-rose-100 bg-rose-950/70 hover:bg-rose-900 border border-rose-600/60 px-2.5 py-1 rounded-lg cursor-pointer transition-all active:scale-95 shadow-sm flex items-center gap-1"
                        title="សម្អាតបញ្ជីកូដដែលកំពុង Preview ចោលទាំងអស់ (Reset ទៅ 0 មុខ)"
                      >
                        <span>🗑️ សម្អាតចោល (0 មុខ)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFetchTelegramStock(false, true)}
                        disabled={fetchingTg}
                        className="text-[11px] font-bold text-sky-300 hover:text-sky-100 bg-sky-950/70 hover:bg-sky-900 border border-sky-600/60 px-2.5 py-1 rounded-lg cursor-pointer transition-all active:scale-95 shadow-sm flex items-center gap-1"
                        title="សម្អាតបញ្ជីដែលបានស្កេនរួច ហើយស្កេនទាញថ្មីទាំងអស់ពី Telegram"
                      >
                        <span>🔄 ស្កេនទាញថ្មី</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleImportTgItems}
                      disabled={importingTg}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs active:scale-95 transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                    >
                      {importingTg ? '⏳ កំពុងបញ្ចូល...' : `✅ នាំចូល ${tgItems.length} មុខនេះទៅក្នុងស្តុក`}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                    {tgItems.map((item, idx) => {
                      const cleanCode = item.code.toUpperCase();
                      const existingProd = products.find(p => p.code.toUpperCase() === cleanCode);
                      const isExisting = !!existingProd;
                      const isPriceChanged = isExisting && Math.abs(existingProd.price - item.price) > 0.001;

                      return (
                        <div
                          key={idx}
                          className={`rounded-xl p-2 flex gap-2 items-center border transition-all ${
                            isExisting 
                              ? 'bg-slate-900/90 border-amber-500/40 hover:border-amber-500/70' 
                              : 'bg-slate-900 border-slate-700 hover:border-sky-500/50'
                          }`}
                        >
                          {item.image_url ? (
                            <div 
                              onClick={() => setPreviewZoomImage({ url: item.image_url!, code: item.code, name: item.name, price: item.price })}
                              className="w-13 h-13 min-w-[52px] h-[52px] rounded-lg relative overflow-hidden flex-shrink-0 bg-slate-950 border-2 border-cyan-500/50 hover:border-cyan-400 cursor-pointer shadow-sm group"
                              title="ចុចដើម្បីពង្រីកមើលរូបភាពធំ"
                            >
                              <img
                                src={item.image_url}
                                alt={item.code}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  if (existingProd?.image_file && target.src !== existingProd.image_file) {
                                    target.src = existingProd.image_file;
                                    return;
                                  }
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  const fb = parent?.querySelector('.img-fallback') as HTMLElement;
                                  if (fb) fb.style.display = 'flex';
                                }}
                              />
                              <div className="img-fallback hidden absolute inset-0 items-center justify-center text-xs opacity-60 bg-slate-900 text-slate-400">
                                📷
                              </div>
                            </div>
                          ) : existingProd?.image_file ? (
                            <div 
                              onClick={() => setPreviewZoomImage({ url: existingProd.image_file!, code: item.code, name: item.name, price: item.price })}
                              className="w-13 h-13 min-w-[52px] h-[52px] rounded-lg relative overflow-hidden flex-shrink-0 bg-slate-950 border border-slate-700 hover:border-amber-400 opacity-90 cursor-pointer shadow-sm group"
                              title="រូបភាពចាស់ក្នុងស្តុក (ចុចដើម្បីពង្រីក)"
                            >
                              <img
                                src={existingProd.image_file}
                                alt={item.code}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  const fb = parent?.querySelector('.img-fallback') as HTMLElement;
                                  if (fb) fb.style.display = 'flex';
                                }}
                              />
                              <div className="img-fallback hidden absolute inset-0 items-center justify-center text-xs opacity-60 bg-slate-900 text-slate-400">
                                📷
                              </div>
                            </div>
                          ) : (
                            <div className="w-13 h-13 min-w-[52px] h-[52px] rounded-lg bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-xs opacity-50 flex-shrink-0">
                              <span>📷</span>
                              <span className="text-[8px] text-slate-400">គ្មានរូប</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono font-black text-cyan-300 text-xs">[{item.code}]</span>
                              {isExisting ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  🔄 កែប្រែ
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  🆕 ថ្មី
                                </span>
                              )}
                            </div>

                            {/* Price */}
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isPriceChanged ? (
                                <div className="flex items-center gap-1 font-mono text-xs">
                                  <span className="line-through text-slate-500 text-[10.5px]">${existingProd.price.toFixed(2)}</span>
                                  <span className="text-emerald-400 font-black">${item.price.toFixed(2)}</span>
                                </div>
                              ) : (
                                <span className="font-mono font-bold text-amber-400 text-xs">${item.price.toFixed(2)}</span>
                              )}
                              {item.image_url && isExisting && (
                                <span className="text-[9px] text-cyan-300 font-semibold">🖼️ រូបថ្មី</span>
                              )}
                            </div>

                            <div className="text-[10px] text-slate-400 truncate">{item.name}</div>
                            <div className="text-[9.5px] text-slate-500 truncate">
                              {isExisting ? (
                                <span className="text-amber-300/90 font-medium">
                                  ស្តុក៖ {existingProd.stock_qty} {keepExistingStockQty ? '(រក្សាដដែល)' : `➔ ${item.stock_qty}`}
                                </span>
                              ) : (
                                <span>ស្តុកដើម៖ {item.stock_qty}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PASTE TEXT */}
          {activeTab === 'paste' && (
            <div className="flex flex-col gap-3 animate-fadeIn">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-300">
                <span className="font-bold text-cyan-300 block mb-1">📝 ទម្រង់សរសេរដែលគាំទ្រស្វ័យប្រវត្តិ ៖</span>
                <div className="font-mono text-[11px] text-slate-400 space-y-0.5">
                  <div>100=3.7 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (កូដ=តម្លៃ)</div>
                  <div>101=4.5 អាវយឺត (ភ្ជាប់ជាមួយឈ្មោះ)</div>
                  <div>កូដ A12 តម្លៃ 5.5$</div>
                  <div>99=1.5</div>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold block mb-1">
                  បិទភ្ជាប់ (Paste) អត្ថបទនៅទីនេះ ៖
                </label>
                <textarea
                  rows={6}
                  placeholder={`100=3.7\n101=4.5\n99=1.5\nA12=5.0 អាវយឺតកូរ៉េ`}
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs font-mono text-sky-200 outline-none focus:border-cyan-400 resize-none leading-relaxed"
                />
              </div>

              {parsedPasteItems.length > 0 && (
                <div className="bg-emerald-950/30 border border-emerald-600/40 rounded-xl p-2.5 flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-400">
                    🔍 ស្គាល់បាន {parsedPasteItems.length} មុខទំនិញ
                  </span>
                  <button
                    type="button"
                    onClick={handleImportPaste}
                    disabled={importingPaste}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs active:scale-95 transition-all shadow-md cursor-pointer"
                  >
                    {importingPaste ? '⏳ កំពុងបញ្ចូល...' : `✅ នាំចូល ${parsedPasteItems.length} មុខទៅស្តុក`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FILE IMPORT (CSV / JSON) */}
          {activeTab === 'file' && (
            <div className="flex flex-col gap-3.5 animate-fadeIn">
              <div className="border-2 border-dashed border-sky-600/50 hover:border-cyan-400 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-900/40"
                   onClick={() => fileInputRef.current?.click()}>
                <span className="text-3xl">📁</span>
                <span className="text-xs font-bold text-sky-300">
                  {fileName ? fileName : 'ចុចដើម្បីរើសឯកសារ .CSV ឬ .JSON'}
                </span>
                <span className="text-[10.5px] text-slate-500 text-center">
                  គាំទ្រ Format Excel CSV (Code, Price, Name, Stock, Image) ឬ JSON Backup
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {fileData.length > 0 && (
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 flex justify-between items-center">
                  <div className="text-xs">
                    <span className="text-slate-300">ទិន្នន័យក្នុងឯកសារ ៖ </span>
                    <span className="text-cyan-400 font-bold">{fileData.length} មុខ</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleImportFileData}
                    disabled={importingFile}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs active:scale-95 transition-all shadow-md cursor-pointer"
                  >
                    {importingFile ? '⏳ កំពុងនាំចូល...' : `✅ នាំចូល ${fileData.length} មុខទៅស្តុក`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: EXPORT STOCK */}
          {activeTab === 'export' && (
            <div className="flex flex-col gap-3.5 animate-fadeIn">
              <div className="bg-emerald-950/40 border border-emerald-600/40 rounded-xl p-3 flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold text-emerald-300">📦 ស្តុកសរុបបច្ចុប្បន្ន ៖</div>
                  <div className="text-lg font-mono font-black text-white">{products.length} មុខទំនិញ</div>
                </div>
                <div className="text-xs text-right text-slate-400">
                  <div>ចំនួនសរុប ៖ {products.reduce((s, p) => s + (p.stock_qty || 0), 0)} ដើម</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Export CSV */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/60 text-emerald-300 text-xs font-black flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md text-center"
                >
                  <span className="text-2xl">📊</span>
                  <span>ទាញយក CSV / Excel</span>
                  <span className="text-[9.5px] text-slate-400 font-normal font-sans">គាំទ្រ Excel ខ្មែរ UTF-8</span>
                </button>

                {/* Export JSON */}
                <button
                  type="button"
                  onClick={handleExportJSON}
                  className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-sky-500/60 text-sky-300 text-xs font-black flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md text-center"
                >
                  <span className="text-2xl">💾</span>
                  <span>ទាញយក JSON Backup</span>
                  <span className="text-[9.5px] text-slate-400 font-normal font-sans">Backup ទាំងមូល</span>
                </button>

                {/* Copy Text */}
                <button
                  type="button"
                  onClick={copyAsText}
                  className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-500/60 text-amber-300 text-xs font-black flex flex-col items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md text-center"
                >
                  <span className="text-2xl">📋</span>
                  <span>ចម្លងជាអត្ថបទ (Text)</span>
                  <span className="text-[9.5px] text-slate-400 font-normal font-sans">100=3.7 សម្រាប់ Paste</span>
                </button>
              </div>

              {/* Quick Text View of Stock */}
              <div className="mt-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-slate-400 font-bold">បញ្ជីកូដ និងតម្លៃក្នុងស្តុក ៖</span>
                  <button
                    type="button"
                    onClick={copyAsText}
                    className="text-xs text-cyan-400 hover:underline font-bold"
                  >
                    ចម្លងទាំងអស់
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={5}
                  value={products.map(p => `${p.code}=${p.price.toFixed(2)}${p.name ? ` (${p.name})` : ''}`).join('\n')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-300 resize-none outline-none"
                />
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 🔍 High-Res Image Zoom Lightbox Popup */}
      {previewZoomImage && (
        <div 
          onClick={() => setPreviewZoomImage(null)}
          className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="relative max-w-sm w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center p-3"
          >
            <div className="w-full flex justify-between items-center pb-2 border-b border-slate-800 mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-cyan-400 text-base">[{previewZoomImage.code}]</span>
                {previewZoomImage.price !== undefined && (
                  <span className="font-mono font-bold text-amber-400 text-sm">${previewZoomImage.price.toFixed(2)}</span>
                )}
                {previewZoomImage.name && (
                  <span className="text-xs text-slate-300 truncate max-w-[130px]">{previewZoomImage.name}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewZoomImage(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-black cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="w-full aspect-square bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800 relative">
              <img
                src={previewZoomImage.url}
                alt={previewZoomImage.code}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="w-full mt-2.5 text-center text-xs text-slate-400">
              ចុចទីណាណាមួយ ឬចុច ✕ ដើម្បីបិទ
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
