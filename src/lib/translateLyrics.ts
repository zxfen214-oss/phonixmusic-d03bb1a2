import { supabase } from "@/integrations/supabase/client";
import { getSetting, saveSetting } from "@/lib/database";

const CACHE_PREFIX = "lyrics-translation:";
const cacheKey = (trackId: string, lang: string) => `${CACHE_PREFIX}${trackId}:${lang}`;

export type TranslationMap = Record<number, string>;

export async function getCachedTranslations(
  trackId: string,
  lang: string,
): Promise<string[] | undefined> {
  return await getSetting<string[]>(cacheKey(trackId, lang));
}

export async function setCachedTranslations(
  trackId: string,
  lang: string,
  translations: string[],
): Promise<void> {
  await saveSetting(cacheKey(trackId, lang), translations);
}

export async function translateLines(
  lines: string[],
  targetLang: string,
): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke("translate-lyrics", {
    body: { lines, targetLang },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const result: string[] = data?.translations ?? [];
  // Pad to match length
  while (result.length < lines.length) result.push("");
  return result;
}
