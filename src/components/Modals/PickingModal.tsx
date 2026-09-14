import { useState, useEffect } from 'react';
import { PickingItem } from '../../types';

interface PickingModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveId: string;
}

export function PickingModal({ isOpen, onClose, liveId }: PickingModalProps) {
  const [items, setItems] = useState<PickingItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch(`/api/picking_list?live_id=${encodeURIComponent(liveId)}`)
        .then(res => res.json())
        .then(data => setItems(data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, liveId]);

  if (!isOpen) return null;

  const totalQuantityNeeded = items.reduce((sum, it) => sum + it.total_qty, 0);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0B1426] border-[1.5px] border-emerald-500 rounded-2xl w-full max-w-[440px] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-3.5 bg-[#064E3B] border-b-[1.5px] border-emerald-500 flex justify-between items-center">
          <div>
            <div className="text-emerald-300 text-[14.5px] font-black">📋 បញ្ជីប្រមូលអីវ៉ាន់ឃ្លាំង (Picking List)</div>
            <div className="text-emerald-100 text-xs mt-0.5">
              សរុប {totalQuantityNeeded} ឈុត ‧ (កូដត្រូវការច្រើនជាងគេនៅលើ)
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="p-3 overflow-y-auto flex flex-col gap-2 max-h-[65vh] bg-[#070D1B]">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">⏳ កំពុងទាញយក...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">🎉 គ្មានទំនិញត្រូវការប្រមូលក្នុង Live នេះឡើយ។</div>
          ) : (
            items.map((it, idx) => (
              <div
                key={it.code}
                className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl flex justify-between items-center"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-mono text-xs w-4">#{idx + 1}</span>
                  <span className="bg-blue-900/80 text-sky-400 px-2 py-0.5 rounded text-xs font-mono font-black border border-blue-600">
                    [{it.code}]
                  </span>
                  <span className="font-bold text-sm text-white truncate max-w-[180px]">{it.product_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-mono text-xs font-bold">${it.price.toFixed(2)}</span>
                  <span className="bg-emerald-700 text-white px-2.5 py-1 rounded-lg font-black text-xs font-mono shadow-sm">
                    {it.total_qty} ឈុត
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
