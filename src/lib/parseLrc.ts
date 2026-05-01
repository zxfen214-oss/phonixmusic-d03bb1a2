import type { LyricLine, LyricWord } from "@applemusic-like-lyrics/core";

/**
 * Parse standard LRC and Enhanced LRC (eLRC / A2 extension) for the AMLL renderer.
 *
 * Supports:
 *   [mm:ss.xx] line text                       -> standard line timing
 *   [mm:ss.xx] <mm:ss.xx> word ...             -> enhanced word timing (eLRC)
 *   Multiple line timestamps prefix: [00:01][00:30] text
 *   <left> / <right>                           -> default alignment switch (right => isDuet)
 *   <nl> / <dual>                              -> dual / parallel line (own AMLL line at +1ms)
 *   "(parenthesized text)"                     -> AMLL Background Lyric Line (isBG)
 */

const TIME_TAG = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
const WORD_TAG = /<(\d+):(\d+(?:\.\d+)?)>/g;
const META_TAG = /^\[(ti|ar|al|by|offset|length):(.*)\]$/i;

const toMs = (mm: string, ss: string) =>
  (parseInt(mm, 10) * 60 + parseFloat(ss)) * 1000;

interface BuiltLine {
  start: number;
  words: LyricWord[];
  plain: string;
  isDuet: boolean;
  isBG: boolean;
}

function buildWordsFromText(rest: string, lineStart: number, offset: number): LyricWord[] {
  const hasWordTags = /<\d+:\d+(?:\.\d+)?>/.test(rest);
  if (hasWordTags) {
    const words: LyricWord[] = [];
    const tokens: { time: number; text: string }[] = [];
    WORD_TAG.lastIndex = 0;
    let firstMatch = WORD_TAG.exec(rest);
    if (firstMatch && firstMatch.index > 0) {
      tokens.push({ time: lineStart, text: rest.slice(0, firstMatch.index) });
    } else if (!firstMatch) {
      tokens.push({ time: lineStart, text: rest });
    }
    let curMatch = firstMatch;
    while (curMatch) {
      const t = toMs(curMatch[1], curMatch[2]) + offset;
      const cursor = WORD_TAG.lastIndex;
      const next = WORD_TAG.exec(rest);
      const text = rest.slice(cursor, next ? next.index : rest.length);
      tokens.push({ time: t, text });
      curMatch = next;
    }
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      if (!tk.text) continue;
      const end = tokens[i + 1]?.time ?? tk.time + Math.max(200, tk.text.length * 60);
      words.push({ word: tk.text, startTime: tk.time, endTime: end, obscene: false });
    }
    return words;
  }
  const text = rest.trim();
  if (!text) return [];
  return [{ word: text, startTime: lineStart, endTime: lineStart + 4000, obscene: false }];
}

/**
 * Split a parenthesized "(...)" segment off the end of a line into a separate
 * AMLL background lyric line (isBG=true). Returns [main, bgRaw|null].
 */
function extractBgSegment(text: string): { main: string; bg: string | null } {
  // Match a trailing (...) chunk (allow word-tags inside)
  const m = text.match(/\s*\(([^()]+)\)\s*$/);
  if (!m) return { main: text, bg: null };
  const main = text.slice(0, m.index).trim();
  return { main, bg: m[1].trim() };
}

export function parseLrc(text: string): LyricLine[] {
  const rawLines = text.replace(/\r/g, "").split("\n");
  let offset = 0;

  for (const raw of rawLines) {
    const m = raw.trim().match(META_TAG);
    if (m && m[1].toLowerCase() === "offset") {
      const v = parseInt(m[2].trim(), 10);
      if (!Number.isNaN(v)) offset = v;
    }
  }

  let currentDuet = false; // <left> => false, <right> => true
  const out: BuiltLine[] = [];

  let pendingNlForLast = false;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (META_TAG.test(trimmed)) continue;

    // Standalone alignment / dual markers
    if (trimmed === "<left>") { currentDuet = false; continue; }
    if (trimmed === "<right>") { currentDuet = true; continue; }
    if (trimmed === "<nl>" || trimmed === "<dual>") {
      pendingNlForLast = true;
      continue;
    }

    // Collect leading [mm:ss.xx] timestamps
    const starts: number[] = [];
    TIME_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    let lastIdx = 0;
    while ((m = TIME_TAG.exec(raw))) {
      if (m.index !== lastIdx) break;
      starts.push(toMs(m[1], m[2]) + offset);
      lastIdx = TIME_TAG.lastIndex;
    }
    if (!starts.length) continue;
    let rest = raw.slice(lastIdx);

    // Inline alignment overrides
    let lineDuet = currentDuet;
    if (rest.startsWith("<right>")) { lineDuet = true; rest = rest.slice(7); }
    else if (rest.startsWith("<left>")) { lineDuet = false; rest = rest.slice(6); }

    // Inline <nl> / <dual> => companion line at same timestamp
    let companionRaw: string | null = null;
    const dualIdx = rest.indexOf("<dual>");
    const nlIdx = rest.indexOf("<nl>");
    const splitIdx = dualIdx !== -1 ? dualIdx : nlIdx;
    const splitLen = dualIdx !== -1 ? 6 : 4;
    if (splitIdx !== -1) {
      companionRaw = rest.slice(splitIdx + splitLen).trim();
      rest = rest.slice(0, splitIdx);
    }

    // Strip <em> tags (AMLL doesn't render them, keep words clean)
    rest = rest.replace(/<\/?em>/gi, "");
    if (companionRaw) companionRaw = companionRaw.replace(/<\/?em>/gi, "");

    for (const start of starts) {
      // Background segment from "(...)" trailing chunk
      const { main, bg } = extractBgSegment(rest);
      const mainWords = buildWordsFromText(main || rest, start, offset);
      if (mainWords.length) {
        out.push({
          start,
          words: mainWords,
          plain: mainWords.map(w => w.word).join(""),
          isDuet: lineDuet,
          isBG: false,
        });
      }
      if (bg) {
        const bgWords = buildWordsFromText(bg, start, offset);
        if (bgWords.length) {
          out.push({
            start: start + 0.0005,
            words: bgWords,
            plain: bgWords.map(w => w.word).join(""),
            isDuet: lineDuet,
            isBG: true,
          });
        }
      }

      // Companion (dual) line — same time, alternate alignment so AMLL renders side-by-side feel
      if (companionRaw) {
        const compWords = buildWordsFromText(companionRaw, start, offset);
        if (compWords.length) {
          out.push({
            start: start + 0.001,
            words: compWords,
            plain: compWords.map(w => w.word).join(""),
            isDuet: !lineDuet,
            isBG: false,
          });
        }
      }
    }

    if (pendingNlForLast) {
      // Flag previous line so renderer treats next line as parallel — AMLL has no
      // direct flag, so we approximate by flipping its duet alignment.
      const prev = out[out.length - 2];
      if (prev) prev.isDuet = !out[out.length - 1].isDuet;
      pendingNlForLast = false;
    }
  }

  out.sort((a, b) => a.start - b.start);

  const lines: LyricLine[] = out.map((l, i) => {
    const next = out[i + 1];
    const lineEnd = next ? next.start : l.start + 5000;
    const words = l.words.map((w, idx) => {
      const isLast = idx === l.words.length - 1;
      return isLast
        ? { ...w, endTime: Math.max(w.startTime + 200, Math.min(w.endTime, lineEnd)) }
        : w;
    });
    return {
      words,
      translatedLyric: "",
      romanLyric: "",
      startTime: l.start,
      endTime: lineEnd,
      isBG: l.isBG,
      isDuet: l.isDuet,
    };
  });

  return lines;
}

export function getLyricsDuration(lines: LyricLine[]): number {
  if (!lines.length) return 0;
  return lines[lines.length - 1].endTime + 1000;
}
