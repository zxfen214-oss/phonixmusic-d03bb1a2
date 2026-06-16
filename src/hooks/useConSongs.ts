import { useEffect, useState } from "react";

const KEY = "phonix-con-songs-enabled";
const EVENT = "phx-con-enabled-change";

function read(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(KEY);
  return v === null ? true : v === "true";
}

export function setConSongsEnabled(v: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(v));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
}

export function getConSongsEnabled(): boolean {
  return read();
}

export function useConSongsEnabled(): boolean {
  const [v, setV] = useState<boolean>(() => read());
  useEffect(() => {
    const h = (e: Event) => setV((e as CustomEvent).detail);
    const sh = (e: StorageEvent) => {
      if (e.key === KEY) setV(read());
    };
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", sh);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", sh);
    };
  }, []);
  return v;
}

/** A track is considered a CON-category song when its album label
 *  (case-insensitive, trimmed) equals "CON" — admins mark songs via
 *  the album field. */
export function isConTrack(t: { album?: string | null } | null | undefined): boolean {
  if (!t || !t.album) return false;
  return String(t.album).trim().toUpperCase() === "CON";
}

export function filterConTracks<T extends { album?: string | null }>(
  tracks: T[],
  conEnabled: boolean
): T[] {
  if (conEnabled) return tracks;
  return tracks.filter((t) => !isConTrack(t));
}
