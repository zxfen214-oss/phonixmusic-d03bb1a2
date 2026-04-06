import { supabase } from "@/integrations/supabase/client";

export interface SongLookup {
  youtubeId?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
}

type SongRow = Record<string, any> & {
  id: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  youtube_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const CREDIT_COLUMNS = new Set(["written_by", "credits_names"]);

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function stripUnsupportedCreditColumns(select: string) {
  return select
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !CREDIT_COLUMNS.has(part))
    .join(", ");
}

function stripUnsupportedCreditFields<T extends Record<string, any>>(payload: T): Partial<T> {
  const next = { ...payload };
  delete (next as any).written_by;
  delete (next as any).credits_names;
  return next;
}

function isMissingCreditColumnError(error: any) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`;
  return error?.code === "42703" && /(written_by|credits_names)/i.test(message);
}

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function getTimestampScore(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time / 1_000_000_000_000 : 0;
}

function getRecordScore(record: SongRow) {
  let score = 0;
  if (record.audio_url) score += 32;
  if (record.lyrics_url) score += 24;
  if (record.synced_lyrics) score += 20;
  if (record.plain_lyrics) score += 12;
  if (record.karaoke_data) score += 18;
  if (record.karaoke_enabled) score += 6;
  if (record.cover_url) score += 6;
  if (record.youtube_id) score += 4;
  score += getTimestampScore(record.updated_at) + getTimestampScore(record.created_at);
  return score;
}

function sortRows(rows: SongRow[]) {
  return [...rows].sort((a, b) => getRecordScore(b) - getRecordScore(a));
}

async function runSongQuery(select: string, applyFilters: (query: any) => any) {
  let currentSelect = select;

  for (;;) {
    let query = supabase
      .from("songs")
      .select(currentSelect)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    query = applyFilters(query);

    const result = await query;
    if (result.error && isMissingCreditColumnError(result.error)) {
      const fallbackSelect = stripUnsupportedCreditColumns(currentSelect);
      if (fallbackSelect && fallbackSelect !== currentSelect) {
        currentSelect = fallbackSelect;
        continue;
      }
    }

    return {
      data: (result.data as SongRow[] | null) ?? [],
      error: result.error,
    };
  }
}

export async function fetchSongRows(lookup: SongLookup, select: string) {
  const queries: Promise<{ data: SongRow[]; error: any }>[] = [];
  const title = normalizeText(lookup.title);
  const artist = normalizeText(lookup.artist);
  const album = normalizeText(lookup.album);
  const youtubeId = normalizeText(lookup.youtubeId);

  if (youtubeId) {
    queries.push(runSongQuery(select, (query) => query.eq("youtube_id", youtubeId)));
  }

  if (title && artist) {
    queries.push(
      runSongQuery(select, (query) => {
        let nextQuery = query.eq("title", title).eq("artist", artist);
        if (album) nextQuery = nextQuery.eq("album", album);
        return nextQuery;
      })
    );

    if (album) {
      queries.push(
        runSongQuery(select, (query) => query.eq("title", title).eq("artist", artist).is("album", null))
      );
    }
  }

  if (queries.length === 0) return [] as SongRow[];

  const results = await Promise.all(queries);
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const deduped = new Map<string, SongRow>();
  results.flatMap((result) => result.data).forEach((row) => {
    if (row?.id && !deduped.has(row.id)) deduped.set(row.id, row);
  });

  return sortRows(Array.from(deduped.values()));
}

export function mergeSongRecords<T extends SongRow>(rows: T[]) {
  if (rows.length === 0) return null;

  const sorted = sortRows(rows);
  const primary = sorted[0];
  const merged: Record<string, any> = { ...primary, match_ids: sorted.map((row) => row.id) };
  const keys = new Set(sorted.flatMap((row) => Object.keys(row)));

  keys.forEach((key) => {
    if (key === "id") return;
    if (key === "karaoke_enabled") {
      if (sorted.some((row) => row[key] === true)) {
        merged[key] = true;
        return;
      }
    }

    const match = sorted.find((row) => hasValue(row[key]));
    if (match) merged[key] = match[key];
  });

  return merged as T & { match_ids: string[] };
}

export async function fetchMergedSongRecord(lookup: SongLookup, select: string) {
  const rows = await fetchSongRows(lookup, select);
  return {
    rows,
    merged: mergeSongRecords(rows),
  };
}

export async function saveSongRecord(
  lookup: SongLookup,
  payload: Record<string, any>,
  insertPayload: Record<string, any>
) {
  const rows = await fetchSongRows(lookup, "id");
  const payloadAttempts = [payload, stripUnsupportedCreditFields(payload)].filter(
    (attempt, index, list) => index === 0 || JSON.stringify(attempt) !== JSON.stringify(list[0])
  );

  let lastError: any = null;

  for (const attempt of payloadAttempts) {
    if (rows.length > 0) {
      const { error } = await supabase.from("songs").update(attempt).in("id", rows.map((row) => row.id));
      if (!error) return { ids: rows.map((row) => row.id), strippedCredits: attempt !== payload };
      lastError = error;
      if (!isMissingCreditColumnError(error)) throw error;
      continue;
    }

    const { error } = await supabase.from("songs").insert({ ...insertPayload, ...attempt });
    if (!error) return { ids: [] as string[], strippedCredits: attempt !== payload };
    lastError = error;
    if (!isMissingCreditColumnError(error)) throw error;
  }

  if (lastError) throw lastError;
  return { ids: [] as string[], strippedCredits: false };
}

export async function updateSongRecordsByIds(ids: string[], payload: Record<string, any>) {
  if (ids.length === 0) return;

  const payloadAttempts = [payload, stripUnsupportedCreditFields(payload)].filter(
    (attempt, index, list) => index === 0 || JSON.stringify(attempt) !== JSON.stringify(list[0])
  );

  let lastError: any = null;

  for (const attempt of payloadAttempts) {
    const { error } = await supabase.from("songs").update(attempt).in("id", ids);
    if (!error) return;
    lastError = error;
    if (!isMissingCreditColumnError(error)) throw error;
  }

  if (lastError) throw lastError;
}