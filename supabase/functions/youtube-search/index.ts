import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface YouTubeSearchResult {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
}

interface YouTubeVideoDetails {
  id: string;
  duration: number;
}

function parseDuration(duration: string): number {
  // Parse ISO 8601 duration (PT#H#M#S)
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}

async function getVideoDetails(videoIds: string[], apiKey: string): Promise<Map<string, number>> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  const durations = new Map<string, number>();
  
  if (data.items) {
    for (const item of data.items) {
      durations.set(item.id, parseDuration(item.contentDetails.duration));
    }
  }
  
  return durations;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    
    if (!apiKey) {
      throw new Error("YouTube API key not configured");
    }

    const { query, maxResults = 20 } = await req.json();
    
    if (!query) {
      throw new Error("Search query is required");
    }

    // Search for videos
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query + " music")}&type=video&videoCategoryId=10&maxResults=${maxResults}&key=${apiKey}`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (searchData.error) {
      throw new Error(searchData.error.message);
    }

    // Get video IDs for duration lookup
    const videoIds = searchData.items.map((item: any) => item.id.videoId);
    
    // Get durations for all videos
    const durations = await getVideoDetails(videoIds, apiKey);
    
    // Format results
    const results: YouTubeSearchResult[] = searchData.items.map((item: any) => {
      const snippet = item.snippet;
      
      // Try to extract artist from title or channel
      let title = snippet.title;
      let artist = snippet.channelTitle;
      
      // Common patterns: "Artist - Song Title" or "Song Title | Artist"
      const dashMatch = title.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch) {
        artist = dashMatch[1].trim();
        title = dashMatch[2].trim();
      }
      
      // Remove common suffixes
      title = title
        .replace(/\s*\(Official\s*(Video|Audio|Music\s*Video|Lyric\s*Video|Visualizer)\)/gi, '')
        .replace(/\s*\[(Official\s*(Video|Audio|Music\s*Video|Lyric\s*Video|Visualizer))\]/gi, '')
        .replace(/\s*\|\s*Official\s*(Video|Audio)/gi, '')
        .replace(/\s*\[HD\]/gi, '')
        .replace(/\s*\(HD\)/gi, '')
        .replace(/\s*\[4K\]/gi, '')
        .replace(/\s*\(Lyrics?\)/gi, '')
        .replace(/\s*\[Lyrics?\]/gi, '')
        .trim();
      
      return {
        id: item.id.videoId,
        title,
        artist,
        thumbnail: snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url || snippet.thumbnails.default?.url,
        duration: durations.get(item.id.videoId) || 0,
      };
    });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("YouTube search error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
