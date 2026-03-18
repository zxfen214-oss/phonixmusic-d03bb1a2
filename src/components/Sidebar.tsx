import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { FileImportDialog } from "./FileImportDialog";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { 
  Home,
  Library, 
  ListMusic, 
  Search, 
  Settings, 
  Sun, 
  Moon,
  Plus,
  LogOut,
  User,
  Shield,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, isAdmin, signOut } = useAuth();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const { canInstall, install } = useInstallPrompt();
  const navigate = useNavigate();

  const navItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "library", label: "Library", icon: Library },
    { id: "playlists", label: "Playlists", icon: ListMusic },
    { id: "youtube", label: "Search", icon: Search },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <>
      <aside className="hidden md:flex h-full w-64 flex-col border-r border-border bg-sidebar">
        {/* Logo */}
        <div className="flex h-16 items-center px-6">
          <Logo size="md" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item, index) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "nav-item w-full transition-all duration-200",
                activeView === item.id && "active"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </motion.button>
          ))}

          {/* Add Local Files */}
          <motion.button 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            onClick={() => setShowImportDialog(true)}
            className="nav-item w-full mt-6 text-accent"
          >
            <Plus className="h-5 w-5" />
            <span>Add Local Files</span>
          </motion.button>

          {/* Admin Link */}
          {isAdmin && (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              onClick={() => navigate("/admin")}
              className="nav-item w-full text-accent"
            >
              <Shield className="h-5 w-5" />
              <span>Admin Panel</span>
            </motion.button>
          )}
        </nav>

        {/* User Section */}
        <div className="border-t border-border p-3 space-y-2">
          {/* User Info */}
          {user && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-3 px-3 py-2"
            >
              <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center">
                <User className="h-4 w-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.email}</p>
                {isAdmin && (
                  <div className="flex items-center gap-1 text-xs text-accent">
                    <Shield className="h-3 w-3" />
                    <span>Admin</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <button
            onClick={toggleTheme}
            className="nav-item w-full"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>

          <button 
            onClick={() => navigate("/settings")}
            className="nav-item w-full"
          >
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </button>

          <button 
            onClick={handleSignOut}
            className="nav-item w-full text-destructive hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <FileImportDialog 
        isOpen={showImportDialog} 
        onClose={() => setShowImportDialog(false)} 
      />
    </>
  );
}
