/**
 * Session-level event bus for the karaoke (vocal-removal) toggle.
 * Karaoke is not persisted per track — it resets each session.
 */

const EVENT_NAME = "phx-karaoke-change";

let current = false;

export function getKaraokeEnabled(): boolean {
  return current;
}

export function setKaraokeEnabled(enabled: boolean): void {
  current = enabled;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { enabled } }));
  }
}

export function onKaraokeChange(cb: (enabled: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent).detail.enabled);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
