import { useState } from "react";
import { useLibrary } from "@/contexts/LibraryContext";
import { Track, Playlist } from "@/types/music";
import { Button } from "@/components/ui/button";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, Check, ListMusic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { savePlaylist } from "@/lib/database";

interface AddToPlaylistDialogProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
}

export function AddToPlaylistDialog({ track, isOpen, onClose }: AddToPlaylistDialogProps) {
  const { playlists, refreshLibrary } = useLibrary();
  const { toast } = useToast();
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const handleAddToPlaylist = async (playlist: Playlist) => {
    // Check if track already in playlist
    if (playlist.tracks.some(t => t.id === track.id)) {
      toast({
        title: "Already added",
        description: `"${track.title}" is already in "${playlist.name}".`,
      });
      return;
    }

    setAddingTo(playlist.id);

    try {
      const updatedPlaylist: Playlist = {
        ...playlist,
        tracks: [...playlist.tracks, track],
        updatedAt: new Date(),
      };

      await savePlaylist(updatedPlaylist);
      await refreshLibrary();

      toast({
        title: "Added to playlist!",
        description: `"${track.title}" has been added to "${playlist.name}".`,
      });

      onClose();
    } catch (error) {
      console.error("Error adding to playlist:", error);
      toast({
        title: "Failed to add to playlist",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAddingTo(null);
    }
  };

  const isTrackInPlaylist = (playlist: Playlist) => {
    return playlist.tracks.some(t => t.id === track.id);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListMusic className="h-5 w-5 text-accent" />
            Add to Playlist
          </DialogTitle>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4 pt-2"
        >
          {/* Track Info */}
          <div className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
            <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
              <img
                src={track.artwork || "/placeholder.svg"}
                alt={track.album}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{track.title}</p>
              <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
            </div>
          </div>

          {/* Playlist List */}
          {playlists.length === 0 ? (
            <div className="text-center py-8">
              <ListMusic className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">No playlists yet</p>
              <p className="text-sm text-muted-foreground">Create a playlist first to add songs</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] -mx-2 px-2">
              <div className="space-y-2">
                {playlists.map((playlist) => {
                  const isInPlaylist = isTrackInPlaylist(playlist);
                  const isAdding = addingTo === playlist.id;
                  
                  return (
                    <button
                      key={playlist.id}
                      onClick={() => !isInPlaylist && handleAddToPlaylist(playlist)}
                      disabled={isAdding || isInPlaylist}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                        isInPlaylist 
                          ? "bg-accent/10 cursor-default" 
                          : "bg-secondary hover:bg-secondary/80 cursor-pointer"
                      )}
                    >
                      {/* Playlist Artwork */}
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        {playlist.tracks[0]?.artwork ? (
                          <img
                            src={playlist.tracks[0].artwork}
                            alt={playlist.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ListMusic className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      
                      {/* Playlist Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{playlist.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {playlist.tracks.length} {playlist.tracks.length === 1 ? "track" : "tracks"}
                        </p>
                      </div>
                      
                      {/* Status Icon */}
                      <div className="flex-shrink-0">
                        {isAdding ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : isInPlaylist ? (
                          <Check className="h-5 w-5 text-accent" />
                        ) : (
                          <Plus className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
