import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "lyrics:lowEndMode";
const EVENT = "lyrics:lowEndMode-change";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * User-facing low-end performance mode. Default: OFF.
 * Persists to localStorage and broadcasts so all consumers stay in sync.
 */
export function usePerformanceMode(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(read);

  useEffect(() => {
    const onChange = () => setEnabled(read());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const set = useCallback((v: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    setEnabled(v);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [enabled, set];
}
