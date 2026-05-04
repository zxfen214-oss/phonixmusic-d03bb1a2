import { useEffect, useRef } from "react";
import {
  DomLyricPlayer,
  type LyricLine,
  type LyricLineMouseEvent,
} from "@applemusic-like-lyrics/core";

interface Props {
  lines: LyricLine[];
  currentTime: number;
  isSeek?: boolean;
  fontSize?: number;
  enableBlur?: boolean;
  onLineClick?: (timeMs: number, lineIndex: number) => void;
  isMobile?: boolean;
  /** When true, throttle to 30fps and pause when offscreen. Default false. */
  lowEnd?: boolean;
  className?: string;
}

const AMLLLyricsPlayer = ({
  lines,
  currentTime,
  isSeek,
  fontSize = 45,
  enableBlur = false,
  onLineClick,
  isMobile = false,
  lowEnd = false,
  className,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<DomLyricPlayer | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(performance.now());
  const accumRef = useRef<number>(0);
  const visibleRef = useRef<boolean>(true);
  const onLineClickRef = useRef(onLineClick);
  onLineClickRef.current = onLineClick;

  // Detect low-end device once: low CPU cores or low memory → throttle harder.
  const isLowEndRef = useRef<boolean>(false);
  if (typeof navigator !== "undefined" && !isLowEndRef.current) {
    const cores = (navigator as any).hardwareConcurrency ?? 8;
    const mem = (navigator as any).deviceMemory ?? 8;
    isLowEndRef.current = cores <= 4 || mem <= 4;
  }

  useEffect(() => {
    if (!containerRef.current) return;

    const player = new DomLyricPlayer();
    const el = player.getElement();
    el.style.width = "100%";
    el.style.height = "100%";
    // GPU compositing hints — keep AMLL's transforms on their own layer so
    // lyric scrolling doesn't repaint the rest of the page.
    el.style.willChange = "transform";
    (el.style as any).contain = "layout paint style";
    containerRef.current.appendChild(el);
    playerRef.current = player;

    const handleClick = (evt: Event) => {
      const e = evt as LyricLineMouseEvent;
      const line = e.line as unknown as { startTime?: number };
      const start = line?.startTime ?? lines[e.lineIndex]?.startTime ?? 0;
      onLineClickRef.current?.(start, e.lineIndex);
    };

    player.addEventListener("line-click", handleClick);

    // Target frame budget: 60fps on normal devices, 30fps on low-end.
    // Throttling the update() call (not the rAF loop itself) keeps the
    // animation timing identical while halving JS/layout work per second.
    const targetMs = isLowEndRef.current ? 1000 / 30 : 1000 / 60;

    const tick = (now: number) => {
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      // Skip updates entirely while tab/lyrics are hidden.
      if (visibleRef.current) {
        accumRef.current += delta;
        if (accumRef.current >= targetMs) {
          player.update(accumRef.current);
          accumRef.current = 0;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);

    // Pause work when the lyrics container scrolls offscreen or tab hides.
    const io = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 }
    );
    io.observe(containerRef.current);

    const onVis = () => {
      visibleRef.current = !document.hidden;
      lastTickRef.current = performance.now();
      accumRef.current = 0;
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      player.removeEventListener("line-click", handleClick);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    playerRef.current?.setLyricLines(lines, currentTime);
  }, [lines]);

  // Auto-detect external seeks: if currentTime jumps unexpectedly (e.g. user
  // scrubbed from the bottom player bar), force AMLL to resync immediately
  // instead of smoothly tweening — prevents drift after a jump.
  const lastTimeRef = useRef(currentTime);
  useEffect(() => {
    const prev = lastTimeRef.current;
    const delta = Math.abs(currentTime - prev);
    // >300ms jump while we're within a normal playback flow = real seek
    const detectedSeek = delta > 300;
    lastTimeRef.current = currentTime;
    playerRef.current?.setCurrentTime(currentTime, isSeek || detectedSeek);
  }, [currentTime, isSeek]);

  useEffect(() => {
    playerRef.current?.setEnableBlur(enableBlur);
  }, [enableBlur]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    p.setAlignAnchor("top");
    p.setAlignPosition(isMobile ? 0.18 : 0.32);
  }, [isMobile]);

  return (
    <div
      ref={containerRef}
      style={{
        // AMLL reads font-size from this CSS variable; setting font-size
        // alone is ignored because .amll-lyric-player has its own font-size
        // declaration that uses var(--amll-lp-font-size, fallback).
        ["--amll-lp-font-size" as any]: `${fontSize}px`,
        fontSize: `${fontSize}px`,
        cursor: onLineClick ? "pointer" : undefined,
      }}
      className={`amll-lyrics-host ${
        isMobile ? "amll-lyrics-host-mobile" : ""
      } relative h-full w-full ${className ?? ""}`}
    />
  );
};

export default AMLLLyricsPlayer;
