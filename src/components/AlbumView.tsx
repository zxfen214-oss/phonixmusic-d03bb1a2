import { useEffect, useMemo, useRef, useState } from "react";
import { useLibrary } from "@/contexts/LibraryContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useView } from "@/contexts/ViewContext";
import { useAuth } from "@/contexts/AuthContext";
import { TrackRow } from "./TrackRow";
import { ArrowLeft, Play, Shuffle, Disc3, Image as ImageIcon, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { uploadPublicStorageFile } from "@/lib/storageUploads";
import { toast } from "sonner";
import type { Track } from "@/types/music";

export function AlbumView() {
  const { selectedAlbum, closeDetail } = useView();
  const { tracks } = useLibrary();
  const { playTrack, toggleShuffle, shuffle } = usePlayer();
  const { isAdmin } = useAuth();

  const [dbTracks, setDbTracks] = useState<Track[]>([]);
  const [uploading, setUploading] = useState(false);
  const [coverOverride, setCoverOverride] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch every song in this album from Supabase (not just the user's library).
  useEffect(() => {
    if (!selectedAlbum) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("id,title,artist,album,duration,cover_url,audio_url,youtube_id,lyrics_url,plain_lyrics,synced_lyrics,word_lyrics,is_lossless")
        .ilike("album", selectedAlbum);
      if (error || cancelled || !data) return;
      const mapped: Track[] = data.map((s: any) => ({
        id: s.id,
        title: s.title ?? "Untitled",
        artist: s.artist ?? "Unknown",
        album: s.album ?? selectedAlbum,
        duration: Number(s.duration ?? 0),
        artwork: s.cover_url ?? undefined,
        source: s.youtube_id ? "youtube" : "local",
        youtubeId: s.youtube_id ?? undefined,
        filePath: s.audio_url ?? undefined,
        addedAt: new Date(),
        hasLyrics: Boolean(s.plain_lyrics || s.synced_lyrics || s.word_lyrics || s.lyrics_url),
      }));
      setDbTracks(mapped);
    })();
    return () => { cancelled = true; };
  }, [selectedAlbum]);

  const albumTracks = useMemo(() => {
    if (!selectedAlbum) return [];
    const target = selectedAlbum.trim().toLowerCase();
    const libraryMatches = tracks.filter(t => (t.album || "").trim().toLowerCase() === target);
    // Merge: library entries first (preserves user-local edits), then DB
    // entries not already in library (matched by id or title+artist).
    const seen = new Set(libraryMatches.map(t => t.id));
    const seenKey = new Set(libraryMatches.map(t => `${t.title}|${t.artist}`.toLowerCase()));
    const merged = [...libraryMatches];
    for (const t of dbTracks) {
      const key = `${t.title}|${t.artist}`.toLowerCase();
      if (seen.has(t.id) || seenKey.has(key)) continue;
      merged.push(t);
    }
    return merged;
  }, [tracks, dbTracks, selectedAlbum]);

  const artwork = coverOverride ?? albumTracks.find(t => t.artwork)?.artwork;
  const artist = albumTracks[0]?.artist;

  const handlePlay = () => {
    if (albumTracks.length === 0) return;
    if (shuffle) toggleShuffle();
    playTrack(albumTracks[0], albumTracks);
  };

  const handleShuffle = () => {
    if (albumTracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const rand = albumTracks[Math.floor(Math.random() * albumTracks.length)];
    playTrack(rand, albumTracks);
  };

  const handleCoverPick = () => fileInputRef.current?.click();

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedAlbum) return;
    setUploading(true);
    try {
      const publicUrl = await uploadPublicStorageFile(file, "covers");
      const { error } = await supabase
        .from("songs")
        .update({ cover_url: publicUrl })
        .ilike("album", selectedAlbum);
      if (error) throw error;
      setCoverOverride(publicUrl);
      toast.success("Album cover updated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update album cover");
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex flex-col h-full overflow-hidden"
    >
      <div className="px-4 md:px-8 py-4 border-b border-border flex items-center gap-3">
        <button onClick={closeDetail} className="icon-button h-9 w-9">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-sm text-muted-foreground">Back</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-8 flex flex-col md:flex-row items-start md:items-end gap-6 border-b border-border">
          <div className="relative group h-44 w-44 md:h-56 md:w-56 rounded-2xl overflow-hidden bg-secondary shadow-2xl flex-shrink-0">
            {artwork ? (
              <img src={artwork} alt={selectedAlbum || ""} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent/30 to-accent/5">
                <Disc3 className="h-20 w-20 text-muted-foreground/40" />
              </div>
            )}
            {isAdmin && (
              <>
                <button
                  onClick={handleCoverPick}
                  disabled={uploading}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium gap-2"
                  title="Change album cover"
                >
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                  ) : (
                    <><ImageIcon className="h-4 w-4" /> Change cover</>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverUpload}
                />
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Album</p>
            <h1 className="text-3xl md:text-5xl font-bold mb-2 truncate">{selectedAlbum}</h1>
            {artist && <p className="text-muted-foreground mb-4">{artist}</p>}
            <p className="text-sm text-muted-foreground mb-6">
              {albumTracks.length} {albumTracks.length === 1 ? "song" : "songs"}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handlePlay}
                disabled={albumTracks.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent text-accent-foreground font-medium text-sm transition-all hover:opacity-90 disabled:opacity-40"
              >
                <Play className="h-4 w-4 fill-current" />
                Play
              </button>
              <button
                onClick={handleShuffle}
                disabled={albumTracks.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-secondary text-foreground font-medium text-sm transition-all hover:opacity-80 disabled:opacity-40"
              >
                <Shuffle className="h-4 w-4" />
                Shuffle
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 md:px-8 py-4">
          {albumTracks.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              No songs found in this album.
            </div>
          ) : (
            albumTracks.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} tracks={albumTracks} />
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
