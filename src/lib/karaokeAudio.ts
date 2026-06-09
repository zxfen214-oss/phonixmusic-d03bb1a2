/**
 * Real-time vocal cancellation ("karaoke mode") using Web Audio API.
 *
 * Trick: most commercial mixes place lead vocals dead-center in the stereo
 * image. Subtracting Right from Left removes whatever is identical in both
 * channels — usually the vocal — while leaving the panned instruments intact.
 *
 * We additionally low-pass the original mono sum and add it back in, so the
 * bass (which is also center-panned but musically important) is preserved.
 */

type Listener = (enabled: boolean) => void;

let ctx: AudioContext | null = null;
let enabled = false;
const listeners = new Set<Listener>();

interface Attachment {
  source: MediaElementAudioSourceNode;
  bypassGain: GainNode;     // direct stereo path
  karaokeGain: GainNode;    // vocal-cancelled path
  makeupGain: GainNode;     // final volume compensation
}

// Cache the graph per <audio> element — MediaElementSource can only be created once per element.
const attachments = new WeakMap<HTMLAudioElement, Attachment>();

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor = (window.AudioContext || (window as any).webkitAudioContext);
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function applyEnabledState(a: Attachment) {
  // Crossfade between bypass and karaoke paths for a click-free switch.
  const t = ctx!.currentTime;
  const ramp = 0.04;
  a.bypassGain.gain.cancelScheduledValues(t);
  a.karaokeGain.gain.cancelScheduledValues(t);
  a.bypassGain.gain.linearRampToValueAtTime(enabled ? 0 : 1, t + ramp);
  a.karaokeGain.gain.linearRampToValueAtTime(enabled ? 1 : 0, t + ramp);
  // Karaoke path tends to lose a few dB of perceived loudness — boost slightly.
  a.makeupGain.gain.linearRampToValueAtTime(enabled ? 1.35 : 1.0, t + ramp);
}

/**
 * Wire an <audio> element through the karaoke graph.
 * Safe to call repeatedly with the same element.
 * Requires the audio element to be loaded with CORS access (crossOrigin="anonymous").
 */
export function attachKaraoke(audio: HTMLAudioElement): boolean {
  const context = ensureCtx();
  if (!context) return false;
  if (attachments.has(audio)) {
    // Already attached — re-apply current state in case context was suspended.
    applyEnabledState(attachments.get(audio)!);
    if (context.state === "suspended") context.resume().catch(() => {});
    return true;
  }

  try {
    const source = context.createMediaElementSource(audio);

    // --- Bypass path: source -> bypassGain -> makeupGain
    const bypassGain = context.createGain();
    bypassGain.gain.value = enabled ? 0 : 1;

    // --- Karaoke path: split stereo, invert R, sum to mono => center-cancelled
    const splitter = context.createChannelSplitter(2);
    const invertR = context.createGain();
    invertR.gain.value = -1;

    // Sum L + (-R) into a mono node by routing both into a 1-channel merger via gains.
    const sumGainL = context.createGain();
    sumGainL.gain.value = 1;
    const sumGainR = context.createGain();
    sumGainR.gain.value = 1;

    const monoMerger = context.createChannelMerger(1);

    // Bass preservation: low-pass the original mono sum and feed it back in.
    const bassSumL = context.createGain();
    bassSumL.gain.value = 0.5;
    const bassSumR = context.createGain();
    bassSumR.gain.value = 0.5;
    const bassLowpass = context.createBiquadFilter();
    bassLowpass.type = "lowpass";
    bassLowpass.frequency.value = 180;
    bassLowpass.Q.value = 0.7;

    const karaokeGain = context.createGain();
    karaokeGain.gain.value = enabled ? 1 : 0;

    // Final makeup gain feeding destination.
    const makeupGain = context.createGain();
    makeupGain.gain.value = enabled ? 1.35 : 1.0;

    // Build bypass path
    source.connect(bypassGain);
    bypassGain.connect(makeupGain);

    // Build karaoke path
    source.connect(splitter);
    splitter.connect(sumGainL, 0);
    splitter.connect(invertR, 1);
    invertR.connect(sumGainR);
    sumGainL.connect(monoMerger, 0, 0);
    sumGainR.connect(monoMerger, 0, 0);

    // Bass-preservation: take both channels (positive), low-pass, mix in.
    splitter.connect(bassSumL, 0);
    splitter.connect(bassSumR, 1);
    bassSumL.connect(bassLowpass);
    bassSumR.connect(bassLowpass);
    bassLowpass.connect(monoMerger, 0, 0);

    monoMerger.connect(karaokeGain);
    karaokeGain.connect(makeupGain);

    makeupGain.connect(context.destination);

    if (context.state === "suspended") context.resume().catch(() => {});

    attachments.set(audio, { source, bypassGain, karaokeGain, makeupGain });
    return true;
  } catch (err) {
    // Most common cause: audio element wasn't loaded with crossOrigin="anonymous"
    // and the browser refuses to expose the decoded samples to Web Audio.
    console.warn("[karaoke] could not attach to audio element:", err);
    return false;
  }
}

export function setKaraokeEnabled(next: boolean) {
  if (enabled === next) return;
  enabled = next;
  const context = ensureCtx();
  if (context && context.state === "suspended") context.resume().catch(() => {});
  // Walk all live attachments — we don't keep a list, so we rely on the caller
  // having attached the currently-playing element. Re-apply via a tiny tick:
  // we expose an updater that any attached element can pull on next attach.
  // For now, the active element's attachment is updated lazily when it next
  // calls attachKaraoke OR via the broadcast below.
  broadcast();
}

export function isKaraokeEnabled(): boolean {
  return enabled;
}

export function subscribeKaraoke(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function broadcast() {
  for (const fn of listeners) {
    try {
      fn(enabled);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Apply the current enabled state to a specific element's graph. Call this
 * from the audio hook whenever the user toggles karaoke, so the live element
 * crossfades immediately.
 */
export function syncKaraokeFor(audio: HTMLAudioElement) {
  const a = attachments.get(audio);
  if (a && ctx) applyEnabledState(a);
}
