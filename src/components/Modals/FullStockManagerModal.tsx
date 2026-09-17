import React, { useState, useMemo, useEffect } from 'react';
import { Product } from '../../types';
import { playPureTone, playSuccessFanfare, playWarningBuzzer } from '../../utils/audio';

interface FullStockManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProductToEdit: (p: Product) => void;
  onOpenAddNewStock: () => void;
  onOpenStockSync: (tab?: 'telegram' | 'paste' | 'file' | 'export') => void;
  onStockUpdated: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoomModal: (
    code: string,
    name?: string,
    imageUrl?: string,
    price?: number,
    stockQty?: number
  ) => void;
}

export function FullStockManagerModal({
  isOpen,
  onClose,
  products,
  onSelectProductToEdit,
  onOpenAddNewStock,
  onOpenStockSync,
  onStockUpdated,
  onShowToast,
  onOpenZoomModal
}: FullStockManagerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'IN_STOCK' | 'LOW' | 'OUT'>('ALL');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [updatingCode, setUpdatingCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const checkSyncStatus = () => {
      fetch('/api/telegram/auto_sync')
        .then(res => res.json())
        .then(data => {
          if (data && typeof data.enabled === 'boolean') {
            setAutoSyncEnabled(data.enabled);
          }
        })
        .catch(() => {});
    };
    checkSyncStatus();
  }, [isOpen]);

  const outCount = useMemo(() => products.filter(p => p.stock_qty <= 0).length, [products]);
  const lowCount = useMemo(() => products.filter(p => p.stock_qty > 0 && p.stock_qty <= 5).length, [products]);
  const inStockCount = useMemo(() => products.filter(p => p.stock_qty > 5).length, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchCode = (p.code || '').toLowerCase().includes(q);
        const matchName = (p.name || '').toLowerCase().includes(q);
        if (!matchCode && !matchName) return false;
      }

      if (filterTab === 'OUT') return p.stock_qty <= 0;
      if (filterTab === 'LOW') return p.stock_qty > 0 && p.stock_qty <= 5;
      if (filterTab === 'IN_STOCK') return p.stock_qty > 5;
      return true;
    });
  }, [products, searchQuery, filterTab]);

  // Quick adjust stock quantity (+1, -1, +10, etc.)
  const handleQuickAdjustStock = async (p: Product, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newQty = Math.max(0, (p.stock_qty ?? 0) + delta);
    setUpdatingCode(p.code);
    try {
      const res = await fetch('/api/update_product_stock_price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: p.code,
          name: p.name || `កូដ ${p.code}`,
          stock_qty: newQty,
          price: p.price ?? 0,
          image_file: p.image_file || ''
        })
      });
      const data = await res.json();
      if (data.success) {
        playPureTone(600 + delta * 15, 0.04);
        onStockUpdated();
      } else {
        playWarningBuzzer();
        onShowToast('មិនអាចកែប្រែចំនួនស្តុកបានទេ', 'error');
      }
    } catch (err) {
      onShowToast('⚠️ បញ្ហាបណ្តាញ WiFi!', 'error');
    } finally {
      setUpdatingCode(null);
    }
  };

  // Delete product with confirmation
  const handleDeleteProduct = async (p: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`តើអ្នកពិតជាចង់លុបកូដ [${p.code}] ចេញពីស្តុកមែនទេ?`)) return;

    setDeletingCode(p.code);
    try {
      const res = await fetch('/api/delete_product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: p.code })
      });
      const data = await res.json();
      if (data.success) {
        playPureTone(400, 0.08);
        onShowToast(`🗑️ បានលុបកូដ [${p.code}] ចេញពីស្តុកជោគជ័យ!`);
        onStockUpdated();
      } else {
        playWarningBuzzer();
        onShowToast(data.error || 'មិនអាចលុបកូដនេះបានទេ', 'error');
      }
    } catch (e) {
      playWarningBuzzer();
      onShowToast('⚠️ ដាច់សេវា WiFi!', 'error');
    } finally {
      setDeletingCode(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-[#0B1528] border border-[#0284C7]/60 w-full max-w-4xl h-[94vh] rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Top Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-gradient-to-r from-[#0C1E38] via-[#0F294E] to-[#0C1E38] border-b border-sky-700/50 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📦</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                  <span>គ្រប់គ្រងស្តុក LIVE</span>
                  <span className="bg-sky-950 text-cyan-300 border border-sky-500/50 px-2 py-0.5 rounded-lg text-xs font-mono font-bold">
                    {products.length} មុខ
                  </span>
                </h2>
                <span className="text-[11px] text-emerald-400 font-bold hidden xs:flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> REAL-TIME
                </span>
              </div>
              <p className="text-[11px] text-slate-400">ស្វែងរក កែប្រែតម្លៃ ចំនួនស្តុក និងបន្ថែមមុខទំនិញថ្មីៗ</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center justify-center font-bold text-base transition-all cursor-pointer active:scale-95 shadow-md"
              title="បិទ (Close)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Action Toolbar & Search Bar */}
        <div className="p-3 sm:p-4 bg-[#081120] border-b border-slate-800 flex flex-col gap-2.5 flex-shrink-0">
          {/* Row 1: Search & Main Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ស្វែងរកកូដ ឬ ឈ្មោះទំនិញ..."
                className="w-full bg-slate-950/90 border border-sky-700/60 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-sky-200 placeholder-slate-500 outline-none focus:border-cyan-400 font-mono shadow-inner"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs bg-slate-800 rounded-full w-5 h-5 flex items-center justify-center"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Add New Stock Button */}
            <button
              onClick={() => {
                onOpenAddNewStock();
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 transition-all cursor-pointer flex-shrink-0"
            >
              <span>➕</span>
              <span>បន្ថែមស្តុកថ្មី</span>
            </button>

            {/* Telegram Sync */}
            <button
              type="button"
              onClick={() => onOpenStockSync('telegram')}
              className={`px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm border flex-shrink-0 ${
                autoSyncEnabled
                  ? 'bg-sky-950 hover:bg-sky-900 text-cyan-300 border-sky-500/80'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <span>✈️ Telegram</span>
              <span className={`w-2 h-2 rounded-full ${autoSyncEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="font-mono text-[10px]">{autoSyncEnabled ? 'AUTO' : 'OFF'}</span>
            </button>

            {/* Export */}
            <button
              type="button"
              onClick={() => onOpenStockSync('export')}
              className="bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/60 px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm flex-shrink-0"
              title="នាំចេញស្តុកជា CSV (Excel) ឬ Backup"
            >
              <span>📤</span>
              <span className="hidden sm:inline">នាំចេញ</span>
            </button>

            {/* Paste Stock */}
            <button
              type="button"
              onClick={() => onOpenStockSync('paste')}
              className="bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/60 px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm flex-shrink-0"
              title="បិទភ្ជាប់ (Paste) ស្តុកច្រើនមុខក្នុងពេលតែមួយ"
            >
              <span>📋</span>
              <span className="hidden sm:inline">Paste</span>
            </button>
          </div>

          {/* Row 2: Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterTab === 'ALL'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-md'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              ទាំងអស់ ({products.length})
            </button>

            <button
              onClick={() => setFilterTab('IN_STOCK')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterTab === 'IN_STOCK'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                  : 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60'
              }`}
            >
              🟢 នៅសល់ ({inStockCount})
            </button>

            <button
              onClick={() => setFilterTab('LOW')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterTab === 'LOW'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'bg-amber-950/40 text-amber-300 border border-amber-800/60 hover:bg-amber-900/60'
              }`}
            >
              ⚠️ ជិតអស់ ({lowCount})
            </button>

            <button
              onClick={() => setFilterTab('OUT')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterTab === 'OUT'
                  ? 'bg-rose-600 text-white font-black shadow-md'
                  : 'bg-rose-950/40 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60'
              }`}
            >
              🔴 អស់ស្តុក ({outCount})
            </button>
          </div>
        </div>

        {/* Product Cards Grid / List (Scrollable) */}
        <div className="flex-1 p-3 sm:p-5 overflow-y-auto bg-[#070D18]">
          {filteredProducts.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
              <span className="text-4xl">🔍</span>
              <p className="font-bold text-sm">រកមិនឃើញមុខទំនិញតាមការស្វែងរកទេ</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterTab('ALL');
                }}
                className="text-xs text-cyan-400 underline underline-offset-4 mt-1 cursor-pointer"
              >
                បង្ហាញទំនិញទាំងអស់ឡើងវិញ
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredProducts.map((p, idx) => {
                const isOut = (p.stock_qty ?? 0) <= 0;
                const isLow = (p.stock_qty ?? 0) > 0 && (p.stock_qty ?? 0) <= 5;
                const isUpdating = updatingCode === p.code;
                const isDeleting = deletingCode === p.code;

                return (
                  <div
                    key={p.id ? `stock-p-${p.id}` : `stock-code-${p.code || idx}`}
                    className={`bg-[#0B172B] border rounded-2xl p-3 flex gap-3 items-center justify-between transition-all relative shadow-md hover:border-cyan-500/70 group ${
                      isOut
                        ? 'border-rose-800/60 bg-[#160A0D]'
                        : isLow
                        ? 'border-amber-700/60 bg-[#181108]'
                        : 'border-slate-800'
                    }`}
                  >
                    {/* Thumbnail Image (80x80) */}
                    <div
                      className="w-[72px] h-[72px] min-w-[72px] rounded-xl overflow-hidden bg-slate-950 border border-slate-700 flex items-center justify-center cursor-pointer relative group/img flex-shrink-0"
                      onClick={() => onOpenZoomModal(p.code, p.name, p.image_file, p.price, p.stock_qty)}
                      title="ចុចដើម្បីមើលរូបធំ ឬថតរូបទំនិញ"
                    >
                      {p.image_file ? (
                        <img
                          src={p.image_file}
                          alt={p.code}
                          className="w-full h-full object-cover group-hover/img:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-500">
                          <span className="text-xl">📷</span>
                          <span className="text-[9px] text-cyan-400 font-bold">+រូប</span>
                        </div>
                      )}
                    </div>

                    {/* Middle Info: Code, Name, Price & Stock Status */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="bg-[#0C2442] border border-cyan-400/80 text-cyan-300 font-mono font-black text-sm px-2 py-0.5 rounded-lg shadow-sm">
                          [{p.code}]
                        </span>
                        <span className="font-bold text-xs text-white truncate min-w-0 flex-1">
                          {p.name || `កូដ ${p.code}`}
                        </span>
                      </div>

                      {/* Price & Stock Badge */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-amber-400 font-mono font-black text-sm">
                          ${(p.price ?? 0).toFixed(2)}
                        </span>
                        <span
                          className={`text-[10.5px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                            isOut
                              ? 'bg-rose-950 text-rose-300 border-rose-500/60'
                              : isLow
                              ? 'bg-amber-950 text-amber-300 border-amber-500/60'
                              : 'bg-emerald-950 text-emerald-300 border-emerald-500/60'
                          }`}
                        >
                          សល់ {p.stock_qty ?? 0}
                        </span>
                      </div>

                      {/* Quick Stepper Buttons (-1, +1, +10) */}
                      <div className="flex items-center gap-1 mt-1.5">
                        <button
                          type="button"
                          disabled={isUpdating || (p.stock_qty ?? 0) <= 0}
                          onClick={e => handleQuickAdjustStock(p, -1, e)}
                          className="w-6 h-6 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-bold text-xs flex items-center justify-center active:scale-90 transition-all cursor-pointer disabled:opacity-40"
                          title="ដក ១"
                        >
                          -1
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={e => handleQuickAdjustStock(p, 1, e)}
                          className="w-6 h-6 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 font-bold text-xs flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                          title="ថែម ១"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={e => handleQuickAdjustStock(p, 10, e)}
                          className="px-1.5 h-6 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-500/60 font-mono font-bold text-[10px] flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                          title="ថែម ១០"
                        >
                          +10
                        </button>
                      </div>
                    </div>

                    {/* Right Actions: Edit (✏️) & Delete (🗑️) */}
                    <div className="flex flex-col items-center justify-between self-stretch gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProductToEdit(p);
                        }}
                        className="w-8 h-8 rounded-xl bg-sky-950 hover:bg-sky-900 border border-sky-500/70 text-cyan-300 flex items-center justify-center text-xs active:scale-90 transition-all shadow cursor-pointer"
                        title="កែប្រែកូដ តម្លៃ ចំនួន ឬរូបភាព"
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={e => handleDeleteProduct(p, e)}
                        className="w-8 h-8 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-500/50 text-rose-300 flex items-center justify-center text-xs active:scale-90 transition-all shadow cursor-pointer"
                        title="លុបកូដនេះចេញពីស្តុក"
                      >
                        {isDeleting ? '⏳' : '🗑️'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-[#08101E] border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">
            សរុប {filteredProducts.length} / {products.length} មុខទំនិញ
          </span>
          <button
            onClick={onClose}
            className="bg-sky-600 hover:bg-sky-500 text-slate-950 font-black px-6 py-2 rounded-xl text-xs active:scale-95 transition-all cursor-pointer shadow-md"
          >
            រួចរាល់ (Done)
          </button>
        </div>
      </div>
    </div>
  );
}
