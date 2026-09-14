let audioCtx: AudioContext | null = null;

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
  } catch (e) {
    return null;
  }
}

export function playPureTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal: number = 0.15) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // ignore audio errors
  }
}

export function playSuccessFanfare() {
  playPureTone(523, 0.08);
  setTimeout(() => playPureTone(659, 0.08), 70);
  setTimeout(() => playPureTone(783, 0.10), 140);
  setTimeout(() => playPureTone(1046, 0.22), 210);
}

export function playWarningBuzzer() {
  playPureTone(320, 0.12, 'sawtooth');
  setTimeout(() => playPureTone(240, 0.20, 'sawtooth'), 120);
}
