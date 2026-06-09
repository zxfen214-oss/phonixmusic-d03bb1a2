import { useEffect, useState, useCallback } from "react";
import {
  isKaraokeEnabled,
  setKaraokeEnabled,
  subscribeKaraoke,
} from "@/lib/karaokeAudio";

export function useKaraokeMode(): [boolean, (next?: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => isKaraokeEnabled());

  useEffect(() => subscribeKaraoke(setOn), []);

  const toggle = useCallback((next?: boolean) => {
    const target = typeof next === "boolean" ? next : !isKaraokeEnabled();
    setKaraokeEnabled(target);
  }, []);

  return [on, toggle];
}
