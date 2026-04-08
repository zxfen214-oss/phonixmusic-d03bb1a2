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

const FALLBACK_UNSUPPORTED_COLUMNS = new Set(["written_by", "credits_names"]);

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function extractMissingColumns(error: any) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
  const columns = new Set<string>();

  for (const match of message.matchAll(/column\s+["']?([a-zA-Z0-9_]+)["']?/gi)) {
    if (match[1]) columns.add(match[1]);
  }

  for (const match of message.matchAll(/["']([a-zA-Z0-9_]+)["']\s+does not exist/gi)) {
    if (match[1]) columns.add(match[1]);
  }

  for (const match of message.matchAll(/Could not find the ['"]([a-zA-Z0-9_]+)['"] column/gi)) {
    if (match[1]) columns.add(match[1]);
  }

  if (columns.size === 0) {
    FALLBACK_UNSUPPORTED_COLUMNS.forEach((column) => {
      if (new RegExp(column, "i").test(message)) columns.add(column);
    });
  }

  return Array.from(columns);
}

function stripUnsupportedColumns(select: string, columns: string[]) {
  if (columns.length === 0) return select;
  const unsupported = new Set(columns.map((column) => column.trim()).filter(Boolean));

  return select
    .split(",")
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const baseColumn = part.split(/\s+/)[0]?.replace(/['"]/g, "");
      return baseColumn ? !unsupported.has(baseColumn) : true;
    })
    .join(", ");
}

function stripUnsupportedFields<T extends Record<string, any>>(payload: T, columns: string[]) {
  if (columns.length === 0) return payload;

  const next = { ...payload };
  columns.forEach((column) => {
    delete (next as any)[column];
  });
  return next;
}

function isMissingColumnError(error: any) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`;
  return error?.code === "42703" || /does not exist|Could not find the .* column/i.test(message);
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
    if (result.error && isMissingColumnError(result.error)) {
      const fallbackSelect = stripUnsupportedColumns(currentSelect, extractMissingColumns(result.error));
      if (fallbackSelect && fallbackSelect !== currentSelect) {
        currentSelect = fallbackSelect;
        continue;
      }
    }

    return {
      data: (result.data as unknown as SongRow[] | null) ?? [],
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

  let lastError: any = null;
  let currentPayload = { ...payload };
  let currentInsertPayload = { ...insertPayload };
  let strippedColumns = false;

  for (;;) {
    if (rows.length > 0) {
      const { error } = await supabase.from("songs").update(currentPayload).in("id", rows.map((row) => row.id));
      if (!error) return { ids: rows.map((row) => row.id), strippedCredits: strippedColumns };
      lastError = error;
      if (!isMissingColumnError(error)) throw error;
    } else {
      const { error } = await supabase.from("songs").insert({ ...currentInsertPayload, ...currentPayload });
      if (!error) return { ids: [] as string[], strippedCredits: strippedColumns };
      lastError = error;
      if (!isMissingColumnError(error)) throw error;
    }

    const missingColumns = extractMissingColumns(lastError);
    const nextPayload = stripUnsupportedFields(currentPayload, missingColumns);
    const nextInsertPayload = stripUnsupportedFields(currentInsertPayload, missingColumns);

    const payloadUnchanged = JSON.stringify(nextPayload) === JSON.stringify(currentPayload);
    const insertUnchanged = JSON.stringify(nextInsertPayload) === JSON.stringify(currentInsertPayload);
    if (payloadUnchanged && insertUnchanged) break;

    strippedColumns = true;
    currentPayload = nextPayload;
    currentInsertPayload = nextInsertPayload;
  }

  if (lastError) throw lastError;
  return { ids: [] as string[], strippedCredits: false };
}

export async function updateSongRecordsByIds(ids: string[], payload: Record<string, any>) {
  if (ids.length === 0) return;

  let lastError: any = null;
  let currentPayload = { ...payload };

  for (;;) {
    const { error } = await supabase.from("songs").update(currentPayload).in("id", ids);
    if (!error) return;
    lastError = error;
    if (!isMissingColumnError(error)) throw error;

    const nextPayload = stripUnsupportedFields(currentPayload, extractMissingColumns(error));
    if (JSON.stringify(nextPayload) === JSON.stringify(currentPayload)) break;
    currentPayload = nextPayload;
  }

  if (lastError) throw lastError;
}