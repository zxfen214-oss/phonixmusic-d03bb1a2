import { supabase } from "@/integrations/supabase/client";
import { Track } from "@/types/music";

interface YouTubeSearchResult {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
}

export async function searchYouTube(query: string): Promise<Track[]> {
  // First, fetch admin-edited songs from the database that match the query
  const { data: editedSongs } = await supabase
    .from('songs')
    .select('*')
    .or(`title.ilike.%${query}%,artist.ilike.%${query}%,album.ilike.%${query}%`)
    .limit(10);

  // Create a map of edited songs by youtube_id for quick lookup
  const editedSongsMap = new Map<string, typeof editedSongs[number]>();
  if (editedSongs) {
    editedSongs.forEach(song => {
      if (song.youtube_id) {
        editedSongsMap.set(song.youtube_id, song);
      }
    });
  }

  // Then fetch from YouTube
  const { data, error } = await supabase.functions.invoke('youtube-search', {
    body: { query, maxResults: 20 },
  });

  if (error) {
    console.error('YouTube search error:', error);
    throw new Error(error.message || 'Failed to search YouTube');
  }

  if (data.error) {
    throw new Error(data.error);
  }

  // Convert results to Track format, merging with admin-edited data
  const youtubeResults: Track[] = data.results.map((result: YouTubeSearchResult) => {
    const editedSong = editedSongsMap.get(result.id);
    
    // If this song was edited by admin, use the admin data
    if (editedSong) {
      return {
        id: `yt-${result.id}`,
        title: editedSong.title || result.title,
        artist: editedSong.artist || result.artist,
        album: editedSong.album || 'YouTube',
        duration: editedSong.duration || result.duration,
        artwork: editedSong.cover_url || result.thumbnail,
        source: 'youtube' as const,
        youtubeId: result.id,
        addedAt: new Date(),
        hasLyrics: !!editedSong.lyrics_url,
        isEdited: true,
      };
    }

    return {
      id: `yt-${result.id}`,
      title: result.title,
      artist: result.artist,
      album: 'YouTube',
      duration: result.duration,
      artwork: result.thumbnail,
      source: 'youtube' as const,
      youtubeId: result.id,
      addedAt: new Date(),
    };
  });

  // Get edited songs that match but weren't in YouTube results
  const youtubeIds = new Set(data.results.map((r: YouTubeSearchResult) => r.id));
  const additionalEditedSongs: Track[] = [];
  
  if (editedSongs) {
    editedSongs.forEach(song => {
      if (song.youtube_id && !youtubeIds.has(song.youtube_id)) {
        additionalEditedSongs.push({
          id: `yt-${song.youtube_id}`,
          title: song.title,
          artist: song.artist,
          album: song.album || 'YouTube',
          duration: song.duration || 0,
          artwork: song.cover_url || '/placeholder.svg',
          source: 'youtube' as const,
          youtubeId: song.youtube_id,
          addedAt: new Date(),
          hasLyrics: !!song.lyrics_url,
          isEdited: true,
        });
      }
    });
  }

  // Sort: edited songs first, then by relevance
  const allResults = [...additionalEditedSongs, ...youtubeResults];
  allResults.sort((a, b) => {
    // Edited songs come first
    const aEdited = (a as any).isEdited ? 1 : 0;
    const bEdited = (b as any).isEdited ? 1 : 0;
    return bEdited - aEdited;
  });

  return allResults;
}

// Fetch lyrics from a lyrics API (using a free one)
export async function fetchLyrics(artist: string, title: string): Promise<string[] | null> {
  try {
    // Using lyrics.ovh API (free, no API key required)
    const response = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.lyrics) {
      // Split lyrics into lines and filter empty ones
      return data.lyrics
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
    }
    
    return null;
  } catch (error) {
    console.error('Failed to fetch lyrics:', error);
    return null;
  }
}
