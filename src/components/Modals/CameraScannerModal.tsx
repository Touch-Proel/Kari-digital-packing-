import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedValue: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export function CameraScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
  onShowToast
}: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasCameraError, setHasCameraError] = useState<string | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isHttpOrigin, setIsHttpOrigin] = useState(false);

  // Sound effects
  const playScanBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1050, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.09);
    } catch {}
  };

  const parseScannedText = (rawText: string): string => {
    const text = rawText.trim();
    try {
      if (text.includes('?') || text.startsWith('http://') || text.startsWith('https://')) {
        const urlObj = new URL(text.startsWith('http') ? text : `http://dummy.com${text}`);
        const basket = urlObj.searchParams.get('open_basket') ||
                       urlObj.searchParams.get('order') ||
                       urlObj.searchParams.get('basket') ||
                       urlObj.searchParams.get('id');
        if (basket) {
          return basket.trim().replace(/^#/, '');
        }
      }
    } catch {}

    if (text.startsWith('#')) {
      return text.slice(1).trim();
    }

    return text;
  };

  // Decode Image File (from Camera capture or upload)
  const processImageFile = (file: File) => {
    setIsProcessingFile(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setIsProcessingFile(false);
          return;
        }

        // Limit size for optimal jsQR scanning performance
        const maxDim = 1200;
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
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        setIsProcessingFile(false);

        if (code && code.data) {
          const parsed = parseScannedText(code.data);
          playScanBeep();
          stopCamera();
          onScanSuccess(parsed);
          onClose();
        } else {
          onShowToast('❌ រកមិនឃើញ QR Code ក្នុងរូបថតទេ! សូមព្យាយាមថតជិត និងច្បាស់ជាងនេះ។', 'error');
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    // Reset input
    e.target.value = '';
  };

  // Start Live Camera
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    setHasCameraError(null);

    if (typeof window !== 'undefined') {
      const isHttp = window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      setIsHttpOrigin(isHttp);
    }

    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasCameraError('Browser មិនអនុញ្ញាតឱ្យបើក Live Stream លើអាសយដ្ឋាន HTTP ទេ។ សូមចុចប៊ូតុង «📸 ថតរូបស្កេន» ខាងក្រោម!');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();

          const track = stream.getVideoTracks()[0];
          const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
          if (capabilities.torch) {
            setHasTorch(true);
          }

          startScanLoop();
        }
      } catch (err: any) {
        console.warn('Camera access error:', err);
        setHasCameraError('មិនអាចបើកកាមេរ៉ា Live បានទេ! សូមចុចប៊ូតុង «📸 ថតរូបស្កេន» ខាងក្រោមភ្លាមៗ។');
      }
    };

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && hasTorch) {
      try {
        const next = !torchEnabled;
        await (track as any).applyConstraints({
          advanced: [{ torch: next }]
        });
        setTorchEnabled(next);
      } catch (e) {
        console.error('Toggle torch failed', e);
      }
    }
  };

  const startScanLoop = () => {
    const scan = () => {
      if (!videoRef.current || !canvasRef.current) {
        animFrameRef.current = requestAnimationFrame(scan);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          const rawValue = code.data;
          const parsed = parseScannedText(rawValue);
          playScanBeep();
          stopCamera();
          onScanSuccess(parsed);
          onClose();
          return;
        }
      }

      animFrameRef.current = requestAnimationFrame(scan);
    };

    animFrameRef.current = requestAnimationFrame(scan);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-3 animate-fadeIn">
      {/* Hidden Native Camera / Gallery File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Top Controls */}
      <div className="w-full max-w-sm flex items-center justify-between px-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-black text-white text-sm">📷 ស្កេនកាមេរ៉ា (QR & Barcode)</span>
        </div>

        <div className="flex items-center gap-2">
          {hasTorch && !hasCameraError && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-xl border text-xs font-black transition-all ${
                torchEnabled
                  ? 'bg-amber-400 border-amber-300 text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.6)]'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
              title="បើក/បិទ ពិល Flash"
            >
              🔦 {torchEnabled ? 'ON' : 'OFF'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 text-xs font-black active:scale-95 transition-all cursor-pointer"
          >
            ✕ បិទ
          </button>
        </div>
      </div>

      {/* Camera Viewfinder */}
      <div className="relative w-full max-w-sm aspect-square bg-slate-950 rounded-3xl overflow-hidden border-2 border-cyan-500/60 shadow-[0_0_30px_rgba(6,182,212,0.3)] flex items-center justify-center p-4">
        {hasCameraError ? (
          <div className="text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-2xl mb-3 shadow-[0_0_20px_rgba(245,158,11,0.3)]">
              📸
            </div>
            <div className="text-xs text-amber-200 font-bold mb-4 leading-relaxed max-w-[280px]">
              {isHttpOrigin
                ? 'Chrome តម្រូវឱ្យប្រើប៊ូតុងថតរូបស្កេន ពេលចូលតាម IP (HTTP)'
                : hasCameraError}
            </div>

            {/* Direct Native Camera Snap Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFile}
              className="px-5 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black rounded-2xl text-sm shadow-xl active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>{isProcessingFile ? '⏳ កំពុងដំណើរការ...' : '📸 ថតរូបស្កេនឥឡូវនេះ (Camera)'}</span>
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              muted
              playsInline
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Target Reticle / Viewfinder Frame */}
            <div className="relative w-64 h-64 border-2 border-cyan-400 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)]">
              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-cyan-400 rounded-tl-xl -mt-1 -ml-1" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-cyan-400 rounded-tr-xl -mt-1 -mr-1" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-cyan-400 rounded-bl-xl -mb-1 -ml-1" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-cyan-400 rounded-br-xl -mb-1 -mr-1" />

              {/* Animated Laser Scan Line */}
              <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_rgba(6,182,212,1)] animate-bounce" />
            </div>

            {/* Hint overlay */}
            <div className="absolute bottom-3 px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-[11px] font-bold text-cyan-200 border border-cyan-500/30">
              តម្រង់កាមេរ៉ាលើ QR Code វិក្កយបត្រ
            </div>
          </>
        )}
      </div>

      {/* Dual Scan Options at Bottom */}
      <div className="w-full max-w-sm mt-3 px-1 flex flex-col gap-2">
        {!hasCameraError && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessingFile}
            className="w-full py-2.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <span>📸</span>
            <span>{isProcessingFile ? 'កំពុងអានរូបភាព...' : 'ឬថតរូបផ្ទាល់ពី Camera ទូរស័ព្ទ'}</span>
          </button>
        )}

        <div className="text-center text-[11px] text-slate-400">
          ស្កេនបានលឿន ០.១ វិនាទី & អាចស្កេនវិក្កយបត្រគ្រប់ប្រភេទ!
        </div>
      </div>
    </div>
  );
}
