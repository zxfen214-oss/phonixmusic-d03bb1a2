import { Track } from "@/types/music";
import { usePlayer } from "@/contexts/PlayerContext";
import { useAuth } from "@/contexts/AuthContext";
import { Play, Pause, MoreHorizontal, Youtube, Pencil, Trash2, Shield, MessageSquare, ListPlus, WifiOff, FileDown, Disc3 } from "lucide-react";
import { useView } from "@/contexts/ViewContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { buildELrc, downloadELrcFile, safeFilename } from "@/lib/exportELrc";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { MetadataEditor } from "./MetadataEditor";
import { AdminSongEditor } from "./AdminSongEditor";
import { RequestAdminDialog } from "./RequestAdminDialog";
import { AddToPlaylistDialog } from "./AddToPlaylistDialog";
import { DownloadButton } from "./DownloadButton";
import { ELrcOffsetDialog } from "./ELrcOffsetDialog";
import { useLibrary } from "@/contexts/LibraryContext";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TrackRowProps {
  track: Track;
  index: number;
  tracks: Track[];
  isOffline?: boolean;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TrackRow({ track, index, tracks, isOffline }: TrackRowProps) {
  const { currentTrack, isPlaying, playTrack, pauseTrack, resumeTrack } = usePlayer();
  const { removeTrack, updateTrackMetadata } = useLibrary();
  const { isAdmin } = useAuth();
  const { openAlbum } = useView();
  const [showEditor, setShowEditor] = useState(false);
  const [showAdminEditor, setShowAdminEditor] = useState(false);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [elrcDialog, setElrcDialog] = useState<{ content: string; filename: string } | null>(null);
  
  const isCurrentTrack = currentTrack?.id === track.id;
  const isCurrentlyPlaying = isCurrentTrack && isPlaying;

  const handlePlayClick = () => {
    if (isCurrentTrack) {
      if (isPlaying) {
        pauseTrack();
      } else {
        resumeTrack();
      }
    } else {
      playTrack(track, tracks);
    }
  };

  const handleSaveMetadata = (updatedTrack: Track) => {
    updateTrackMetadata(track.id, {
      title: updatedTrack.title,
      artist: updatedTrack.artist,
      album: updatedTrack.album,
      artwork: updatedTrack.artwork,
    });
  };

  const handleDelete = async () => {
    await removeTrack(track.id);
  };

  const { toast } = useToast();
  const handleDownloadELrc = async () => {
    try {
      let synced: string | null = null;
      let words: any[] = [];
      if (track.youtubeId) {
        const { data } = await supabase
          .from("songs")
          .select("synced_lyrics, karaoke_data")
          .eq("youtube_id", track.youtubeId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        synced = (data as any)?.synced_lyrics ?? null;
        words = (data as any)?.karaoke_data?.words ?? [];
      }
      const content = buildELrc({
        synced_lyrics: synced,
        karaoke_words: words,
        title: track.title,
        artist: track.artist,
      });
      if (!content.trim()) {
        toast({
          title: "No lyrics available",
          description: "This song doesn't have synced or karaoke lyrics yet.",
          variant: "destructive",
        });
        return;
      }
      const name = `${safeFilename(track.artist)} - ${safeFilename(track.title)}.lrc`;
      setElrcDialog({ content, filename: name });
    } catch (e) {
      console.error(e);
      toast({ title: "Download failed", description: "Could not export eLRC file.", variant: "destructive" });
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ 
          duration: 0.4, 
          delay: index * 0.03,
          ease: [0.32, 0.72, 0, 1]
        }}
        whileHover={{ backgroundColor: "hsl(var(--secondary) / 0.5)" }}
        className={cn(
          "group flex items-center gap-4 px-4 py-3 rounded-lg transition-colors duration-200",
          isCurrentTrack && "bg-secondary/70"
        )}
      >
        {/* Index / Play button */}
        <div className="w-8 flex justify-center">
          <button
            onClick={handlePlayClick}
            className="icon-button h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {isCurrentlyPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </button>
          <span className={cn(
            "text-sm text-muted-foreground group-hover:hidden",
            isCurrentTrack && "text-accent font-medium"
          )}>
            {isCurrentlyPlaying ? (
              <span className="flex gap-0.5">
                <span className="w-0.5 h-3 bg-accent rounded-full animate-pulse-subtle" />
                <span className="w-0.5 h-3 bg-accent rounded-full animate-pulse-subtle delay-75" />
                <span className="w-0.5 h-3 bg-accent rounded-full animate-pulse-subtle delay-150" />
              </span>
            ) : (
              index + 1
            )}
          </span>
        </div>

        {/* Artwork - 1:1 center crop for YouTube thumbnails */}
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md">
          <img
            src={track.artwork || "/placeholder.svg"}
            alt={track.album}
            className={cn(
              "object-cover object-center",
              track.source === 'youtube' 
                ? "h-full w-auto min-w-full" 
                : "h-full w-full"
            )}
          />
          {track.source === 'youtube' && (
            <div className="absolute bottom-0 right-0 bg-accent rounded-tl p-0.5">
              <Youtube className="h-2.5 w-2.5 text-accent-foreground" />
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn(
              "truncate text-sm font-medium",
              isCurrentTrack && "text-accent"
            )}>
              {track.title}
            </p>
            {isOffline && (
              <span title="Available offline"><WifiOff className="h-3 w-3 text-accent flex-shrink-0" /></span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
        </div>

        {/* Album */}
        <div className="hidden md:block w-48 min-w-0">
          <p className="truncate text-sm text-muted-foreground">{track.album}</p>
        </div>

        {/* Duration */}
        <div className="w-12 text-right">
          <span className="text-sm text-muted-foreground">{formatTime(track.duration)}</span>
        </div>

        {/* Download for Offline — appears only when an admin has uploaded an MP3 for this song */}
        <DownloadButton track={track} variant="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* More Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="icon-button h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setShowPlaylistDialog(true)}>
              <ListPlus className="h-4 w-4 mr-2" />
              Add to Playlist
            </DropdownMenuItem>

            {track.album && track.album.trim().length > 0 && (
              <DropdownMenuItem onClick={() => openAlbum(track.album)}>
                <Disc3 className="h-4 w-4 mr-2" />
                View Album
              </DropdownMenuItem>
            )}
            
            <DropdownMenuItem onClick={() => setShowEditor(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Info
            </DropdownMenuItem>
            
            {isAdmin ? (
              <DropdownMenuItem onClick={() => setShowAdminEditor(true)} className="text-accent">
                <Shield className="h-4 w-4 mr-2" />
                Admin Edit
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setShowRequestDialog(true)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Request Admin Change
              </DropdownMenuItem>
            )}
            
            <DropdownMenuItem onClick={handleDownloadELrc}>
              <FileDown className="h-4 w-4 mr-2" />
              Download eLRC Lyrics
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove from Library
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>

      {showEditor && (
        <MetadataEditor
          track={track}
          isOpen={showEditor}
          onClose={() => setShowEditor(false)}
          onSave={handleSaveMetadata}
        />
      )}

      {showAdminEditor && (
        <AdminSongEditor
          track={track}
          isOpen={showAdminEditor}
          onClose={() => setShowAdminEditor(false)}
          onSave={handleSaveMetadata}
        />
      )}

      {showRequestDialog && (
        <RequestAdminDialog
          track={track}
          isOpen={showRequestDialog}
          onClose={() => setShowRequestDialog(false)}
        />
      )}

      {showPlaylistDialog && (
        <AddToPlaylistDialog
          track={track}
          isOpen={showPlaylistDialog}
          onClose={() => setShowPlaylistDialog(false)}
        />
      )}

      {elrcDialog && (
        <ELrcOffsetDialog
          isOpen={!!elrcDialog}
          onClose={() => setElrcDialog(null)}
          baseContent={elrcDialog.content}
          filename={elrcDialog.filename}
        />
      )}
    </>
  );
}
