import { Track } from "@/types/music";

export interface PopularTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  youtubeId: string;
  duration: number;
}

export const popularTracks: PopularTrack[] = [
  {
    id: "popular-1",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    coverUrl: "https://i.ytimg.com/vi/4NRXx6U8ABQ/maxresdefault.jpg",
    youtubeId: "4NRXx6U8ABQ",
    duration: 200,
  },
  {
    id: "popular-2",
    title: "Shape of You",
    artist: "Ed Sheeran",
    album: "÷ (Divide)",
    coverUrl: "https://i.ytimg.com/vi/JGwWNGJdvx8/maxresdefault.jpg",
    youtubeId: "JGwWNGJdvx8",
    duration: 234,
  },
  {
    id: "popular-3",
    title: "Levitating",
    artist: "Dua Lipa",
    album: "Future Nostalgia",
    coverUrl: "https://i.ytimg.com/vi/TUVcZfQe-Kw/maxresdefault.jpg",
    youtubeId: "TUVcZfQe-Kw",
    duration: 203,
  },
  {
    id: "popular-4",
    title: "Stay",
    artist: "The Kid LAROI & Justin Bieber",
    album: "F*CK LOVE 3",
    coverUrl: "https://i.ytimg.com/vi/kTJczUoc26U/maxresdefault.jpg",
    youtubeId: "kTJczUoc26U",
    duration: 141,
  },
  {
    id: "popular-5",
    title: "Peaches",
    artist: "Justin Bieber",
    album: "Justice",
    coverUrl: "https://i.ytimg.com/vi/tQ0yjYUFKAE/maxresdefault.jpg",
    youtubeId: "tQ0yjYUFKAE",
    duration: 198,
  },
  {
    id: "popular-6",
    title: "Montero",
    artist: "Lil Nas X",
    album: "Montero",
    coverUrl: "https://i.ytimg.com/vi/6swmTBVI83k/maxresdefault.jpg",
    youtubeId: "6swmTBVI83k",
    duration: 137,
  },
];

export function convertPopularToTrack(popular: PopularTrack): Track {
  return {
    id: popular.id,
    title: popular.title,
    artist: popular.artist,
    album: popular.album,
    coverUrl: popular.coverUrl,
    youtubeId: popular.youtubeId,
    duration: popular.duration,
    audioUrl: null,
    lyrics: null,
    syncedLyrics: null,
    lrcUrl: null,
    karaokeData: null,
    karaokeEnabled: false,
    karaokeColor: null,
    lyricColor: null,
    bounceIntensity: null,
    lyricsSpeed: null,
    needsMetadata: false,
  };
}
