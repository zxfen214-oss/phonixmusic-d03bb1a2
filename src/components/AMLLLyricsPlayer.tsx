import { memo, useEffect, useRef } from "react";
import {
  DomLyricPlayer,
  type LyricLine,
  type LyricLineMouseEvent,
} from "@applemusic-like-lyrics/core";

export interface PosYSpringKeyframe {
  // Range in ms. `start` is required for new entries; `time` kept for
  // backwards compatibility (legacy single-point keyframes). `end` is
  // optional — when omitted, the range stays active until the next keyframe.
  start?: number;
  end?: number;
  time?: number;
  mass: number;
  damping: number;
  stiffness: number;
}

const DEFAULT_POSY_SPRING = { mass: 1, damping: 15, stiffness: 100 };

interface Props {
  lines: LyricLine[];
  currentTime: number;
  isSeek?: boolean;
  fontSize?: number;
  enableBlur?: boolean;
  onLineClick?: (timeMs: number, lineIndex: number) => void;
  isMobile?: boolean;
  className?: string;
  posYSpringKeyframes?: PosYSpringKeyframe[];
  /** Multiplier for the word-swell scale on long-held syllables. 1 = AMLL default. */
  swellScale?: number;
  /** Playback-rate multiplier for the word-swell animation. 1 = AMLL default. */
  swellSpeed?: number;
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
  posYSpringKeyframes,
  swellScale = 1,
  swellSpeed = 1,
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
    p.setAlignPosition(isMobile ? 0.10 : 0.20);
  }, [isMobile]);

  // Apply vertical-displacement spring (posY) keyframes. Each keyframe takes
  // effect once currentTime >= keyframe.time. Sorted ascending by time.
  // Active spring ranges. Each entry has [start, end) in ms; outside any
  // range we snap back to DEFAULT_POSY_SPRING. Legacy `time`-only entries
  // are treated as start with end = next entry's start (or +∞).
  type Range = { start: number; end: number; mass: number; damping: number; stiffness: number };
  const sortedRangesRef = useRef<Range[]>([]);
  const lastAppliedKeyRef = useRef<string>("");
  useEffect(() => {
    const raw = (posYSpringKeyframes ?? [])
      .map((k) => ({
        start: typeof k.start === "number" ? k.start : (k.time ?? 0),
        end: typeof k.end === "number" ? k.end : Number.POSITIVE_INFINITY,
        mass: k.mass,
        damping: k.damping,
        stiffness: k.stiffness,
      }))
      .filter((k) => Number.isFinite(k.start))
      .sort((a, b) => a.start - b.start);
    // For legacy entries with no explicit end, cap at the next entry's start
    for (let i = 0; i < raw.length; i++) {
      if (!Number.isFinite(raw[i].end) && i + 1 < raw.length) {
        raw[i].end = raw[i + 1].start;
      }
    }
    sortedRangesRef.current = raw;
    lastAppliedKeyRef.current = ""; // force re-apply
  }, [posYSpringKeyframes]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const ranges = sortedRangesRef.current;
    let active: { mass: number; damping: number; stiffness: number } = DEFAULT_POSY_SPRING;
    for (const r of ranges) {
      if (currentTime >= r.start && currentTime < r.end) {
        active = r; // last match wins (later ranges override)
      }
    }
    const key = `${active.mass}|${active.damping}|${active.stiffness}`;
    if (key !== lastAppliedKeyRef.current) {
      lastAppliedKeyRef.current = key;
      p.setLinePosYSpringParams(active);
    }
  }, [currentTime, posYSpringKeyframes]);

  // Word-swell amplifier. AMLL's emphasize ("swell") animation is implemented
  // via Web Animations attached to the per-character spans of long-held words.
  // We sweep all live animations under the host and:
  //   - multiply the scale component of each keyframe's `transform` by
  //     `swellScale` (composed via an extra ` scale(N)` suffix — applied once,
  //     guarded by a marker comment so re-applies don't double up).
  //   - set `animation.playbackRate = swellSpeed` so the swell finishes faster
  //     or slower without altering AMLL's timing math.
  // AMLL re-creates these animations on every setLyricLines / DOM resize, so
  // we re-apply after lines change, after time seeks past a new line, and via
  // a MutationObserver on the host subtree.
  const swellScaleRef = useRef(swellScale);
  const swellSpeedRef = useRef(swellSpeed);
  swellScaleRef.current = swellScale;
  swellSpeedRef.current = swellSpeed;

  const applySwell = () => {
    const root = containerRef.current;
    if (!root || typeof (root as any).getAnimations !== "function") return;
    const scale = swellScaleRef.current;
    const speed = Math.max(0.05, swellSpeedRef.current);
    const anims = (root as any).getAnimations({ subtree: true }) as Animation[];
    for (const a of anims) {
      if (!a.id || !a.id.startsWith("emphasize-word-")) continue;
      if (a.playbackRate !== speed) a.playbackRate = speed;
      const effect = a.effect as KeyframeEffect | null;
      if (!effect || scale === 1) continue;
      const marker = `/*lvbl-swell:${scale}*/`;
      const kfs = effect.getKeyframes();
      let mutated = false;
      for (const kf of kfs) {
        const t = (kf as any).transform as string | undefined;
        if (typeof t !== "string" || t.includes(marker)) continue;
        // Strip any previous marker before re-applying with new scale
        const cleaned = t.replace(/\s*scale\([^)]*\)\s*\/\*lvbl-swell:[^*]*\*\//g, "");
        (kf as any).transform = `${cleaned} scale(${scale}) ${marker}`;
        mutated = true;
      }
      if (mutated) effect.setKeyframes(kfs as any);
    }
  };

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    applySwell();
    const obs = new MutationObserver(() => {
      // Debounce a microtask; AMLL bulk-mutates during re-renders.
      queueMicrotask(applySwell);
    });
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    applySwell();
  }, [swellScale, swellSpeed, lines, currentTime]);




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
