import { useState } from "react";
import { useLibrary } from "@/contexts/LibraryContext";
import { Playlist } from "@/types/music";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, ListMusic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface CreatePlaylistDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePlaylistDialog({ isOpen, onClose }: CreatePlaylistDialogProps) {
  const { addPlaylist } = useLibrary();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a playlist name.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      const playlist: Playlist = {
        id: `playlist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: name.trim(),
        description: description.trim() || undefined,
        tracks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await addPlaylist(playlist);

      toast({
        title: "Playlist created!",
        description: `"${name}" has been created.`,
      });

      setName("");
      setDescription("");
      onClose();
    } catch (error) {
      console.error("Error creating playlist:", error);
      toast({
        title: "Failed to create playlist",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListMusic className="h-5 w-5 text-accent" />
            Create Playlist
          </DialogTitle>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4 pt-2"
        >
          <div className="space-y-2">
            <Label htmlFor="playlist-name">Name</Label>
            <Input
              id="playlist-name"
              placeholder="My Playlist"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="playlist-description">Description (optional)</Label>
            <Textarea
              id="playlist-description"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </div>

          <Button onClick={handleCreate} disabled={isCreating} className="w-full gap-2">
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {isCreating ? "Creating..." : "Create Playlist"}
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
