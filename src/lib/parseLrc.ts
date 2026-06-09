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
/**
 * Smart background-line detection.
 *
 * Cases handled:
 *  1. Trailing "(...)" chunk on a normal line  -> split off as BG.
 *  2. Whole line is wrapped in parens (possibly with eLRC word tags around the
 *     parens, e.g. `<00:00.60>( <00:00.65> Hello)`) -> entire line is BG.
 *  3. Stray paren glyphs anywhere -> stripped from the main line text so they
 *     don't show as wobbly characters between words.
 */
function extractBgSegment(text: string): { main: string; bg: string | null; wholeIsBg: boolean } {
  // Strip word-tags to evaluate plain content
  const plain = text.replace(WORD_TAG, "").trim();
  WORD_TAG.lastIndex = 0;

  // Whole line is effectively bracketed (allowing nested or eLRC cases like
  // `(<00:00.60>( <00:00.65> Hello))`). Strip parens from raw text while
  // preserving word-tags (for timing) and the inner content order.
  // Rule: first non-space non-tag char is `(` AND last non-space non-tag char is `)`
  // AND the bracketed range covers the entire content.
  const stripped = plain.replace(/\s+/g, "");
  if (stripped.startsWith("(") && stripped.endsWith(")") && stripped.length >= 2) {
    // Walk depth to confirm the outermost `(` matches the outermost `)`
    let depth = 0;
    let opensAtZero = false;
    let closesAtEnd = false;
    let coversAll = true;
    for (let i = 0; i < stripped.length; i++) {
      const ch = stripped[i];
      if (ch === "(") {
        if (i === 0) opensAtZero = true;
        depth++;
      } else if (ch === ")") {
        depth--;
        if (depth === 0 && i !== stripped.length - 1) coversAll = false;
        if (i === stripped.length - 1 && depth === 0) closesAtEnd = true;
      }
    }
    if (opensAtZero && closesAtEnd && coversAll) {
      // Strip just the outermost matching pair from raw text
      let bgRaw = "";
      let d = 0;
      let i = 0;
      let strippedOpen = false;
      // Find outermost ( and ) positions in raw text (ignoring word tags)
      while (i < text.length) {
        const tagMatch = text.slice(i).match(/^<\d+:\d+(?:\.\d+)?>/);
        if (tagMatch) {
          if (strippedOpen && d > 0) bgRaw += tagMatch[0];
          else if (strippedOpen) bgRaw += tagMatch[0];
          else bgRaw += tagMatch[0]; // keep leading tags for timing
          i += tagMatch[0].length;
          continue;
        }
        const ch = text[i];
        if (ch === "(") {
          if (!strippedOpen) {
            strippedOpen = true; // skip outermost (
          } else {
            d++;
            bgRaw += ch;
          }
          i++;
          continue;
        }
        if (ch === ")") {
          if (d === 0 && strippedOpen) {
            // outermost closing — skip
            i++;
            continue;
          }
          d--;
          bgRaw += ch;
          i++;
          continue;
        }
        if (strippedOpen) bgRaw += ch;
        else bgRaw += ch;
        i++;
      }
      return { main: "", bg: bgRaw.trim(), wholeIsBg: true };
    }
  }

  // Trailing "(...)" segment — detect on plain text (which has word tags
  // stripped) so eLRC like  ...empty <00:01.20>(<00:01.30>Oh<00:01.50>)
  // is still recognised. Then strip the bracket from the raw `text` while
  // preserving word-tags inside it for timing.
  const plainTrail = plain.match(/\s*\(([^()]+)\)\s*$/);
  if (plainTrail) {
    // Find the position of the opening "(" in raw text, ignoring word tags.
    // Walk through the raw text mirroring `plain` characters.
    let mainRaw = "";
    let bgRaw = "";
    let depth = 0;
    let i = 0;
    while (i < text.length) {
      // Pass through whole word tags to whichever bucket is current.
      const tagMatch = text.slice(i).match(/^<\d+:\d+(?:\.\d+)?>/);
      if (tagMatch) {
        if (depth > 0) bgRaw += tagMatch[0];
        else mainRaw += tagMatch[0];
        i += tagMatch[0].length;
        continue;
      }
      const ch = text[i];
      if (ch === "(") {
        depth++;
        i++;
        continue;
      }
      if (ch === ")") {
        depth--;
        i++;
        continue;
      }
      if (depth > 0) bgRaw += ch;
      else mainRaw += ch;
      i++;
    }
    return { main: mainRaw.trim(), bg: bgRaw.trim(), wholeIsBg: false };
  }

  return { main: text, bg: null, wholeIsBg: false };
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
      // Background segment detection (smart): trailing "(...)", whole-line "(...)" or stray parens
      const { main, bg, wholeIsBg } = extractBgSegment(rest);
      if (!wholeIsBg) {
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
      }
      if (bg) {
        const bgWords = buildWordsFromText(bg, start, offset);
        if (bgWords.length) {
          out.push({
            start: wholeIsBg ? start : start + 0.0005,
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

/**
 * Inject manual karaoke word timings (PhonixMusic karaoke_data.words) into AMLL
 * lines that don't already carry true eLRC word-level timing.
 *
 * For each line:
 *   • If the line already has >1 word (eLRC tags produced multiple words), keep it.
 *   • Otherwise look for karaoke words whose startTime falls within
 *     [line.startTime, line.endTime] (or matches lineIndex) and rebuild the word array.
 *
 * Karaoke words are in seconds. AMLL works in ms.
 */
export function applyManualKaraoke(
  lines: LyricLine[],
  karaokeWords: { word: string; startTime: number; endTime: number; lineIndex?: number }[],
): LyricLine[] {
  if (!karaokeWords?.length || !lines.length) return lines;

  const byLineIndex = new Map<number, typeof karaokeWords>();
  let hasLineIndex = false;
  for (const w of karaokeWords) {
    if (typeof w.lineIndex === "number") {
      hasLineIndex = true;
      const arr = byLineIndex.get(w.lineIndex) ?? [];
      arr.push(w);
      byLineIndex.set(w.lineIndex, arr);
    }
  }

  return lines.map((line, i) => {
    if (line.words.length > 1) return line;

    let bucket: typeof karaokeWords | undefined;
    if (hasLineIndex) {
      bucket = byLineIndex.get(i);
    } else {
      bucket = karaokeWords.filter(
        (w) =>
          w.startTime * 1000 >= line.startTime - 50 &&
          w.startTime * 1000 < line.endTime + 50,
      );
    }
    if (!bucket || bucket.length === 0) return line;

    const sorted = [...bucket].sort((a, b) => a.startTime - b.startTime);
    const newWords: LyricWord[] = sorted.map((w, idx) => {
      const next = sorted[idx + 1];
      const startMs = w.startTime * 1000;
      const endMs = Math.max(
        startMs + 80,
        Math.min(
          (w.endTime || w.startTime + 0.4) * 1000,
          next ? next.startTime * 1000 : line.endTime,
        ),
      );
      return {
        word: idx < sorted.length - 1 ? `${w.word} ` : w.word,
        startTime: startMs,
        endTime: endMs,
        obscene: false,
      };
    });

    return { ...line, words: newWords };
  });
}
