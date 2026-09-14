import { useState, useEffect } from 'react';
import { playSuccessFanfare, playWarningBuzzer } from '../../utils/audio';

interface DispatchReportData {
  total: number;
  pp_count: number;
  province_count: number;
  today_live_count: number;
  old_live_count: number;
  packer_stats: Record<string, number>;
  items: {
    invoice_id: number;
    basket_no: number | string;
    facebook_name: string;
    phone_number: string;
    cust_address: string;
    location_zone: string;
    total_amount: number;
    packer_name: string;
    packed_at: string;
  }[];
}

interface DispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export function DispatchModal({ isOpen, onClose, onShowToast }: DispatchModalProps) {
  const [data, setData] = useState<DispatchReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sendingTelegram, setSendingTelegram] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dispatched_today_report');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendTelegram = async () => {
    if (!data || data.total === 0) {
      onShowToast('⚠️ មិនទាន់មានកញ្ចប់ចេញដឹកនៅឡើយទេ!', 'error');
      return;
    }

    setSendingTelegram(true);
    onShowToast('⏳ កំពុងផ្ញើរបាយការណ៍ទៅ Telegram...');

    try {
      const res = await fetch('/api/send_telegram_dispatch_report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (result.success) {
        playSuccessFanfare();
        onShowToast(`✅ បានបាញ់របាយការណ៍ ${data.total} កញ្ចប់ទៅកាន់ Telegram រួចរាល់!`);
      } else {
        playWarningBuzzer();
        onShowToast(`❌ មិនអាចផ្ញើបានទេ ៖ ${result.error || result.message}`, 'error');
      }
    } catch (e) {
      playWarningBuzzer();
      onShowToast('⚠️ ដាច់សេវា WiFi!', 'error');
    } finally {
      setSendingTelegram(false);
    }
  };

  const filteredItems = (data?.items || []).filter(it => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(it.basket_no).includes(q) ||
      it.facebook_name.toLowerCase().includes(q) ||
      it.phone_number.includes(q) ||
      it.cust_address.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0B1426] border-2 border-emerald-500 rounded-2xl w-full max-w-[480px] max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-3 bg-gradient-to-r from-emerald-950 to-emerald-900 border-b-[1.5px] border-emerald-500 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚀</span>
            <div>
              <div className="font-black text-emerald-300 text-[14.5px]">ផ្ទៀងផ្ទាត់កញ្ចប់ចេញដឹកថ្ងៃនេះ</div>
              <div className="text-[11px] text-emerald-400 font-semibold tracking-wider">
                KARI ARNETT DAILY DISPATCH AUDIT
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-3 bg-[#070D1B] flex flex-col gap-2.5 overflow-hidden flex-1">
          {/* Summary Box */}
          <div className="bg-slate-900/95 border-[1.5px] border-emerald-500/35 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <div className="text-sm font-black text-white">
                🚚 សរុបចេញដឹក ៖{' '}
                <span className="text-emerald-400 text-lg font-mono font-black">{data?.total || 0}</span> កញ្ចប់
              </div>
              <div className="text-xs text-slate-300 font-extrabold">
                🏙️ ភ្នំពេញ ៖ <strong className="text-sky-400">{data?.pp_count || 0}</strong> | 🏞️ ខេត្ត ៖{' '}
                <strong className="text-amber-400">{data?.province_count || 0}</strong>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs text-emerald-300 font-bold">
              <span>
                🎥 Live ថ្ងៃនេះ ៖ <strong className="text-white">{data?.today_live_count || 0}</strong>
              </span>
              <span>
                ⏳ សល់ពីម្សិលមិញ ៖ <strong className="text-amber-200">{data?.old_live_count || 0}</strong>
              </span>
            </div>
          </div>

          {/* Telegram Button */}
          <button
            onClick={handleSendTelegram}
            disabled={sendingTelegram}
            className="bg-gradient-to-r from-sky-600 to-sky-700 text-white border-[1.5px] border-sky-400 p-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(2,132,199,0.4)] active:scale-98 transition-all disabled:opacity-50"
          >
            <span>{sendingTelegram ? '⏳ កំពុងផ្ញើ...' : '✈️ ផ្ញើរបាយការណ៍ទៅ Telegram (១ ឃ្លីក)'}</span>
          </button>

          {/* Search Box */}
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 វាយរកឈ្មោះ, លេខទូរស័ព្ទ, ឬកន្ត្រក #..."
            className="bg-slate-900 border-[1.5px] border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-400"
          />

          {/* List */}
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[46vh] pr-1">
            {loading ? (
              <div className="text-center py-8 text-slate-400 text-sm">⏳ កំពុងទាញបញ្ជី...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">🎉 មិនទាន់មានកញ្ចប់ចេញដឹកនៅឡើយទេ។</div>
            ) : (
              filteredItems.map(d => {
                const zone = (d.location_zone || 'PP').toUpperCase();
                return (
                  <div
                    key={d.invoice_id}
                    className="bg-[#0B1426] border border-slate-800 border-l-4 border-l-emerald-500 p-2.5 rounded-xl flex flex-col gap-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sky-400 font-black font-mono text-sm">#{d.basket_no}</span>
                        <strong className="text-white text-xs truncate max-w-[160px]">{d.facebook_name}</strong>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          zone === 'PP' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-amber-950 text-amber-200 border border-amber-700'
                        }`}
                      >
                        {zone === 'PP' ? '🏙️ ភ្នំពេញ' : '🏞️ ខេត្ត'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span className="truncate max-w-[220px]">
                        📞 {d.phone_number} ‧ 📍 {d.cust_address}
                      </span>
                      <span className="text-amber-400 font-black font-mono">${d.total_amount.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-slate-500 border-t border-white/5 pt-1.5">
                      <span>
                        👤 អ្នកច្រក ៖ <strong className="text-emerald-300">{d.packer_name}</strong>
                      </span>
                      <span>
                        ⏰ ម៉ោង ៖ <strong className="text-sky-400">{d.packed_at.slice(11, 16) || '--:--'}</strong>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
