import { useState, useEffect, useRef, useCallback } from "react";

type Speed = "slow" | "normal" | "fast";

export interface KaraokeConfig {
  /** Duration of the full karaoke sweep in ms per speed */
  durations?: { slow: number; normal: number; fast: number };
  /** Max vertical lift in px per speed */
  uplifts?: { slow: number; normal: number; fast: number };
  /** Max scale factor per speed (e.g. 1.15 = 15% bigger) */
  growths?: { slow: number; normal: number; fast: number };
  /** How many neighboring letters get the wave effect */
  waveRadii?: { slow: number; normal: number; fast: number };
  /** How long letters take to return to resting position (ms) */
  returnDurations?: { slow: number; normal: number; fast: number };
  /** Initial text */
  initialText?: string;
  /** Initial speed */
  initialSpeed?: Speed;
  /** Pause between loops in ms */
  loopPause?: number;
  /** Base opacity of unfilled letters (0-1) */
  baseOpacity?: number;
  /** Glow radius in letters */
  glowRadius?: number;
  /** Max glow opacity (0-1) */
  glowOpacity?: number;
}

const DEFAULTS: Required<KaraokeConfig> = {
  durations: { slow: 4000, normal: 2500, fast: 1500 },
  uplifts: { slow: 28, normal: 20, fast: 10 },
  growths: { slow: 1.18, normal: 1.12, fast: 1.05 },
  waveRadii: { slow: 3, normal: 2, fast: 1.5 },
  returnDurations: { slow: 1200, normal: 800, fast: 500 },
  initialText: "Roxxane",
  initialSpeed: "normal",
  loopPause: 1500,
  baseOpacity: 0.35,
  glowRadius: 3,
  glowOpacity: 0.25,
};

const KaraokeText = (props: KaraokeConfig = {}) => {
  const cfg = { ...DEFAULTS, ...props };
  const [speed, setSpeed] = useState<Speed>(cfg.initialSpeed);
  const [isPlaying, setIsPlaying] = useState(true);
  const [text, setText] = useState(cfg.initialText);
  const [editMode, setEditMode] = useState(false);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const pausedRef = useRef(false);
  const textRef = useRef(text);
  textRef.current = text;

  const updateLetters = useCallback((progress: number, speed: Speed, wordLen: number) => {
    const uplift = cfg.uplifts[speed];
    const growth = cfg.growths[speed];
    const waveRadius = cfg.waveRadii[speed];
    const returnDuration = cfg.returnDurations[speed];
    const finished = progress >= wordLen + waveRadius + 1;

    for (let i = 0; i < wordLen; i++) {
      const el = letterRefs.current[i];
      if (!el) continue;
      const distance = progress - i;
      let translateY = 0;
      let scale = 1;

      // Wave: symmetric around the cursor position (distance ≈ 0.5 is peak)
      if (!finished && distance >= 0 && distance < waveRadius + 2) {
        // Normalize so peak is at distance=0.5 (center of the letter being filled)
        const normalizedDist = Math.abs(distance - 0.5) / (waveRadius + 0.5);
        const waveFactor = Math.max(0, 1 - normalizedDist);
        const eased = waveFactor * waveFactor * (3 - 2 * waveFactor);
        translateY = -uplift * eased;
        scale = 1 + (growth - 1) * eased;
      }

      el.style.transform = `translateY(${translateY}px) scale(${scale})`;
      el.style.transition = finished
        ? `transform ${returnDuration}ms cubic-bezier(0.25, 0.1, 0.25, 1), text-shadow 400ms ease`
        : `transform ${returnDuration}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;

      // Glow only on filled (white) letters near cursor
      const glowDist = Math.abs(progress - i);
      const isFilled = distance >= 0.5;
      const glowStrength = (isFilled && glowDist < cfg.glowRadius) ? Math.max(0, 1 - glowDist / cfg.glowRadius) : 0;
      const glow = glowStrength * glowStrength * (3 - 2 * glowStrength);

      if (finished) {
        el.style.color = "rgba(255,255,255,1)";
        el.style.background = "none";
        el.style.webkitTextFillColor = "";
        el.style.textShadow = "none";
      } else if (distance >= 1) {
        el.style.color = "rgba(255,255,255,1)";
        el.style.background = "none";
        el.style.webkitTextFillColor = "";
        el.style.textShadow = glow > 0.02
          ? `0 0 ${6 + glow * 10}px rgba(255,255,255,${glow * cfg.glowOpacity})`
          : "none";
      } else if (distance > 0) {
        const pct = distance * 100;
        el.style.background = `linear-gradient(90deg, rgba(255,255,255,1) ${pct - 5}%, rgba(255,255,255,0.8) ${pct}%, rgba(255,255,255,${cfg.baseOpacity}) ${pct + 15}%)`;
        el.style.webkitTextFillColor = "transparent";
        (el.style as any).backgroundClip = "text";
        (el.style as any).webkitBackgroundClip = "text";
        el.style.textShadow = glow > 0.02
          ? `0 0 ${6 + glow * 10}px rgba(255,255,255,${glow * cfg.glowOpacity})`
          : "none";
      } else {
        el.style.color = `rgba(255,255,255,${cfg.baseOpacity})`;
        el.style.background = "none";
        el.style.webkitTextFillColor = "";
        el.style.textShadow = "none";
      }
    }
  }, [cfg]);

  useEffect(() => {
    if (!isPlaying || editMode) {
      pausedRef.current = true;
      return;
    }
    pausedRef.current = false;
    const wordLen = textRef.current.length;
    const duration = cfg.durations[speed];
    const waveRadius = cfg.waveRadii[speed];
    const returnDur = cfg.returnDurations[speed];
    startTimeRef.current = 0;
    letterRefs.current = letterRefs.current.slice(0, wordLen);
    updateLetters(0, speed, wordLen);

    const totalTravel = wordLen + waveRadius + 1;
    const totalDuration = duration + returnDur;

    const loop = (timestamp: number) => {
      if (pausedRef.current) return;
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const raw = ((timestamp - startTimeRef.current) / totalDuration) * totalTravel;

      if (raw >= totalTravel) {
        updateLetters(totalTravel, speed, wordLen);
        const timeout = setTimeout(() => {
          if (pausedRef.current) return;
          startTimeRef.current = 0;
          updateLetters(0, speed, wordLen);
          animFrameRef.current = requestAnimationFrame(loop);
        }, cfg.loopPause);
        (animFrameRef as any)._timeout = timeout;
        return;
      }
      updateLetters(raw, speed, wordLen);
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      clearTimeout((animFrameRef as any)._timeout);
    };
  }, [isPlaying, speed, text, editMode, updateLetters, cfg]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-karaoke-bg gap-12 select-none">
      {editMode ? (
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setEditMode(false); }}
          onBlur={() => setEditMode(false)}
          className="bg-transparent border-b border-karaoke-btn-text text-center font-karaoke text-karaoke tracking-karaoke leading-none text-karaoke-btn-text outline-none"
          style={{ caretColor: "white" }}
        />
      ) : (
        <div
          className="font-karaoke text-karaoke tracking-karaoke leading-none cursor-pointer"
          onDoubleClick={() => { setIsPlaying(false); setEditMode(true); }}
          title="Double-click to edit text"
        >
          {text.split("").map((letter, i) => (
            <span
              key={`${text}-${i}`}
              ref={(el) => { letterRefs.current[i] = el; }}
              style={{ display: "inline-block", color: `rgba(255,255,255,${cfg.baseOpacity})`, willChange: "transform" }}
            >
              {letter}
            </span>
          ))}
        </div>
      )}

      <p className="text-karaoke-btn-text text-xs opacity-40">Double-click text to edit</p>

      <div className="flex gap-2">
        {(["slow", "normal", "fast"] as Speed[]).map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`px-5 py-2 rounded-full text-sm font-medium uppercase tracking-wider transition-all duration-300 ${
              speed === s
                ? "bg-karaoke-active text-karaoke-active-text"
                : "bg-karaoke-btn text-karaoke-btn-text hover:bg-karaoke-btn-hover"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className="text-karaoke-btn-text text-xs uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity"
      >
        {isPlaying ? "Pause" : "Play"}
      </button>
    </div>
  );
};

export default KaraokeText;
