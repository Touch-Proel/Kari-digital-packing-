import React, { useState, useMemo, useEffect } from 'react';
import { Product } from '../types';

interface StockDockProps {
  products: Product[];
  onSelectProduct: (p: Product) => void;
  onOpenAddStockPrompt: () => void;
  onOpenStockSync?: (tab?: 'telegram' | 'paste' | 'file' | 'export') => void;
}

export function StockDock({ products, onSelectProduct, onOpenAddStockPrompt, onOpenStockSync }: StockDockProps) {
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const filteredProducts = useMemo(() => {
    const list = products.filter(p => {
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        const matchCode = (p.code || '').toLowerCase().includes(q);
        const matchName = (p.name || '').toLowerCase().includes(q);
        if (!matchCode && !matchName) return false;
      }

      if (filterMode === 'OUT') return p.stock_qty <= 0;
      if (filterMode === 'LOW') return p.stock_qty > 0 && p.stock_qty <= 5;
      return true;
    });

    return [...list].sort((a, b) => {
      const cmp = (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
      return sortAsc ? cmp : -cmp;
    });
  }, [products, filterSearch, filterMode, sortAsc]);

  const outCount = useMemo(() => products.filter(p => p.stock_qty <= 0).length, [products]);
  const lowCount = useMemo(() => products.filter(p => p.stock_qty > 0 && p.stock_qty <= 5).length, [products]);

  return (
    <div className="bg-gradient-to-br from-[#0B192C] to-[#0F2442] border-[1.5px] border-[#0284C7] rounded-2xl p-2.5 flex flex-col gap-2 shadow-lg">
      {/* Header Row */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="text-xs font-black text-sky-400 flex items-center gap-2">
          <span>📦 គ្រប់គ្រងស្តុក LIVE</span>
          <span className="bg-sky-950 text-cyan-300 border border-sky-600/50 px-2 py-0.5 rounded-lg text-[10.5px] font-mono">
            {products.length} មុខ
          </span>
          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> REAL-TIME
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
          {/* Quick Filter Buttons */}
          <button
            onClick={() => setFilterMode(filterMode === 'OUT' ? 'ALL' : 'OUT')}
            className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer h-7 flex items-center ${
              filterMode === 'OUT'
                ? 'bg-rose-600 border-rose-400 text-white'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300 hover:bg-rose-900/60'
            }`}
          >
            🔴 អស់ ({outCount})
          </button>

          {lowCount > 0 && (
            <button
              onClick={() => setFilterMode(filterMode === 'LOW' ? 'ALL' : 'LOW')}
              className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer h-7 flex items-center ${
                filterMode === 'LOW'
                  ? 'bg-amber-600 border-amber-400 text-white'
                  : 'bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-900/60'
              }`}
            >
              ⚠️ ជិតអស់ ({lowCount})
            </button>
          )}

          {onOpenStockSync && (
            <>
              <button
                type="button"
                onClick={() => onOpenStockSync('telegram')}
                className="bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-sky-500/60 px-2 py-1 rounded-lg text-[11px] font-bold active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm h-7"
                title="ទាញស្តុកពី Telegram"
              >
                <span>✈️ Telegram</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenStockSync('export')}
                className="bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/60 px-2 py-1 rounded-lg text-[11px] font-bold active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm h-7"
                title="នាំចេញស្តុកជា CSV (Excel) ឬ JSON Backup"
              >
                <span>📤</span>
                <span>នាំចេញ</span>
              </button>
            </>
          )}

          <button
            onClick={onOpenAddStockPrompt}
            className="bg-emerald-800 hover:bg-emerald-700 text-emerald-200 border border-emerald-500 px-2.5 py-1 rounded-lg text-[11px] font-black active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm h-7"
          >
            <span>➕</span>
            <span>បន្ថែមស្តុក</span>
          </button>
        </div>
      </div>

      {/* Quick Search & Scroller */}
      <div className="flex gap-2 items-center">
        {/* Search input */}
        <div className="relative w-32 sm:w-40 flex-shrink-0">
          <input
            type="text"
            placeholder="🔍 ស្វែងរកកូដ..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            className="w-full bg-slate-950/90 border border-sky-700/50 rounded-xl px-2.5 py-1 text-xs text-sky-200 placeholder-slate-500 outline-none focus:border-cyan-400 font-mono"
          />
          {filterSearch && (
            <button
              onClick={() => setFilterSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sort Toggle Button */}
        <button
          type="button"
          onClick={() => setSortAsc(prev => !prev)}
          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-sky-700/60 rounded-xl text-[10.5px] font-mono font-bold flex items-center gap-1 flex-shrink-0 cursor-pointer active:scale-95 shadow-sm transition-all"
          title={sortAsc ? 'កូដតម្រៀប 1→9 (ចុចដើម្បីប្តូរ 9→1)' : 'កូដតម្រៀប 9→1 (ចុចដើម្បីប្តូរ 1→9)'}
        >
          <span>{sortAsc ? '🔢 1→9' : '🔤 9→1'}</span>
        </button>

        {/* Horizontal Items Scroller */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5 scroll-smooth flex-1 items-center">
          {filteredProducts.length === 0 ? (
            <span className="text-xs text-slate-400 italic py-1">រកមិនឃើញកូដនេះទេ</span>
          ) : (
            filteredProducts.map((p, idx) => {
              const isOut = p.stock_qty <= 0;
              const isLow = p.stock_qty > 0 && p.stock_qty <= 5;
              const uniqueKey = p.id ? `stock-id-${p.id}` : `stock-code-${p.code || idx}-${idx}`;

              return (
                <div
                  key={uniqueKey}
                  onClick={() => onSelectProduct(p)}
                  className={`bg-[#070D1B] px-2.5 py-1.5 rounded-xl text-xs font-black whitespace-nowrap cursor-pointer flex items-center gap-1.5 border-[1.5px] transition-all flex-shrink-0 active:scale-95 shadow-sm group ${
                    isOut
                      ? 'border-rose-600 bg-rose-950/40 text-rose-300'
                      : isLow
                      ? 'border-amber-500 bg-amber-950/30 text-amber-200'
                      : 'border-blue-900 text-white hover:border-cyan-400'
                  }`}
                  title={`ចុចដើម្បីកែសម្រួល ឬលុបកូដ [${p.code}]`}
                >
                  {/* Mini Product Thumbnail if available */}
                  {p.image_file ? (
                    <img
                      src={p.image_file}
                      alt={p.code}
                      className="w-5 h-5 rounded-md object-cover border border-cyan-400/50 flex-shrink-0"
                    />
                  ) : (
                    <span className="text-[10px] opacity-70">📷</span>
                  )}

                  <span className="font-mono text-cyan-300">[{p.code}]</span>
                  <span className="text-sky-300 font-mono text-[11px]">${p.price.toFixed(2)}</span>
                  <span
                    className={`text-[11px] font-mono font-black ${
                      isOut ? 'text-rose-500' : isLow ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {isOut ? '🔴 អស់' : `សល់ ${p.stock_qty}`}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
