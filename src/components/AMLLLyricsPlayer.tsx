import { memo, useEffect, useRef } from "react";
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
  className,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<DomLyricPlayer | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(performance.now());
  const visibleRef = useRef<boolean>(true);
  const onLineClickRef = useRef(onLineClick);
  onLineClickRef.current = onLineClick;

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

    // Always run at the display's native refresh rate (60Hz, 120Hz, 144Hz, …).
    // No throttling — feed AMLL the real frame delta every rAF tick.
    const tick = (now: number) => {
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      if (visibleRef.current) {
        player.update(delta);
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

  // Initial sync when lyrics change
  useEffect(() => {
    playerRef.current?.setLyricLines(lines, currentTime);
    playerRef.current?.setCurrentTime(currentTime, true);
    lastTimeRef.current = currentTime;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  // Only resync on detected seeks. Between seeks, AMLL's internal rAF
  // (player.update(delta)) advances time naturally — no per-tick React work.
  const lastTimeRef = useRef(currentTime);
  useEffect(() => {
    const prev = lastTimeRef.current;
    const delta = currentTime - prev;
    lastTimeRef.current = currentTime;
    // Real seek = jump backwards, or jump forward by far more than the
    // ~250ms throttled tick (state interval is 250ms, so anything >700ms
    // signals a scrub or programmatic jump).
    const detectedSeek = delta < -200 || delta > 700;
    if (isSeek || detectedSeek) {
      playerRef.current?.setCurrentTime(currentTime, true);
    }
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

export default memo(AMLLLyricsPlayer);
