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

  // 🆕 “Spring control layer” (simulated)
  mass?: number;        // heaviness
  damping?: number;     // resistance
  stiffness?: number;   // snap strength
}

const AMLLLyricsPlayer = ({
  lines,
  currentTime,
  isSeek,
  fontSize = 45,
  enableBlur = true,
  onLineClick,
  isMobile = false,
  className,

  // 🆕 defaults matching AMLL playground vibe
  mass = 1,
  damping = 15,
  stiffness = 100,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<DomLyricPlayer | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(performance.now());
  const visibleRef = useRef<boolean>(true);
  const onLineClickRef = useRef(onLineClick);

  onLineClickRef.current = onLineClick;

  // 🧠 derived “feel multipliers” (this is the real magic)
  const forceRef = useRef({
    deltaScale: 1,
    seekThreshold: 300,
  });

  useEffect(() => {
    // convert spring params → motion behavior
    // (this is how we simulate playground sliders)

    const deltaScale = Math.min(2.2, 1 + (mass - 1) * 0.6 + stiffness / 250);
    const seekThreshold = Math.max(80, 320 - damping * 10);

    forceRef.current = {
      deltaScale,
      seekThreshold,
    };
  }, [mass, damping, stiffness]);

  useEffect(() => {
    if (!containerRef.current) return;

    const player = new DomLyricPlayer();
    const el = player.getElement();

    el.style.width = "100%";
    el.style.height = "100%";

    containerRef.current.appendChild(el);
    playerRef.current = player;

    const handleClick = (evt: Event) => {
      const e = evt as LyricLineMouseEvent;
      const line = e.line as unknown as { startTime?: number };
      const start = line?.startTime ?? lines[e.lineIndex]?.startTime ?? 0;
      onLineClickRef.current?.(start, e.lineIndex);
    };

    player.addEventListener("line-click", handleClick);

    const tick = (now: number) => {
      if (!playerRef.current) return;

      const rawDelta = now - lastTickRef.current;
      lastTickRef.current = now;

      const { deltaScale } = forceRef.current;
      const delta = rawDelta * deltaScale;

      if (visibleRef.current) {
        player.update(delta);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);

    const io = new IntersectionObserver((entries) => {
      visibleRef.current = entries[0]?.isIntersecting ?? true;
    });

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

  useEffect(() => {
    playerRef.current?.setLyricLines(lines, currentTime);
  }, [lines, currentTime]);

  useEffect(() => {
    const prev = lastTickRef.current;
    const delta = Math.abs(currentTime - prev);

    const { seekThreshold } = forceRef.current;
    const detectedSeek = delta > seekThreshold;

    lastTickRef.current = currentTime;

    playerRef.current?.setCurrentTime(
      currentTime,
      isSeek || detectedSeek
    );
  }, [currentTime, isSeek]);

  useEffect(() => {
    playerRef.current?.setEnableBlur(enableBlur);
  }, [enableBlur]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;

    p.setAlignAnchor("top");
    p.setAlignPosition(isMobile ? 0.10 : 0.20);
  }, [isMobile]);

  return (
    <div
      ref={containerRef}
      style={{
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
