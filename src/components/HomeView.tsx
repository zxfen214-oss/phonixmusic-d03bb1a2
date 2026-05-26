import { useState, useEffect, useMemo } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLibrary } from "@/contexts/LibraryContext";
import { supabase } from "@/integrations/supabase/client";
import { Track } from "@/types/music";
import { Play, Sparkles, ArrowRight, Music2, X, Download, WifiOff, TrendingUp, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { getAllCachedInfo, CacheInfo, formatBytes, getTotalCacheSize } from "@/lib/offlineCache";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { toast } from "sonner";
import { useDominantColors } from "@/hooks/useDominantColor";

const TRIAL_DISMISSED_KEY = "phonix_trial_dismissed";
const PLAY_COUNT_KEY = "phonix_play_counts";

interface SongRow {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  cover_url: string | null;
  youtube_id: string | null;
  duration: number | null;
}

function songToTrack(song: SongRow): Track {
  return {
    id: song.youtube_id ? `yt-${song.youtube_id}` : song.id,
    title: song.title,
    artist: song.artist,
    album: song.album || "Unknown Album",
    duration: song.duration || 0,
    artwork: song.cover_url || (song.youtube_id ? `https://img.youtube.com/vi/${song.youtube_id}/mqdefault.jpg` : "/placeholder.svg"),
    source: song.youtube_id ? "youtube" : "local",
    youtubeId: song.youtube_id || undefined,
    addedAt: new Date(),
    isEdited: true,
  };
}

/** Get play counts from localStorage (global, not per-user) */
function getPlayCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PLAY_COUNT_KEY) || "{}");
  } catch { return {}; }
}

function incrementPlayCount(trackId: string) {
  const counts = getPlayCounts();
  counts[trackId] = (counts[trackId] || 0) + 1;
  localStorage.setItem(PLAY_COUNT_KEY, JSON.stringify(counts));
}

function TrialBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      className="relative overflow-hidden rounded-2xl p-5 md:p-8"
      style={{
        background: "linear-gradient(135deg, hsl(4 90% 55%) 0%, hsl(340 80% 50%) 50%, hsl(280 70% 45%) 100%)",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
      >
        <X className="h-4 w-4 text-white" />
      </button>
      <a
        href="https://phonixpay.lovable.app/pay/CKFN1SIX6R"
        target="_blank"
        rel="noopener noreferrer"
        onClick={onDismiss}
        className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-8 no-underline"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-white/90" />
            <span className="text-white/80 text-sm font-medium uppercase tracking-wider">Limited Offer</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Get 1 Month Free</h2>
          <p className="text-white/70 text-sm md:text-base max-w-md">
            Unlock premium features including ad-free listening, high quality audio, and offline downloads.
          </p>
        </div>
        <div className="flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-semibold text-sm hover:bg-white/90 transition-colors shadow-lg shrink-0">
          Claim Now
          <ArrowRight className="h-4 w-4" />
        </div>
      </a>
    </motion.div>
  );
}

function EqualizerBars({ active, color }: { active: boolean; color: string }) {
  return (
    <div className="flex items-end gap-[3px] h-5">
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: color, transformOrigin: 'bottom' }}
          animate={
            active
              ? { scaleY: [0.3, 1, 0.5, 0.9, 0.4], opacity: 1 }
              : { scaleY: 0.3, opacity: 0.5 }
          }
          transition={
            active
              ? { duration: 0.9 + i * 0.15, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }
              : { duration: 0.3 }
          }
          initial={{ scaleY: 0.3 }}
        />
      ))}
    </div>
  );
}

function Waveform({ color }: { color: string }) {
  // Decorative SVG waveform that sits behind text
  const bars = Array.from({ length: 42 });
  return (
    <svg
      viewBox="0 0 420 60"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.18 }}
    >
      {bars.map((_, i) => {
        const h = 8 + Math.abs(Math.sin(i * 0.7) * 22) + Math.abs(Math.cos(i * 1.3) * 10);
        const y = 30 - h / 2;
        return (
          <rect
            key={i}
            x={i * 10}
            y={y}
            width={4}
            height={h}
            rx={2}
            fill={color}
          />
        );
      })}
    </svg>
  );
}

function TopSongBanner({ track, onPlay, allTracks }: { track: Track; onPlay: (track: Track, all: Track[]) => void; allTracks: Track[] }) {
  const { currentTrack, isPlaying } = usePlayer();
  const { palette, primary } = useDominantColors(track.artwork);
  const isCurrent = currentTrack?.id === track.id && isPlaying;

  const c1 = palette[0] || primary || 'hsl(260 60% 30%)';
  const c2 = palette[1] || 'hsl(300 50% 25%)';
  const c3 = palette[2] || 'hsl(220 70% 25%)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="relative overflow-hidden rounded-2xl cursor-pointer group"
      onClick={() => onPlay(track, allTracks)}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      style={{
        background: `linear-gradient(135deg, ${c3} 0%, ${c1} 50%, ${c2} 100%)`,
        boxShadow: `0 18px 50px -12px ${c1}80, 0 0 0 1px rgba(255,255,255,0.06) inset`,
        transition: 'background 600ms ease',
      }}
    >
      {/* Color blur orbs derived from album */}
      <div
        className="absolute -top-16 -left-10 w-56 h-56 rounded-full pointer-events-none"
        style={{ background: c1, filter: 'blur(60px)', opacity: 0.55 }}
      />
      <div
        className="absolute -bottom-20 right-0 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: c2, filter: 'blur(70px)', opacity: 0.5 }}
      />

      {/* Waveform behind text */}
      <Waveform color="#ffffff" />

      <div className="relative flex items-center gap-4 p-4 md:p-6">
        <div className="relative flex-shrink-0">
          {/* Hover glow ring around album art */}
          <div
            className="absolute -inset-2 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{
              background: `radial-gradient(circle at 50% 50%, ${c1}cc, transparent 70%)`,
              filter: 'blur(18px)',
            }}
          />
          <motion.div
            className="relative h-20 w-20 md:h-24 md:w-24 overflow-hidden rounded-xl shadow-2xl"
            animate={isCurrent ? { scale: [1, 1.04, 1] } : { scale: 1 }}
            transition={isCurrent ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
          >
            <img
              src={track.artwork || "/placeholder.svg"}
              alt={track.title}
              className="object-cover object-center h-full w-full"
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Play className="h-8 w-8 text-white ml-0.5" />
            </div>
          </motion.div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-yellow-400" />
            <span className="text-yellow-400 text-xs font-semibold uppercase tracking-wider">#1 Most Played</span>
            <div className="ml-1">
              <EqualizerBars active={isCurrent} color="#facc15" />
            </div>
          </div>
          <h3 className="text-white text-lg md:text-xl font-bold truncate drop-shadow-md">{track.title}</h3>
          <p className="text-white/70 text-sm truncate">{track.artist}</p>
        </div>

        <motion.button
          className="h-12 w-12 rounded-full bg-white/20 hover:bg-white flex items-center justify-center flex-shrink-0 backdrop-blur-md transition-colors group/btn"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          style={{ boxShadow: `0 8px 24px -6px ${c1}aa` }}
        >
          <Play className="h-5 w-5 text-white group-hover/btn:text-black ml-0.5 transition-colors" />
        </motion.button>
      </div>
    </motion.div>
  );
}

function SongTile({ track, onPlay, onAdd, index, allTracks, isOffline, isInLibrary }: { track: Track; onPlay: (track: Track, all: Track[]) => void; onAdd: (track: Track) => void; index: number; allTracks: Track[]; isOffline?: boolean; isInLibrary?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.32, 0.72, 0, 1] }}
      className="group cursor-pointer rounded-2xl overflow-hidden bg-secondary/40 hover:bg-secondary/70 transition-all duration-300 shadow-sm hover:shadow-lg"
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onPlay(track, allTracks)}
    >
      <div className="relative aspect-square overflow-hidden">
        <img
          src={track.artwork || "/placeholder.svg"}
          alt={track.title}
          className={cn(
            "object-cover object-center transition-transform duration-500 group-hover:scale-110",
            track.source === "youtube" ? "h-full w-auto min-w-full" : "h-full w-full"
          )}
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <motion.button
          className="absolute bottom-3 right-3 h-10 w-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg"
        >
          <Play className="h-4 w-4 ml-0.5" />
        </motion.button>
        <motion.button
          className={cn(
            "absolute top-2 right-2 h-8 w-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg",
            isInLibrary ? "bg-accent text-accent-foreground" : "bg-black/50 hover:bg-accent text-white hover:text-accent-foreground"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (!isInLibrary) onAdd(track);
          }}
          whileTap={{ scale: 0.85 }}
        >
          {isInLibrary ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </motion.button>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1">
          <p className="font-semibold text-sm truncate">{track.title}</p>
          {isOffline && <WifiOff className="h-3 w-3 text-accent flex-shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{track.artist}</p>
      </div>
    </motion.div>
  );
}

function OfflineSection() {
  const [cachedItems, setCachedItems] = useState<CacheInfo[]>([]);
  const [totalSize, setTotalSize] = useState(0);

  useEffect(() => {
    async function load() {
      const items = await getAllCachedInfo();
      const size = await getTotalCacheSize();
      setCachedItems(items);
      setTotalSize(size);
    }
    load();
  }, []);

  if (cachedItems.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <WifiOff className="h-5 w-5 text-accent" />
          <h2 className="text-xl font-semibold">Offline Downloads</h2>
        </div>
        <span className="text-sm text-muted-foreground">{formatBytes(totalSize)}</span>
      </div>
      <div className="space-y-2">
        {cachedItems.map((item) => (
          <div key={item.youtubeId} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/30">
            <Download className="h-4 w-4 text-accent flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground truncate">{item.artist}</p>
            </div>
            <span className="text-xs text-muted-foreground">{formatBytes(item.size)}</span>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

export function HomeView() {
  const { playTrack } = usePlayer();
  const { user } = useAuth();
  const { tracks: libraryTracks, addTrack } = useLibrary();
  const cachedIds = useOfflineStatus();
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTrial, setShowTrial] = useState(false);

  const libraryTrackIds = useMemo(() => new Set(libraryTracks.map(t => t.id)), [libraryTracks]);

  useEffect(() => {
    const key = user ? `${TRIAL_DISMISSED_KEY}_${user.id}` : TRIAL_DISMISSED_KEY;
    setShowTrial(!localStorage.getItem(key));
  }, [user]);

  useEffect(() => {
    async function fetchSongs() {
      setIsLoading(true);

      if (!navigator.onLine) {
        setSongs([]);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("songs")
          .select("id, title, artist, album, cover_url, youtube_id, duration")
          .eq("needs_metadata", false)
          .order("updated_at", { ascending: false });

        if (error) throw error;
        setSongs((data as any) || []);
      } catch (error) {
        console.error("Failed to load home songs:", error);
        setSongs([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSongs();
  }, []);

  const tracks = useMemo(() => {
    const seen = new Set<string>();
    return songs.filter(s => {
      const key = s.youtube_id || s.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(songToTrack);
  }, [songs]);

  // Determine the top most-listened song
  const topTrack = useMemo(() => {
    if (tracks.length === 0) return null;
    const counts = getPlayCounts();
    let best: Track | null = null;
    let bestCount = 0;
    for (const t of tracks) {
      const c = counts[t.id] || 0;
      if (c > bestCount) { bestCount = c; best = t; }
    }
    // Only show if at least 1 play
    return bestCount > 0 ? best : null;
  }, [tracks]);

  const handlePlay = (track: Track, allTracks: Track[]) => {
    incrementPlayCount(track.id);
    playTrack(track, allTracks);
  };

  const handleAddToLibrary = async (track: Track) => {
    try {
      await addTrack(track);
      toast.success(`Added "${track.title}" to your library`);
    } catch (error) {
      toast.error("Failed to add song to library");
    }
  };

  const handleDismissTrial = () => {
    const key = user ? `${TRIAL_DISMISSED_KEY}_${user.id}` : TRIAL_DISMISSED_KEY;
    localStorage.setItem(key, "true");
    setShowTrial(false);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex flex-col h-full overflow-y-auto"
    >
      <div className="px-4 md:px-8 py-6 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        >
          <h1 className="text-2xl md:text-3xl font-semibold">Home</h1>
          <p className="text-muted-foreground text-sm mt-1">Curated picks for you</p>
        </motion.div>

        {/* Trial Banner */}
        <AnimatePresence>
          {showTrial && <TrialBanner onDismiss={handleDismissTrial} />}
        </AnimatePresence>

        {/* Top Most Listened Song */}
        {topTrack && (
          <TopSongBanner track={topTrack} onPlay={handlePlay} allTracks={tracks} />
        )}

        {/* Featured Grid - Song Tiles */}
        {tracks.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Music2 className="h-5 w-5 text-accent" />
              <h2 className="text-xl font-semibold">Featured</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
              {tracks.map((track, idx) => (
                <SongTile key={track.id} track={track} onPlay={handlePlay} onAdd={handleAddToLibrary} index={idx} allTracks={tracks} isOffline={!!track.youtubeId && cachedIds.has(track.youtubeId)} isInLibrary={libraryTrackIds.has(track.id)} />
              ))}
            </div>
          </motion.section>
        )}

        {/* Offline Downloads */}
        <OfflineSection />

        {tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Music2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No songs available yet</p>
            <p className="text-sm text-muted-foreground mt-1">Check back later for curated picks</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
