import { Home, Library, ListMusic, Search, Settings, Download, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

interface MobileNavProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function MobileNav({ activeView, onViewChange }: MobileNavProps) {
  const { canInstall, install } = useInstallPrompt();
  
  const navItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "library", label: "Library", icon: Library },
    { id: "playlists", label: "Playlists", icon: ListMusic },
    { id: "leaderboard", label: "Top", icon: Trophy },
    { id: "youtube", label: "Search", icon: Search },
    ...(canInstall
      ? [{ id: "_install", label: "Install", icon: Download }]
      : [{ id: "settings", label: "Settings", icon: Settings }]),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-lg safe-area-bottom md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => item.id === "_install" ? install() : onViewChange(item.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 min-w-[64px]",
                isActive 
                  ? "text-accent" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <item.icon className={cn("h-5 w-5 transition-transform", isActive && "scale-110")} />
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </div>
              <span className={cn(
                "text-[10px] font-medium transition-all",
                isActive ? "opacity-100" : "opacity-70"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
