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
  onShowToast
}: ImageZoomModalProps) {
  const [uploading, setUploading] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [isDoubleZoomed, setIsDoubleZoomed] = useState<boolean>(false);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTapTimeRef = useRef<number>(0);
  const thumbnailScrollRef = useRef<HTMLDivElement>(null);

  // Normalize items array
  const activeItems: ZoomModalItem[] = React.useMemo(() => {
    if (propItems && propItems.length > 0) {
      return propItems;
    }
    return [
      {
        code: singleCode,
        name: singleName || `កូដ ${singleCode}`,
        imageUrl: singleImageUrl,
        price: singlePrice,
        stockQty: singleStockQty,
        quantity: singleQuantity || 1,
        comment: singleComment
      }
    ];
  }, [propItems, singleCode, singleName, singleImageUrl, singlePrice, singleStockQty, singleQuantity, singleComment]);

  // Sync index when modal opens or initialIndex changes
  useEffect(() => {
    if (isOpen) {
      const validIndex = Math.max(0, Math.min(initialIndex, activeItems.length - 1));
      setCurrentIndex(validIndex);
      setIsDoubleZoomed(false);
      setPanOffset({ x: 0, y: 0 });
      setDragOffsetY(0);
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
              if (data.success) {
                onShowToast?.(`📸 បានបញ្ចូលរូបភាពសម្រាប់ [${currentItem.code}] ជោគជ័យ!`);
                onPhotoUploaded?.();
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
          {/* Item Counter / Carousel Badge + Quantity */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            {hasMultiple ? (
              <div className="bg-black/80 backdrop-blur-md border border-cyan-500/50 text-cyan-300 px-3 py-1 rounded-full text-xs font-black shadow-lg flex items-center gap-1.5 font-mono">
                <span>📸</span>
                <span>{currentIndex + 1} / {activeItems.length}</span>
              </div>
            ) : (
              <div className="bg-black/80 backdrop-blur-md border border-slate-700 text-slate-300 px-2.5 py-1 rounded-full text-[11px] font-bold shadow">
                🔍 ចុច ២ ដងដើម្បីពង្រីក
              </div>
            )}

            {/* Prominent Floating Quantity Badge */}
            <div className="bg-amber-400 text-slate-950 px-2.5 py-1 rounded-full text-xs font-black shadow-[0_0_12px_rgba(251,191,36,0.6)] flex items-center gap-1 font-mono ring-1 ring-amber-200 animate-pulse">
              <span>🛍️</span>
              <span>x{currentItem.quantity || 1}</span>
            </div>
          </div>

          {/* Right Action Tools */}
          <div className="pointer-events-auto flex items-center gap-2">
            {/* Zoom Toggle Button */}
            {currentImageUrl && (
              <button
                type="button"
                onClick={() => setIsDoubleZoomed(prev => !prev)}
                className={`p-1.5 px-2.5 rounded-xl text-xs font-bold backdrop-blur-md border shadow transition-all active:scale-95 ${
                  isDoubleZoomed
                    ? 'bg-cyan-500 text-slate-950 border-cyan-300 font-black ring-2 ring-cyan-400/60'
                    : 'bg-black/70 hover:bg-black/90 text-cyan-300 border-cyan-500/50'
                }`}
                title="ពង្រីកមើលព័ត៌មានលម្អិត"
              >
                <span>{isDoubleZoomed ? '🔍 1x ធម្មតា' : '🔍 2.5x ពង្រីក'}</span>
              </button>
            )}

            {/* Change Photo Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-black/70 hover:bg-black/90 text-amber-300 border border-amber-500/60 px-2.5 py-1.5 rounded-xl text-xs font-bold backdrop-blur-md shadow flex items-center gap-1 active:scale-95 cursor-pointer"
              title="ប្តូរ ឬថតរូបថ្មី"
            >
              <span>{uploading ? '⏳...' : '📷 ប្តូររូប'}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="bg-black/80 hover:bg-rose-900 border border-slate-700 hover:border-rose-500 text-white w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shadow active:scale-95 cursor-pointer transition-all"
              title="បិទ (Close / Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Image Display Area with Swipe & Zoom */}
        <div
          onClick={handleDoubleTap}
          className="w-full h-84 sm:h-96 bg-gradient-to-br from-slate-950 via-[#0C192E] to-[#070D1B] flex flex-col items-center justify-center relative overflow-hidden group cursor-zoom-in"
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
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-2xl bg-black/60 hover:bg-black/90 text-white border border-cyan-500/50 flex items-center justify-center text-xl font-bold shadow-xl backdrop-blur-sm active:scale-90 transition-all z-20"
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
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-2xl bg-black/60 hover:bg-black/90 text-white border border-cyan-500/50 flex items-center justify-center text-xl font-bold shadow-xl backdrop-blur-sm active:scale-90 transition-all z-20"
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
            className="px-3 py-2 bg-[#091122] border-t border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-none"
          >
            {activeItems.map((item, idx) => {
              const isSelected = idx === currentIndex;
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
                  className={`relative flex-shrink-0 w-13 h-13 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-cyan-400 ring-2 ring-cyan-400/50 scale-105 shadow-md shadow-cyan-500/20'
                      : 'border-slate-700 opacity-60 hover:opacity-100 hover:border-slate-500'
                  }`}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.code} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-900 flex items-center justify-center text-[10px] font-mono font-bold text-slate-400">
                      [{item.code}]
                    </div>
                  )}

                  {/* Code Label */}
                  <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[9px] font-mono font-black text-cyan-300 text-center truncate px-0.5">
                    {item.code}
                  </span>

                  {/* Quantity Badge on Thumbnail */}
                  <span className="absolute top-0.5 left-0.5 bg-amber-400 text-slate-950 font-black text-[9px] px-1 rounded-md font-mono shadow leading-tight">
                    x{item.quantity || 1}
                  </span>

                  {/* Check Indicator */}
                  {item.isChecked && (
                    <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-emerald-500 text-slate-950 rounded-full flex items-center justify-center text-[8px] font-black shadow">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Product Details & Action Bar */}
        <div className="p-3.5 bg-[#121E38] flex flex-col gap-2 border-t border-slate-700">
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-col gap-1 overflow-hidden flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-cyan-500 text-slate-950 font-mono font-black px-2.5 py-0.5 rounded-lg text-sm shadow flex-shrink-0">
                  [{currentItem.code}]
                </span>

                {/* Big Prominent Ordered Quantity Badge */}
                <span className="bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 font-mono font-black px-2.5 py-0.5 rounded-lg text-sm shadow-[0_0_12px_rgba(251,191,36,0.5)] flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs opacity-80">ចំនួន:</span>
                  <span className="text-base font-black">x{currentItem.quantity || 1}</span>
                </span>

                <span className="font-extrabold text-white text-sm truncate">
                  {currentItem.name || `កូដ ${currentItem.code}`}
                </span>
              </div>

              {/* Customer Comment / Note */}
              {currentItem.comment && (
                <div className="flex items-center gap-1.5 text-xs text-amber-200 bg-amber-950/70 border border-amber-500/40 px-2 py-0.5 rounded-lg font-mono mt-0.5">
                  <span className="text-amber-400 font-bold">💬 ខមិន:</span>
                  <span className="font-bold truncate text-white">{currentItem.comment}</span>
                </div>
              )}
            </div>

            {/* Quick Check Action Button */}
            {invoiceId && onToggleItemCheck && (
              <button
                type="button"
                onClick={handleQuickCheck}
                className={`px-3 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer flex-shrink-0 ${
                  currentItem.isChecked
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-2 ring-emerald-400/40'
                    : 'bg-slate-800 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/50'
                }`}
              >
                <span>{currentItem.isChecked ? '✓ បានផ្ទៀងត្រូវ' : '☑ ផ្ទៀងត្រូវ'}</span>
              </button>
            )}
          </div>

          <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-700/50">
            <div className="flex items-center gap-3">
              {currentItem.price !== undefined && (
                <span className="text-amber-400 font-mono font-black text-sm">
                  ${currentItem.price.toFixed(2)}
                </span>
              )}
              {currentItem.stockQty !== undefined && (
                <span
                  className={`font-mono font-bold text-xs ${
                    currentItem.stockQty <= 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {currentItem.stockQty <= 0 ? '🔴 អស់ស្តុក' : `🟢 នៅសល់ ${currentItem.stockQty} ដើម`}
                </span>
              )}
            </div>

            <span className="text-[10.5px] text-sky-300/80 font-mono flex items-center gap-1">
              <span>👈 អូសឆ្វេងស្តាំ 👉</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
