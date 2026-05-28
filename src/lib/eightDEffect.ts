/**
 * 8D / "Lossless Effect" — rotating stereo pan using Web Audio API.
 * Inspired by https://github.com/Nikola-Mircic/8d-converter
 *
 * For each HTMLAudioElement we route it through a shared AudioContext via
 * MediaElementAudioSourceNode -> StereoPannerNode -> destination. An LFO
 * (low-frequency oscillator) drives the pan in a continuous sweep so the
 * audio appears to rotate around the listener.
 *
 * MediaElementSource can only be created ONCE per audio element, so we
 * remember the wiring in a WeakMap. Toggling 8D just enables/disables the
 * LFO gain — the audio stays routed through the context either way.
 */

const PERIOD_SECONDS = 8; // one full rotation per 8s — classic 8D feel

interface Wiring {
  source: MediaElementAudioSourceNode;
  panner: StereoPannerNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  enabled: boolean;
}

const map = new WeakMap<HTMLAudioElement, Wiring>();
let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedCtx) return sharedCtx;
  const Ctor: typeof AudioContext | undefined =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  sharedCtx = new Ctor();
  return sharedCtx;
}

function ensureWired(audio: HTMLAudioElement): Wiring | null {
  const existing = map.get(audio);
  if (existing) return existing;

  const ctx = getCtx();
  if (!ctx) return null;

  let source: MediaElementAudioSourceNode;
  try {
    source = ctx.createMediaElementSource(audio);
  } catch (e) {
    // Already wired by another caller, or browser refused — give up gracefully.
    console.warn("[8D] could not create MediaElementSource:", e);
    return null;
  }

  const panner = ctx.createStereoPanner();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  lfo.type = "sine";
  lfo.frequency.value = 1 / PERIOD_SECONDS;
  lfoGain.gain.value = 0; // start disabled

  source.connect(panner).connect(ctx.destination);
  lfo.connect(lfoGain).connect(panner.pan);
  try { lfo.start(); } catch {}

  const wiring: Wiring = { source, panner, lfo, lfoGain, enabled: false };
  map.set(audio, wiring);
  return wiring;
}

export function applyEightDToAudio(audio: HTMLAudioElement | null, enabled: boolean) {
  if (!audio) return;
  const wiring = ensureWired(audio);
  if (!wiring) return;
  const ctx = getCtx();
  if (!ctx) return;

  // AudioContext often starts suspended until a user gesture. Resume on demand.
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  if (enabled) {
    wiring.lfoGain.gain.cancelScheduledValues(now);
    wiring.lfoGain.gain.setTargetAtTime(1, now, 0.05);
  } else {
    wiring.lfoGain.gain.cancelScheduledValues(now);
    wiring.lfoGain.gain.setTargetAtTime(0, now, 0.05);
    // Re-center the pan after the LFO fades out.
    wiring.panner.pan.cancelScheduledValues(now);
    wiring.panner.pan.setTargetAtTime(0, now + 0.1, 0.1);
  }
  wiring.enabled = enabled;
}
