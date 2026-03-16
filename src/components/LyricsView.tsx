import { useState, useEffect, useMemo, useRef, Fragment, useLayoutEffect, useCallback } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { fetchSyncedLyrics, getCurrentLyricIndex, ParsedLyrics, LyricLine } from "@/lib/lyrics";
import { supabase } from "@/integrations/supabase/client";
import { useDominantColors } from "@/hooks/useDominantColor";
import { 
  X, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward,
  Heart,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
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
  nlCompanionText?: string; // text from the <nl>-tagged previous line, rendered as sub-line
  elrcWords?: { word: string; startTime: number; endTime: number }[];
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function stripBrackets(text: string): string {
  return text.replace(/^\(/, '').replace(/\)$/, '').replace(/\(([^)]*)\)/g, '$1');
}

// ─── Animated gradient background ───
function AnimatedGradientBg({ palette, isClosing }: { palette: string[]; isClosing: boolean }) {
  const colors = palette.length >= 2 ? palette : [palette[0] || 'hsl(0,0%,15%)', 'hsl(0,0%,10%)'];

  const toHsla = (color: string, alpha: number) => {
    const match = color.match(/hsl\(([^)]+)\)/);
    if (match) return `hsla(${match[1]}, ${alpha})`;
    return color;
  };

  const stops = colors.map((c, i) => {
    const angle = (360 / colors.length) * i;
    const x = 50 + 35 * Math.cos((angle * Math.PI) / 180);
    const y = 50 + 35 * Math.sin((angle * Math.PI) / 180);
    return `radial-gradient(circle at ${x}% ${y}%, ${toHsla(c, 0.55)} 0%, transparent 55%)`;
  }).join(', ');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isClosing ? 0 : 1 }}
      transition={{ duration: 0.6 }}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
    >
      <div className="absolute inset-0 bg-black" />
      <div
        className="absolute"
        style={{
          top: '-75%', left: '-75%', width: '250%', height: '250%',
          background: stops,
          filter: 'blur(100px)',
          animation: 'gradientRotate 25s linear infinite',
          transformOrigin: 'center center',
        }}
      />
      <div className="absolute inset-0" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
      }} />
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)',
      }} />
      <div className="absolute inset-0 bg-black/15" />
      <style>{`
        @keyframes gradientRotate {
          0% { transform: rotate(0deg) scale(1.05); }
          50% { transform: rotate(180deg) scale(1.1); }
          100% { transform: rotate(360deg) scale(1.05); }
        }
      `}</style>
    </motion.div>
  );
}

// ─── Music indicator ───
function MusicIndicator({ currentTime, startTime, endTime }: { currentTime: number; startTime: number; endTime: number }) {
  const duration = endTime - startTime;
  const elapsed = Math.max(0, currentTime - startTime);
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex gap-1.5 items-end h-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-white/60"
            animate={{
              height: [6, 16, 10, 20, 8][i % 5],
              opacity: progress > 0 && progress < 1 ? [0.4, 0.8, 0.6, 1, 0.5][i % 5] : 0.3,
            }}
            transition={{
              height: { duration: 0.6, repeat: Infinity, repeatType: 'reverse', delay: i * 0.12 },
            }}
          />
        ))}
      </div>
      <span className="text-white/40 text-lg font-medium tracking-wider">♪ ♪ ♪</span>
    </div>
  );
}

// ─── Karaoke word span with gradient fill and fading edge ───
function KaraokeWordSpan({ word, startTime, endTime, currentTime }: { word: string; startTime: number; endTime: number; currentTime: number }) {
  let progress = 0;
  if (currentTime >= endTime) progress = 1;
  else if (currentTime > startTime) progress = (currentTime - startTime) / (endTime - startTime);

  const fillPercent = Math.min(100, Math.max(0, progress * 100));
  const isDone = progress >= 1;
  const isActive = currentTime >= startTime && currentTime < endTime;
  const wordDuration = endTime - startTime;
  const isLongWord = wordDuration > 1;

  const liftY = isDone ? -1.5 : isActive ? -1.5 * progress : 0;
  const growthFactor = isActive ? Math.min(1.04, 1 + wordDuration * 0.008 * progress) : isDone ? 1.005 : 1;

  // Fade edge width in % of word
  const fadeEdge = isActive ? 15 : 0;

  const renderText = (color: string) => {
    return <span style={{ color }}>{word}</span>;
  };

  return (
    <span
      className="relative inline-block align-baseline"
      style={{
        display: 'inline-block',
        transformOrigin: 'bottom center',
        transform: `translateY(${liftY}px) scale(${growthFactor})`,
        transition: 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        willChange: 'transform',
      }}
    >
      {/* Base dim text */}
      <span style={{ whiteSpace: 'pre' }}>{renderText("rgba(255, 255, 255, 0.35)")}</span>
      {/* Bright overlay clipped by width with fading right edge */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 pointer-events-none"
        style={{
          width: `${Math.min(100, fillPercent + fadeEdge)}%`,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          maskImage: isActive && fillPercent < 95
            ? `linear-gradient(to right, black 0%, black ${Math.max(0, (fillPercent / (fillPercent + fadeEdge)) * 100 - 5)}%, transparent 100%)`
            : 'none',
          WebkitMaskImage: isActive && fillPercent < 95
            ? `linear-gradient(to right, black 0%, black ${Math.max(0, (fillPercent / (fillPercent + fadeEdge)) * 100 - 5)}%, transparent 100%)`
            : 'none',
        }}
      >
        <span style={{ whiteSpace: 'pre' }}>{renderText("#ffffff")}</span>
      </span>
    </span>
  );
}

// ─── eLRC line ───
function ELRCLine({ words, currentTime, isMobile }: { words: { word: string; startTime: number; endTime: number }[]; currentTime: number; isMobile: boolean }) {
  return (
    <span dir="auto" className="font-semibold inline-block" style={{ fontSize: isMobile ? '36px' : '40px', fontWeight: 600, unicodeBidi: "plaintext", lineHeight: 1.4 }}>
      {words.map((w, idx) => (
        <Fragment key={`${w.word}-${idx}`}>
          <KaraokeWordSpan word={w.word} startTime={w.startTime} endTime={w.endTime} currentTime={currentTime} />
          {idx < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

// ─── Karaoke line ───
function KaraokeLine({ text, words, lineIndex, lineStartTime, lineEndTime, currentTime, isCurrentLine, isMobile }: {
  text: string; words: KaraokeWord[]; lineIndex: number; lineStartTime: number; lineEndTime: number; currentTime: number; isCurrentLine: boolean; isMobile: boolean;
}) {
  const hasLineIndex = words.some((w) => typeof w.lineIndex === "number");
  const lineWords = (hasLineIndex
    ? words.filter((w) => w.lineIndex === lineIndex)
    : words.filter((w) => w.startTime >= lineStartTime && w.startTime < lineEndTime)
  ).slice().sort((a, b) => a.startTime - b.startTime);

  if (lineWords.length > 0 && isCurrentLine) {
    return (
      <span dir="auto" className="font-semibold inline-block" style={{ fontSize: isMobile ? '36px' : '40px', fontWeight: 600, unicodeBidi: "plaintext", lineHeight: 1.4 }}>
        {lineWords.map((wordData, idx) => (
          <Fragment key={`${wordData.word}-${idx}`}>
            <KaraokeWordSpan word={wordData.word} startTime={wordData.startTime} endTime={wordData.endTime} currentTime={currentTime} />
            {idx < lineWords.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    );
  }

  return (
    <span className="font-semibold inline-block" style={{ fontSize: isMobile ? '36px' : '40px', fontWeight: 600, color: "rgba(255, 255, 255, 0.35)", unicodeBidi: "plaintext", lineHeight: 1.4 }}>
      {text}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Apple Music–style lyrics: fixed-position, CSS-transition based
// ═══════════════════════════════════════════════════════════════════

/**
 * Computes absolute Y positions for each lyric line based on its "position"
 * relative to the active line (0 = active, negative = past, positive = upcoming).
 * Applies CSS transitions with staggered delays for the cascading effect.
 * DOM order NEVER changes — only transform/opacity/filter are updated.
 */
function useAppleMusicStyles(
  lineRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  visibleLyrics: VisibleLyricItem[],
  isMobile: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  lyricsSpeed: number,
) {
  const prevPositionsRef = useRef<Map<string, number>>(new Map());
  const LINE_PADDING = isMobile ? 16 : 16;
  const ACTIVE_OFFSET = 0.22;
  // lyricsSpeed 0=fastest(0.2s), 1=slowest(0.7s)
  const dur = isMobile ? 0.28 + lyricsSpeed * 0.32 : 0.2 + lyricsSpeed * 0.5;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerH = container.clientHeight;
    const anchorY = containerH * ACTIVE_OFFSET;

    const newPositions = new Map<string, number>();

    // Sort by position to compute cumulative heights
    const sorted = [...visibleLyrics].sort((a, b) => a.position - b.position);

    // Measure all element heights (with transitions temporarily disabled for measurement)
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

    // Find the active item (position 0) and compute Y positions relative to it
    const activeKey = sorted.find(s => s.position === 0);
    const activeHeight = activeKey ? (heights.get(activeKey.isIntro ? 'intro' : `lyric-${activeKey.index}`) || 56) : 56;

    // Build a map of position → targetY
    // Active line starts at anchorY
    // Lines above: stack upward from anchorY
    // Lines below: stack downward from anchorY + activeHeight + padding
    const positionYMap = new Map<string, number>();

    // Process from active going up
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

    // Active line at anchorY
    if (activeKey) {
      const key = activeKey.isIntro ? 'intro' : `lyric-${activeKey.index}`;
      positionYMap.set(key, anchorY);
    }

    // Process from active going down
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

      // ── Target Y position ──
      const targetY = positionYMap.get(key) ?? (anchorY + position * 68);

      // ── Visual properties ──
      // On mobile, avoid blur() filter entirely — it's the #1 cause of jank/teleporting
      let opacity: number, blur: number, scale: number;
      if (isActive) {
        opacity = 1; blur = 0; scale = 1;
      } else if (position < 0) {
        opacity = Math.max(0, 0.3 - (distance - 1) * 0.2);
        blur = isMobile ? 0 : 1.5 + distance * 0.8;
        scale = 1;
      } else {
        opacity = Math.max(0.08, 0.5 - (distance - 1) * 0.06);
        blur = isMobile ? 0 : Math.min(3, distance * 0.35);
        scale = Math.max(0.94, 1 - distance * 0.008);
      }

      // ── Transition timing with stagger ──
      // The line moving UPWARD (was active, now position -1) animates FIRST.
      // Everything else (new active line + other lines) starts 0.2s later.
      const prevPos = prevPositionsRef.current.get(key);
      const isNew = prevPos === undefined;
      const posChanged = prevPos !== undefined && prevPos !== position;

      // Detect the line that just left active (was position 0, now going to -1)
      const isMovingUp = prevPos === 0 && position === -1;
      // Past lines that were already past move up together with the just-finished line
      const isPastMovingUp = position < 0 && prevPos !== undefined && prevPos < 0 && prevPos !== position;

      let delay = 0;
      if (isMovingUp || isPastMovingUp) {
        delay = 0; // past lyrics moving upward animate FIRST
      } else if (isActive) {
        delay = 0.05; // new active line follows at 0.05s
      } else if (position > 0) {
        delay = 0.05 + position * 0.04; // upcoming lines stagger after
      } else if (position < 0) {
        delay = 0; // other past lines move with the upward group
      }

      // Apple-style spring-like cubic-bezier: fast start, slight overshoot feel, smooth settle
      const easing = isMobile ? 'cubic-bezier(0.25, 0.8, 0.25, 1)' : 'cubic-bezier(0.2, 0.9, 0.3, 1.05)';
      const filterProp = isMobile ? '' : `, filter ${dur}s ${easing} ${delay}s`;
      const transitionStr = `opacity ${dur}s ${easing} ${delay}s${filterProp}, transform ${dur}s ${easing} ${delay}s`;

      const makeTransform = (y: number, s: number) =>
        `translate3d(0, ${y}px, 0) scale(${s})`;

      if (isNew) {
        el.style.transition = 'none';
        el.style.willChange = 'transform, opacity';
        if (isMobile) {
          // Hide element completely until rAF positions it — prevents "teleport" flash
          el.style.visibility = 'hidden';
          el.style.opacity = '0';
          el.style.transform = makeTransform(targetY, scale);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              el.style.visibility = 'visible';
              el.style.transition = `opacity 0.25s ${easing}, transform ${dur}s ${easing}`;
              el.style.opacity = String(opacity);
              el.style.transform = makeTransform(targetY, scale);
            });
          });
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
        if (!isMobile) el.style.filter = `blur(${blur}px)`;
        el.style.transform = makeTransform(targetY, scale);
      }
    });

    // Fade out lines no longer visible
    prevPositionsRef.current.forEach((_, key) => {
      if (!newPositions.has(key)) {
        const el = lineRefs.current.get(key);
        if (el) {
          const fadeEasing = isMobile ? 'cubic-bezier(0.25, 0.8, 0.25, 1)' : 'cubic-bezier(0.2, 0.9, 0.3, 1.05)';
          // Keep the line at its current Y and only fade out.
          // Moving it to a fixed -100px caused visible "teleport" jumps on mobile.
          el.style.transition = `opacity 0.2s ${fadeEasing}`;
          el.style.opacity = '0';
        }
      }
    });

    prevPositionsRef.current = newPositions;
  }, [visibleLyrics, lineRefs, isMobile, containerRef, LINE_PADDING, ACTIVE_OFFSET, dur]);
}

// ─── Lyrics content (shared between desktop & mobile) ───
function LyricsContent({
  visibleLyrics, karaokeEnabled, karaokeWords, smoothTime, lyricsSpeed, bounceIntensity, isLoadingLyrics, isMobile, defaultAlignment,
}: {
  visibleLyrics: VisibleLyricItem[]; karaokeEnabled: boolean; karaokeWords: KaraokeWord[]; smoothTime: number; lyricsSpeed: number; bounceIntensity: number; isLoadingLyrics: boolean; isMobile: boolean; defaultAlignment?: 'left' | 'right';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useAppleMusicStyles(lineRefs, visibleLyrics, isMobile, containerRef, lyricsSpeed);

  const fontSize = isMobile ? '36px' : '40px';

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 78%, transparent 100%)',
      }}
    >
      {visibleLyrics.map((item) => {
        const { text, index, position, lineTime, nextLineTime, isIntro, secondaryText, alignment, isMusic, musicEnd, nlCompanionText, elrcWords } = item;
        const isActive = position === 0;
        const key = isIntro ? 'intro' : `lyric-${index}`;
        const lineAlign = (alignment || defaultAlignment || 'left') as 'left' | 'right';
        const textAlignClass = lineAlign === 'right' ? 'text-right' : 'text-left';

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
              paddingLeft: isMobile ? '24px' : '0',
              paddingRight: isMobile ? '24px' : '0',
              top: 0,
            }}
          >
            {isMusic && musicEnd ? (
              <MusicIndicator currentTime={smoothTime} startTime={lineTime} endTime={musicEnd} />
            ) : isActive && !isIntro && elrcWords && elrcWords.length > 0 ? (
              <>
                <ELRCLine words={elrcWords} currentTime={smoothTime} isMobile={isMobile} />
                {secondaryText && (
                  <p dir="auto" style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 500, color: "rgba(255,255,255,0.6)", unicodeBidi: "plaintext", lineHeight: 1.4, marginTop: '4px' }}>
                    {stripBrackets(secondaryText)}
                  </p>
                )}
              </>
            ) : isActive && !isIntro && karaokeEnabled ? (
              <>
                <KaraokeLine text={text} words={karaokeWords} lineIndex={index} lineStartTime={lineTime} lineEndTime={nextLineTime} currentTime={smoothTime} isCurrentLine isMobile={isMobile} />
                {secondaryText && (
                  <p dir="auto" style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 500, color: "rgba(255,255,255,0.6)", unicodeBidi: "plaintext", lineHeight: 1.4, marginTop: '4px' }}>
                    {stripBrackets(secondaryText)}
                  </p>
                )}
              </>
            ) : (
              <>
                <p
                  dir="auto"
                  style={{
                    fontSize: isNlPair ? (isMobile ? '24px' : '28px') : fontSize,
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.35)",
                    unicodeBidi: "plaintext",
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  {text}
                </p>
                {secondaryText && (
                  <p dir="auto" style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 500, color: isActive ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)", unicodeBidi: "plaintext", lineHeight: 1.4, marginTop: '4px' }}>
                    {stripBrackets(secondaryText)}
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MAIN LYRICS VIEW
// ═══════════════════════════════════════════════════
export function LyricsView({ onClose }: LyricsViewProps) {
  const { currentTrack, isPlaying, progress, playbackRate, pauseTrack, resumeTrack, nextTrack, previousTrack, seekTo } = usePlayer();
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

  const { palette } = useDominantColors(currentTrack?.artwork);
  const currentTime = currentTrack ? (progress / 100) * currentTrack.duration : 0;

  // Smooth time for karaoke
  const [smoothTime, setSmoothTime] = useState(0);
  const baseTimeRef = useRef(0);
  const baseTsRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    baseTimeRef.current = currentTime;
    baseTsRef.current = performance.now();
    setSmoothTime(currentTime);
  }, [currentTime]);

  useEffect(() => {
    if (!currentTrack) return;
    const tick = () => {
      const now = performance.now();
      const elapsed = Math.max(0, (now - baseTsRef.current) / 1000);
      const next = isPlaying ? baseTimeRef.current + elapsed * (playbackRate || 1) : baseTimeRef.current;
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
      setCurrentLineIndex(-1);
      setKaraokeEnabled(false);
      setKaraokeWords([]);
      try {
        if (currentTrack.youtubeId) {
          const { data: song } = await supabase
            .from("songs")
            .select("karaoke_enabled, karaoke_data, lyrics_speed, bounce_intensity")
            .eq("youtube_id", currentTrack.youtubeId)
            .maybeSingle();
          if (song) {
            if (typeof song.lyrics_speed === 'number') setLyricsSpeed(song.lyrics_speed);
            if (typeof (song as any).bounce_intensity === 'number') setBounceIntensity((song as any).bounce_intensity);
            if (song.karaoke_enabled && song.karaoke_data) {
              const data = song.karaoke_data as unknown as KaraokeData;
              if (data.words?.length) { setKaraokeEnabled(true); setKaraokeWords(data.words); }
            }
          }
        }
        const lyrics = await fetchSyncedLyrics(currentTrack.youtubeId, currentTrack.artist, currentTrack.title);
        if (lyrics?.lines.length) {
          setParsedLyrics(lyrics);
        } else {
          setParsedLyrics({ lines: [{ time: -1, text: '♪ ♪ ♪' }, { time: -1, text: 'Lyrics not available' }, { time: -1, text: 'for this track' }, { time: -1, text: '♪ ♪ ♪' }, { time: -1, text: 'Enjoy the music' }, { time: -1, text: '♪ ♪ ♪' }], isSynced: false });
        }
      } catch {
        setParsedLyrics({ lines: [{ time: -1, text: '♪ ♪ ♪' }, { time: -1, text: 'Lyrics not available' }, { time: -1, text: '♪ ♪ ♪' }], isSynced: false });
      } finally {
        setIsLoadingLyrics(false);
      }
    };
    loadLyrics();
  }, [currentTrack?.id]);

  // Update current line (synced)
  useEffect(() => {
    if (!parsedLyrics?.isSynced || !currentTrack) return;
    const t = smoothTime;
    const hasLineIndex = karaokeEnabled && karaokeWords.some((w) => typeof w.lineIndex === "number");
    const newIndex = hasLineIndex
      ? (() => {
          let best: KaraokeWord | null = null;
          for (const w of karaokeWords) { if (w.startTime <= t && (!best || w.startTime > best.startTime)) best = w; }
          return typeof best?.lineIndex === "number" ? best!.lineIndex! : getCurrentLyricIndex(parsedLyrics.lines, t);
        })()
      : getCurrentLyricIndex(parsedLyrics.lines, t);
    if (newIndex !== currentLineIndex) setCurrentLineIndex(newIndex);
  }, [smoothTime, parsedLyrics, currentTrack, karaokeEnabled, karaokeWords, currentLineIndex]);

  // Unsynced lyrics
  useEffect(() => {
    if (!parsedLyrics || parsedLyrics.isSynced || !currentTrack) return;
    const lps = parsedLyrics.lines.length / currentTrack.duration;
    setCurrentLineIndex(Math.max(0, Math.min(parsedLyrics.lines.length - 1, Math.floor(smoothTime * lps))));
  }, [smoothTime, parsedLyrics, currentTrack?.duration]);

  // Window: 1 past line (upper), many upcoming
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

    const prevLine = currentLineIndex > 0 ? parsedLyrics.lines[currentLineIndex - 1] : null;
    const hasPrevNl = prevLine?.isNl === true;

    for (let i = -LINES_BEFORE; i <= LINES_AFTER; i++) {
      const idx = currentLineIndex + i;
      if (idx >= 0 && idx < parsedLyrics.lines.length) {
        const line = parsedLyrics.lines[idx];
        const next = parsedLyrics.lines[idx + 1];

        // Skip the nl-tagged previous line as a separate item — it's merged into the active line
        if (i === -1 && hasPrevNl) continue;

        const pos = hasPrevNl && i > -1 ? i : i;

        // If this is the active line and previous had <nl>, attach companion text
        const nlCompanionText = (i === 0 && hasPrevNl && prevLine) ? prevLine.text : undefined;

        result.push({ text: line.text, index: idx, position: pos, lineTime: line.time, nextLineTime: next?.time ?? (line.time + 10), secondaryText: line.secondaryText, alignment: line.alignment, isMusic: line.isMusic, musicEnd: line.musicEnd, nlCompanionText, elrcWords: line.elrcWords });
      }
    }
    return result;
  }, [currentLineIndex, parsedLyrics, LINES_AFTER]);

  // Auto-hide mobile controls after 1.5s of no interaction
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
    if (!mobileControlsVisible) {
      resetMobileControlsTimer();
    } else {
      // If already visible, reset the timer
      resetMobileControlsTimer();
    }
  }, [mobileControlsVisible, resetMobileControlsTimer]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 300);
  };

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
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 1.02 }}
        animate={{ opacity: isClosing ? 0 : 1, scale: isClosing ? 0.95 : 1, y: isClosing ? 20 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed inset-0 z-50 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <AnimatedGradientBg palette={palette} isClosing={isClosing} />

        {/* ═══════════ DESKTOP LAYOUT ═══════════ */}
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

          {/* Left column: Album + controls */}
          <div className="flex-shrink-0 flex flex-col justify-center" style={{ width: '480px', paddingLeft: '120px' }}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: isClosing ? 0 : 1, y: isClosing ? 20 : 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
              <div
                className="overflow-hidden"
                style={{
                  width: '360px', height: '360px', borderRadius: '20px',
                  boxShadow: '0 30px 80px -20px rgba(0, 0, 0, 0.35)',
                }}
              >
                <img
                  src={currentTrack.artwork || "/placeholder.svg"}
                  alt={currentTrack.album}
                  className={cn("object-cover object-center", currentTrack.source === 'youtube' ? "h-full w-auto min-w-full" : "w-full h-full")}
                />
              </div>

              <h2 className="text-white truncate" style={{ fontSize: '22px', fontWeight: 600, marginTop: '24px' }}>
                {currentTrack.title}
              </h2>
              <p style={{ fontSize: '16px', fontWeight: 400, color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                {currentTrack.artist}
              </p>

              <div style={{ marginTop: '24px', width: '360px' }}>
                <Slider
                  value={[progress]}
                  max={100}
                  step={0.1}
                  onValueChange={([value]) => seekTo(value)}
                  className="mb-2 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[data-orientation=horizontal]]:h-1"
                />
                <div className="flex justify-between" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(currentTrack.duration)}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6" style={{ marginTop: '18px', width: '360px' }}>
                <button onClick={previousTrack} className="p-3 rounded-full hover:bg-white/10 transition-all duration-200 hover:scale-110">
                  <SkipBack className="h-6 w-6 text-white" />
                </button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={isPlaying ? pauseTrack : resumeTrack} className="p-3 rounded-full hover:bg-white/10 transition-transform">
                  {isPlaying ? <Pause className="h-8 w-8 text-white" /> : <Play className="h-8 w-8 text-white ml-0.5" />}
                </motion.button>
                <button onClick={nextTrack} className="p-3 rounded-full hover:bg-white/10 transition-all duration-200 hover:scale-110">
                  <SkipForward className="h-6 w-6 text-white" />
                </button>
              </div>

              <div className="flex items-center justify-center gap-4 mt-4" style={{ width: '360px' }}>
                <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <Heart className="h-5 w-5 text-white/60" />
                </button>
              </div>
            </motion.div>
          </div>

          <div style={{ width: '160px' }} className="flex-shrink-0" />

          {/* Right column: Lyrics */}
          <div className="flex-1 flex items-center min-w-0 h-full" style={{ maxWidth: '600px' }}>
            <div ref={lyricsContainerRef} className="relative w-full h-full">
              <LyricsContent {...lyricsContentProps} isMobile={false} />
            </div>
          </div>
        </div>

        {/* ═══════════ MOBILE LAYOUT ═══════════ */}
        <div className="relative h-full flex flex-col md:hidden z-10" onClick={handleMobileTap}>
          {/* Top header - cover art and details */}
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
              className="flex items-center justify-center flex-shrink-0 rounded-full hover:bg-white/20 transition-colors"
              style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.12)' }}
              onClick={(e) => { e.stopPropagation(); }}
            >
              <MoreHorizontal className="text-white" style={{ width: '16px', height: '16px' }} />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); handleClose(); }}
              className="flex items-center justify-center flex-shrink-0 rounded-full hover:bg-white/20 transition-colors"
              style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.12)' }}
            >
              <X className="text-white" style={{ width: '18px', height: '18px' }} />
            </button>
          </div>

          {/* Lyrics area - full remaining space, controls overlay on top */}
          <div
            ref={lyricsContainerRef}
            className="flex-1 relative min-h-0"
            style={{ overflow: 'hidden' }}
          >
            <LyricsContent {...lyricsContentProps} isMobile />
          </div>

          {/* Bottom controls - overlays on top of lyrics, doesn't affect layout */}
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
                onValueChange={([value]) => { seekTo(value); resetMobileControlsTimer(); }}
                className="mb-2 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[data-orientation=horizontal]]:h-1"
              />
              <div className="flex justify-between" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(currentTrack.duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-8 mt-3">
              <button onClick={(e) => { e.stopPropagation(); previousTrack(); resetMobileControlsTimer(); }} className="p-3 rounded-full hover:bg-white/10 transition-colors">
                <SkipBack className="h-6 w-6 text-white" />
              </button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={(e) => { e.stopPropagation(); isPlaying ? pauseTrack() : resumeTrack(); resetMobileControlsTimer(); }}
                className="p-4 rounded-full transition-transform"
                style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}
              >
                {isPlaying ? <Pause className="h-7 w-7 text-white" /> : <Play className="h-7 w-7 text-white ml-0.5" />}
              </motion.button>
              <button onClick={(e) => { e.stopPropagation(); nextTrack(); resetMobileControlsTimer(); }} className="p-3 rounded-full hover:bg-white/10 transition-colors">
                <SkipForward className="h-6 w-6 text-white" />
              </button>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
