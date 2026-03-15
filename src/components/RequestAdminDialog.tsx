import { useState } from "react";
import { Track } from "@/types/music";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Send, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface RequestAdminDialogProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
}

export function RequestAdminDialog({ track, isOpen, onClose }: RequestAdminDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    setIsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("request-admin-change", {
        body: {
          songTitle: track.title,
          songArtist: track.artist,
          songAlbum: track.album,
          songDuration: track.duration,
          youtubeId: track.youtubeId,
          userEmail: user?.email,
          userName: user?.user_metadata?.display_name || user?.email?.split("@")[0],
          message: message.trim() || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Request sent!",
        description: "The admin will review your request soon.",
      });

      setMessage("");
      onClose();
    } catch (error) {
      console.error("Error sending request:", error);
      toast({
        title: "Failed to send request",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-accent" />
            Request Admin Change
          </DialogTitle>
          <DialogDescription>
            Send a request to the admin to update this song's information, lyrics, or cover art.
          </DialogDescription>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4 pt-2"
        >
          {/* Song Info */}
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

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Your request (optional)</Label>
            <Textarea
              id="message"
              placeholder="Describe what you'd like to change... (e.g., wrong lyrics, incorrect artist name, missing cover art)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[100px] resize-none"
            />
          </div>

          <Button onClick={handleSend} disabled={isSending} className="w-full gap-2">
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isSending ? "Sending..." : "Send Request"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Your email and request will be sent to the admin for review.
          </p>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
