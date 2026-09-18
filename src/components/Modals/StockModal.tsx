import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../../types';
import { playPureTone, playWarningBuzzer, playSuccessFanfare } from '../../utils/audio';

interface StockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  isAddingNew?: boolean;
  activeLiveId?: string;
  onStockUpdated: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenSync?: (tab?: 'telegram' | 'paste' | 'file' | 'export') => void;
}

export function StockModal({
  isOpen,
  onClose,
  product,
  isAddingNew = false,
  activeLiveId,
  onStockUpdated,
  onShowToast,
  onOpenSync
}: StockModalProps) {
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [stockQty, setStockQty] = useState<number>(50);
  const [price, setPrice] = useState<number>(5.0);
  const [imageFile, setImageFile] = useState<string>('');
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [urlInput, setUrlInput] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product && !isAddingNew) {
      setCode(product.code || '');
      setName(product.name || '');
      setStockQty(product.stock_qty ?? 50);
      setPrice(product.price ?? 5.0);
      setImageFile(product.image_file || '');
      setUrlInput(product.image_file || '');
    } else {
      setCode('');
      setName('');
      setStockQty(50);
      setPrice(5.0);
      setImageFile('');
      setUrlInput('');
    }
    setConfirmDelete(false);
    setShowUrlInput(false);
  }, [product, isAddingNew, isOpen]);

  if (!isOpen) return null;

  const isNew = isAddingNew || !product?.code;

  const addQty = (amount: number) => {
    setStockQty(prev => Math.max(0, prev + amount));
    playPureTone(600 + amount * 10, 0.04);
  };

  // Compress image on client side using Canvas before uploading
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const maxDim = 800;
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
            setImageFile(compressedBase64);

            // If updating existing product, upload to server immediately
            const cleanCode = code.trim().toUpperCase() || product?.code || 'item';
            try {
              const uploadRes = await fetch('/api/upload_product_image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code: cleanCode,
                  image_data: compressedBase64,
                  live_id: activeLiveId
                })
              });
              const uploadData = await uploadRes.json();
              if (uploadData.success && uploadData.image_url) {
                setImageFile(uploadData.image_url);
              }
            } catch (err) {}
          }
          setUploading(false);
          playPureTone(880, 0.06);
          onShowToast('📸 បានជ្រើសរើសរូបភាពជោគជ័យ!');
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploading(false);
      onShowToast('បរាជ័យក្នុងការអានរូបភាព', 'error');
    }
  };

  // Submit product edits or creation
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      onShowToast('⚠️ សូមបញ្ចូលកូដទំនិញជាមុនសិន!', 'error');
      playWarningBuzzer();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/update_product_stock_price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: isNew ? cleanCode : (product?.code || cleanCode),
          new_code: isNew ? undefined : cleanCode,
          name: name.trim() || `កូដ ${cleanCode}`,
          stock_qty: stockQty,
          price: price,
          image_file: imageFile,
          live_id: activeLiveId
        })
      });
      const data = await res.json();
      if (data.success) {
        playSuccessFanfare();
        onShowToast(`✅ បាន${isNew ? 'បន្ថែម' : 'អាប់ឌែត'}កូដ [${cleanCode}] ចំនួន ${stockQty} ដើម តម្លៃ $${price.toFixed(2)} រួចរាល់!`);
        onStockUpdated();
        onClose();
      } else {
        playWarningBuzzer();
        onShowToast(data.error || 'បរាជ័យក្នុងការកែសម្រួល', 'error');
      }
    } catch (e) {
      playWarningBuzzer();
      onShowToast('⚠️ ដាច់សេវា WiFi!', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete product from stock
  const handleDeleteProduct = async () => {
    if (!product?.code) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/delete_product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: product.code,
          live_id: activeLiveId
        })
      });
      const data = await res.json();
      if (data.success) {
        playPureTone(400, 0.08);
        onShowToast(`🗑️ បានលុបកូដ [${product.code}] ចេញពីស្តុកជោគជ័យ!`);
        onStockUpdated();
        onClose();
      } else {
        playWarningBuzzer();
        onShowToast(data.error || 'មិនអាចលុបកូដនេះបានទេ', 'error');
      }
    } catch (e) {
      playWarningBuzzer();
      onShowToast('⚠️ ដាច់សេវា WiFi!', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-[#0B1426] border-[1.5px] border-sky-500/50 rounded-2xl w-full max-w-[440px] flex flex-col overflow-hidden shadow-2xl max-h-[92vh]">
        {/* Header */}
        <div className="p-3.5 bg-[#121E38] border-b border-slate-700 flex justify-between items-center flex-shrink-0">
          <div className="font-black text-sm text-cyan-400 flex items-center gap-2 flex-wrap">
            <span>{isNew ? '➕ បន្ថែមកូដទំនិញថ្មីចូលស្តុក' : '📦 កែសម្រួលស្តុក & រូបភាពទំនិញ'}</span>
            {activeLiveId && (
              <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-700/60">
                🎥 #{activeLiveId.length > 10 ? activeLiveId.slice(-8) : activeLiveId}
              </span>
            )}
            {!isNew && (
              <span className="text-amber-400 font-mono bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-700">
                [{product?.code}]
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700 active:scale-95 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3.5 bg-[#070D1B] overflow-y-auto">
          {/* Quick Telegram / Bulk Import Banner */}
          {onOpenSync && (
            <div className="bg-sky-950/40 border border-sky-600/30 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <div className="text-[11px] text-sky-300">
                <span className="font-bold">✨ ចង់ទាញកូដ និងរូបភាពស្វ័យប្រវត្តិ?</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSync('telegram');
                  }}
                  className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                >
                  <span>✈️ ពី Telegram</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSync('paste');
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold active:scale-95 transition-all cursor-pointer"
                >
                  <span>📥 នាំចូល</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSync('export');
                  }}
                  className="px-2 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-200 text-[11px] font-bold active:scale-95 transition-all cursor-pointer"
                >
                  <span>📤 នាំចេញ</span>
                </button>
              </div>
            </div>
          )}

          {/* Section 1: Product Image Upload / Preview */}
          <div>
            <label className="text-xs text-slate-300 block mb-1.5 font-bold flex justify-between items-center">
              <span>🖼️ រូបភាពទំនិញ (Product Photo) ៖</span>
              <span className="text-[10.5px] text-cyan-400 font-normal">បង្ហាញក្នុងកន្ត្រកតាមកូដ</span>
            </label>

            <div className="flex gap-3 items-start">
              {/* Image Preview or Placeholder */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-2xl bg-slate-900 border-2 border-dashed border-cyan-500/50 hover:border-cyan-400 flex flex-col items-center justify-center text-center cursor-pointer overflow-hidden relative group flex-shrink-0 shadow-inner"
                title="ចុចដើម្បីជ្រើសរើសរូបភាព"
              >
                {imageFile ? (
                  <>
                    <img
                      src={imageFile}
                      alt="Product"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[11px] font-bold transition-opacity">
                      📸 ប្តូររូប
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1 p-2 text-slate-400 group-hover:text-cyan-300 transition-colors">
                    <span className="text-2xl">{uploading ? '⏳' : '📷'}</span>
                    <span className="text-[10px] font-bold leading-tight">
                      {uploading ? 'កំពុងផ្ទុក...' : '+ ដាក់រូប'}
                    </span>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Image Actions */}
              <div className="flex-1 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-sky-500/40 text-cyan-300 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <span>📁 រើសរូបពីទូរស័ព្ទ / PC</span>
                </button>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className="flex-1 py-1 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                  >
                    <span>🔗 ដាក់ Link រូប</span>
                  </button>

                  {imageFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile('');
                        setUrlInput('');
                      }}
                      className="py-1 px-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-600/50 text-rose-300 text-[11px] font-bold active:scale-95 cursor-pointer"
                      title="ដករូបភាពនេះចេញ"
                    >
                      🗑️ លុបរូប
                    </button>
                  )}
                </div>

                {showUrlInput && (
                  <div className="flex gap-1 mt-1">
                    <input
                      type="url"
                      placeholder="https://..."
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (urlInput.trim()) {
                          setImageFile(urlInput.trim());
                          setShowUrlInput(false);
                          onShowToast('✅ បានដាក់ Link រូបភាព');
                        }
                      }}
                      className="bg-cyan-600 text-white px-2 py-1 rounded-lg text-xs font-bold active:scale-95 cursor-pointer"
                    >
                      ដាក់
                    </button>
                  </div>
                )}
                <span className="text-[10px] text-slate-500 leading-tight">
                  គាំទ្រ JPG, PNG, WEBP — រូបនេះនឹងបង្ហាញដោយស្វ័យប្រវត្តិក្នងកន្ត្រកអតិថិជន។
                </span>
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-slate-800/80 my-0.5"></div>

          {/* Product Code */}
          <div>
            <label className="text-xs text-slate-400 block mb-1 font-bold flex justify-between">
              <span>កូដទំនិញ (Product Code) <span className="text-rose-400">*</span></span>
              {!isNew && <span className="text-[10px] text-cyan-400 font-normal">អាចកែកូដបាន</span>}
            </label>
            <input
              type="text"
              required
              placeholder="ឧទាហរណ៍៖ 125, A09, 88"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              className="w-full bg-slate-900 border border-cyan-500 text-cyan-300 rounded-xl px-3.5 py-2 font-mono font-black text-base outline-none focus:ring-2 focus:ring-cyan-400"
            />
            {isNew && (
              <span className="text-[10px] text-slate-500 mt-1 block">
                អក្សរ ឬលេខកូដដែលអតិថិជននឹងខំមិនក្នុង Live
              </span>
            )}
          </div>

          {/* Product Name */}
          <div>
            <label className="text-xs text-slate-400 block mb-1 font-bold">
              ឈ្មោះទំនិញ (Product Name)
            </label>
            <input
              type="text"
              placeholder="ឧទាហរណ៍៖ អាវយឺតដៃខ្លី ឬរ៉ូបផ្កា..."
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-cyan-400"
            />
          </div>

          {/* Stock Quantity Controls */}
          <div>
            <label className="text-xs text-slate-400 block mb-1 font-bold flex justify-between">
              <span>ចំនួនស្តុក (Stock Quantity) ៖</span>
              <span className={`font-mono font-bold ${stockQty <= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {stockQty <= 0 ? '🔴 អស់ស្តុក' : `🟢 នៅសល់ ${stockQty}`}
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={stockQty}
                onChange={e => setStockQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sky-400 font-mono font-black text-lg outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => addQty(10)}
                className="px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-300 text-xs font-black hover:bg-emerald-900 active:scale-95 cursor-pointer"
              >
                +10
              </button>
              <button
                type="button"
                onClick={() => addQty(20)}
                className="px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-300 text-xs font-black hover:bg-emerald-900 active:scale-95 cursor-pointer"
              >
                +20
              </button>
              <button
                type="button"
                onClick={() => addQty(50)}
                className="px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-300 text-xs font-black hover:bg-emerald-900 active:scale-95 cursor-pointer"
              >
                +50
              </button>
            </div>
            {/* Secondary Quick Buttons */}
            <div className="flex gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => addQty(-5)}
                className="flex-1 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-[10.5px] font-bold hover:bg-slate-800 active:scale-95 cursor-pointer"
              >
                -5
              </button>
              <button
                type="button"
                onClick={() => addQty(-10)}
                className="flex-1 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-[10.5px] font-bold hover:bg-slate-800 active:scale-95 cursor-pointer"
              >
                -10
              </button>
              <button
                type="button"
                onClick={() => setStockQty(0)}
                className="flex-1 py-1 rounded-lg bg-rose-950/40 border border-rose-700/50 text-rose-300 text-[10.5px] font-bold hover:bg-rose-900 active:scale-95 cursor-pointer"
              >
                ដាក់ 0 (អស់)
              </button>
            </div>
          </div>

          {/* Selling Price */}
          <div>
            <label className="text-xs text-slate-400 block mb-1 font-bold">
              តម្លៃលក់ $ (Selling Price) ៖
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400 font-bold">$</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={price}
                onChange={e => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-amber-400 font-mono font-black text-lg outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving || uploading}
            className="w-full h-11 mt-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-[0_4px_18px_rgba(16,185,129,0.35)] active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
          >
            <span>
              {saving
                ? '⏳ កំពុងរក្សាទុក...'
                : isNew
                ? '➕ បន្ថែមកូដនេះចូលក្នុងស្តុក'
                : '💾 រក្សាទុក & Update គ្រប់កន្ត្រក'}
            </span>
          </button>

          {/* Delete Product from Stock Option */}
          {!isNew && (
            <div className="mt-1 pt-3 border-t border-slate-800 flex flex-col gap-2">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(true);
                    playPureTone(350, 0.05);
                  }}
                  className="w-full py-2 rounded-xl bg-rose-950/40 hover:bg-rose-950/80 border border-rose-600/40 text-rose-300 text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
                >
                  <span>🗑️ លុបកូដ [{product?.code}] ចេញពីស្តុក</span>
                </button>
              ) : (
                <div className="bg-rose-950/90 border-2 border-rose-500 p-3 rounded-xl flex flex-col gap-2 animate-fadeIn">
                  <div className="text-xs text-rose-200 font-bold leading-tight">
                    ⚠️ តើអ្នកពិតជាចង់លុបកូដ <span className="text-white font-mono font-black">[{product?.code}]</span> នេះចេញពីស្តុកមែនទេ?
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleDeleteProduct}
                      className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-lg active:scale-95 transition-all shadow-md cursor-pointer"
                    >
                      {deleting ? '⏳ កំពុងលុប...' : '✅ បាទ/ចាស លុបចេញ'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg active:scale-95 cursor-pointer"
                    >
                      ✕ មិនលុប
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
