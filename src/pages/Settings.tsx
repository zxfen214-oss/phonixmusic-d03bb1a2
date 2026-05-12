import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { PageTransition, FadeIn, StaggerContainer, StaggerItem } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { OfflineDownloadsSection } from "@/components/OfflineDownloadsSection";
import { OfflineLibraryDownloadCard } from "@/components/OfflineLibraryDownloadCard";
import { 
  ArrowLeft, 
  Sun, 
  Moon,
  User,
  Shield,
  LogOut,
  Palette,
  Volume2,
  Bell,
  Info,
  Eye
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SettingsProps {
  embedded?: boolean;
}

export default function Settings({ embedded = false }: SettingsProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, isAdmin, signOut } = useAuth();

  const [lyricsBlurEnabled, setLyricsBlurEnabled] = useState(() => {
    const saved = localStorage.getItem('lyrics-blur-enabled');
    return saved !== null ? saved === 'true' : true; // enabled by default
  });

  useEffect(() => {
    localStorage.setItem('lyrics-blur-enabled', String(lyricsBlurEnabled));
  }, [lyricsBlurEnabled]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  return (
    <PageTransition className={cn("bg-background", embedded ? "h-full overflow-y-auto overscroll-contain" : "min-h-screen overflow-y-auto")}>
      <div className={cn(
        "mx-auto max-w-2xl",
        embedded ? "px-4 md:px-6 py-6 pb-40" : "container px-4 py-8 pb-32"
      )}>
        <FadeIn>
          <div className="flex items-center gap-4 mb-8">
            {!embedded && (
              <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/" })}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
              <p className="text-muted-foreground text-sm md:text-base">Customize your experience</p>
            </div>
          </div>
        </FadeIn>

        <StaggerContainer className="space-y-6">
          {/* Account Section */}
          <StaggerItem>
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="p-6 rounded-xl border border-border bg-card"
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-accent" />
                Account
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{user?.email}</p>
                    <p className="text-sm text-muted-foreground">Your email address</p>
                  </div>
                  {isAdmin && (
                    <span className="flex items-center gap-1 text-xs bg-accent/20 text-accent px-3 py-1 rounded-full">
                      <Shield className="h-3 w-3" />
                      Admin
                    </span>
                  )}
                </div>
                
                {isAdmin && (
                  <Button 
                    variant="outline" 
                    onClick={() => navigate({ to: "/admin" })}
                    className="w-full gap-2"
                  >
                    <Shield className="h-4 w-4" />
                    Open Admin Panel
                  </Button>
                )}

                <Button 
                  variant="destructive" 
                  onClick={handleSignOut}
                  className="w-full gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </motion.div>
          </StaggerItem>

          {/* Appearance Section */}
          <StaggerItem>
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="p-6 rounded-xl border border-border bg-card"
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Palette className="h-5 w-5 text-accent" />
                Appearance
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {theme === "dark" ? (
                      <Moon className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Sun className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <Label htmlFor="dark-mode">Dark Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        {theme === "dark" ? "Currently using dark theme" : "Currently using light theme"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="dark-mode"
                    checked={theme === "dark"}
                    onCheckedChange={toggleTheme}
                  />
                </div>
              </div>
            </motion.div>
          </StaggerItem>

          {/* Lyrics Section */}
          <StaggerItem>
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="p-6 rounded-xl border border-border bg-card"
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Eye className="h-5 w-5 text-accent" />
                Lyrics
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="lyrics-blur">Line Blur Effect</Label>
                    <p className="text-sm text-muted-foreground">
                      Blur non-active lyrics lines for focus
                    </p>
                  </div>
                  <Switch
                    id="lyrics-blur"
                    checked={lyricsBlurEnabled}
                    onCheckedChange={setLyricsBlurEnabled}
                  />
                </div>
              </div>
            </motion.div>
          </StaggerItem>

          {/* Playback Section */}
          <StaggerItem>
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="p-6 rounded-xl border border-border bg-card"
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-accent" />
                Playback
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="autoplay">Autoplay</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically play next track
                    </p>
                  </div>
                  <Switch id="autoplay" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="crossfade">Crossfade</Label>
                    <p className="text-sm text-muted-foreground">
                      Smooth transition between tracks
                    </p>
                  </div>
                  <Switch id="crossfade" />
                </div>
              </div>
            </motion.div>
          </StaggerItem>

          {/* Notifications Section */}
          <StaggerItem>
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="p-6 rounded-xl border border-border bg-card"
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Bell className="h-5 w-5 text-accent" />
                Notifications
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="now-playing">Now Playing</Label>
                    <p className="text-sm text-muted-foreground">
                      Show notifications when track changes
                    </p>
                  </div>
                  <Switch id="now-playing" />
                </div>
              </div>
            </motion.div>
          </StaggerItem>

          {/* Offline Downloads Section */}
          <StaggerItem>
            <OfflineLibraryDownloadCard />
          </StaggerItem>

          <StaggerItem>
            <OfflineDownloadsSection />
          </StaggerItem>

          {/* About Section */}
          <StaggerItem>
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="p-6 rounded-xl border border-border bg-card"
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Info className="h-5 w-5 text-accent" />
                About
              </h2>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong className="text-foreground">PhonixMusic</strong> v1.0.0</p>
                <p>Your personal music player with YouTube integration and synced lyrics.</p>
                <p className="pt-2">Made with ❤️</p>
              </div>
            </motion.div>
          </StaggerItem>
        </StaggerContainer>
      </div>
    </PageTransition>
  );
}
