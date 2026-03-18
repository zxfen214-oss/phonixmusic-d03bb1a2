import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { Track, PlayerState } from "@/types/music";
import { getAudioFile, saveAudioFile } from "@/lib/database";
import { useMediaSession } from "@/hooks/useMediaSession";
import { getCachedAudio } from "@/lib/offlineCache";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

type SpeedPreset = 'normal' | 'slowed-reverb' | 'sped-up';

interface PlayerContextType extends PlayerState {
  playTrack: (track: Track, queue?: Track[]) => void;
  pauseTrack: () => void;
  resumeTrack: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  seekTo: (progress: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number, preservePitch?: boolean) => void;
  setSpeedPreset: (preset: SpeedPreset) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  addToQueue: (track: Track) => void;
  playbackRate: number;
  speedPreset: SpeedPreset;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    progress: 0,
    volume: 80,
    queue: [],
    queueIndex: 0,
    shuffle: false,
    repeat: 'none',
  });
  
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [speedPreset, setSpeedPresetState] = useState<SpeedPreset>('normal');
  const [preservePitchEnabled, setPreservePitchEnabled] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerRef = useRef<any>(null);
  const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const isYouTubeReady = useRef(false);

  const applyPreservePitch = useCallback((audio: HTMLAudioElement, preserve: boolean) => {
    // Best-effort: preserve pitch when changing playbackRate (supported in most modern browsers).
    const anyAudio = audio as any;
    if (typeof anyAudio.preservesPitch !== "undefined") anyAudio.preservesPitch = preserve;
    if (typeof anyAudio.mozPreservesPitch !== "undefined") anyAudio.mozPreservesPitch = preserve;
    if (typeof anyAudio.webkitPreservesPitch !== "undefined") anyAudio.webkitPreservesPitch = preserve;
  }, []);

  // Initialize YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      isYouTubeReady.current = true;
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      isYouTubeReady.current = true;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Progress tracking
  useEffect(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    if (state.isPlaying && state.currentTrack) {
      progressIntervalRef.current = window.setInterval(() => {
        let currentTime = 0;
        let duration = state.currentTrack?.duration || 1;
        
        // Prefer audioRef (covers local AND cached YouTube playback)
        if (audioRef.current) {
          currentTime = audioRef.current.currentTime;
          duration = audioRef.current.duration || duration;
        } else if (state.currentTrack?.source === 'youtube' && youtubePlayerRef.current?.getCurrentTime) {
          currentTime = youtubePlayerRef.current.getCurrentTime();
          duration = youtubePlayerRef.current.getDuration() || duration;
        }
        
        const progress = (currentTime / duration) * 100;
        setState(prev => ({ ...prev, progress }));
      }, 250);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [state.isPlaying, state.currentTrack?.id]);

  const loadYouTubeVideo = useCallback((videoId: string) => {
    // Create container if not exists
    if (!youtubeContainerRef.current) {
      youtubeContainerRef.current = document.createElement('div');
      youtubeContainerRef.current.id = 'youtube-player-container';
      youtubeContainerRef.current.style.position = 'fixed';
      youtubeContainerRef.current.style.left = '-9999px';
      youtubeContainerRef.current.style.top = '-9999px';
      youtubeContainerRef.current.style.width = '320px';
      youtubeContainerRef.current.style.height = '180px';
      document.body.appendChild(youtubeContainerRef.current);
    }

    // Destroy existing player
    if (youtubePlayerRef.current) {
      try {
        youtubePlayerRef.current.destroy();
      } catch (e) {
        console.warn('Error destroying player:', e);
      }
      youtubePlayerRef.current = null;
    }

    // Create new player div
    const playerDiv = document.createElement('div');
    playerDiv.id = 'yt-player-' + Date.now();
    youtubeContainerRef.current.innerHTML = '';
    youtubeContainerRef.current.appendChild(playerDiv);

    const waitForYT = () => {
      if (window.YT && window.YT.Player) {
        youtubePlayerRef.current = new window.YT.Player(playerDiv.id, {
          height: '180',
          width: '320',
          videoId: videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
          },
          events: {
            onReady: (event: any) => {
              event.target.setVolume(state.volume);
              if (event.target.setPlaybackRate) {
                event.target.setPlaybackRate(playbackRate);
              }
              event.target.playVideo();
              setState(prev => ({ ...prev, isPlaying: true }));
            },
            onStateChange: (event: any) => {
              if (event.data === window.YT.PlayerState.ENDED) {
                // Handle track end
                setState(prev => {
                  const nextIndex = prev.queueIndex + 1;
                  if (nextIndex < prev.queue.length) {
                    // Play next track
                    const nextTrack = prev.queue[nextIndex];
                    if (nextTrack.source === 'youtube' && nextTrack.youtubeId) {
                      setTimeout(() => loadYouTubeVideo(nextTrack.youtubeId!), 100);
                    }
                    return { ...prev, currentTrack: nextTrack, queueIndex: nextIndex, progress: 0 };
                  }
                  return { ...prev, isPlaying: false };
                });
              }
            },
            onError: (event: any) => {
              console.error('YouTube player error:', event.data);
            },
          },
        });
      } else {
        setTimeout(waitForYT, 100);
      }
    };

    waitForYT();
  }, [state.volume, playbackRate]);

  const loadLocalAudio = useCallback(async (track: Track) => {
    // Cleanup previous
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const audioBlob = await getAudioFile(track.id);
    if (audioBlob) {
      const audio = new Audio();
      objectUrlRef.current = URL.createObjectURL(audioBlob);
      audio.src = objectUrlRef.current;
      audio.volume = state.volume / 100;
      applyPreservePitch(audio, preservePitchEnabled);
      audio.playbackRate = playbackRate;
      
      audio.onended = () => {
        setState(prev => {
          const nextIndex = prev.queueIndex + 1;
          if (nextIndex < prev.queue.length) {
            const nextTrack = prev.queue[nextIndex];
            return { ...prev, currentTrack: nextTrack, queueIndex: nextIndex, progress: 0 };
          }
          return { ...prev, isPlaying: false };
        });
      };

      audioRef.current = audio;
      await audio.play();
      setState(prev => ({ ...prev, isPlaying: true }));
    }
  }, [state.volume, playbackRate, applyPreservePitch, preservePitchEnabled]);

  const loadCachedOrRemoteAudio = useCallback(async (track: Track) => {
    // Cleanup previous
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    let audioBlob: Blob | null = null;

    if (track.youtubeId) {
      audioBlob = await getCachedAudio(track.youtubeId);
    }

    if (!audioBlob) {
      const localAudioBlob = await getAudioFile(track.id);
      if (localAudioBlob) {
        audioBlob = localAudioBlob;
      }
    }

    if (!audioBlob) {
      try {
        let songQuery = supabase
          .from("songs")
          .select("audio_url")
          .order("created_at", { ascending: false })
          .limit(1);

        if (track.youtubeId) {
          songQuery = songQuery.eq("youtube_id", track.youtubeId);
        } else {
          songQuery = songQuery
            .eq("title", track.title)
            .eq("artist", track.artist)
            .or(`album.eq.${track.album || ""},album.is.null`);
        }

        const { data } = await songQuery.maybeSingle();
        if (data?.audio_url) {
          const resp = await fetch(data.audio_url);
          if (resp.ok) {
            audioBlob = await resp.blob();
            await saveAudioFile(track.id, audioBlob, audioBlob.type || "audio/mpeg");
          }
        }
      } catch (e) {
        console.warn("Failed to fetch remote audio:", e);
      }
    }

    if (audioBlob) {
      const audio = new Audio();
      objectUrlRef.current = URL.createObjectURL(audioBlob);
      audio.src = objectUrlRef.current;
      audio.volume = state.volume / 100;
      applyPreservePitch(audio, preservePitchEnabled);
      audio.playbackRate = playbackRate;

      audio.onended = () => {
        setState(prev => {
          const nextIndex = prev.queueIndex + 1;
          if (nextIndex < prev.queue.length) {
            const nextTrack = prev.queue[nextIndex];
            return { ...prev, currentTrack: nextTrack, queueIndex: nextIndex, progress: 0 };
          }
          return { ...prev, isPlaying: false };
        });
      };

      audioRef.current = audio;
      await audio.play();
      setState(prev => ({ ...prev, isPlaying: true }));
      return true;
    }
    return false;
  }, [state.volume, playbackRate, applyPreservePitch, preservePitchEnabled]);

  const playTrack = useCallback((track: Track, queue?: Track[]) => {
    // Cleanup previous players
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (youtubePlayerRef.current) {
      try {
        youtubePlayerRef.current.stopVideo();
      } catch (e) {}
    }

    const newQueue = queue || [track];
    const index = newQueue.findIndex(t => t.id === track.id);
    
    setState(prev => ({
      ...prev,
      currentTrack: track,
      progress: 0,
      queue: newQueue,
      queueIndex: index >= 0 ? index : 0,
    }));

    if (track.source === 'youtube' && track.youtubeId) {
      // Try offline/cached audio first, fall back to YouTube iframe
      loadCachedOrRemoteAudio(track).then(usedCached => {
        if (!usedCached) {
          loadYouTubeVideo(track.youtubeId!);
        }
      });
    } else if (track.source === 'local') {
      loadLocalAudio(track);
    }
  }, [loadYouTubeVideo, loadLocalAudio, loadCachedOrRemoteAudio]);

  const pauseTrack = useCallback(() => {
    // If we have an active audio element (covers both local tracks AND cached YouTube tracks)
    if (audioRef.current) {
      audioRef.current.pause();
    } else if (state.currentTrack?.source === 'youtube' && youtubePlayerRef.current) {
      youtubePlayerRef.current.pauseVideo();
    }
    setState(prev => ({ ...prev, isPlaying: false }));
  }, [state.currentTrack]);

  const resumeTrack = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play();
    } else if (state.currentTrack?.source === 'youtube' && youtubePlayerRef.current) {
      youtubePlayerRef.current.playVideo();
    }
    setState(prev => ({ ...prev, isPlaying: true }));
  }, [state.currentTrack]);

  const nextTrack = useCallback(() => {
    setState(prev => {
      if (prev.queue.length === 0) return prev;
      
      let nextIndex = prev.queueIndex + 1;
      if (nextIndex >= prev.queue.length) {
        if (prev.repeat === 'all') {
          nextIndex = 0;
        } else {
          return { ...prev, isPlaying: false };
        }
      }
      
      const nextTrack = prev.queue[nextIndex];
      
      // Load the track with offline-first approach
      if (nextTrack.source === 'youtube' && nextTrack.youtubeId) {
        loadCachedOrRemoteAudio(nextTrack).then(usedCached => {
          if (!usedCached) loadYouTubeVideo(nextTrack.youtubeId!);
        });
      } else if (nextTrack.source === 'local') {
        loadLocalAudio(nextTrack);
      }
      
      return {
        ...prev,
        currentTrack: nextTrack,
        queueIndex: nextIndex,
        progress: 0,
      };
    });
  }, [loadYouTubeVideo, loadLocalAudio, loadCachedOrRemoteAudio]);

  const previousTrack = useCallback(() => {
    setState(prev => {
      if (prev.queue.length === 0) return prev;
      
      let prevIndex = prev.queueIndex - 1;
      if (prevIndex < 0) {
        prevIndex = prev.repeat === 'all' ? prev.queue.length - 1 : 0;
      }
      
      const prevTrack = prev.queue[prevIndex];
      
      if (prevTrack.source === 'youtube' && prevTrack.youtubeId) {
        loadCachedOrRemoteAudio(prevTrack).then(usedCached => {
          if (!usedCached) loadYouTubeVideo(prevTrack.youtubeId!);
        });
      } else if (prevTrack.source === 'local') {
        loadLocalAudio(prevTrack);
      }
      
      return {
        ...prev,
        currentTrack: prevTrack,
        queueIndex: prevIndex,
        progress: 0,
      };
    });
  }, [loadYouTubeVideo, loadLocalAudio, loadCachedOrRemoteAudio]);

  const seekTo = useCallback((progress: number) => {
    if (!state.currentTrack) return;
    
    const duration = state.currentTrack.duration;
    const time = (progress / 100) * duration;
    
    // Prefer audioRef (covers both local and cached YouTube playback)
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    } else if (state.currentTrack.source === 'youtube' && youtubePlayerRef.current) {
      youtubePlayerRef.current.seekTo(time, true);
    }
    
    setState(prev => ({ ...prev, progress }));
  }, [state.currentTrack]);

  const setVolume = useCallback((volume: number) => {
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.setVolume(volume);
    }
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
    setState(prev => ({ ...prev, volume }));
  }, []);

  const setPlaybackRate = useCallback((rate: number, preservePitch: boolean = true) => {
    let appliedRate = rate;

    // Update pitch preservation state
    setPreservePitchEnabled(preservePitch);

    // If YouTube is active, snap to supported rates (prevents UI saying 0.30x while YT plays 0.25x).
    try {
      const yt = youtubePlayerRef.current;
      if (state.currentTrack?.source === "youtube" && yt) {
        const rates: number[] | undefined = typeof yt.getAvailablePlaybackRates === "function" ? yt.getAvailablePlaybackRates() : undefined;
        if (rates && rates.length > 0) {
          appliedRate = rates.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best), rates[0]);
        }
        if (typeof yt.setPlaybackRate === "function") {
          yt.setPlaybackRate(appliedRate);
        }
      } else if (yt && typeof yt.setPlaybackRate === "function") {
        // Best-effort: if player exists but track is not youtube.
        yt.setPlaybackRate(appliedRate);
      }
    } catch {
      // ignore
    }

    if (audioRef.current) {
      applyPreservePitch(audioRef.current, preservePitch);
      audioRef.current.playbackRate = appliedRate;
    }

    setPlaybackRateState(appliedRate);
  }, [applyPreservePitch, state.currentTrack?.source]);

  const setSpeedPreset = useCallback((preset: SpeedPreset) => {
    setSpeedPresetState(preset);
    
    switch (preset) {
      case 'slowed-reverb':
        // 85% speed with pitch changing (no preserve pitch)
        setPlaybackRate(0.85, false);
        break;
      case 'sped-up':
        // 120% speed with pitch changing (no preserve pitch)
        setPlaybackRate(1.2, false);
        break;
      case 'normal':
      default:
        // Normal speed with preserved pitch
        setPlaybackRate(1.0, true);
        break;
    }
  }, [setPlaybackRate]);

  const toggleShuffle = useCallback(() => {
    setState(prev => ({ ...prev, shuffle: !prev.shuffle }));
  }, []);

  const toggleRepeat = useCallback(() => {
    setState(prev => ({
      ...prev,
      repeat: prev.repeat === 'none' ? 'all' : prev.repeat === 'all' ? 'one' : 'none',
    }));
  }, []);

  const addToQueue = useCallback((track: Track) => {
    setState(prev => ({
      ...prev,
      queue: [...prev.queue, track],
    }));
  }, []);

  // Media Session integration for lock screen controls
  const handleSeekBackward = useCallback(() => {
    const currentTime = (state.progress / 100) * (state.currentTrack?.duration || 0);
    const newTime = Math.max(0, currentTime - 10);
    const newProgress = (newTime / (state.currentTrack?.duration || 1)) * 100;
    seekTo(newProgress);
  }, [state.progress, state.currentTrack?.duration, seekTo]);

  const handleSeekForward = useCallback(() => {
    const currentTime = (state.progress / 100) * (state.currentTrack?.duration || 0);
    const newTime = Math.min(state.currentTrack?.duration || 0, currentTime + 10);
    const newProgress = (newTime / (state.currentTrack?.duration || 1)) * 100;
    seekTo(newProgress);
  }, [state.progress, state.currentTrack?.duration, seekTo]);

  const { updatePositionState } = useMediaSession({
    track: state.currentTrack,
    isPlaying: state.isPlaying,
    onPlay: resumeTrack,
    onPause: pauseTrack,
    onPrevious: previousTrack,
    onNext: nextTrack,
    onSeekBackward: handleSeekBackward,
    onSeekForward: handleSeekForward,
  });

  // Update media session position state
  useEffect(() => {
    if (!state.currentTrack) return;
    const duration = state.currentTrack.duration || 0;
    const currentTime = (state.progress / 100) * duration;
    updatePositionState(duration, currentTime, playbackRate);
  }, [state.progress, state.currentTrack?.duration, playbackRate, updatePositionState]);

  return (
    <PlayerContext.Provider
      value={{
        ...state,
        playTrack,
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
        addToQueue,
        playbackRate,
        speedPreset,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    // During HMR, context can temporarily be undefined. Return a safe fallback
    // instead of throwing to prevent blank screens.
    console.warn("usePlayer called outside PlayerProvider – returning defaults");
    return {
      currentTrack: null,
      isPlaying: false,
      progress: 0,
      volume: 80,
      queue: [],
      queueIndex: 0,
      shuffle: false,
      repeat: 'none' as const,
      playTrack: () => {},
      pauseTrack: () => {},
      resumeTrack: () => {},
      nextTrack: () => {},
      previousTrack: () => {},
      seekTo: () => {},
      setVolume: () => {},
      setPlaybackRate: () => {},
      setSpeedPreset: () => {},
      toggleShuffle: () => {},
      toggleRepeat: () => {},
      addToQueue: () => {},
      playbackRate: 1,
      speedPreset: 'normal' as const,
    } as PlayerContextType;
  }
  return context;
}
