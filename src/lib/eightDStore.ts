/**
 * Per-track persistence + event bus for the "Lossless Effect" (8D) toggle.
 * Stored in IndexedDB via the existing settings store, so it works offline.
 */
import { getSetting, saveSetting } from "@/lib/database";

const KEY_PREFIX = "eightd:";
const EVENT_NAME = "phx-eightd-change";

export async function getEightDEnabled(trackId: string): Promise<boolean> {
  const v = await getSetting<boolean>(KEY_PREFIX + trackId);
  return !!v;
}

export async function setEightDEnabled(trackId: string, enabled: boolean): Promise<void> {
  await saveSetting(KEY_PREFIX + trackId, enabled);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { trackId, enabled } }));
  }
}

export function onEightDChange(
  cb: (detail: { trackId: string; enabled: boolean }) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
