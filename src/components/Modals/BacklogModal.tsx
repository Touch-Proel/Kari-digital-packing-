import React, { useState, useEffect } from 'react';
import { Invoice } from '../../types';
import { playSuccessFanfare, playWarningBuzzer } from '../../utils/audio';

interface BacklogModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLiveId: string;
  refreshKey?: number;
  onOpenQCModal: (inv: Invoice) => void;
  onOpenReceiptModal: (inv: Invoice) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'warning') => void;
  onRefreshAll?: () => void;
}

export function BacklogModal({
  isOpen,
  onClose,
  currentLiveId,
  refreshKey,
  onOpenQCModal,
  onOpenReceiptModal,
  onShowToast,
  onRefreshAll
}: BacklogModalProps) {
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summaryByLive, setSummaryByLive] = useState<Record<string, { count: number; total_amount: number }>>({});
  const [selectedLiveFilter, setSelectedLiveFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dispatchingId, setDispatchingId] = useState<number | null>(null);

  const fetchBacklog = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/backlog_invoices?current_live_id=${encodeURIComponent(currentLiveId)}&t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setInvoices(json.invoices || []);
          setSummaryByLive(json.summary_by_live || {});
        }
      }
    } catch (e) {
      onShowToast('⚠️ ដាច់សេវា Server មិនអាចទាញទិន្នន័យបាន!', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBacklog();
    }
  }, [isOpen, currentLiveId, refreshKey]);

  if (!isOpen) return null;

  const handleDispatchDirect = async (inv: Invoice) => {
    setDispatchingId(inv.invoice_id);
    try {
      const res = await fetch('/api/dispatch_pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: inv.invoice_id,
          packer_name: 'អ្នកគ្រប់គ្រង (Backlog Dispatch)'
        })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast(`✅ បានចេញដឹកកន្ត្រក #${inv.basket_no || inv.invoice_id} របស់ ${inv.facebook_name} ជោគជ័យ!`);
        // Remove locally
        setInvoices(prev => prev.filter(i => i.invoice_id !== inv.invoice_id));
        if (onRefreshAll) onRefreshAll();
      } else {
        playWarningBuzzer();
        onShowToast(`❌ មិនអាចចេញដឹកបានទេ ៖ ${data.error || data.message}`, 'error');
      }
    } catch (e) {
      playWarningBuzzer();
      onShowToast('⚠️ បរាជ័យក្នុងការភ្ជាប់បណ្តាញ!', 'error');
    } finally {
      setDispatchingId(null);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (selectedLiveFilter !== 'ALL' && inv.live_id !== selectedLiveFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        String(inv.basket_no).includes(q) ||
        String(inv.invoice_id).includes(q) ||
        inv.facebook_name.toLowerCase().includes(q) ||
        inv.phone_number.includes(q) ||
        (inv.live_id && inv.live_id.toLowerCase().includes(q)) ||
        inv.items.some(it => it.product_code.toLowerCase().includes(q) || it.product_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalAmount = filteredInvoices.reduce((s, i) => s + i.total_amount, 0);
  const liveIds = Object.keys(summaryByLive);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[80000] flex items-center justify-center p-2.5 sm:p-4 animate-fadeIn">
      <div className="bg-[#0B1325] border-2 border-rose-500/80 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-[0_0_40px_rgba(244,63,94,0.3)]">
        {/* Header */}
        <div className="p-3.5 bg-gradient-to-r from-rose-950 via-red-950 to-[#0B1325] border-b-[1.5px] border-rose-500/60 flex justify-between items-center">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-xl flex-shrink-0 animate-bounce">
              🚨
            </span>
            <div className="flex flex-col text-left min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-rose-200 text-sm sm:text-base truncate">
                  ឥវ៉ាន់សល់ពី Live ចាស់ៗមិនទាន់ចេញដឹក
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono font-black text-xs">
                  {invoices.length} នាក់
                </span>
              </div>
              <span className="text-[11px] text-rose-300/80 font-medium">
                កញ្ចប់បង់លុយរួច តែនៅសល់មិនទាន់ចេញដឹក ‧ មិនឱ្យភ្លេចភ្ញៀវណាឡើយ
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800/90 text-white font-bold flex items-center justify-center hover:bg-slate-700 border border-slate-700 flex-shrink-0 ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Live Filter Chips (if more than 1 live) */}
        {liveIds.length > 0 && (
          <div className="p-2.5 bg-[#070D1B] border-b border-rose-500/20 flex gap-2 overflow-x-auto scrollbar-none items-center">
            <button
              onClick={() => setSelectedLiveFilter('ALL')}
              className={`py-1.5 px-3 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${
                selectedLiveFilter === 'ALL'
                  ? 'bg-rose-600 border-rose-400 text-white shadow-md'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              🌐 ទាំងអស់ ({invoices.length})
            </button>
            {liveIds.map(lid => (
              <button
                key={lid}
                onClick={() => setSelectedLiveFilter(lid)}
                className={`py-1.5 px-3 rounded-xl text-xs font-black whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                  selectedLiveFilter === lid
                    ? 'bg-rose-600 border-rose-400 text-white shadow-md'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <span>🔴 Live #{lid.slice(-6)}</span>
                <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">
                  {summaryByLive[lid]?.count || 0}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Search Bar */}
        <div className="p-2.5 bg-[#0B1325] border-b border-slate-800 flex gap-2 items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 ស្វែងរកឈ្មោះភ្ញៀវ, លេខទូរស័ព្ទ, កូដទំនិញ..."
            className="flex-1 bg-slate-900/90 border border-slate-700 text-white px-3 py-2 rounded-xl text-xs outline-none focus:border-rose-400 font-medium"
          />
          <button
            onClick={fetchBacklog}
            disabled={loading}
            className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1 border border-slate-700 active:scale-95 transition-all cursor-pointer"
            title="ទាញទិន្នន័យឡើងវិញ"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* List of Invoices */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
          {loading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
              <span className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></span>
              <span className="text-xs font-medium">កំពុងស្កេនរកកន្ត្រកសល់ពី Live ចាស់ៗ...</span>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
              <span className="text-5xl">🎉</span>
              <div className="font-black text-emerald-400 text-base">
                អស្ចារ្យណាស់! គ្មានឥវ៉ាន់សល់ពី Live ចាស់ៗទេ
              </div>
              <div className="text-xs text-slate-400 max-w-sm">
                រាល់កញ្ចប់ដែលភ្ញៀវបង់លុយរួចពី Live មុនៗ ត្រូវបានផ្ទៀងផ្ទាត់ និងចេញដឹកអស់ ១០០% ហើយ!
              </div>
            </div>
          ) : (
            filteredInvoices.map(inv => {
              const totalQty = (inv.items || []).reduce((s, it) => s + it.quantity, 0);
              return (
                <div
                  key={inv.invoice_id}
                  className="bg-[#070D1B] border border-rose-500/40 hover:border-rose-400/80 rounded-2xl p-3 flex flex-col gap-2.5 shadow-md transition-all"
                >
                  {/* Top line: Basket & Live Tag & Customer */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-1 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 font-mono font-black text-xs shadow-inner">
                        កន្ត្រក #{inv.basket_no || inv.invoice_id}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-rose-300 font-mono text-[10.5px] border border-slate-700">
                        Live #{inv.live_id?.slice(-6) || 'OLD'}
                      </span>
                      <span className="font-black text-white text-xs sm:text-sm truncate">
                        {inv.facebook_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-mono font-bold text-xs">
                        ${inv.total_amount.toFixed(2)}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                        {inv.location_label || (inv.location_zone === 'PP' ? '🏙️ ភ្នំពេញ' : '🏞️ តាមខេត្ត')}
                      </span>
                    </div>
                  </div>

                  {/* Customer phone and address */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                    <span>📞 {inv.phone_number || 'មិនទាន់មានលេខ'}</span>
                    <span className="truncate max-w-[200px]">{inv.address || 'មិនទាន់មានអាសយដ្ឋាន'}</span>
                  </div>

                  {/* Items summary */}
                  <div className="bg-slate-900/80 rounded-xl p-2 border border-slate-800 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10.5px] text-slate-400 font-medium mr-1">
                      ទំនិញ ({totalQty} មុខ) ៖
                    </span>
                    {(inv.items || []).map((it, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-lg bg-[#0B1325] border border-cyan-500/30 text-cyan-200 text-[11px] font-mono font-bold flex items-center gap-1"
                      >
                        <span>{it.product_code}</span>
                        {it.quantity > 1 && <span className="text-amber-400">x{it.quantity}</span>}
                      </span>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => onOpenQCModal(inv)}
                      className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                    >
                      <span>🔍</span>
                      <span>ផ្ទៀងរូប QC</span>
                    </button>

                    <button
                      type="button"
                      disabled={dispatchingId === inv.invoice_id}
                      onClick={() => handleDispatchDirect(inv)}
                      className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <span>🚀</span>
                      <span>
                        {dispatchingId === inv.invoice_id ? 'កំពុងចេញដឹក...' : 'បិទស្កុតចេញដឹក'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenReceiptModal(inv)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                      title="ព្រីនវិក្កយបត្រ"
                    >
                      <span>🖨️</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#070D1B] border-t border-slate-800 flex justify-between items-center text-xs">
          <div className="text-slate-400">
            សរុប ៖ <span className="font-mono font-black text-rose-300">{filteredInvoices.length} កញ្ចប់</span>
            {' ‧ '}
            <span className="font-mono font-bold text-emerald-400">${totalAmount.toFixed(2)}</span>
          </div>
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all cursor-pointer"
          >
            បិទ
          </button>
        </div>
      </div>
    </div>
  );
}
