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
      
      // Check if audio URL exists in database — use limit(1) to handle duplicates
      const { data } = await supabase
        .from('songs')
        .select('audio_url')
        .eq('youtube_id', track.youtubeId)
        .not('audio_url', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1);

      const audioUrl = data?.[0]?.audio_url || null;

      setStatus(prev => ({
        ...prev,
        isAvailable: !!audioUrl,
        isCached: cached,
        audioUrl,
      }));
    };

    checkStatus();
  }, [track?.youtubeId]);

  // Download audio for offline use (with lyrics bundled)
  const downloadForOffline = useCallback(async () => {
    if (!track?.youtubeId || !status.audioUrl) return false;

    setStatus(prev => ({ ...prev, isDownloading: true, downloadProgress: 0 }));

    try {
      // Fetch lyrics + karaoke from songs table to bundle for offline use
      let syncedLyrics: string | null = null;
      let plainLyrics: string | null = null;
      let karaokeData: any | null = null;
      let karaokeEnabled = false;
      let lyricsSpeed: number | null = null;
      let bounceIntensity: number | null = null;

      const { data: songData } = await supabase
        .from('songs')
        .select('synced_lyrics, plain_lyrics, karaoke_data, karaoke_enabled, lyrics_speed, bounce_intensity')
        .eq('youtube_id', track.youtubeId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (songData) {
        syncedLyrics = (songData as any).synced_lyrics || null;
        plainLyrics = (songData as any).plain_lyrics || null;
        karaokeData = (songData as any).karaoke_data || null;
        karaokeEnabled = !!(songData as any).karaoke_enabled;
        lyricsSpeed = (songData as any).lyrics_speed ?? null;
        bounceIntensity = (songData as any).bounce_intensity ?? null;
      }

      const success = await downloadAndCacheAudio(
        status.audioUrl,
        track.youtubeId,
        track.title,
        track.artist,
        (progress) => {
          setStatus(prev => ({ ...prev, downloadProgress: progress }));
        },
        { syncedLyrics, plainLyrics, karaokeData, karaokeEnabled, lyricsSpeed, bounceIntensity }
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
