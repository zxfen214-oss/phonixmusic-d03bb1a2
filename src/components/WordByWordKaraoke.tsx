import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Play,
  Pause,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  CornerDownLeft,
  Keyboard,
  Check,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { LyricLine } from "@/lib/lyrics";

export interface WBWWord {
  word: string;
  startTime: number;
  endTime: number;
  lineIndex?: number;
}

interface WordByWordKaraokeProps {
  initialLines: LyricLine[];
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  syncSpeed: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (progressPercent: number) => void;
  onSpeedChange: (rate: number) => void;
  onComplete: (words: WBWWord[]) => void;
}

interface CaptureEvent {
  type: "start" | "end";
  lineIndex: number;
  wordIndex: number;
  time: number;
}

export function WordByWordKaraoke({
  initialLines,
  duration,
  currentTime,
  isPlaying,
  syncSpeed,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
  onComplete,
}: WordByWordKaraokeProps) {
  // Allow pasting custom lyrics; default from existing parsed lines.
  const initialText = useMemo(
    () => initialLines.map((l) => l.text).join("\n"),
    [initialLines]
  );
  const [rawLyrics, setRawLyrics] = useState(initialText);
  const [phase, setPhase] = useState<"setup" | "recording" | "done">("setup");

  // Parsed lines: array of { text, words[] }
  const lines = useMemo(() => {
    return rawLyrics
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((text) => ({
        text,
        words: text.split(/\s+/).filter((w) => w.length > 0),
      }));
  }, [rawLyrics]);

  // Per-word start/end timings: timings[lineIdx][wordIdx] = {start, end}
  const [timings, setTimings] = useState<{ start: number; end: number }[][]>(
    []
  );
  const [history, setHistory] = useState<CaptureEvent[]>([]);
  const [activeLine, setActiveLine] = useState(-1);
  const [activeWord, setActiveWord] = useState(-1);

  const initTimings = useCallback(() => {
    setTimings(
      lines.map((l) => l.words.map(() => ({ start: -1, end: -1 })))
    );
    setHistory([]);
    setActiveLine(-1);
    setActiveWord(-1);
  }, [lines]);

  const startRecording = () => {
    if (lines.length === 0) return;
    initTimings();
    setPhase("recording");
    onSeek(0);
    setTimeout(() => onPlay(), 100);
  };

  const reset = () => {
    onPause();
    initTimings();
    setPhase("setup");
  };

  // Advance: end the currently-recording word at `now` and start the next word at `now`.
  // The red box always sits on the word that is being recorded.
const captureWordStart = useCallback(() => {
  if (phase !== "recording") return;
  if (lines.length === 0) return;

  const t = currentTime;

  let nextLine: number;
  let nextWord: number;

  // First word ever OR first word after changing line
  if (activeLine === -1 || activeWord === -1) {
    nextLine = activeLine === -1 ? 0 : activeLine;
    nextWord = 0;
  } else {
    const curLineWords = lines[activeLine]?.words ?? [];

    // Next word in same line
    if (activeWord + 1 < curLineWords.length) {
      nextLine = activeLine;
      nextWord = activeWord + 1;
    }

    // Move to next line WITHOUT selecting a word
    else if (activeLine + 1 < lines.length) {
      setTimings((prev) => {
        const next = prev.map((row) => row.slice());

        if (next[activeLine] && next[activeLine][activeWord]) {
          next[activeLine][activeWord] = {
            ...next[activeLine][activeWord],
            end: Math.max(
              next[activeLine][activeWord].start + 0.05,
              t
            ),
          };
        }

        return next;
      });

      setHistory((h) => [
        ...h,
        {
          type: "end",
          lineIndex: activeLine,
          wordIndex: activeWord,
          time: t,
        },
      ]);

      // IMPORTANT:
      // go to next line but NO word selected
      setActiveLine(activeLine + 1);
      setActiveWord(-1);

      return;
    }

    // Last word in song
    else {
      setTimings((prev) => {
        const next = prev.map((row) => row.slice());

        if (next[activeLine] && next[activeLine][activeWord]) {
          next[activeLine][activeWord] = {
            ...next[activeLine][activeWord],
            end: Math.max(
              next[activeLine][activeWord].start + 0.05,
              t
            ),
          };
        }

        return next;
      });

      setHistory((h) => [
        ...h,
        {
          type: "end",
          lineIndex: activeLine,
          wordIndex: activeWord,
          time: t,
        },
      ]);

      return;
    }
  }

  setTimings((prev) => {
    const next = prev.map((row) => row.slice());

    if (!next[nextLine]) {
      next[nextLine] = lines[nextLine].words.map(() => ({
        start: -1,
        end: -1,
      }));
    }

    // End previous word
    if (
      activeLine >= 0 &&
      activeWord >= 0 &&
      next[activeLine] &&
      next[activeLine][activeWord]
    ) {
      if (next[activeLine][activeWord].end < 0) {
        next[activeLine][activeWord] = {
          ...next[activeLine][activeWord],
          end: Math.max(
            next[activeLine][activeWord].start + 0.05,
            t
          ),
        };
      }
    }

    // Start next word
    next[nextLine][nextWord] = {
      ...next[nextLine][nextWord],
      start: t,
    };

    return next;
  });

  setHistory((h) => [
    ...h,
    {
      type: "start",
      lineIndex: nextLine,
      wordIndex: nextWord,
      time: t,
    },
  ]);

  setActiveLine(nextLine);
  setActiveWord(nextWord);
}, [
  phase,
  activeLine,
  activeWord,
  lines,
  currentTime,
]);

  // Space: end current word at currentTime (without advancing).
  const captureWordEnd = useCallback(() => {
    if (phase !== "recording") return;
    if (activeLine < 0 || activeWord < 0) return;
    const li = activeLine;
    const wi = activeWord;
    const t = currentTime;
    setTimings((prev) => {
      const next = prev.map((row) => row.slice());
      if (next[li] && next[li][wi]) {
        next[li][wi] = { ...next[li][wi], end: Math.max(next[li][wi].start + 0.05, t) };
      }
      return next;
    });
    setHistory((h) => [
      ...h,
      { type: "end", lineIndex: li, wordIndex: wi, time: t },
    ]);
  }, [phase, activeLine, activeWord, currentTime]);

  // Undo last capture
  const undo = useCallback(() => {
    if (phase !== "recording") return;
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      const newHistory = h.slice(0, -1);
      setTimings((prev) => {
        const next = prev.map((row) => row.slice());
        if (next[last.lineIndex] && next[last.lineIndex][last.wordIndex]) {
          if (last.type === "start") {
            // Clear start of the word that was just started
            next[last.lineIndex][last.wordIndex] = {
              ...next[last.lineIndex][last.wordIndex],
              start: -1,
            };
            // Find the previously-active word (last "start" before this) and clear its
            // auto-assigned end (unless an explicit "end" event was added for it later).
            const prevStart = [...newHistory].reverse().find((e) => e.type === "start");
            if (prevStart) {
              const explicit = newHistory.some(
                (e) =>
                  e.type === "end" &&
                  e.lineIndex === prevStart.lineIndex &&
                  e.wordIndex === prevStart.wordIndex
              );
              if (!explicit && next[prevStart.lineIndex]?.[prevStart.wordIndex]) {
                next[prevStart.lineIndex][prevStart.wordIndex] = {
                  ...next[prevStart.lineIndex][prevStart.wordIndex],
                  end: -1,
                };
              }
            }
          } else {
            next[last.lineIndex][last.wordIndex] = {
              ...next[last.lineIndex][last.wordIndex],
              end: -1,
            };
          }
        }
        return next;
      });
      // Restore active pointer to the previously-active word (or -1 if none).
      if (last.type === "start") {
        const prevStart = [...newHistory].reverse().find((e) => e.type === "start");
        if (prevStart) {
          setActiveLine(prevStart.lineIndex);
          setActiveWord(prevStart.wordIndex);
        } else {
          setActiveLine(-1);
          setActiveWord(-1);
        }
      }
      return newHistory;
    });
  }, [phase]);

  // Skip current line (move to next, no word recording yet on the new line)
  const skipLine = useCallback(() => {
    if (phase !== "recording") return;
    if (activeLine + 1 < lines.length) {
      setActiveLine(activeLine + 1);
      setActiveWord(-1);
    }
  }, [phase, activeLine, lines.length]);

  // Finish & build words array — enforce contiguous timings for smooth fills
  const finish = () => {
    onPause();
    type Flat = { word: string; lineIndex: number; wordIndex: number; start: number; end: number };
    const flat: Flat[] = [];
    timings.forEach((lineRow, li) => {
      const lineWords = lines[li]?.words ?? [];
      lineRow.forEach((t, wi) => {
        const word = lineWords[wi];
        if (!word) return;
        if (t.start < 0) return; // skip un-captured
        flat.push({ word, lineIndex: li, wordIndex: wi, start: t.start, end: t.end });
      });
    });

    // Make per-line timings contiguous: each word ends exactly where the next begins
    // so karaoke fills move smoothly without gaps or stalls.
    const words: WBWWord[] = flat.map((cur, i) => {
      const next = flat[i + 1];
      const sameLineNext = next && next.lineIndex === cur.lineIndex;
      let end: number;
      if (sameLineNext) {
        end = next.start;
      } else if (cur.end >= 0) {
        end = cur.end;
      } else if (next) {
        end = next.start;
      } else {
        end = Math.min(duration, cur.start + 0.5);
      }
      end = Math.max(cur.start + 0.08, end);
      return {
        word: cur.word,
        startTime: Number(cur.start.toFixed(2)),
        endTime: Number(end.toFixed(2)),
        lineIndex: cur.lineIndex,
      };
    });

    setPhase("done");
    onComplete(words);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (phase !== "recording") return;
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.code === "ArrowRight") {
        e.preventDefault();
        captureWordStart();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        undo();
      } else if (e.code === "Space") {
        e.preventDefault();
        captureWordEnd();
      } else if (e.code === "Enter") {
        e.preventDefault();
        skipLine();
      } else if (e.code === "KeyP") {
        e.preventDefault();
        if (isPlaying) onPause(); else onPlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, captureWordStart, captureWordEnd, undo, skipLine, isPlaying, onPlay, onPause]);

  const totalCaptured = useMemo(
    () => timings.reduce((acc, row) => acc + row.filter((t) => t.start >= 0).length, 0),
    [timings]
  );
  const totalWords = useMemo(
    () => lines.reduce((acc, l) => acc + l.words.length, 0),
    [lines]
  );

  // ──────────── UI ────────────

  if (phase === "setup") {
    return (
      <div className="flex flex-1 flex-col gap-4 overflow-hidden">
        <div className="rounded-lg bg-secondary/40 p-4">
          <Label className="mb-2 block text-sm font-semibold">Lyrics (one line per row)</Label>
          <Textarea
            value={rawLyrics}
            onChange={(e) => setRawLyrics(e.target.value)}
            rows={10}
            placeholder="Paste lyrics here, one line per row…"
            className="font-mono text-sm"
          />
          <div className="mt-2 text-xs text-muted-foreground">
            {lines.length} lines · {totalWords} words
          </div>
        </div>

        <div className="rounded-lg border border-border/50 bg-background/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Keyboard className="h-4 w-4 text-accent" /> Keyboard shortcuts
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li><kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">→</kbd> Move red box to next word (records end of current, start of next)</li>
            <li><kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">Space</kbd> End current word (without advancing)</li>
            <li><kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">←</kbd> Undo last capture</li>
            <li><kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">Enter</kbd> Skip to next line</li>
            <li><kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">P</kbd> Play / Pause</li>
          </ul>
        </div>

        <div className="flex justify-end">
          <Button onClick={startRecording} disabled={lines.length === 0} className="gap-2" size="lg">
            <Play className="h-4 w-4" /> Start Recording
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
        <div className="text-center">
          <h3 className="mb-1 text-xl font-semibold">Word-by-word karaoke captured</h3>
          <p className="text-muted-foreground">
            {totalCaptured} of {totalWords} words timed across {lines.length} lines.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Start Over
          </Button>
        </div>
      </div>
    );
  }

  // RECORDING — show first line until user starts capturing
  const displayLineIndex = activeLine === -1 ? 0 : activeLine;
  const currentLine = lines[displayLineIndex];
  const lineProgress = totalWords > 0 ? (totalCaptured / totalWords) * 100 : 0;

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      {/* Transport */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary p-2 md:gap-3 md:p-3">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 md:h-9 md:w-9"
          onClick={() => (isPlaying ? onPause() : onPlay())}
          title="Play / Pause (P)"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="font-mono text-sm font-bold md:text-lg">
          {currentTime.toFixed(2)}s
        </div>
        <div className="flex items-center gap-1 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent md:gap-2 md:px-2 md:py-1 md:text-xs">
          <Gauge className="h-3 w-3" />
          {Math.round(syncSpeed * 100)}%
        </div>
        <div className="flex min-w-[100px] flex-1 items-center gap-2 md:min-w-[160px]">
          <Slider
            value={[syncSpeed * 100]}
            min={30}
            max={100}
            step={5}
            onValueChange={([v]) => onSpeedChange(v / 100)}
            className="flex-1"
          />
        </div>
        <div className="text-xs text-muted-foreground md:text-sm">
          Line {displayLineIndex + 1}/{lines.length}
        </div>
        <Button onClick={finish} size="sm" variant="secondary" className="h-7 text-xs md:h-8 md:text-sm">
          <Check className="mr-1 h-3.5 w-3.5" /> Done
        </Button>
      </div>

      {/* Progress */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${lineProgress}%` }}
        />
      </div>

      {/* Active line display */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-border/60 bg-background/40 p-4 md:p-8">
        <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <span>Word-by-word</span>
          <span>{totalCaptured}/{totalWords} words</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`wbw-line-${displayLineIndex}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {currentLine && (
              <p
                dir="auto"
                className="text-2xl font-bold leading-snug sm:text-3xl md:text-4xl"
                style={{ unicodeBidi: "plaintext" }}
              >
                {currentLine.words.map((w, wi) => {
                  const wordTiming = timings[displayLineIndex]?.[wi];
                  const isRecording = activeLine === displayLineIndex && wi === activeWord;
                  const isFinished = !!wordTiming && wordTiming.start >= 0 && wordTiming.end >= 0;
                  const isStarted = !!wordTiming && wordTiming.start >= 0 && !isFinished;
                  return (
                    <span
                      key={`${w}-${wi}`}
                      className={cn(
                        "mr-2 inline-block transition-colors",
                        isRecording && "rounded bg-red-500/20 px-1 text-foreground ring-2 ring-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.25)]",
                        !isRecording && isFinished && "text-accent",
                        !isRecording && isStarted && "text-accent/70",
                        !isRecording && !isStarted && !isFinished && "text-muted-foreground/70"
                      )}
                    >
                      {w}
                    </span>
                  );
                })}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Up next line */}
        {lines[displayLineIndex + 1] && (
          <div className="mt-6 rounded-xl border border-border/40 bg-secondary/30 p-3 md:p-4">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Up next
            </div>
            <p
              dir="auto"
              className="text-base font-medium text-muted-foreground md:text-lg"
              style={{ unicodeBidi: "plaintext" }}
            >
              {lines[displayLineIndex + 1].text}
            </p>
          </div>
        )}
      </div>

      {/* Touch controls (mobile users without keyboard) */}
      <div className="grid grid-cols-4 gap-2">
        <Button variant="outline" size="sm" onClick={undo} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Undo
        </Button>
        <Button variant="outline" size="sm" onClick={captureWordEnd} className="gap-1">
          End
        </Button>
        <Button variant="outline" size="sm" onClick={skipLine} className="gap-1">
          <CornerDownLeft className="h-4 w-4" /> Skip
        </Button>
        <Button size="sm" onClick={captureWordStart} className="gap-1">
          Next <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
