import { supabase } from "@/integrations/supabase/client";

const FALLBACK_CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
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

function isMimeRejection(error: unknown) {
  const msg =
    (error as { message?: string })?.message?.toLowerCase() ??
    String(error ?? "").toLowerCase();
  return (
    msg.includes("mime type") ||
    msg.includes("invalid_mime_type") ||
    msg.includes("not supported")
  );
}

export async function uploadPublicStorageFile(file: File, folder: string, bucket = "song-assets") {
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "bin";
  const fileName = `${folder}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${fileExt}`;
  const fileBuffer = await file.arrayBuffer();
  const primaryContentType = getContentType(file, folder);

  const attempt = async (contentType: string) =>
    supabase.storage.from(bucket).upload(fileName, fileBuffer, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  let { error } = await attempt(primaryContentType);

  // Bucket may restrict allowed MIME types. If the rejection is mime-type
  // related, retry with a generic binary content-type so admin uploads (esp.
  // MP3s) succeed even on stricter bucket configurations.
  if (error && isMimeRejection(error)) {
    const fallback = await attempt("application/octet-stream");
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}
