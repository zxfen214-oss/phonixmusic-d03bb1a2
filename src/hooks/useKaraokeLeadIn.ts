import { useEffect, useState } from "react";

const STORAGE_KEY = "karaoke-lead-in-ms";
const DEFAULT_MS = 400;
const EVENT_NAME = "karaoke-lead-in-changed";

export function getKaraokeLeadInMs(): number {
  if (typeof window === "undefined") return DEFAULT_MS;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return DEFAULT_MS;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(5000, n)) : DEFAULT_MS;
}

export function setKaraokeLeadInMs(ms: number) {
  const clamped = Math.max(0, Math.min(5000, Math.round(ms)));
  localStorage.setItem(STORAGE_KEY, String(clamped));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: clamped }));
}

export function useKaraokeLeadIn(): number {
  const [value, setValue] = useState<number>(() => getKaraokeLeadInMs());
  useEffect(() => {
    const onCustom = () => setValue(getKaraokeLeadInMs());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setValue(getKaraokeLeadInMs());
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return value;
}
