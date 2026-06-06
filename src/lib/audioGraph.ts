/**
 * Shared Web Audio graph for an HTMLAudioElement.
 *
 * Each audio element is wired ONCE (MediaElementAudioSourceNode can only be
 * created once per element). The graph supports two independent effects that
 * can be toggled live:
 *
 *   1. 8D (rotating stereo pan) — via a StereoPannerNode driven by an LFO.
 *   2. Karaoke / vocal removal — via center-channel cancellation (L - R).
 *
 * Routing:
 *
 *   source ──┬──→ directGain ─────────────────┐
 *            │                                │
 *            └──→ splitter                    │
 *                    L ─→ posGain(+1) ─┐      │
 *                    R ─→ negGain(-1) ─┴→ karaokeMix ─→ karaokeMakeup ─→ karaokeOut ─┐
 *                                                                                    ▼
 *                                                                              panner ─→ destination
 *
 * Vocals are usually mixed to the center of a stereo file, so L - R cancels
 * them while preserving stereo-panned instruments. We add a small makeup
 * gain to compensate for the loudness drop.
 */

const EIGHTD_PERIOD_SECONDS = 8;
const KARAOKE_MAKEUP = 1.45; // boost L-R to roughly match original loudness

interface Wiring {
  source: MediaElementAudioSourceNode;
  // Direct passthrough
  directGain: GainNode;
  // Karaoke path
  splitter: ChannelSplitterNode;
  posGain: GainNode;
  negGain: GainNode;
  karaokeMix: GainNode;
  karaokeMakeup: GainNode;
  karaokeOut: GainNode;
  // Shared output stage
  panner: StereoPannerNode;
  // 8D
  lfo: OscillatorNode;
  lfoGain: GainNode;
  eightdEnabled: boolean;
  karaokeEnabled: boolean;
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
    console.warn("[audioGraph] could not create MediaElementSource:", e);
    return null;
  }

  // Direct path
  const directGain = ctx.createGain();
  directGain.gain.value = 1;

  // Karaoke path
  const splitter = ctx.createChannelSplitter(2);
  const posGain = ctx.createGain();
  posGain.gain.value = 1;
  const negGain = ctx.createGain();
  negGain.gain.value = -1;
  const karaokeMix = ctx.createGain();
  karaokeMix.gain.value = 1;
  const karaokeMakeup = ctx.createGain();
  karaokeMakeup.gain.value = KARAOKE_MAKEUP;
  const karaokeOut = ctx.createGain();
  karaokeOut.gain.value = 0; // disabled by default

  // Output stage
  const panner = ctx.createStereoPanner();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = "sine";
  lfo.frequency.value = 1 / EIGHTD_PERIOD_SECONDS;
  lfoGain.gain.value = 0;

  // Wire up
  source.connect(directGain);
  source.connect(splitter);
  splitter.connect(posGain, 0);
  splitter.connect(negGain, 1);
  posGain.connect(karaokeMix);
  negGain.connect(karaokeMix);
  karaokeMix.connect(karaokeMakeup);
  karaokeMakeup.connect(karaokeOut);

  directGain.connect(panner);
  karaokeOut.connect(panner);
  panner.connect(ctx.destination);

  lfo.connect(lfoGain).connect(panner.pan);
  try { lfo.start(); } catch {}

  const wiring: Wiring = {
    source, directGain, splitter, posGain, negGain,
    karaokeMix, karaokeMakeup, karaokeOut,
    panner, lfo, lfoGain,
    eightdEnabled: false, karaokeEnabled: false,
  };
  map.set(audio, wiring);
  return wiring;
}

function resumeIfNeeded() {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

export function applyEightDToAudio(audio: HTMLAudioElement | null, enabled: boolean) {
  if (!audio) return;
  const wiring = ensureWired(audio);
  if (!wiring) return;
  const ctx = getCtx();
  if (!ctx) return;
  resumeIfNeeded();

  const now = ctx.currentTime;
  if (enabled) {
    wiring.lfoGain.gain.cancelScheduledValues(now);
    wiring.lfoGain.gain.setTargetAtTime(1, now, 0.05);
  } else {
    wiring.lfoGain.gain.cancelScheduledValues(now);
    wiring.lfoGain.gain.setTargetAtTime(0, now, 0.05);
    wiring.panner.pan.cancelScheduledValues(now);
    wiring.panner.pan.setTargetAtTime(0, now + 0.1, 0.1);
  }
  wiring.eightdEnabled = enabled;
}

export function applyKaraokeToAudio(audio: HTMLAudioElement | null, enabled: boolean) {
  if (!audio) return;
  const wiring = ensureWired(audio);
  if (!wiring) return;
  const ctx = getCtx();
  if (!ctx) return;
  resumeIfNeeded();

  const now = ctx.currentTime;
  const fade = 0.06; // ~180ms equilibrium — smooth crossfade
  if (enabled) {
    wiring.directGain.gain.cancelScheduledValues(now);
    wiring.karaokeOut.gain.cancelScheduledValues(now);
    wiring.directGain.gain.setTargetAtTime(0, now, fade);
    wiring.karaokeOut.gain.setTargetAtTime(1, now, fade);
  } else {
    wiring.directGain.gain.cancelScheduledValues(now);
    wiring.karaokeOut.gain.cancelScheduledValues(now);
    wiring.directGain.gain.setTargetAtTime(1, now, fade);
    wiring.karaokeOut.gain.setTargetAtTime(0, now, fade);
  }
  wiring.karaokeEnabled = enabled;
}
