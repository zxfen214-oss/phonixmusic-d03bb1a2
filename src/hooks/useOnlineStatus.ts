import { useEffect, useState } from "react";

/**
 * Reactive online/offline status. Listens to browser events AND polls a tiny
 * fetch to detect "lie-fi" (navigator.onLine=true but no real connectivity).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    let cancelled = false;
    const probe = async () => {
      if (!navigator.onLine) {
        if (!cancelled) setOnline(false);
        return;
      }
      try {
        // Tiny no-cache HEAD-like probe; aborts after 3s.
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 3000);
        await fetch("/favicon.ico?_p=" + Date.now(), {
          method: "GET",
          cache: "no-store",
          signal: ctl.signal,
        });
        clearTimeout(t);
        if (!cancelled) setOnline(true);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    probe();
    const id = setInterval(probe, 15000);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
