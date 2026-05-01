import type { LyricLine, LyricWord } from "@applemusic-like-lyrics/core";

/**
 * Parse standard LRC and Enhanced LRC (eLRC / A2 extension).
 *
 * Supports:
 *   [mm:ss.xx] line text                 -> standard line timing
 *   [mm:ss.xx] <mm:ss.xx> word <mm:ss.xx> word ...   -> enhanced word timing
 *   Multiple line timestamps prefix: [00:01.00][00:30.00] text
 *   Metadata tags like [ti:..], [ar:..], [offset:..] are honored where useful.
 */

const TIME_TAG = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
const WORD_TAG = /<(\d+):(\d+(?:\.\d+)?)>/g;
const META_TAG = /^\[(ti|ar|al|by|offset|length):(.*)\]$/i;

const toMs = (mm: string, ss: string) =>
  (parseInt(mm, 10) * 60 + parseFloat(ss)) * 1000;

export function parseLrc(text: string): LyricLine[] {
  const rawLines = text.replace(/\r/g, "").split("\n");
  let offset = 0;

  // pre-pass: offset metadata
  for (const raw of rawLines) {
    const m = raw.trim().match(META_TAG);
    if (m && m[1].toLowerCase() === "offset") {
      const v = parseInt(m[2].trim(), 10);
      if (!Number.isNaN(v)) offset = v;
    }
  }

  type Tmp = { start: number; words: LyricWord[]; plain: string };
  const out: Tmp[] = [];

  for (const raw of rawLines) {
    if (!raw.trim()) continue;
    if (META_TAG.test(raw.trim())) continue;

    // Collect leading [mm:ss.xx] timestamps
    const starts: number[] = [];
    let rest = raw;
    TIME_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    let lastIdx = 0;
    while ((m = TIME_TAG.exec(raw))) {
      if (m.index !== lastIdx) break;
      starts.push(toMs(m[1], m[2]) + offset);
      lastIdx = TIME_TAG.lastIndex;
    }
    if (!starts.length) continue;
    rest = raw.slice(lastIdx);

    // Word-level (eLRC)?
    const hasWordTags = /<\d+:\d+(?:\.\d+)?>/.test(rest);

    for (const start of starts) {
      if (hasWordTags) {
        const words: LyricWord[] = [];
        // Split into segments by word-time tags
        const tokens: { time: number; text: string }[] = [];
        // Initial chunk before first <..> uses the line start time
        WORD_TAG.lastIndex = 0;
        let cursor = 0;
        let firstMatch = WORD_TAG.exec(rest);
        if (firstMatch && firstMatch.index > 0) {
          tokens.push({ time: start, text: rest.slice(0, firstMatch.index) });
        } else if (!firstMatch) {
          tokens.push({ time: start, text: rest });
        }
        let curMatch = firstMatch;
        while (curMatch) {
          const t = toMs(curMatch[1], curMatch[2]) + offset;
          cursor = WORD_TAG.lastIndex;
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
        if (words.length) {
          out.push({
            start,
            words,
            plain: words.map((w) => w.word).join(""),
          });
        }
      } else {
        const text = rest.trim();
        if (!text) continue;
        out.push({
          start,
          words: [{ word: text, startTime: start, endTime: start + 4000, obscene: false }],
          plain: text,
        });
      }
    }
  }

  out.sort((a, b) => a.start - b.start);

  const lines: LyricLine[] = out.map((l, i) => {
    const next = out[i + 1];
    const lineEnd = next ? next.start : l.start + 5000;
    // Cap last word end to line end
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
      isBG: false,
      isDuet: false,
    };
  });

  return lines;
}

export function getLyricsDuration(lines: LyricLine[]): number {
  if (!lines.length) return 0;
  return lines[lines.length - 1].endTime + 1000;
}
