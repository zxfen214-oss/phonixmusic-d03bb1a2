import { useState, useEffect, useRef, useCallback } from "react";
import { Track } from "@/types/music";
import { getAudioFile } from "@/lib/database";
import { getCachedAudio, isAudioCached } from "@/lib/offlineCache";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface AudioPlayerState {
  isReady: boolean;
  duration: number;
  currentTime: number;
}

export function useAudioPlayer(track: Track | null, isPlaying: boolean, onEnded: () => void) {
  const [state, setState] = useState<AudioPlayerState>({
    isReady: false,
    duration: 0,
    currentTime: 0,
  });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerRef = useRef<any>(null);
  const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  // Tracks which actual backend is in use ('audio' = HTMLAudioElement, 'youtube' = YT iframe)
  const playbackBackendRef = useRef<'audio' | 'youtube' | null>(null);

  // Initialize YouTube API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Clean up object URLs
  const cleanupObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // Load track
  useEffect(() => {
    if (!track) return;

    const loadTrack = async () => {
      // Cleanup previous
      if (youtubePlayerRef.current) {
        try { youtubePlayerRef.current.destroy(); } catch {}
        youtubePlayerRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      cleanupObjectUrl();
      playbackBackendRef.current = null;
      setState({ isReady: false, duration: 0, currentTime: 0 });

      const setupHtmlAudio = (src: string, isBlobUrl: boolean) => {
        const audio = new Audio();
        audio.preload = 'auto';
        if (!isBlobUrl) audio.crossOrigin = 'anonymous';
        audio.src = src;

        audio.addEventListener('loadedmetadata', () => {
          setState(prev => ({
            ...prev,
            isReady: true,
            duration: audio.duration,
          }));
        });
        audio.addEventListener('ended', onEnded);

        audioRef.current = audio;
        playbackBackendRef.current = 'audio';

        if (isPlaying) {
          audio.play().catch(console.error);
        }
      };

      if (track.source === 'youtube' && track.youtubeId) {
        // First check if we have cached audio for this YouTube track
        const cachedBlob = await getCachedAudio(track.youtubeId);

        if (cachedBlob) {
          console.log('Playing from offline cache:', track.title);
          objectUrlRef.current = URL.createObjectURL(cachedBlob);
          setupHtmlAudio(objectUrlRef.current, true);
          return;
        }

        // Check if there's a direct audio URL in the database (only when online)
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          const { data: songData } = await supabase
            .from('songs')
            .select('audio_url')
            .eq('youtube_id', track.youtubeId)
            .maybeSingle();

          if (songData?.audio_url) {
            console.log('Playing from direct audio URL:', track.title);
            setupHtmlAudio(songData.audio_url, false);
            return;
          }
        }

        // Fall back to YouTube player
        const waitForYT = () => {
          return new Promise<void>((resolve) => {
            if (window.YT && window.YT.Player) {
              resolve();
            } else {
              window.onYouTubeIframeAPIReady = () => resolve();
            }
          });
        };

        await waitForYT();

        if (!youtubeContainerRef.current) {
          youtubeContainerRef.current = document.createElement('div');
          youtubeContainerRef.current.id = 'youtube-player';
          youtubeContainerRef.current.style.position = 'absolute';
          youtubeContainerRef.current.style.left = '-9999px';
          youtubeContainerRef.current.style.top = '-9999px';
          document.body.appendChild(youtubeContainerRef.current);
        }

        playbackBackendRef.current = 'youtube';
        youtubePlayerRef.current = new window.YT.Player(youtubeContainerRef.current, {
          height: '1',
          width: '1',
          videoId: track.youtubeId,
          playerVars: {
            autoplay: isPlaying ? 1 : 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
          },
          events: {
            onReady: (event: any) => {
              setState(prev => ({
                ...prev,
                isReady: true,
                duration: event.target.getDuration(),
              }));
              if (isPlaying) {
                event.target.playVideo();
              }
            },
            onStateChange: (event: any) => {
              if (event.data === window.YT.PlayerState.ENDED) {
                onEnded();
              }
            },
          },
        });
      } else if (track.source === 'local') {
        const audioBlob = await getAudioFile(track.id);
        if (audioBlob) {
          objectUrlRef.current = URL.createObjectURL(audioBlob);
          setupHtmlAudio(objectUrlRef.current, true);
        } else {
          console.error('Audio file not found for track:', track.id);
        }
      }
    };

    loadTrack();

    return () => {
      cleanupObjectUrl();
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [track?.id]);

  // Handle play/pause
  useEffect(() => {
    if (!state.isReady) return;
    const backend = playbackBackendRef.current;

    if (backend === 'youtube' && youtubePlayerRef.current) {
      if (isPlaying) youtubePlayerRef.current.playVideo();
      else youtubePlayerRef.current.pauseVideo();
    } else if (backend === 'audio' && audioRef.current) {
      if (isPlaying) audioRef.current.play().catch(console.error);
      else audioRef.current.pause();
    }
  }, [isPlaying, state.isReady]);

  // Progress tracking
  useEffect(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    if (isPlaying && state.isReady) {
      progressIntervalRef.current = window.setInterval(() => {
        let currentTime = 0;
        const backend = playbackBackendRef.current;

        if (backend === 'youtube' && youtubePlayerRef.current?.getCurrentTime) {
          currentTime = youtubePlayerRef.current.getCurrentTime();
        } else if (backend === 'audio' && audioRef.current) {
          currentTime = audioRef.current.currentTime;
        }

        setState(prev => ({ ...prev, currentTime }));
      }, 250);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying, state.isReady]);

  const seekTo = useCallback((time: number) => {
    const backend = playbackBackendRef.current;
    if (backend === 'youtube' && youtubePlayerRef.current) {
      youtubePlayerRef.current.seekTo(time, true);
    } else if (backend === 'audio' && audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setState(prev => ({ ...prev, currentTime: time }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const normalizedVolume = volume / 100;
    const backend = playbackBackendRef.current;
    if (backend === 'youtube' && youtubePlayerRef.current) {
      youtubePlayerRef.current.setVolume(volume);
    } else if (backend === 'audio' && audioRef.current) {
      audioRef.current.volume = normalizedVolume;
    }
  }, []);

  return {
    ...state,
    seekTo,
    setVolume,
  };
}
