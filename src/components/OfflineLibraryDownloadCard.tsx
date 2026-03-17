import { Download, Loader2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useOfflineLibraryDownload } from "@/hooks/useOfflineLibraryDownload";

export function OfflineLibraryDownloadCard() {
  const { toast } = useToast();
  const { isDownloadingAll, progress, progressPercent, downloadAllAvailable } = useOfflineLibraryDownload();

  const handleDownloadAll = async () => {
    const result = await downloadAllAvailable();

    if (result.success) {
      toast({
        title: "Offline library ready",
        description: result.downloaded > 0 ? `Downloaded ${result.downloaded} track${result.downloaded === 1 ? "" : "s"} with lyrics.` : "Everything available is already saved offline.",
      });
      return;
    }

    toast({
      title: "Offline download failed",
      description: "Could not cache the full library for offline use.",
      variant: "destructive",
    });
  };

  return (
    <div className="p-6 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wifi className="h-5 w-5 text-accent" />
            Offline App Download
          </h2>
          <p className="text-sm text-muted-foreground">
            Install the app shell and bulk-save every available MP3 with bundled lyrics for offline playback.
          </p>
        </div>
        <Button onClick={handleDownloadAll} disabled={isDownloadingAll} className="gap-2">
          {isDownloadingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {isDownloadingAll ? "Downloading" : "Download All Offline"}
        </Button>
      </div>

      {isDownloadingAll && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground gap-4">
            <span className="truncate">{progress.currentTitle ? `Saving ${progress.currentTitle}` : "Preparing downloads"}</span>
            <span>{progress.completed}/{progress.total}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      )}
    </div>
  );
}
