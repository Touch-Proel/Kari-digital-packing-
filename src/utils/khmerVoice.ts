// 🔊 High-Fidelity Khmer Voice & Loud Audio Announcement System for AI Slip Scanning
import { playPureTone } from './audio';

const STORAGE_KEY_VOICE_ENABLED = 'kari_pos_ai_slip_voice_enabled';
const STORAGE_KEY_VOICE_VOLUME = 'kari_pos_ai_slip_voice_volume';

let audioCtx: AudioContext | null = null;
let speechQueue: Promise<void> = Promise.resolve();
const recentlySpokenKeys = new Set<string>();

// Get or resume Web Audio Context
function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// User-friendly voice settings
export function isSlipVoiceEnabled(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY_VOICE_ENABLED);
    return val !== 'false'; // Default to enabled
  } catch {
    return true;
  }
}

export function setSlipVoiceEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_VOICE_ENABLED, enabled ? 'true' : 'false');
  } catch {}
}

export function getSlipVoiceVolume(): number {
  try {
    const val = localStorage.getItem(STORAGE_KEY_VOICE_VOLUME);
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) return Math.min(Math.max(num, 0.5), 2.5);
    }
  } catch {}
  return 1.6; // Boosted volume for warehouse / shop environment
}

export function setSlipVoiceVolume(vol: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_VOICE_VOLUME, String(vol));
  } catch {}
}

// Normalize bank names for crystal-clear Khmer TTS pronunciation
export function normalizeBankNameForKhmer(bankName?: string): string {
  if (!bankName) return '';
  const clean = bankName.trim().toUpperCase();
  if (clean.includes('ABA')) return 'អេប៊ីអេ';
  if (clean.includes('ACLEDA') || clean.includes('អេស៊ីលីដា')) return 'អេស៊ីលីដា';
  if (clean.includes('WING') || clean.includes('វីង')) return 'វីង';
  if (clean.includes('BAKONG') || clean.includes('បាគង') || clean.includes('KHQR')) return 'បាគង';
  if (clean.includes('CANADIA') || clean.includes('កាណាឌីយ៉ា')) return 'កាណាឌីយ៉ា';
  if (clean.includes('TRUE') || clean.includes('TRUEMONEY')) return 'ទ្រូម៉ាន់នី';
  if (clean.includes('SATHAPANA')) return 'ស្ថាបនា';
  if (clean.includes('CHIP MONG') || clean.includes('CHIPMONG')) return 'ជីប ម៉ុង';
  if (clean.includes('FTB')) return 'អេហ្វធីប៊ី';
  return bankName.trim();
}

// Format natural Khmer announcement sentence
export function formatKhmerSlipAnnouncement(slip: {
  customer_name?: string;
  paid_amount?: number;
  currency?: string;
  bank_name?: string;
  basket_no?: number | string;
}): string {
  let name = (slip.customer_name || '').trim();
  // Filter out system placeholders
  if (!name || name === 'Facebook Customer' || name === 'FB_USER' || name === 'អតិថិជន Messenger') {
    name = 'អតិថិជន';
  }

  const amt = Number(slip.paid_amount) || 0;
  const curr = (slip.currency || 'USD').toUpperCase();
  const currText = curr === 'KHR' ? 'រៀល' : 'ដុល្លារ';
  
  // Format amount cleanly
  const amtFormatted = amt % 1 === 0 ? amt.toString() : amt.toFixed(2);
  const normalizedBank = normalizeBankNameForKhmer(slip.bank_name);
  const bankPart = normalizedBank ? `តាម ${normalizedBank}` : '';
  const basketPart = slip.basket_no ? `កន្ត្រក ${slip.basket_no}, ` : '';

  return `${basketPart}ទទួលបានប្រាក់ពី ${name} ចំនួន ${amtFormatted} ${currText} ${bankPart}`.trim();
}

// 🔔 Pleasant 2-Note Chime before voice (Ding-Dong)
export function playDingDongChime(volume: number = 0.3) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Note 1: High crisp bell (880Hz / A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(volume, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);

    // Note 2: Harmonious lower chime (587.33Hz / D5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(587.33, now + 0.16);
    gain2.gain.setValueAtTime(volume * 0.9, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.16);
    osc2.stop(now + 0.66);
  } catch {
    // fallback
    playPureTone(880, 0.15);
  }
}

// 🔊 Speak Khmer Text Loudly with Web Audio Volume Booster & Queue
export async function speakKhmerLoudly(
  text: string,
  options?: { volume?: number; playChime?: boolean }
): Promise<void> {
  if (!text || !text.trim()) return;

  // Enqueue sequentially to prevent overlapping voices
  speechQueue = speechQueue.then(async () => {
    try {
      const vol = options?.volume !== undefined ? options.volume : getSlipVoiceVolume();
      const shouldChime = options?.playChime !== false;

      if (shouldChime) {
        playDingDongChime(0.25 * Math.min(vol, 1.5));
        // Slight pause after chime before speaking
        await new Promise(r => setTimeout(r, 380));
      }

      const ctx = getAudioContext();
      if (!ctx) {
        playBrowserSpeechFallback(text);
        return;
      }

      // Fetch high-fidelity Google Khmer TTS audio from server proxy
      const res = await fetch(`/api/tts?text=${encodeURIComponent(text.trim())}&lang=km`);
      if (!res.ok) {
        throw new Error(`TTS server returned ${res.status}`);
      }

      const arrayBuf = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuf);

      await new Promise<void>((resolve) => {
        try {
          const source = ctx.createBufferSource();
          const gainNode = ctx.createGain();

          // Boosted gain for loud speech
          gainNode.gain.setValueAtTime(Math.min(vol, 2.5), ctx.currentTime);

          source.buffer = audioBuffer;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          source.onended = () => {
            // Short grace period before next queue item
            setTimeout(resolve, 200);
          };

          source.start();
        } catch {
          resolve();
        }
      });
    } catch (err) {
      console.warn('[KhmerVoice] Upstream TTS error, using fallback:', err);
      playBrowserSpeechFallback(text);
    }
  }).catch(() => {});

  return speechQueue;
}

// Fallback to Web Speech API if offline
function playBrowserSpeechFallback(text: string) {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'km-KH';
      utter.rate = 0.95;
      utter.volume = 1.0;
      window.speechSynthesis.speak(utter);
    }
  } catch {}
}

// Announce Slip Scanned (with deduplication lock so same slip is never read twice)
export function announceSlipScanned(slip: {
  id?: string;
  trans_ref?: string;
  customer_name?: string;
  paid_amount?: number;
  currency?: string;
  bank_name?: string;
  basket_no?: number | string;
}): void {
  if (!isSlipVoiceEnabled()) return;

  const dedupeKey = slip.trans_ref || slip.id || `${slip.customer_name}_${slip.paid_amount}_${slip.basket_no}`;
  if (dedupeKey && recentlySpokenKeys.has(dedupeKey)) {
    return; // Already spoken
  }

  if (dedupeKey) {
    recentlySpokenKeys.add(dedupeKey);
    // Evict after 5 minutes
    setTimeout(() => {
      recentlySpokenKeys.delete(dedupeKey);
    }, 5 * 60 * 1000);
  }

  const speechText = formatKhmerSlipAnnouncement(slip);
  speakKhmerLoudly(speechText, { playChime: true });
}

// 🧪 Test button helper
export function testKhmerVoicePlayback(customText?: string): void {
  const sample = customText || 'សួស្តីបង! ទទួលបានប្រាក់ពី សុង អេនជី ចំនួន ដប់ប្រាំដុល្លារ តាម អេប៊ីអេ!';
  speakKhmerLoudly(sample, { playChime: true });
}
