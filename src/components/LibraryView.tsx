import { useState, useMemo } from "react";
import { useLibrary } from "@/contexts/LibraryContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useAuth } from "@/contexts/AuthContext";
import { TrackRow } from "./TrackRow";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { AdminSongEditor } from "./AdminSongEditor";
import { Search, SlidersHorizontal, Music, Play, TrendingUp, MoreHorizontal, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { popularTracks, convertPopularToTrack } from "@/data/popularTracks";
import { Track } from "@/types/music";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SortOption = "recent" | "title" | "artist" | "album";
type FilterOption = "all" | "local" | "youtube";

function PopularTrackCard({ 
  track, 
  onPlay,
  onAdminEdit,
  isAdmin,
  index
}: {
  track: Track; 
  onPlay: (track: Track) => void;
  onAdminEdit?: (track: Track) => void;
  isAdmin?: boolean;
  index?: number;
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.4, 
        delay: index ? index * 0.05 : 0,
        ease: [0.32, 0.72, 0, 1]
      }}
      className="group relative overflow-hidden rounded-xl bg-card p-3 cursor-pointer"
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="relative mb-3" onClick={() => onPlay(track)}>
        <div className="aspect-square w-full rounded-lg overflow-hidden bg-secondary">
          <img
            src={track.artwork || "/placeholder.svg"}
            alt={track.album}
            className={cn(
              "object-cover object-center transition-transform duration-500 group-hover:scale-110",
              track.source === 'youtube'
                ? "h-full w-auto min-w-full"
                : "h-full w-full"
            )}
          />
        </div>
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          whileHover={{ scale: 1.1 }}
          className="absolute bottom-2 right-2 h-10 w-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg"
        >
          <Play className="h-5 w-5 ml-0.5" />
        </motion.button>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0" onClick={() => onPlay(track)}>
          <p className="font-medium truncate text-sm">{track.title}</p>
          <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
        </div>
        {isAdmin && onAdminEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="icon-button h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onAdminEdit(track)} className="text-accent">
                <Shield className="h-4 w-4 mr-2" />
                Admin Edit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </motion.div>
  );
}

export function LibraryView() {
  const { tracks, isLoading } = useLibrary();
  const { playTrack } = usePlayer();
  const { isAdmin } = useAuth();
  const cachedIds = useOfflineStatus();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

  const filteredAndSortedTracks = useMemo(() => {
    let filtered = [...tracks];

    if (filterBy === "local") {
      filtered = filtered.filter(t => t.source === "local");
    } else if (filterBy === "youtube") {
      filtered = filtered.filter(t => t.source === "youtube");
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        t =>
          t.title.toLowerCase().includes(query) ||
          t.artist.toLowerCase().includes(query) ||
          t.album.toLowerCase().includes(query)
      );
    }

    switch (sortBy) {
      case "title":
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "artist":
        filtered.sort((a, b) => a.artist.localeCompare(b.artist));
        break;
      case "album":
        filtered.sort((a, b) => a.album.localeCompare(b.album));
        break;
      case "recent":
      default:
        filtered.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
        break;
    }

    return filtered;
  }, [tracks, searchQuery, sortBy, filterBy]);

  const popularTracksList = useMemo(() => {
    return popularTracks.map(convertPopularToTrack);
  }, []);

  const handlePlayPopular = (track: Track) => {
    playTrack(track, popularTracksList);
  };

  const handleAdminEdit = (track: Track) => {
    setEditingTrack(track);
  };

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "recent", label: "Recently Added" },
    { value: "title", label: "Title" },
    { value: "artist", label: "Artist" },
    { value: "album", label: "Album" },
  ];

  const filterOptions: { value: FilterOption; label: string }[] = [
    { value: "all", label: "All" },
    { value: "local", label: "Local" },
    { value: "youtube", label: "YouTube" },
  ];

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading library...</p>
        </div>
      </div>
    );
  }

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
        <h1 className="text-2xl md:text-3xl font-semibold mb-6">Library</h1>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search songs, artists, albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input pl-11"
            />
          </div>

          <div className="flex items-center gap-2">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilterBy(option.value)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all duration-150",
                  filterBy === option.value
                    ? "bg-foreground text-background"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-sm font-medium outline-none cursor-pointer"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </motion.div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tracks.length === 0 ? (
          <div className="px-4 md:px-8 py-6">
            {/* Popular Songs Section */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.32, 0.72, 0, 1] }}
              className="mb-8"
            >
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-accent" />
                <h2 className="text-xl font-semibold">Popular Songs</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Click any song to start playing from YouTube
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {popularTracksList.map((track, idx) => (
                  <PopularTrackCard
                    key={track.id}
                    track={track}
                    onPlay={handlePlayPopular}
                    onAdminEdit={handleAdminEdit}
                    isAdmin={isAdmin}
                    index={idx}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <>
            {/* Track List Header */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex items-center gap-4 px-6 md:px-12 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border"
            >
              <div className="w-8 text-center">#</div>
              <div className="w-10" />
              <div className="flex-1">Title</div>
              <div className="hidden md:block w-48">Album</div>
              <div className="w-12 text-right">Time</div>
              <div className="w-8" />
            </motion.div>

            {/* Track List */}
            <div className="px-4 md:px-8 py-2">
              {filteredAndSortedTracks.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-64 text-center"
                >
                  <p className="text-muted-foreground">No tracks found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Try adjusting your search or filters
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  {filteredAndSortedTracks.map((track, index) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={index}
                      tracks={filteredAndSortedTracks}
                    />
                  ))}
                </motion.div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Admin Editor Dialog */}
      <AnimatePresence>
        {editingTrack && (
          <AdminSongEditor
            track={editingTrack}
            isOpen={!!editingTrack}
            onClose={() => setEditingTrack(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
