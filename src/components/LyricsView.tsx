import { useState, useEffect, useMemo, useRef, Fragment, useLayoutEffect, useCallback } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { fetchSyncedLyrics, getCurrentLyricIndex, ParsedLyrics, LyricLine, parseLRC } from "@/lib/lyrics";
import { fetchMergedSongRecord } from "@/lib/songRecords";
import { getCachedLyrics, getCachedKaraoke } from "@/lib/offlineCache";
import { useDominantColors } from "@/hooks/useDominantColor";
import { 
  X, 
  Heart,
  Loader2,
  MoreHorizontal,
  Repeat,
  Repeat1,
  ListPlus,
  AlignLeft,
  Volume2,
  VolumeX,
  Disc3,
} from "lucide-react";
import iconPlay from "@/assets/icon-play.png";
import iconPause from "@/assets/icon-pause.png";
import iconNext from "@/assets/icon-next.png";
import iconPrev from "@/assets/icon-prev.png";
import lyricsIcon from "@/assets/lyrics-icon.png";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { AddToPlaylistDialog } from "@/components/AddToPlaylistDialog";
import React from "react";

interface LyricsViewProps {
  onClose: () => void;
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

interface VisibleLyricItem {
  text: string;
  index: number;
  position: number;
  lineTime: number;
  nextLineTime: number;
  isIntro?: boolean;
  secondaryText?: string;
  alignment?: 'left' | 'right';
  isMusic?: boolean;
  musicEnd?: number;
  isNlPair?: boolean;
  nlCompanionText?: string;
  nlCompanionTime?: number;
  nlCompanionEndTime?: number;
  nlCompanionElrcWords?: { word: string; startTime: number; endTime: number }[];
  elrcWords?: { word: string; startTime: number; endTime: number }[];
  emWords?: Set<number>; // indices of words with <em> tag
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function stripBrackets(text: string): string {
  return text.replace(/^\(/, '').replace(/\)$/, '').replace(/\(([^)]*)\)/g, '$1');
}

// ─── Animated canvas gradient background with artwork-sampled blob colors ───

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: [number, number, number];
}

function CanvasGradientBg({ artworkUrl, isClosing, isMobile = false }: { artworkUrl?: string | null; isClosing: boolean; isMobile?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzeRef = useRef<HTMLCanvasElement>(null);
  const blobsRef = useRef<Blob[]>([]);
  const rafRef = useRef<number>(0);
  const opacityRef = useRef(0);

  // Sample colors from artwork
  useEffect(() => {
    if (!artworkUrl) {
      // Fallback palette
      blobsRef.current = createBlobs(canvasRef.current, [
        [80, 20, 120], [20, 60, 140], [140, 30, 60], [30, 100, 80], [100, 40, 100],
      ], isMobile);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const ac = analyzeRef.current;
      if (!ac) return;
      const actx = ac.getContext('2d');
      if (!actx) return;
      ac.width = img.width;
      ac.height = img.height;
      actx.drawImage(img, 0, 0);
      const data = actx.getImageData(0, 0, img.width, img.height).data;
      const colors: [number, number, number][] = [];
      for (let i = 0; i < 50; i++) {
        const idx = Math.floor(Math.random() * (data.length / 4)) * 4;
        colors.push([data[idx], data[idx + 1], data[idx + 2]]);
      }
      blobsRef.current = createBlobs(canvasRef.current, colors, isMobile);
    };
    img.onerror = () => {
      blobsRef.current = createBlobs(canvasRef.current, [
        [80, 20, 120], [20, 60, 140], [140, 30, 60],
      ], isMobile);
    };
    img.src = artworkUrl;
  }, [artworkUrl, isMobile]);

  // Resize with devicePixelRatio for crisp rendering
  useEffect(() => {
    const handleResize = () => {
      const c = canvasRef.current;
      if (c) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = window.innerWidth * dpr;
        c.height = window.innerHeight * dpr;
        c.style.width = window.innerWidth + 'px';
        c.style.height = window.innerHeight + 'px';
        const ctx = c.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      // Fade in
      if (!isClosing && opacityRef.current < 1) opacityRef.current = Math.min(1, opacityRef.current + 0.02);
      if (isClosing && opacityRef.current > 0) opacityRef.current = Math.max(0, opacityRef.current - 0.03);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = opacityRef.current * 0.65;
      ctx.globalCompositeOperation = 'lighter';

      blobsRef.current.forEach(b => {
        b.x += b.vx;
        b.y += b.vy;
        if (b.x < -b.radius) b.x = w + b.radius;
        if (b.x > w + b.radius) b.x = -b.radius;
        if (b.y < -b.radius) b.y = h + b.radius;
        if (b.y > h + b.radius) b.y = -b.radius;

        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        grad.addColorStop(0, `rgba(${b.color[0]},${b.color[1]},${b.color[2]},0.18)`);
        grad.addColorStop(1, `rgba(${b.color[0]},${b.color[1]},${b.color[2]},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isClosing]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0" style={{ zIndex: 0 }} />
      <canvas ref={analyzeRef} style={{ display: 'none' }} />
    </>
  );
}

function createBlobs(canvas: HTMLCanvasElement | null, colors: [number, number, number][], isMobile = false): Blob[] {
  const w = canvas?.width || window.innerWidth;
  const h = canvas?.height || window.innerHeight;
  const count = isMobile ? 8 : 20; // Fewer blobs on mobile for performance
  const blobs: Blob[] = [];
  for (let i = 0; i < count; i++) {
    blobs.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 280 + 180,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  return blobs;
}

// ─── Intro circles (Apple Music style) ───
function IntroCircles({ currentTime, startTime, endTime }: { currentTime: number; startTime: number; endTime: number }) {
  const duration = Math.max(endTime - startTime, 0.5);
  const elapsed = Math.max(0, currentTime - startTime);
  const circleCount = 3;
  
  // Each circle fills sequentially: first, second, third
  const fillDurationPerCircle = Math.min(0.5, duration / (circleCount + 1));
  const delayBetween = (duration - fillDurationPerCircle - 0.3) / circleCount;
  
  // Shrink 0.3s before the first lyric line
  const shrinkStart = endTime - 0.3;
  const isShrinking = currentTime >= shrinkStart;

  return (
    <div className="flex gap-3 py-2">
      {Array.from({ length: circleCount }).map((_, i) => {
        const circleStart = startTime + i * delayBetween;
        const circleEnd = circleStart + fillDurationPerCircle;
        const circleProgress = Math.max(0, Math.min(1, (currentTime - circleStart) / fillDurationPerCircle));
        const isFilled = currentTime >= circleEnd;

        return (
          <motion.div
            key={i}
            className="rounded-full"
            style={{ width: 14, height: 14 }}
            animate={{
              scale: isShrinking ? 0 : isFilled ? [0.95, 1.05, 0.95] : 0.9,
              opacity: isShrinking ? 0 : circleProgress > 0 ? 1 : 0.5,
              backgroundColor: circleProgress > 0
                ? `rgba(255,255,255,${0.15 + circleProgress * 0.85})`
                : 'rgba(255,255,255,0.15)',
            }}
            transition={{
              scale: isShrinking
                ? { duration: 0.25, ease: [0.55, 0.085, 0.68, 0.53] }
                : isFilled
                  ? { duration: 2, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }
                  : { duration: 0.3 },
              opacity: { duration: isShrinking ? 0.25 : 0.3 },
              backgroundColor: { duration: 0.4, ease: 'easeOut' },
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Music indicator: 3 breathing dots (matches the song intro animation) ───
function MusicIndicator({ currentTime, startTime, endTime }: { currentTime: number; startTime: number; endTime: number }) {
  // Reuse the IntroCircles look so instrumental breaks feel consistent with the song intro.
  return <IntroCircles currentTime={currentTime} startTime={startTime} endTime={endTime} />;
}

// ─── Helper: compute line-break indices for mobile (break after ~9 chars at word boundaries) ───
function getMobileBreakIndices(words: { word: string }[], charLimit: number = 13): Set<number> {
  const breakAfter = new Set<number>();
  let charCount = 0;
  for (let i = 0; i < words.length; i++) {
    charCount += words[i].word.length;
    if (i < words.length - 1) {
      charCount += 1; // space
      if (charCount >= charLimit) {
        breakAfter.add(i);
        charCount = 0;
      }
    }
  }
  return breakAfter;
}

// ─── Helper: split plain text into lines for mobile ───
function splitTextForMobile(text: string, charLimit: number = 13): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const candidate = currentLine ? currentLine + ' ' + word : word;
    if (currentLine && candidate.length > charLimit) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}


function KaraokeWordSpan({
  word,
  startTime,
  endTime,
  currentTime,
  frozen,
  isEm,
}: {
  word: string;
  startTime: number;
  endTime: number;
  currentTime: number;
  nextWordStart?: number;
  frozen?: boolean;
  emphasisDuration?: number;
  isEm?: boolean;
}) {
  const safeDuration = Math.max(endTime - startTime, 0.12);
  let rawProgress = 0;
  if (frozen) {
    rawProgress = 1;
  } else if (currentTime >= endTime) {
    rawProgress = 1;
  } else if (currentTime > startTime) {
    rawProgress = (currentTime - startTime) / safeDuration;
  }
  rawProgress = Math.min(1, Math.max(0, rawProgress));

  const visualProgressRef = useRef(0);
  const lastTimeRef = useRef(currentTime);
  const lastRawRef = useRef(0);

  let progress = rawProgress;
  if (frozen) {
    progress = 1;
    visualProgressRef.current = 1;
  } else {
    const timeDelta = currentTime - lastTimeRef.current;
    const rawDelta = rawProgress - lastRawRef.current;
    lastTimeRef.current = currentTime;
    lastRawRef.current = rawProgress;

    // Detect seek (large backward jump)
    if (timeDelta < -0.5) {
      visualProgressRef.current = rawProgress;
      progress = rawProgress;
    } else {
      const prev = visualProgressRef.current;

      if (rawProgress < 0.01 && prev > 0.5) {
        // Word reset (new cycle or seek to before word)
        visualProgressRef.current = rawProgress;
        progress = rawProgress;
      } else if (rawProgress >= prev) {
        const delta = rawProgress - prev;
        const timeLeft = Math.max(0, endTime - currentTime);
        const urgency = timeLeft < 0.08 ? 0.95 : timeLeft < 0.15 ? 0.85 : timeLeft < 0.3 ? 0.6 : 0;
        const baseCatchUp = delta > 0.6 ? 0.7 : delta > 0.3 ? 0.55 : 0.4;
        const catchUp = Math.min(0.96, baseCatchUp + urgency);
        progress = prev + delta * catchUp;
        if (rawProgress === 1 && progress > 0.97) progress = 1;
        if (rawProgress >= 0.95 && timeLeft < 0.05) progress = 1;
      } else {
        // Small backward jitter — allow minor correction to prevent stutter
        const backDelta = prev - rawProgress;
        if (backDelta < 0.05) {
          // Tiny jitter — hold position
          progress = prev;
        } else {
          // Larger backward — snap to raw
          progress = rawProgress;
        }
      }
      visualProgressRef.current = progress;
    }
  }

  const fillPercent = Math.min(100, Math.max(0, progress * 100));
  const isDone = progress >= 1;

  // Emphasis wave effect for <em> words only (long-word auto-trigger removed for stability)
  const emActive = isEm && !frozen && currentTime >= startTime && currentTime <= endTime + 0.15;

  // Smooth uplift: rises during fill, stays risen after done (never comes back down).
  // Strictly upward — no downward motion until the line is done.
  const upliftAmount = 1.5;
  let translateY = 0;
  if (frozen) {
    translateY = -upliftAmount; // already filled, stay up
  } else if (progress > 0) {
    // Rise smoothly to full uplift in the first ~30% of the word, then hold.
    translateY = -upliftAmount * Math.min(1, progress * 3.5);
  }

  // <em> adds a gentle, slow whole-word lift on top of the base uplift.
  // No per-character wave / scaling — keeps text rock-steady, no wobble or teleport.
  const emLift = emActive ? 5 : 0;
  const emScale = emActive ? 1.06 : 1;
  const emGlow = emActive ? 0.45 : 0;

  return (
    <span
      className="relative inline-block align-baseline"
      style={{
        overflow: 'visible',
        transform: `translateY(${translateY - emLift}px) scale(${emScale})`,
        transformOrigin: 'center bottom',
        transition: emActive
          ? 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1), text-shadow 500ms ease-out'
          : 'transform 450ms cubic-bezier(0.22, 1, 0.36, 1), text-shadow 400ms ease-out',
        textShadow: emGlow > 0 ? `0 0 14px rgba(255,255,255,${emGlow})` : 'none',
      }}
    >
      {/* Base text (no per-char animation — stable, no wobble) */}
      <span style={{ whiteSpace: 'pre', color: `rgba(255, 255, 255, ${frozen ? 0.15 : 0.35})` }}>
        {word}
      </span>
      {/* Fill overlay with soft gradient edge */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 pointer-events-none"
        style={{
          width: `${fillPercent}%`,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          opacity: frozen ? 0.25 : 1,
          transition: 'opacity 300ms ease',
          maskImage: isDone ? 'none' : 'linear-gradient(to right, white 0%, white calc(100% - 20px), rgba(255,255,255,0.4) calc(100% - 8px), transparent 100%)',
          WebkitMaskImage: isDone ? 'none' : 'linear-gradient(to right, white 0%, white calc(100% - 20px), rgba(255,255,255,0.4) calc(100% - 8px), transparent 100%)',
        }}
      >
        <span style={{ whiteSpace: 'pre', color: '#ffffff' }}>{word}</span>
      </span>
    </span>
  );
}

// ─── eLRC line ───
function ELRCLine({ words, currentTime, isMobile, frozen, charLimit }: { words: { word: string; startTime: number; endTime: number }[]; currentTime: number; isMobile: boolean; frozen?: boolean; charLimit?: number }) {
  const breakIndices = useMemo(() => isMobile ? getMobileBreakIndices(words, charLimit) : new Set<number>(), [words, isMobile, charLimit]);
  return (
    <span dir="auto" className="font-semibold inline-block" style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: isMobile ? '2.2rem' : '48px', fontWeight: 600, unicodeBidi: "plaintext", lineHeight: 1.4, overflow: 'visible' }}>
      {words.map((w, idx) => (
        <Fragment key={`${w.word}-${idx}`}>
          <KaraokeWordSpan
            word={w.word}
            startTime={w.startTime}
            endTime={w.endTime}
            currentTime={currentTime}
            nextWordStart={words[idx + 1]?.startTime}
            frozen={frozen}
            emphasisDuration={Math.max(0, w.endTime - w.startTime)}
          />
          {idx < words.length - 1 ? (breakIndices.has(idx) ? <br /> : " ") : null}
        </Fragment>
      ))}
    </span>
  );
}

// ─── Karaoke line (renders for BOTH active and recently-passed lines) ───
function KaraokeLine({ text, words, lineIndex, lineStartTime, lineEndTime, currentTime, isCurrentLine, isMobile, charLimit }: {
  text: string; words: KaraokeWord[]; lineIndex: number; lineStartTime: number; lineEndTime: number; currentTime: number; isCurrentLine: boolean; isMobile: boolean; charLimit?: number;
}) {
  const hasLineIndex = useMemo(() => words.some((w) => typeof w.lineIndex === "number"), [words]);

  const lineWords = useMemo(() => {
    const filtered = hasLineIndex
      ? words.filter((w) => w.lineIndex === lineIndex)
      : words.filter((w) => w.startTime >= lineStartTime && w.startTime < lineEndTime);
    return filtered.slice().sort((a, b) => a.startTime - b.startTime);
  }, [hasLineIndex, words, lineIndex, lineStartTime, lineEndTime]);

  const visualLineWords = useMemo(() => {
    if (lineWords.length === 0) return [] as Array<KaraokeWord & { visualStart: number; visualEnd: number; emphasisDuration: number }>;

    const minVisualDuration = 0.18;
    const smoothCarry = 0.045;
    let prevVisualEnd = Math.max(lineStartTime, lineWords[0].startTime);

    return lineWords.map((w, i) => {
      const realStart = w.startTime;
      const realEnd = Math.max(w.endTime, w.startTime + 0.02);
      const emphasisDuration = Math.max(0, realEnd - realStart);
      const nextRealStart = lineWords[i + 1]?.startTime ?? (lineEndTime + smoothCarry);

      const visualStart = Math.max(realStart, prevVisualEnd - smoothCarry);
      const naturalEnd = Math.max(realEnd, visualStart + minVisualDuration);
      const capEnd = i < lineWords.length - 1
        ? Math.max(visualStart + 0.1, nextRealStart + smoothCarry)
        : Math.max(visualStart + minVisualDuration, lineEndTime + 0.1);

      let visualEnd = Math.min(naturalEnd, capEnd);
      if (visualEnd <= visualStart + 0.06) visualEnd = visualStart + 0.06;

      prevVisualEnd = visualEnd;

      return {
        ...w,
        visualStart,
        visualEnd,
        emphasisDuration,
      };
    });
  }, [lineWords, lineStartTime, lineEndTime]);

  const shouldRenderFill = visualLineWords.length > 0 && (isCurrentLine || currentTime >= lineEndTime);
  const frozen = !isCurrentLine && currentTime >= lineEndTime;

  // Consistent line breaks: compute from text words (same for active, inactive, frozen)
  const textWords = useMemo(() => text.split(/\s+/), [text]);
  const mobileBreaks = useMemo(() => isMobile ? getMobileBreakIndices(textWords.map(w => ({ word: w })), charLimit) : new Set<number>(), [textWords, isMobile, charLimit]);

  if (shouldRenderFill) {
    // Map visualLineWords to textWords indices for consistent breaks
    return (
      <span dir="auto" className="font-semibold inline-block" style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: isMobile ? '2.2rem' : '48px', fontWeight: 600, unicodeBidi: "plaintext", lineHeight: 1.4, overflow: 'visible' }}>
        {visualLineWords.map((wordData, idx) => (
          <Fragment key={`${wordData.word}-${idx}`}>
            <KaraokeWordSpan
              word={wordData.word}
              startTime={wordData.visualStart}
              endTime={wordData.visualEnd}
              currentTime={currentTime}
              nextWordStart={visualLineWords[idx + 1]?.visualStart}
              frozen={frozen}
              emphasisDuration={wordData.emphasisDuration}
            />
            {idx < visualLineWords.length - 1 ? (mobileBreaks.has(idx) ? <br /> : " ") : null}
          </Fragment>
        ))}
      </span>
    );
  }

  // Inactive: use same getMobileBreakIndices logic as active for consistency
  return (
    <span className="font-semibold inline-block" style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif", fontSize: isMobile ? '2.2rem' : '48px', fontWeight: 600, color: "rgba(255, 255, 255, 0.35)", unicodeBidi: "plaintext", lineHeight: 1.4 }}>
      {isMobile ? textWords.map((word, i) => (
        <Fragment key={i}>{word}{i < textWords.length - 1 ? (mobileBreaks.has(i) ? <br /> : " ") : null}</Fragment>
      )) : text}
    </span>
  );
}

const MemoKaraokeLine = React.memo(KaraokeLine, (prev, next) => {
  if (
    prev.text !== next.text ||
    prev.words !== next.words ||
    prev.lineIndex !== next.lineIndex ||
    prev.lineStartTime !== next.lineStartTime ||
    prev.lineEndTime !== next.lineEndTime ||
    prev.isCurrentLine !== next.isCurrentLine ||
    prev.isMobile !== next.isMobile ||
    prev.charLimit !== next.charLimit
  ) {
    return false;
  }

  const prevFrozen = !prev.isCurrentLine && prev.currentTime >= prev.lineEndTime;
  const nextFrozen = !next.isCurrentLine && next.currentTime >= next.lineEndTime;
  if (prevFrozen && nextFrozen) return true;

  const prevBeforeStart = prev.currentTime < prev.lineStartTime;
  const nextBeforeStart = next.currentTime < next.lineStartTime;
  if (!prev.isCurrentLine && !next.isCurrentLine && prevBeforeStart && nextBeforeStart) return true;

  return Math.abs(prev.currentTime - next.currentTime) < 0.02;
});

// ═══════════════════════════════════════════════════════════════════
// Apple Music–style lyrics: fixed-position, CSS-transition based
// ═══════════════════════════════════════════════════════════════════

function useAppleMusicStyles(
  lineRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  visibleLyrics: VisibleLyricItem[],
  isMobile: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  lyricsSpeed: number,
) {
  const prevPositionsRef = useRef<Map<string, number>>(new Map());
  const LINE_PADDING = isMobile ? 16 : 16;
  const ACTIVE_OFFSET = 0.15;
  const dur = isMobile ? 0.28 + lyricsSpeed * 0.32 : 0.2 + lyricsSpeed * 0.5;
  // Bumped whenever a tracked line's height changes (e.g. SecondaryTextLine opens/closes).
  const [resizeTick, setResizeTick] = useState(0);

  // Observe size changes of every tracked line so upcoming lines reposition
  // smoothly when a SecondaryTextLine expands/collapses.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    let scheduled = false;
    const ro = new ResizeObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        setResizeTick((t) => (t + 1) % 1_000_000);
      });
    });
    lineRefs.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [lineRefs, visibleLyrics]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerH = container.clientHeight;
    const anchorY = containerH * ACTIVE_OFFSET;

    const newPositions = new Map<string, number>();
    const sorted = [...visibleLyrics].sort((a, b) => a.position - b.position);

    const heights = new Map<string, number>();
    sorted.forEach((item) => {
      const key = item.isIntro ? 'intro' : `lyric-${item.index}`;
      const el = lineRefs.current.get(key);
      if (el) {
        heights.set(key, el.scrollHeight || (isMobile ? 42 : 56));
      } else {
        heights.set(key, isMobile ? 42 : 56);
      }
    });

    const activeKey = sorted.find(s => s.position === 0);
    const activeHeight = activeKey ? (heights.get(activeKey.isIntro ? 'intro' : `lyric-${activeKey.index}`) || 56) : 56;

    const positionYMap = new Map<string, number>();

    let yUp = anchorY;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const item = sorted[i];
      const key = item.isIntro ? 'intro' : `lyric-${item.index}`;
      if (item.position < 0) {
        const h = heights.get(key) || 56;
        yUp -= (h + LINE_PADDING);
        positionYMap.set(key, yUp);
      }
    }

    if (activeKey) {
      const key = activeKey.isIntro ? 'intro' : `lyric-${activeKey.index}`;
      positionYMap.set(key, anchorY);
    }

    let yDown = anchorY + activeHeight + LINE_PADDING;
    for (const item of sorted) {
      const key = item.isIntro ? 'intro' : `lyric-${item.index}`;
      if (item.position > 0) {
        positionYMap.set(key, yDown);
        const h = heights.get(key) || 56;
        yDown += h + LINE_PADDING;
      }
    }

    sorted.forEach((item) => {
      const key = item.isIntro ? 'intro' : `lyric-${item.index}`;
      const el = lineRefs.current.get(key);
      if (!el) return;

      const { position } = item;
      const isActive = position === 0;
      const distance = Math.abs(position);
      newPositions.set(key, position);

      const targetY = positionYMap.get(key) ?? (anchorY + position * 68);

      let opacity: number, blur: number, scale: number;
      if (isActive) {
        opacity = 1; blur = 0; scale = 1;
      } else if (position < 0) {
        opacity = Math.max(0.05, 0.35 - (distance - 1) * 0.12);
        blur = 0;
        scale = 1;
      } else {
        opacity = Math.max(0.08, 0.5 - (distance - 1) * 0.06);
        blur = 0;
        scale = Math.max(0.94, 1 - distance * 0.008);
      }

      const prevPos = prevPositionsRef.current.get(key);
      const isNew = prevPos === undefined;
      const posChanged = prevPos !== undefined && prevPos !== position;

      const isMovingUp = prevPos === 0 && position === -1;
      const isPastMovingUp = position < 0 && prevPos !== undefined && prevPos < 0 && prevPos !== position;

      let delay = 0;
      if (isMovingUp || isPastMovingUp) {
        delay = 0;
      } else if (isActive) {
        delay = 0.05;
      } else if (position > 0) {
        delay = 0.05 + position * 0.04;
      } else if (position < 0) {
        delay = 0;
      }

      const easing = isMobile ? 'cubic-bezier(0.25, 0.8, 0.25, 1)' : 'cubic-bezier(0.2, 0.9, 0.3, 1.05)';
      const filterProp = blur > 0 ? `, filter ${dur}s ${easing} ${delay}s` : '';
      const transitionStr = `opacity ${dur}s ${easing} ${delay}s${filterProp}, transform ${dur}s ${easing} ${delay}s`;

      const makeTransform = (y: number, s: number) =>
        `translate3d(0, ${y}px, 0) scale(${s})`;

      if (isNew) {
        el.style.transition = 'none';
        el.style.willChange = 'transform, opacity';
        if (isMobile) {
          // iOS Safari: avoid double-rAF, use simpler single-frame approach
          el.style.opacity = '0';
          el.style.transform = makeTransform(targetY, scale);
          // Force layout read to flush the 'none' transition
          void el.offsetHeight;
          el.style.transition = `opacity 0.25s ${easing}, transform ${dur}s ${easing}`;
          el.style.opacity = String(opacity);
          el.style.transform = makeTransform(targetY, scale);
        } else if (position > 5) {
          el.style.opacity = '0';
          el.style.filter = 'blur(4px)';
          el.style.transform = makeTransform(containerH + 40, 0.92);
          requestAnimationFrame(() => {
            el.style.transition = transitionStr;
            el.style.opacity = String(opacity);
            el.style.filter = `blur(${blur}px)`;
            el.style.transform = makeTransform(targetY, scale);
          });
        } else {
          el.style.opacity = '0';
          el.style.transform = makeTransform(targetY, scale);
          requestAnimationFrame(() => {
            el.style.transition = `opacity 0.2s ${easing}, transform ${dur}s ${easing}`;
            el.style.opacity = String(opacity);
            el.style.filter = `blur(${blur}px)`;
            el.style.transform = makeTransform(targetY, scale);
          });
        }
      } else if (posChanged) {
        el.style.transition = transitionStr;
        el.style.opacity = String(opacity);
        if (blur > 0) el.style.filter = `blur(${blur}px)`;
        el.style.transform = makeTransform(targetY, scale);
      }
    });

    prevPositionsRef.current.forEach((_, key) => {
      if (!newPositions.has(key)) {
        const el = lineRefs.current.get(key);
        if (el) {
          const fadeEasing = isMobile ? 'cubic-bezier(0.25, 0.8, 0.25, 1)' : 'cubic-bezier(0.2, 0.9, 0.3, 1.05)';
          el.style.transition = `opacity 0.2s ${fadeEasing}`;
          el.style.opacity = '0';
        }
      }
    });

    prevPositionsRef.current = newPositions;
  }, [visibleLyrics, lineRefs, isMobile, containerRef, LINE_PADDING, ACTIVE_OFFSET, dur, resizeTick]);
}

// ─── Bracket sub-line: smoothly opens space (pushing upcoming lines down)
// before fading text in; collapses space only after the main line moves on.
function SecondaryTextLine({ text, isActive, isMobile }: { text: string; isActive: boolean; isMobile: boolean }) {
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [textVisible, setTextVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      // Open the space first; fade text in slightly after so neighbors finish moving.
      setSpaceOpen(true);
      const t = setTimeout(() => setTextVisible(true), 60);
      return () => clearTimeout(t);
    }
    // Becoming inactive: collapse space immediately together with text fade,
    // so as the active line scrolls up no extra gap appears above the next line.
    setTextVisible(false);
    setSpaceOpen(false);
  }, [isActive]);

  // CSS grid 0fr→1fr trick gives smooth animation to the natural height.
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: spaceOpen ? '1fr' : '0fr',
        marginTop: spaceOpen ? '12px' : '0px',
        marginBottom: spaceOpen ? (isMobile ? '32px' : '40px') : '0px',
        transition:
          'grid-template-rows 220ms cubic-bezier(0.25, 0.8, 0.25, 1), margin-top 220ms cubic-bezier(0.25, 0.8, 0.25, 1), margin-bottom 220ms cubic-bezier(0.25, 0.8, 0.25, 1)',
      }}
    >
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
        <p
          dir="auto"
          style={{
            fontSize: isMobile ? '18px' : '22px',
            fontWeight: 500,
            color: isActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
            unicodeBidi: 'plaintext',
            lineHeight: 1.4,
            margin: 0,
            opacity: textVisible ? 1 : 0,
            transition: 'opacity 160ms ease-out, color 200ms ease-out',
          }}
        >
          {stripBrackets(text)}
        </p>
      </div>
    </div>
  );
}

// ─── Lyrics content (shared between desktop & mobile) ───
function LyricsContent({
  visibleLyrics, karaokeEnabled, karaokeWords, smoothTime, lyricsSpeed, bounceIntensity, isLoadingLyrics, isMobile, defaultAlignment, mobileCharLimit,
}: {
  visibleLyrics: VisibleLyricItem[]; karaokeEnabled: boolean; karaokeWords: KaraokeWord[]; smoothTime: number; lyricsSpeed: number; bounceIntensity: number; isLoadingLyrics: boolean; isMobile: boolean; defaultAlignment?: 'left' | 'right'; mobileCharLimit?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useAppleMusicStyles(lineRefs, visibleLyrics, isMobile, containerRef, lyricsSpeed);

  const fontSize = isMobile ? '2.2rem' : '48px';

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 78%, transparent 100%)',
      }}
    >
      {visibleLyrics.map((item) => {
        const { text, index, position, lineTime, nextLineTime, isIntro, secondaryText, alignment, isMusic, musicEnd, nlCompanionText, nlCompanionTime, nlCompanionEndTime, nlCompanionElrcWords, elrcWords, emWords } = item;
        const isActive = position === 0;
        const key = isIntro ? 'intro' : `lyric-${index}`;
        const lineAlign = (alignment || defaultAlignment || 'left') as 'left' | 'right';
        const textAlignClass = lineAlign === 'right' ? 'text-right' : 'text-left';

        // Dual/companion line renders identically to the primary — same size, same opacity.
        // Karaoke fills independently per its own word timings.
        const companionActive = nlCompanionTime != null && nlCompanionEndTime != null
          && smoothTime >= nlCompanionTime && smoothTime < nlCompanionEndTime;
        const companionOpacity = companionActive ? 1 : 0.7;

        return (
          <div
            key={key}
            ref={(el) => {
              if (el) lineRefs.current.set(key, el);
              else lineRefs.current.delete(key);
            }}
            className={cn("absolute left-0 right-0 transform-gpu", textAlignClass)}
            style={{
              willChange: "opacity, filter, transform",
              paddingLeft: isMobile ? '20px' : '0',
              paddingRight: isMobile ? '20px' : '0',
              top: 0,
              overflow: 'visible',
            }}
          >
            {isMusic && musicEnd ? (
              <MusicIndicator currentTime={smoothTime} startTime={lineTime} endTime={musicEnd} />
            ) : !isIntro && elrcWords && elrcWords.length > 0 ? (
              <>
                <ELRCLine words={elrcWords} currentTime={smoothTime} isMobile={isMobile} frozen={!isActive && smoothTime >= nextLineTime} charLimit={mobileCharLimit} />
                {nlCompanionText && nlCompanionElrcWords && nlCompanionElrcWords.length > 0 ? (
                  <div style={{ marginTop: '12px', opacity: companionOpacity, transition: 'opacity 250ms ease-out' }}>
                    <ELRCLine words={nlCompanionElrcWords} currentTime={smoothTime} isMobile={isMobile} frozen={!isActive && smoothTime >= nextLineTime} charLimit={mobileCharLimit} />
                  </div>
                ) : nlCompanionText && (
                  <p dir="auto" style={{ fontSize, fontWeight: 700, color: 'rgba(255,255,255,1)', unicodeBidi: "plaintext", lineHeight: 1.4, marginTop: '12px', margin: 0 }}>
                    {isMobile ? splitTextForMobile(nlCompanionText, mobileCharLimit).map((line, i, arr) => (
                      <Fragment key={i}>{line}{i < arr.length - 1 ? <br /> : null}</Fragment>
                    )) : nlCompanionText}
                  </p>
                )}
                {secondaryText && (
                  <SecondaryTextLine text={secondaryText} isActive={isActive} isMobile={isMobile} />
                )}
              </>
            ) : !isIntro && karaokeEnabled ? (
              <>
                <MemoKaraokeLine text={text} words={karaokeWords} lineIndex={index} lineStartTime={lineTime} lineEndTime={nextLineTime} currentTime={smoothTime} isCurrentLine={isActive} isMobile={isMobile} charLimit={mobileCharLimit} />
                {nlCompanionText && nlCompanionTime != null && nlCompanionEndTime != null ? (
                  <div style={{ marginTop: '12px', opacity: companionOpacity, transition: 'opacity 250ms ease-out' }}>
                    <MemoKaraokeLine text={nlCompanionText} words={karaokeWords} lineIndex={index + 1} lineStartTime={nlCompanionTime} lineEndTime={nlCompanionEndTime} currentTime={smoothTime} isCurrentLine={isActive} isMobile={isMobile} charLimit={mobileCharLimit} />
                  </div>
                ) : nlCompanionText && (
                  <p dir="auto" style={{ fontSize, fontWeight: 700, color: 'rgba(255,255,255,1)', unicodeBidi: "plaintext", lineHeight: 1.4, marginTop: '12px', margin: 0 }}>
                    {isMobile ? splitTextForMobile(nlCompanionText, mobileCharLimit).map((line, i, arr) => (
                      <Fragment key={i}>{line}{i < arr.length - 1 ? <br /> : null}</Fragment>
                    )) : nlCompanionText}
                  </p>
                )}
                {secondaryText && (
                  <SecondaryTextLine text={secondaryText} isActive={isActive} isMobile={isMobile} />
                )}
              </>
            ) : isIntro ? (
              <IntroCircles currentTime={smoothTime} startTime={lineTime} endTime={nextLineTime} />
            ) : (
              <>
                <p
                  dir="auto"
                  style={{
                    fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontSize,
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.35)",
                    unicodeBidi: "plaintext",
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  {isMobile ? splitTextForMobile(text, mobileCharLimit).map((line, i, arr) => (
                    <Fragment key={i}>{line}{i < arr.length - 1 ? <br /> : null}</Fragment>
                  )) : text}
                </p>
                {nlCompanionText && (
                  <p dir="auto" style={{ fontSize, fontWeight: isActive ? 700 : 600, color: "rgba(255,255,255,0.35)", unicodeBidi: "plaintext", lineHeight: 1.4, marginTop: '12px', margin: 0 }}>
                    {isMobile ? splitTextForMobile(nlCompanionText, mobileCharLimit).map((line, i, arr) => (
                      <Fragment key={i}>{line}{i < arr.length - 1 ? <br /> : null}</Fragment>
                    )) : nlCompanionText}
                  </p>
                )}
                {secondaryText && (
                  <SecondaryTextLine text={secondaryText} isActive={isActive} isMobile={isMobile} />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Static Lyrics (scrollable plain text, 15px paragraphs) ───
function StaticLyricsContent({ text, isMobile }: { text: string; isMobile: boolean }) {
  const hasText = text.trim().length > 0;
  return (
    <div className="relative w-full h-full overflow-y-auto" style={{ padding: isMobile ? '20px' : '20px 0' }}>
      {!hasText ? (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <p className="text-white/40" style={{ fontSize: '14px' }}>No static lyrics available for this track.</p>
        </div>
      ) : (
        <div style={{ fontSize: '15px', lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', fontWeight: 400 }}>
          {text.split('\n\n').length > 1
            ? text.split('\n\n').map((paragraph, i) => (
                <p key={i} style={{ marginBottom: '16px', whiteSpace: 'pre-wrap' }}>{paragraph}</p>
              ))
            : <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
          }
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MAIN LYRICS VIEW
// ═══════════════════════════════════════════════════
export function LyricsView({ onClose }: LyricsViewProps) {
  const { currentTrack, isPlaying, progress, playbackRate, volume, isLossless, pauseTrack, resumeTrack, nextTrack, previousTrack, seekTo, setVolume, repeat, toggleRepeat } = usePlayer();
  const isMobile = useIsMobile();

  const [parsedLyrics, setParsedLyrics] = useState<ParsedLyrics | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [isClosing, setIsClosing] = useState(false);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const [karaokeEnabled, setKaraokeEnabled] = useState(false);
  const [karaokeWords, setKaraokeWords] = useState<KaraokeWord[]>([]);
  const [lyricsSpeed, setLyricsSpeed] = useState(0.75);
  const [bounceIntensity, setBounceIntensity] = useState(0.5);
  const [mobileControlsVisible, setMobileControlsVisible] = useState(true);
  const mobileControlsTimerRef = useRef<number | null>(null);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [staticLyricsMode, setStaticLyricsMode] = useState(false);
  const [staticLyricsText, setStaticLyricsText] = useState("");
  const [showLyricsPanel, setShowLyricsPanel] = useState(true);
  const [earlyAppearance, setEarlyAppearance] = useState(0.2);
  const [mobileCharLimit, setMobileCharLimit] = useState(14);
  // Raw synced LRC text (for the AMLL renderer)
  const [syncedLrcText, setSyncedLrcText] = useState<string | null>(null);
  const [seekTick, setSeekTick] = useState(0);
  // Tracks whether the admin explicitly set mobile_char_limit (true) or we should
  // auto-derive it from <left>/<right> presence (false).
  const charLimitOverriddenRef = useRef(false);

  const currentTime = currentTrack ? (progress / 100) * currentTrack.duration : 0;

  // Smooth time for karaoke — resilient to seek bouncing
  const [smoothTime, setSmoothTime] = useState(0);
  const baseTimeRef = useRef(0);
  const baseTsRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const seekLockRef = useRef<{ time: number; until: number } | null>(null);

  const playbackRateRef = useRef(playbackRate);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);

  // When currentTime updates from the progress interval, sync the base —
  // BUT ignore updates that would "bounce back" right after a seek.
  useEffect(() => {
    const now = performance.now();
    if (seekLockRef.current && now < seekLockRef.current.until) {
      // We recently seeked — only accept if value is close to our seek target
      const diff = Math.abs(currentTime - seekLockRef.current.time);
      if (diff > 1.5) return; // stale bounce, ignore
      seekLockRef.current = null; // values converged, unlock
    }
    baseTimeRef.current = currentTime;
    baseTsRef.current = performance.now();
    setSmoothTime(currentTime);
  }, [currentTime]);

  // Smooth playback rate tween for consistent speed changes
  const smoothRateRef = useRef(playbackRate);
  const targetRateRef = useRef(playbackRate);
  useEffect(() => {
    targetRateRef.current = playbackRate;
    const startRate = smoothRateRef.current;
    const startTs = performance.now();
    const tweenDuration = 300; // 300ms tween
    const tweenRate = () => {
      const elapsed = performance.now() - startTs;
      const t = Math.min(1, elapsed / tweenDuration);
      const eased = t * t * (3 - 2 * t); // smoothstep
      smoothRateRef.current = startRate + (targetRateRef.current - startRate) * eased;
      if (t < 1) requestAnimationFrame(tweenRate);
    };
    requestAnimationFrame(tweenRate);
    baseTsRef.current = performance.now();
  }, [playbackRate]);

  useEffect(() => {
    if (!currentTrack) return;
    const tick = () => {
      const now = performance.now();
      // If seek-locked, hold at the seek target
      if (seekLockRef.current && now < seekLockRef.current.until) {
        setSmoothTime(seekLockRef.current.time);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = Math.max(0, (now - baseTsRef.current) / 1000);
      const rate = smoothRateRef.current || 1;
      const next = isPlaying ? baseTimeRef.current + elapsed * rate : baseTimeRef.current;
      setSmoothTime(Math.min(Math.max(next, 0), currentTrack.duration));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [currentTrack?.id, currentTrack?.duration, isPlaying, playbackRate]);

  // Fetch lyrics + karaoke
  useEffect(() => {
    if (!currentTrack) return;
    const loadLyrics = async () => {
      setIsLoadingLyrics(true);
      setParsedLyrics(null);
      setSyncedLrcText(null);
      setCurrentLineIndex(-1);
      setKaraokeEnabled(false);
      setKaraokeWords([]);
      // Reset char-limit override; will be set true if admin saved an explicit value.
      charLimitOverriddenRef.current = false;

      let appliedFromCache = false;
      let cachedSyncedText: string | null = null;
      let cachedPlainText: string | null = null;

      // ── 1. ALWAYS try the offline cache first (works whether online or offline) ──
      if (currentTrack.youtubeId) {
        const [cachedLyrics, cachedKaraoke] = await Promise.all([
          getCachedLyrics(currentTrack.youtubeId),
          getCachedKaraoke(currentTrack.youtubeId),
        ]);
        if (cachedLyrics?.syncedLyrics) cachedSyncedText = cachedLyrics.syncedLyrics;
        if (cachedLyrics?.plainLyrics) cachedPlainText = cachedLyrics.plainLyrics;

        if (cachedKaraoke) {
          if (typeof cachedKaraoke.lyricsSpeed === 'number') setLyricsSpeed(cachedKaraoke.lyricsSpeed);
          if (typeof cachedKaraoke.bounceIntensity === 'number') setBounceIntensity(cachedKaraoke.bounceIntensity);
          if (cachedKaraoke.karaokeData) {
            const data = cachedKaraoke.karaokeData as KaraokeData & { early_appearance?: number; mobile_char_limit?: number };
            if (data.words?.length && cachedKaraoke.karaokeEnabled) {
              setKaraokeEnabled(true);
              setKaraokeWords(data.words);
            }
            if (typeof data.early_appearance === 'number') setEarlyAppearance(data.early_appearance);
            if (typeof data.mobile_char_limit === 'number') {
              setMobileCharLimit(data.mobile_char_limit);
              charLimitOverriddenRef.current = true;
            }
          }
        }

        if (cachedSyncedText) {
          const parsed = parseLRC(cachedSyncedText);
          if (parsed.lines.length > 0) {
            setParsedLyrics(parsed);
            setSyncedLrcText(cachedSyncedText);
            setStaticLyricsMode(false);
            appliedFromCache = true;
          }
        } else if (cachedPlainText) {
          const lines = cachedPlainText.split('\n').map(l => l.trim()).filter(Boolean).map(text => ({ time: -1, text }));
          if (lines.length > 0) {
            setParsedLyrics({ lines, isSynced: false });
            setStaticLyricsText(cachedPlainText);
            setStaticLyricsMode(true);
            appliedFromCache = true;
          }
        }
      }

      // If offline and we already showed cached content, stop here
      if (!navigator.onLine && appliedFromCache) {
        setIsLoadingLyrics(false);
        return;
      }

      // ── 2. Online path: fetch from DB (with timeout to prevent forever-loading) ──
      try {
        if (currentTrack.youtubeId && navigator.onLine) {
          const songFetch = Promise.race([
            fetchMergedSongRecord(
              {
                youtubeId: currentTrack.youtubeId,
                title: currentTrack.title,
                artist: currentTrack.artist,
                album: currentTrack.album,
              },
              "karaoke_enabled, karaoke_data, lyrics_speed, bounce_intensity, plain_lyrics, updated_at, created_at"
            ),
            new Promise<{ merged: null }>((resolve) => setTimeout(() => resolve({ merged: null }), 4000)),
          ]);
          const { merged: song } = await songFetch as any;
          if (song) {
            if (typeof song.lyrics_speed === 'number') setLyricsSpeed(song.lyrics_speed);
            if (typeof (song as any).bounce_intensity === 'number') setBounceIntensity((song as any).bounce_intensity);
            if ((song as any).plain_lyrics) setStaticLyricsText((song as any).plain_lyrics);
            else if (!cachedPlainText) setStaticLyricsText("");
            if (song.karaoke_enabled && song.karaoke_data) {
              const data = song.karaoke_data as unknown as KaraokeData & { early_appearance?: number; mobile_char_limit?: number };
              if (data.words?.length) { setKaraokeEnabled(true); setKaraokeWords(data.words); }
              if (typeof data.early_appearance === 'number') setEarlyAppearance(data.early_appearance);
              if (typeof data.mobile_char_limit === 'number') {
                setMobileCharLimit(data.mobile_char_limit);
                charLimitOverriddenRef.current = true;
              }
            } else if (song.karaoke_data) {
              const data = song.karaoke_data as any;
              if (typeof data.early_appearance === 'number') setEarlyAppearance(data.early_appearance);
              if (typeof data.mobile_char_limit === 'number') {
                setMobileCharLimit(data.mobile_char_limit);
                charLimitOverriddenRef.current = true;
              }
            }
          } else if (!appliedFromCache) {
            setStaticLyricsText("");
          }
        }

        // Skip remote lyrics fetch when offline OR when we already loaded from cache
        let lyrics: ParsedLyrics | null = null;
        if (navigator.onLine) {
          lyrics = await Promise.race([
            fetchSyncedLyrics(currentTrack.youtubeId, currentTrack.artist, currentTrack.title, currentTrack.album),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
          ]);
        }

        if (lyrics?.lines.length) {
          setParsedLyrics(lyrics);
          setStaticLyricsMode(false);
        } else if (!appliedFromCache) {
          // No remote lyrics and nothing from cache — fallback
          if (staticLyricsText.trim()) {
            const staticLines = staticLyricsText
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0)
              .map((text) => ({ time: -1, text }));
            setParsedLyrics({ lines: staticLines, isSynced: false });
            setStaticLyricsMode(true);
          } else {
            setParsedLyrics({ lines: [{ time: -1, text: '♪ ♪ ♪' }, { time: -1, text: 'Lyrics not available' }, { time: -1, text: 'for this track' }, { time: -1, text: '♪ ♪ ♪' }, { time: -1, text: 'Enjoy the music' }, { time: -1, text: '♪ ♪ ♪' }], isSynced: false });
          }
        }
      } catch {
        if (!appliedFromCache) {
          setParsedLyrics({ lines: [{ time: -1, text: '♪ ♪ ♪' }, { time: -1, text: 'Lyrics not available' }, { time: -1, text: '♪ ♪ ♪' }], isSynced: false });
        }
      } finally {
        setIsLoadingLyrics(false);
      }
    };
    loadLyrics();
  }, [currentTrack?.id]);

  // Derive default mobile char-limit from LRC content when admin hasn't set one:
  //   • LRC contains <left> or <right> tag → 10 chars per line
  //   • Otherwise → 14 chars per line
  useEffect(() => {
    if (charLimitOverriddenRef.current) return;
    if (!parsedLyrics) return;
    setMobileCharLimit(parsedLyrics.hasAlignmentTags ? 10 : 14);
  }, [parsedLyrics]);

  // Update current line (synced) - always follow LRC timestamps for line changes
  useEffect(() => {
    if (!parsedLyrics?.isSynced || !currentTrack) return;
    // Use per-song early appearance setting (default 0 = disabled)
    const newIndex = getCurrentLyricIndex(parsedLyrics.lines, smoothTime, earlyAppearance);
    if (newIndex !== currentLineIndex) setCurrentLineIndex(newIndex);
  }, [smoothTime, parsedLyrics, currentTrack, currentLineIndex, earlyAppearance]);

  // Unsynced lyrics
  useEffect(() => {
    if (!parsedLyrics || parsedLyrics.isSynced || !currentTrack) return;
    const lps = parsedLyrics.lines.length / currentTrack.duration;
    setCurrentLineIndex(Math.max(0, Math.min(parsedLyrics.lines.length - 1, Math.floor(smoothTime * lps))));
  }, [smoothTime, parsedLyrics, currentTrack?.duration]);

  const handleLyricSeek = useCallback((lineIndex: number) => {
    if (!parsedLyrics || !currentTrack) return;

    const targetLine = parsedLyrics.lines[lineIndex];
    if (!targetLine) return;

    const targetTime = targetLine.time >= 0
      ? targetLine.time
      : (currentTrack.duration * lineIndex) / Math.max(1, parsedLyrics.lines.length - 1);
    const nextProgress = currentTrack.duration > 0 ? (targetTime / currentTrack.duration) * 100 : 0;

    // Lock smooth time to the seek target for 600ms to prevent bounce-back
    seekLockRef.current = { time: targetTime, until: performance.now() + 600 };
    baseTimeRef.current = targetTime;
    baseTsRef.current = performance.now();
    setSmoothTime(targetTime);
    setCurrentLineIndex(lineIndex);
    seekTo(Math.max(0, Math.min(100, nextProgress)));
  }, [parsedLyrics, currentTrack, seekTo]);

  // Seek handler for the progress slider — also uses seek lock
  const handleSliderSeek = useCallback((value: number) => {
    if (!currentTrack) return;
    const targetTime = (value / 100) * currentTrack.duration;
    seekLockRef.current = { time: targetTime, until: performance.now() + 600 };
    baseTimeRef.current = targetTime;
    baseTsRef.current = performance.now();
    setSmoothTime(targetTime);
    seekTo(value);
  }, [currentTrack, seekTo]);

  const LINES_BEFORE = 2;
  const LINES_AFTER = 15;

  const visibleLyrics = useMemo(() => {
    if (!parsedLyrics) return [];
    const result: VisibleLyricItem[] = [];

    if (currentLineIndex === -1) {
      result.push({ text: "...", index: -1, position: 0, lineTime: 0, nextLineTime: parsedLyrics.lines[0]?.time ?? 10, isIntro: true });
      for (let i = 0; i < LINES_AFTER && i < parsedLyrics.lines.length; i++) {
        const line = parsedLyrics.lines[i];
        const next = parsedLyrics.lines[i + 1];
        result.push({ text: line.text, index: i, position: i + 1, lineTime: line.time, nextLineTime: next?.time ?? (line.time + 10), secondaryText: line.secondaryText, alignment: line.alignment, isMusic: line.isMusic, musicEnd: line.musicEnd, elrcWords: line.elrcWords });
      }
      return result;
    }

    // For <nl> handling: the line WITH isNl is the MAIN line (A).
    // The NEXT line after it (B) is the secondary/companion that renders below A.
    // So we skip B (the line after an nl line) and attach B's text as nlCompanionText to A.
    const nlSkipIndices = new Set<number>();
    for (let i = 0; i < parsedLyrics.lines.length; i++) {
      if (parsedLyrics.lines[i].isNl && i + 1 < parsedLyrics.lines.length) {
        nlSkipIndices.add(i + 1); // skip the line AFTER the nl-tagged line
      }
    }

    // If currentLineIndex points to a skipped companion line, use the nl line (previous) as active
    let effectiveCurrentIndex = currentLineIndex;
    if (nlSkipIndices.has(effectiveCurrentIndex) && effectiveCurrentIndex > 0) {
      effectiveCurrentIndex = effectiveCurrentIndex - 1;
    }

    // Build visible list, skipping companion lines and using continuous positions
    const candidates: { idx: number; line: LyricLine; nlCompanionText?: string; nlCompanionLine?: LyricLine }[] = [];
    for (let i = -LINES_BEFORE - 5; i <= LINES_AFTER + 5; i++) {
      const idx = effectiveCurrentIndex + i;
      if (idx < 0 || idx >= parsedLyrics.lines.length) continue;
      if (nlSkipIndices.has(idx)) continue;
      const line = parsedLyrics.lines[idx];
      const hasNlCompanion = line.isNl && idx + 1 < parsedLyrics.lines.length;
      const nlCompanionText = hasNlCompanion ? parsedLyrics.lines[idx + 1].text : undefined;
      const nlCompanionLine = hasNlCompanion ? parsedLyrics.lines[idx + 1] : undefined;
      candidates.push({ idx, line, nlCompanionText, nlCompanionLine });
    }

    // Find the active candidate (the one matching effectiveCurrentIndex)
    const activeIdx = candidates.findIndex(c => c.idx === effectiveCurrentIndex);

    // Assign continuous positions relative to active
    for (let ci = 0; ci < candidates.length; ci++) {
      const relPos = ci - activeIdx;
      if (relPos < -LINES_BEFORE || relPos > LINES_AFTER) continue;
      const { idx, line, nlCompanionText, nlCompanionLine } = candidates[ci];
      const next = parsedLyrics.lines[idx + 1];
      const nlNextLine = nlCompanionLine ? parsedLyrics.lines[idx + 2] : undefined;
      result.push({
        text: line.text, index: idx, position: relPos, lineTime: line.time,
        nextLineTime: next?.time ?? (line.time + 10),
        secondaryText: line.secondaryText, alignment: line.alignment,
        isMusic: line.isMusic, musicEnd: line.musicEnd,
        nlCompanionText,
        nlCompanionTime: nlCompanionLine?.time,
        nlCompanionEndTime: nlNextLine?.time ?? (nlCompanionLine ? nlCompanionLine.time + 10 : undefined),
        nlCompanionElrcWords: nlCompanionLine?.elrcWords,
        elrcWords: line.elrcWords,
        emWords: line.emWords,
      });
    }

    return result;
  }, [currentLineIndex, parsedLyrics, LINES_AFTER]);

  // Auto-hide mobile controls
  const resetMobileControlsTimer = useCallback(() => {
    setMobileControlsVisible(true);
    if (mobileControlsTimerRef.current) clearTimeout(mobileControlsTimerRef.current);
    mobileControlsTimerRef.current = window.setTimeout(() => {
      setMobileControlsVisible(false);
    }, 1500);
  }, []);

  useEffect(() => {
    if (isMobile) {
      resetMobileControlsTimer();
    }
    return () => {
      if (mobileControlsTimerRef.current) clearTimeout(mobileControlsTimerRef.current);
    };
  }, [isMobile, resetMobileControlsTimer]);

  const handleMobileTap = useCallback(() => {
    resetMobileControlsTimer();
  }, [resetMobileControlsTimer]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 300);
  };

  // Lyrics navigator removed

  if (!currentTrack) return null;

  const lyricsContentProps = {
    visibleLyrics,
    karaokeEnabled,
    karaokeWords,
    smoothTime,
    lyricsSpeed,
    bounceIntensity,
    isLoadingLyrics,
    defaultAlignment: parsedLyrics?.defaultAlignment,
    mobileCharLimit,
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 1.02 }}
        animate={{ opacity: isClosing ? 0 : 1, scale: isClosing ? 0.95 : 1, y: isClosing ? 20 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed inset-0 z-50 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <CanvasGradientBg artworkUrl={currentTrack.artwork} isClosing={isClosing} isMobile={isMobile} />

        <div className="relative h-full hidden md:flex items-center z-10">
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: isClosing ? 0 : 1, scale: isClosing ? 0.8 : 1 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            className="absolute top-6 right-6 z-20 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="h-6 w-6 text-white" />
          </motion.button>

          <motion.div
            className="flex-shrink-0 flex flex-col justify-center transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{ width: showLyricsPanel ? '480px' : '100%', paddingLeft: showLyricsPanel ? '120px' : '0' }}
            layout
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: isClosing ? 0 : 1, y: isClosing ? 20 : 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className={showLyricsPanel ? '' : 'flex flex-col items-center'}
            >
              <div
                className="overflow-hidden transition-all duration-500"
                style={{
                  width: showLyricsPanel ? '360px' : '400px',
                  height: showLyricsPanel ? '360px' : '400px',
                  borderRadius: '20px',
                  boxShadow: '0 30px 80px -20px rgba(0, 0, 0, 0.35)',
                }}
              >
                <img
                  src={currentTrack.artwork || "/placeholder.svg"}
                  alt={currentTrack.album}
                  className={cn("object-cover object-center", currentTrack.source === 'youtube' ? "h-full w-auto min-w-full" : "w-full h-full")}
                />
              </div>

              <h2 className="text-white truncate" style={{ fontSize: '22px', fontWeight: 600, marginTop: '24px', maxWidth: showLyricsPanel ? '360px' : '400px', textAlign: showLyricsPanel ? 'left' : 'center' }}>
                {currentTrack.title}
              </h2>
              <p style={{ fontSize: '16px', fontWeight: 400, color: 'rgba(255,255,255,0.7)', marginTop: '4px', textAlign: showLyricsPanel ? 'left' : 'center' }}>
                {currentTrack.artist}
              </p>

              <div style={{ marginTop: '24px', width: showLyricsPanel ? '360px' : '400px' }}>
                <Slider
                  value={[progress]}
                  max={100}
                  step={0.1}
                  onValueChange={([value]) => handleSliderSeek(value)}
                  hideThumb
                  growOnDrag
                  className="mb-2 [&_[data-orientation=horizontal]]:h-1 [&_[data-orientation=horizontal]]:bg-white/20 [&_span[data-orientation=horizontal]>span]:bg-white/80"
                />
                <div className="flex justify-between" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(currentTrack.duration)}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6" style={{ marginTop: '18px', width: showLyricsPanel ? '360px' : '400px' }}>
                <button onClick={previousTrack} className="p-3 rounded-full hover:bg-white/10 transition-all duration-200 hover:scale-110">
                  <img src={iconPrev} alt="Previous" className="h-6 w-6 brightness-0 invert" />
                </button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={isPlaying ? pauseTrack : resumeTrack} className="p-3 rounded-full hover:bg-white/10 transition-transform">
                  <img src={isPlaying ? iconPause : iconPlay} alt={isPlaying ? "Pause" : "Play"} className="h-8 w-8 brightness-0 invert" />
                </motion.button>
                <button onClick={nextTrack} className="p-3 rounded-full hover:bg-white/10 transition-all duration-200 hover:scale-110">
                  <img src={iconNext} alt="Next" className="h-6 w-6 brightness-0 invert" />
                </button>
              </div>

              {isLossless && (
                <div
                  className="flex items-center justify-center gap-1.5"
                  style={{
                    marginTop: '14px',
                    width: showLyricsPanel ? '360px' : '400px',
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.75)',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
                >
                  <Disc3 className="h-4 w-4" />
                  Lossless
                </div>
              )}

              {/* Volume control */}
              <div className="flex items-center gap-3 mt-4" style={{ width: showLyricsPanel ? '360px' : '400px' }}>
                <button
                  onClick={() => setVolume(volume === 0 ? 80 : 0)}
                  className="p-1 rounded-full hover:bg-white/10 transition-colors"
                >
                  {volume === 0 ? (
                    <VolumeX className="h-4 w-4 text-white/50" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-white/50" />
                  )}
                </button>
                <Slider
                  value={[volume]}
                  max={100}
                  step={1}
                  onValueChange={([value]) => setVolume(value)}
                  hideThumb
                  growOnDrag
                  className="flex-1 [&_[data-orientation=horizontal]]:h-1 [&_[data-orientation=horizontal]]:bg-white/20 [&_span[data-orientation=horizontal]>span]:bg-white/80"
                />
              </div>

              <div className="flex items-center justify-center gap-4 mt-4" style={{ width: showLyricsPanel ? '360px' : '400px' }}>
                <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <Heart className="h-5 w-5 text-white/60" />
                </button>
                <button
                  onClick={() => currentTrack && setShowPlaylistDialog(true)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Add to playlist"
                >
                  <ListPlus className="h-5 w-5 text-white/60" />
                </button>
                <button
                  onClick={toggleRepeat}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Loop"
                >
                  {repeat === 'one' ? (
                    <Repeat1 className="h-5 w-5 text-white" />
                  ) : repeat === 'all' ? (
                    <Repeat className="h-5 w-5 text-white" />
                  ) : (
                    <Repeat className="h-5 w-5 text-white/60" />
                  )}
                </button>
                <button
                  onClick={() => setShowLyricsPanel(!showLyricsPanel)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title={showLyricsPanel ? "Hide Lyrics" : "Show Lyrics"}
                >
                  <img
                    src={lyricsIcon}
                    alt="Lyrics"
                    className="h-5 w-5 brightness-0 invert"
                    style={{ opacity: showLyricsPanel ? 1 : 0.5 }}
                  />
                </button>
              </div>
            </motion.div>
          </motion.div>

          {showLyricsPanel && (
            <>
              <div style={{ width: '160px' }} className="flex-shrink-0" />

              <motion.div
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                className="flex-1 min-w-0 h-full"
                style={{ maxWidth: '620px' }}
              >
                <div className="flex h-full flex-col gap-6 py-10">
                  <div className="flex items-center gap-2 px-1">
                    <button
                      onClick={() => setStaticLyricsMode(!staticLyricsMode)}
                      className={cn("p-1.5 rounded-md transition-colors", staticLyricsMode ? "bg-white/20 text-white" : "text-white/40 hover:text-white/60")}
                      title="Static lyrics"
                    >
                      <AlignLeft className="h-4 w-4" />
                    </button>
                  </div>
                  <div ref={lyricsContainerRef} className="relative min-h-0 flex-1">
                    {staticLyricsMode ? (
                      <StaticLyricsContent text={staticLyricsText} isMobile={false} />
                    ) : (
                      <LyricsContent {...lyricsContentProps} isMobile={false} />
                    )}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </div>

        <div className="relative h-full flex flex-col md:hidden z-10" onClick={handleMobileTap}>
          <div
            className="flex items-center gap-3 flex-shrink-0"
            style={{ padding: '32px 24px 10px 24px' }}
          >
            <div className="overflow-hidden flex-shrink-0" style={{ width: '75px', height: '75px', borderRadius: '14px', boxShadow: '0 6px 20px rgba(0,0,0,0.4)' }}>
              <img
                src={currentTrack.artwork || "/placeholder.svg"}
                alt={currentTrack.album}
                className={cn("object-cover object-center", currentTrack.source === 'youtube' ? "h-full w-auto min-w-full" : "w-full h-full")}
              />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-white truncate" style={{ fontSize: '20px', fontWeight: 700 }}>
                {currentTrack.title}
              </h2>
              <p className="truncate" style={{ fontSize: '16px', fontWeight: 400, color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                {currentTrack.artist}
              </p>
            </div>

            <button
              className={cn(
                "flex items-center justify-center flex-shrink-0 rounded-full transition-colors",
                staticLyricsMode ? "bg-white/25" : "hover:bg-white/20"
              )}
              style={{ width: '36px', height: '36px', background: staticLyricsMode ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)' }}
              onClick={(e) => { e.stopPropagation(); setStaticLyricsMode(!staticLyricsMode); }}
              title="Static lyrics"
            >
              <AlignLeft className="text-white" style={{ width: '16px', height: '16px' }} />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); handleClose(); }}
              className="flex items-center justify-center flex-shrink-0 rounded-full hover:bg-white/20 transition-colors"
              style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.12)' }}
            >
              <X className="text-white" style={{ width: '18px', height: '18px' }} />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <div
              ref={lyricsContainerRef}
              className="relative flex-1 min-h-0"
              style={{ overflow: staticLyricsMode ? 'auto' : 'hidden' }}
            >
              {staticLyricsMode ? (
                <StaticLyricsContent text={staticLyricsText} isMobile />
              ) : (
                <LyricsContent {...lyricsContentProps} isMobile />
              )}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 1, y: 0 }}
            animate={{ 
              opacity: mobileControlsVisible ? (isClosing ? 0 : 1) : 0,
              y: mobileControlsVisible ? (isClosing ? 20 : 0) : 40,
            }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="absolute bottom-0 left-0 right-0 z-20"
            style={{ 
              padding: '8px 24px 32px 24px',
              pointerEvents: mobileControlsVisible ? 'auto' : 'none',
              background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)',
              paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ width: '88%', margin: '0 auto' }}>
              <Slider
                value={[progress]}
                max={100}
                step={0.1}
                onValueChange={([value]) => { handleSliderSeek(value); resetMobileControlsTimer(); }}
                hideThumb
                growOnDrag
                className="mb-2 [&_[data-orientation=horizontal]]:h-1 [&_[data-orientation=horizontal]]:bg-white/20 [&_span[data-orientation=horizontal]>span]:bg-white/80"
              />
              <div className="flex justify-between" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(currentTrack.duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-6 mt-3">
              <button onClick={(e) => { e.stopPropagation(); toggleRepeat(); resetMobileControlsTimer(); }} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                {repeat === 'one' ? (
                  <Repeat1 className="h-5 w-5 text-white" />
                ) : repeat === 'all' ? (
                  <Repeat className="h-5 w-5 text-white" />
                ) : (
                  <Repeat className="h-5 w-5 text-white/40" />
                )}
              </button>
              <button onClick={(e) => { e.stopPropagation(); previousTrack(); resetMobileControlsTimer(); }} className="p-3 rounded-full hover:bg-white/10 transition-colors">
                <img src={iconPrev} alt="Previous" className="h-6 w-6 brightness-0 invert" />
              </button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={(e) => { e.stopPropagation(); isPlaying ? pauseTrack() : resumeTrack(); resetMobileControlsTimer(); }}
                className="p-4 rounded-full transition-transform"
                style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}
              >
                <img src={isPlaying ? iconPause : iconPlay} alt={isPlaying ? "Pause" : "Play"} className="h-7 w-7 brightness-0 invert" />
              </motion.button>
              <button onClick={(e) => { e.stopPropagation(); nextTrack(); resetMobileControlsTimer(); }} className="p-3 rounded-full hover:bg-white/10 transition-colors">
                <img src={iconNext} alt="Next" className="h-6 w-6 brightness-0 invert" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); currentTrack && setShowPlaylistDialog(true); resetMobileControlsTimer(); }} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <ListPlus className="h-5 w-5 text-white/60" />
              </button>
            </div>

            {isLossless && (
              <div
                className="flex items-center justify-center gap-1.5 mt-3"
                style={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.75)',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}
              >
                <Disc3 className="h-4 w-4" />
                Lossless
              </div>
            )}
          </motion.div>
        </div>

        {currentTrack && (
          <AddToPlaylistDialog
            track={currentTrack}
            isOpen={showPlaylistDialog}
            onClose={() => setShowPlaylistDialog(false)}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
