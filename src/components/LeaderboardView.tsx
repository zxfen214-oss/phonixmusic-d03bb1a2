import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { Trophy, Play, Crown, Medal, Award, ChevronUp, ChevronDown, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import iconPlay from "@/assets/icon-play.png";

interface LeaderboardSong {
  id: string;
  title: string;
  artist: string;
  cover_url: string | null;
  youtube_id: string | null;
  duration: number | null;
  stream_count: number;
}

export function LeaderboardView() {
  const [songs, setSongs] = useState<LeaderboardSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editCounts, setEditCounts] = useState<Record<string, number>>({});
  const { isAdmin } = useAuth();
  const { playTrack } = usePlayer();

  const fetchLeaderboard = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("songs")
      .select("id, title, artist, cover_url, youtube_id, duration, stream_count")
      .gt("stream_count", 0)
      .order("stream_count", { ascending: false })
      .limit(50);

    if (!error && data) {
      setSongs(data as LeaderboardSong[]);
      const counts: Record<string, number> = {};
      data.forEach((s: any) => { counts[s.id] = s.stream_count || 0; });
      setEditCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLeaderboard(); }, []);

  const handlePlay = (song: LeaderboardSong) => {
    playTrack({
      id: song.youtube_id ? `yt-${song.youtube_id}` : song.id,
      title: song.title,
      artist: song.artist,
      album: "Leaderboard",
      duration: song.duration || 0,
      artwork: song.cover_url || (song.youtube_id ? `https://img.youtube.com/vi/${song.youtube_id}/mqdefault.jpg` : "/placeholder.svg"),
      source: song.youtube_id ? "youtube" : "local",
      youtubeId: song.youtube_id || undefined,
      addedAt: new Date(),
      isEdited: true,
    });
  };

  const handleSaveCounts = async () => {
    try {
      const updates = Object.entries(editCounts).map(([id, count]) =>
        supabase.from("songs").update({ stream_count: count }).eq("id", id)
      );
      await Promise.all(updates);
      toast.success("Stream counts updated");
      setEditMode(false);
      fetchLeaderboard();
    } catch {
      toast.error("Failed to update");
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 0) return <Crown className="h-5 w-5 text-yellow-400" />;
    if (rank === 1) return <Medal className="h-5 w-5 text-gray-300" />;
    if (rank === 2) return <Award className="h-5 w-5 text-amber-600" />;
    return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank + 1}</span>;
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-yellow-400" />
          <h1 className="text-2xl font-bold">Leaderboard</h1>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {editMode ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveCounts}>
                  <Save className="h-4 w-4 mr-1" /> Save
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>Edit Streams</Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : songs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Trophy className="h-12 w-12 mb-4 opacity-30" />
          <p>No ranked songs yet</p>
          {isAdmin && <p className="text-sm mt-1">Set stream counts on songs to rank them.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {songs.map((song, index) => (
            <motion.div
              key={song.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl transition-colors group",
                index === 0 ? "bg-yellow-500/10 border border-yellow-500/20" :
                index === 1 ? "bg-gray-400/5 border border-gray-400/10" :
                index === 2 ? "bg-amber-600/5 border border-amber-600/10" :
                "hover:bg-secondary/50"
              )}
            >
              <div className="flex-shrink-0 w-8 flex justify-center">
                {getRankIcon(index)}
              </div>

              <div
                className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg cursor-pointer group/art"
                onClick={() => handlePlay(song)}
              >
                <img
                  src={song.cover_url || (song.youtube_id ? `https://img.youtube.com/vi/${song.youtube_id}/mqdefault.jpg` : "/placeholder.svg")}
                  alt={song.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/art:opacity-100 transition-opacity flex items-center justify-center">
                  <img src={iconPlay} alt="Play" className="h-4 w-4 invert" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{song.title}</p>
                <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
              </div>

              {editMode ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditCounts(prev => ({ ...prev, [song.id]: Math.max(0, (prev[song.id] || 0) - 1) }))}
                    className="p-1 rounded hover:bg-secondary"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <Input
                    type="number"
                    value={editCounts[song.id] || 0}
                    onChange={(e) => setEditCounts(prev => ({ ...prev, [song.id]: parseInt(e.target.value) || 0 }))}
                    className="w-20 h-8 text-center text-sm"
                  />
                  <button
                    onClick={() => setEditCounts(prev => ({ ...prev, [song.id]: (prev[song.id] || 0) + 1 }))}
                    className="p-1 rounded hover:bg-secondary"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="text-sm font-medium text-muted-foreground">
                  {song.stream_count.toLocaleString()} streams
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
