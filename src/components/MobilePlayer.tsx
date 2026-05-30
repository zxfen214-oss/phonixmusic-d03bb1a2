import { useCallback, useEffect, useState } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { Volume2, List } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, PanInfo } from "framer-motion";
import lyricsIcon from "@/assets/lyrics-icon.png";
import LyricsBackground from "@/components/LyricsBackground";
import ApplePlayerControls from "@/components/ApplePlayerControls";
import { supabase } from "@/integrations/supabase/client";

import { preloadPlayerIcons, preloadArtwork } from "@/lib/preloadPlayerAssets";
import { cn } from "@/lib/utils";


interface MobilePlayerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLyrics: () => void;
}

// Background now uses the same AMLL MeshGradient as the lyrics tab.

export default function MobilePlayer({ isOpen, onClose, onOpenLyrics }: MobilePlayerProps) {
  const {
    currentTrack,
    hasLyrics,
  } = usePlayer();

  // Preload icons on mount and artwork when track changes
  useEffect(() => { preloadPlayerIcons(); }, []);
  useEffect(() => { preloadArtwork(currentTrack?.artwork); }, [currentTrack?.artwork]);

  // Defer mounting the heavy LyricsBackground (MeshGradient) until AFTER the
  // open slide animation finishes — mounting it synchronously was the main
  // cause of the open-stutter the user reported.
  const [bgMounted, setBgMounted] = useState(false);
  useEffect(() => {
    if (!isOpen) { setBgMounted(false); return; }
    const id = window.setTimeout(() => setBgMounted(true), 320);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  // Optional 9:16 phone-specific cover art — when set, replaces both the mesh
  // background and the album art square with a full-bleed image.
  const [phoneCover, setPhoneCover] = useState<string | null>(null);
  useEffect(() => {
    setPhoneCover(null);
    if (!currentTrack?.youtubeId && !currentTrack?.title) return;
    let cancelled = false;
    (async () => {
      try {
        let q = supabase.from("songs").select("phone_cover_url").limit(1);
        if (currentTrack.youtubeId) q = q.eq("youtube_id", currentTrack.youtubeId);
        else q = q.eq("title", currentTrack.title).eq("artist", currentTrack.artist);
        const { data } = await q;
        const url = (data?.[0] as any)?.phone_cover_url ?? null;
        if (!cancelled) setPhoneCover(url);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [currentTrack?.youtubeId, currentTrack?.title, currentTrack?.artist]);


  // Swipe-down to close
  const dragY = useMotionValue(0);

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
            {bgMounted && <LyricsBackground albumSrc={currentTrack.artwork} flowSpeed={2} />}
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
            <div className="flex-1 flex items-center justify-center mb-6">
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

            {/* Apple-style controls (title + progress + transport + volume) */}
            <div className="mb-5">
              <ApplePlayerControls />
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
