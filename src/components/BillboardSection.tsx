import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { Track } from "@/types/music";
import { motion } from "framer-motion";
import { Trophy, Plus, X, Play, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface BillboardRow {
  id: string;
  position: number;
  song_id: string;
  song: {
    id: string;
    title: string | null;
    artist: string | null;
    cover_url: string | null;
    youtube_id: string | null;
    duration: number | null;
  } | null;
}

interface EditedSong {
  id: string;
  title: string;
  artist: string;
  cover_url: string | null;
  youtube_id: string | null;
  duration: number | null;
}

function rowToTrack(row: BillboardRow): Track | null {
  const s = row.song;
  if (!s) return null;
  return {
    id: s.youtube_id ? `yt-${s.youtube_id}` : s.id,
    title: s.title || "Untitled",
    artist: s.artist || "Unknown",
    album: "Billboard",
    duration: s.duration || 0,
    artwork: s.cover_url || (s.youtube_id ? `https://img.youtube.com/vi/${s.youtube_id}/mqdefault.jpg` : "/placeholder.svg"),
    source: s.youtube_id ? "youtube" : "local",
    youtubeId: s.youtube_id || undefined,
    addedAt: new Date(),
    isEdited: true,
  };
}

const SLOT_STYLES: Record<number, { ring: string; chip: string; label: string }> = {
  1: { ring: "ring-yellow-400/40", chip: "bg-yellow-400 text-black", label: "text-yellow-400" },
  2: { ring: "ring-gray-300/40", chip: "bg-gray-300 text-black", label: "text-gray-300" },
  3: { ring: "ring-amber-600/40", chip: "bg-amber-600 text-white", label: "text-amber-500" },
};

export function BillboardSection() {
  const { isAdmin } = useAuth();
  const { playTrack } = usePlayer();
  const [items, setItems] = useState<BillboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<number>(1);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("billboard")
      .select("id, position, song_id, song:songs(id, title, artist, cover_url, youtube_id, duration)")
      .order("position", { ascending: true });
    if (!error) setItems((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handlePlay = (row: BillboardRow) => {
    const track = rowToTrack(row);
    if (!track) return;
    const queue = items.map(rowToTrack).filter((t): t is Track => !!t);
    playTrack(track, queue);
  };

  const handleRemove = async (id: string) => {
    const { error } = await supabase.from("billboard").delete().eq("id", id);
    if (error) { toast.error("Failed to remove"); return; }
    toast.success("Removed from Billboard");
    fetchItems();
  };

  const openPicker = (pos: number) => {
    setPickerPosition(pos);
    setPickerOpen(true);
  };

  // Build display slots 1..3
  const slots: Array<{ position: number; row?: BillboardRow }> = [1, 2, 3].map(pos => ({
    position: pos,
    row: items.find(i => i.position === pos),
  }));

  // Hide section entirely for non-admins if it's empty
  if (!loading && items.length === 0 && !isAdmin) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.12 }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-5 w-5 text-yellow-400" />
        <h2 className="text-xl font-semibold">Billboard</h2>
        <span className="text-xs text-muted-foreground ml-2">Editor's picks</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {slots.map(({ position, row }) => {
          const style = SLOT_STYLES[position];
          if (!row) {
            // Empty slot — only admins can add
            if (!isAdmin) {
              return (
                <div
                  key={position}
                  className={cn(
                    "relative rounded-2xl border border-dashed border-border/60 bg-secondary/20 aspect-[4/2] flex items-center justify-center",
                  )}
                >
                  <span className={cn("text-3xl font-black opacity-30", style.label)}>#{position}</span>
                </div>
              );
            }
            return (
              <button
                key={position}
                onClick={() => openPicker(position)}
                className={cn(
                  "group relative rounded-2xl border-2 border-dashed border-border/60 hover:border-accent bg-secondary/20 hover:bg-secondary/40 aspect-[4/2] flex flex-col items-center justify-center gap-2 transition-colors",
                )}
              >
                <span className={cn("text-2xl font-black", style.label)}>#{position}</span>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground group-hover:text-accent">
                  <Plus className="h-4 w-4" />
                  Add song
                </div>
              </button>
            );
          }

          const s = row.song;
          return (
            <motion.div
              key={position}
              whileHover={{ y: -3 }}
              className={cn(
                "group relative rounded-2xl overflow-hidden ring-1 shadow-sm hover:shadow-lg cursor-pointer aspect-[4/2]",
                style.ring,
              )}
              onClick={() => handlePlay(row)}
              style={{
                background: `linear-gradient(135deg, hsl(220 30% 18%), hsl(260 30% 22%))`,
              }}
            >
              {/* Cover as background blur */}
              {s?.cover_url && (
                <img
                  src={s.cover_url}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 w-full h-full object-cover opacity-40 blur-md scale-110"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/10" />

              <div className="relative h-full flex items-center gap-4 p-4">
                <div className={cn(
                  "flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center font-black text-base shadow-md",
                  style.chip,
                )}>
                  {position}
                </div>
                <div className="relative h-16 w-16 md:h-20 md:w-20 flex-shrink-0 rounded-xl overflow-hidden shadow-lg">
                  <img
                    src={s?.cover_url || (s?.youtube_id ? `https://img.youtube.com/vi/${s.youtube_id}/mqdefault.jpg` : "/placeholder.svg")}
                    alt={s?.title || ""}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play className="h-6 w-6 text-white ml-0.5" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate">{s?.title}</p>
                  <p className="text-white/60 text-sm truncate">{s?.artist}</p>
                </div>
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(row.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-black/40 hover:bg-red-500/80 text-white"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <BillboardPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        position={pickerPosition}
        existingSongIds={items.map(i => i.song_id)}
        onAdded={fetchItems}
      />
    </motion.section>
  );
}

function BillboardPicker({
  open,
  onClose,
  position,
  existingSongIds,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  position: number;
  existingSongIds: string[];
  onAdded: () => void;
}) {
  const [songs, setSongs] = useState<EditedSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("id, title, artist, cover_url, youtube_id, duration")
        .eq("needs_metadata", false)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (!cancelled) {
        if (error) toast.error("Failed to load songs");
        else setSongs((data as any) || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = songs
    .filter(s => !existingSongIds.includes(s.id))
    .filter(s => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (s.title || "").toLowerCase().includes(q) || (s.artist || "").toLowerCase().includes(q);
    });

  const handlePick = async (song: EditedSong) => {
    // Upsert at this position. If something already occupies this position, replace it.
    const { error: delErr } = await supabase.from("billboard").delete().eq("position", position);
    if (delErr) { toast.error("Failed to update position"); return; }
    const { error } = await supabase.from("billboard").insert({ song_id: song.id, position });
    if (error) { toast.error(error.message || "Failed to add"); return; }
    toast.success(`Added to Billboard #${position}`);
    onAdded();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add to Billboard #{position}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search edited songs..."
            className="pl-9"
          />
        </div>
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1 mt-2">
          {loading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No edited songs available.
            </div>
          ) : (
            filtered.map(s => (
              <button
                key={s.id}
                onClick={() => handlePick(s)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/60 transition-colors text-left"
              >
                <img
                  src={s.cover_url || (s.youtube_id ? `https://img.youtube.com/vi/${s.youtube_id}/mqdefault.jpg` : "/placeholder.svg")}
                  alt=""
                  className="h-10 w-10 rounded object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.artist}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
