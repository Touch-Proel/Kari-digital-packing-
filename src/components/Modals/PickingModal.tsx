import { useState, useEffect, useCallback } from 'react';
import { PickingItem } from '../../types';
import { playPureTone, playWarningBuzzer } from '../../utils/audio';

interface PickingModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveId: string;
  onStockUpdated?: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'error') => void;
}

export function PickingModal({
  isOpen,
  onClose,
  liveId,
  onStockUpdated,
  onShowToast
}: PickingModalProps) {
  const [items, setItems] = useState<PickingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<PickingItem | null>(null);
  const [alsoRemoveFromBaskets, setAlsoRemoveFromBaskets] = useState(true);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const fetchPickingList = useCallback(() => {
    setLoading(true);
    fetch(`/api/picking_list?live_id=${encodeURIComponent(liveId)}`)
      .then(res => res.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [liveId]);

  useEffect(() => {
    if (isOpen) {
      fetchPickingList();
      setConfirmDeleteTarget(null);
    }
  }, [isOpen, fetchPickingList]);

  if (!isOpen) return null;

  const totalQuantityNeeded = items.reduce((sum, it) => sum + it.total_qty, 0);

  const handleConfirmDelete = async () => {
    if (!confirmDeleteTarget) return;

    setDeletingLoading(true);
    try {
      const res = await fetch('/api/delete_product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: confirmDeleteTarget.code,
          remove_from_baskets: alsoRemoveFromBaskets,
          live_id: liveId
        })
      });

      const data = await res.json();
      if (data.success) {
        playPureTone(420, 0.1);
        if (onShowToast) {
          onShowToast(data.message || `🗑️ បានលុបកូដ [${confirmDeleteTarget.code}] ចេញពីស្តុកជោគជ័យ!`, 'success');
        }
        if (onStockUpdated) {
          onStockUpdated();
        }
        // Refresh local picking list
        fetchPickingList();
        setConfirmDeleteTarget(null);
      } else {
        playWarningBuzzer();
        if (onShowToast) {
          onShowToast(data.error || 'មិនអាចលុបកូដនេះបានទេ', 'error');
        }
      }
    } catch (e) {
      playWarningBuzzer();
      if (onShowToast) {
        onShowToast('⚠️ ដាច់សេវា WiFi / បរាជ័យក្នុងការតភ្ជាប់', 'error');
      }
    } finally {
      setDeletingLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0B1426] border-[1.5px] border-emerald-500 rounded-2xl w-full max-w-[460px] max-h-[88vh] flex flex-col overflow-hidden shadow-2xl relative">
        {/* Header */}
        <div className="p-3.5 bg-[#064E3B] border-b-[1.5px] border-emerald-500 flex justify-between items-center shrink-0">
          <div>
            <div className="text-emerald-300 text-[14.5px] font-black flex items-center gap-1.5">
              <span>📋</span>
              <span>បញ្ជីប្រមូលអីវ៉ាន់ឃ្លាំង (Picking List)</span>
            </div>
            <div className="text-emerald-100 text-xs mt-0.5">
              សរុប <span className="font-bold text-white font-mono">{totalQuantityNeeded}</span> ឈុត ‧ (កូដត្រូវការច្រើនជាងគេនៅលើ)
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* List Content */}
        <div className="p-3 overflow-y-auto flex flex-col gap-2 max-h-[68vh] bg-[#070D1B]">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">⏳ កំពុងទាញយក...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">🎉 គ្មានទំនិញត្រូវការប្រមូលក្នុង Live នេះឡើយ។</div>
          ) : (
            items.map((it, idx) => (
              <div
                key={it.code}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 p-2.5 rounded-xl flex justify-between items-center transition-colors shadow-sm gap-2"
              >
                {/* Item Code & Name */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-slate-500 font-mono text-xs w-5 shrink-0">#{idx + 1}</span>
                  <span className="bg-blue-900/80 text-sky-300 px-2 py-0.5 rounded text-xs font-mono font-black border border-blue-600 shrink-0">
                    [{it.code}]
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-white truncate max-w-[120px] sm:max-w-[160px]" title={it.product_name}>
                    {it.product_name}
                  </span>
                </div>

                {/* Price, Quantity, & Delete from Stock Button */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <span className="text-amber-400 font-mono text-xs font-bold">${it.price.toFixed(2)}</span>
                  <span className="bg-emerald-700 text-white px-2 py-1 rounded-lg font-black text-xs font-mono shadow-sm whitespace-nowrap">
                    {it.total_qty} ឈុត
                  </span>

                  {/* Button delete code from stock */}
                  <button
                    onClick={() => {
                      setConfirmDeleteTarget(it);
                      setAlsoRemoveFromBaskets(true);
                    }}
                    className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-600/50 hover:border-rose-500 text-rose-300 hover:text-rose-100 flex items-center justify-center transition-all active:scale-95 shadow-sm text-xs cursor-pointer ml-0.5"
                    title={`លុបកូដ [${it.code}] ចេញពីស្តុក (Delete code from stock)`}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Confirmation Modal for Deleting Code from Stock */}
        {confirmDeleteTarget && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-fadeIn">
            <div className="bg-[#0F172A] border-2 border-rose-500 rounded-2xl p-4 w-full max-w-[380px] shadow-[0_0_35px_rgba(244,63,94,0.35)] flex flex-col gap-3">
              <div className="flex items-center gap-2 text-rose-400 font-black text-sm sm:text-base border-b border-slate-800 pb-2">
                <span className="text-lg">🗑️</span>
                <span>លុបកូដទំនិញចេញពីស្តុក</span>
              </div>

              <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">កូដទំនិញ:</span>
                  <span className="text-sky-300 font-mono font-black bg-blue-950 px-2 py-0.5 rounded border border-blue-700">
                    [{confirmDeleteTarget.code}]
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ឈ្មោះទំនិញ:</span>
                  <span className="text-white font-bold truncate max-w-[180px]">
                    {confirmDeleteTarget.product_name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ស្ថានភាពក្នុងស្តុក:</span>
                  <span className={confirmDeleteTarget.exists_in_stock ? 'text-emerald-400 font-mono font-bold' : 'text-amber-400'}>
                    {confirmDeleteTarget.exists_in_stock 
                      ? `មានក្នុងស្តុក (${confirmDeleteTarget.stock_qty ?? 0} ឈុត)` 
                      : '⚠️ មិនទាន់មានក្នុងតារាងស្តុក'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ចំនួនកំពុងកម្ម៉ង់ក្នុង Live:</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {confirmDeleteTarget.total_qty} ឈុត
                  </span>
                </div>
              </div>

              <label className="flex items-start gap-2.5 bg-rose-950/40 border border-rose-800/60 p-2.5 rounded-xl cursor-pointer hover:bg-rose-950/60 transition-colors">
                <input
                  type="checkbox"
                  checked={alsoRemoveFromBaskets}
                  onChange={e => setAlsoRemoveFromBaskets(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-rose-600 bg-slate-900 border-slate-700 rounded focus:ring-rose-500 cursor-pointer"
                />
                <div className="text-xs text-rose-200 leading-tight">
                  <span className="font-bold">ដកចេញពីកន្ត្រក Live ទាំងអស់</span>
                  <p className="text-[11px] text-rose-300/80 mt-0.5">
                    លុបមុខទំនិញនេះចេញពីកន្ត្រកអតិថិជន និងគណនាតម្លៃសរុបឡើងវិញ
                  </p>
                </div>
              </label>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDeleteTarget(null);
                    setAlsoRemoveFromBaskets(true);
                  }}
                  disabled={deletingLoading}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
                >
                  បោះបង់
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deletingLoading}
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all shadow-lg shadow-rose-600/30 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {deletingLoading ? (
                    <span>⏳ កំពុងលុប...</span>
                  ) : (
                    <>
                      <span>🗑️</span>
                      <span>លុបចេញពីស្តុក</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
