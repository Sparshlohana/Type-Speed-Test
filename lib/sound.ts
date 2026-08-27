/**
 * Synthesized key feedback.
 *
 * Oscillator envelopes rather than audio files: nothing to download, nothing to bundle,
 * and the click can be tuned by editing two numbers.
 */

type Voice = "key" | "error";

let context: AudioContext | null = null;

/** Browsers refuse to start audio before a gesture, so the context is built on first use. */
function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

const VOICES: Record<Voice, { frequency: number; duration: number; gain: number; type: OscillatorType }> = {
  key: { frequency: 880, duration: 0.035, gain: 0.06, type: "triangle" },
  error: { frequency: 180, duration: 0.09, gain: 0.09, type: "sine" },
};

export function playSound(voice: Voice): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const { frequency, duration, gain, type } = VOICES[voice];
  const now = ctx.currentTime;

  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  // Slight downward glide keeps repeated clicks from sounding mechanical.
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + duration);

  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(gain, now + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(envelope).connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}
