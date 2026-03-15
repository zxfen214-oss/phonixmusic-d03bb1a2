export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  artwork?: string;
  source: 'local' | 'youtube';
  youtubeId?: string;
  filePath?: string;
  addedAt: Date;
  hasLyrics?: boolean; // Whether the track has lyrics attached
  isEdited?: boolean; // Whether the track was edited by admin
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  artwork?: string;
  tracks: Track[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number; // 0-100
  volume: number; // 0-100
  queue: Track[];
  queueIndex: number;
  shuffle: boolean;
  repeat: 'none' | 'one' | 'all';
}
