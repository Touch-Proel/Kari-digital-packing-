import React, { useState, useEffect } from 'react';
import { playSuccessFanfare, playWarningBuzzer } from '../../utils/audio';

interface FastCheckSlipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedCount: number) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
}

export interface MessengerSlipItem {
  id: string;
  source: 'MESSENGER' | 'TELEGRAM';
  sender_id: string;
  sender_name: string;
  slip_url: string;
  received_at: string;
  extracted: {
    customer_name: string;
    paid_amount: number;
    currency: 'USD' | 'KHR';
    phone_number?: string;
    bank_name?: string;
    trans_ref?: string;
    trans_date?: string;
    basket_no?: number | string;
    remarks?: string;
  };
  status: 'MATCHED' | 'MULTIPLE_CANDIDATES' | 'NOT_FOUND' | 'APPROVED' | 'REJECTED';
  is_approved?: boolean;
  confidence: number;
  matched_invoice?: {
    invoice_id: number;
    basket_no?: number | string;
    live_id: string;
    facebook_name: string;
    phone_number: string;
    total_amount: number;
    created_at: string;
    packing_stage: string;
    status: string;
  };
  candidates?: Array<{
    invoice_id: number;
    basket_no?: number | string;
    live_id: string;
    facebook_name: string;
    phone_number: string;
    total_amount: number;
    created_at: string;
    packing_stage: string;
    status: string;
  }>;
}

interface UnpaidBasket {
  invoice_id: number;
  basket_no?: number | string;
  live_id: string;
  facebook_name: string;
  phone_number: string;
  total_amount: number;
  created_at: string;
  packing_stage: string;
  status: string;
}

export function FastCheckSlipsModal({
  isOpen,
  onClose,
  onSuccess,
  onShowToast
}: FastCheckSlipsModalProps) {
  const [timeFilter, setTimeFilter] = useState<'today' | '24h' | 'all'>('today');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'MATCHED' | 'REVIEW' | 'APPROVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [slips, setSlips] = useState<MessengerSlipItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [approvingIds, setApprovingIds] = useState<Record<string, boolean>>({});
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Manual Basket Search Modal State
  const [manualLinkSlip, setManualLinkSlip] = useState<MessengerSlipItem | null>(null);
  const [unpaidBaskets, setUnpaidBaskets] = useState<UnpaidBasket[]>([]);
  const [basketSearchTerm, setBasketSearchTerm] = useState('');
  const [isLoadingBaskets, setIsLoadingBaskets] = useState(false);

  // Gemini API Key State for VPS / Settings
  const [geminiStatus, setGeminiStatus] = useState<{
    hasKey: boolean;
    maskedKey: string;
    isFromEnv: boolean;
    hasCustomKey: boolean;
  }>({ hasKey: false, maskedKey: '', isFromEnv: false, hasCustomKey: false });
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Fetch Slips from Backend (Messenger Auto-Scanned)
  const fetchMessengerSlips = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const res = await fetch(`/api/fast_check/messenger_slips?since=${timeFilter}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.slips)) {
          setSlips(data.slips);
        }
      }
    } catch (err) {
      console.error('Error fetching messenger slips:', err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  // Check Gemini Key Status
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

  const fetchUnpaidBaskets = async () => {
    setIsLoadingBaskets(true);
    try {
      const res = await fetch('/api/fast_check/unpaid_baskets');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.baskets)) {
          setUnpaidBaskets(data.baskets);
        }
      }
    } catch (err) {
      console.error('Error fetching unpaid baskets:', err);
    } finally {
      setIsLoadingBaskets(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchGeminiStatus();
      fetchUnpaidBaskets();
      fetchMessengerSlips(true);
    }
  }, [isOpen, timeFilter]);

  // Auto-Polling every 10 seconds silently
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      fetchMessengerSlips(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [isOpen, timeFilter]);

  if (!isOpen) return null;

  // Manual Trigger to Sync from Messenger Inbox
  const handleSyncMessengerNow = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/fast_check/sync_messenger_slips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: timeFilter })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast(data.message || '✅ បានទាញយក Slips ថ្មីៗពី Messenger ជោគជ័យ!', 'success');
        fetchMessengerSlips(false);
        fetchUnpaidBaskets();
      } else {
        onShowToast(data.error || 'មិនអាចទាញយកសារ Messenger បានទេ', 'error');
      }
    } catch {
      onShowToast('មានបញ្ហាក្នុងការតភ្ជាប់ Messenger API', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

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

  // 1-Click Approve Single Slip by Admin
  const handleApproveSingle = async (slip: MessengerSlipItem) => {
    if (!slip.matched_invoice) {
      onShowToast('សូមភ្ជាប់កន្ត្រកជាមុនសិនមុននឹង Approve!', 'warning');
      return;
    }

    setApprovingIds(prev => ({ ...prev, [slip.id]: true }));

    try {
      const res = await fetch('/api/fast_check/approve_slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slip_id: slip.id,
          invoice_id: slip.matched_invoice.invoice_id,
          paid_amount: slip.extracted.paid_amount,
          packer_name: 'Admin (Messenger Table)'
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          playSuccessFanfare();
          onShowToast(`✅ Admin បាន Approved កន្ត្រក #${slip.matched_invoice.basket_no} ទៅជា [Paid] ជោគជ័យ!`, 'success');
          
          setSlips(prev => prev.map(s => {
            if (s.id === slip.id) {
              return { ...s, status: 'APPROVED', is_approved: true };
            }
            return s;
          }));

          onSuccess(1);
          fetchUnpaidBaskets();
        }
      } else {
        throw new Error('Failed to approve');
      }
    } catch {
      playWarningBuzzer();
      onShowToast('⚠️ មិនអាច Approve បានទេ សូមព្យាយាមម្តងទៀត', 'error');
    } finally {
      setApprovingIds(prev => ({ ...prev, [slip.id]: false }));
    }
  };

  // Bulk Approve All 100% Matched Slips
  const handleConfirmAllMatched = async () => {
    const matchedItems = slips.filter(s => s.status === 'MATCHED' && s.matched_invoice && !s.is_approved);
    if (matchedItems.length === 0) {
      onShowToast('មិនមាន Slips ដែលបានផ្ទៀងផ្ទាត់ត្រូវ ១០០% សម្រាប់បញ្ជាក់ទេ!', 'warning');
      return;
    }

    setIsConfirmingAll(true);
    try {
      const matches = matchedItems.map(s => ({
        invoice_id: s.matched_invoice!.invoice_id,
        slip_url: s.slip_url,
        paid_amount: s.extracted.paid_amount,
        paid_by: 'Admin Bulk Verified (Messenger)'
      }));

      const res = await fetch('/api/fast_check/confirm_matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches, packerName: 'Admin' })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          playSuccessFanfare();
          onShowToast(`✅ Admin បាន Approved ប្តូរទៅ [បង់រួច] ជោគជ័យ ${json.updated_count} កន្ត្រក!`, 'success');
          
          setSlips(prev => prev.map(s => {
            if (s.status === 'MATCHED' && s.matched_invoice) {
              return { ...s, status: 'APPROVED', is_approved: true };
            }
            return s;
          }));

          onSuccess(json.updated_count);
          fetchUnpaidBaskets();
        }
      } else {
        throw new Error('Failed to confirm');
      }
    } catch {
      playWarningBuzzer();
      onShowToast('⚠️ មានបញ្ហាក្នុងការបញ្ជាក់បង់រួច!', 'error');
    } finally {
      setIsConfirmingAll(false);
    }
  };

  // Reject or Discard a Slip
  const handleRejectSlip = async (slipId: string) => {
    try {
      const res = await fetch('/api/fast_check/reject_slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slip_id: slipId })
      });
      if (res.ok) {
        setSlips(prev => prev.filter(s => s.id !== slipId));
        onShowToast('បានដក Slip ចេញពីតារាងផ្ទៀងផ្ទាត់', 'warning');
      }
    } catch {
      onShowToast('មិនអាចដក Slip បានទេ', 'error');
    }
  };

  // Manual Bind Basket to Slip
  const handleSelectCandidate = (basket: UnpaidBasket) => {
    if (!manualLinkSlip) return;
    playSuccessFanfare();
    onShowToast(`✅ បានភ្ជាប់ជាមួយកន្ត្រក #${basket.basket_no} (${basket.facebook_name})!`, 'success');
    
    setSlips(prev => prev.map(s => {
      if (s.id === manualLinkSlip.id) {
        return {
          ...s,
          status: 'MATCHED',
          confidence: 100,
          matched_invoice: basket
        };
      }
      return s;
    }));
    setManualLinkSlip(null);
  };

  // Filtered Slips for Table
  const isReceiverAccountName = (name?: string) => {
    if (!name) return false;
    const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return clean.includes('proeltoch') || clean.includes('proel') || clean.includes('toch') || clean.includes('kari');
  };

  const getCustomerDisplayInfo = (slip: MessengerSlipItem) => {
    const fbSender = slip.sender_name || (slip.matched_invoice && slip.matched_invoice.facebook_name) || '';
    const rawBankName = slip.extracted.customer_name;
    const bankPayer = rawBankName && !isReceiverAccountName(rawBankName) ? rawBankName : '';
    const primaryName = fbSender || bankPayer || 'អតិថិជន Facebook';
    const showBankPayer = Boolean(bankPayer && bankPayer.toLowerCase().trim() !== primaryName.toLowerCase().trim());
    return { primaryName, fbSender, bankPayer, showBankPayer };
  };

  const filteredSlips = slips.filter(slip => {
    const isMatched = slip.status === 'MATCHED';
    const isApproved = slip.status === 'APPROVED' || slip.is_approved;
    const isReview = slip.status === 'MULTIPLE_CANDIDATES' || slip.status === 'NOT_FOUND';

    if (filterStatus === 'MATCHED' && (!isMatched || isApproved)) return false;
    if (filterStatus === 'APPROVED' && !isApproved) return false;
    if (filterStatus === 'REVIEW' && (!isReview || isApproved)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const { primaryName, fbSender, bankPayer } = getCustomerDisplayInfo(slip);
      const name = `${primaryName} ${fbSender} ${bankPayer}`.toLowerCase();
      const phone = (slip.extracted.phone_number || '').toLowerCase();
      const basket = slip.matched_invoice ? String(slip.matched_invoice.basket_no || '').toLowerCase() : '';
      const bank = (slip.extracted.bank_name || '').toLowerCase();
      const ref = (slip.extracted.trans_ref || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || basket.includes(q) || bank.includes(q) || ref.includes(q);
    }

    return true;
  });

  const matchedCount = slips.filter(s => s.status === 'MATCHED' && !s.is_approved).length;
  const approvedCount = slips.filter(s => s.status === 'APPROVED' || s.is_approved).length;
  const reviewCount = slips.filter(s => (s.status === 'MULTIPLE_CANDIDATES' || s.status === 'NOT_FOUND') && !s.is_approved).length;

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[95vh] sm:h-[90vh] flex flex-col bg-[#0B1120] border-2 border-indigo-500/50 rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.25)] overflow-hidden text-slate-100">
        
        {/* COMPACT CLEAN HEADER (SLIM SINGLE ROW) */}
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 bg-gradient-to-r from-[#0F172A] via-[#1E1B4B] to-[#0F172A] border-b border-indigo-500/30 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl flex-shrink-0">⚡</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-black text-white truncate">
                  Auto-Scan Slips ពី Messenger
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9.5px] font-black px-2 py-0.5 rounded-full flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Live Webhook ON</span>
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Sync Now Button */}
            <button
              type="button"
              onClick={handleSyncMessengerNow}
              disabled={isSyncing}
              className="py-1 px-2.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 border border-indigo-400/60 text-white font-bold text-[11px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              title="ចុចទាញយក Slips ថ្មីៗពី Messenger ឥឡូវនេះ"
            >
              <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
              <span className="hidden xs:inline">{isSyncing ? 'Syncing...' : 'Sync Messenger'}</span>
            </button>

            {/* API Key Toggle */}
            <button
              type="button"
              onClick={() => setShowKeyConfig(!showKeyConfig)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700"
              title="កំណត់ Gemini API Key"
            >
              ⚙️
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-slate-800 hover:bg-rose-900/80 text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm transition-colors cursor-pointer ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Gemini API Key Configuration Panel */}
        {showKeyConfig && (
          <div className="mx-3 mt-2 p-2.5 bg-slate-950 border border-indigo-500/40 rounded-xl text-xs space-y-2 animate-in slide-in-from-top duration-200 flex-shrink-0">
            <div className="flex items-center justify-between text-indigo-200 font-bold">
              <span>🔑 កំណត់ Google Gemini API Key សម្រាប់ Auto-Scan Slips</span>
              <button onClick={() => setShowKeyConfig(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="បិទភ្ជាប់ Gemini API Key (AIzaSy...)"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none font-mono"
              />
              <button
                type="button"
                disabled={isSavingKey || !apiKeyInput.trim()}
                onClick={handleSaveGeminiKey}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
              >
                {isSavingKey ? '...' : '💾 រក្សាទុក'}
              </button>
            </div>
          </div>
        )}

        {/* COMPACT SINGLE-ROW FILTER STRIP (SLIM & CLEAN) */}
        <div className="px-3 py-2 bg-[#080E1B] border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
          
          {/* Time Filter Pills */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setTimeFilter('today')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                timeFilter === 'today' ? 'bg-indigo-600 text-white font-black shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              📅 ថ្ងៃនេះ (12:00 AM)
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('24h')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                timeFilter === '24h' ? 'bg-indigo-600 text-white font-black shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              🕒 24h
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                timeFilter === 'all' ? 'bg-indigo-600 text-white font-black shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              🌐 ទាំងអស់
            </button>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setFilterStatus('ALL')}
              className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                filterStatus === 'ALL' ? 'bg-slate-700 text-white font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              ទាំងអស់ ({slips.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('MATCHED')}
              className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                filterStatus === 'MATCHED' ? 'bg-emerald-600 text-white font-black' : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              🟢 ត្រូវ ({matchedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('REVIEW')}
              className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                filterStatus === 'REVIEW' ? 'bg-amber-600 text-white font-black' : 'text-amber-400 hover:text-amber-300'
              }`}
            >
              🟡 ពិនិត្យ ({reviewCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('APPROVED')}
              className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                filterStatus === 'APPROVED' ? 'bg-cyan-600 text-white font-black' : 'text-cyan-400 hover:text-cyan-300'
              }`}
            >
              ✨ Paid ({approvedCount})
            </button>
          </div>

          {/* Quick Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 ស្វែងរកកន្ត្រក/ឈ្មោះ..."
            className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-[11px] text-white placeholder-slate-500 outline-none focus:border-indigo-500 w-36 sm:w-44"
          />
        </div>

        {/* MAIN CONTENT: EXPANDED SPACIOUS VIEWPORT */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3">
          
          {isLoading ? (
            <div className="text-center py-20 text-slate-400 space-y-2">
              <span className="animate-spin text-3xl inline-block">⏳</span>
              <div className="font-bold text-xs text-slate-300">កំពុងទាញទិន្នន័យ Slips ពី Messenger...</div>
            </div>
          ) : filteredSlips.length > 0 ? (
            <>
              {/* DESKTOP VIEW (>= 768px): Structured High-Density Table */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 shadow-inner">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#0F172A] border-b border-slate-800 text-slate-400 font-bold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">N</th>
                      <th className="py-2.5 px-3 w-16 text-center">Slip Pic</th>
                      <th className="py-2.5 px-3">👤 FB Name អ្នកផ្ញើ / អតិថិជន</th>
                      <th className="py-2.5 px-3">កន្ត្រក (Basket #)</th>
                      <th className="py-2.5 px-3 text-right">Slip Amount</th>
                      <th className="py-2.5 px-3 text-right">Invoice Total</th>
                      <th className="py-2.5 px-3">Bank & Ref</th>
                      <th className="py-2.5 px-3 text-center">ម៉ោងផ្ញើ</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center min-w-[130px]">Admin Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredSlips.map((slip, idx) => {
                      const isApproved = slip.status === 'APPROVED' || slip.is_approved;
                      const isMatched = slip.status === 'MATCHED' && Boolean(slip.matched_invoice);
                      const isAmbiguous = slip.status === 'MULTIPLE_CANDIDATES';
                      const isNotFound = slip.status === 'NOT_FOUND';
                      const isApproving = Boolean(approvingIds[slip.id]);

                      const invTotal = slip.matched_invoice?.total_amount || 0;
                      const slipAmt = slip.extracted.paid_amount || 0;
                      const isAmountEqual = Math.abs(invTotal - slipAmt) < 0.05 && slipAmt > 0;
                      const { primaryName, bankPayer, showBankPayer } = getCustomerDisplayInfo(slip);

                      return (
                        <tr
                          key={slip.id || idx}
                          className={`transition-colors hover:bg-slate-800/40 ${
                            isApproved
                              ? 'bg-cyan-950/15 text-slate-300'
                              : isMatched
                              ? 'bg-emerald-950/20'
                              : isAmbiguous
                              ? 'bg-amber-950/15'
                              : 'bg-rose-950/10'
                          }`}
                        >
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-400">
                            {idx + 1}
                          </td>

                          <td className="py-2 px-3 text-center">
                            {slip.slip_url ? (
                              <img
                                src={slip.slip_url}
                                alt="Slip"
                                onClick={() => setPreviewImage(slip.slip_url)}
                                className="w-12 h-12 object-cover rounded-xl border border-slate-700 hover:scale-105 cursor-pointer shadow-sm mx-auto"
                                title="ចុចមើលរូបធំ"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm text-slate-500 mx-auto">
                                📋
                              </div>
                            )}
                          </td>

                          <td className="py-2 px-3">
                            <div>
                              <div className="flex items-center gap-1.5 font-bold text-sm text-white">
                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-[10px] text-white font-black flex-shrink-0 shadow-sm" title="Facebook Messenger">
                                  f
                                </span>
                                <span className="text-blue-100 font-bold truncate max-w-[170px]">
                                  {primaryName}
                                </span>
                              </div>
                              {showBankPayer && (
                                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                  <span>💳 លើ Slip:</span>
                                  <span className="text-slate-300 font-semibold">{bankPayer}</span>
                                </div>
                              )}
                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                {slip.extracted.phone_number && (
                                  <span className="text-indigo-300 font-mono">📞 {slip.extracted.phone_number}</span>
                                )}
                                {slip.extracted.remarks && (
                                  <span className="text-slate-400 truncate max-w-[110px]">📝 {slip.extracted.remarks}</span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-2 px-3">
                            {slip.matched_invoice ? (
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1">
                                  <span className="font-black font-mono text-sm px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-200 border border-indigo-500/40">
                                    #{slip.matched_invoice.basket_no || slip.matched_invoice.invoice_id}
                                  </span>
                                  <span className="text-[10px] text-slate-400 truncate">
                                    {slip.matched_invoice.live_id}
                                  </span>
                                </div>
                                {!isApproved && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setManualLinkSlip(slip);
                                      setBasketSearchTerm('');
                                    }}
                                    className="text-[10.5px] text-indigo-400 hover:text-indigo-300 underline mt-0.5 text-left cursor-pointer"
                                  >
                                    🔄 ប្តូរកន្ត្រក
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setManualLinkSlip(slip);
                                  setBasketSearchTerm('');
                                }}
                                className="px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/30 text-amber-300 font-bold text-[10.5px] cursor-pointer"
                              >
                                🔍 ភ្ជាប់កន្ត្រក
                              </button>
                            )}
                          </td>

                          <td className="py-2 px-3 text-right font-mono font-black text-sm text-amber-300">
                            {slipAmt > 0 ? `$${slipAmt.toFixed(2)}` : '-'}
                          </td>

                          <td className="py-2 px-3 text-right">
                            {slip.matched_invoice ? (
                              <div>
                                <span className={`font-mono font-bold text-sm ${isAmountEqual ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  ${invTotal.toFixed(2)}
                                </span>
                                {isAmountEqual && <div className="text-[9.5px] text-emerald-400">✓ ស្មើ</div>}
                              </div>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-slate-300">
                            <div className="font-bold text-indigo-300 text-[11.5px]">
                              {slip.extracted.bank_name || 'Bank'}
                            </div>
                            {slip.extracted.trans_ref && (
                              <div className="font-mono text-[10px] text-slate-400 truncate max-w-[110px]">
                                {slip.extracted.trans_ref}
                              </div>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center text-[10.5px] font-mono text-slate-400">
                            {formatTime(slip.received_at)}
                          </td>

                          <td className="py-2 px-3 text-center">
                            {isApproved && (
                              <span className="bg-cyan-500/20 text-cyan-300 text-[10.5px] font-black px-2 py-0.5 rounded-full border border-cyan-500/40">
                                ✨ Paid
                              </span>
                            )}
                            {!isApproved && isMatched && (
                              <span className="bg-emerald-500/20 text-emerald-300 text-[10.5px] font-black px-2 py-0.5 rounded-full border border-emerald-500/40">
                                🟢 ត្រូវ ១០០%
                              </span>
                            )}
                            {!isApproved && isAmbiguous && (
                              <span className="bg-amber-500/20 text-amber-300 text-[10.5px] font-black px-2 py-0.5 rounded-full border border-amber-500/40 animate-pulse">
                                🟡 ស្ទួន
                              </span>
                            )}
                            {!isApproved && isNotFound && (
                              <span className="bg-rose-500/20 text-rose-300 text-[10.5px] font-black px-2 py-0.5 rounded-full border border-rose-500/40">
                                🔴 រកមិនឃើញ
                              </span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {isApproved ? (
                                <span className="text-xs text-emerald-400 font-bold">✅ បានបង់រួច</span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={!slip.matched_invoice || isApproving}
                                    onClick={() => handleApproveSingle(slip)}
                                    className="py-1 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-slate-950 font-black text-xs shadow-md active:scale-95 transition-all cursor-pointer"
                                  >
                                    {isApproving ? '⏳' : '✓ Approve'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectSlip(slip.id)}
                                    className="p-1 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 text-xs"
                                    title="លុបចេញ"
                                  >
                                    ✕
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE VIEW (< 768px): Spacious Clean Touch Cards */}
              <div className="block md:hidden space-y-2.5">
                {filteredSlips.map((slip, idx) => {
                  const isApproved = slip.status === 'APPROVED' || slip.is_approved;
                  const isMatched = slip.status === 'MATCHED' && Boolean(slip.matched_invoice);
                  const isAmbiguous = slip.status === 'MULTIPLE_CANDIDATES';
                  const isNotFound = slip.status === 'NOT_FOUND';
                  const isApproving = Boolean(approvingIds[slip.id]);

                  const invTotal = slip.matched_invoice?.total_amount || 0;
                  const slipAmt = slip.extracted.paid_amount || 0;
                  const isAmountEqual = Math.abs(invTotal - slipAmt) < 0.05 && slipAmt > 0;

                  return (
                    <div
                      key={slip.id || idx}
                      className={`p-3 rounded-2xl border shadow-sm transition-all ${
                        isApproved
                          ? 'bg-[#0F172A]/90 border-cyan-500/40 text-slate-300'
                          : isMatched
                          ? 'bg-[#0E1E2E] border-emerald-500/50'
                          : isAmbiguous
                          ? 'bg-[#1E1A0F] border-amber-500/50'
                          : 'bg-[#1F0F14] border-rose-800/40'
                      }`}
                    >
                      {/* Top Row: Thumbnail + Customer + Status Badge */}
                      <div className="flex items-start gap-2.5">
                        {slip.slip_url ? (
                          <div
                            onClick={() => setPreviewImage(slip.slip_url)}
                            className="relative flex-shrink-0 cursor-pointer"
                          >
                            <img
                              src={slip.slip_url}
                              alt="Slip"
                              className="w-16 h-16 object-cover rounded-xl border border-slate-700 shadow-md"
                            />
                            <span className="absolute bottom-0 right-0 bg-black/80 text-[9px] px-1 rounded text-white">
                              🔍
                            </span>
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl flex-shrink-0">
                            📋
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          {(() => {
                            const { primaryName, bankPayer, showBankPayer } = getCustomerDisplayInfo(slip);
                            return (
                              <>
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-[10px] text-white font-black flex-shrink-0 shadow-sm" title="Facebook Messenger">
                                      f
                                    </span>
                                    <h4 className="font-black text-sm text-blue-100 truncate">
                                      #{idx + 1}. {primaryName}
                                    </h4>
                                  </div>
                                  {isApproved ? (
                                    <span className="bg-cyan-500/20 text-cyan-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-cyan-500/40 flex-shrink-0">
                                      ✨ Paid
                                    </span>
                                  ) : isMatched ? (
                                    <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/40 flex-shrink-0">
                                      🟢 ត្រូវ ១០០%
                                    </span>
                                  ) : isAmbiguous ? (
                                    <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-500/40 flex-shrink-0 animate-pulse">
                                      🟡 ស្ទួន
                                    </span>
                                  ) : (
                                    <span className="bg-rose-500/20 text-rose-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-rose-500/40 flex-shrink-0">
                                      🔴 រកមិនឃើញ
                                    </span>
                                  )}
                                </div>
                                {showBankPayer && (
                                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                    <span>💳 លើ Slip:</span>
                                    <span className="text-slate-300 font-semibold">{bankPayer}</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          {/* Bank & Time */}
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="text-indigo-300 font-bold">🏦 {slip.extracted.bank_name || 'Bank'}</span>
                            {slip.received_at && <span className="font-mono text-slate-400">🕒 {formatTime(slip.received_at)}</span>}
                          </div>

                          {/* Basket & Amount Comparison */}
                          <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-slate-800/80">
                            <div className="flex items-center gap-1.5">
                              {slip.matched_invoice ? (
                                <span className="font-black font-mono text-xs px-2 py-0.5 rounded-md bg-indigo-500/25 text-indigo-200 border border-indigo-500/40">
                                  #{slip.matched_invoice.basket_no || slip.matched_invoice.invoice_id}
                                </span>
                              ) : (
                                <span className="text-[11px] text-amber-400 font-bold">⚠️ គ្មានកន្ត្រក</span>
                              )}
                              <span className="text-[11px] font-mono text-amber-300 font-black">
                                Slip: ${slipAmt.toFixed(2)}
                              </span>
                            </div>

                            {slip.matched_invoice && (
                              <div className="text-right">
                                <span className={`text-[11px] font-mono font-black ${isAmountEqual ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  Inv: ${invTotal.toFixed(2)} {isAmountEqual && '✓'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons Row */}
                      <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-slate-800/80">
                        {isApproved ? (
                          <div className="w-full text-center py-1 text-xs text-emerald-400 font-bold bg-emerald-950/40 rounded-xl border border-emerald-800/40">
                            ✅ បានប្តូរទៅជា [Paid / បង់រួច] រួចរាល់
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={!slip.matched_invoice || isApproving}
                              onClick={() => handleApproveSingle(slip)}
                              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-40 text-slate-950 font-black text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              {isApproving ? (
                                <span>⏳ កំពុងកត់ត្រា...</span>
                              ) : (
                                <span>✓ យល់ព្រម Approve កន្ត្រក #{slip.matched_invoice?.basket_no} [Paid]</span>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setManualLinkSlip(slip);
                                setBasketSearchTerm('');
                              }}
                              className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-xs border border-slate-700 cursor-pointer"
                              title="ប្តូរកន្ត្រក"
                            >
                              🔄
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRejectSlip(slip.id)}
                              className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 font-bold text-xs border border-slate-700 cursor-pointer"
                              title="លុប"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-slate-400 space-y-2">
              <div className="text-3xl">📥</div>
              <div className="font-bold text-xs text-slate-300">
                មិនទាន់មាន Slips ថ្មី {timeFilter === 'today' ? 'ក្នុងថ្ងៃនេះ (ចាប់ពី 12:00 AM មក)' : ''}
              </div>
              <button
                type="button"
                onClick={handleSyncMessengerNow}
                disabled={isSyncing}
                className="mt-2 py-1.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow cursor-pointer"
              >
                🔄 ទាញយកសារពី Messenger ម្តងទៀត
              </button>
            </div>
          )}
        </div>

        {/* COMPACT STICKY FOOTER */}
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 bg-[#080E1B] border-t border-slate-800 flex items-center justify-between flex-shrink-0 gap-2">
          <div className="text-xs text-slate-400 truncate">
            {matchedCount > 0 ? (
              <span>មាន <strong className="text-emerald-400 font-mono font-bold">{matchedCount}</strong> កន្ត្រកត្រូវ ១០០%</span>
            ) : (
              <span>គ្រប់ Slips ផ្ទៀងផ្ទាត់រួចរាល់</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              បិទ
            </button>

            {matchedCount > 0 && (
              <button
                type="button"
                onClick={handleConfirmAllMatched}
                disabled={isConfirmingAll}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/30 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
              >
                <span>{isConfirmingAll ? '⏳...' : `✅ Bulk Approve ទាំងអស់ (${matchedCount})`}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Manual Basket Linker Dialog */}
      {manualLinkSlip && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl max-w-md w-full p-4 space-y-3 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-[10px] text-white font-black">f</span>
                <span>🔍 ភ្ជាប់កន្ត្រកសម្រាប់ FB «{getCustomerDisplayInfo(manualLinkSlip).primaryName}»</span>
              </h3>
              <button onClick={() => setManualLinkSlip(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="text-xs text-slate-300">
              ទឹកប្រាក់ Slip: <strong className="text-amber-300">${manualLinkSlip.extracted.paid_amount || 0}</strong>
            </div>

            <input
              type="text"
              value={basketSearchTerm}
              onChange={e => setBasketSearchTerm(e.target.value)}
              placeholder="វាយលេខកន្ត្រក ឬឈ្មោះ FB (ឧ. 104, Socheata)..."
              className="w-full bg-slate-950 border border-indigo-500/50 rounded-xl px-3 py-2 text-xs text-white outline-none"
              autoFocus
            />

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {isLoadingBaskets ? (
                <div className="text-center py-4 text-xs text-slate-400">កំពុងទាញបញ្ជីកន្ត្រក...</div>
              ) : (
                (() => {
                  const filtered = unpaidBaskets.filter(b => {
                    if (!basketSearchTerm.trim()) return true;
                    const t = basketSearchTerm.toLowerCase().trim();
                    const bNo = String(b.basket_no || '').toLowerCase();
                    const fb = (b.facebook_name || '').toLowerCase();
                    const ph = (b.phone_number || '').toLowerCase();
                    return bNo.includes(t) || fb.includes(t) || ph.includes(t);
                  });

                  if (filtered.length === 0) {
                    return <div className="text-center py-4 text-xs text-slate-500">រកមិនឃើញកន្ត្រកទេ</div>;
                  }

                  return filtered.map((b, bIdx) => (
                    <div
                      key={b.invoice_id || bIdx}
                      onClick={() => handleSelectCandidate(b)}
                      className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-400 flex items-center justify-between cursor-pointer group transition-colors"
                    >
                      <div>
                        <div className="font-bold text-xs text-white group-hover:text-indigo-300">
                          #{b.basket_no} - {b.facebook_name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {b.phone_number && `📞 ${b.phone_number} | `} Live: {b.live_id}
                        </div>
                      </div>
                      <div className="text-right font-mono font-bold text-xs text-emerald-400">
                        ${b.total_amount.toFixed(2)}
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setManualLinkSlip(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-bold text-slate-300"
              >
                បោះបង់
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-70 bg-black/95 flex items-center justify-center p-4 cursor-pointer animate-in fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-slate-700"
            />
            <div className="text-xs text-slate-400 mt-2 bg-slate-900/90 px-3 py-1 rounded-full border border-slate-800">
              ចុចកន្លែងណាក៏បានដើម្បីបិទរូបធំ
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
