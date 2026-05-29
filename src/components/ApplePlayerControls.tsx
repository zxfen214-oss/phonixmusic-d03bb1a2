import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Star, MoreHorizontal, Volume2 } from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import { LosslessBadge } from "./LosslessBadge";
import iconPlay from "@/assets/icon-play.png";
import iconPause from "@/assets/icon-pause.png";
import iconNext from "@/assets/icon-next.png";
import iconPrev from "@/assets/icon-prev.png";

const LYRIC_FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface Props {
  /** Hide the title/artist row (when caller already shows it elsewhere). */
  hideTitle?: boolean;
  /** Optional click handler for the "more" (…) button. */
  onMore?: () => void;
  /** Optional custom render for the More button (replaces default). */
  
  renderMore?: () => React.ReactNode;
  /** Optional click handler for the star (favorite) button. */
  onFavorite?: () => void;
  /** Whether favorite is currently on. */
  isFavorite?: boolean;
  /** Fires whenever the user interacts — used by mobile lyrics overlay to reset auto-hide. */
  onInteract?: () => void;
  /** Max width of the controls block. */
  maxWidth?: number | string;
  /** Compact mode: slightly smaller paddings (for desktop sidebar). */
  compact?: boolean;
  /** Force text alignment for title row. */
  align?: "left" | "center";
}

export default function ApplePlayerControls({
  hideTitle = false,
  onMore,
  renderMore,
  onFavorite,
  isFavorite = false,
  onInteract,
  maxWidth = "100%",
  compact = false,
  align = "left",
}: Props) {
  const {
    currentTrack,
    isPlaying,
    progress,
    volume,
    isLossless,
    audioFormat,
    pauseTrack,
    resumeTrack,
    nextTrack,
    previousTrack,
    seekTo,
    setVolume,
  } = usePlayer();

  const [draggingProgress, setDraggingProgress] = useState(false);
  const [draggingVolume, setDraggingVolume] = useState(false);
  const [hoverProgress, setHoverProgress] = useState(false);
  const [hoverVolume, setHoverVolume] = useState(false);

  const touch = useCallback(() => onInteract?.(), [onInteract]);

  if (!currentTrack) return null;

  const currentTime = (progress / 100) * currentTrack.duration;
  const remaining = Math.max(0, currentTrack.duration - currentTime);
  const badge = audioFormat || (isLossless ? "lossless" : null);

  return (
    <div style={{ width: "100%", maxWidth, marginLeft: "auto", marginRight: "auto" }}>
      {/* Title row */}
      {!hideTitle && (
        <div
          className="flex items-start gap-3"
          style={{ marginBottom: compact ? 14 : 18 }}
        >
          <div className="min-w-0 flex-1" style={{ textAlign: align }}>
            <p
              className="truncate text-white"
              style={{ fontFamily: LYRIC_FONT, fontSize: compact ? 20 : 22, fontWeight: 700, letterSpacing: "-0.01em" }}
            >
              {currentTrack.title}
            </p>
            <p
              className="truncate"
              style={{ fontFamily: LYRIC_FONT, fontSize: compact ? 15 : 17, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginTop: 1 }}
            >
              {currentTrack.artist}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0" style={{ marginTop: 4 }}>
            <button
              onClick={(e) => { e.stopPropagation(); touch(); onFavorite?.(); }}
              className="rounded-full flex items-center justify-center transition-colors"
              style={{
                width: 34, height: 34,
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(10px)",
              }}
              aria-label="Favorite"
            >
              <Star
                className="h-4 w-4"
                style={{
                  color: isFavorite ? "#fff" : "rgba(255,255,255,0.85)",
                  fill: isFavorite ? "#fff" : "transparent",
                }}
              />
            </button>
            {renderMore ? (
  renderMore()
) : (
  <button
    onClick={(e) => {
      e.stopPropagation();
      touch();
      onMore?.();
    }}
    className="rounded-full flex items-center justify-center transition-colors"
    style={{
      width: 34,
      height: 34,
      background: "rgba(255,255,255,0.12)",
      backdropFilter: "blur(10px)",
    }}
    aria-label="More"
  >
    <MoreHorizontal
      className="h-4 w-4"
      style={{ color: "rgba(255,255,255,0.85)" }}
    />
  </button>
            )}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ marginBottom: 6 }}>
        <div
          onMouseEnter={() => setHoverProgress(true)}
          onMouseLeave={() => setHoverProgress(false)}
          className={`relative w-full rounded-full bg-white/20 transition-all duration-200 ${
            draggingProgress ? "h-[10px]" : hoverProgress ? "h-[8px]" : "h-[4px]"
          }`}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-white/90"
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(1, currentTrack.duration)}
            step={0.1}
            value={currentTime}
            onChange={(e) => { touch(); seekTo((Number(e.target.value) / currentTrack.duration) * 100); }}
            onPointerDown={() => { touch(); setDraggingProgress(true); }}
            onPointerUp={() => setDraggingProgress(false)}
            onPointerCancel={() => setDraggingProgress(false)}
            onTouchStart={() => { touch(); setDraggingProgress(true); }}
            onTouchEnd={() => setDraggingProgress(false)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <div
          className="flex justify-between"
          style={{ marginTop: 6, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.5)", letterSpacing: 0.2 }}
        >
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(remaining)}</span>
        </div>
      </div>

      {/* Transport */}
      <div
        className="relative flex items-center justify-center"
        style={{ gap: compact ? 36 : 44, marginTop: compact ? 14 : 18, marginBottom: compact ? 8 : 10 }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); touch(); previousTrack(); }}
          className="p-1 active:scale-90 transition-transform"
          aria-label="Previous"
        >
          <img src={iconPrev} alt="" className={compact ? "h-7 w-7 brightness-0 invert" : "h-9 w-9 brightness-0 invert"} />
        </button>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={(e) => { e.stopPropagation(); touch(); isPlaying ? pauseTrack() : resumeTrack(); }}
          className="p-1"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          <img
            src={isPlaying ? iconPause : iconPlay}
            alt=""
            className={compact ? "h-11 w-11 brightness-0 invert" : "h-14 w-14 brightness-0 invert"}
          />
        </motion.button>
        <button
          onClick={(e) => { e.stopPropagation(); touch(); nextTrack(); }}
          className="p-1 active:scale-90 transition-transform"
          aria-label="Next"
        >
          <img src={iconNext} alt="" className={compact ? "h-7 w-7 brightness-0 invert" : "h-9 w-9 brightness-0 invert"} />
        </button>
      </div>

      {/* Lossless / Dolby badge — sits just below the playback controls */}
      {badge && (
        <div
          className="flex justify-center"
          style={{ marginBottom: compact ? 10 : 14 }}
        >
          <LosslessBadge format={badge as "lossless" | "dolby"} />
        </div>
      )}



      {/* Volume */}
      <div className="flex items-center" style={{ gap: 10 }}>
        <Volume2 className="flex-shrink-0" style={{ width: 13, height: 13, color: "rgba(255,255,255,0.45)" }} />
        <div
          onMouseEnter={() => setHoverVolume(true)}
          onMouseLeave={() => setHoverVolume(false)}
          className={`relative flex-1 rounded-full bg-white/20 transition-all duration-200 ${
            draggingVolume ? "h-[10px]" : hoverVolume ? "h-[8px]" : "h-[4px]"
          }`}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-white/75"
            style={{ width: `${volume}%` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => { touch(); setVolume(Number(e.target.value)); }}
            onPointerDown={() => { touch(); setDraggingVolume(true); }}
            onPointerUp={() => setDraggingVolume(false)}
            onPointerCancel={() => setDraggingVolume(false)}
            onTouchStart={() => { touch(); setDraggingVolume(true); }}
            onTouchEnd={() => setDraggingVolume(false)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <Volume2 className="flex-shrink-0" style={{ width: 18, height: 18, color: "rgba(255,255,255,0.55)" }} />
      </div>
    </div>
  );
}
