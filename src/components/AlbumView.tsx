import { useMemo } from "react";
import { useLibrary } from "@/contexts/LibraryContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useView } from "@/contexts/ViewContext";
import { TrackRow } from "./TrackRow";
import { ArrowLeft, Play, Shuffle, Disc3 } from "lucide-react";
import { motion } from "framer-motion";

export function AlbumView() {
  const { selectedAlbum, closeDetail } = useView();
  const { tracks } = useLibrary();
  const { playTrack, toggleShuffle, shuffle } = usePlayer();

  const albumTracks = useMemo(() => {
    if (!selectedAlbum) return [];
    const target = selectedAlbum.trim().toLowerCase();
    return tracks.filter(t => (t.album || "").trim().toLowerCase() === target);
  }, [tracks, selectedAlbum]);

  const artwork = albumTracks[0]?.artwork;
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
          <div className="h-44 w-44 md:h-56 md:w-56 rounded-2xl overflow-hidden bg-secondary shadow-2xl flex-shrink-0">
            {artwork ? (
              <img src={artwork} alt={selectedAlbum || ""} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent/30 to-accent/5">
                <Disc3 className="h-20 w-20 text-muted-foreground/40" />
              </div>
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
              No songs found in this album in your library.
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
