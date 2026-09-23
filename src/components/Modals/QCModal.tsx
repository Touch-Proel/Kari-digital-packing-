import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Invoice, Product } from '../../types';
import { playSuccessFanfare, playPureTone } from '../../utils/audio';

interface QCModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  packerName: string;
  productMap?: Record<string, Product>;
  onOpenZoomModal?: (
    code: string,
    name: string,
    imageUrl?: string,
    price?: number,
    stockQty?: number,
    items?: { code: string; name: string; imageUrl?: string; price?: number; stockQty?: number; isChecked?: boolean }[],
    index?: number,
    invoiceId?: number
  ) => void;
  onDispatchSuccess: (invoiceId: number) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export function QCModal({
  isOpen,
  onClose,
  invoice,
  packerName,
  productMap,
  onOpenZoomModal,
  onDispatchSuccess,
  onShowToast
}: QCModalProps) {
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (invoice) {
      // By default all items start verified in QC review
      const initial: Record<string, boolean> = {};
      invoice.items.forEach(it => {
        initial[it.product_code] = true;
      });
      setVerifiedMap(initial);
    }
  }, [invoice]);

  if (!isOpen || !invoice) return null;

  const toggleItem = (code: string) => {
    setVerifiedMap(prev => {
      const next = { ...prev, [code]: !prev[code] };
      playPureTone(next[code] ? 880 : 400, 0.05);
      return next;
    });
  };

  const handleExecuteDispatch = async () => {
    try {
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      playSuccessFanfare();

      const res = await fetch('/api/dispatch_pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          packer_name: packerName
        })
      });

      const data = await res.json();
      if (data.success) {
        onShowToast(`🚀 កញ្ចប់ #${invoice.basket_no || invoice.invoice_id} បិទស្កុតចេញដឹកជោគជ័យ!`);
        onDispatchSuccess(invoice.invoice_id);
        onClose();
      } else {
        onShowToast(data.error || 'បរាជ័យក្នុងការបិទស្កុត', 'error');
      }
    } catch (e) {
      onShowToast('⚠️ ដាច់សេវា WiFi!', 'error');
    }
  };

  const allVerified = invoice.items.every(it => verifiedMap[it.product_code]);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0B1426] border-[1.5px] border-[#1C2B4B] rounded-2xl w-full max-w-[440px] max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-3.5 bg-[#0D281E] border-b-[1.5px] border-emerald-500 flex justify-between items-center">
          <div>
            <div className="text-[14.5px] font-black text-emerald-400">
              🔍 ផ្ទៀងផ្ទាត់កន្ត្រក #{invoice.basket_no || invoice.invoice_id} — {invoice.facebook_name}
            </div>
            <div className="text-[11.5px] text-emerald-200 mt-0.5">
              💰 បង់រួច ៖ ${invoice.total_amount.toFixed(2)} | ធនាគារ ABA/KHQR
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Body Items List */}
        <div className="p-3 overflow-y-auto flex flex-col gap-2.5 max-h-[60vh]">
          {(invoice.items || []).map((it, idx) => {
            const isVerified = verifiedMap[it.product_code] ?? true;
            const codeUpper = (it.product_code || '').trim().toUpperCase();
            const prod = productMap ? productMap[codeUpper] : undefined;
            const displayImage = it.image_file && it.image_file.trim() !== '' ? it.image_file : prod?.image_file;

            return (
              <div
                key={it.id || `${it.product_code}-${idx}`}
                onClick={() => toggleItem(it.product_code)}
                className={`p-2.5 rounded-2xl flex gap-3 items-center cursor-pointer transition-all border ${
                  isVerified
                    ? 'bg-emerald-950/20 border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                    : 'bg-slate-900/60 border-slate-700'
                }`}
              >
                {/* Product Thumbnail with Image */}
                <div
                  className="w-16 h-16 min-w-16 min-h-16 rounded-xl bg-slate-950 border-2 border-slate-700 hover:border-cyan-400 flex-shrink-0 flex items-center justify-center overflow-hidden relative cursor-pointer group shadow-sm transition-all"
                  onClick={e => {
                    if (displayImage && onOpenZoomModal && invoice) {
                      e.stopPropagation();
                      const allQcZoomItems = (invoice.items || []).map(item => {
                        const p = productMap ? (productMap[item.product_code.toUpperCase()] || productMap[item.product_code]) : undefined;
                        const img = (item.image_file && item.image_file.trim() !== '') ? item.image_file : (p?.image_file || item.image_url || p?.image_url || '');
                        return {
                          code: item.product_code,
                          name: item.product_name || p?.name || `កូដ ${item.product_code}`,
                          imageUrl: img,
                          price: item.price !== undefined ? item.price : p?.price,
                          stockQty: p?.stock_qty,
                          isChecked: !!verifiedMap[item.product_code]
                        };
                      });
                      onOpenZoomModal(
                        it.product_code,
                        it.product_name || prod?.name || `កូដ ${it.product_code}`,
                        displayImage,
                        it.price,
                        prod?.stock_qty,
                        allQcZoomItems,
                        idx,
                        invoice.invoice_id
                      );
                    }
                  }}
                  title={displayImage ? 'ចុចដើម្បីពង្រីកមើលរូបធំ' : undefined}
                >
                  {displayImage ? (
                    <img
                      src={displayImage}
                      alt={it.product_code}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-[#06101E] text-slate-400 p-1 text-center">
                      <span className="font-mono text-cyan-400 font-bold text-xs">[{it.product_code}]</span>
                      <span className="text-[9px] text-slate-500 mt-0.5">គ្មានរូប</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="bg-blue-900/80 text-sky-400 px-1.5 py-0.5 rounded text-xs font-mono font-bold border border-blue-600">
                      [{it.product_code}]
                    </span>
                    <strong className="text-white text-sm truncate">{it.product_name}</strong>
                  </div>
                  <div className="text-amber-400 font-extrabold text-sm mt-1 font-mono">
                    ${it.price.toFixed(2)} ‧ ចំនួន {it.quantity}
                  </div>
                  {it.item_comment && (
                    <div className="text-amber-200 text-xs mt-0.5 truncate font-medium">
                      ↳ Note: "{it.item_comment}"
                    </div>
                  )}
                </div>

                <div
                  className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center font-black text-lg transition-all ${
                    isVerified
                      ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                      : 'border-slate-600 text-transparent'
                  }`}
                >
                  ✓
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 bg-slate-900/90 border-t border-slate-800">
          <button
            onClick={handleExecuteDispatch}
            disabled={!allVerified}
            className={`w-full h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
              allVerified
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-black shadow-[0_4px_22px_rgba(16,185,129,0.45)] hover:brightness-110 active:scale-98'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            🚀 ផ្ទៀងត្រូវ ១០០% ➔ បិទស្កុតចេញដឹក (Ship Out)
          </button>
        </div>
      </div>
    </div>
  );
}
