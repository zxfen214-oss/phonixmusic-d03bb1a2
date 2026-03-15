import { useState } from 'react';
import { Track } from '@/types/music';
import { useOfflineAudio } from '@/hooks/useOfflineAudio';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, Check, Trash2, Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface DownloadButtonProps {
  track: Track;
  variant?: 'icon' | 'full';
  className?: string;
}

export function DownloadButton({ track, variant = 'icon', className }: DownloadButtonProps) {
  const { toast } = useToast();
  const {
    isAvailable,
    isCached,
    isDownloading,
    downloadProgress,
    downloadForOffline,
    removeFromCache,
  } = useOfflineAudio(track);

  const handleDownload = async () => {
    const success = await downloadForOffline();
    if (success) {
      toast({
        title: 'Downloaded for offline',
        description: `"${track.title}" is now available offline`,
      });
    } else {
      toast({
        title: 'Download failed',
        description: 'Failed to download audio. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRemove = async () => {
    await removeFromCache();
    toast({
      title: 'Removed from offline',
      description: `"${track.title}" removed from offline storage`,
    });
  };

  // If no offline audio is available for this track
  if (!isAvailable) {
    return null;
  }

  // Downloading state
  if (isDownloading) {
    if (variant === 'full') {
      return (
        <div className={cn('space-y-2', className)}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Downloading... {Math.round(downloadProgress)}%</span>
          </div>
          <Progress value={downloadProgress} className="h-1" />
        </div>
      );
    }
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={cn('relative', className)}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  // Already cached
  if (isCached) {
    if (variant === 'full') {
      return (
        <div className={cn('flex items-center justify-between p-2.5 bg-accent/10 rounded-lg', className)}>
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-accent" />
            <span className="text-sm text-accent">Available offline</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-muted-foreground hover:text-destructive h-7"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    }
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleRemove}
        className={cn('text-accent hover:text-destructive', className)}
        title="Downloaded - Click to remove"
      >
        <Check className="h-4 w-4" />
      </Button>
    );
  }

  // Not cached - show download button
  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        onClick={handleDownload}
        className={cn('w-full gap-2', className)}
      >
        <Download className="h-4 w-4" />
        Download for Offline
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDownload}
      className={className}
      title="Download for offline"
    >
      <Download className="h-4 w-4" />
    </Button>
  );
}
