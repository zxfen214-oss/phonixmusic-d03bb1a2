import { useEffect, useState } from "react";

/**
 * Lightweight localStorage-backed boolean prefs for the lyrics view, with a
 * window event so all subscribers update when Settings changes the value.
 */

const EVENT = "phx-lyrics-prefs-change";

function read(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "true";
}

export function setLyricsPref(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value } }));
}

function useLyricsPref(key: string, fallback: boolean): boolean {
  const [val, setVal] = useState<boolean>(() => read(key, fallback));
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.key === key) setVal(detail.value);
    };
    window.addEventListener(EVENT, handler);
    const storageHandler = (e: StorageEvent) => {
      if (e.key === key) setVal(read(key, fallback));
    };
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, [key, fallback]);
  return val;
}

export const REDUCE_MOTION_KEY = "lyrics-reduce-motion";
export const KARAOKE_FEATURE_KEY = "lyrics-karaoke-enabled";

export const useReduceMotion = () => useLyricsPref(REDUCE_MOTION_KEY, false);
export const useKaraokeFeatureEnabled = () => useLyricsPref(KARAOKE_FEATURE_KEY, true);

export function getReduceMotion() {
  return read(REDUCE_MOTION_KEY, false);
}
export function getKaraokeFeatureEnabled() {
  return read(KARAOKE_FEATURE_KEY, true);
}
