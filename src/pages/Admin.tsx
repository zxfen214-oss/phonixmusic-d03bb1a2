import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageTransition, FadeIn, StaggerContainer, StaggerItem } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowLeft, 
  Plus, 
  Edit, 
  Trash2, 
  Upload, 
  Music, 
  Image as ImageIcon,
  FileText,
  Loader2,
  Save,
  X,
  Users,
  ListMusic,
  Download,
  RefreshCw,
  Copy,
  CheckSquare,
  Shield,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number;
  youtube_id: string | null;
  cover_url: string | null;
  lyrics_url: string | null;
  audio_url: string | null;
  created_at: string;
  needs_metadata: boolean;
  synced_lyrics: string | null;
  plain_lyrics: string | null;
}

interface UserLibrarySong {
  song_youtube_id: string;
  song_title: string;
  song_artist: string;
  user_count: number;
  users: { user_id: string; added_at: string }[];
}

// ─── Duplicates Detection View ───
function DuplicatesView({ songs, onDelete }: { songs: Song[]; onDelete: (song: Song) => void }) {
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, Song[]>();
    songs.forEach((song) => {
      const key = song.youtube_id || `title:${song.title.toLowerCase()}_${song.artist.toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(song);
    });
    return Array.from(groups.entries())
      .filter(([, group]) => group.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
  }, [songs]);

  if (duplicateGroups.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Copy className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No duplicate songs detected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Found {duplicateGroups.length} duplicate group(s). Keep the best version and delete the rest.
      </p>
      {duplicateGroups.map(([key, group]) => (
        <div key={key} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-destructive" />
            <span className="font-medium text-sm">{group.length} copies</span>
            <span className="text-muted-foreground text-sm">— {group[0].title} by {group[0].artist}</span>
          </div>
          {group.map((song) => (
            <div key={song.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/50">
              <div className="w-10 h-10 rounded-md bg-secondary overflow-hidden flex-shrink-0">
                {song.cover_url ? (
                  <img src={song.cover_url} alt={song.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{song.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  ID: {song.id.slice(0, 8)}... • Created: {new Date(song.created_at).toLocaleDateString()}
                  {song.synced_lyrics ? " • Has lyrics" : ""}
                  {song.cover_url ? " • Has cover" : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(song)}
                className="text-destructive hover:text-destructive flex-shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [songs, setSongs] = useState<Song[]>([]);
  const [userLibrarySongs, setUserLibrarySongs] = useState<UserLibrarySong[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("songs");
  const [fetchingMetadata, setFetchingMetadata] = useState<string | null>(null);
  const [selectedSongs, setSelectedSongs] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Admin management state
  interface AdminUser {
    id: string;
    email: string;
    display_name: string | null;
    is_admin: boolean;
  }
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [togglingAdmin, setTogglingAdmin] = useState<string | null>(null);
  const [addAdminEmail, setAddAdminEmail] = useState("");
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);

  // Accounts management state
  interface AccountUser {
    id: string;
    display_name: string | null;
    email: string | null;
    club: string | null;
    is_admin: boolean;
    library_songs: { song_youtube_id: string; song_title: string; song_artist: string; added_at: string }[];
  }
  const [accountUsers, setAccountUsers] = useState<AccountUser[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [editingSongFromAccount, setEditingSongFromAccount] = useState<Song | null>(null);

  const fetchAdminUsers = async () => {
    setIsLoadingUsers(true);
    try {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .order('created_at', { ascending: false });
      if (profilesError) throw profilesError;

      // Get all admin role entries
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('role', 'admin');

      const adminIds = new Set((roles || []).map(r => r.user_id));

      setAdminUsers((profiles || []).map(p => ({
        id: p.id,
        email: '', // email not accessible from profiles
        display_name: p.display_name,
        is_admin: adminIds.has(p.id),
      })));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const toggleAdminRole = async (targetUserId: string, grantAdmin: boolean) => {
    if (targetUserId === user?.id) {
      toast({ title: 'Error', description: "You can't revoke your own admin role", variant: 'destructive' });
      return;
    }
    setTogglingAdmin(targetUserId);
    try {
      if (grantAdmin) {
        const { error } = await supabase.from('user_roles').insert({ user_id: targetUserId, role: 'admin' });
        if (error) throw error;
        toast({ title: 'Admin Granted', description: 'User is now an admin' });
      } else {
        const { error } = await supabase.from('user_roles').delete().eq('user_id', targetUserId).eq('role', 'admin');
        if (error) throw error;
        toast({ title: 'Admin Revoked', description: 'User is no longer an admin' });
      }
      fetchAdminUsers();
    } catch (error) {
      console.error('Toggle admin error:', error);
      toast({ title: 'Error', description: 'Failed to update admin role', variant: 'destructive' });
    } finally {
      setTogglingAdmin(null);
    }
  };

  const addAdminByEmail = async () => {
    const email = addAdminEmail.trim().toLowerCase();
    if (!email) return;
    setIsAddingAdmin(true);
    try {
      // Look up user by email via profiles table (which may have email) or auth admin
      // We'll use a different approach: search profiles by matching auth users
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .ilike('email', email)
        .limit(1);

      let userId: string | null = null;
      if (profiles && profiles.length > 0) {
        userId = profiles[0].id;
      }

      if (!userId) {
        toast({ title: 'User not found', description: `No user found with email "${email}". Make sure they have signed up first.`, variant: 'destructive' });
        return;
      }

      // Check if already admin
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();

      if (existingRole) {
        toast({ title: 'Already admin', description: 'This user is already an admin.' });
        return;
      }

      const { error: insertError } = await supabase.from('user_roles').insert({ user_id: userId, role: 'admin' });
      if (insertError) throw insertError;

      toast({ title: 'Admin Granted', description: `Admin access granted to ${email}` });
      setAddAdminEmail('');
      fetchAdminUsers();
    } catch (error) {
      console.error('Add admin by email error:', error);
      toast({ title: 'Error', description: 'Failed to grant admin access', variant: 'destructive' });
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const fetchAccountUsers = async () => {
    setIsLoadingAccounts(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, email, club')
        .order('created_at', { ascending: false });
      if (profilesError) throw profilesError;

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('role', 'admin');
      const adminIds = new Set((roles || []).map(r => r.user_id));

      // Fetch all library entries
      const { data: libraryData } = await supabase
        .from('user_song_library')
        .select('user_id, song_youtube_id, song_title, song_artist, added_at');

      const libraryMap = new Map<string, AccountUser['library_songs']>();
      (libraryData || []).forEach(entry => {
        if (!libraryMap.has(entry.user_id)) libraryMap.set(entry.user_id, []);
        libraryMap.get(entry.user_id)!.push({
          song_youtube_id: entry.song_youtube_id,
          song_title: entry.song_title,
          song_artist: entry.song_artist,
          added_at: entry.added_at,
        });
      });

      setAccountUsers((profiles || []).map(p => ({
        id: p.id,
        display_name: p.display_name,
        email: (p as any).email || null,
        club: (p as any).club || null,
        is_admin: adminIds.has(p.id),
        library_songs: libraryMap.get(p.id) || [],
      })));
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      toast({ title: 'Error', description: 'Failed to load accounts', variant: 'destructive' });
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const [formData, setFormData] = useState({
    title: "",
    artist: "",
    album: "",
    duration: 0,
    youtube_id: "",
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [lyricsFile, setLyricsFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate("/");
    }
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    fetchSongs();
    fetchUserLibrarySongs();
  }, []);

  const fetchSongs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("songs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Failed to load songs", variant: "destructive" });
    } else {
      setSongs(data || []);
    }
    setIsLoading(false);
  };

  const fetchUserLibrarySongs = async () => {
    setIsLoadingLibrary(true);
    try {
      const allData: { song_youtube_id: string; song_title: string; song_artist: string; user_id: string; added_at: string }[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("user_song_library")
          .select("song_youtube_id, song_title, song_artist, user_id, added_at")
          .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allData.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      const songMap = new Map<string, UserLibrarySong>();
      
      allData.forEach((entry) => {
        const key = entry.song_youtube_id;
        if (!songMap.has(key)) {
          songMap.set(key, {
            song_youtube_id: entry.song_youtube_id,
            song_title: entry.song_title,
            song_artist: entry.song_artist,
            user_count: 0,
            users: [],
          });
        }
        const song = songMap.get(key)!;
        song.user_count++;
        song.users.push({ user_id: entry.user_id, added_at: entry.added_at });
      });

      const sortedSongs = Array.from(songMap.values()).sort((a, b) => b.user_count - a.user_count);
      setUserLibrarySongs(sortedSongs);
    } catch (error) {
      console.error("Failed to fetch user library songs:", error);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleEdit = (song: Song) => {
    setEditingSong(song);
    setFormData({
      title: song.title,
      artist: song.artist,
      album: song.album || "",
      duration: song.duration,
      youtube_id: song.youtube_id || "",
    });
    setCoverPreview(song.cover_url);
    setIsCreating(false);
  };

  const handleCreate = () => {
    setEditingSong(null);
    setFormData({ title: "", artist: "", album: "", duration: 0, youtube_id: "" });
    setCoverPreview(null);
    setCoverFile(null);
    setLyricsFile(null);
    setAudioFile(null);
    setIsCreating(true);
  };

  const handleCancel = () => {
    setEditingSong(null);
    setIsCreating(false);
    setCoverFile(null);
    setLyricsFile(null);
    setAudioFile(null);
    setCoverPreview(null);
  };

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${folder}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${fileExt}`;
    
    const { error } = await supabase.storage
      .from("song-assets")
      .upload(fileName, file, {
        contentType: file.type || (folder === 'audio' ? 'audio/mpeg' : 'application/octet-stream'),
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error("Upload error:", error);
      toast({ title: "Upload Error", description: error.message, variant: "destructive" });
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("song-assets")
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  };

  // Bulk MP3 upload state
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; currentFile: string }>({ current: 0, total: 0, currentFile: '' });

  const handleBulkUpload = async () => {
    if (bulkFiles.length === 0) return;
    setBulkUploading(true);
    let successCount = 0;
    const total = bulkFiles.length;

    for (let i = 0; i < bulkFiles.length; i++) {
      const file = bulkFiles[i];
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setBulkProgress({ current: i + 1, total, currentFile: nameWithoutExt });

      // Upload audio file
      const audioUrl = await uploadFile(file, 'audio');
      if (!audioUrl) continue;

      // Try to find existing song by title match
      const { data: existingSongs } = await supabase
        .from('songs')
        .select('id')
        .ilike('title', `%${nameWithoutExt}%`)
        .limit(1);

      if (existingSongs && existingSongs.length > 0) {
        // Update existing song with audio
        await supabase.from('songs').update({ audio_url: audioUrl }).eq('id', existingSongs[0].id);
      } else {
        // Create new song entry
        await supabase.from('songs').insert({
          title: nameWithoutExt,
          artist: 'Unknown',
          audio_url: audioUrl,
          duration: 0,
          created_by: user?.id,
        });
      }
      successCount++;
    }

    toast({ title: 'Bulk Upload Complete', description: `Uploaded ${successCount}/${total} files` });
    setBulkFiles([]);
    setBulkUploading(false);
    setBulkProgress({ current: 0, total: 0, currentFile: '' });
    fetchSongs();
  };

  const handleSave = async () => {
    if (!formData.title || !formData.artist) {
      toast({ title: "Error", description: "Title and artist are required", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    try {
      let coverUrl = editingSong?.cover_url || null;
      let lyricsUrl = editingSong?.lyrics_url || null;
      let audioUrl = (editingSong as any)?.audio_url || null;

      if (coverFile) {
        const url = await uploadFile(coverFile, "covers");
        if (url) coverUrl = url;
      }

      if (lyricsFile) {
        const url = await uploadFile(lyricsFile, "lyrics");
        if (url) lyricsUrl = url;
      }

      if (audioFile) {
        const url = await uploadFile(audioFile, "audio");
        if (url) audioUrl = url;
      }

      const songData = {
        title: formData.title,
        artist: formData.artist,
        album: formData.album || null,
        duration: formData.duration,
        youtube_id: formData.youtube_id || null,
        cover_url: coverUrl,
        lyrics_url: lyricsUrl,
        audio_url: audioUrl,
      };

      if (editingSong) {
        const { error } = await supabase
          .from("songs")
          .update(songData)
          .eq("id", editingSong.id);

        if (error) throw error;
        toast({ title: "Success", description: "Song updated successfully" });
      } else {
        const { error } = await supabase
          .from("songs")
          .insert({ ...songData, created_by: user?.id });

        if (error) throw error;
        toast({ title: "Success", description: "Song created successfully" });
      }

      handleCancel();
      fetchSongs();
    } catch (error) {
      console.error("Save error:", error);
      toast({ title: "Error", description: "Failed to save song", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (song: Song) => {
    if (!confirm(`Delete "${song.title}" by ${song.artist}?`)) return;

    const { error } = await supabase.from("songs").delete().eq("id", song.id);

    if (error) {
      toast({ title: "Error", description: "Failed to delete song", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Song deleted" });
      fetchSongs();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSongs.size === 0) return;
    if (!confirm(`Delete ${selectedSongs.size} selected song(s)?`)) return;

    setIsBulkDeleting(true);
    try {
      const ids = Array.from(selectedSongs);
      const { error } = await supabase.from("songs").delete().in("id", ids);
      if (error) throw error;
      toast({ title: "Success", description: `Deleted ${ids.length} song(s)` });
      setSelectedSongs(new Set());
      fetchSongs();
    } catch (error) {
      console.error("Bulk delete error:", error);
      toast({ title: "Error", description: "Failed to delete songs", variant: "destructive" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSongSelection = (songId: string) => {
    setSelectedSongs(prev => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSongs.size === songs.length) {
      setSelectedSongs(new Set());
    } else {
      setSelectedSongs(new Set(songs.map(s => s.id)));
    }
  };

  const handleRemoveLyrics = async () => {
    if (!editingSong) return;

    const { error } = await supabase
      .from("songs")
      .update({ lyrics_url: null })
      .eq("id", editingSong.id);

    if (error) {
      toast({ title: "Error", description: "Failed to remove lyrics", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Lyrics removed" });
      setEditingSong({ ...editingSong, lyrics_url: null });
      fetchSongs();
    }
  };

  const handleRemoveAudio = async () => {
    if (!editingSong) return;

    const { error } = await supabase
      .from("songs")
      .update({ audio_url: null })
      .eq("id", editingSong.id);

    if (error) {
      toast({ title: "Error", description: "Failed to remove audio", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Audio removed" });
      setEditingSong({ ...editingSong, audio_url: null } as Song);
      fetchSongs();
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

  const handleFetchMetadata = async (songId?: string) => {
    const fetchId = songId || 'all';
    setFetchingMetadata(fetchId);
    try {
      if (songId) {
        const { error } = await supabase
          .from("songs")
          .update({ needs_metadata: true })
          .eq("id", songId);
        if (error) throw error;
      }

      const { data, error } = await supabase.functions.invoke("fetch-metadata", {
        body: songId ? { song_id: songId } : {},
      });

      if (error) throw error;

      toast({
        title: "Metadata Fetched",
        description: `Processed ${data.processed} song(s). ${data.results?.filter((r: any) => r.coverFetched).length || 0} covers, ${data.results?.filter((r: any) => r.lyricsFetched).length || 0} lyrics fetched.`,
      });

      fetchSongs();
    } catch (error) {
      console.error("Fetch metadata error:", error);
      toast({ title: "Error", description: "Failed to fetch metadata", variant: "destructive" });
    } finally {
      setFetchingMetadata(null);
    }
  };

  const handleMarkForMetadata = async (song: Song) => {
    const newValue = !song.needs_metadata;
    const { error } = await supabase
      .from("songs")
      .update({ needs_metadata: newValue })
      .eq("id", song.id);

    if (error) {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    } else {
      toast({ title: newValue ? "Flagged" : "Unflagged", description: `${song.title} ${newValue ? 'marked' : 'unmarked'} for metadata fetch` });
      fetchSongs();
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <PageTransition className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <FadeIn>
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Admin Panel</h1>
              <p className="text-muted-foreground">Manage songs, covers, and lyrics</p>
            </div>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Area with Tabs */}
          <div className="lg:col-span-2">
            <FadeIn delay={0.1}>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <TabsList>
                    <TabsTrigger value="songs" className="gap-2">
                      <Music className="h-4 w-4" />
                      Songs ({songs.length})
                    </TabsTrigger>
                    <TabsTrigger value="bulk-upload" className="gap-2">
                      <Upload className="h-4 w-4" />
                      Bulk Upload
                    </TabsTrigger>
                    <TabsTrigger value="user-library" className="gap-2">
                      <Users className="h-4 w-4" />
                      Libraries
                    </TabsTrigger>
                    <TabsTrigger value="duplicates" className="gap-2">
                      <Copy className="h-4 w-4" />
                      Duplicates
                    </TabsTrigger>
                    <TabsTrigger value="accounts" className="gap-2" onClick={() => { if (accountUsers.length === 0) fetchAccountUsers(); }}>
                      <Users className="h-4 w-4" />
                      Accounts
                    </TabsTrigger>
                    <TabsTrigger value="admin-users" className="gap-2" onClick={() => { if (adminUsers.length === 0) fetchAdminUsers(); }}>
                      <Shield className="h-4 w-4" />
                      Admins
                    </TabsTrigger>
                  </TabsList>
                  {activeTab === "songs" && (
                    <div className="flex gap-2 flex-wrap">
                      {selectedSongs.size > 0 && (
                        <Button 
                          variant="destructive" 
                          onClick={handleBulkDelete}
                          disabled={isBulkDeleting}
                          className="gap-2"
                          size="sm"
                        >
                          {isBulkDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Delete ({selectedSongs.size})
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        onClick={() => handleFetchMetadata()} 
                        disabled={!!fetchingMetadata || !songs.some(s => s.needs_metadata)}
                        className="gap-2"
                        size="sm"
                      >
                        {fetchingMetadata === 'all' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Fetch ({songs.filter(s => s.needs_metadata).length})
                      </Button>
                      <Button onClick={handleCreate} className="gap-2" size="sm">
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  )}
                </div>

                {/* Songs Tab */}
                <TabsContent value="songs" className="mt-0">
                  {/* Select All bar */}
                  <div className="flex items-center gap-3 mb-3 px-2">
                    <Checkbox
                      checked={songs.length > 0 && selectedSongs.size === songs.length}
                      onCheckedChange={toggleSelectAll}
                    />
                    <span className="text-xs text-muted-foreground">
                      {selectedSongs.size > 0 ? `${selectedSongs.size} selected` : 'Select all'}
                    </span>
                  </div>
                  <StaggerContainer className="space-y-3">
                    {songs.map((song) => (
                      <StaggerItem key={song.id}>
                        <motion.div
                          layout
                          className={`p-4 rounded-xl border transition-colors ${
                            selectedSongs.has(song.id)
                              ? "border-destructive/50 bg-destructive/5"
                              : editingSong?.id === song.id
                              ? "border-accent bg-accent/5"
                              : "border-border bg-card hover:border-accent/50"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <Checkbox
                              checked={selectedSongs.has(song.id)}
                              onCheckedChange={() => toggleSongSelection(song.id)}
                            />
                            <div className="w-14 h-14 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                              {song.cover_url ? (
                                <img src={song.cover_url} alt={song.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Music className="h-6 w-6 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium truncate">{song.title}</h3>
                              <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {song.lyrics_url && (
                                  <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    Lyrics
                                  </span>
                                )}
                                {song.youtube_id && (
                                  <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full">
                                    YouTube
                                  </span>
                                )}
                                {song.audio_url && (
                                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Music className="h-3 w-3" />
                                    MP3
                                  </span>
                                )}
                                {song.needs_metadata && (
                                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <RefreshCw className="h-3 w-3" />
                                    Pending
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleMarkForMetadata(song)}
                                title={song.needs_metadata ? "Unmark for fetch" : "Mark for metadata fetch"}
                                className={song.needs_metadata ? "text-yellow-400" : ""}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleFetchMetadata(song.id)}
                                disabled={!!fetchingMetadata}
                                title="Fetch metadata now"
                              >
                                {fetchingMetadata === song.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(song)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(song)} className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      </StaggerItem>
                    ))}

                    {songs.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No songs yet. Add your first song!</p>
                      </div>
                    )}
                  </StaggerContainer>
                </TabsContent>

                {/* Bulk Upload Tab */}
                <TabsContent value="bulk-upload" className="mt-0">
                  <div className="p-6 rounded-xl border border-border bg-card space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Upload className="h-5 w-5 text-accent" />
                      Bulk MP3 Upload
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Upload multiple MP3 files at once. Files will be matched to existing songs by filename, or new entries will be created.
                    </p>
                    
                    <label className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/50 transition-colors">
                      <Upload className="h-10 w-10 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {bulkFiles.length > 0 ? `${bulkFiles.length} file(s) selected` : 'Click to select MP3 files'}
                      </span>
                      <input
                        type="file"
                        accept=".mp3,audio/mpeg"
                        multiple
                        className="hidden"
                        onChange={(e) => setBulkFiles(Array.from(e.target.files || []))}
                      />
                    </label>

                    {bulkFiles.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {bulkFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm p-2 bg-secondary rounded-lg">
                            <Music className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="truncate flex-1">{f.name}</span>
                            <span className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {bulkUploading && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Uploading {bulkProgress.current}/{bulkProgress.total}: {bulkProgress.currentFile}</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div 
                            className="bg-accent h-2 rounded-full transition-all" 
                            style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        onClick={handleBulkUpload}
                        disabled={bulkFiles.length === 0 || bulkUploading}
                        className="flex-1 gap-2"
                      >
                        {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {bulkUploading ? 'Uploading...' : `Upload ${bulkFiles.length} File(s)`}
                      </Button>
                      {bulkFiles.length > 0 && !bulkUploading && (
                        <Button variant="outline" onClick={() => setBulkFiles([])}>Clear</Button>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* User Library Tab */}
                <TabsContent value="user-library" className="mt-0">
                  {isLoadingLibrary ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-accent" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {userLibrarySongs.map((song) => {
                        const hasAdminVersion = songs.some(s => s.youtube_id === song.song_youtube_id);
                        const adminSong = songs.find(s => s.youtube_id === song.song_youtube_id);
                        
                        return (
                          <motion.div
                            key={song.song_youtube_id}
                            layout
                            className="p-4 rounded-xl border border-border bg-card hover:border-accent/50 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-lg bg-secondary overflow-hidden flex-shrink-0 flex items-center justify-center">
                                {adminSong?.cover_url ? (
                                  <img src={adminSong.cover_url} alt={song.song_title} className="w-full h-full object-cover" />
                                ) : (
                                  <ListMusic className="h-6 w-6 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium truncate">{song.song_title}</h3>
                                <p className="text-sm text-muted-foreground truncate">{song.song_artist}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {song.user_count} {song.user_count === 1 ? 'user' : 'users'}
                                  </span>
                                  {hasAdminVersion ? (
                                    <>
                                      {adminSong?.lyrics_url && (
                                        <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full flex items-center gap-1">
                                          <FileText className="h-3 w-3" />
                                          Lyrics
                                        </span>
                                      )}
                                      {adminSong?.cover_url && (
                                        <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">
                                          Cover
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                                      No admin edits
                                    </span>
                                  )}
                                </div>
                              </div>
                              {!hasAdminVersion && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    setFormData({
                                      title: song.song_title,
                                      artist: song.song_artist,
                                      album: "",
                                      duration: 0,
                                      youtube_id: song.song_youtube_id,
                                    });
                                    setCoverPreview(null);
                                    setCoverFile(null);
                                    setLyricsFile(null);
                                    setEditingSong(null);
                                    setIsCreating(true);
                                  }}
                                  className="gap-1"
                                >
                                  <Plus className="h-3 w-3" />
                                  Add
                                </Button>
                              )}
                              {hasAdminVersion && adminSong && (
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(adminSong)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}

                      {userLibrarySongs.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No songs in user libraries yet.</p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Duplicates Tab */}
                <TabsContent value="duplicates" className="mt-0">
                  <DuplicatesView songs={songs} onDelete={handleDelete} />
                </TabsContent>

                {/* Admin Users Tab */}
                <TabsContent value="admin-users" className="mt-0">
                  {isLoadingUsers ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-accent" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Grant or revoke admin access for users. You can also add a new admin by email.
                      </p>
                      
                      {/* Add admin by email */}
                      <div className="flex gap-2 items-end p-4 rounded-xl border border-dashed border-border bg-secondary/30">
                        <div className="flex-1 space-y-1.5">
                          <Label htmlFor="admin-email" className="text-xs">Add admin by email</Label>
                          <Input
                            id="admin-email"
                            type="email"
                            placeholder="user@example.com"
                            value={addAdminEmail}
                            onChange={(e) => setAddAdminEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addAdminByEmail()}
                            className="bg-background"
                          />
                        </div>
                        <Button
                          onClick={addAdminByEmail}
                          disabled={isAddingAdmin || !addAdminEmail.trim()}
                          size="sm"
                          className="gap-1"
                        >
                          {isAddingAdmin ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                          Grant
                        </Button>
                      </div>
                      {adminUsers.map((au) => (
                        <motion.div
                          key={au.id}
                          layout
                          className={`p-4 rounded-xl border transition-colors ${
                            au.is_admin ? "border-accent/50 bg-accent/5" : "border-border bg-card"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              au.is_admin ? 'bg-accent/20' : 'bg-secondary'
                            }`}>
                              {au.is_admin ? (
                                <ShieldCheck className="h-5 w-5 text-accent" />
                              ) : (
                                <Users className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium truncate">
                                {au.display_name || 'Unnamed User'}
                              </h3>
                              <p className="text-xs text-muted-foreground truncate">
                                ID: {au.id.slice(0, 12)}...
                                {au.id === user?.id && ' (You)'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {au.is_admin ? (
                                <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">Admin</span>
                              ) : (
                                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">User</span>
                              )}
                              <Button
                                variant={au.is_admin ? "destructive" : "default"}
                                size="sm"
                                disabled={togglingAdmin === au.id || au.id === user?.id}
                                onClick={() => toggleAdminRole(au.id, !au.is_admin)}
                                className="gap-1"
                              >
                                {togglingAdmin === au.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : au.is_admin ? (
                                  <ShieldX className="h-3 w-3" />
                                ) : (
                                  <ShieldCheck className="h-3 w-3" />
                                )}
                                {au.is_admin ? 'Revoke' : 'Grant'}
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      {adminUsers.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                          <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No users found.</p>
                          <Button variant="outline" onClick={fetchAdminUsers} className="mt-4 gap-2">
                            <RefreshCw className="h-4 w-4" />
                            Load Users
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </FadeIn>
          </div>

          {/* Edit/Create Panel */}
          <div className="lg:col-span-1">
            <AnimatePresence mode="wait">
              {(editingSong || isCreating) && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="sticky top-4"
                >
                  <div className="p-6 rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-semibold">
                        {editingSong ? "Edit Song" : "New Song"}
                      </h2>
                      <Button variant="ghost" size="icon" onClick={handleCancel}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {/* Cover Preview/Upload */}
                      <div className="space-y-2">
                        <Label>Album Cover</Label>
                        <div className="relative">
                          <div className="aspect-square w-full max-w-[200px] mx-auto rounded-xl bg-secondary overflow-hidden border-2 border-dashed border-border">
                            {coverPreview ? (
                              <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                                <ImageIcon className="h-10 w-10 mb-2" />
                                <span className="text-sm">No cover</span>
                              </div>
                            )}
                          </div>
                          <label className="absolute bottom-2 right-2 p-2 bg-accent text-accent-foreground rounded-full cursor-pointer hover:bg-accent/90 transition-colors">
                            <Upload className="h-4 w-4" />
                            <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
                          </label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="title">Title *</Label>
                        <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Song title" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="artist">Artist *</Label>
                        <Input id="artist" value={formData.artist} onChange={(e) => setFormData({ ...formData, artist: e.target.value })} placeholder="Artist name" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="album">Album</Label>
                        <Input id="album" value={formData.album} onChange={(e) => setFormData({ ...formData, album: e.target.value })} placeholder="Album name" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="youtube_id">YouTube ID</Label>
                        <Input id="youtube_id" value={formData.youtube_id} onChange={(e) => setFormData({ ...formData, youtube_id: e.target.value })} placeholder="e.g., dQw4w9WgXcQ" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="duration">Duration (seconds)</Label>
                        <Input id="duration" type="number" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })} placeholder="0" />
                      </div>

                      {/* Lyrics Upload */}
                      <div className="space-y-2">
                        <Label>Synced Lyrics (.lrc)</Label>
                        {editingSong?.lyrics_url ? (
                          <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg">
                            <FileText className="h-4 w-4 text-accent" />
                            <span className="text-sm flex-1 truncate">Lyrics attached</span>
                            <Button variant="ghost" size="sm" onClick={handleRemoveLyrics} className="text-destructive">Remove</Button>
                          </div>
                        ) : (
                          <label className="flex items-center gap-3 p-3 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/80 transition-colors">
                            <Upload className="h-4 w-4" />
                            <span className="text-sm">{lyricsFile ? lyricsFile.name : "Upload .lrc file"}</span>
                            <input type="file" accept=".lrc,.txt" className="hidden" onChange={(e) => setLyricsFile(e.target.files?.[0] || null)} />
                          </label>
                        )}
                      </div>

                      {/* Audio Upload */}
                      <div className="space-y-2">
                        <Label>Audio File (.mp3)</Label>
                        {editingSong?.audio_url ? (
                          <div className="flex items-center gap-2 p-3 bg-accent/10 border border-accent/30 rounded-lg">
                            <Music className="h-4 w-4 text-accent" />
                            <span className="text-sm flex-1 truncate">Audio attached</span>
                            <Button variant="ghost" size="sm" onClick={handleRemoveAudio} className="text-destructive">Remove</Button>
                          </div>
                        ) : (
                          <label className="flex items-center gap-3 p-3 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/80 transition-colors">
                            <Upload className="h-4 w-4" />
                            <span className="text-sm">{audioFile ? audioFile.name : "Upload .mp3 file"}</span>
                            <input type="file" accept=".mp3,audio/mpeg" className="hidden" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} />
                          </label>
                        )}
                      </div>

                      <Button onClick={handleSave} disabled={isSaving} className="w-full gap-2">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {isSaving ? "Saving..." : "Save Song"}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!editingSong && !isCreating && (
              <FadeIn delay={0.2}>
                <div className="p-6 rounded-xl border border-dashed border-border bg-card/50 text-center">
                  <Music className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">
                    Select a song to edit or create a new one
                  </p>
                </div>
              </FadeIn>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
