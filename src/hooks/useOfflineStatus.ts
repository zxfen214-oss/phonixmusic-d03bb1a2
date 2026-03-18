import { useState, useEffect } from 'react';
import { getAllCachedInfo } from '@/lib/offlineCache';

/** Returns a Set of youtubeIds that are cached offline */
export function useOfflineStatus() {
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      const items = await getAllCachedInfo();
      setCachedIds(new Set(items.map(i => i.youtubeId)));
    }
    load();

    // Re-check periodically (every 10s) to pick up new downloads
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  return cachedIds;
}
