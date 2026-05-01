import { useEffect, useRef } from "react";
import {
  DomLyricPlayer,
  type LyricLine,
  type LyricLineMouseEvent,
} from "@applemusic-like-lyrics/core";

interface Props {
  lines: LyricLine[];
  /** Current playback time in ms */
  currentTime: number;
  /** Mark a seek (skips smoothing) */
  isSeek?: boolean;
  /** Base font size in px for lyrics (default 32) */
  fontSize?: number;
  /** Enable Apple Music style blur on inactive lines */
  enableBlur?: boolean;
  /** Fired when a lyric line is clicked, with its start time in ms */
  onLineClick?: (timeMs: number, lineIndex: number) => void;
  className?: string;
}

/**
 * AMLL DOM-based lyric player with smooth, word-level animation
 * (Apple Music-style scroll, scale, blur and word-mask transitions).
 */
const AMLLLyricsPlayer = ({
  lines,
  currentTime,
  isSeek,
  fontSize = 32,
  enableBlur = true,
  onLineClick,
  className,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<DomLyricPlayer | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(performance.now());
  const onLineClickRef = useRef(onLineClick);
  onLineClickRef.current = onLineClick;

  // Mount player
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
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      player.update(delta);
      rafRef.current = requestAnimationFrame(tick);
    };
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      player.removeEventListener("line-click", handleClick);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  // Push lyrics
  useEffect(() => {
    playerRef.current?.setLyricLines(lines, currentTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  // Drive current time
  useEffect(() => {
    playerRef.current?.setCurrentTime(currentTime, isSeek);
  }, [currentTime, isSeek]);

  // Toggle blur
  useEffect(() => {
    playerRef.current?.setEnableBlur(enableBlur);
  }, [enableBlur]);

  return (
    <div
      ref={containerRef}
      style={{ fontSize: `${fontSize}px`, cursor: onLineClick ? "pointer" : undefined }}
      className={`relative h-full w-full ${className ?? ""}`}
    />
  );
};

export default AMLLLyricsPlayer;
