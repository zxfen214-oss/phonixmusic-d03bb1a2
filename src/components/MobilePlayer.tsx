import { useState, useCallback, useEffect } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import MarqueeText from "@/components/MarqueeText";
import { Volume1, Volume2, Disc3 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import iconPlay from "@/assets/icon-play.png";
import iconPause from "@/assets/icon-pause.png";
import iconNext from "@/assets/icon-next.png";
import iconPrev from "@/assets/icon-prev.png";
import lyricsIcon from "@/assets/lyrics-icon.png";

interface MobilePlayerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLyrics: () => void;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export default function MobilePlayer({ isOpen, onClose, onOpenLyrics }: MobilePlayerProps) {
  const {
    currentTrack,
    isPlaying,
    progress,
    volume,
    isLossless,
    pauseTrack,
    resumeTrack,
    nextTrack,
    previousTrack,
    seekTo,
    setVolume,
  } = usePlayer();

  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayPlaying, setDisplayPlaying] = useState(isPlaying);

  useEffect(() => {
    if (!isAnimating) setDisplayPlaying(isPlaying);
  }, [isPlaying, isAnimating]);

  const handleProgressChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!currentTrack) return;
      const val = Number(e.target.value);
      seekTo((val / currentTrack.duration) * 100);
    },
    [currentTrack, seekTo]
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(Number(e.target.value));
    },
    [setVolume]
  );

  const handlePlayPause = useCallback(() => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      if (isPlaying) pauseTrack();
      else resumeTrack();
      setDisplayPlaying(!isPlaying);
      setTimeout(() => setIsAnimating(false), 80);
    }, 80);
  }, [isAnimating, isPlaying, pauseTrack, resumeTrack]);

  const handleLyricsClick = useCallback(() => {
    onClose();
    setTimeout(onOpenLyrics, 150);
  }, [onClose, onOpenLyrics]);

  if (!currentTrack || !isOpen) return null;

  const currentTime = (progress / 100) * currentTrack.duration;
  const remaining = currentTrack.duration - currentTime;

  return (
    <AnimatePresence>
      <motion.div
        key="mobile-player"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-0 z-50 flex flex-col"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Blurred background */}
        <div className="absolute inset-0 z-0">
          <img
            src={currentTrack.artwork || "/placeholder.svg"}
            alt=""
            className="w-full h-full object-cover scale-150 blur-[80px] opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/70" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col flex-1 px-7 pt-4 pb-8">
          {/* Drag handle / close */}
          <button onClick={onClose} className="flex items-center justify-center mb-6 w-full">
            <div className="w-10 h-1 rounded-full bg-white/30" />
          </button>

          {/* Album Art */}
          <div className="flex-1 flex items-center justify-center mb-6">
            <div className="w-full aspect-square rounded-xl overflow-hidden shadow-2xl" style={{ maxWidth: "340px" }}>
              <img
                src={currentTrack.artwork || "/placeholder.svg"}
                alt={currentTrack.album || currentTrack.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Track Info with Marquee */}
          <div className="mb-5">
            <MarqueeText text={currentTrack.title} className="text-lg font-semibold text-white leading-tight" />
            <p className="text-sm text-white/60 mt-0.5">{currentTrack.artist}</p>
          </div>

          {/* Progress Bar */}
          <div className="mb-5 px-1">
            <div className={`relative w-full rounded-full bg-white/20 overflow-visible transition-all duration-150 ${isDraggingProgress ? "h-2" : "h-1"}`}>
              <div className="absolute left-0 top-0 h-full rounded-full bg-white/70" style={{ width: `${progress}%` }} />
              <input
                type="range"
                min={0}
                max={currentTrack.duration}
                value={currentTime}
                onChange={handleProgressChange}
                onTouchStart={() => setIsDraggingProgress(true)}
                onTouchEnd={() => setIsDraggingProgress(false)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <div className="flex justify-between mt-2 text-[11px] font-medium text-white/50 tracking-wide">
              <span>{formatTime(currentTime)}</span>
              {isLossless && (
                <span className="flex items-center gap-1">
                  <Disc3 className="w-3 h-3 text-white/50" />
                  Lossless
                </span>
              )}
              <span>-{formatTime(remaining)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-10 mb-8">
            <button onClick={previousTrack} className="p-2 active:scale-90 transition-transform">
              <img src={iconPrev} alt="Previous" className="w-8 h-8 invert" />
            </button>
            <button onClick={handlePlayPause} className="p-2">
              <div
                className="transition-all duration-[80ms] ease-in-out"
                style={{ transform: isAnimating ? "scale(0)" : "scale(1)", opacity: isAnimating ? 0 : 1 }}
              >
                <img src={displayPlaying ? iconPause : iconPlay} alt={displayPlaying ? "Pause" : "Play"} className="w-11 h-11 invert" />
              </div>
            </button>
            <button onClick={nextTrack} className="p-2 active:scale-90 transition-transform">
              <img src={iconNext} alt="Next" className="w-8 h-8 invert" />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 mb-6 px-1">
            <Volume1 className="w-4 h-4 text-white/40 flex-shrink-0" />
            <div className={`relative w-full rounded-full bg-white/20 transition-all duration-150 ${isDraggingVolume ? "h-2" : "h-1"}`}>
              <div className="absolute left-0 top-0 h-full rounded-full bg-white/70" style={{ width: `${volume}%` }} />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={handleVolumeChange}
                onTouchStart={() => setIsDraggingVolume(true)}
                onTouchEnd={() => setIsDraggingVolume(false)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <Volume2 className="w-4 h-4 text-white/40 flex-shrink-0" />
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-center">
            <button onClick={handleLyricsClick} className="p-2">
              <img src={lyricsIcon} alt="Lyrics" className="w-[22px] h-[22px] object-contain invert opacity-80" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
