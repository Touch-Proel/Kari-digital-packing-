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

// 📳 Mobile Haptic Vibration Alert (Works on Chrome/Safari/Android/PWA)
export function triggerHapticAlert(pattern: number[] = [150, 70, 150, 70, 300]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    // ignore vibration failure
  }
}

// 🚨 High-Alert Collision Warning: Harsh Buzzer Sound + Strong Phone Vibration
export function playCollisionAlert() {
  playWarningBuzzer();
  triggerHapticAlert([180, 80, 180, 80, 350]);
}

// 🔓 Unlock Web Audio API on first user tap (required for iOS/Chrome autoplay rules)
export function unlockAudioContext() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // ignore
  }
}

// 📻 Short Walkie-Talkie PTT Chirp (Start / End transmission cue)
export function playWalkieBeep(mode: 'start' | 'end' = 'start') {
  try {
    if (mode === 'start') {
      playPureTone(980, 0.045, 'sine', 0.14);
      setTimeout(() => playPureTone(1340, 0.055, 'sine', 0.16), 45);
    } else {
      playPureTone(1180, 0.045, 'sine', 0.12);
      setTimeout(() => playPureTone(780, 0.06, 'sine', 0.12), 45);
    }
  } catch {
    // ignore
  }
}

// 🪈 Crisp Referee / Coach Whistle Nudge (Dual-tone trill modulated via Web Audio)
export function playCoachWhistle() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = 0.72;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const masterGain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(2820, now);
    osc2.frequency.setValueAtTime(3040, now);

    // Classic pea-whistle rapid trill (~30Hz modulation)
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(30, now);
    lfoGain.gain.setValueAtTime(190, now);

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    // Sharp attack, strong sustain, clean tail
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.24, now + 0.025);
    masterGain.gain.setValueAtTime(0.22, now + 0.28);
    masterGain.gain.linearRampToValueAtTime(0.06, now + 0.34);
    masterGain.gain.linearRampToValueAtTime(0.26, now + 0.38);
    masterGain.gain.setValueAtTime(0.24, now + 0.62);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(masterGain);
    osc2.connect(masterGain);
    masterGain.connect(ctx.destination);

    lfo.start(now);
    osc1.start(now);
    osc2.start(now);

    lfo.stop(now + duration);
    osc1.stop(now + duration);
    osc2.stop(now + duration);

    triggerHapticAlert([120, 60, 240]);
  } catch {
    // ignore audio errors
  }
}

