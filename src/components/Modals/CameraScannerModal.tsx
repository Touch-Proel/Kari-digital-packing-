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
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasCameraError, setHasCameraError] = useState<string | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isScanning, setIsScanning] = useState(true);

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

  // Start Camera
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    setHasCameraError(null);
    setIsScanning(true);

    const startCamera = async () => {
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
          videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS
          await videoRef.current.play();

          // Check if torch/flash is supported
          const track = stream.getVideoTracks()[0];
          const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
          if (capabilities.torch) {
            setHasTorch(true);
          }

          startScanLoop();
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        setHasCameraError('មិនអាចបើកកាមេរ៉ាបានទេ! សូមអនុញ្ញាតសិទ្ធិ Camera ក្នុង Browser។');
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

  const parseScannedText = (rawText: string): string => {
    const text = rawText.trim();
    // Check if it's a URL (e.g. https://.../?order=2712 or /?open_basket=2712)
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

    // Check if starts with # (e.g. #2712)
    if (text.startsWith('#')) {
      return text.slice(1).trim();
    }

    return text;
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
          setIsScanning(false);
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
      {/* Top Controls */}
      <div className="w-full max-w-sm flex items-center justify-between px-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-black text-white text-sm">📷 ស្កេនកាមេរ៉ា (QR & Barcode)</span>
        </div>

        <div className="flex items-center gap-2">
          {hasTorch && (
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
      <div className="relative w-full max-w-sm aspect-square bg-slate-950 rounded-3xl overflow-hidden border-2 border-cyan-500/60 shadow-[0_0_30px_rgba(6,182,212,0.3)] flex items-center justify-center">
        {hasCameraError ? (
          <div className="text-center p-4">
            <div className="text-3xl mb-2">⚠️</div>
            <div className="text-xs text-rose-300 font-bold mb-3">{hasCameraError}</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white"
            >
              🔄 ព្យាយាមម្តងទៀត
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

      {/* Manual Input Fallback */}
      <div className="w-full max-w-sm mt-3 px-1 text-center">
        <span className="text-[11px] text-slate-400">
          ស្កេនបានលឿន ០.១ វិនាទី & អាចស្កេនវិក្កយបត្រគ្រប់ប្រភេទ!
        </span>
      </div>
    </div>
  );
}
