/**
 * Offline audio cache manager
 * Handles downloading and caching MP3 files for offline playback
 */

const CACHE_STORE = 'cachedAudio';
const DB_NAME = 'phonix-music-db';
const DB_VERSION = 2; // Increment version to add new store

let dbInstance: IDBDatabase | null = null;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance && dbInstance.objectStoreNames.contains(CACHE_STORE)) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Existing stores (from database.ts)
      if (!db.objectStoreNames.contains('tracks')) {
        const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
        trackStore.createIndex('by-artist', 'artist');
        trackStore.createIndex('by-album', 'album');
        trackStore.createIndex('by-addedAt', 'addedAt');
      }

      if (!db.objectStoreNames.contains('playlists')) {
        const playlistStore = db.createObjectStore('playlists', { keyPath: 'id' });
        playlistStore.createIndex('by-name', 'name');
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('audioFiles')) {
        db.createObjectStore('audioFiles', { keyPath: 'trackId' });
      }

      // New cached audio store for offline playback
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const cacheStore = db.createObjectStore(CACHE_STORE, { keyPath: 'youtubeId' });
        cacheStore.createIndex('by-cachedAt', 'cachedAt');
        cacheStore.createIndex('by-size', 'size');
      }
    };
  });
}

export interface CachedAudio {
  youtubeId: string;
  audioBlob: Blob;
  mimeType: string;
  size: number;
  cachedAt: Date;
  title: string;
  artist: string;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  karaokeData?: any | null;
  karaokeEnabled?: boolean | null;
  lyricsSpeed?: number | null;
  bounceIntensity?: number | null;
}

export interface CacheInfo {
  youtubeId: string;
  size: number;
  cachedAt: Date;
  title: string;
  artist: string;
  hasSyncedLyrics: boolean;
}

/**
 * Check if audio is cached for a YouTube ID
 */
export async function isAudioCached(youtubeId: string): Promise<boolean> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const request = store.get(youtubeId);

      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return false;
  }
}

/**
 * Get cached lyrics for a YouTube ID
 */
export async function getCachedLyrics(youtubeId: string): Promise<{ syncedLyrics: string | null; plainLyrics: string | null } | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const request = store.get(youtubeId);

      request.onsuccess = () => {
        const result = request.result as CachedAudio | undefined;
        if (result) {
          resolve({ syncedLyrics: result.syncedLyrics || null, plainLyrics: result.plainLyrics || null });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/**
 * Get cached audio blob for a YouTube ID
 */
export async function getCachedAudio(youtubeId: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const request = store.get(youtubeId);

      request.onsuccess = () => {
        const result = request.result as CachedAudio | undefined;
        resolve(result?.audioBlob || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/**
 * Save audio to cache
 */
export interface CacheExtras {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  karaokeData?: any | null;
  karaokeEnabled?: boolean | null;
  lyricsSpeed?: number | null;
  bounceIntensity?: number | null;
}

export async function cacheAudio(
  youtubeId: string,
  audioBlob: Blob,
  title: string,
  artist: string,
  extras: CacheExtras = {}
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    const store = tx.objectStore(CACHE_STORE);
    
    const cachedAudio: CachedAudio = {
      youtubeId,
      audioBlob,
      mimeType: audioBlob.type || 'audio/mpeg',
      size: audioBlob.size,
      cachedAt: new Date(),
      title,
      artist,
      syncedLyrics: extras.syncedLyrics ?? null,
      plainLyrics: extras.plainLyrics ?? null,
      karaokeData: extras.karaokeData ?? null,
      karaokeEnabled: extras.karaokeEnabled ?? null,
      lyricsSpeed: extras.lyricsSpeed ?? null,
      bounceIntensity: extras.bounceIntensity ?? null,
    };
    
    const request = store.put(cachedAudio);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove cached audio
 */
export async function removeCachedAudio(youtubeId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    const store = tx.objectStore(CACHE_STORE);
    const request = store.delete(youtubeId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all cached audio info (without blob data for efficiency)
 */
export async function getAllCachedInfo(): Promise<CacheInfo[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result as CachedAudio[]).map(item => ({
          youtubeId: item.youtubeId,
          size: item.size,
          cachedAt: new Date(item.cachedAt),
          title: item.title,
          artist: item.artist,
          hasSyncedLyrics: !!item.syncedLyrics,
        }));
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/**
 * Get total cache size in bytes
 */
export async function getTotalCacheSize(): Promise<number> {
  const cached = await getAllCachedInfo();
  return cached.reduce((total, item) => total + item.size, 0);
}

/**
 * Clear all cached audio
 */
export async function clearAllCachedAudio(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    const store = tx.objectStore(CACHE_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Download and cache audio from URL
 */
export async function downloadAndCacheAudio(
  audioUrl: string,
  youtubeId: string,
  title: string,
  artist: string,
  onProgress?: (progress: number) => void,
  extras: CacheExtras = {}
): Promise<boolean> {
  try {
    const response = await fetch(audioUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const chunks: ArrayBuffer[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      // Convert Uint8Array to ArrayBuffer
      chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      received += value.length;
      
      if (total && onProgress) {
        onProgress((received / total) * 100);
      }
    }

    const blob = new Blob(chunks, { type: 'audio/mpeg' });
    await cacheAudio(youtubeId, blob, title, artist, extras);
    
    return true;
  } catch (error) {
    console.error('Failed to download and cache audio:', error);
    return false;
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
