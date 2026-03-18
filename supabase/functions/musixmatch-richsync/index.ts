import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BASE_URL = "https://www.musixmatch.com/ws/1.1/";

// ─── HMAC signature helpers ───

let cachedSecret: string | null = null;
let cachedSecretExpiry = 0;

async function getLatestAppUrl(): Promise<string> {
  const res = await fetch("https://www.musixmatch.com/search", {
    headers: { "User-Agent": USER_AGENT, Cookie: "mxm_bab=AB" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`MXM search page returned ${res.status}`);
  const html = await res.text();
  
  // Try multiple patterns to find the _app JS bundle
  const patterns = [
    /src="([^"]*\/_next\/static\/chunks\/pages\/_app-[^"]+\.js)"/g,
    /src="([^"]*\/_next\/static\/[^"]*_app[^"]*\.js)"/g,
    /src="([^"]*\/static\/chunks\/pages\/_app[^"]+\.js)"/g,
  ];
  
  for (const pattern of patterns) {
    const matches = [...html.matchAll(pattern)];
    if (matches.length > 0) {
      return matches[matches.length - 1][1];
    }
  }
  
  throw new Error("_app URL not found in Musixmatch HTML");
}

async function getSecret(): Promise<string> {
  // Cache for 1 hour max
  if (cachedSecret && Date.now() < cachedSecretExpiry) return cachedSecret;

  const appUrl = await getLatestAppUrl();
  console.log("Fetching MXM app JS from:", appUrl.substring(0, 100));
  const res = await fetch(appUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Failed to fetch MXM app JS: ${res.status}`);
  const js = await res.text();

  // Try multiple patterns to extract the secret
  const patterns = [
    /from\(\s*"(.*?)"\s*\.split/,
    /from\(\s*'(.*?)'\s*\.split/,
    /atob\(\s*"(.*?)"\s*\.split/,
    /\.from\("([A-Za-z0-9+/=]+)"\.split/,
  ];
  
  for (const pattern of patterns) {
    const match = js.match(pattern);
    if (match) {
      try {
        const reversed = match[1].split("").reverse().join("");
        const decoded = atob(reversed);
        cachedSecret = decoded;
        cachedSecretExpiry = Date.now() + 3600_000; // 1 hour
        console.log("MXM secret extracted successfully");
        return decoded;
      } catch (e) {
        console.warn("Failed to decode secret candidate:", e);
      }
    }
  }
  
  throw new Error("Secret not found in _app JS bundle");
}

async function generateSignature(url: string): Promise<string> {
  const secret = await getSecret();
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const message = url + y + m + d;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `&signature=${encodeURIComponent(b64)}&signature_protocol=sha256`;
}

async function mxmRequest(endpoint: string, retries = 3): Promise<Record<string, unknown>> {
  const cleanEndpoint = endpoint.replace(/%20/g, "+").replace(/ /g, "+");
  const url = BASE_URL + cleanEndpoint;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const signed = url + (await generateSignature(url));
      console.log(`MXM request (attempt ${attempt + 1}):`, url.substring(0, 120));
      const res = await fetch(signed, { 
        headers: { 
          "User-Agent": USER_AGENT,
          "Cookie": "mxm_bab=AB",
        },
        redirect: "follow",
      });
      
      if (!res.ok && attempt < retries) {
        console.warn(`MXM HTTP ${res.status}, clearing secret cache and retrying...`);
        cachedSecret = null;
        cachedSecretExpiry = 0;
        await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
        continue;
      }
      
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        const statusCode = (json as any)?.message?.header?.status_code;
        if (statusCode && statusCode >= 400 && attempt < retries) {
          console.warn(`MXM API status ${statusCode}, clearing secret and retrying in ${(attempt + 1) * 1500}ms...`);
          cachedSecret = null;
          cachedSecretExpiry = 0;
          await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
          continue;
        }
        return json;
      } catch {
        console.error("MXM non-JSON response (first 500 chars):", text.substring(0, 500));
        if (attempt < retries) {
          cachedSecret = null;
          cachedSecretExpiry = 0;
          await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
          continue;
        }
        throw new Error(`Musixmatch returned non-JSON response (status ${res.status})`);
      }
    } catch (e) {
      if (attempt < retries) {
        console.warn(`MXM fetch error (attempt ${attempt + 1}), retrying in ${(attempt + 1) * 1500}ms:`, e);
        cachedSecret = null;
        cachedSecretExpiry = 0;
        await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
        continue;
      }
      throw e;
    }
  }
  throw new Error("MXM request failed after all retries");
}

// ─── Richsync data conversion ───

interface RichSyncLine {
  ts: number;
  te: number;
  l: { c: string; o: number }[];
  x: string;
}

interface KaraokeWord {
  word: string;
  startTime: number;
  endTime: number;
  lineIndex: number;
}

const INSTRUMENTAL_GAP_THRESHOLD = 5;

function generateLRC(timedLines: { time: number; endTime: number; text: string }[]): string {
  if (timedLines.length === 0) return "";

  const output: string[] = [];

  for (let i = 0; i < timedLines.length; i++) {
    const line = timedLines[i];
    const prevEnd = i > 0 ? timedLines[i - 1].endTime : 0;
    const gap = line.time - prevEnd;

    if (gap >= INSTRUMENTAL_GAP_THRESHOLD) {
      const musicStart = formatLRCTime(prevEnd);
      const musicEnd = formatLRCTime(line.time);
      output.push(`<music>${musicStart}</music>${musicEnd}`);
    }

    output.push(`[${formatLRCTime(line.time)}]${line.text}`);
  }

  return output.join("\n");
}

function formatLRCTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = (seconds % 60).toFixed(2);
  return `${String(min).padStart(2, "0")}:${sec.padStart(5, "0")}`;
}

function convertRichSync(richsyncBody: string, lines: RichSyncLine[] | null): KaraokeWord[] {
  const parsed: RichSyncLine[] = lines || JSON.parse(richsyncBody);
  const words: KaraokeWord[] = [];

  for (let lineIdx = 0; lineIdx < parsed.length; lineIdx++) {
    const line = parsed[lineIdx];
    const chars = line.l;
    if (!chars || chars.length === 0) continue;

    let currentWord = "";
    let wordStartOffset = chars[0].o;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch.c === " " && currentWord.trim()) {
        words.push({
          word: currentWord.trim(),
          startTime: line.ts + wordStartOffset,
          endTime: line.ts + ch.o,
          lineIndex: lineIdx,
        });
        currentWord = "";
        wordStartOffset = i + 1 < chars.length ? chars[i + 1].o : ch.o;
      } else {
        if (!currentWord) wordStartOffset = ch.o;
        currentWord += ch.c;
      }
    }

    if (currentWord.trim()) {
      words.push({
        word: currentWord.trim(),
        startTime: line.ts + wordStartOffset,
        endTime: line.te,
        lineIndex: lineIdx,
      });
    }
  }

  return words;
}

function extractCoverUrl(track: any): string | null {
  return (
    track.album_coverart_800x800 ||
    track.album_coverart_500x500 ||
    track.album_coverart_350x350 ||
    track.album_coverart_100x100 ||
    null
  );
}

// ─── Edge function handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { artist, title, song_id } = body as {
      artist?: string;
      title?: string;
      song_id?: string;
    };

    if (!artist || !title) {
      return new Response(
        JSON.stringify({ error: "artist and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanForSearch = (s: string) =>
      s
        .replace(/\s*[-–—]\s*Topic$/i, "")
        .replace(/\s*\(Official\s*(Video|Audio|Music\s*Video|Lyric\s*Video|Visualizer)\)/gi, "")
        .replace(/\s*\[Official\s*(Video|Audio|Music\s*Video|Lyric\s*Video|Visualizer)\]/gi, "")
        .replace(/\s*\|\s*Lyrics$/i, "")
        .replace(/\s*\|\s*.*$/, "")
        .replace(/\s*(ft\.?|feat\.?)\s*/gi, " ")
        .replace(/\s*\(.*?(Remix|Edit|Version|Mix)\)/gi, "")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();

    const cleanArtist = cleanForSearch(artist);
    const cleanTitle = cleanForSearch(title);

    console.log(`Searching MXM for: "${cleanArtist}" - "${cleanTitle}" (original: "${artist}" - "${title}")`);

    // Step 1: Search for the track
    let trackList: any[] | null = null;

    const searchEndpoint1 = `track.search?app_id=web-desktop-app-v1.0&format=json&q=${encodeURIComponent(cleanArtist + " " + cleanTitle)}&f_has_lyrics=true&page_size=10&page=1`;
    const searchResult1 = await mxmRequest(searchEndpoint1);
    trackList = (searchResult1 as any)?.message?.body?.track_list;

    if (!trackList || trackList.length === 0) {
      console.log("Strategy 1 failed, trying q_artist + q_track...");
      const searchEndpoint2 = `track.search?app_id=web-desktop-app-v1.0&format=json&q_artist=${encodeURIComponent(cleanArtist)}&q_track=${encodeURIComponent(cleanTitle)}&f_has_lyrics=true&page_size=10&page=1`;
      const searchResult2 = await mxmRequest(searchEndpoint2);
      trackList = (searchResult2 as any)?.message?.body?.track_list;
    }

    if (!trackList || trackList.length === 0) {
      console.log("Strategy 2 failed, trying title-only search...");
      const searchEndpoint3 = `track.search?app_id=web-desktop-app-v1.0&format=json&q=${encodeURIComponent(cleanTitle)}&f_has_lyrics=true&page_size=10&page=1`;
      const searchResult3 = await mxmRequest(searchEndpoint3);
      trackList = (searchResult3 as any)?.message?.body?.track_list;
    }

    if (!trackList || trackList.length === 0) {
      return new Response(
        JSON.stringify({ error: "Track not found on Musixmatch", searched: `${cleanArtist} - ${cleanTitle}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const nArtist = normalise(cleanArtist);
    const nTitle = normalise(cleanTitle);

    let bestTrack = trackList[0].track;
    for (const item of trackList) {
      const t = item.track;
      if (
        normalise(t.artist_name).includes(nArtist) &&
        normalise(t.track_name).includes(nTitle)
      ) {
        bestTrack = t;
        break;
      }
    }

    const trackId = bestTrack.track_id;
    const commontrackId = bestTrack.commontrack_id;

    console.log(`Found track: ${bestTrack.track_name} by ${bestTrack.artist_name} (track_id: ${trackId})`);

    let coverUrl = extractCoverUrl(bestTrack);

    if (!coverUrl && bestTrack.album_id) {
      try {
        const albumEndpoint = `album.get?app_id=web-desktop-app-v1.0&format=json&album_id=${bestTrack.album_id}`;
        const albumResult = await mxmRequest(albumEndpoint);
        const albumData = (albumResult as any)?.message?.body?.album;
        if (albumData) {
          coverUrl = extractCoverUrl(albumData);
        }
      } catch (e) {
        console.warn("Failed to fetch album cover:", e);
      }
    }

    if (coverUrl) {
      console.log(`Found cover art: ${coverUrl}`);
    }

    // Step 2: Fetch plain lyrics
    let plainLyrics: string | null = null;
    try {
      const lyricsEndpoint = `track.lyrics.get?app_id=web-desktop-app-v1.0&format=json&track_id=${trackId}`;
      const lyricsResult = await mxmRequest(lyricsEndpoint);
      const lyricsBody = (lyricsResult as any)?.message?.body?.lyrics?.lyrics_body;
      if (lyricsBody) {
        plainLyrics = String(lyricsBody).replace(/\n?\*{7}[\s\S]*$/, '').trim();
        console.log(`Fetched plain lyrics (${plainLyrics.length} chars)`);
      }
    } catch (e) {
      console.warn("Failed to fetch plain lyrics:", e);
    }

    // Step 3: Fetch richsync
    const richsyncEndpoint = `track.richsync.get?app_id=web-desktop-app-v1.0&format=json&track_id=${trackId}${commontrackId ? `&commontrack_id=${commontrackId}` : ""}`;
    const richsyncResult = await mxmRequest(richsyncEndpoint);

    const richsyncData = (richsyncResult as any)?.message?.body?.richsync;
    if (!richsyncData?.richsync_body) {
      const subtitleEndpoint = `track.subtitle.get?app_id=web-desktop-app-v1.0&format=json&track_id=${trackId}`;
      const subtitleResult = await mxmRequest(subtitleEndpoint);
      const subtitle = (subtitleResult as any)?.message?.body?.subtitle;

      if (subtitle?.subtitle_body) {
        const rawBody = String(subtitle.subtitle_body);
        let lrcLines: string;

        if (rawBody.trimStart().startsWith("[{")) {
          try {
            const parsed = JSON.parse(rawBody);
            const timedLines = parsed.map((l: { time: { total: number }; text: string }, i: number) => {
              const nextTime = i < parsed.length - 1 ? parsed[i + 1].time.total : l.time.total + 5;
              return { time: l.time.total, endTime: nextTime, text: l.text };
            });
            lrcLines = generateLRC(timedLines);
          } catch {
            lrcLines = rawBody;
          }
        } else {
          lrcLines = rawBody;
        }

        if (song_id) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, serviceKey);
          const updatePayload: Record<string, unknown> = { synced_lyrics: lrcLines, lyrics_url: null };
          if (plainLyrics) updatePayload.plain_lyrics = plainLyrics;
          if (coverUrl) updatePayload.cover_url = coverUrl;
          await supabase
            .from("songs")
            .update(updatePayload)
            .eq("id", song_id);
        }

        return new Response(
          JSON.stringify({
            type: "subtitle",
            track: `${bestTrack.track_name} by ${bestTrack.artist_name}`,
            synced_lyrics: lrcLines,
            lines_count: lrcLines.split("\n").filter((l: string) => l.trim()).length,
            cover_url: coverUrl,
            saved: !!song_id,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          error: "No richsync or subtitle data available for this track",
          track: `${bestTrack.track_name} by ${bestTrack.artist_name}`,
          track_id: trackId,
          cover_url: coverUrl,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const karaokeWords = convertRichSync(richsyncData.richsync_body, null);

    if (karaokeWords.length === 0) {
      console.warn("Richsync returned 0 karaoke words");
      return new Response(
        JSON.stringify({ error: "Richsync data contained 0 words", track: `${bestTrack.track_name} by ${bestTrack.artist_name}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const richLines: RichSyncLine[] = JSON.parse(richsyncData.richsync_body);
    const timedRichLines = richLines.map((l) => ({
      time: l.ts,
      endTime: l.te,
      text: l.x || l.l.map((c) => c.c).join(""),
    }));
    const lrcFromRich = generateLRC(timedRichLines);

    if (song_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);
      const updatePayload: Record<string, unknown> = {
        karaoke_enabled: true,
        karaoke_data: { words: karaokeWords },
        synced_lyrics: lrcFromRich,
        lyrics_url: null,
      };
      if (plainLyrics) updatePayload.plain_lyrics = plainLyrics;
      if (coverUrl) updatePayload.cover_url = coverUrl;
      await supabase
        .from("songs")
        .update(updatePayload)
        .eq("id", song_id);
    }

    return new Response(
      JSON.stringify({
        type: "richsync",
        track: `${bestTrack.track_name} by ${bestTrack.artist_name}`,
        track_id: trackId,
        words_count: karaokeWords.length,
        lines_count: richLines.length,
        karaoke_data: { words: karaokeWords },
        synced_lyrics: lrcFromRich,
        cover_url: coverUrl,
        saved: !!song_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Musixmatch richsync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
