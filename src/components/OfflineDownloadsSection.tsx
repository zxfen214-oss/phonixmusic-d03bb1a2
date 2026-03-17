import { useState, useEffect } from 'react';
import { getAllCachedInfo, clearAllCachedAudio, removeCachedAudio, formatBytes, CacheInfo } from '@/lib/offlineCache';
import { Button } from '@/components/ui/button';
import { WifiOff, Trash2, Music, HardDrive, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { StaggerItem } from '@/components/PageTransition';

export function OfflineDownloadsSection() {
  const { toast } = useToast();
  const [cachedSongs, setCachedSongs] = useState<CacheInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  const loadCached = async () => {
    setIsLoading(true);
    const items = await getAllCachedInfo();
    setCachedSongs(items.sort((a, b) => new Date(b.cachedAt).getTime() - new Date(a.cachedAt).getTime()));
    setIsLoading(false);
  };

  useEffect(() => { loadCached(); }, []);

  const totalSize = cachedSongs.reduce((sum, s) => sum + s.size, 0);

  const handleRemove = async (youtubeId: string, title: string) => {
    await removeCachedAudio(youtubeId);
    toast({ title: 'Removed', description: `"${title}" removed from offline storage` });
    loadCached();
  };

  const handleClearAll = async () => {
    if (!confirm(`Remove all ${cachedSongs.length} offline downloads?`)) return;
    setIsClearing(true);
    await clearAllCachedAudio();
    toast({ title: 'Cleared', description: 'All offline downloads removed' });
    setCachedSongs([]);
    setIsClearing(false);
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="p-6 rounded-xl border border-border bg-card"
    >
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <WifiOff className="h-5 w-5 text-accent" />
        Offline Downloads
      </h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : cachedSongs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No songs downloaded for offline playback yet. Look for the download button on songs that have MP3 audio available.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Storage summary */}
          <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {cachedSongs.length} song{cachedSongs.length !== 1 ? 's' : ''} • {formatBytes(totalSize)}
              </span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAll}
              disabled={isClearing}
              className="gap-1"
            >
              {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Clear All
            </Button>
          </div>

          {/* Song list */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {cachedSongs.map((song) => (
              <div key={song.youtubeId} className="flex items-center gap-3 p-2.5 bg-secondary/50 rounded-lg">
                <Music className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{song.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {song.artist} • {formatBytes(song.size)}
                    {song.hasSyncedLyrics && ' • Lyrics included'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => handleRemove(song.youtubeId, song.title)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
