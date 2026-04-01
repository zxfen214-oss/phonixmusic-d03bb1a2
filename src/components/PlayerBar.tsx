import { usePlayer } from "@/contexts/PlayerContext";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Repeat,
  Repeat1,
  Shuffle,
  Youtube,
  Mic2,
  Gauge,
  WifiOff,
  Disc3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DownloadButton } from "./DownloadButton";
import { useOfflineAudio } from "@/hooks/useOfflineAudio";

interface PlayerBarProps {
  onOpenLyrics?: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function PlayerBar({ onOpenLyrics }: PlayerBarProps) {
  const {
    currentTrack,
    isPlaying,
    progress,
    volume,
    shuffle,
    repeat,
    playbackRate,
    speedPreset,
    pauseTrack,
    resumeTrack,
    nextTrack,
    previousTrack,
    seekTo,
    setVolume,
    setPlaybackRate,
    setSpeedPreset,
    toggleShuffle,
    toggleRepeat,
  } = usePlayer();

  const { isCached } = useOfflineAudio(currentTrack);

  if (!currentTrack) {
    return (
      <div className="h-20 md:h-24 border-t border-border bg-player-bar/95 backdrop-blur-sm flex items-center justify-center mb-[calc(4rem+env(safe-area-inset-bottom))] md:mb-0 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <p className="text-muted-foreground text-sm">No track playing</p>
      </div>
    );
  }

  const currentTime = (progress / 100) * currentTrack.duration;

  return (
    <div className="h-20 md:h-24 border-t border-border bg-player-bar/95 backdrop-blur-sm px-3 md:px-4 flex items-center gap-2 md:gap-4 mb-[calc(4rem+env(safe-area-inset-bottom))] md:mb-0 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
      {/* Track Info */}
      <div className="flex items-center gap-2 md:gap-3 flex-1 md:w-64 md:flex-initial min-w-0">
        <div 
          className="relative h-12 w-12 md:h-14 md:w-14 flex-shrink-0 overflow-hidden rounded-lg cursor-pointer group"
          onClick={onOpenLyrics}
        >
          <img
            src={currentTrack.artwork || "/placeholder.svg"}
            alt={currentTrack.album}
            className={cn(
              "object-cover object-center transition-transform group-hover:scale-105",
              currentTrack.source === 'youtube' 
                ? "h-full w-auto min-w-full" 
                : "h-full w-full"
            )}
          />
          {/* Lyrics hover overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Mic2 className="h-5 w-5 text-white" />
          </div>
          {currentTrack.source === 'youtube' && (
            <div className="absolute bottom-0.5 right-0.5 bg-accent rounded p-0.5">
              {isCached ? (
                <WifiOff className="h-3 w-3 text-accent-foreground" />
              ) : (
                <Youtube className="h-3 w-3 text-accent-foreground" />
              )}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{currentTrack.title}</p>
          <p className="truncate text-xs text-muted-foreground">{currentTrack.artist}</p>
        </div>
      </div>

      {/* Mobile Controls - Simplified */}
      <div className="flex md:hidden items-center gap-1">
        <button onClick={previousTrack} className="icon-button h-9 w-9">
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={isPlaying ? pauseTrack : resumeTrack}
          className="icon-button accent h-11 w-11"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </button>
        <button onClick={nextTrack} className="icon-button h-9 w-9">
          <SkipForward className="h-4 w-4" />
        </button>

        {/* Playback speed (popover) */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="icon-button h-9 w-9" title="Playback speed">
              <Gauge className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <div className="space-y-4">
              {/* Presets */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Presets</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSpeedPreset('normal')}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-full border transition-colors",
                      speedPreset === 'normal' 
                        ? "bg-primary text-primary-foreground border-primary" 
                        : "bg-secondary/50 hover:bg-secondary border-border"
                    )}
                  >
                    Normal
                  </button>
                  <button
                    onClick={() => setSpeedPreset('slowed-reverb')}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-full border transition-colors",
                      speedPreset === 'slowed-reverb' 
                        ? "bg-primary text-primary-foreground border-primary" 
                        : "bg-secondary/50 hover:bg-secondary border-border"
                    )}
                  >
                    Slowed + Reverb
                  </button>
                  <button
                    onClick={() => setSpeedPreset('sped-up')}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-full border transition-colors",
                      speedPreset === 'sped-up' 
                        ? "bg-primary text-primary-foreground border-primary" 
                        : "bg-secondary/50 hover:bg-secondary border-border"
                    )}
                  >
                    Sped Up
                  </button>
                </div>
              </div>
              
              {/* Manual slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Manual</p>
                  <span className="text-sm font-mono font-semibold">{playbackRate.toFixed(2)}x</span>
                </div>
                <Slider
                  value={[playbackRate * 100]}
                  min={30}
                  max={120}
                  step={5}
                  onValueChange={([v]) => {
                    setSpeedPreset('normal'); // Reset preset when manually adjusting
                    setPlaybackRate(v / 100, true);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Drag for karaoke practice (30%-120%)
                </p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Desktop Controls - Full */}
      <div className="hidden md:flex flex-1 flex-col items-center gap-2 max-w-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleShuffle}
            className={cn(
              "icon-button h-8 w-8",
              shuffle && "text-accent"
            )}
          >
            <Shuffle className="h-4 w-4" />
          </button>
          <button onClick={previousTrack} className="icon-button h-9 w-9">
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={isPlaying ? pauseTrack : resumeTrack}
            className="icon-button accent h-10 w-10"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </button>
          <button onClick={nextTrack} className="icon-button h-9 w-9">
            <SkipForward className="h-5 w-5" />
          </button>
          <button
            onClick={toggleRepeat}
            className={cn(
              "icon-button h-8 w-8",
              repeat !== 'none' && "text-accent"
            )}
          >
            {repeat === 'one' ? (
              <Repeat1 className="h-4 w-4" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 w-full">
          <span className="text-xs text-muted-foreground w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <Slider
            value={[progress]}
            max={100}
            step={0.1}
            onValueChange={([value]) => seekTo(value)}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-10">
            {formatTime(currentTrack.duration)}
          </span>
        </div>
      </div>

      {/* Volume & Lyrics - Desktop only */}
      <div className="hidden md:flex items-center gap-2 w-48">
        {/* Lyrics Button */}
        <button
          onClick={onOpenLyrics}
          className="icon-button h-8 w-8 hover:text-accent transition-colors"
          title="View Lyrics"
        >
          <Mic2 className="h-4 w-4" />
        </button>

        {/* Playback speed (popover) */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="icon-button h-8 w-8" title="Playback speed">
              <Gauge className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <div className="space-y-4">
              {/* Presets */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Presets</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSpeedPreset('normal')}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-full border transition-colors",
                      speedPreset === 'normal' 
                        ? "bg-primary text-primary-foreground border-primary" 
                        : "bg-secondary/50 hover:bg-secondary border-border"
                    )}
                  >
                    Normal
                  </button>
                  <button
                    onClick={() => setSpeedPreset('slowed-reverb')}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-full border transition-colors",
                      speedPreset === 'slowed-reverb' 
                        ? "bg-primary text-primary-foreground border-primary" 
                        : "bg-secondary/50 hover:bg-secondary border-border"
                    )}
                  >
                    Slowed + Reverb
                  </button>
                  <button
                    onClick={() => setSpeedPreset('sped-up')}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-full border transition-colors",
                      speedPreset === 'sped-up' 
                        ? "bg-primary text-primary-foreground border-primary" 
                        : "bg-secondary/50 hover:bg-secondary border-border"
                    )}
                  >
                    Sped Up
                  </button>
                </div>
              </div>
              
              {/* Manual slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Manual</p>
                  <span className="text-sm font-mono font-semibold">{playbackRate.toFixed(2)}x</span>
                </div>
                <Slider
                  value={[playbackRate * 100]}
                  min={30}
                  max={120}
                  step={5}
                  onValueChange={([v]) => {
                    setSpeedPreset('normal');
                    setPlaybackRate(v / 100, true);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Pitch preserved for karaoke practice.
                </p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        
        <button
          onClick={() => setVolume(volume === 0 ? 80 : 0)}
          className="icon-button h-8 w-8"
        >
          {volume === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
        <Slider
          value={[volume]}
          max={100}
          step={1}
          onValueChange={([value]) => setVolume(value)}
          className="flex-1"
        />
      </div>
    </div>
  );
}
