import { useState, useEffect } from "react";
import { Track } from "@/types/music";
import { supabase } from "@/integrations/supabase/client";
import { uploadPublicStorageFile } from "@/lib/storageUploads";
import { saveAudioFile } from "@/lib/database";
import { fetchMergedSongRecord, saveSongRecord, updateSongRecordsByIds } from "@/lib/songRecords";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Upload, 
  Music, 
  FileText,
  Loader2,
  Save,
  Image as ImageIcon,
  Edit3,
  Mic2,
  Users,
  Music2,
  Check,
  Link,
  Terminal,
  Plus,
  Trash2,
  Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { LRCEditor } from "./LRCEditor";
import { KaraokeEditor } from "./KaraokeEditor";

interface AdminSongEditorProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (updatedTrack: Track) => void;
}

/** Parse a Musixmatch URL like musixmatch.com/lyrics/Artist-Name/Song-Title */
function parseMxmUrl(url: string): { artist: string; title: string } | null {
  try {
    const match = url.match(/musixmatch\.com\/lyrics\/([^/]+)\/([^/?#]+)/i);
    if (!match) return null;
    const artist = decodeURIComponent(match[1]).replace(/-/g, ' ');
    const title = decodeURIComponent(match[2]).replace(/-/g, ' ');
    return { artist, title };
  } catch {
    return null;
  }
}

export function AdminSongEditor({ track, isOpen, onClose, onSave }: AdminSongEditorProps) {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingKaraoke, setIsFetchingKaraoke] = useState(false);
  const [mxmFetchFailed, setMxmFetchFailed] = useState(false);
  const [mxmCustomArtist, setMxmCustomArtist] = useState('');
  const [mxmCustomTitle, setMxmCustomTitle] = useState('');
  const [mxmUrl, setMxmUrl] = useState('');
  const [editorTab, setEditorTab] = useState('general');
  const [formData, setFormData] = useState({
    title: track.title,
    artist: track.artist,
    album: track.album,
    lyricsSpeed: 0.75,
    bounceIntensity: 0.5,
    karaokeColor: '',
    lyricColor: '',
    writtenBy: '',
    creditsNames: '',
    earlyAppearance: 0,
    mobileCharLimit: 9,
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [lyricsFile, setLyricsFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(track.artwork || null);
  const [existingSong, setExistingSong] = useState<{
    id: string;
    lyrics_url: string | null;
    lyrics_speed: number | null;
    bounce_intensity: number | null;
    audio_url: string | null;
    karaoke_color: string | null;
    lyric_color: string | null;
    synced_lyrics: string | null;
    plain_lyrics: string | null;
    karaoke_data: any;
  } | null>(null);
  const [plainLyrics, setPlainLyrics] = useState("");
  
  const [userLibraryInfo, setUserLibraryInfo] = useState<{
    count: number;
    users: { user_id: string; added_at: string }[];
  }>({ count: 0, users: [] });
  
  // Special commands state
  const [specialCommands, setSpecialCommands] = useState<{ time: string; command: string }[]>([]);
  
  const [showLRCEditor, setShowLRCEditor] = useState(false);
  const [showKaraokeEditor, setShowKaraokeEditor] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkExistingSong();
    }
  }, [isOpen, track.id, track.youtubeId, track.title, track.artist]);

  const checkExistingSong = async () => {
    try {
      const selectFields = "id, youtube_id, title, artist, lyrics_url, lyrics_speed, bounce_intensity, audio_url, karaoke_color, lyric_color, synced_lyrics, plain_lyrics, written_by, credits_names, karaoke_data";
      const { merged } = await fetchMergedSongRecord(
        { youtubeId: track.youtubeId, title: track.title, artist: track.artist, album: track.album },
        selectFields
      );

      if (merged) {
        const karaokeData = merged.karaoke_data as any;
        setExistingSong({
          id: merged.id,
          lyrics_url: merged.lyrics_url ?? null,
          lyrics_speed: merged.lyrics_speed ?? 0.75,
          bounce_intensity: (merged as any).bounce_intensity ?? 0.5,
          audio_url: merged.audio_url ?? null,
          karaoke_color: merged.karaoke_color ?? null,
          lyric_color: merged.lyric_color ?? null,
          synced_lyrics: merged.synced_lyrics ?? null,
          plain_lyrics: (merged as any).plain_lyrics ?? null,
          karaoke_data: karaokeData ?? null,
        });
        setFormData(prev => ({
          ...prev,
          lyricsSpeed: merged.lyrics_speed ?? 0.75,
          bounceIntensity: (merged as any).bounce_intensity ?? 0.5,
          karaokeColor: merged.karaoke_color || '',
          lyricColor: merged.lyric_color || '',
          writtenBy: (merged as any).written_by || '',
          creditsNames: (merged as any).credits_names || '',
          earlyAppearance: karaokeData?.early_appearance ?? 0,
          mobileCharLimit: karaokeData?.mobile_char_limit ?? 9,
        }));
        setPlainLyrics((merged as any).plain_lyrics || "");

        if (merged.synced_lyrics) {
          parseSpecialCommands(merged.synced_lyrics);
        }
      } else {
        setExistingSong(null);
      }

      if (track.youtubeId) {
        const { data: libraryData, count } = await supabase
          .from("user_song_library")
          .select("user_id, added_at", { count: 'exact' })
          .eq("song_youtube_id", track.youtubeId);

        if (libraryData) {
          setUserLibraryInfo({
            count: count || libraryData.length,
            users: libraryData,
          });
        }
      } else {
        setUserLibraryInfo({ count: 0, users: [] });
      }
    } catch (error) {
      console.error("Failed to check existing song:", error);
      setExistingSong(null);
      setUserLibraryInfo({ count: 0, users: [] });
    }
  };

  const parseSpecialCommands = (lyrics: string) => {
    const commands: { time: string; command: string }[] = [];
    const lines = lyrics.split('\n');
    for (const line of lines) {
      // Match lines with special commands like <right>, <left>, <music>...</music>, <nl>
      const timeMatch = line.match(/^\[(\d{2}:\d{2}\.\d{2})\]\s*(<(?:right|left|nl)>.*|<music>.*)/i);
      if (timeMatch) {
        commands.push({ time: timeMatch[1], command: timeMatch[2] || line.replace(/^\[\d{2}:\d{2}\.\d{2}\]\s*/, '') });
      }
      // Match standalone <music> tags
      const musicMatch = line.match(/^<music>(\d{2}:\d{2}\.\d{2})<\/music>(\d{2}:\d{2}\.\d{2})/);
      if (musicMatch) {
        commands.push({ time: musicMatch[1], command: `<music>${musicMatch[1]}</music>${musicMatch[2]}` });
      }
    }
    setSpecialCommands(commands);
  };

  const addSpecialCommand = () => {
    setSpecialCommands(prev => [...prev, { time: '00:00.00', command: '<right>' }]);
  };

  const removeSpecialCommand = (index: number) => {
    setSpecialCommands(prev => prev.filter((_, i) => i !== index));
  };

  const updateSpecialCommand = (index: number, field: 'time' | 'command', value: string) => {
    setSpecialCommands(prev => prev.map((cmd, i) => i === index ? { ...cmd, [field]: value } : cmd));
  };

  const applySpecialCommands = async () => {
    if (!existingSong?.id) {
      toast({ title: "Error", description: "Save the song first before adding special commands", variant: "destructive" });
      return;
    }
    
    // Fetch current synced_lyrics
    const { data } = await supabase.from("songs").select("synced_lyrics").eq("id", existingSong.id).single();
    if (!data?.synced_lyrics) {
      toast({ title: "Error", description: "No synced lyrics to add commands to", variant: "destructive" });
      return;
    }
    
    let lyrics = data.synced_lyrics;
    
    // Remove existing special command lines first
    const lines = lyrics.split('\n').filter(line => {
      // Keep regular lyric lines, remove standalone special commands
      const isStandaloneSpecial = /^\[(\d{2}:\d{2}\.\d{2})\]\s*<(right|left|nl)>$/.test(line) ||
                                   /^<music>\d{2}:\d{2}\.\d{2}<\/music>\d{2}:\d{2}\.\d{2}$/.test(line);
      return !isStandaloneSpecial;
    });
    
    // Insert special commands at the right positions
    for (const cmd of specialCommands) {
      if (cmd.command.startsWith('<music>')) {
        // Music tags go as standalone lines
        lines.push(cmd.command);
      } else {
        // Alignment/nl commands attach to the timestamp
        lines.push(`[${cmd.time}] ${cmd.command}`);
      }
    }
    
    // Sort lines by timestamp
    lines.sort((a, b) => {
      const getTime = (l: string) => {
        const m = l.match(/\[(\d{2}):(\d{2}\.\d{2})\]/);
        if (m) return parseFloat(m[1]) * 60 + parseFloat(m[2]);
        const m2 = l.match(/<music>(\d{2}):(\d{2}\.\d{2})<\/music>/);
        if (m2) return parseFloat(m2[1]) * 60 + parseFloat(m2[2]);
        return 9999;
      };
      return getTime(a) - getTime(b);
    });
    
    const newLyrics = lines.join('\n');
    
    const { error } = await supabase.from("songs").update({ synced_lyrics: newLyrics }).eq("id", existingSong.id);
    if (error) {
      toast({ title: "Error", description: "Failed to apply commands", variant: "destructive" });
    } else {
      toast({ title: "Success", description: `Applied ${specialCommands.length} special command(s)` });
      setExistingSong({ ...existingSong, synced_lyrics: newLyrics });
    }
  };

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    try {
      return await uploadPublicStorageFile(file, folder);
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Error",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
      return null;
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.artist) {
      toast({ title: "Error", description: "Title and artist are required", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    try {
      let coverUrl = track.artwork || null;
      let lyricsUrl = existingSong?.lyrics_url || null;
      let audioUrl = existingSong?.audio_url || null;
      let syncedLyricsContent: string | null = existingSong?.synced_lyrics || null;

      if (coverFile) {
        const url = await uploadFile(coverFile, "covers");
        if (url) coverUrl = url;
      }

      if (lyricsFile) {
        // Read file content for synced_lyrics (source of truth)
        try {
          syncedLyricsContent = await lyricsFile.text();
        } catch (e) {
          console.warn("Failed to read LRC file text:", e);
        }
        const url = await uploadFile(lyricsFile, "lyrics");
        if (url) lyricsUrl = url;
      }

      if (audioFile) {
        const url = await uploadFile(audioFile, "audio");
        if (url) {
          audioUrl = url;
          await saveAudioFile(track.id, audioFile, audioFile.type || "audio/mpeg");
        }
      }

      // Merge early_appearance and mobile_char_limit into karaoke_data
      const existingKaraokeData = existingSong?.karaoke_data || {};
      const mergedKaraokeData = {
        ...existingKaraokeData,
        early_appearance: formData.earlyAppearance,
        mobile_char_limit: formData.mobileCharLimit,
      };

      const baseSongData: Record<string, any> = {
        title: formData.title,
        artist: formData.artist,
        album: formData.album || null,
        duration: track.duration,
        youtube_id: track.youtubeId || null,
        cover_url: coverUrl,
        lyrics_url: lyricsUrl,
        lyrics_speed: formData.lyricsSpeed,
        bounce_intensity: formData.bounceIntensity,
        audio_url: audioUrl,
        karaoke_color: formData.karaokeColor || null,
        lyric_color: formData.lyricColor || null,
        plain_lyrics: plainLyrics || null,
        written_by: formData.writtenBy || null,
        credits_names: formData.creditsNames || null,
        synced_lyrics: syncedLyricsContent,
        karaoke_data: mergedKaraokeData,
      };

      // Use resilient save that handles duplicates and missing columns
      const lookup = { youtubeId: track.youtubeId, title: formData.title, artist: formData.artist, album: formData.album };
      const insertPayload = {
        youtube_id: track.youtubeId || null,
        duration: track.duration,
      };
      await saveSongRecord(lookup, baseSongData, insertPayload);

      toast({ title: "Success", description: "Song updated successfully" });

      const updatedTrack: Track = {
        ...track,
        title: formData.title,
        artist: formData.artist,
        album: formData.album,
        artwork: coverUrl || track.artwork,
      };

      onSave?.(updatedTrack);
      await checkExistingSong();
      onClose();
    } catch (error: any) {
      console.error("Save error:", error?.code, error?.message, error?.details, error?.hint, error);
      toast({ title: "Error", description: `Failed to save song: ${error?.message || 'Unknown error'}`, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveAudio = async () => {
    if (!existingSong) return;
    const { error } = await supabase.from("songs").update({ audio_url: null }).eq("id", existingSong.id);
    if (error) {
      toast({ title: "Error", description: "Failed to remove audio", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Audio removed" });
      setExistingSong({ ...existingSong, audio_url: null });
      setAudioFile(null);
    }
  };

  const handleRemoveLyrics = async () => {
    if (!existingSong) return;
    const { error } = await supabase.from("songs").update({ lyrics_url: null }).eq("id", existingSong.id);
    if (error) {
      toast({ title: "Error", description: "Failed to remove lyrics", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Lyrics removed" });
      setExistingSong({ ...existingSong, lyrics_url: null });
    }
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setCoverPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleFetchKaraoke = async (artistOverride?: string, titleOverride?: string) => {
    setIsFetchingKaraoke(true);
    try {
      let songId = existingSong?.id;
      if (!songId) {
        const { data: newSong, error: insertErr } = await supabase
          .from("songs")
          .insert({
            title: formData.title,
            artist: formData.artist,
            album: formData.album || null,
            duration: track.duration,
            youtube_id: track.youtubeId || null,
            cover_url: track.artwork || null,
          })
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        songId = newSong.id;
      }

      const searchArtist = artistOverride || mxmCustomArtist || formData.artist;
      const searchTitle = titleOverride || mxmCustomTitle || formData.title;

      // Use fetch directly with a longer timeout (90s) to avoid default timeout issues
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/musixmatch-richsync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({ artist: searchArtist, title: searchTitle, song_id: songId }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      const error = !response.ok ? new Error(data?.error || 'Request failed') : null;
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Musixmatch", description: data.error, variant: "destructive" });
        setMxmFetchFailed(true);
        setMxmCustomArtist(formData.artist);
        setMxmCustomTitle(formData.title);
      } else {
        toast({
          title: "Karaoke Fetched!",
          description: `${data.type === 'richsync' ? 'Word-level' : 'Line-level'} sync: ${data.words_count || 0} words, ${data.lines_count || 0} lines. Saved to DB.`,
        });
        setMxmFetchFailed(false);
        setMxmCustomArtist('');
        setMxmCustomTitle('');
        setMxmUrl('');
        checkExistingSong();
      }
    } catch (e) {
      console.error("Musixmatch fetch error:", e);
      toast({ title: "Error", description: "Failed to fetch karaoke data", variant: "destructive" });
      setMxmFetchFailed(true);
      setMxmCustomArtist(formData.artist);
      setMxmCustomTitle(formData.title);
    } finally {
      setIsFetchingKaraoke(false);
    }
  };

  const handleFetchFromUrl = () => {
    const parsed = parseMxmUrl(mxmUrl);
    if (!parsed) {
      toast({ title: "Invalid URL", description: "Paste a valid Musixmatch lyrics URL", variant: "destructive" });
      return;
    }
    handleFetchKaraoke(parsed.artist, parsed.title);
  };

  if (!isAdmin) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5 text-accent" />
            Edit Song
          </DialogTitle>
        </DialogHeader>

        <Tabs value={editorTab} onValueChange={setEditorTab}>
          <TabsList className="w-full">
            <TabsTrigger value="general" className="flex-1 text-xs">General</TabsTrigger>
            <TabsTrigger value="lyrics" className="flex-1 text-xs">Lyrics</TabsTrigger>
            <TabsTrigger value="commands" className="flex-1 text-xs gap-1">
              <Terminal className="h-3 w-3" />
              Commands
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4 pt-2"
            >
              {/* Cover Preview/Upload */}
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="w-24 h-24 rounded-xl bg-secondary overflow-hidden border-2 border-dashed border-border">
                    {coverPreview ? (
                      <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <label className="absolute -bottom-1 -right-1 p-1.5 bg-accent text-accent-foreground rounded-full cursor-pointer hover:bg-accent/90 transition-colors shadow-lg">
                    <Upload className="h-3 w-3" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
                  </label>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs h-7 mt-1"
                  onClick={async () => {
                    try {
                      const res = await fetch(`https://theaudiodb.com/api/v1/json/1/searchalbum.php?s=${encodeURIComponent(formData.artist)}&a=${encodeURIComponent(formData.album || '')}`);
                      const data = await res.json();
                      const thumb = data?.album?.[0]?.strAlbumThumb;
                      if (thumb) {
                        setCoverPreview(thumb);
                        // Set as cover URL directly
                        setCoverFile(null);
                        // Save directly
                        if (existingSong) {
                          await supabase.from("songs").update({ cover_url: thumb }).eq("id", existingSong.id);
                        }
                        toast({ title: "Cover Found", description: "AudioDB cover art applied" });
                      } else {
                        toast({ title: "Not Found", description: "No cover art found on AudioDB", variant: "destructive" });
                      }
                    } catch {
                      toast({ title: "Error", description: "Failed to fetch from AudioDB", variant: "destructive" });
                    }
                  }}
                >
                  <Globe className="h-3 w-3" />
                  AudioDB
                </Button>

                <div className="flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="title" className="text-xs">Title</Label>
                    <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Song title" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="artist" className="text-xs">Artist</Label>
                    <Input id="artist" value={formData.artist} onChange={(e) => setFormData({ ...formData, artist: e.target.value })} placeholder="Artist name" className="h-9" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="album" className="text-xs">Album</Label>
                <Input id="album" value={formData.album} onChange={(e) => setFormData({ ...formData, album: e.target.value })} placeholder="Album name" className="h-9" />
              </div>

              {/* Lyrics Speed */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Lyrics Speed</Label>
                  <span className="text-xs text-muted-foreground">{formData.lyricsSpeed === 0 ? 'Fastest' : formData.lyricsSpeed === 1 ? 'Slowest' : formData.lyricsSpeed.toFixed(2)}</span>
                </div>
                <Slider value={[formData.lyricsSpeed]} min={0} max={1} step={0.05} onValueChange={([value]) => setFormData({ ...formData, lyricsSpeed: value })} className="w-full" />
                <p className="text-[10px] text-muted-foreground">Controls lyrics animation duration (0 = 0.2s fastest, 1 = 0.7s slowest)</p>
              </div>

              {/* Bounce Intensity */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Bounce Intensity</Label>
                  <span className="text-xs text-muted-foreground">{formData.bounceIntensity === 0 ? 'None' : formData.bounceIntensity === 1 ? 'Max' : formData.bounceIntensity.toFixed(2)}</span>
                </div>
                <Slider value={[formData.bounceIntensity]} min={0} max={1} step={0.05} onValueChange={([value]) => setFormData({ ...formData, bounceIntensity: value })} className="w-full" />
              </div>

              {/* Colors */}
              <div className="space-y-1.5">
                <Label className="text-xs">Custom Colors</Label>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Lyric Color</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={formData.lyricColor || '#ffffff'} onChange={(e) => setFormData({ ...formData, lyricColor: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent" />
                      <Input value={formData.lyricColor} onChange={(e) => setFormData({ ...formData, lyricColor: e.target.value })} placeholder="Auto" className="h-8 text-xs flex-1" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Karaoke Color</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={formData.karaokeColor || '#ffffff'} onChange={(e) => setFormData({ ...formData, karaokeColor: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent" />
                      <Input value={formData.karaokeColor} onChange={(e) => setFormData({ ...formData, karaokeColor: e.target.value })} placeholder="Auto" className="h-8 text-xs flex-1" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Credits */}
              <div className="space-y-1.5">
                <Label className="text-xs">Credits (shown after lyrics end)</Label>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Written By</Label>
                    <Input value={formData.writtenBy} onChange={(e) => setFormData({ ...formData, writtenBy: e.target.value })} placeholder="Songwriter name(s)" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Names (producers, features, etc.)</Label>
                    <Input value={formData.creditsNames} onChange={(e) => setFormData({ ...formData, creditsNames: e.target.value })} placeholder="Additional credits" className="h-8 text-xs" />
                  </div>
                </div>
              </div>

              {/* User Library Info */}
              {userLibraryInfo.count > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    User Library ({userLibraryInfo.count} {userLibraryInfo.count === 1 ? 'user' : 'users'})
                  </Label>
                  <div className="p-2.5 bg-secondary rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      This song is in {userLibraryInfo.count} {userLibraryInfo.count === 1 ? "user's" : "users'"} library.
                    </p>
                  </div>
                </div>
              )}

              {/* Audio Upload */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-2">
                  <Music2 className="h-3.5 w-3.5" />
                  Audio File (.mp3)
                </Label>
                {existingSong?.audio_url ? (
                  <div className="flex items-center gap-2 p-2.5 bg-accent/10 border border-accent/30 rounded-lg">
                    <Check className="h-4 w-4 text-accent" />
                    <span className="text-sm flex-1 truncate text-accent">Audio uploaded</span>
                    <Button variant="ghost" size="sm" onClick={handleRemoveAudio} className="text-destructive h-7 text-xs">Remove</Button>
                  </div>
                ) : (
                  <label className="flex items-center gap-3 p-2.5 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/80 transition-colors border-2 border-dashed border-border">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{audioFile ? audioFile.name : "Upload MP3"}</span>
                    <input type="file" accept=".mp3,audio/mpeg" className="hidden" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>

              <Button onClick={handleSave} disabled={isSaving} className="w-full gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </motion.div>
          </TabsContent>

          {/* Lyrics Tab */}
          <TabsContent value="lyrics">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4 pt-2"
            >
              {/* Lyrics Upload */}
              <div className="space-y-1.5">
                <Label className="text-xs">Synced Lyrics (.lrc)</Label>
                {existingSong?.lyrics_url || existingSong?.synced_lyrics ? (
                  <div className="flex items-center gap-2 p-2.5 bg-secondary rounded-lg">
                    <FileText className="h-4 w-4 text-accent" />
                    <span className="text-sm flex-1 truncate">Lyrics attached{existingSong?.synced_lyrics ? ' (synced)' : ''}</span>
                    <Button variant="ghost" size="sm" onClick={handleRemoveLyrics} className="text-destructive h-7 text-xs">Remove</Button>
                  </div>
                ) : (
                  <label className="flex items-center gap-3 p-2.5 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/80 transition-colors">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{lyricsFile ? lyricsFile.name : "Upload .lrc file"}</span>
                    <input type="file" accept=".lrc,.txt" className="hidden" onChange={(e) => setLyricsFile(e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>

              {/* Early Appearance */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Early Lyric Appearance</Label>
                  <span className="text-xs text-muted-foreground">{formData.earlyAppearance === 0 ? 'Disabled' : `${formData.earlyAppearance.toFixed(1)}s`}</span>
                </div>
                <Slider value={[formData.earlyAppearance]} min={0} max={1.5} step={0.1} onValueChange={([value]) => setFormData({ ...formData, earlyAppearance: value })} className="w-full" />
                <p className="text-[10px] text-muted-foreground">Show lyrics ahead of their timestamp (0 = disabled, up to 1.5s early)</p>
              </div>

              {/* Mobile Line Break Char Limit */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mobile Line Break (chars)</Label>
                  <span className="text-xs text-muted-foreground">{formData.mobileCharLimit}</span>
                </div>
                <Slider value={[formData.mobileCharLimit]} min={9} max={40} step={1} onValueChange={([value]) => setFormData({ ...formData, mobileCharLimit: value })} className="w-full" />
                <p className="text-[10px] text-muted-foreground">Character limit before wrapping to next line on mobile (default 9)</p>
              </div>

              {/* Static / Plain Lyrics */}
              <div className="space-y-1.5">
                <Label className="text-xs">Static Lyrics (plain text)</Label>
                <p className="text-[10px] text-muted-foreground">
                  Paste plain lyrics here. If synced lyrics are available, synced will be shown by default. Otherwise static lyrics are displayed.
                </p>
                <Textarea
                  value={plainLyrics}
                  onChange={(e) => setPlainLyrics(e.target.value)}
                  placeholder="Paste plain lyrics here..."
                  className="h-32 text-xs resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Advanced Editing</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowLRCEditor(true)} className="flex-1 gap-2">
                    <Edit3 className="h-4 w-4" />
                    LRC Editor
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowKaraokeEditor(true)} className="flex-1 gap-2">
                    <Mic2 className="h-4 w-4" />
                    Karaoke
                  </Button>
                </div>
              </div>

              {/* Fetch Karaoke from Musixmatch */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetchingKaraoke}
                  onClick={() => handleFetchKaraoke()}
                  className="w-full gap-2"
                >
                  {isFetchingKaraoke ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
                  {isFetchingKaraoke ? "Fetching..." : mxmFetchFailed ? "Retry Fetch (Musixmatch)" : "Fetch Karaoke (Musixmatch)"}
                </Button>

                {/* Musixmatch URL paste */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Link className="h-3 w-3" />
                    Or paste Musixmatch URL
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={mxmUrl}
                      onChange={(e) => setMxmUrl(e.target.value)}
                      placeholder="musixmatch.com/lyrics/Artist/Song"
                      className="h-8 text-xs flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isFetchingKaraoke || !mxmUrl}
                      onClick={handleFetchFromUrl}
                      className="h-8 text-xs"
                    >
                      Fetch
                    </Button>
                  </div>
                </div>

                {/* Manual search on failure */}
                {mxmFetchFailed && (
                  <div className="space-y-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-xs text-destructive font-medium">Auto-fetch failed. Try custom search:</p>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Custom Artist</Label>
                      <Input value={mxmCustomArtist} onChange={(e) => setMxmCustomArtist(e.target.value)} placeholder="e.g. Bad Bunny" className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Custom Title</Label>
                      <Input value={mxmCustomTitle} onChange={(e) => setMxmCustomTitle(e.target.value)} placeholder="e.g. Tití Me Preguntó" className="h-8 text-xs" />
                    </div>
                  </div>
                )}
              </div>

              <Button onClick={handleSave} disabled={isSaving} className="w-full gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </motion.div>
          </TabsContent>

          {/* Special Commands Tab */}
          <TabsContent value="commands">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4 pt-2"
            >
              <div className="space-y-1.5">
                <Label className="text-xs">Special LRC Commands</Label>
                <p className="text-[10px] text-muted-foreground">
                  Add alignment, instrumental markers, and line-break commands to synced lyrics.
                </p>
              </div>

              {/* Command reference */}
              <div className="p-3 bg-secondary rounded-lg space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Available commands:</p>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                  <span><code className="bg-background px-1 rounded">&lt;right&gt;</code> Right-align</span>
                  <span><code className="bg-background px-1 rounded">&lt;left&gt;</code> Left-align</span>
                  <span><code className="bg-background px-1 rounded">&lt;nl&gt;</code> Next line overlap</span>
                  <span><code className="bg-background px-1 rounded">&lt;music&gt;...&lt;/music&gt;</code> Instrumental</span>
                </div>
              </div>

              {/* Command list */}
              <div className="space-y-2">
                {specialCommands.map((cmd, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={cmd.time}
                      onChange={(e) => updateSpecialCommand(i, 'time', e.target.value)}
                      placeholder="00:00.00"
                      className="h-8 text-xs w-24 font-mono"
                    />
                    <Input
                      value={cmd.command}
                      onChange={(e) => updateSpecialCommand(i, 'command', e.target.value)}
                      placeholder="<right>"
                      className="h-8 text-xs flex-1 font-mono"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeSpecialCommand(i)} className="h-8 w-8 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={addSpecialCommand} className="flex-1 gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Add Command
                </Button>
                <Button
                  size="sm"
                  disabled={specialCommands.length === 0 || !existingSong}
                  onClick={applySpecialCommands}
                  className="flex-1 gap-1"
                >
                  <Save className="h-3.5 w-3.5" />
                  Apply to Lyrics
                </Button>
              </div>

              {!existingSong && (
                <p className="text-[10px] text-destructive">Save the song in the General tab first before applying commands.</p>
              )}

              {/* Raw synced lyrics preview */}
              {existingSong?.synced_lyrics && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Current Synced Lyrics Preview</Label>
                  <Textarea
                    value={existingSong.synced_lyrics}
                    readOnly
                    className="h-40 text-xs font-mono resize-none"
                  />
                </div>
              )}
            </motion.div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* LRC Editor Dialog */}
      <LRCEditor
        track={track}
        isOpen={showLRCEditor}
        onClose={() => setShowLRCEditor(false)}
        onSave={() => checkExistingSong()}
      />

      {/* Karaoke Editor Dialog */}
      <KaraokeEditor
        track={track}
        isOpen={showKaraokeEditor}
        onClose={() => setShowKaraokeEditor(false)}
        onSave={() => checkExistingSong()}
      />
    </Dialog>
  );
}
