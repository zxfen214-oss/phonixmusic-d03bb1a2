import { useState, useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  MoreHorizontal,
  ListPlus,
  AlignLeft,
  Scissors,
  Gauge,
  Check,
  Trash2,
  Play,
  Pause,
  Languages,
  Loader2,
} from "lucide-react";
import { Track } from "@/types/music";
import { usePlayer } from "@/contexts/PlayerContext";
import { AddToPlaylistDialog } from "@/components/AddToPlaylistDialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Clip {
  id: string;
  trackId: string;
  trackTitle: string;
  start: number;
  end: number;
  createdAt: number;
}

const CLIPS_KEY = "phonix-song-clips";

function loadClips(): Clip[] {
  try {
    return JSON.parse(localStorage.getItem(CLIPS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveClips(clips: Clip[]) {
  localStorage.setItem(CLIPS_KEY, JSON.stringify(clips));
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  track: Track | null;
  lyricsText: string;
  syncedLrcText?: string;
  buttonClassName?: string;
  buttonStyle?: React.CSSProperties;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  // Translation controls (optional; only render when provided)
  canTranslate?: boolean;
  translationEnabled?: boolean;
  isTranslating?: boolean;
  onToggleTranslation?: () => void;
}

export function LyricsMoreMenu({
  track,
  lyricsText,
  buttonClassName,
  buttonStyle,
  iconClassName,
  iconStyle,
  canTranslate,
  translationEnabled,
  isTranslating,
  onToggleTranslation,
}: Props) {
  const { progress, seekTo, speedPreset, setSpeedPreset, playbackRate } = usePlayer();
  const { toast } = useToast();

  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showCut, setShowCut] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={buttonClassName}
            style={{ background: "rgba(255,255,255,0.12)", ...buttonStyle }}
            title="More"
          >
            <MoreHorizontal className={cn("text-white", iconClassName)} style={iconStyle} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-black/90 backdrop-blur-xl border-white/10 text-white">
          <DropdownMenuItem
            disabled={!track}
            onClick={() => track && setShowPlaylist(true)}
            className="focus:bg-white/10 focus:text-white"
          >
            <ListPlus className="h-4 w-4 mr-2" />
            Add to Playlist
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!lyricsText.trim()}
            onClick={() => setShowLyrics(true)}
            className="focus:bg-white/10 focus:text-white"
          >
            <AlignLeft className="h-4 w-4 mr-2" />
            View Lyrics
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!track}
            onClick={() => track && setShowCut(true)}
            className="focus:bg-white/10 focus:text-white"
          >
            <Scissors className="h-4 w-4 mr-2" />
            Cut Song
          </DropdownMenuItem>

          {onToggleTranslation && (
            <DropdownMenuItem
              disabled={!canTranslate || isTranslating}
              onClick={(e) => {
                e.preventDefault();
                onToggleTranslation();
              }}
              className="focus:bg-white/10 focus:text-white"
            >
              {isTranslating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Languages className="h-4 w-4 mr-2" />
              )}
              {translationEnabled ? "Hide translation" : "Translate to English"}
              {translationEnabled && !isTranslating && (
                <Check className="h-4 w-4 ml-auto" />
              )}
            </DropdownMenuItem>



          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="focus:bg-white/10 focus:text-white data-[state=open]:bg-white/10">
              <Gauge className="h-4 w-4 mr-2" />
              Song Effects
              <span className="ml-auto text-xs text-white/50">
                {playbackRate.toFixed(2)}x
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="bg-black/90 backdrop-blur-xl border-white/10 text-white">
                <DropdownMenuItem
                  onClick={() => setSpeedPreset("normal")}
                  className="focus:bg-white/10 focus:text-white"
                >
                  {speedPreset === "normal" && <Check className="h-4 w-4 mr-2" />}
                  <span className={speedPreset === "normal" ? "" : "ml-6"}>Normal (1.0x)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSpeedPreset("slowed-reverb")}
                  className="focus:bg-white/10 focus:text-white"
                >
                  {speedPreset === "slowed-reverb" && <Check className="h-4 w-4 mr-2" />}
                  <span className={speedPreset === "slowed-reverb" ? "" : "ml-6"}>Slowed (0.85x)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSpeedPreset("sped-up")}
                  className="focus:bg-white/10 focus:text-white"
                >
                  {speedPreset === "sped-up" && <Check className="h-4 w-4 mr-2" />}
                  <span className={speedPreset === "sped-up" ? "" : "ml-6"}>Sped Up (1.1x)</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      {track && (
        <AddToPlaylistDialog
          track={track}
          isOpen={showPlaylist}
          onClose={() => setShowPlaylist(false)}
        />
      )}

      {/* View Lyrics — plain text */}
      <Dialog open={showLyrics} onOpenChange={setShowLyrics}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{track?.title} — Lyrics</DialogTitle>
            <DialogDescription>{track?.artist}</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed py-2">
            {lyricsText || "No lyrics available."}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cut Song dialog */}
      {track && showCut && (
        <CutSongDialog
          track={track}
          isOpen={showCut}
          onClose={() => setShowCut(false)}
          currentProgress={progress}
          seekTo={seekTo}
        />
      )}
    </>
  );
}

// ─── Cut Song Dialog ──────────────────────────────────────────────────

function CutSongDialog({
  track,
  isOpen,
  onClose,
  currentProgress,
  seekTo,
}: {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  currentProgress: number;
  seekTo: (progressPct: number) => void;
}) {
  const { toast } = useToast();
  const duration = Math.max(1, track.duration || 1);
  const initStart = Math.max(0, (currentProgress / 100) * duration);
  const initEnd = Math.min(duration, initStart + 15);

  const [range, setRange] = useState<[number, number]>([initStart, initEnd]);
  const [looping, setLooping] = useState(true);
  const [clips, setClips] = useState<Clip[]>(loadClips);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  // Seek into range when dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    const [s] = rangeRef.current;
    seekTo((s / duration) * 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Loop watcher: when playhead leaves the range, seek back to start.
  useEffect(() => {
    if (!isOpen || !looping) return;
    const id = window.setInterval(() => {
      const cur = (currentProgress / 100) * duration;
      const [s, e] = rangeRef.current;
      if (cur >= e - 0.05 || cur < s - 0.5) {
        seekTo((s / duration) * 100);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [isOpen, looping, currentProgress, duration, seekTo]);

  const trackClips = clips.filter(c => c.trackId === track.id);

  const handleSave = () => {
    const [s, e] = range;
    if (e - s < 1) {
      toast({ title: "Clip too short", description: "Pick at least 1 second.", variant: "destructive" });
      return;
    }
    const clip: Clip = {
      id: `clip-${Date.now()}`,
      trackId: track.id,
      trackTitle: track.title,
      start: s,
      end: e,
      createdAt: Date.now(),
    };
    const next = [clip, ...clips];
    setClips(next);
    saveClips(next);
    toast({ title: "Clip saved", description: `${fmt(s)} – ${fmt(e)}` });
  };

  const handleDelete = (id: string) => {
    const next = clips.filter(c => c.id !== id);
    setClips(next);
    saveClips(next);
  };

  const handleLoad = (c: Clip) => {
    setRange([c.start, c.end]);
    seekTo((c.start / duration) * 100);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            Cut Song
          </DialogTitle>
          <DialogDescription>
            Loop a section in place. Save it to your clips library to replay later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-mono">
              <span>{fmt(range[0])}</span>
              <span className="text-muted-foreground">
                {fmt(range[1] - range[0])}
              </span>
              <span>{fmt(range[1])}</span>
            </div>
            <Slider
              min={0}
              max={duration}
              step={0.1}
              value={range}
              onValueChange={(v) => {
                if (v.length === 2) setRange([v[0], v[1]]);
              }}
            />
            <div className="text-xs text-muted-foreground text-center">
              Drag both handles to set the loop region
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={looping ? "default" : "outline"}
              size="sm"
              onClick={() => setLooping(v => !v)}
              className="flex-1"
            >
              {looping ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              {looping ? "Looping" : "Loop Off"}
            </Button>
            <Button size="sm" onClick={handleSave} className="flex-1">
              Save Clip
            </Button>
          </div>

          {trackClips.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto border-t pt-2">
              <div className="text-xs text-muted-foreground mb-1">Saved clips</div>
              {trackClips.map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 text-sm"
                >
                  <button
                    onClick={() => handleLoad(c)}
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    <Play className="h-3 w-3" />
                    <span className="font-mono">{fmt(c.start)} – {fmt(c.end)}</span>
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
