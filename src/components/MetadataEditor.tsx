import { useState, useRef } from 'react';
import { Track } from '@/types/music';
import { updateTrack } from '@/lib/database';
import { X, Upload, Music, Save, Youtube, ExternalLink, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface MetadataEditorProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrack: Track) => void;
}

export function MetadataEditor({ track, isOpen, onClose, onSave }: MetadataEditorProps) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [artwork, setArtwork] = useState(track.artwork);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleArtworkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select an image file',
          variant: 'destructive',
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        setArtwork(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedTrack: Track = {
        ...track,
        title,
        artist,
        album,
        artwork,
      };

      await updateTrack(track.id, {
        title,
        artist,
        album,
        artwork,
      });

      onSave(updatedTrack);
      toast({
        title: 'Metadata saved',
        description: 'Track information has been updated',
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Error saving',
        description: 'Failed to update track metadata',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Edit Track Info</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Artwork */}
          <div className="flex gap-6">
            <div className="relative group">
              <div 
                className="w-32 h-32 rounded-xl overflow-hidden bg-secondary cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {artwork ? (
                  <img
                    src={artwork}
                    alt="Album artwork"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Upload className="h-8 w-8 text-white" />
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleArtworkChange}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Click to change
              </p>
            </div>

            <div className="flex-1 space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Track title"
                  className="bg-secondary border-border"
                />
              </div>

              {/* Artist */}
              <div className="space-y-2">
                <Label htmlFor="artist">Artist</Label>
                <Input
                  id="artist"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Artist name"
                  className="bg-secondary border-border"
                />
              </div>
            </div>
          </div>

          {/* Album */}
          <div className="space-y-2">
            <Label htmlFor="album">Album</Label>
            <Input
              id="album"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              placeholder="Album name"
              className="bg-secondary border-border"
            />
          </div>

          {/* Source info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="px-2 py-1 rounded-md bg-secondary text-xs font-medium uppercase">
              {track.source}
            </span>
            {track.filePath && (
              <span className="truncate">{track.filePath}</span>
            )}
          </div>

          {/* YouTube link */}
          {track.youtubeId && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs">
                <Youtube className="h-4 w-4 text-accent" />
                YouTube link
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={`https://www.youtube.com/watch?v=${track.youtubeId}`}
                  onFocus={(e) => e.currentTarget.select()}
                  className="bg-secondary border-border text-xs font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Copy link"
                  onClick={async () => {
                    const url = `https://www.youtube.com/watch?v=${track.youtubeId}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast({ title: 'Copied', description: 'YouTube link copied to clipboard.' });
                    } catch {
                      toast({ title: 'Copy failed', variant: 'destructive' });
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Open on YouTube"
                  asChild
                >
                  <a
                    href={`https://www.youtube.com/watch?v=${track.youtubeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {isSaving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
