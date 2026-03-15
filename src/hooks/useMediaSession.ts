import { useEffect } from "react";
import { Track } from "@/types/music";

interface UseMediaSessionOptions {
  track: Track | null;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
}

export function useMediaSession({
  track,
  isPlaying,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSeekBackward,
  onSeekForward,
}: UseMediaSessionOptions) {
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    // Update metadata when track changes
    if (track) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || "",
        artwork: track.artwork
          ? [
              { src: track.artwork, sizes: "96x96", type: "image/jpeg" },
              { src: track.artwork, sizes: "128x128", type: "image/jpeg" },
              { src: track.artwork, sizes: "192x192", type: "image/jpeg" },
              { src: track.artwork, sizes: "256x256", type: "image/jpeg" },
              { src: track.artwork, sizes: "384x384", type: "image/jpeg" },
              { src: track.artwork, sizes: "512x512", type: "image/jpeg" },
            ]
          : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }
  }, [track?.id, track?.title, track?.artist, track?.album, track?.artwork]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    // Update playback state
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    // Set up action handlers
    navigator.mediaSession.setActionHandler("play", () => {
      onPlay();
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      onPause();
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      onPrevious();
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      onNext();
    });

    if (onSeekBackward) {
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        onSeekBackward();
      });
    }

    if (onSeekForward) {
      navigator.mediaSession.setActionHandler("seekforward", () => {
        onSeekForward();
      });
    }

    // Cleanup
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    };
  }, [onPlay, onPause, onPrevious, onNext, onSeekBackward, onSeekForward]);

  // Update position state for seek bar on lock screen
  const updatePositionState = (duration: number, currentTime: number, playbackRate = 1) => {
    if (!("mediaSession" in navigator)) return;
    if (!duration || isNaN(duration)) return;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position: Math.min(currentTime, duration),
      });
    } catch (e) {
      // Position state not supported or invalid values
      console.warn("Failed to update media session position state:", e);
    }
  };

  return { updatePositionState };
}
