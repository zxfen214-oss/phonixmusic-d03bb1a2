import { useState, useEffect, useRef, useCallback } from "react";
import { Track } from "@/types/music";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Play,
  Pause,
  Save,
  Loader2,
  Mic2,
  RotateCcw,
  Gauge,
  ChevronRight,
  SkipBack,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { parseLRC, fetchSyncedLyrics, fetchTextUtf8, LyricLine } from "@/lib/lyrics";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/contexts/PlayerContext";

function SyncPreviewLine({ text, fillProgress }: { text: string; fillProgress: number }) {
  const words = text.split(/(\s+)/).filter((part) => part.length > 0);
  const spokenUnits = words.filter((part) => !/^\s+$/.test(part));

  if (spokenUnits.length === 0) {
    return <span>{text}</span>;
  }

  let spokenIndex = -1;

  return (
    <span dir="auto" className="inline-block" style={{ unicodeBidi: "plaintext" }}>
      {words.map((part, index) => {
        if (/^\s+$/.test(part)) {
          return (
            <span key={`space-${index}`} style={{ whiteSpace: "pre-wrap" }}>
              {part}
            </span>
          );
        }

        spokenIndex += 1;
        const wordStart = spokenIndex / spokenUnits.length;
        const wordEnd = (spokenIndex + 1) / spokenUnits.length;

        let wordProgress = 0;
        if (fillProgress >= wordEnd) wordProgress = 1;
        else if (fillProgress > wordStart) wordProgress = (fillProgress - wordStart) / (wordEnd - wordStart);

        const fillPercent = Math.max(0, Math.min(100, wordProgress * 100));

        return (
          <span key={`word-${index}`} className="relative inline-block align-baseline">
            <span style={{ color: "hsl(var(--foreground) / 0.9)" }}>{part}</span>
            {fillPercent > 0 && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none"
                style={{
                  width: `${fillPercent}%`,
                  color: "hsl(var(--accent))",
                  whiteSpace: "nowrap",
                }}
              >
                {part}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function formatTimingValue(seconds: number, captured: boolean) {
  if (!captured || seconds <= 0) return "—";
  return `${seconds.toFixed(2)}s`;
}

function WordTimingMarkers({ timing, fillProgress }: { timing?: LineTiming; fillProgress: number }) {
  if (!timing || timing.wordTimings.length === 0) return null;

  const wordCount = timing.wordTimings.length;

  return (
    <div className="mt-3 space-y-2">
      <div className="relative h-2 overflow-hidden rounded-full bg-muted/50">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent/30 transition-all duration-100"
          style={{ width: `${Math.max(0, Math.min(100, fillProgress * 100))}%` }}
        />
        {timing.wordTimings.map((wordTiming, index) => {
          const markerPosition = ((index + 1) / wordCount) * 100;
          return (
            <span
              key={`${wordTiming.word}-${index}`}
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-border"
              style={{ left: `calc(${markerPosition}% - 0.5px)` }}
              aria-hidden
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {timing.wordTimings.map((wordTiming, index) => {
          const isCompleted = fillProgress >= (index + 1) / wordCount;
          const isStarted = fillProgress > index / wordCount;

          return (
            <div
              key={`${wordTiming.word}-${index}`}
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] leading-tight transition-colors",
                isCompleted && "border-accent/50 bg-accent/10",
                !isCompleted && isStarted && "border-accent/30 bg-secondary/80",
                !isStarted && "border-border bg-secondary/50"
              )}
            >
              <div className="font-medium text-foreground/90">{wordTiming.word}</div>
              <div className="text-muted-foreground">
                {formatTimingValue(wordTiming.startTime, wordTiming.captured)} → {formatTimingValue(wordTiming.endTime, wordTiming.captured)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface KaraokeWord {
  word: string;
  startTime: number;
  endTime: number;
  lineIndex?: number;
}

interface KaraokeData {
  words: KaraokeWord[];
}

interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  captured: boolean;
}

interface LineTiming {
  lineIndex: number;
  startTime: number;
  endTime: number;
  fillProgress: number; // 0 to 1
  capturedStart: boolean;
  capturedEnd: boolean;
  wordTimings: WordTiming[]; // per-word captured timings
}

interface KaraokeEditorProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

function formatDisplayTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function KaraokeEditor({ track, isOpen, onClose, onSave }: KaraokeEditorProps) {
  const { toast } = useToast();
  const {
    currentTrack,
    isPlaying,
    progress,
    playTrack,
    pauseTrack,
    resumeTrack,
    seekTo,
    setPlaybackRate,
  } = usePlayer();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Karaoke state
  const [karaokeEnabled, setKaraokeEnabled] = useState(false);
  const [syncMode, setSyncMode] = useState<"idle" | "ready" | "syncing" | "done">("idle");
  
  // Speed control for easier syncing (0.5 to 1.0)
  const [syncSpeed, setSyncSpeed] = useState(0.8);
  
  // Lyrics lines for display
  const [lyricsLines, setLyricsLines] = useState<LyricLine[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  
  // Line-by-line timing with sliders
  const [lineTimings, setLineTimings] = useState<LineTiming[]>([]);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  
  // Existing karaoke words (for loading)
  const [existingWords, setExistingWords] = useState<KaraokeWord[]>([]);
  const [aiWords, setAiWords] = useState<KaraokeWord[] | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  // Calculate current time from player
  const currentTime = currentTrack?.id === track.id 
    ? (progress / 100) * track.duration 
    : 0;

  // Update current line and fill progress based on playback time during syncing
  useEffect(() => {
    if (syncMode !== "syncing" || lyricsLines.length === 0) return;
    
    // Find current line based on lyrics timing
    let newIndex = 0;
    for (let i = 0; i < lyricsLines.length; i++) {
      if (lyricsLines[i].time <= currentTime) {
        newIndex = i;
      } else {
        break;
      }
    }
    
    if (newIndex !== currentLineIndex) {
      setCurrentLineIndex(newIndex);
    }
  }, [currentTime, lyricsLines, syncMode]);

  // Load existing data
  useEffect(() => {
    if (isOpen && track.youtubeId) {
      loadExistingData();
    }
  }, [isOpen, track.youtubeId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSyncMode("idle");
      setCurrentLineIndex(0);
      setActiveLineIndex(0);
      setPlaybackRate(1.0);
    }
  }, [isOpen, setPlaybackRate]);

  const loadExistingData = async () => {
    setIsLoading(true);
    
    if (!track.youtubeId) {
      setIsLoading(false);
      return;
    }

    try {
      const { data: song } = await supabase
        .from("songs")
        .select("karaoke_enabled, karaoke_data, lyrics_url")
        .eq("youtube_id", track.youtubeId)
        .maybeSingle();

      if (song) {
        setKaraokeEnabled(song.karaoke_enabled || false);
        
        if (song.karaoke_data) {
          const data = song.karaoke_data as unknown as KaraokeData;
          if (data.words && data.words.length > 0) {
            setExistingWords(data.words);
          }
        }

        // Load lyrics
        if (song.lyrics_url) {
          const content = await fetchTextUtf8(song.lyrics_url);
          const parsed = parseLRC(content);
          setLyricsLines(parsed.lines);
          initializeLineTimings(parsed.lines);
        }
      } else {
        // Try to fetch lyrics from API
        const lyrics = await fetchSyncedLyrics(track.youtubeId, track.artist, track.title);
        if (lyrics && lyrics.lines.length > 0) {
          setLyricsLines(lyrics.lines);
          initializeLineTimings(lyrics.lines);
        }
      }
    } catch (error) {
      console.error("Error loading karaoke data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeLineTimings = (lines: LyricLine[]) => {
    const timings: LineTiming[] = lines.map((line, idx) => {
      const nextLine = lines[idx + 1];
      const words = line.text.split(/\s+/).filter(w => w.length > 0);
      return {
        lineIndex: idx,
        startTime: line.time,
        endTime: nextLine?.time ?? (line.time + 5),
        fillProgress: 0,
        capturedStart: false,
        capturedEnd: false,
        wordTimings: words.map(w => ({ word: w, startTime: 0, endTime: 0, captured: false })),
      };
    });
    setLineTimings(timings);
  };

  // Load existing karaoke words back into line timings for editing
  const loadExistingIntoTimings = () => {
    if (existingWords.length === 0 || lyricsLines.length === 0) return;

    const timings: LineTiming[] = lyricsLines.map((line, idx) => {
      const lineWordsArr = existingWords.filter(w => w.lineIndex === idx);
      const textWords = line.text.split(/\s+/).filter(w => w.length > 0);
      if (lineWordsArr.length > 0) {
        const startTime = Math.min(...lineWordsArr.map(w => w.startTime));
        const endTime = Math.max(...lineWordsArr.map(w => w.endTime));
        return {
          lineIndex: idx,
          startTime,
          endTime,
          fillProgress: 1,
          capturedStart: true,
          capturedEnd: true,
          wordTimings: textWords.map((w, wi) => {
            const existing = lineWordsArr[wi];
            return existing
              ? { word: w, startTime: existing.startTime, endTime: existing.endTime, captured: true }
              : { word: w, startTime: 0, endTime: 0, captured: false };
          }),
        };
      }
      const nextLine = lyricsLines[idx + 1];
      return {
        lineIndex: idx,
        startTime: line.time,
        endTime: nextLine?.time ?? (line.time + 5),
        fillProgress: 0,
        capturedStart: false,
        capturedEnd: false,
        wordTimings: textWords.map(w => ({ word: w, startTime: 0, endTime: 0, captured: false })),
      };
    });

    setLineTimings(timings);
    setActiveLineIndex(0);
    setCurrentLineIndex(0);
    setSyncMode("done");
  };

  // Start syncing - plays the song from beginning with slower speed
  const startSyncing = () => {
    if (lyricsLines.length === 0) {
      toast({
        title: "No lyrics found",
        description: "Please add lyrics first using the LRC Editor",
        variant: "destructive",
      });
      return;
    }

    // Reset line timings
    initializeLineTimings(lyricsLines);
    setActiveLineIndex(0);
    setCurrentLineIndex(0);
    setAiWords(null); // Clear AI words when manually syncing
    
    // Set playback speed for easier syncing
    setPlaybackRate(syncSpeed);
    
    playTrack(track, [track]);
    setTimeout(() => seekTo(0), 100);
    setSyncMode("syncing");
  };

  // Handle slider change for a line - captures per-word timing
  const handleLineFillChange = (lineIndex: number, fillProgress: number) => {
    setLineTimings(prev => {
      const updated = [...prev];
      if (updated[lineIndex]) {
        const t = updated[lineIndex];
        const prevProgress = t.fillProgress;
        const wordCount = t.wordTimings.length;

        const shouldCaptureStart = !t.capturedStart && prevProgress === 0 && fillProgress > 0;
        const shouldCaptureEnd = !t.capturedEnd && prevProgress < 1 && fillProgress >= 1;

        let nextStart = t.startTime;
        let nextEnd = t.endTime;

        if (shouldCaptureStart) {
          nextStart = Math.max(0, currentTime);
        }

        if (shouldCaptureEnd) {
          nextEnd = Math.max(nextStart + 0.05, currentTime);
        }

        // Per-word timing capture: as the slider crosses each word boundary,
        // capture the actual currentTime for that word's start/end
        const newWordTimings = [...t.wordTimings];
        if (wordCount > 0) {
          for (let wi = 0; wi < wordCount; wi++) {
            const wordStart = wi / wordCount;
            const wordEnd = (wi + 1) / wordCount;
            
            // Capture word startTime when slider first enters this word's range
            if (!newWordTimings[wi].captured && prevProgress <= wordStart && fillProgress > wordStart) {
              newWordTimings[wi] = {
                ...newWordTimings[wi],
                startTime: Math.max(0, currentTime),
              };
            }
            
            // Capture word endTime when slider exits this word's range
            if (!newWordTimings[wi].captured && prevProgress < wordEnd && fillProgress >= wordEnd) {
              newWordTimings[wi] = {
                ...newWordTimings[wi],
                endTime: Math.max(newWordTimings[wi].startTime + 0.02, currentTime),
                captured: true,
              };
              // Also set next word's startTime to this word's endTime for continuity
              if (wi + 1 < wordCount && !newWordTimings[wi + 1].captured) {
                newWordTimings[wi + 1] = {
                  ...newWordTimings[wi + 1],
                  startTime: Math.max(newWordTimings[wi].startTime + 0.02, currentTime),
                };
              }
            }
          }
          
          // Handle first word start from line start
          if (shouldCaptureStart && !newWordTimings[0].captured) {
            newWordTimings[0] = { ...newWordTimings[0], startTime: nextStart };
          }
          // Handle last word end from line end
          if (shouldCaptureEnd && wordCount > 0) {
            const lastIdx = wordCount - 1;
            if (!newWordTimings[lastIdx].captured) {
              newWordTimings[lastIdx] = {
                ...newWordTimings[lastIdx],
                endTime: nextEnd,
                captured: true,
              };
            }
          }
        }

        updated[lineIndex] = {
          ...t,
          fillProgress,
          startTime: nextStart,
          endTime: nextEnd,
          capturedStart: t.capturedStart || shouldCaptureStart,
          capturedEnd: t.capturedEnd || shouldCaptureEnd,
          wordTimings: newWordTimings,
        };

        // Auto-advance to next line when this line reaches 100%
        if (shouldCaptureEnd && lineIndex < lyricsLines.length - 1) {
          setTimeout(() => setActiveLineIndex(lineIndex + 1), 50);
        }
      }
      return updated;
    });
  };

  // Capture timing when slider is released (no longer needed for auto-advance)
  const handleLineFillCommit = (lineIndex: number, fillProgress: number) => {
    if (syncMode !== "syncing") return;
    
    // Only update the fill progress on commit (timing already captured in handleLineFillChange)
    setLineTimings(prev => {
      const updated = [...prev];
      if (updated[lineIndex]) {
        updated[lineIndex] = { 
          ...updated[lineIndex], 
          fillProgress,
        };
      }
      return updated;
    });
  };

  // Finish syncing
  const finishSyncing = () => {
    pauseTrack();
    setPlaybackRate(1.0);
    setSyncMode("done");
  };

  // Reset and start over
  const resetSync = () => {
    initializeLineTimings(lyricsLines);
    setActiveLineIndex(0);
    setCurrentLineIndex(0);
    setAiWords(null);
    pauseTrack();
    setPlaybackRate(1.0);
    setSyncMode("idle");
  };

  // Generate AI Karaoke word timings
  const generateAIKaraoke = async () => {
    if (lyricsLines.length === 0) {
      toast({ title: "No lyrics", description: "Please add lyrics first using the LRC Editor", variant: "destructive" });
      return;
    }

    setIsGeneratingAI(true);
    try {
      const response = await supabase.functions.invoke('ai-karaoke', {
        body: {
          lines: lyricsLines.map(l => ({ text: l.text, time: l.time })),
          duration: track.duration,
        },
      });

      if (response.error) throw response.error;
      const data = response.data;

      if (data?.words && data.words.length > 0) {
        setAiWords(data.words);
        setExistingWords(data.words);

        // Update line timings from AI words
        const timings: LineTiming[] = lyricsLines.map((line, idx) => {
          const aiLineWords = data.words.filter((w: KaraokeWord) => w.lineIndex === idx);
          const textWords = line.text.split(/\s+/).filter((w: string) => w.length > 0);
          if (aiLineWords.length > 0) {
            return {
              lineIndex: idx,
              startTime: Math.min(...aiLineWords.map((w: KaraokeWord) => w.startTime)),
              endTime: Math.max(...aiLineWords.map((w: KaraokeWord) => w.endTime)),
              fillProgress: 1,
              capturedStart: true,
              capturedEnd: true,
              wordTimings: textWords.map((w: string, wi: number) => {
                const ai = aiLineWords[wi];
                return ai
                  ? { word: w, startTime: ai.startTime, endTime: ai.endTime, captured: true }
                  : { word: w, startTime: 0, endTime: 0, captured: false };
              }),
            };
          }
          const nextLine = lyricsLines[idx + 1];
          return {
            lineIndex: idx,
            startTime: line.time,
            endTime: nextLine?.time ?? (line.time + 5),
            fillProgress: 0,
            capturedStart: false,
            capturedEnd: false,
            wordTimings: textWords.map((w: string) => ({ word: w, startTime: 0, endTime: 0, captured: false })),
          };
        });

        setLineTimings(timings);
        setSyncMode("done");
        setKaraokeEnabled(true);
        toast({ title: "AI Karaoke Generated", description: `${data.words.length} word timings created` });
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error("AI karaoke error:", error);
      toast({ title: "Error", description: error.message || "Failed to generate AI karaoke", variant: "destructive" });
    } finally {
      setIsGeneratingAI(false);
    }
  };



  // Generate karaoke words from per-word captured timings
  const generateKaraokeWords = (): KaraokeWord[] => {
    const words: KaraokeWord[] = [];
    
    lineTimings.forEach((timing, lineIdx) => {
      const line = lyricsLines[lineIdx];
      if (!line) return;
      
      const lineWords = line.text.split(/\s+/).filter(w => w.length > 0);
      
      lineWords.forEach((word, wordIdx) => {
        const wt = timing.wordTimings[wordIdx];
        
        if (wt && wt.captured && wt.startTime > 0) {
          // Use the actual captured per-word timing
          words.push({
            word,
            startTime: Number(wt.startTime.toFixed(2)),
            endTime: Number(wt.endTime.toFixed(2)),
            lineIndex: lineIdx,
          });
        } else {
          // Fallback: evenly distribute within line duration
          const lineDuration = Math.max(0.1, timing.endTime - timing.startTime);
          const wordDuration = lineDuration / lineWords.length;
          words.push({
            word,
            startTime: Number((timing.startTime + wordIdx * wordDuration).toFixed(2)),
            endTime: Number((timing.startTime + (wordIdx + 1) * wordDuration).toFixed(2)),
            lineIndex: lineIdx,
          });
        }
      });
    });
    
    return words;
  };

  // Save to database
  const handleSave = async () => {
    setIsSaving(true);

    try {
      const karaokeWords = aiWords || generateKaraokeWords();
      const karaokeDataJson = JSON.parse(JSON.stringify({ words: karaokeWords }));

      const { data: existingSong } = await supabase
        .from("songs")
        .select("id")
        .eq("youtube_id", track.youtubeId)
        .maybeSingle();

      if (existingSong) {
        await supabase
          .from("songs")
          .update({
            karaoke_enabled: karaokeEnabled,
            karaoke_data: karaokeDataJson,
          })
          .eq("id", existingSong.id);
      } else {
        await supabase.from("songs").insert([{
          title: track.title,
          artist: track.artist,
          album: track.album || null,
          duration: track.duration,
          youtube_id: track.youtubeId,
          karaoke_enabled: karaokeEnabled,
          karaoke_data: karaokeDataJson,
        }]);
      }

      toast({ title: "Success", description: "Karaoke settings saved" });
      onSave?.();
      onClose();
    } catch (error) {
      console.error("Save error:", error);
      toast({
        title: "Error",
        description: "Failed to save karaoke settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.target instanceof HTMLInputElement) return;

      if (syncMode === "syncing") {
        if (e.code === "Space") {
          e.preventDefault();
          if (isPlaying) {
            pauseTrack();
          } else {
            resumeTrack();
          }
        } else if (e.code === "Escape") {
          e.preventDefault();
          finishSyncing();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, syncMode, isPlaying]);

  // Get words for current visible lines
  const getVisibleLines = () => {
    if (lyricsLines.length === 0) return [];
    
    const result: { line: LyricLine; index: number; position: number }[] = [];
    for (let i = -1; i <= 3; i++) {
      const idx = currentLineIndex + i;
      if (idx >= 0 && idx < lyricsLines.length) {
        result.push({ line: lyricsLines[idx], index: idx, position: i });
      }
    }
    return result;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col w-[95vw] max-w-[95vw] sm:w-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic2 className="h-5 w-5 text-accent" />
            Karaoke Editor - {track.title}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 overflow-hidden flex flex-col gap-4"
          >
            {/* Karaoke Toggle */}
            <div className="flex items-center justify-between p-4 bg-secondary rounded-lg">
              <div>
                <Label className="font-medium">Enable Karaoke Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Show word-by-word highlighting during playback
                </p>
              </div>
              <Switch
                checked={karaokeEnabled}
                onCheckedChange={setKaraokeEnabled}
              />
            </div>

            <AnimatePresence mode="wait">
              {karaokeEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex-1 overflow-hidden flex flex-col gap-4"
                >
                  {/* IDLE state */}
                  {syncMode === "idle" && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-1 flex flex-col items-center justify-center gap-6 py-8"
                    >
                      {existingWords.length > 0 ? (
                        <>
                          <div className="text-center">
                            <h3 className="text-xl font-semibold mb-2">Karaoke Data Exists</h3>
                            <p className="text-muted-foreground">
                              {existingWords.length} words are synced
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button onClick={() => loadExistingIntoTimings()} variant="outline" className="gap-2">
                              <Mic2 className="h-4 w-4" />
                              Edit Existing
                            </Button>
                            <Button onClick={startSyncing} variant="outline" className="gap-2">
                              <RotateCcw className="h-4 w-4" />
                              Re-sync All
                            </Button>
                            <Button onClick={generateAIKaraoke} disabled={isGeneratingAI} className="gap-2">
                              {isGeneratingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                              {isGeneratingAI ? "Generating..." : "AI Karaoke"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-center">
                            <h3 className="text-xl font-semibold mb-2">Karaoke Sync</h3>
                            <p className="text-muted-foreground max-w-md">
                              {lyricsLines.length > 0 
                                ? `Found ${lyricsLines.length} lines. Choose manual sync or AI-powered karaoke.`
                                : "No lyrics found. Please add lyrics first using the LRC Editor."}
                            </p>
                          </div>
                          {lyricsLines.length > 0 && (
                            <div className="flex gap-3">
                              <Button onClick={() => setSyncMode("ready")} variant="outline" className="gap-2" size="lg">
                                <Mic2 className="h-5 w-5" />
                                Manual Sync
                              </Button>
                              <Button onClick={generateAIKaraoke} disabled={isGeneratingAI} className="gap-2" size="lg">
                                {isGeneratingAI ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                                {isGeneratingAI ? "Generating..." : "AI Karaoke"}
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}

                  {/* READY state */}
                  {syncMode === "ready" && (
                    <motion.div
                      key="ready"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-1 flex flex-col items-center justify-center gap-6 py-8"
                    >
                      <div className="text-center">
                        <h3 className="text-xl font-semibold mb-2">How to Sync</h3>
                        <p className="text-muted-foreground max-w-md">
                          As the song plays, <span className="text-accent font-medium">drag the slider</span> for each line 
                          from left to right as the words are sung. The fill follows your slider.
                        </p>
                      </div>
                      
                      {/* Speed Control Slider */}
                      <div className="w-full max-w-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-2 text-sm">
                            <Gauge className="h-4 w-4" />
                            Playback Speed
                          </Label>
                          <span className="text-sm font-mono font-bold">{Math.round(syncSpeed * 100)}%</span>
                        </div>
                        <Slider
                          value={[syncSpeed * 100]}
                          min={30}
                          max={100}
                          step={5}
                          onValueChange={([value]) => setSyncSpeed(value / 100)}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground text-center">
                          Slower speed makes it easier to sync fast lyrics
                        </p>
                      </div>
                      
                      <div className="bg-secondary/50 rounded-lg p-4 text-center">
                        <p className="text-sm text-muted-foreground mb-1">Lines to sync</p>
                        <p className="text-3xl font-bold">{lyricsLines.length}</p>
                      </div>

                      <Button onClick={startSyncing} className="gap-2" size="lg">
                        <Play className="h-5 w-5" />
                        Start Syncing
                      </Button>
                    </motion.div>
                  )}

                  {/* SYNCING state - single-line workflow */}
                  {syncMode === "syncing" && (
                    <motion.div
                      key="syncing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-1 flex flex-col gap-4 overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-2 bg-secondary rounded-lg p-2 md:p-3 md:gap-3">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 md:h-9 md:w-9"
                          onClick={() => isPlaying ? pauseTrack() : resumeTrack()}
                          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                        >
                          {isPlaying ? <Pause className="h-3.5 w-3.5 md:h-4 md:w-4" /> : <Play className="h-3.5 w-3.5 md:h-4 md:w-4" />}
                        </Button>

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 md:h-9 md:w-9"
                          onClick={() => {
                            if (activeLineIndex > 0) {
                              setLineTimings(prev => {
                                const updated = [...prev];
                                if (updated[activeLineIndex]) {
                                  updated[activeLineIndex] = {
                                    ...updated[activeLineIndex],
                                    fillProgress: 0,
                                    capturedStart: false,
                                    capturedEnd: false,
                                  };
                                }
                                if (updated[activeLineIndex - 1]) {
                                  updated[activeLineIndex - 1] = {
                                    ...updated[activeLineIndex - 1],
                                    fillProgress: 0,
                                    capturedStart: false,
                                    capturedEnd: false,
                                  };
                                }
                                return updated;
                              });
                              setActiveLineIndex(activeLineIndex - 1);
                            }
                          }}
                          disabled={activeLineIndex === 0}
                          title="Go to previous line"
                        >
                          <SkipBack className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        </Button>

                        <div className="font-mono text-sm md:text-lg font-bold">
                          {formatDisplayTime(currentTime)}
                        </div>
                        <div className="flex items-center gap-1 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] md:text-xs font-medium text-accent md:gap-2 md:px-2 md:py-1">
                          <Gauge className="h-3 w-3" />
                          {Math.round(syncSpeed * 100)}%
                        </div>

                        <div className="flex items-center gap-2 flex-1 min-w-[100px] md:min-w-[180px]">
                          <Slider
                            value={[syncSpeed * 100]}
                            min={30}
                            max={100}
                            step={5}
                            onValueChange={([v]) => {
                              const rate = v / 100;
                              setSyncSpeed(rate);
                              setPlaybackRate(rate);
                            }}
                            className="flex-1"
                          />
                        </div>
                        <div className="text-center text-xs md:text-sm text-muted-foreground whitespace-nowrap">
                          {activeLineIndex + 1}/{lyricsLines.length}
                        </div>
                        <Button onClick={finishSyncing} variant="secondary" size="sm" className="text-xs md:text-sm h-7 md:h-8">
                          Done
                        </Button>
                      </div>

                      <div
                        ref={lyricsContainerRef}
                        className="flex-1 rounded-2xl border border-border/60 bg-background/40 p-3 md:p-8 overflow-y-auto"
                      >
                        {lyricsLines[activeLineIndex] && (
                          <div className="flex h-full flex-col justify-center gap-6">
                            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground md:text-sm">
                              <span>Karaoke production</span>
                              <span>Line {activeLineIndex + 1}</span>
                            </div>

                            <AnimatePresence mode="wait" initial={false}>
                              <motion.div
                                key={`sync-line-${activeLineIndex}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.12, ease: "easeOut" }}
                                className="space-y-6"
                              >
                                <div className="rounded-2xl border border-border/50 bg-secondary/50 px-4 py-8 md:px-8 md:py-12">
                                  <div className="overflow-hidden">
                                    <div
                                      className="transition-transform duration-100 ease-linear will-change-transform"
                                      style={{
                                        transform: `translateX(-${Math.min(24, (lineTimings[activeLineIndex]?.fillProgress ?? 0) * 24)}%)`,
                                      }}
                                    >
                                       <p
                                        dir="auto"
                                        className="min-h-[3rem] text-xl font-bold leading-tight sm:text-3xl sm:min-h-[4rem] md:min-h-[5rem] md:text-5xl"
                                        style={{
                                          unicodeBidi: "plaintext",
                                          color: "hsl(var(--foreground) / 0.92)",
                                        }}
                                      >
                                        <SyncPreviewLine
                                          text={lyricsLines[activeLineIndex].text}
                                          fillProgress={lineTimings[activeLineIndex]?.fillProgress ?? 0}
                                        />
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <Slider
                                    value={[lineTimings[activeLineIndex]?.fillProgress ?? 0]}
                                    min={0}
                                    max={1}
                                    step={0.005}
                                    onValueChange={([value]) => handleLineFillChange(activeLineIndex, value)}
                                    onValueCommit={([value]) => handleLineFillCommit(activeLineIndex, value)}
                                    className="w-full [&>span:first-child]:h-4 [&_[role=slider]]:h-7 [&_[role=slider]]:w-7"
                                  />
                                  <div className="flex items-center justify-between text-xs md:text-sm">
                                    <span className="text-muted-foreground">Drag with the singer, then the next line appears instantly.</span>
                                    <span className="font-mono font-semibold text-foreground">
                                      {Math.round((lineTimings[activeLineIndex]?.fillProgress ?? 0) * 100)}%
                                    </span>
                                  </div>
                                </div>

                                <WordTimingMarkers
                                  timing={lineTimings[activeLineIndex]}
                                  fillProgress={lineTimings[activeLineIndex]?.fillProgress ?? 0}
                                />

                                {lyricsLines[activeLineIndex + 1] && (
                                  <div className="rounded-xl border border-border/40 bg-secondary/30 p-4">
                                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                      Up next
                                    </div>
                                    <p
                                      dir="auto"
                                      className="text-base font-medium text-muted-foreground md:text-lg"
                                      style={{ unicodeBidi: "plaintext" }}
                                    >
                                      {lyricsLines[activeLineIndex + 1].text}
                                    </p>
                                  </div>
                                )}
                              </motion.div>
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* DONE state */}
                  {syncMode === "done" && (
                    <motion.div
                      key="done"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-1 flex flex-col items-center justify-center gap-6 py-8"
                    >
                      <div className="text-center">
                        <h3 className="text-xl font-semibold mb-2">Sync Complete!</h3>
                        <p className="text-muted-foreground">
                          {lyricsLines.length} lines ready for karaoke
                        </p>
                      </div>
                      
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={resetSync} className="gap-2">
                          <RotateCcw className="h-4 w-4" />
                          Start Over
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Save button */}
            <div className="flex justify-end pt-2 border-t">
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}
