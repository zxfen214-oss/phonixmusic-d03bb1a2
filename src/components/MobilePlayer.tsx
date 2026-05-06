import { useState, useCallback, useEffect } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import MarqueeText from "@/components/MarqueeText";
import { Volume2, List, Disc3 } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, PanInfo } from "framer-motion";
import iconPlay from "@/assets/icon-play.png";
import iconPause from "@/assets/icon-pause.png";
import iconNext from "@/assets/icon-next.png";
import iconPrev from "@/assets/icon-prev.png";
import lyricsIcon from "@/assets/lyrics-icon.png";
import LyricsBackground from "@/components/LyricsBackground";

import { preloadPlayerIcons, preloadArtwork } from "@/lib/preloadPlayerAssets";
import { cn } from "@/lib/utils";

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

// Background now uses the same AMLL MeshGradient as the lyrics tab.

export default function MobilePlayer({ isOpen, onClose, onOpenLyrics }: MobilePlayerProps) {
  const {
    currentTrack,
    isPlaying,
    progress,
    volume,
    isLossless,
    hasLyrics,
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

  // Preload icons on mount and artwork when track changes
  useEffect(() => { preloadPlayerIcons(); }, []);
  useEffect(() => { preloadArtwork(currentTrack?.artwork); }, [currentTrack?.artwork]);

  // Swipe-down to close
  const dragY = useMotionValue(0);

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

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) {
      onClose();
    }
  };

  if (!currentTrack) return null;

  const currentTime = (progress / 100) * currentTrack.duration;
  const remaining = currentTrack.duration - currentTime;


  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="mobile-player"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "tween", duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.4}
          onDragEnd={handleDragEnd}
          style={{ y: dragY }}
          className="fixed inset-0 z-50 flex flex-col"
          /* safe area padding */
        >
          {/* AMLL MeshGradient background — matches the lyrics tab */}
          <div className="absolute inset-0 z-0" style={{ background: '#000' }}>
            <LyricsBackground albumSrc={currentTrack.artwork} flowSpeed={2} />
          </div>

          {/* Content */}
          <div
            className="relative z-10 flex flex-col flex-1 px-7"
            style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
          >
            {/* Drag handle / close */}
            <button onClick={onClose} className="flex items-center justify-center mb-4 w-full">
              <div className="w-10 h-1 rounded-full bg-white/30" />
            </button>

            {/* Album Art - 19:6 aspect ratio on mobile */}
            <div className="flex-1 flex items-center justify-center mb-4">
              <div
                className="w-full rounded-2xl overflow-hidden shadow-2xl"
                style={{ maxWidth: "340px", aspectRatio: "6 / 6.5" }}
              >
                <img
                  src={currentTrack.artwork || "/placeholder.svg"}
                  alt={currentTrack.album || currentTrack.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Track Info with Marquee */}
            <div className="mb-4">
              <MarqueeText text={currentTrack.title} className="text-lg font-semibold text-white leading-tight" />
              <p className="text-sm text-white/60 mt-0.5">{currentTrack.artist}</p>
            </div>

            {/* Progress Bar */}
            <div className="mb-4 px-1">
              <div className={`relative w-full rounded-full bg-white/20 overflow-visible transition-all duration-150 ${isDraggingProgress ? "h-2" : "h-1"}`}>
                <div className="absolute left-0 top-0 h-full rounded-full bg-white/90" style={{ width: `${progress}%` }} />
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
                <span>-{formatTime(remaining)}</span>
              </div>
            </div>

            {isLossless && (
              <div className="flex items-center justify-center mb-3">
                <LosslessBadge />
              </div>
            )}

            {/* Playback Controls - white icons */}
            <div className="flex items-center justify-center gap-10 mb-6">
              <button onClick={previousTrack} className="p-2 active:scale-90 transition-transform">
                <img src={iconPrev} alt="Previous" className="w-8 h-8 brightness-0 invert" />
              </button>
              <button onClick={handlePlayPause} className="p-2">
                <div
                  className="transition-all duration-[80ms] ease-in-out"
                  style={{ transform: isAnimating ? "scale(0)" : "scale(1)", opacity: isAnimating ? 0 : 1 }}
                >
                  <img src={displayPlaying ? iconPause : iconPlay} alt={displayPlaying ? "Pause" : "Play"} className="w-11 h-11 brightness-0 invert" />
                </div>
              </button>
              <button onClick={nextTrack} className="p-2 active:scale-90 transition-transform">
                <img src={iconNext} alt="Next" className="w-8 h-8 brightness-0 invert" />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 mb-5 px-1">
              <Volume2 className="w-4 h-4 text-white/40 flex-shrink-0" />
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

            {/* Bottom Actions - 3 icons aligned with playback controls */}
            <div className="flex items-center justify-between px-2">
              {/* Lyrics icon — aligned with back button (left) */}
              <button
                onClick={hasLyrics ? handleLyricsClick : undefined}
                disabled={!hasLyrics}
                className={cn("p-2", !hasLyrics && "cursor-not-allowed")}
                title={hasLyrics ? "Lyrics" : "No lyrics available"}
              >
                <img
                  src={lyricsIcon}
                  alt="Lyrics"
                  className="w-[22px] h-[22px] object-contain"
                  style={{
                    filter: hasLyrics ? 'brightness(0) invert(0.7)' : 'brightness(0) invert(0.4)',
                    opacity: hasLyrics ? 0.85 : 0.35,
                  }}
                />
              </button>

              {/* Speaker icon — aligned with play/pause (center) */}
              <button className="p-2" title="Speaker">
                <Volume2 className="w-[22px] h-[22px]" style={{ color: 'rgba(255,255,255,0.6)' }} />
              </button>

              {/* List icon — aligned with next button (right) */}
              <button className="p-2" title="Queue">
                <List className="w-[22px] h-[22px]" style={{ color: 'rgba(255,255,255,0.6)' }} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}