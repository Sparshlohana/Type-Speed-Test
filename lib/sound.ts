/**
 * Synthesized key feedback.
 *
 * Oscillator envelopes rather than audio files: nothing to download, nothing to bundle,
 * and the click can be tuned by editing two numbers. Games reuse the same synth for
 * combat feedback, so the arcade never ships an audio asset either.
 */

type Voice = "key" | "error" | "strike" | "wound" | "ability" | "curse" | "victory";

type VoiceDefinition = {
  frequency: number;
  duration: number;
  gain: number;
  type: OscillatorType;
  /** Extra notes as multipliers of `frequency`, played one `duration` apart. */
  sequence?: readonly number[];
};

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

const VOICES: Record<Voice, VoiceDefinition> = {
  key: { frequency: 880, duration: 0.035, gain: 0.06, type: "triangle" },
  error: { frequency: 180, duration: 0.09, gain: 0.09, type: "sine" },
  // Landing a word: bright and short, so a fast combo does not turn into a drone.
  strike: { frequency: 620, duration: 0.05, gain: 0.05, type: "square" },
  // Taking a hit: low enough to feel like the arena shaking with it.
  wound: { frequency: 110, duration: 0.16, gain: 0.11, type: "sawtooth" },
  ability: { frequency: 520, duration: 0.07, gain: 0.07, type: "triangle", sequence: [1, 1.5] },
  curse: { frequency: 300, duration: 0.12, gain: 0.08, type: "sawtooth", sequence: [1, 0.75] },
  victory: { frequency: 523, duration: 0.11, gain: 0.07, type: "triangle", sequence: [1, 1.26, 1.5, 2] },
};

function schedule(ctx: AudioContext, voice: VoiceDefinition, frequency: number, start: number): void {
  const { duration, gain, type } = voice;

  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  // Slight downward glide keeps repeated clicks from sounding mechanical.
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, start + duration);

  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(envelope).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function playSound(voice: Voice): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const definition = VOICES[voice];
  const now = ctx.currentTime;
  const steps = definition.sequence ?? [1];
  for (const [index, multiplier] of steps.entries()) {
    schedule(ctx, definition, definition.frequency * multiplier, now + index * definition.duration);
  }
}
