// Popular tracks to show in the library when empty
export interface PopularTrack {
  youtubeId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
}

export const popularTracks: PopularTrack[] = [
  {
    youtubeId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    duration: 213,
  },
  {
    youtubeId: "kJQP7kiw5Fk",
    title: "Despacito",
    artist: "Luis Fonsi ft. Daddy Yankee",
    thumbnail: "https://img.youtube.com/vi/kJQP7kiw5Fk/mqdefault.jpg",
    duration: 282,
  },
  {
    youtubeId: "JGwWNGJdvx8",
    title: "Shape of You",
    artist: "Ed Sheeran",
    thumbnail: "https://img.youtube.com/vi/JGwWNGJdvx8/mqdefault.jpg",
    duration: 263,
  },
  {
    youtubeId: "RgKAFK5djSk",
    title: "See You Again",
    artist: "Wiz Khalifa ft. Charlie Puth",
    thumbnail: "https://img.youtube.com/vi/RgKAFK5djSk/mqdefault.jpg",
    duration: 237,
  },
  {
    youtubeId: "OPf0YbXqDm0",
    title: "Uptown Funk",
    artist: "Mark Ronson ft. Bruno Mars",
    thumbnail: "https://img.youtube.com/vi/OPf0YbXqDm0/mqdefault.jpg",
    duration: 271,
  },
  {
    youtubeId: "09R8_2nJtjg",
    title: "Sugar",
    artist: "Maroon 5",
    thumbnail: "https://img.youtube.com/vi/09R8_2nJtjg/mqdefault.jpg",
    duration: 311,
  },
  {
    youtubeId: "fRh_vgS2dFE",
    title: "Sorry",
    artist: "Justin Bieber",
    thumbnail: "https://img.youtube.com/vi/fRh_vgS2dFE/mqdefault.jpg",
    duration: 201,
  },
  {
    youtubeId: "60ItHLz5WEA",
    title: "Hello",
    artist: "Adele",
    thumbnail: "https://img.youtube.com/vi/60ItHLz5WEA/mqdefault.jpg",
    duration: 367,
  },
  {
    youtubeId: "ktvTqknDobU",
    title: "Radioactive",
    artist: "Imagine Dragons",
    thumbnail: "https://img.youtube.com/vi/ktvTqknDobU/mqdefault.jpg",
    duration: 187,
  },
  {
    youtubeId: "YQHsXMglC9A",
    title: "Hello",
    artist: "Adele",
    thumbnail: "https://img.youtube.com/vi/YQHsXMglC9A/mqdefault.jpg",
    duration: 364,
  },
  {
    youtubeId: "e-ORhEE9VVg",
    title: "Blank Space",
    artist: "Taylor Swift",
    thumbnail: "https://img.youtube.com/vi/e-ORhEE9VVg/mqdefault.jpg",
    duration: 272,
  },
  {
    youtubeId: "hT_nvWreIhg",
    title: "Counting Stars",
    artist: "OneRepublic",
    thumbnail: "https://img.youtube.com/vi/hT_nvWreIhg/mqdefault.jpg",
    duration: 257,
  },
];

export function convertPopularToTrack(popular: PopularTrack) {
  return {
    id: `yt-${popular.youtubeId}`,
    title: popular.title,
    artist: popular.artist,
    album: "YouTube",
    duration: popular.duration,
    artwork: popular.thumbnail,
    source: 'youtube' as const,
    youtubeId: popular.youtubeId,
    addedAt: new Date(),
  };
}
