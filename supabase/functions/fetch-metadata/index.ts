import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get authorization header to verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const songId = body.song_id as string | undefined;

    // Fetch songs that need metadata
    let query = supabase
      .from("songs")
      .select("id, title, artist, cover_url, lyrics_url, synced_lyrics, plain_lyrics")
      .eq("needs_metadata", true);

    if (songId) {
      query = query.eq("id", songId);
    }

    const { data: songs, error: fetchError } = await query;
    if (fetchError) throw fetchError;
    if (!songs || songs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No songs need metadata", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { id: string; title: string; coverFetched: boolean; lyricsFetched: boolean; error?: string }[] = [];

    for (const song of songs) {
      let coverFetched = false;
      let lyricsFetched = false;
      let songError: string | undefined;

      try {
        // 1. Fetch cover art from TheAudioDB if no cover exists
        if (!song.cover_url) {
          try {
            const audioDbUrl = `https://www.theaudiodb.com/api/v1/json/2/searchtrack.php?s=${encodeURIComponent(song.artist)}&t=${encodeURIComponent(song.title)}`;
            const audioDbRes = await fetch(audioDbUrl);
            if (audioDbRes.ok) {
              const audioDbData = await audioDbRes.json();
              const tracks = audioDbData?.track;
              if (tracks && tracks.length > 0) {
                const track = tracks[0];
                const imageUrl = track.strTrackThumb || track.strAlbumThumb || null;
                if (imageUrl) {
                  // Download and upload to storage
                  const imgRes = await fetch(imageUrl);
                  if (imgRes.ok) {
                    const imgBlob = await imgRes.blob();
                    const ext = imageUrl.includes(".png") ? "png" : "jpg";
                    const fileName = `covers/auto-${song.id}-${Date.now()}.${ext}`;

                    const { error: uploadErr } = await supabase.storage
                      .from("song-assets")
                      .upload(fileName, imgBlob, { contentType: imgBlob.type });

                    if (!uploadErr) {
                      const { data: urlData } = supabase.storage
                        .from("song-assets")
                        .getPublicUrl(fileName);
                      
                      await supabase
                        .from("songs")
                        .update({ cover_url: urlData.publicUrl })
                        .eq("id", song.id);
                      coverFetched = true;
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error(`Cover fetch failed for ${song.title}:`, e);
          }
        }

        // 2. Fetch lyrics from LRCLIB if no synced_lyrics
        if (!song.synced_lyrics && !song.lyrics_url) {
          try {
            const lrcUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(song.artist)}&track_name=${encodeURIComponent(song.title)}`;
            const lrcRes = await fetch(lrcUrl, {
              headers: { "User-Agent": "PhonixMusic/1.0" },
            });
            if (lrcRes.ok) {
              const lrcData = await lrcRes.json();

              const updates: Record<string, unknown> = {};

              if (lrcData.syncedLyrics) {
                updates.synced_lyrics = lrcData.syncedLyrics;

                // Also upload as .lrc file for existing lyrics system
                const lrcBlob = new Blob([lrcData.syncedLyrics], { type: "text/plain" });
                const lrcFileName = `lyrics/auto-${song.id}-${Date.now()}.lrc`;
                const { error: lrcUpErr } = await supabase.storage
                  .from("song-assets")
                  .upload(lrcFileName, lrcBlob, { contentType: "text/plain" });

                if (!lrcUpErr) {
                  const { data: lrcUrlData } = supabase.storage
                    .from("song-assets")
                    .getPublicUrl(lrcFileName);
                  updates.lyrics_url = lrcUrlData.publicUrl;
                }

                lyricsFetched = true;
              }

              if (lrcData.plainLyrics) {
                updates.plain_lyrics = lrcData.plainLyrics;
                if (!lyricsFetched) lyricsFetched = true;
              }

              if (Object.keys(updates).length > 0) {
                await supabase.from("songs").update(updates).eq("id", song.id);
              }
            }
          } catch (e) {
            console.error(`Lyrics fetch failed for ${song.title}:`, e);
          }
        }

        // 3. Mark needs_metadata = false
        await supabase
          .from("songs")
          .update({ needs_metadata: false })
          .eq("id", song.id);

      } catch (e) {
        songError = e instanceof Error ? e.message : String(e);
        console.error(`Error processing ${song.title}:`, e);
      }

      results.push({
        id: song.id,
        title: song.title,
        coverFetched,
        lyricsFetched,
        error: songError,
      });
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Metadata fetch error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
