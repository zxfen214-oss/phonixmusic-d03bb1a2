import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { Track, Playlist } from "@/types/music";
import { 
  getAllTracks, 
  getAllPlaylists, 
  saveTrack, 
  saveTracks,
  deleteTrack as dbDeleteTrack,
  savePlaylist,
  deletePlaylist as dbDeletePlaylist,
  updateTrack,
} from "@/lib/database";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface LibraryContextType {
  tracks: Track[];
  playlists: Playlist[];
  isLoading: boolean;
  addTrack: (track: Track) => Promise<void>;
  addTracks: (tracks: Track[]) => Promise<void>;
  removeTrack: (id: string) => Promise<void>;
  updateTrackMetadata: (id: string, updates: Partial<Track>) => Promise<void>;
  addPlaylist: (playlist: Playlist) => Promise<void>;
  removePlaylist: (id: string) => Promise<void>;
  refreshLibrary: () => Promise<void>;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedTracks, loadedPlaylists] = await Promise.all([
        getAllTracks(),
        getAllPlaylists(),
      ]);
      setTracks(loadedTracks);
      setPlaylists(loadedPlaylists);
      return loadedTracks;
    } catch (error) {
      console.error('Failed to load library:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync all existing local tracks to user_song_library when user logs in
  const syncAllTracksToLibrary = useCallback(async (tracksToSync: Track[]) => {
    if (!user || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    
    const youtubeTracksToSync = tracksToSync.filter(track => track.youtubeId);
    if (youtubeTracksToSync.length === 0) return;
    
    try {
      // Batch upsert all tracks
      const entries = youtubeTracksToSync.map(track => ({
        user_id: user.id,
        song_youtube_id: track.youtubeId!,
        song_title: track.title,
        song_artist: track.artist,
      }));
      
      const { error } = await supabase
        .from("user_song_library")
        .upsert(entries, { onConflict: 'user_id,song_youtube_id' });
      
      if (error) {
        console.error("Failed to sync tracks to library:", error);
      } else {
        console.log(`Synced ${entries.length} tracks to user library`);
      }
    } catch (error) {
      console.error("Failed to sync tracks to library:", error);
    }
  }, [user]);

  useEffect(() => {
    loadLibrary().then((loadedTracks) => {
      // Sync all tracks to Supabase when user is logged in
      if (user && loadedTracks.length > 0) {
        syncAllTracksToLibrary(loadedTracks);
      }
    });
  }, [loadLibrary, user, syncAllTracksToLibrary]);

  // Sync track to user_song_library for logged-in users
  const syncTrackToLibrary = useCallback(async (track: Track) => {
    if (!user || !track.youtubeId || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    
    try {
      await supabase
        .from("user_song_library")
        .upsert({
          user_id: user.id,
          song_youtube_id: track.youtubeId,
          song_title: track.title,
          song_artist: track.artist,
        }, { onConflict: 'user_id,song_youtube_id' });
    } catch (error) {
      console.error("Failed to sync track to library:", error);
    }
  }, [user]);

  const removeTrackFromLibrary = useCallback(async (track: Track) => {
    if (!user || !track.youtubeId || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    
    try {
      await supabase
        .from("user_song_library")
        .delete()
        .eq("user_id", user.id)
        .eq("song_youtube_id", track.youtubeId);
    } catch (error) {
      console.error("Failed to remove track from library:", error);
    }
  }, [user]);

  const addTrack = useCallback(async (track: Track) => {
    await saveTrack(track);
    setTracks(prev => [track, ...prev]);
    // Sync to user_song_library
    await syncTrackToLibrary(track);
  }, [syncTrackToLibrary]);

  const addTracks = useCallback(async (newTracks: Track[]) => {
    await saveTracks(newTracks);
    setTracks(prev => [...newTracks, ...prev]);
    // Sync all YouTube tracks to user_song_library
    for (const track of newTracks) {
      await syncTrackToLibrary(track);
    }
  }, [syncTrackToLibrary]);

  const removeTrack = useCallback(async (id: string) => {
    // Find the track before deleting so we can remove from library
    const trackToRemove = tracks.find(t => t.id === id);
    await dbDeleteTrack(id);
    setTracks(prev => prev.filter(t => t.id !== id));
    // Remove from user_song_library
    if (trackToRemove) {
      await removeTrackFromLibrary(trackToRemove);
    }
  }, [tracks, removeTrackFromLibrary]);

  const updateTrackMetadata = useCallback(async (id: string, updates: Partial<Track>) => {
    await updateTrack(id, updates);
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const addPlaylist = useCallback(async (playlist: Playlist) => {
    await savePlaylist(playlist);
    setPlaylists(prev => [playlist, ...prev]);
  }, []);

  const removePlaylist = useCallback(async (id: string) => {
    await dbDeletePlaylist(id);
    setPlaylists(prev => prev.filter(p => p.id !== id));
  }, []);

  const refreshLibrary = useCallback(async () => {
    await loadLibrary();
  }, [loadLibrary]);

  return (
    <LibraryContext.Provider
      value={{
        tracks,
        playlists,
        isLoading,
        addTrack,
        addTracks,
        removeTrack,
        updateTrackMetadata,
        addPlaylist,
        removePlaylist,
        refreshLibrary,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (context === undefined) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return context;
}
