import { useState } from "react";
import { Playlist } from "@/types/music";
import { usePlayer } from "@/contexts/PlayerContext";
import { useLibrary } from "@/contexts/LibraryContext";
import { Play, MoreHorizontal, Trash2, ListMusic } from "lucide-react";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface PlaylistCardProps {
  playlist: Playlist;
}

export function PlaylistCard({ playlist }: PlaylistCardProps) {
  const { playTrack } = usePlayer();
  const { removePlaylist } = useLibrary();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const firstTrackArtwork = playlist.tracks[0]?.artwork;
  const trackCount = playlist.tracks.length;

  const handlePlay = () => {
    if (playlist.tracks.length > 0) {
      playTrack(playlist.tracks[0], playlist.tracks);
    }
  };

  const handleDelete = async () => {
    try {
      await removePlaylist(playlist.id);
      toast({
        title: "Playlist deleted",
        description: `"${playlist.name}" has been removed.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete playlist.",
        variant: "destructive",
      });
    }
    setShowDeleteDialog(false);
  };

  return (
    <>
      <motion.div 
        className="group relative cursor-pointer"
        whileHover={{ scale: 1.02, y: -4 }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Artwork */}
        <div className="relative mb-3" onClick={handlePlay}>
          <div className="aspect-square w-full rounded-xl overflow-hidden bg-secondary">
            {firstTrackArtwork ? (
              <img
                src={firstTrackArtwork}
                alt={playlist.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5">
                <ListMusic className="h-12 w-12 text-muted-foreground/50" />
              </div>
            )}
          </div>
          
          {/* Play Button Overlay */}
          {playlist.tracks.length > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              whileHover={{ scale: 1.1 }}
              onClick={(e) => {
                e.stopPropagation();
                handlePlay();
              }}
              className="absolute bottom-2 right-2 h-10 w-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg"
            >
              <Play className="h-5 w-5 ml-0.5" />
            </motion.button>
          )}
        </div>

        {/* Info */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0" onClick={handlePlay}>
            <h3 className="font-medium truncate text-sm">{playlist.name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {trackCount} {trackCount === 1 ? "track" : "tracks"}
            </p>
          </div>
          
          {/* More Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="icon-button h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem 
                onClick={() => setShowDeleteDialog(true)} 
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{playlist.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The playlist will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
