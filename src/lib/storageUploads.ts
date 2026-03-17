import { supabase } from "@/integrations/supabase/client";

const FALLBACK_CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  lrc: "text/plain",
  txt: "text/plain",
};

function getContentType(file: File, folder: string) {
  if (file.type) return file.type;

  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (FALLBACK_CONTENT_TYPES[extension]) return FALLBACK_CONTENT_TYPES[extension];

  if (folder === "audio") return "audio/mpeg";
  if (folder === "lyrics") return "text/plain";
  if (folder === "covers") return "image/jpeg";

  return "application/octet-stream";
}

export async function uploadPublicStorageFile(file: File, folder: string, bucket = "song-assets") {
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "bin";
  const fileName = `${folder}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${fileExt}`;
  const fileBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, fileBuffer, {
      contentType: getContentType(file, folder),
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}
