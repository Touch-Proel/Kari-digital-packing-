import React, { useRef, useState } from 'react';

interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  name: string;
  imageUrl?: string;
  price?: number;
  stockQty?: number;
  activeLiveId?: string;
  onPhotoUploaded?: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'error') => void;
}

export function ImageZoomModal({
  isOpen,
  onClose,
  code,
  name,
  imageUrl,
  price,
  stockQty,
  activeLiveId,
  onPhotoUploaded,
  onShowToast
}: ImageZoomModalProps) {
  const [uploading, setUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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

            try {
              const res = await fetch('/api/upload_product_image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code: code,
                  image_data: compressedBase64,
                  live_id: activeLiveId
                })
              });
              const data = await res.json();
              if (data.success) {
                onShowToast?.(`📸 បានបញ្ចូលរូបភាពសម្រាប់ [${code}] ជោគជ័យ!`);
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

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/90 backdrop-blur-md z-[1000000] flex items-center justify-center p-3 animate-fadeIn"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-[#0B1426] border-2 border-cyan-400 rounded-3xl w-full max-w-[420px] flex flex-col overflow-hidden shadow-[0_0_40px_rgba(0,240,255,0.25)] animate-scaleIn"
      >
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUploadPhoto}
          className="hidden"
        />

        {/* Image Display Area */}
        <div className="w-full h-80 bg-gradient-to-br from-slate-950 via-[#0C192E] to-[#070D1B] flex flex-col items-center justify-center relative overflow-hidden group">
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt={name || code}
                className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute top-3 right-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-black/70 hover:bg-black/90 text-cyan-300 border border-cyan-500/60 px-2.5 py-1 rounded-xl text-xs font-bold backdrop-blur-sm shadow flex items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <span>{uploading ? '⏳ កំពុង Upload...' : '📸 ប្តូររូប'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <div className="w-24 h-24 rounded-2xl bg-cyan-950/80 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 font-mono font-black text-2xl shadow-[0_0_20px_rgba(0,240,255,0.3)] mb-3">
                [{code}]
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
        </div>

        {/* Product Details Bar */}
        <div className="p-3.5 bg-[#121E38] flex flex-col gap-2 border-t border-slate-700">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="bg-cyan-500 text-slate-950 font-mono font-black px-2.5 py-0.5 rounded-lg text-sm shadow">
                [{code}]
              </span>
              <span className="font-extrabold text-white text-sm truncate max-w-[200px]">
                {name || `កូដ ${code}`}
              </span>
            </div>

            <button
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-white w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shadow active:scale-95 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-700/50">
            <div className="flex items-center gap-3">
              {price !== undefined && (
                <span className="text-amber-400 font-mono font-black text-sm">
                  ${price.toFixed(2)}
                </span>
              )}
              {stockQty !== undefined && (
                <span
                  className={`font-mono font-bold text-xs ${
                    stockQty <= 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {stockQty <= 0 ? '🔴 អស់ស្តុក' : `🟢 នៅសល់ ${stockQty} ដើម`}
                </span>
              )}
            </div>

            <span className="text-[10px] text-sky-300 font-mono">
              HD PREVIEW READY
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
