import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { PlayerBar } from "@/components/PlayerBar";
import { HomeView } from "@/components/HomeView";
import { LibraryView } from "@/components/LibraryView";
import { PlaylistsView } from "@/components/PlaylistsView";
import { LeaderboardView } from "@/components/LeaderboardView";
import { YouTubeView } from "@/components/YouTubeView";
import { LyricsView } from "@/components/LyricsView";
import MobilePlayer from "@/components/MobilePlayer";
import { PlayerProvider, usePlayer } from "@/contexts/PlayerContext";
import { LibraryProvider } from "@/contexts/LibraryContext";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import Settings from "@/pages/Settings";

function AppContent() {
  const [activeView, setActiveView] = useState("home");
  const [showLyrics, setShowLyrics] = useState(false);
  const [showMobilePlayer, setShowMobilePlayer] = useState(false);
  const { currentTrack } = usePlayer();
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-screen w-full items-center justify-center bg-background"
      >
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </motion.div>
    );
  }

  if (!user) {
    return null;
  }

  const renderView = () => {
    switch (activeView) {
      case "home":
        return <HomeView key="home" />;
      case "library":
        return <LibraryView key="library" />;
      case "playlists":
        return <PlaylistsView key="playlists" />;
      case "leaderboard":
        return <LeaderboardView key="leaderboard" />;
      case "youtube":
        return <YouTubeView key="youtube" />;
      case "settings":
        return <Settings key="settings" embedded />;
      default:
        return <HomeView key="home" />;
    }
  };

  const handleOpenLyrics = () => {
    if (currentTrack) {
      setShowMobilePlayer(false);
      setShowLyrics(true);
    }
  };

  const handleOpenMobilePlayer = () => {
    if (currentTrack) {
      setShowMobilePlayer(true);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex h-screen w-full overflow-hidden bg-background pt-[env(safe-area-inset-top)]"
    >
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div 
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="flex-1 overflow-hidden"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
        <PlayerBar onOpenLyrics={handleOpenLyrics} onOpenMobilePlayer={handleOpenMobilePlayer} />
      </div>
      <MobileNav activeView={activeView} onViewChange={setActiveView} />
      <MobilePlayer
        isOpen={showMobilePlayer}
        onClose={() => setShowMobilePlayer(false)}
        onOpenLyrics={handleOpenLyrics}
      />
      <AnimatePresence>
        {showLyrics && currentTrack && (
          <LyricsView onClose={() => setShowLyrics(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Index() {
  return (
    <PlayerProvider>
      <LibraryProvider>
        <AppContent />
      </LibraryProvider>
    </PlayerProvider>
  );
}
