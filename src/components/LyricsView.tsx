import { useState, useEffect, useMemo, useRef, Fragment, useLayoutEffect, useCallback, createContext, useContext } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { fetchSyncedLyrics, getCurrentLyricIndex, ParsedLyrics, LyricLine, parseLRC } from "@/lib/lyrics";
import { supabase } from "@/integrations/supabase/client";
import { getCachedLyrics } from "@/lib/offlineCache";
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
  Repeat,
  Repeat1,
  ListPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { AddToPlaylistDialog } from "@/components/AddToPlaylistDialog";
import React from "react";

// ─── Shared time ref context for zero-rerender karaoke fill ───
const SmoothTimeRefContext = createContext<React.MutableRefObject<number>>({ current: 0 } as React.MutableRefObject<number>);

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

function CanvasGradientBg({ artworkUrl, isClosing }: { artworkUrl?: string | null; isClosing: boolean }) {
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
      ]);
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
      blobsRef.current = createBlobs(canvasRef.current, colors);
    };
    img.onerror = () => {
      blobsRef.current = createBlobs(canvasRef.current, [
        [80, 20, 120], [20, 60, 140], [140, 30, 60],
      ]);
    };
    img.src = artworkUrl;
  }, [artworkUrl]);

  // Resize
  useEffect(() => {
    const handleResize = () => {
      const c = canvasRef.current;
      if (c) { c.width = window.innerWidth; c.height = window.innerHeight; }
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
      // Fade in
      if (!isClosing && opacityRef.current < 1) opacityRef.current = Math.min(1, opacityRef.current + 0.02);
      if (isClosing && opacityRef.current > 0) opacityRef.current = Math.max(0, opacityRef.current - 0.03);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = opacityRef.current * 0.65;
      ctx.globalCompositeOperation = 'lighter';

      blobsRef.current.forEach(b => {
        b.x += b.vx;
        b.y += b.vy;
        if (b.x < -b.radius) b.x = canvas.width + b.radius;
        if (b.x > canvas.width + b.radius) b.x = -b.radius;
        if (b.y < -b.radius) b.y = canvas.height + b.radius;
        if (b.y > canvas.height + b.radius) b.y = -b.radius;

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

function createBlobs(canvas: HTMLCanvasElement | null, colors: [number, number, number][]): Blob[] {
  const w = canvas?.width || window.innerWidth;
  const h = canvas?.height || window.innerHeight;
  const blobs: Blob[] = [];
  for (let i = 0; i < 20; i++) {
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
function KaraokeWordSpan({ word, startTime, endTime, frozen }: { word: string; startTime: number; endTime: number; frozen?: boolean }) {
  const timeRef = useContext(SmoothTimeRefContext);
  const fillRef = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const prevDoneRef = useRef(false);

  const safeDuration = Math.max(endTime - startTime, 0.15);
  const wordDuration = endTime - startTime;
  const emphasisScale = wordDuration >= 1.5 ? 0.12 : wordDuration >= 1.0 ? 0.08 : wordDuration >= 0.8 ? 0.04 : 0;
  const hasEmphasis = emphasisScale > 0;

  useEffect(() => {
    if (frozen) {
      if (fillRef.current) {
        fillRef.current.style.opacity = '0.35';
        fillRef.current.style.transform = 'translateZ(0) scaleX(1)';
        fillRef.current.style.setProperty('mask-image', 'none');
        fillRef.current.style.setProperty('-webkit-mask-image', 'none');
      }
      if (wrapRef.current) {
        wrapRef.current.style.transform = 'translateY(-1px) scale(1)';
      }
      prevDoneRef.current = true;
      return;
    }

    let raf = 0;
    const tick = () => {
      const ct = timeRef.current;
      const progress = ct >= endTime ? 1 : ct > startTime ? (ct - startTime) / safeDuration : 0;
      const clamped = Math.min(1, Math.max(0, progress));
      const isDone = clamped >= 1;

      if (fillRef.current) {
        fillRef.current.style.opacity = isDone ? '0.35' : '1';
        fillRef.current.style.transform = `translateZ(0) scaleX(${clamped})`;
        if (isDone) {
          fillRef.current.style.setProperty('mask-image', 'none');
          fillRef.current.style.setProperty('-webkit-mask-image', 'none');
        } else if (clamped > 0) {
          fillRef.current.style.setProperty('mask-image', 'linear-gradient(to right, white 70%, transparent 100%)');
          fillRef.current.style.setProperty('-webkit-mask-image', 'linear-gradient(to right, white 70%, transparent 100%)');
        }
      }

      if (wrapRef.current && isDone !== prevDoneRef.current) {
        const wordLift = isDone ? -1 : 0;
        const wordScale = hasEmphasis && isDone ? 1 + emphasisScale : 1;
        wrapRef.current.style.transform = `translateY(${wordLift}px) scale(${wordScale})`;
        prevDoneRef.current = isDone;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endTime, frozen, hasEmphasis, emphasisScale, safeDuration, startTime, timeRef]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-block align-baseline"
      style={{
        transformOrigin: 'bottom center',
        transition: 'transform 300ms ease-out',
        willChange: 'transform',
      }}
    >
      <span style={{ whiteSpace: 'pre', color: `rgba(255, 255, 255, ${frozen ? 0.2 : 0.35})` }}>
        {word}
      </span>
      <span
        ref={fillRef}
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          transform: 'translateZ(0) scaleX(0)',
          transformOrigin: 'left center',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
        }}
      >
        <span style={{ whiteSpace: 'pre', color: '#ffffff' }}>
          {word}
        </span>
      </span>
    </span>
  );
}

// ─── eLRC line ───
function ELRCLine({ words, isMobile, frozen }: { words: { word: string; startTime: number; endTime: number }[]; isMobile: boolean; frozen?: boolean }) {
  return (
    <span dir="auto" className="font-semibold inline-block" style={{ fontSize: isMobile ? '3.5rem' : '40px', fontWeight: 600, unicodeBidi: "plaintext", lineHeight: 1.4 }}>
      {words.map((w, idx) => (
        <Fragment key={`${w.word}-${idx}`}>
          <KaraokeWordSpan word={w.word} startTime={w.startTime} endTime={w.endTime} frozen={frozen} />
          {idx < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

// ─── Karaoke line (renders for BOTH active and recently-passed lines) ───
function KaraokeLine({ text, words, lineIndex, lineStartTime, lineEndTime, isCurrentLine, isPastLine, isMobile }: {
  text: string; words: KaraokeWord[]; lineIndex: number; lineStartTime: number; lineEndTime: number; isCurrentLine: boolean; isPastLine: boolean; isMobile: boolean;
}) {
  const hasLineIndex = words.some((w) => typeof w.lineIndex === "number");
  const lineWords = (hasLineIndex
    ? words.filter((w) => w.lineIndex === lineIndex)
    : words.filter((w) => w.startTime >= lineStartTime && w.startTime < lineEndTime)
  ).slice().sort((a, b) => a.startTime - b.startTime);

  const shouldRenderFill = lineWords.length > 0 && (isCurrentLine || isPastLine);
  const frozen = isPastLine && !isCurrentLine;

  if (shouldRenderFill) {
    return (
      <span dir="auto" className="font-semibold inline-block" style={{ fontSize: isMobile ? '3.5rem' : '40px', fontWeight: 600, unicodeBidi: "plaintext", lineHeight: 1.4 }}>
        {lineWords.map((wordData, idx) => (
          <Fragment key={`${wordData.word}-${idx}`}>
            <KaraokeWordSpan word={wordData.word} startTime={wordData.startTime} endTime={wordData.endTime} frozen={frozen} />
            {idx < lineWords.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    );
  }

  return (
    <span className="font-semibold inline-block" style={{ fontSize: isMobile ? '3.5rem' : '40px', fontWeight: 600, color: "rgba(255, 255, 255, 0.35)", unicodeBidi: "plaintext", lineHeight: 1.4 }}>
      {text}
    </span>
  );
}

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
  const ACTIVE_OFFSET = 0.22;
  const dur = isMobile ? 0.28 + lyricsSpeed * 0.32 : 0.2 + lyricsSpeed * 0.5;

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
        opacity = Math.max(0, 0.3 - (distance - 1) * 0.2);
        blur = isMobile ? 0 : 1.5 + distance * 0.8;
        scale = 1;
      } else {
        opacity = Math.max(0.08, 0.5 - (distance - 1) * 0.06);
        blur = isMobile ? 0 : Math.min(3, distance * 0.35);
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
      const filterProp = isMobile ? '' : `, filter ${dur}s ${easing} ${delay}s`;
      const transitionStr = `opacity ${dur}s ${easing} ${delay}s${filterProp}, transform ${dur}s ${easing} ${delay}s`;

      const makeTransform = (y: number, s: number) =>
        `translate3d(0, ${y}px, 0) scale(${s})`;

      if (isNew) {
        el.style.transition = 'none';
        el.style.willChange = 'transform, opacity';
        if (isMobile) {
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

  const fontSize = isMobile ? '3.5rem' : '40px';

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 78%, transparent 100%)',
      }}
    >
      {visibleLyrics.map((item) => {
        const { text, index, position, lineTime, nextLineTime, isIntro, secondaryText, alignment, isMusic, musicEnd, nlCompanionText, nlCompanionTime, nlCompanionEndTime, nlCompanionElrcWords, elrcWords } = item;
        const isActive = position === 0;
        const isPastLine = position < 0;
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
              paddingLeft: isMobile ? '20px' : '0',
              paddingRight: isMobile ? '20px' : '0',
              top: 0,
            }}
          >
            {isMusic && musicEnd ? (
              <MusicIndicator currentTime={smoothTime} startTime={lineTime} endTime={musicEnd} />
            ) : !isIntro && elrcWords && elrcWords.length > 0 ? (
              <>
                <ELRCLine words={elrcWords} isMobile={isMobile} frozen={isPastLine} />
                {nlCompanionText && nlCompanionElrcWords && nlCompanionElrcWords.length > 0 ? (
                  <div style={{ marginTop: '12px', opacity: isActive ? 0.5 : 0.35 }}>
                    <ELRCLine words={nlCompanionElrcWords} isMobile={isMobile} frozen={isPastLine} />
                  </div>
                ) : nlCompanionText && (
                  <p dir="auto" style={{ fontSize, fontWeight: isActive ? 700 : 600, color: "rgba(255,255,255,0.35)", unicodeBidi: "plaintext", lineHeight: 1.4, marginTop: '12px', margin: 0 }}>
                    {nlCompanionText}
                  </p>
                )}
                {secondaryText && (
                  <p dir="auto" style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 500, color: "rgba(255,255,255,0.6)", unicodeBidi: "plaintext", lineHeight: 1.4, marginTop: '4px' }}>
                    {stripBrackets(secondaryText)}
                  </p>
                )}
              </>
            ) : !isIntro && karaokeEnabled ? (
              <>
                <KaraokeLine text={text} words={karaokeWords} lineIndex={index} lineStartTime={lineTime} lineEndTime={nextLineTime} isCurrentLine={isActive} isPastLine={isPastLine} isMobile={isMobile} />
                {nlCompanionText && nlCompanionTime != null && nlCompanionEndTime != null ? (
                  <div style={{ marginTop: '12px', opacity: isActive ? 0.5 : 0.35 }}>
                    <KaraokeLine text={nlCompanionText} words={karaokeWords} lineIndex={index + 1} lineStartTime={nlCompanionTime} lineEndTime={nlCompanionEndTime} isCurrentLine={isActive} isPastLine={isPastLine} isMobile={isMobile} />
                  </div>
                ) : nlCompanionText && (
                  <p dir="auto" style={{ fontSize, fontWeight: isActive ? 700 : 600, color: "rgba(255,255,255,0.35)", unicodeBidi: "plaintext", lineHeight: 1.4, marginTop: '12px', margin: 0 }}>
                    {nlCompanionText}
                  </p>
                )}
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
                    fontSize,
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.35)",
                    unicodeBidi: "plaintext",
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  {text}
                </p>
                {nlCompanionText && (
                  <p dir="auto" style={{ fontSize, fontWeight: isActive ? 700 : 600, color: "rgba(255,255,255,0.35)", unicodeBidi: "plaintext", lineHeight: 1.4, marginTop: '12px', margin: 0 }}>
                    {nlCompanionText}
                  </p>
                )}
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
  const { currentTrack, isPlaying, progress, playbackRate, pauseTrack, resumeTrack, nextTrack, previousTrack, seekTo, repeat, toggleRepeat } = usePlayer();
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

  const currentTime = currentTrack ? (progress / 100) * currentTrack.duration : 0;

  // Smooth time for karaoke — DOM-driven via ref, state is throttled for layout/line changes only
  const [smoothTime, setSmoothTime] = useState(0);
  const smoothTimeRef = useRef(0);
  const lastPublishedSmoothTimeRef = useRef(0);
  const baseTimeRef = useRef(0);
  const baseTsRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const seekLockRef = useRef<{ time: number; until: number } | null>(null);

  const playbackRateRef = useRef(playbackRate);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);

  useEffect(() => {
    const now = performance.now();
    if (seekLockRef.current && now < seekLockRef.current.until) {
      const diff = Math.abs(currentTime - seekLockRef.current.time);
      if (diff > 1.5) return;
      seekLockRef.current = null;
    }
    baseTimeRef.current = currentTime;
    baseTsRef.current = performance.now();
    smoothTimeRef.current = currentTime;
    lastPublishedSmoothTimeRef.current = currentTime;
    setSmoothTime(currentTime);
  }, [currentTime]);

  const smoothRateRef = useRef(playbackRate);
  const targetRateRef = useRef(playbackRate);
  useEffect(() => {
    targetRateRef.current = playbackRate;
    const startRate = smoothRateRef.current;
    const startTs = performance.now();
    const tweenDuration = 300;
    const tweenRate = () => {
      const elapsed = performance.now() - startTs;
      const t = Math.min(1, elapsed / tweenDuration);
      const eased = t * t * (3 - 2 * t);
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
      let next: number;

      if (seekLockRef.current && now < seekLockRef.current.until) {
        next = seekLockRef.current.time;
      } else {
        const elapsed = Math.max(0, (now - baseTsRef.current) / 1000);
        const rate = smoothRateRef.current || 1;
        next = isPlaying ? baseTimeRef.current + elapsed * rate : baseTimeRef.current;
        next = Math.min(Math.max(next, 0), currentTrack.duration);
      }

      smoothTimeRef.current = next;

      if (Math.abs(next - lastPublishedSmoothTimeRef.current) >= 0.08) {
        lastPublishedSmoothTimeRef.current = next;
        setSmoothTime(next);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [currentTrack?.id, currentTrack?.duration, isPlaying]);

  useEffect(() => {
    if (!parsedLyrics?.isSynced || !currentTrack) return;
    const newIndex = getCurrentLyricIndex(parsedLyrics.lines, smoothTime);
    if (newIndex !== currentLineIndex) setCurrentLineIndex(newIndex);
  }, [smoothTime, parsedLyrics, currentTrack, currentLineIndex]);

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

    seekLockRef.current = { time: targetTime, until: performance.now() + 600 };
    baseTimeRef.current = targetTime;
    baseTsRef.current = performance.now();
    smoothTimeRef.current = targetTime;
    lastPublishedSmoothTimeRef.current = targetTime;
    setSmoothTime(targetTime);
    setCurrentLineIndex(lineIndex);
    seekTo(Math.max(0, Math.min(100, nextProgress)));
  }, [parsedLyrics, currentTrack, seekTo]);

  const handleSliderSeek = useCallback((value: number) => {
    if (!currentTrack) return;
    const targetTime = (value / 100) * currentTrack.duration;
    seekLockRef.current = { time: targetTime, until: performance.now() + 600 };
    baseTimeRef.current = targetTime;
    baseTsRef.current = performance.now();
    smoothTimeRef.current = targetTime;
    lastPublishedSmoothTimeRef.current = targetTime;
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
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 1.02 }}
        animate={{ opacity: isClosing ? 0 : 1, scale: isClosing ? 0.95 : 1, y: isClosing ? 20 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed inset-0 z-50 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <CanvasGradientBg artworkUrl={currentTrack.artwork} isClosing={isClosing} />

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
                  onValueChange={([value]) => handleSliderSeek(value)}
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
              </div>
            </motion.div>
          </div>

          <div style={{ width: '160px' }} className="flex-shrink-0" />

          <div className="flex-1 min-w-0 h-full" style={{ maxWidth: '620px' }}>
            <div className="flex h-full flex-col gap-6 py-10">
              <div ref={lyricsContainerRef} className="relative min-h-0 flex-1">
                <LyricsContent {...lyricsContentProps} isMobile={false} />
              </div>
              
            </div>
          </div>
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

          <div className="flex-1 min-h-0 flex flex-col">
            <div
              ref={lyricsContainerRef}
              className="relative flex-1 min-h-0"
              style={{ overflow: 'hidden' }}
            >
              <LyricsContent {...lyricsContentProps} isMobile />
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
                className="mb-2 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[data-orientation=horizontal]]:h-1"
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
              <button onClick={(e) => { e.stopPropagation(); currentTrack && setShowPlaylistDialog(true); resetMobileControlsTimer(); }} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <ListPlus className="h-5 w-5 text-white/60" />
              </button>
            </div>
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
