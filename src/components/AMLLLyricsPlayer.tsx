import { memo, useEffect, useRef } from "react";
import type { LyricLine } from "@applemusic-like-lyrics/core";

export interface AlignOverride {
  startMs: number;
  endMs: number;
  position: number; // 0..1 (0=top, 1=bottom). Defaults: desktop 0.32, mobile 0.18
}

interface Props {
  lines: LyricLine[];
  currentTime: number;
  isSeek?: boolean;
  fontSize?: number;
  enableBlur?: boolean;
  onLineClick?: (timeMs: number, lineIndex: number) => void;
  isMobile?: boolean;
  className?: string;
  alignOverrides?: AlignOverride[];
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
  alignOverrides,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const visibleRef = useRef<boolean>(true);
  const onLineClickRef = useRef(onLineClick);
  onLineClickRef.current = onLineClick;
  const readyRef = useRef(false);
  const alignOverridesRef = useRef<AlignOverride[] | undefined>(alignOverrides);
  alignOverridesRef.current = alignOverrides;
  const lastAlignRef = useRef<number | null>(null);


  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const { DomLyricPlayer } = await import("@applemusic-like-lyrics/core");
      if (disposed || !containerRef.current) return;

      const player = new DomLyricPlayer();
      const el = player.getElement();
      el.style.width = "100%";
      el.style.height = "100%";
      containerRef.current.appendChild(el);
      playerRef.current = player;
      readyRef.current = true;

      // Apply current props now that player exists
      player.setLyricLines(lines, currentTime);
      player.setCurrentTime(currentTime, true);
      player.setEnableBlur(enableBlur);
      player.setAlignAnchor("top");
      player.setAlignPosition(isMobile ? 0.18 : 0.32);

      const handleClick = (evt: Event) => {
        const e = evt as any;
        const line = e.line as { startTime?: number };
        const start = line?.startTime ?? lines[e.lineIndex]?.startTime ?? 0;
        onLineClickRef.current?.(start, e.lineIndex);
      };
      player.addEventListener("line-click", handleClick);

      lastTickRef.current = performance.now();
      const tick = (now: number) => {
        const delta = now - lastTickRef.current;
        lastTickRef.current = now;
        if (visibleRef.current) player.update(delta);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

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

      cleanup = () => {
        player.removeEventListener("line-click", handleClick);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        io.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        player.dispose();
        playerRef.current = null;
        readyRef.current = false;
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (readyRef.current) playerRef.current?.setLyricLines(lines, currentTime);
  }, [lines]);

  const lastTimeRef = useRef(currentTime);
  useEffect(() => {
    const prev = lastTimeRef.current;
    const delta = Math.abs(currentTime - prev);
    const detectedSeek = delta > 300;
    lastTimeRef.current = currentTime;
    if (readyRef.current)
      playerRef.current?.setCurrentTime(currentTime, isSeek || detectedSeek);

    // Apply align position based on overrides (default if no active override)
    const p = playerRef.current;
    if (p && readyRef.current) {
      const defaultPos = isMobile ? 0.18 : 0.32;
      const overrides = alignOverridesRef.current;
      let target = defaultPos;
      if (overrides && overrides.length > 0) {
        const active = overrides.find(
          (o) => currentTime >= o.startMs && currentTime < o.endMs
        );
        if (active && Number.isFinite(active.position)) {
          target = Math.max(0, Math.min(1, active.position));
        }
      }
      if (lastAlignRef.current !== target) {
        p.setAlignPosition(target);
        lastAlignRef.current = target;
      }
    }
  }, [currentTime, isSeek, isMobile]);

  useEffect(() => {
    if (readyRef.current) playerRef.current?.setEnableBlur(enableBlur);
  }, [enableBlur]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    p.setAlignAnchor("top");
    // Reset cache so the time effect re-applies on next tick
    lastAlignRef.current = null;
  }, [isMobile, alignOverrides]);


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
