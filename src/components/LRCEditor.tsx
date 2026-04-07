import { useState, useEffect, useRef } from "react";
import { Track } from "@/types/music";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Play,
  Pause,
  Plus,
  Trash2,
  Save,
  Loader2,
  FileText,
  Download,
  ChevronRight,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { fetchMergedSongRecord, saveSongRecord } from "@/lib/songRecords";
import { parseLRC, fetchTextUtf8 } from "@/lib/lyrics";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/contexts/PlayerContext";

interface LRCEditorProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

function formatLRCTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.floor((seconds % 1) * 100);
  return `[${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}]`;
}

function formatDisplayTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function LRCEditor({ track, isOpen, onClose, onSave }: LRCEditorProps) {
  const { toast } = useToast();
  const { 
    currentTrack, 
    isPlaying, 
    progress, 
    playTrack, 
    pauseTrack, 
    resumeTrack,
    seekTo 
  } = usePlayer();
  
  const [isSaving, setIsSaving] = useState(false);
  
  // Lyrics state
  const [lines, setLines] = useState<{ time: number; text: string }[]>([]);
  const [rawLyricsInput, setRawLyricsInput] = useState("");
  const [mode, setMode] = useState<"input" | "ready" | "sync" | "done">("input");
  const [currentSyncIndex, setCurrentSyncIndex] = useState(0);
  
  const linesContainerRef = useRef<HTMLDivElement>(null);

  // Calculate current time from player
  const currentTime = currentTrack?.id === track.id 
    ? (progress / 100) * track.duration 
    : 0;

  // Load existing lyrics
  useEffect(() => {
    if (isOpen && track.youtubeId) {
      loadExistingLyrics();
    }
  }, [isOpen, track.youtubeId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setMode("input");
      setCurrentSyncIndex(0);
    }
  }, [isOpen]);

  const loadExistingLyrics = async () => {
    if (!track.youtubeId) return;
    
    try {
      const { merged } = await fetchMergedSongRecord(
        { youtubeId: track.youtubeId, title: track.title, artist: track.artist, album: track.album },
        "id, lyrics_url"
      );

      if (merged?.lyrics_url) {
        const response = await fetch(merged.lyrics_url);
        if (response.ok) {
          const content = await response.text();
          const parsed = parseLRC(content);
          if (parsed.lines.length > 0) {
            setLines(parsed.lines);
            setRawLyricsInput(parsed.lines.map(l => l.text).join("\n"));
          }
        }
      }
    } catch (error) {
      console.error("Failed to load existing lyrics:", error);
    }
  };

  // Parse raw lyrics and go to ready state
  const parseRawLyrics = () => {
    const textLines = rawLyricsInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (textLines.length === 0) {
      toast({
        title: "No lyrics",
        description: "Please enter some lyrics first",
        variant: "destructive",
      });
      return;
    }

    setLines(textLines.map((text) => ({ time: -1, text })));
    setCurrentSyncIndex(0);
    setMode("ready");
  };

  // Start syncing - plays the song from beginning
  const startSyncing = () => {
    // Play the track from the beginning
    playTrack(track, [track]);
    seekTo(0);
    setMode("sync");
  };

  // Sync current line with timestamp
  const syncCurrentLine = () => {
    if (currentSyncIndex >= lines.length) return;

    const updatedLines = [...lines];
    updatedLines[currentSyncIndex] = {
      ...updatedLines[currentSyncIndex],
      time: currentTime,
    };
    setLines(updatedLines);
    
    const nextIndex = currentSyncIndex + 1;
    setCurrentSyncIndex(nextIndex);

    // Check if we're done
    if (nextIndex >= lines.length) {
      setMode("done");
      pauseTrack();
    }

    // Scroll to keep current line in view
    if (linesContainerRef.current) {
      const lineElements = linesContainerRef.current.querySelectorAll("[data-line-index]");
      const nextLine = lineElements[nextIndex];
      if (nextLine) {
        nextLine.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  // Reset sync and start over
  const resetSync = () => {
    setLines(lines.map(l => ({ ...l, time: -1 })));
    setCurrentSyncIndex(0);
    setMode("ready");
    pauseTrack();
  };

  // Edit line text
  const editLineText = (index: number, text: string) => {
    const updatedLines = [...lines];
    updatedLines[index] = { ...updatedLines[index], text };
    setLines(updatedLines);
  };

  // Delete a line
  const deleteLine = (index: number) => {
    const updatedLines = lines.filter((_, i) => i !== index);
    setLines(updatedLines);
    if (index <= currentSyncIndex && currentSyncIndex > 0) {
      setCurrentSyncIndex(currentSyncIndex - 1);
    }
  };

  // Add new line
  const addLine = (atIndex: number) => {
    const newLines = [...lines];
    newLines.splice(atIndex + 1, 0, { time: -1, text: "" });
    setLines(newLines);
  };

  // Generate LRC content
  const generateLRC = (): string => {
    const sortedLines = [...lines].sort((a, b) => {
      if (a.time === -1 && b.time === -1) return 0;
      if (a.time === -1) return 1;
      if (b.time === -1) return -1;
      return a.time - b.time;
    });

    const lrcLines = sortedLines
      .filter((line) => line.time !== -1 && line.text.trim())
      .map((line) => `${formatLRCTime(line.time)}${line.text}`);

    return `[ti:${track.title}]\n[ar:${track.artist}]\n[al:${track.album}]\n\n${lrcLines.join("\n")}`;
  };

  // Download LRC file
  const downloadLRC = () => {
    const content = generateLRC();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${track.artist} - ${track.title}.lrc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Save to database
  const handleSave = async () => {
    const syncedLines = lines.filter((line) => line.time !== -1);
    if (syncedLines.length === 0) {
      toast({
        title: "No synced lines",
        description: "Please sync at least one line before saving",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const lrcContent = generateLRC();
      const fileName = `lyrics/${Date.now()}-${Math.random().toString(36).substring(7)}.lrc`;

      // Upload LRC file
      const { error: uploadError } = await supabase.storage
        .from("song-assets")
        .upload(fileName, lrcContent, {
          contentType: "text/plain",
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("song-assets")
        .getPublicUrl(fileName);

      // Update or insert song record using resilient helper
      const lookup = { youtubeId: track.youtubeId, title: track.title, artist: track.artist, album: track.album };
      await saveSongRecord(
        lookup,
        { lyrics_url: urlData.publicUrl },
        {
          title: track.title,
          artist: track.artist,
          album: track.album || null,
          duration: track.duration,
          youtube_id: track.youtubeId,
        }
      );

      toast({ title: "Success", description: "Lyrics saved successfully" });
      onSave?.();
      onClose();
    } catch (error) {
      console.error("Save error:", error);
      toast({
        title: "Error",
        description: "Failed to save lyrics",
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
      
      // Only handle shortcuts if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (mode === "sync") {
        if (e.code === "Space") {
          e.preventDefault();
          if (isPlaying) {
            pauseTrack();
          } else {
            resumeTrack();
          }
        } else if (e.code === "Enter") {
          e.preventDefault();
          syncCurrentLine();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, mode, isPlaying, currentSyncIndex, lines]);

  const syncedCount = lines.filter(l => l.time !== -1).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-accent" />
            LRC Editor - {track.title}
          </DialogTitle>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 overflow-hidden flex flex-col gap-4"
        >
          <AnimatePresence mode="wait">
            {/* STEP 1: Input lyrics */}
            {mode === "input" && (
              <motion.div
                key="input"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col gap-4"
              >
                <Tabs defaultValue="paste" className="flex-1 flex flex-col">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="paste">Paste Lyrics</TabsTrigger>
                    <TabsTrigger value="upload">Upload LRC</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="paste" className="flex-1 flex flex-col gap-4 mt-4">
                    <div className="flex-1">
                      <Label className="text-sm mb-2 block">
                        Paste lyrics (one line per row)
                      </Label>
                      <Textarea
                        value={rawLyricsInput}
                        onChange={(e) => setRawLyricsInput(e.target.value)}
                        placeholder="Paste your lyrics here...&#10;Line 1&#10;Line 2&#10;Line 3"
                        className="h-56 resize-none font-mono text-sm"
                      />
                    </div>
                    <Button onClick={parseRawLyrics} className="gap-2">
                      <ChevronRight className="h-4 w-4" />
                      Continue to Sync
                    </Button>
                  </TabsContent>
                  
                  <TabsContent value="upload" className="flex-1 flex flex-col gap-4 mt-4">
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-border rounded-lg p-8">
                      <Upload className="h-12 w-12 text-muted-foreground" />
                      <div className="text-center">
                        <p className="font-medium">Upload LRC File</p>
                        <p className="text-sm text-muted-foreground">
                          Upload a pre-synced .lrc file with timestamps
                        </p>
                      </div>
                      <label className="cursor-pointer">
                        <Button variant="outline" className="gap-2" asChild>
                          <span>
                            <Upload className="h-4 w-4" />
                            Choose File
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept=".lrc,.txt"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            try {
                              const content = await file.text();
                              const parsed = parseLRC(content);
                              
                              if (parsed.lines.length > 0 && parsed.isSynced) {
                                // Already synced - go straight to done
                                setLines(parsed.lines);
                                setRawLyricsInput(parsed.lines.map(l => l.text).join("\n"));
                                setMode("done");
                                toast({
                                  title: "LRC Loaded",
                                  description: `${parsed.lines.length} synced lines imported`,
                                });
                              } else if (parsed.lines.length > 0) {
                                // Has lines but not synced - go to ready
                                setLines(parsed.lines);
                                setRawLyricsInput(parsed.lines.map(l => l.text).join("\n"));
                                setMode("ready");
                                toast({
                                  title: "Lyrics Loaded",
                                  description: "Lyrics imported, ready to sync",
                                });
                              } else {
                                toast({
                                  title: "Invalid File",
                                  description: "Could not parse lyrics from file",
                                  variant: "destructive",
                                });
                              }
                            } catch (error) {
                              console.error("File read error:", error);
                              toast({
                                title: "Error",
                                description: "Failed to read file",
                                variant: "destructive",
                              });
                            }
                          }}
                        />
                      </label>
                    </div>
                    
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">
                        Or paste synced LRC content directly
                      </p>
                    </div>
                    
                    <Textarea
                      value={rawLyricsInput}
                      onChange={(e) => setRawLyricsInput(e.target.value)}
                      placeholder="[00:12.00]First line...&#10;[00:18.50]Second line...&#10;[00:25.00]Third line..."
                      className="h-32 resize-none font-mono text-sm"
                    />
                    
                    <Button 
                      onClick={() => {
                        if (!rawLyricsInput.trim()) {
                          toast({
                            title: "No content",
                            description: "Please upload a file or paste LRC content",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        const parsed = parseLRC(rawLyricsInput);
                        if (parsed.lines.length > 0 && parsed.isSynced) {
                          setLines(parsed.lines);
                          setMode("done");
                          toast({
                            title: "LRC Parsed",
                            description: `${parsed.lines.length} synced lines ready`,
                          });
                        } else if (parsed.lines.length > 0) {
                          setLines(parsed.lines);
                          setMode("ready");
                        } else {
                          toast({
                            title: "Invalid LRC",
                            description: "Could not parse timestamps from content",
                            variant: "destructive",
                          });
                        }
                      }}
                      className="gap-2"
                    >
                      <ChevronRight className="h-4 w-4" />
                      Import & Continue
                    </Button>
                  </TabsContent>
                </Tabs>
              </motion.div>
            )}

            {/* STEP 2: Ready to sync */}
            {mode === "ready" && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col items-center justify-center gap-6 py-8"
              >
                <div className="text-center">
                  <h3 className="text-xl font-semibold mb-2">Ready to Sync</h3>
                  <p className="text-muted-foreground max-w-md">
                    Press "Start" to play the song. As it plays, click "Next Line" 
                    (or press Enter) when each lyric line should appear.
                  </p>
                </div>
                
                <div className="bg-secondary/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Lines to sync</p>
                  <p className="text-3xl font-bold">{lines.length}</p>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setMode("input")}>
                    Edit Lyrics
                  </Button>
                  <Button onClick={startSyncing} className="gap-2" size="lg">
                    <Play className="h-5 w-5" />
                    Start Syncing
                  </Button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Syncing */}
            {mode === "sync" && (
              <motion.div
                key="sync"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex-1 flex flex-col gap-4 overflow-hidden"
              >
                {/* Current time & controls */}
                <div className="flex items-center gap-4 bg-secondary rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => isPlaying ? pauseTrack() : resumeTrack()}
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <div className="font-mono text-2xl font-bold">
                      {formatDisplayTime(currentTime)}
                    </div>
                  </div>
                  
                  <div className="flex-1 text-center">
                    <p className="text-sm text-muted-foreground">
                      Line {currentSyncIndex + 1} of {lines.length}
                    </p>
                  </div>

                  <Button
                    onClick={syncCurrentLine}
                    disabled={currentSyncIndex >= lines.length}
                    className="gap-2"
                    size="lg"
                  >
                    <ChevronRight className="h-5 w-5" />
                    Next Line
                  </Button>
                </div>

                {/* Keyboard hint */}
                <p className="text-xs text-muted-foreground text-center">
                  Press <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">Space</kbd> to pause/play, 
                  <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs ml-1">Enter</kbd> to sync line
                </p>

                {/* Lines list */}
                <div
                  ref={linesContainerRef}
                  className="flex-1 overflow-y-auto space-y-2 pr-2"
                >
                  {lines.map((line, index) => (
                    <motion.div
                      key={index}
                      data-line-index={index}
                      layout
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg transition-all",
                        index === currentSyncIndex
                          ? "bg-accent/20 border-2 border-accent scale-[1.02]"
                          : line.time !== -1
                            ? "bg-secondary/80"
                            : "bg-secondary/40 opacity-60"
                      )}
                    >
                      <div className="w-16 text-xs font-mono text-muted-foreground">
                        {line.time !== -1 ? formatDisplayTime(line.time) : "--:--"}
                      </div>
                      <p className={cn(
                        "flex-1 font-medium",
                        index === currentSyncIndex && "text-accent-foreground"
                      )}>
                        {line.text}
                      </p>
                      {line.time !== -1 && (
                        <span className="text-xs text-green-500">✓</span>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Reset button */}
                <div className="flex justify-center pt-2">
                  <Button variant="ghost" onClick={resetSync} className="gap-2 text-muted-foreground">
                    <RotateCcw className="h-4 w-4" />
                    Start Over
                  </Button>
                </div>
              </motion.div>
            )}

            {/* STEP 4: Done - review and save */}
            {mode === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex flex-col gap-4 overflow-hidden"
              >
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">✓</span>
                  </div>
                  <h3 className="text-xl font-semibold">Sync Complete!</h3>
                  <p className="text-muted-foreground">
                    {syncedCount} lines synced. Review below and save.
                  </p>
                </div>

                {/* Lines review */}
                <div
                  ref={linesContainerRef}
                  className="flex-1 overflow-y-auto space-y-2 pr-2"
                >
                  {lines.map((line, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-lg bg-secondary"
                    >
                      <div className="w-16 text-xs font-mono text-muted-foreground">
                        {line.time !== -1 ? formatDisplayTime(line.time) : "--:--"}
                      </div>
                      <Input
                        value={line.text}
                        onChange={(e) => editLineText(index, e.target.value)}
                        className="flex-1 h-8 text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => addLine(index)}
                        className="h-8 w-8"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteLine(index)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={resetSync} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Re-sync
                  </Button>
                  <Button variant="outline" onClick={downloadLRC} className="gap-2">
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                  <div className="flex-1" />
                  <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {isSaving ? "Saving..." : "Save Lyrics"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
