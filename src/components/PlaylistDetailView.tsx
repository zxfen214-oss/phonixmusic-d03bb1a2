import { useMemo } from "react";
import { useLibrary } from "@/contexts/LibraryContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useView } from "@/contexts/ViewContext";
import { TrackRow } from "./TrackRow";
import { ArrowLeft, Play, Shuffle, ListMusic } from "lucide-react";
import { motion } from "framer-motion";

export function PlaylistDetailView() {
  const { selectedPlaylistId, closeDetail } = useView();
  const { playlists } = useLibrary();
  const { playTrack, toggleShuffle, shuffle } = usePlayer();

  const playlist = useMemo(
    () => playlists.find(p => p.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId]
  );

  if (!playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Playlist not found.</p>
        <button onClick={closeDetail} className="px-4 py-2 rounded-full bg-accent text-accent-foreground text-sm">
          Back
        </button>
      </div>
    );
  }

  const tracks = playlist.tracks;
  const artwork = tracks[0]?.artwork;

  const handlePlay = () => {
    if (tracks.length === 0) return;
    if (shuffle) toggleShuffle();
    playTrack(tracks[0], tracks);
  };

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const rand = tracks[Math.floor(Math.random() * tracks.length)];
    playTrack(rand, tracks);
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
        <span className="text-sm text-muted-foreground">Playlists</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-8 flex flex-col md:flex-row items-start md:items-end gap-6 border-b border-border">
          <div className="h-44 w-44 md:h-56 md:w-56 rounded-2xl overflow-hidden bg-secondary shadow-2xl flex-shrink-0">
            {artwork ? (
              <img src={artwork} alt={playlist.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent/30 to-accent/5">
                <ListMusic className="h-20 w-20 text-muted-foreground/40" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Playlist</p>
            <h1 className="text-3xl md:text-5xl font-bold mb-2 truncate">{playlist.name}</h1>
            {playlist.description && (
              <p className="text-muted-foreground mb-4">{playlist.description}</p>
            )}
            <p className="text-sm text-muted-foreground mb-6">
              {tracks.length} {tracks.length === 1 ? "song" : "songs"}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handlePlay}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent text-accent-foreground font-medium text-sm transition-all hover:opacity-90 disabled:opacity-40"
              >
                <Play className="h-4 w-4 fill-current" />
                Play
              </button>
              <button
                onClick={handleShuffle}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-secondary text-foreground font-medium text-sm transition-all hover:opacity-80 disabled:opacity-40"
              >
                <Shuffle className="h-4 w-4" />
                Shuffle
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 md:px-8 py-4">
          {tracks.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              This playlist is empty. Add songs from your library.
            </div>
          ) : (
            tracks.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} tracks={tracks} />
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
