// sound.ts — tiny WebAudio synth for game-like UI feedback.
// No asset files: every sound is generated with oscillators + gain envelopes.
// Respects a global mute flag (toggled from the header). The AudioContext is
// created lazily and resumed on the first user gesture (browser autoplay rule).

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let muted = false;
const MASTER = 0.18; // gentle overall volume

function ensureCtx(): Ctx | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

/** Call once from a user gesture to unlock audio on iOS/Safari. */
export function unlockAudio(): void {
  ensureCtx();
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

interface ToneOpts {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  /** sweep end frequency for little chirps */
  toFreq?: number;
}

function tone({ freq, dur, type = 'sine', gain = 1, delay = 0, toFreq }: ToneOpts): void {
  const ac = ensureCtx();
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (toFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t0 + dur);
  }
  const peak = MASTER * gain;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Soft "tick" — pressing Run. */
export function playTick(): void {
  tone({ freq: 660, toFreq: 880, dur: 0.07, type: 'triangle', gain: 0.7 });
}

/** Pleasant ascending chime — code ran cleanly / training finished. */
export function playSuccess(): void {
  // Major-ish arpeggio.
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'sine', gain: 0.8, delay: i * 0.06 }));
}

/** Low buzz — an error occurred. */
export function playError(): void {
  tone({ freq: 180, toFreq: 110, dur: 0.32, type: 'sawtooth', gain: 0.5 });
  tone({ freq: 90, dur: 0.3, type: 'square', gain: 0.25, delay: 0.02 });
}

/** A subtle blip used when training emits a frame milestone (optional). */
export function playBlip(): void {
  tone({ freq: 880, dur: 0.05, type: 'sine', gain: 0.35 });
}
