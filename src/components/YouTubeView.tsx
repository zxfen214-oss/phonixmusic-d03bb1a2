import { useState, useEffect } from "react";
import { searchYouTube } from "@/lib/youtube";
import { Search, Play, Plus, Youtube, Loader2, AlertCircle, MoreHorizontal, Shield, MessageSquare, ListPlus, Check } from "lucide-react";
import { Track } from "@/types/music";
import { usePlayer } from "@/contexts/PlayerContext";
import { useLibrary } from "@/contexts/LibraryContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { AdminSongEditor } from "./AdminSongEditor";
import { RequestAdminDialog } from "./RequestAdminDialog";
import { AddToPlaylistDialog } from "./AddToPlaylistDialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function YouTubeView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [requestTrack, setRequestTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [adminSongs, setAdminSongs] = useState<Map<string, { title: string; artist: string; cover_url: string | null }>>(new Map());
  
  const { currentTrack, isPlaying, playTrack, pauseTrack, resumeTrack } = usePlayer();
  const { addTrack, tracks } = useLibrary();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  // Fetch admin-edited songs to prioritize them
  useEffect(() => {
    async function fetchAdminSongs() {
      const { data } = await supabase
        .from("songs")
        .select("youtube_id, title, artist, cover_url")
        .not("youtube_id", "is", null);
      if (data) {
        const map = new Map<string, { title: string; artist: string; cover_url: string | null }>();
        data.forEach(s => {
          if (s.youtube_id) map.set(s.youtube_id, { title: s.title, artist: s.artist, cover_url: s.cover_url });
        });
        setAdminSongs(map);
      }
    }
    fetchAdminSongs();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    
    try {
      const searchResults = await searchYouTube(searchQuery);
      
      // If admin-edited version exists, replace YouTube data with admin data and deduplicate
      const seen = new Set<string>();
      const processed: Track[] = [];
      
      for (const track of searchResults) {
        const ytId = track.youtubeId;
        if (!ytId || seen.has(ytId)) continue;
        seen.add(ytId);
        
        const adminVersion = adminSongs.get(ytId);
        if (adminVersion) {
          processed.push({
            ...track,
            title: adminVersion.title,
            artist: adminVersion.artist,
            artwork: adminVersion.cover_url || track.artwork,
            isEdited: true,
          });
        } else {
          processed.push(track);
        }
      }
      
      setResults(processed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePlay = (track: Track) => {
    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        pauseTrack();
      } else {
        resumeTrack();
      }
    } else {
      playTrack(track, results);
    }
  };

  const handleAddToLibrary = async (track: Track) => {
    if (tracks.some(t => t.youtubeId === track.youtubeId)) {
      toast({
        title: 'Already in library',
        description: 'This track is already in your library',
      });
      return;
    }

    await addTrack(track);
    toast({
      title: 'Added to library',
      description: `${track.title} has been added to your library`,
    });
  };

  const handleAdminEdit = (track: Track) => {
    setEditingTrack(track);
  };

  const handleSaveTrack = (updatedTrack: Track) => {
    setResults(prev => prev.map(t => 
      t.id === updatedTrack.id ? updatedTrack : t
    ));
    // Refresh admin songs cache
    if (updatedTrack.youtubeId) {
      setAdminSongs(prev => {
        const next = new Map(prev);
        next.set(updatedTrack.youtubeId!, { title: updatedTrack.title, artist: updatedTrack.artist, cover_url: updatedTrack.artwork || null });
        return next;
      });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        className="px-4 md:px-8 py-6 border-b border-border"
      >
        <div className="flex items-center gap-3 mb-6">
          <Youtube className="h-6 md:h-8 w-6 md:w-8 text-accent" />
          <h1 className="text-2xl md:text-3xl font-semibold">Search</h1>
        </div>
        
        {/* Search */}
        <form onSubmit={handleSearch} className="relative max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search for songs, artists, albums..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input pl-11 pr-24"
            disabled={isSearching}
          />
          <button
            type="submit"
            disabled={isSearching}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-full bg-accent text-accent-foreground text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>
      </motion.div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <AnimatePresence mode="wait">
          {isSearching ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-64 text-center"
            >
              <Loader2 className="h-10 w-10 text-accent animate-spin mb-4" />
              <p className="text-muted-foreground">Searching YouTube...</p>
            </motion.div>
          ) : error ? (
            <motion.div 
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-64 text-center"
            >
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-destructive font-medium">Search failed</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </motion.div>
          ) : !hasSearched ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-64 text-center"
            >
              <Youtube className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Search YouTube for music</p>
              <p className="text-sm text-muted-foreground mt-1">
                Find and play any song from YouTube
              </p>
            </motion.div>
          ) : results.length === 0 ? (
            <motion.div 
              key="no-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-64 text-center"
            >
              <p className="text-muted-foreground">No results found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try a different search term
              </p>
            </motion.div>
          ) : (
            <motion.div 
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <p className="text-sm text-muted-foreground mb-4">
                {results.length} results for "{searchQuery}"
              </p>
              {results.map((track, idx) => {
                const isCurrentTrack = currentTrack?.id === track.id;
                const isCurrentlyPlaying = isCurrentTrack && isPlaying;
                const isInLibrary = tracks.some(t => t.youtubeId === track.youtubeId);

                return (
                  <motion.div
                    key={track.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      duration: 0.4, 
                      delay: idx * 0.03,
                      ease: [0.32, 0.72, 0, 1]
                    }}
                    className={cn(
                      "group flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl transition-colors duration-200 hover:bg-secondary/50",
                      isCurrentTrack && "bg-secondary/70"
                    )}
                  >
                  {/* Artwork */}
                  <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
                    <img
                      src={track.artwork || "/placeholder.svg"}
                      alt={track.album}
                      className="h-full w-auto min-w-full object-cover object-center"
                    />
                    <button
                      onClick={() => handlePlay(track)}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {isCurrentlyPlaying ? (
                        <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                          <div className="flex gap-0.5">
                            <span className="w-0.5 h-3 bg-accent-foreground rounded-full animate-pulse-subtle" />
                            <span className="w-0.5 h-3 bg-accent-foreground rounded-full animate-pulse-subtle" />
                          </div>
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                          <Play className="h-4 w-4 text-accent-foreground ml-0.5" />
                        </div>
                      )}
                    </button>
                    {/* Admin edited badge */}
                    {track.isEdited && (
                      <div className="absolute top-1 left-1 bg-accent rounded-full p-0.5" title="Admin edited">
                        <Check className="h-2.5 w-2.5 text-accent-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium truncate",
                      isCurrentTrack && "text-accent"
                    )}>
                      {track.title}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {track.artist}
                    </p>
                  </div>

                  {/* Duration */}
                  <span className="text-sm text-muted-foreground">
                    {track.duration > 0 ? formatTime(track.duration) : '--:--'}
                  </span>

                  {/* Add to Library */}
                  <button 
                    onClick={() => handleAddToLibrary(track)}
                    disabled={isInLibrary}
                    className={cn(
                      "icon-button h-10 w-10 transition-opacity",
                      isInLibrary 
                        ? "opacity-50 cursor-not-allowed" 
                        : "opacity-0 group-hover:opacity-100"
                    )}
                    title={isInLibrary ? "Already in library" : "Add to library"}
                  >
                    <Plus className="h-5 w-5" />
                  </button>

                  {/* More Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="icon-button h-10 w-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => setPlaylistTrack(track)}>
                        <ListPlus className="h-4 w-4 mr-2" />
                        Add to Playlist
                      </DropdownMenuItem>
                      
                      {isAdmin ? (
                        <DropdownMenuItem onClick={() => handleAdminEdit(track)} className="text-accent">
                          <Shield className="h-4 w-4 mr-2" />
                          Admin Edit
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => setRequestTrack(track)}>
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Request Admin Change
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Admin Editor Dialog */}
      <AnimatePresence>
        {editingTrack && (
          <AdminSongEditor
            track={editingTrack}
            isOpen={!!editingTrack}
            onClose={() => setEditingTrack(null)}
            onSave={handleSaveTrack}
          />
        )}
      </AnimatePresence>

      {/* Request Admin Dialog */}
      {requestTrack && (
        <RequestAdminDialog
          track={requestTrack}
          isOpen={!!requestTrack}
          onClose={() => setRequestTrack(null)}
        />
      )}

      {/* Add to Playlist Dialog */}
      {playlistTrack && (
        <AddToPlaylistDialog
          track={playlistTrack}
          isOpen={!!playlistTrack}
          onClose={() => setPlaylistTrack(null)}
        />
      )}
    </motion.div>
  );
}
