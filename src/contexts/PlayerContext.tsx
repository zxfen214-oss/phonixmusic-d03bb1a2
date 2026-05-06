import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { Track, PlayerState } from "@/types/music";
import { getAudioFile, saveAudioFile } from "@/lib/database";
import { useMediaSession } from "@/hooks/useMediaSession";
import { getCachedAudio } from "@/lib/offlineCache";
import { supabase } from "@/integrations/supabase/client";
import { fetchMergedSongRecord } from "@/lib/songRecords";

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
  isLossless: boolean;
  audioFormat: 'lossless' | 'dolby' | null;
  /** Whether the current track has any lyrics (synced or plain) available */
  hasLyrics: boolean;
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
  const [isLossless, setIsLossless] = useState(false);
  const [audioFormat, setAudioFormat] = useState<'lossless' | 'dolby' | null>(null);
  const [hasLyrics, setHasLyrics] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerRef = useRef<any>(null);
  const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const isYouTubeReady = useRef(false);
  // Token to cancel stale loads when user clicks play multiple times
  const loadTokenRef = useRef(0);
  // Always-current repeat mode for use inside onended/onStateChange callbacks
  const repeatRef = useRef<'none' | 'one' | 'all'>('none');
  useEffect(() => { repeatRef.current = state.repeat; }, [state.repeat]);


  // Hard cleanup of any current audio source (audio element + YouTube player + object URLs)
  const stopCurrentSource = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.src = '';
        audioRef.current.load();
      } catch {}
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      try { URL.revokeObjectURL(objectUrlRef.current); } catch {}
      objectUrlRef.current = null;
    }
    if (youtubePlayerRef.current) {
      try { youtubePlayerRef.current.stopVideo?.(); } catch {}
      try { youtubePlayerRef.current.destroy?.(); } catch {}
      youtubePlayerRef.current = null;
    }
  }, []);

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
        // 250ms is enough — AMLL interpolates smoothly between updates via
        // its own rAF loop, so a higher-frequency React state update only
        // adds re-render cost without improving visual sync.
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
                if (repeatRef.current === 'one') {
                  try {
                    event.target.seekTo(0, true);
                    event.target.playVideo();
                  } catch {}
                  return;
                }
                setState(prev => {
                  const nextIndex = prev.queueIndex + 1;
                  if (nextIndex < prev.queue.length) {
                    const nextTrack = prev.queue[nextIndex];
                    if (nextTrack.source === 'youtube' && nextTrack.youtubeId) {
                      setTimeout(() => loadYouTubeVideo(nextTrack.youtubeId!), 100);
                    }
                    return { ...prev, currentTrack: nextTrack, queueIndex: nextIndex, progress: 0 };
                  }
                  if (repeatRef.current === 'all' && prev.queue.length > 0) {
                    const first = prev.queue[0];
                    if (first.source === 'youtube' && first.youtubeId) {
                      setTimeout(() => loadYouTubeVideo(first.youtubeId!), 100);
                    }
                    return { ...prev, currentTrack: first, queueIndex: 0, progress: 0 };
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
        // Repeat current track
        if (repeatRef.current === 'one' && audioRef.current) {
          try {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
          } catch {}
          return;
        }
        setState(prev => {
          const nextIndex = prev.queueIndex + 1;
          if (nextIndex < prev.queue.length) {
            const nextTrack = prev.queue[nextIndex];
            return { ...prev, currentTrack: nextTrack, queueIndex: nextIndex, progress: 0 };
          }
          // End of queue: loop back if repeat=all
          if (repeatRef.current === 'all' && prev.queue.length > 0) {
            return { ...prev, currentTrack: prev.queue[0], queueIndex: 0, progress: 0 };
          }
          return { ...prev, isPlaying: false };
        });
      };

      audioRef.current = audio;
      await audio.play();
      setState(prev => ({ ...prev, isPlaying: true }));
    }
  }, [state.volume, playbackRate, applyPreservePitch, preservePitchEnabled]);

  const loadCachedOrRemoteAudio = useCallback(async (track: Track, token?: number) => {
    // Cleanup previous
    stopCurrentSource();

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

    // If still nothing, try remote — but ONLY if online, with a timeout to avoid forever-loading
    if (!audioBlob && navigator.onLine) {
      try {
        const fetchWithTimeout = Promise.race([
          fetchMergedSongRecord(
            { youtubeId: track.youtubeId, title: track.title, artist: track.artist, album: track.album },
            "id, audio_url"
          ),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("song lookup timeout")), 4000)),
        ]);
        const { merged } = await fetchWithTimeout as any;
        if (merged?.audio_url) {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 8000);
          const resp = await fetch(merged.audio_url, { signal: ctrl.signal });
          clearTimeout(tid);
          if (resp.ok) {
            audioBlob = await resp.blob();
            await saveAudioFile(track.id, audioBlob, audioBlob.type || "audio/mpeg");
          }
        }
      } catch (e) {
        console.warn("Failed to fetch remote audio:", e);
      }
    }

    // If a newer load was started while we were fetching, abort
    if (token !== undefined && token !== loadTokenRef.current) return false;

    if (audioBlob) {
      const audio = new Audio();
      objectUrlRef.current = URL.createObjectURL(audioBlob);
      audio.src = objectUrlRef.current;
      audio.volume = state.volume / 100;
      applyPreservePitch(audio, preservePitchEnabled);
      audio.playbackRate = playbackRate;

      audio.onended = () => {
        if (repeatRef.current === 'one' && audioRef.current) {
          try {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
          } catch {}
          return;
        }
        setState(prev => {
          const nextIndex = prev.queueIndex + 1;
          if (nextIndex < prev.queue.length) {
            const nextTrack = prev.queue[nextIndex];
            return { ...prev, currentTrack: nextTrack, queueIndex: nextIndex, progress: 0 };
          }
          if (repeatRef.current === 'all' && prev.queue.length > 0) {
            return { ...prev, currentTrack: prev.queue[0], queueIndex: 0, progress: 0 };
          }
          return { ...prev, isPlaying: false };
        });
      };

      audioRef.current = audio;
      setIsLossless(true);
      try { await audio.play(); } catch (e) { console.warn("audio.play failed:", e); }
      // Re-check token after async play
      if (token !== undefined && token !== loadTokenRef.current) {
        stopCurrentSource();
        return false;
      }
      setState(prev => ({ ...prev, isPlaying: true }));
      return true;
    }
    return false;
  }, [state.volume, playbackRate, applyPreservePitch, preservePitchEnabled, stopCurrentSource]);

  const playTrack = useCallback((track: Track, queue?: Track[]) => {
    // Increment load token to invalidate any in-flight loads
    const myToken = ++loadTokenRef.current;
    // Hard stop any existing audio/youtube source FIRST
    stopCurrentSource();

    const newQueue = queue || [track];
    const index = newQueue.findIndex(t => t.id === track.id);
    
    setState(prev => ({
      ...prev,
      currentTrack: track,
      progress: 0,
      isPlaying: false,
      queue: newQueue,
      queueIndex: index >= 0 ? index : 0,
    }));

    if (track.source === 'youtube' && track.youtubeId) {
      setIsLossless(false);
      loadCachedOrRemoteAudio(track, myToken).then(usedCached => {
        if (myToken !== loadTokenRef.current) return; // stale
        if (!usedCached) {
          setIsLossless(false);
          loadYouTubeVideo(track.youtubeId!);
        }
      });
    } else {
      loadCachedOrRemoteAudio(track, myToken).then(usedCached => {
        if (myToken !== loadTokenRef.current) return; // stale
        if (!usedCached) {
          loadLocalAudio(track);
        }
      });
    }
  }, [loadYouTubeVideo, loadLocalAudio, loadCachedOrRemoteAudio, stopCurrentSource]);

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
      const myToken = ++loadTokenRef.current;
      stopCurrentSource();

      if (nextTrack.source === 'youtube' && nextTrack.youtubeId) {
        loadCachedOrRemoteAudio(nextTrack, myToken).then(usedCached => {
          if (myToken !== loadTokenRef.current) return;
          if (!usedCached) loadYouTubeVideo(nextTrack.youtubeId!);
        });
      } else {
        loadCachedOrRemoteAudio(nextTrack, myToken).then(usedCached => {
          if (myToken !== loadTokenRef.current) return;
          if (!usedCached) loadLocalAudio(nextTrack);
        });
      }
      
      return {
        ...prev,
        currentTrack: nextTrack,
        queueIndex: nextIndex,
        progress: 0,
      };
    });
  }, [loadYouTubeVideo, loadLocalAudio, loadCachedOrRemoteAudio, stopCurrentSource]);

  const previousTrack = useCallback(() => {
    setState(prev => {
      if (prev.queue.length === 0) return prev;
      
      let prevIndex = prev.queueIndex - 1;
      if (prevIndex < 0) {
        prevIndex = prev.repeat === 'all' ? prev.queue.length - 1 : 0;
      }
      
      const prevTrack = prev.queue[prevIndex];
      const myToken = ++loadTokenRef.current;
      stopCurrentSource();

      if (prevTrack.source === 'youtube' && prevTrack.youtubeId) {
        loadCachedOrRemoteAudio(prevTrack, myToken).then(usedCached => {
          if (myToken !== loadTokenRef.current) return;
          if (!usedCached) loadYouTubeVideo(prevTrack.youtubeId!);
        });
      } else {
        loadCachedOrRemoteAudio(prevTrack, myToken).then(usedCached => {
          if (myToken !== loadTokenRef.current) return;
          if (!usedCached) loadLocalAudio(prevTrack);
        });
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
    } else if (state.currentTrack.source === 'youtube' && youtubePlayerRef.current && typeof youtubePlayerRef.current.seekTo === 'function') {
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

  // Detect lyric availability for the current track (used to grey-out lyric icons)
  useEffect(() => {
    const track = state.currentTrack;
    if (!track || !track.youtubeId) {
      setHasLyrics(false);
      return;
    }
    let cancelled = false;
    setHasLyrics(false);
    (async () => {
      try {
        const { getCachedLyrics } = await import("@/lib/offlineCache");
        const cached = await getCachedLyrics(track.youtubeId!);
        if (cancelled) return;
        if (cached?.syncedLyrics?.trim() || cached?.plainLyrics?.trim()) {
          setHasLyrics(true);
          return;
        }
        if (!navigator.onLine) return;
        const { merged } = await fetchMergedSongRecord(
          { youtubeId: track.youtubeId, title: track.title, artist: track.artist, album: track.album },
          "synced_lyrics, plain_lyrics, lyrics_url",
        );
        if (cancelled) return;
        const m = merged as any;
        const has =
          !!(m?.synced_lyrics?.trim?.()) ||
          !!(m?.plain_lyrics?.trim?.()) ||
          !!(m?.lyrics_url);
        setHasLyrics(has);
      } catch {
        if (!cancelled) setHasLyrics(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.currentTrack?.id, state.currentTrack?.youtubeId]);

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
        isLossless,
        audioFormat,
        hasLyrics,
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
      isLossless: false,
      audioFormat: null,
      hasLyrics: false,
    } as PlayerContextType;
  }
  return context;
}
