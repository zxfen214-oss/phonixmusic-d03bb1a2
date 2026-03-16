import { useState, useEffect, useCallback } from 'react';
import { Track } from '@/types/music';
import { supabase } from '@/integrations/supabase/client';
import { 
  isAudioCached, 
  getCachedAudio, 
  downloadAndCacheAudio, 
  removeCachedAudio,
  getCachedLyrics,
  formatBytes 
} from '@/lib/offlineCache';

interface OfflineStatus {
  isAvailable: boolean;
  isCached: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  audioUrl: string | null;
}

export function useOfflineAudio(track: Track | null) {
  const [status, setStatus] = useState<OfflineStatus>({
    isAvailable: false,
    isCached: false,
    isDownloading: false,
    downloadProgress: 0,
    audioUrl: null,
  });

  // Check if track has offline audio available
  useEffect(() => {
    if (!track?.youtubeId) {
      setStatus({
        isAvailable: false,
        isCached: false,
        isDownloading: false,
        downloadProgress: 0,
        audioUrl: null,
      });
      return;
    }

    const checkStatus = async () => {
      // Check if cached locally
      const cached = await isAudioCached(track.youtubeId!);
      
      // Check if audio URL exists in database
      const { data } = await supabase
        .from('songs')
        .select('audio_url')
        .eq('youtube_id', track.youtubeId)
        .maybeSingle();

      setStatus(prev => ({
        ...prev,
        isAvailable: !!data?.audio_url,
        isCached: cached,
        audioUrl: data?.audio_url || null,
      }));
    };

    checkStatus();
  }, [track?.youtubeId]);

  // Download audio for offline use (with lyrics bundled)
  const downloadForOffline = useCallback(async () => {
    if (!track?.youtubeId || !status.audioUrl) return false;

    setStatus(prev => ({ ...prev, isDownloading: true, downloadProgress: 0 }));

    try {
      // Fetch lyrics from songs table to bundle
      let syncedLyrics: string | null = null;
      let plainLyrics: string | null = null;
      
      const { data: songData } = await supabase
        .from('songs')
        .select('synced_lyrics, plain_lyrics')
        .eq('youtube_id', track.youtubeId)
        .maybeSingle();
      
      if (songData) {
        syncedLyrics = songData.synced_lyrics || null;
        plainLyrics = songData.plain_lyrics || null;
      }

      const success = await downloadAndCacheAudio(
        status.audioUrl,
        track.youtubeId,
        track.title,
        track.artist,
        (progress) => {
          setStatus(prev => ({ ...prev, downloadProgress: progress }));
        },
        syncedLyrics,
        plainLyrics
      );

      if (success) {
        setStatus(prev => ({ 
          ...prev, 
          isCached: true, 
          isDownloading: false, 
          downloadProgress: 100 
        }));
      } else {
        setStatus(prev => ({ ...prev, isDownloading: false, downloadProgress: 0 }));
      }

      return success;
    } catch (error) {
      console.error('Download failed:', error);
      setStatus(prev => ({ ...prev, isDownloading: false, downloadProgress: 0 }));
      return false;
    }
  }, [track?.youtubeId, track?.title, track?.artist, status.audioUrl]);

  // Remove from cache
  const removeFromCache = useCallback(async () => {
    if (!track?.youtubeId) return;

    try {
      await removeCachedAudio(track.youtubeId);
      setStatus(prev => ({ ...prev, isCached: false }));
    } catch (error) {
      console.error('Failed to remove from cache:', error);
    }
  }, [track?.youtubeId]);

  // Get cached audio blob for playback
  const getCachedBlob = useCallback(async (): Promise<Blob | null> => {
    if (!track?.youtubeId) return null;
    return getCachedAudio(track.youtubeId);
  }, [track?.youtubeId]);

  return {
    ...status,
    downloadForOffline,
    removeFromCache,
    getCachedBlob,
    formatBytes,
  };
}
