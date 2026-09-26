import React, { useRef, useState, useEffect, useCallback } from 'react';
import { playPureTone, playSuccessFanfare } from '../../utils/audio';

export interface ZoomModalItem {
  code: string;
  name: string;
  imageUrl?: string;
  price?: number;
  stockQty?: number;
  quantity?: number;
  comment?: string;
  isChecked?: boolean;
}

interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  code?: string;
  name?: string;
  imageUrl?: string;
  price?: number;
  stockQty?: number;
  quantity?: number;
  comment?: string;
  items?: ZoomModalItem[];
  initialIndex?: number;
  invoiceId?: number;
  activeLiveId?: string;
  onToggleItemCheck?: (invoiceId: number, code: string) => void;
  onPhotoUploaded?: () => void;
  onStockUpdated?: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'error') => void;
}

export function ImageZoomModal({
  isOpen,
  onClose,
  code: singleCode = '',
  name: singleName = '',
  imageUrl: singleImageUrl,
  price: singlePrice,
  stockQty: singleStockQty,
  quantity: singleQuantity,
  comment: singleComment,
  items: propItems,
  initialIndex = 0,
  invoiceId,
  activeLiveId,
  onToggleItemCheck,
  onPhotoUploaded,
  onStockUpdated,
  onShowToast
}: ImageZoomModalProps) {
  const [uploading, setUploading] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [isDoubleZoomed, setIsDoubleZoomed] = useState<boolean>(false);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);

  // Stock Quick Edit State
  const [editingPrice, setEditingPrice] = useState<boolean>(false);
  const [editPriceVal, setEditPriceVal] = useState<string>('');
  const [editingQty, setEditingQty] = useState<boolean>(false);
  const [editQtyVal, setEditQtyVal] = useState<string>('');
  const [savingStock, setSavingStock] = useState<boolean>(false);

  // Local copy of items for instant reactive updates when editing price/stock
  const [localItems, setLocalItems] = useState<ZoomModalItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTapTimeRef = useRef<number>(0);
  const thumbnailScrollRef = useRef<HTMLDivElement>(null);

  // Normalize items array
  useEffect(() => {
    if (propItems && propItems.length > 0) {
      setLocalItems(propItems);
    } else {
      setLocalItems([
        {
          code: singleCode,
          name: singleName || `កូដ ${singleCode}`,
          imageUrl: singleImageUrl,
          price: singlePrice,
          stockQty: singleStockQty,
          quantity: singleQuantity || 1,
          comment: singleComment
        }
      ]);
    }
  }, [propItems, singleCode, singleName, singleImageUrl, singlePrice, singleStockQty, singleQuantity, singleComment]);

  const activeItems = localItems.length > 0 ? localItems : (propItems || []);

  // Sync index when modal opens or initialIndex changes
  useEffect(() => {
    if (isOpen) {
      const validIndex = Math.max(0, Math.min(initialIndex, (activeItems.length || 1) - 1));
      setCurrentIndex(validIndex);
      setIsDoubleZoomed(false);
      setPanOffset({ x: 0, y: 0 });
      setDragOffsetY(0);
      setEditingPrice(false);
      setEditingQty(false);
    }
  }, [isOpen, initialIndex, activeItems.length]);

  // Scroll active thumbnail into view
  useEffect(() => {
    if (thumbnailScrollRef.current) {
      const activeThumb = thumbnailScrollRef.current.children[currentIndex] as HTMLElement;
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
    setEditingPrice(false);
    setEditingQty(false);
  }, [currentIndex]);

  const currentItem: ZoomModalItem = activeItems[currentIndex] || {
    code: singleCode,
    name: singleName,
    imageUrl: singleImageUrl,
    price: singlePrice,
    stockQty: singleStockQty,
    quantity: singleQuantity || 1,
    comment: singleComment
  };

  const currentImageUrl = (currentItem.imageUrl && currentItem.imageUrl.trim() !== '')
    ? currentItem.imageUrl
    : (currentIndex === 0 && singleImageUrl && singleImageUrl.trim() !== '' ? singleImageUrl : '');

  const handlePrev = useCallback(() => {
    if (activeItems.length <= 1) return;
    setIsDoubleZoomed(false);
    setPanOffset({ x: 0, y: 0 });
    playPureTone(650, 0.03);
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : activeItems.length - 1));
  }, [activeItems.length]);

  const handleNext = useCallback(() => {
    if (activeItems.length <= 1) return;
    setIsDoubleZoomed(false);
    setPanOffset({ x: 0, y: 0 });
    playPureTone(750, 0.03);
    setCurrentIndex(prev => (prev < activeItems.length - 1 ? prev + 1 : 0));
  }, [activeItems.length]);

  // Save quick price or stock update directly
  const handleSaveStockPrice = async (newPrice?: number, newQty?: number) => {
    const updatedPrice = newPrice !== undefined ? newPrice : (currentItem.price ?? 0);
    const updatedQty = newQty !== undefined ? newQty : (currentItem.stockQty ?? 0);

    setSavingStock(true);
    try {
      const res = await fetch('/api/update_product_stock_price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: currentItem.code,
          name: currentItem.name || `កូដ ${currentItem.code}`,
          stock_qty: updatedQty,
          price: updatedPrice,
          image_file: currentItem.imageUrl || '',
          live_id: activeLiveId
        })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        // Update local items array
        setLocalItems(prev =>
          prev.map((it, idx) =>
            idx === currentIndex
              ? { ...it, price: updatedPrice, stockQty: updatedQty }
              : it
          )
        );
        setEditingPrice(false);
        setEditingQty(false);
        onShowToast?.(`💾 បានរក្សាទុក [${currentItem.code}]៖ $${updatedPrice.toFixed(2)} (សល់ ${updatedQty})`, 'success');
        onStockUpdated?.();
      } else {
        onShowToast?.('មិនអាចកែប្រែបានទេ', 'error');
      }
    } catch (err) {
      onShowToast?.('⚠️ បញ្ហាបណ្តាញ WiFi', 'error');
    } finally {
      setSavingStock(false);
    }
  };

  const handleAdjustStockDelta = (delta: number) => {
    const currentQ = currentItem.stockQty ?? 0;
    const newQ = Math.max(0, currentQ + delta);
    handleSaveStockPrice(undefined, newQ);
  };

  // Keyboard Navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === ' ' && invoiceId && onToggleItemCheck) {
        e.preventDefault();
        onToggleItemCheck(invoiceId, currentItem.code);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose, invoiceId, onToggleItemCheck, currentItem.code]);

  // Touch Swipe & Pull-Down Gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isDoubleZoomed) return;
    if (e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX);
      setTouchStartY(e.touches[0].clientY);
      setDragOffsetY(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDoubleZoomed || touchStartX === null || touchStartY === null) return;
    const diffX = e.touches[0].clientX - touchStartX;
    const diffY = e.touches[0].clientY - touchStartY;

    // Pull down to dismiss gesture
    if (diffY > 10 && Math.abs(diffY) > Math.abs(diffX)) {
      setDragOffsetY(Math.min(diffY, 150));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isDoubleZoomed || touchStartX === null || touchStartY === null) {
      setTouchStartX(null);
      setTouchStartY(null);
      setDragOffsetY(0);
      return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    // If dragged down > 70px -> close modal
    if (diffY > 70 && Math.abs(diffY) > Math.abs(diffX) * 1.5) {
      playPureTone(300, 0.04);
      onClose();
      return;
    }

    // Horizontal swipe threshold: 40px
    if (Math.abs(diffX) > 40 && Math.abs(diffY) < 60) {
      if (diffX < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }

    setTouchStartX(null);
    setTouchStartY(null);
    setDragOffsetY(0);
  };

  // Double-tap to zoom
  const handleDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapTimeRef.current < 300) {
      setIsDoubleZoomed(prev => !prev);
      setPanOffset({ x: 0, y: 0 });
      playPureTone(isDoubleZoomed ? 400 : 800, 0.04);
      lastTapTimeRef.current = 0;
    } else {
      lastTapTimeRef.current = now;
    }
  };

  // Quick Check toggle
  const handleQuickCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!invoiceId || !onToggleItemCheck) return;
    playSuccessFanfare();
    onToggleItemCheck(invoiceId, currentItem.code);

    // Auto-advance to next item if there are more
    if (activeItems.length > 1 && currentIndex < activeItems.length - 1) {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
      }, 250);
    }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target) e.target.value = '';

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const maxDim = 900;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);

            try {
              const res = await fetch('/api/upload_product_image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code: currentItem.code,
                  image_data: compressedBase64,
                  live_id: activeLiveId
                })
              });
              const data = await res.json();
              if (data.success && data.image_url) {
                const freshUrl = `${data.image_url}?t=${Date.now()}`;
                setLocalItems(prev => prev.map((item, idx) => idx === currentIndex ? { ...item, imageUrl: freshUrl } : item));
                onShowToast?.(`📸 បានបញ្ចូលរូបភាពសម្រាប់ [${currentItem.code}] ជោគជ័យ!`);
                onPhotoUploaded?.();
              } else {
                onShowToast?.(data.error || 'បរាជ័យក្នុងការ Upload រូបភាព', 'error');
              }
            } catch (err) {
              onShowToast?.('បរាជ័យក្នុងការ Upload រូបភាព', 'error');
            }
          }
          setUploading(false);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploading(false);
      onShowToast?.('Error uploading image', 'error');
    }
  };

  if (!isOpen) return null;

  const hasMultiple = activeItems.length > 1;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/92 backdrop-blur-md z-[1000000] flex items-center justify-center p-2 sm:p-4 select-none animate-fadeIn transition-opacity"
      style={{
        opacity: Math.max(0.3, 1 - dragOffsetY / 200)
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="bg-[#0B1426] border-2 border-cyan-400/90 rounded-3xl w-full max-w-[460px] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(0,240,255,0.3)] animate-scaleIn transition-transform duration-100 relative"
        style={{
          transform: `translateY(${dragOffsetY}px) scale(${1 - dragOffsetY / 600})`
        }}
      >
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUploadPhoto}
          className="hidden"
        />

        {/* Top Floating Action Bar */}
        <div className="absolute top-3 inset-x-3 z-30 flex items-center justify-between pointer-events-none">
          {/* Left Island: Index Counter + Quantity/Stock Mode */}
          <div className="pointer-events-auto flex items-center gap-1.5 bg-black/60 backdrop-blur-xl p-1 rounded-2xl border border-white/10 shadow-2xl">
            {/* Mode & Index Badge */}
            <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/40 text-cyan-300 px-2.5 py-1 rounded-xl text-xs font-black font-mono flex items-center gap-1.5 shadow-sm">
              <span className="text-[11px] opacity-80">{invoiceId ? '📸' : '📦'}</span>
              <span>
                {currentIndex + 1}
                <span className="opacity-50 text-[10px]">/</span>
                {activeItems.length}
              </span>
            </div>

            {/* In Basket Mode: show customer qty. In Stock Mode: show total stock badge */}
            {invoiceId ? (
              <div
                className={`px-2.5 py-1 rounded-xl text-xs font-black font-mono flex items-center gap-1 shadow-md transition-all ${
                  (currentItem.quantity || 1) > 1
                    ? 'bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 text-slate-950 ring-1 ring-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.6)] animate-pulse'
                    : 'bg-slate-800/90 text-amber-300 border border-amber-500/30'
                }`}
              >
                <span className="text-[11px]">🛍️</span>
                <span>x{currentItem.quantity || 1}</span>
              </div>
            ) : (
              <div className="px-2.5 py-1 rounded-xl text-xs font-black font-mono flex items-center gap-1 shadow-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <span className="text-[11px]">📦</span>
                <span>សល់ {currentItem.stockQty ?? 0}</span>
              </div>
            )}
          </div>

          {/* Right Action Tools Island */}
          <div className="pointer-events-auto flex items-center gap-1.5 bg-black/60 backdrop-blur-xl p-1 rounded-2xl border border-white/10 shadow-2xl">
            {/* Zoom Toggle Button */}
            {currentImageUrl && (
              <button
                type="button"
                onClick={() => setIsDoubleZoomed(prev => !prev)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer ${
                  isDoubleZoomed
                    ? 'bg-cyan-400 text-slate-950 font-black shadow-[0_0_12px_rgba(34,211,238,0.7)]'
                    : 'text-cyan-300 hover:bg-white/10 border border-cyan-500/30'
                }`}
                title="ពង្រីកមើលរូបភាព (Double Tap)"
              >
                <span>🔍</span>
                <span className="font-mono text-[11px] font-black">{isDoubleZoomed ? '1x' : '2.5x'}</span>
              </button>
            )}

            {/* Change Photo Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-amber-300 hover:bg-amber-400/20 border border-amber-500/30 p-1.5 px-2 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1"
              title="ប្តូរ ឬថតរូបថ្មី"
            >
              <span>📷</span>
              <span className="hidden sm:inline text-[11px]">{uploading ? '...' : 'ប្តូររូប'}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shadow transition-all active:scale-90 cursor-pointer"
              title="បិទ (Esc / Swipe Down)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Story-like Progress Bar at Top for Multi-Items */}
        {hasMultiple && (
          <div className="absolute top-0 inset-x-0 z-40 flex items-center gap-1 px-3 pt-1.5 pointer-events-none">
            {activeItems.map((item, idx) => (
              <div
                key={idx}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  idx === currentIndex
                    ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                    : item.isChecked
                    ? 'bg-emerald-500/80'
                    : 'bg-white/15'
                }`}
              />
            ))}
          </div>
        )}

        {/* Image Display Area with Swipe & Zoom */}
        <div
          onClick={handleDoubleTap}
          className="w-full h-84 sm:h-96 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#11203d] via-[#080f1e] to-[#040810] flex flex-col items-center justify-center relative overflow-hidden group cursor-zoom-in"
        >
          {currentImageUrl ? (
            <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
              <img
                src={currentImageUrl}
                alt={currentItem.name || currentItem.code}
                className={`w-full h-full object-contain p-2 transition-transform duration-200 ${
                  isDoubleZoomed ? 'scale-[2.4] cursor-grab active:cursor-grabbing' : 'scale-100'
                }`}
                style={{
                  transformOrigin: 'center center'
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <div className="w-24 h-24 rounded-2xl bg-cyan-950/80 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 font-mono font-black text-2xl shadow-[0_0_20px_rgba(0,240,255,0.3)] mb-3">
                [{currentItem.code}]
              </div>
              <div className="text-sm font-bold text-slate-300 mb-1">
                មិនទាន់មានរូបភាពសម្រាប់កូដនេះឡើយ
              </div>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <span>{uploading ? '⏳ កំពុងបញ្ចូល...' : '📷 បញ្ចូលរូបភាពឥឡូវនេះ'}</span>
              </button>
            </div>
          )}

          {/* Left Arrow Button */}
          {hasMultiple && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-2xl bg-black/50 hover:bg-black/85 text-white/90 hover:text-cyan-300 border border-white/10 hover:border-cyan-400/50 flex items-center justify-center text-2xl font-bold shadow-2xl backdrop-blur-md active:scale-90 transition-all z-20"
              title="មើលទំនិញមុន (Left Arrow)"
            >
              ‹
            </button>
          )}

          {/* Right Arrow Button */}
          {hasMultiple && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-2xl bg-black/50 hover:bg-black/85 text-white/90 hover:text-cyan-300 border border-white/10 hover:border-cyan-400/50 flex items-center justify-center text-2xl font-bold shadow-2xl backdrop-blur-md active:scale-90 transition-all z-20"
              title="មើលទំនិញបន្ទាប់ (Right Arrow)"
            >
              ›
            </button>
          )}
        </div>

        {/* Thumbnail Strip for Multi-item Baskets */}
        {hasMultiple && (
          <div
            ref={thumbnailScrollRef}
            className="px-3 py-2.5 bg-[#070e1c] border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto scrollbar-none"
          >
            {activeItems.map((item, idx) => {
              const isSelected = idx === currentIndex;
              const hasMultipleQty = (item.quantity || 1) > 1;
              return (
                <button
                  key={`${item.code}-${idx}`}
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setIsDoubleZoomed(false);
                    playPureTone(700, 0.03);
                    setCurrentIndex(idx);
                  }}
                  className={`relative flex-shrink-0 w-14 h-14 rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-cyan-400 ring-2 ring-cyan-400/60 scale-105 shadow-lg shadow-cyan-500/25 bg-cyan-950/40'
                      : item.isChecked
                      ? 'border-emerald-500/60 opacity-80 hover:opacity-100 hover:border-emerald-400'
                      : 'border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-600 bg-slate-900'
                  }`}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.code} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-900 flex items-center justify-center text-[10px] font-mono font-bold text-slate-400">
                      [{item.code}]
                    </div>
                  )}

                  {/* Code Label with Dark Frosted Gradient */}
                  <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/80 to-transparent text-[9.5px] font-mono font-black text-cyan-300 text-center truncate px-0.5 pt-1 pb-0.5">
                    {item.code}
                  </span>

                  {/* Quantity Badge on Thumbnail with Vivid Color */}
                  <span
                    className={`absolute top-0.5 left-0.5 font-black text-[9px] px-1.5 py-0.2 rounded-md font-mono shadow-md leading-tight ${
                      hasMultipleQty
                        ? 'bg-amber-400 text-slate-950 ring-1 ring-amber-200 font-black'
                        : 'bg-black/75 text-slate-300 border border-white/20'
                    }`}
                  >
                    x{item.quantity || 1}
                  </span>

                  {/* Check Indicator */}
                  {item.isChecked && (
                    <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-emerald-500 text-slate-950 rounded-full flex items-center justify-center text-[9px] font-black shadow-md ring-1 ring-emerald-300">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Product Details & Action Bar - Luxury Glass Card */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-b from-[#0e192f] to-[#091122] flex flex-col gap-2.5 border-t border-cyan-500/20 shadow-inner">
          <div className="flex justify-between items-start gap-2.5">
            <div className="flex flex-col gap-1.5 overflow-hidden flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Code Badge */}
                <span className="bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 font-mono font-black px-2.5 py-0.5 rounded-xl text-sm shadow-[0_0_12px_rgba(6,182,212,0.4)] flex-shrink-0 tracking-wide">
                  [{currentItem.code}]
                </span>

                {/* Big Luxury Quantity Badge */}
                <div className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 text-slate-950 font-mono font-black px-2.5 py-0.5 rounded-xl text-sm shadow-[0_0_15px_rgba(251,191,36,0.6)] flex items-center gap-1.5 flex-shrink-0 ring-1 ring-amber-200">
                  <span className="text-[11px] uppercase tracking-wider font-bold opacity-80">ចំនួន</span>
                  <span className="text-base font-black">x{currentItem.quantity || 1}</span>
                  <span className="text-xs font-bold text-slate-900">ដើម</span>
                </div>

                <span className="font-black text-white text-sm truncate">
                  {currentItem.name || `កូដ ${currentItem.code}`}
                </span>
              </div>

              {/* Customer Comment / Note - Glass Box */}
              {currentItem.comment && (
                <div className="flex items-center gap-2 text-xs text-amber-200 bg-gradient-to-r from-amber-950/60 to-amber-900/30 border border-amber-500/40 px-2.5 py-1 rounded-xl font-mono shadow-sm">
                  <span className="text-amber-400 font-bold flex items-center gap-1 flex-shrink-0">
                    <span>💬</span>
                    <span>ខមិន:</span>
                  </span>
                  <span className="font-black text-white truncate">{currentItem.comment}</span>
                </div>
              )}
            </div>

            {/* Quick Check Action Button for Basket Mode OR Quick Price Edit for Stock Mode */}
            {invoiceId && onToggleItemCheck ? (
              <button
                type="button"
                onClick={handleQuickCheck}
                className={`px-3.5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-1.5 shadow-lg transition-all active:scale-95 cursor-pointer flex-shrink-0 ${
                  currentItem.isChecked
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 ring-2 ring-emerald-300/80 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                    : 'bg-slate-800/90 hover:bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 hover:border-emerald-400'
                }`}
              >
                <span>{currentItem.isChecked ? '✓ ផ្ទៀងរួច' : '☑ ផ្ទៀងត្រូវ'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Quick Photo Replace in Stock Audit */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-amber-500/40 px-2.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1 shadow"
                  title="ប្តូររូបភាពកូដនេះ"
                >
                  <span>📷</span>
                  <span className="hidden sm:inline text-[11px]">{uploading ? '...' : 'ប្តូររូប'}</span>
                </button>

                {/* Quick Edit Price Button */}
                <button
                  type="button"
                  onClick={() => {
                    setEditPriceVal((currentItem.price ?? 0).toString());
                    setEditingPrice(prev => !prev);
                  }}
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-3 py-2 rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                >
                  <span>✏️</span>
                  <span>កែតម្លៃ</span>
                </button>
              </div>
            )}
          </div>

          {/* Pricing & Stock Stats Strip / Inline Price & Stock Adjusters */}
          <div className="flex justify-between items-center text-xs pt-2 border-t border-white/10 gap-2 flex-wrap">
            {/* Inline Price Editor Form */}
            {editingPrice ? (
              <div className="flex items-center gap-1.5 bg-slate-950/90 p-1.5 rounded-xl border border-cyan-400/80 shadow-lg animate-fadeIn">
                <span className="text-amber-400 font-mono font-black text-sm pl-1">$</span>
                <input
                  type="number"
                  step="0.01"
                  autoFocus
                  value={editPriceVal}
                  onChange={e => setEditPriceVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const num = parseFloat(editPriceVal);
                      if (!isNaN(num)) handleSaveStockPrice(num, undefined);
                    } else if (e.key === 'Escape') {
                      setEditingPrice(false);
                    }
                  }}
                  className="w-20 bg-slate-900 text-amber-300 font-mono font-black text-sm px-2 py-0.5 rounded border border-slate-700 outline-none focus:border-cyan-400"
                  placeholder="0.00"
                />
                <button
                  type="button"
                  disabled={savingStock}
                  onClick={() => {
                    const num = parseFloat(editPriceVal);
                    if (!isNaN(num)) handleSaveStockPrice(num, undefined);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-2.5 py-1 rounded-lg text-xs shadow cursor-pointer active:scale-95"
                >
                  {savingStock ? '...' : '✓ រក្សាទុក'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPrice(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-2 py-1 rounded-lg text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                {currentItem.price !== undefined && (
                  <div
                    onClick={() => {
                      if (!invoiceId) {
                        setEditPriceVal((currentItem.price ?? 0).toString());
                        setEditingPrice(true);
                      }
                    }}
                    className={`flex items-center gap-1.5 font-mono ${!invoiceId ? 'cursor-pointer hover:underline' : ''}`}
                    title={!invoiceId ? 'ចុចដើម្បីកែប្រែតម្លៃ' : undefined}
                  >
                    <span className="text-amber-400 font-black text-sm">
                      ${currentItem.price.toFixed(2)}
                    </span>
                    {(currentItem.quantity || 1) > 1 && invoiceId && (
                      <span className="text-amber-300/80 text-[11px] bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/30">
                        សរុប: ${(currentItem.price * (currentItem.quantity || 1)).toFixed(2)}
                      </span>
                    )}
                  </div>
                )}

                {/* Stock Quantity Badge with Direct Adjusters in Stock Mode */}
                {!invoiceId ? (
                  <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 px-1 rounded-xl border border-slate-700/80 shadow-sm">
                    <button
                      type="button"
                      disabled={savingStock}
                      onClick={() => handleAdjustStockDelta(-1)}
                      className="w-6 h-6 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/40 font-black text-xs flex items-center justify-center cursor-pointer active:scale-90"
                      title="ដកចំនួនស្តុក (-1)"
                    >
                      -
                    </button>
                    <span
                      className={`font-mono font-bold text-xs px-2 ${
                        (currentItem.stockQty ?? 0) <= 0 ? 'text-rose-400' : 'text-emerald-300'
                      }`}
                    >
                      {(currentItem.stockQty ?? 0) <= 0 ? '🔴 អស់' : `🟢 សល់ ${currentItem.stockQty ?? 0}`}
                    </span>
                    <button
                      type="button"
                      disabled={savingStock}
                      onClick={() => handleAdjustStockDelta(1)}
                      className="w-6 h-6 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 font-black text-xs flex items-center justify-center cursor-pointer active:scale-90"
                      title="ថែមចំនួនស្តុក (+1)"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  currentItem.stockQty !== undefined && (
                    <span
                      className={`font-mono font-bold text-xs px-2 py-0.5 rounded-lg border ${
                        currentItem.stockQty <= 0
                          ? 'text-rose-400 bg-rose-950/40 border-rose-500/30'
                          : 'text-emerald-300 bg-emerald-950/40 border-emerald-500/30'
                      }`}
                    >
                      {currentItem.stockQty <= 0 ? '🔴 អស់ស្តុក' : `🟢 ស្តុកនៅសល់: ${currentItem.stockQty} ដើម`}
                    </span>
                  )
                )}
              </div>
            )}

            <span className="text-[10.5px] text-cyan-300/70 font-mono flex items-center gap-1 ml-auto">
              <span>👈 អូស Slide ឆ្វេង-ស្តាំ 👉</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
