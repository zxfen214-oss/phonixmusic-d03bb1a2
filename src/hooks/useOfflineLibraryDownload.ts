import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { downloadAndCacheAudio, isAudioCached } from "@/lib/offlineCache";

interface DownloadableSong {
  youtube_id: string | null;
  title: string;
  artist: string;
  audio_url: string | null;
  synced_lyrics: string | null;
  plain_lyrics: string | null;
}

interface ProgressState {
  total: number;
  completed: number;
  currentTitle: string;
}

export function useOfflineLibraryDownload() {
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({ total: 0, completed: 0, currentTitle: "" });

  const progressPercent = useMemo(() => {
    if (progress.total === 0) return 0;
    return (progress.completed / progress.total) * 100;
  }, [progress]);

  const downloadAllAvailable = useCallback(async () => {
    setIsDownloadingAll(true);

    try {
      const { data, error } = await supabase
        .from("songs")
        .select("youtube_id, title, artist, audio_url, synced_lyrics, plain_lyrics")
        .not("audio_url", "is", null)
        .not("youtube_id", "is", null)
        .eq("needs_metadata", false)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const songs = (data || []) as DownloadableSong[];
      const uncachedSongs: DownloadableSong[] = [];

      for (const song of songs) {
        if (!song.youtube_id || !song.audio_url) continue;
        const cached = await isAudioCached(song.youtube_id);
        if (!cached) uncachedSongs.push(song);
      }

      setProgress({ total: uncachedSongs.length, completed: 0, currentTitle: "" });

      for (let index = 0; index < uncachedSongs.length; index += 1) {
        const song = uncachedSongs[index];
        setProgress({ total: uncachedSongs.length, completed: index, currentTitle: song.title });

        await downloadAndCacheAudio(
          song.audio_url!,
          song.youtube_id!,
          song.title,
          song.artist,
          undefined,
          song.synced_lyrics,
          song.plain_lyrics
        );
      }

      setProgress({ total: uncachedSongs.length, completed: uncachedSongs.length, currentTitle: "" });
      return { success: true, downloaded: uncachedSongs.length };
    } catch (error) {
      console.error("Failed to download offline library:", error);
      return { success: false, downloaded: 0 };
    } finally {
      setIsDownloadingAll(false);
    }
  }, []);

  return {
    isDownloadingAll,
    progress,
    progressPercent,
    downloadAllAvailable,
  };
}
