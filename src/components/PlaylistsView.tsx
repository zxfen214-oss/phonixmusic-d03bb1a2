import { useState } from "react";
import { useLibrary } from "@/contexts/LibraryContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { PlaylistCard } from "./PlaylistCard";
import { CreatePlaylistDialog } from "./CreatePlaylistDialog";
import { Plus, ListMusic } from "lucide-react";
import { motion } from "framer-motion";

export function PlaylistsView() {
  const { playlists } = useLibrary();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        className="px-4 md:px-8 py-6 border-b border-border flex items-center justify-between"
      >
        <h1 className="text-2xl md:text-3xl font-semibold">Playlists</h1>
        <button 
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent text-accent-foreground font-medium text-sm transition-all hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New Playlist
        </button>
      </motion.div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        {playlists.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-center justify-center h-64 text-center"
          >
            <ListMusic className="h-16 w-16 mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground text-lg">No playlists yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create your first playlist to organize your music
            </p>
            <button 
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent text-accent-foreground font-medium text-sm transition-all hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Create Playlist
            </button>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6"
          >
            {playlists.map((playlist, idx) => (
              <motion.div
                key={playlist.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
              >
                <PlaylistCard playlist={playlist} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Create Playlist Dialog */}
      <CreatePlaylistDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </motion.div>
  );
}
