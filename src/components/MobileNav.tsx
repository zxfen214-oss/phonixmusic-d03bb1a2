import { Home, Library, ListMusic, Search, Settings, Download } from "lucide-react";
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
    { id: "youtube", label: "Search", icon: Search },
    ...(canInstall
      ? [{ id: "_install", label: "Install", icon: Download }]
      : [{ id: "settings", label: "Settings", icon: Settings }]),
  ];

  return (
    <nav
      className="fixed left-3 right-3 z-40 rounded-full border border-white/15 bg-background/40 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_8px_32px_rgba(0,0,0,0.35)] md:hidden"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => item.id === "_install" ? install() : onViewChange(item.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-full transition-all duration-200 min-w-[56px]",
                isActive
                  ? "text-accent bg-white/10 backdrop-blur-xl"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
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
