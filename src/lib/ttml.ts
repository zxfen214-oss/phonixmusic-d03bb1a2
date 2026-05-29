/**
 * TTML (Apple Music / Timed Text Markup Language) support.
 *
 * Handles both:
 *   • Plain TTML (line-level timing): <p begin="..." end="...">Line text</p>
 *   • Karaoke TTML (word-level timing): <p ...><span begin="..." end="...">word</span> ...</p>
 *
 * Converts TTML to Enhanced LRC (eLRC) so the rest of the pipeline
 * (parseLrc / AMLL / eLRC export) handles it uniformly.
 */

/** Parse a TTML time expression to milliseconds.
 *  Supports: "12.345s", "1500ms", "00:00:12.345", "00:12.345", "12:34:56" */
export function parseTtmlTime(raw: string | null | undefined): number {
  if (!raw) return 0;
  const s = raw.trim();
  if (!s) return 0;
  if (/ms$/i.test(s)) return parseFloat(s);
  if (/s$/i.test(s)) return parseFloat(s) * 1000;
  const parts = s.split(":");
  if (parts.length === 3) {
    return (parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])) * 1000;
  }
  if (parts.length === 2) {
    return (parseFloat(parts[0]) * 60 + parseFloat(parts[1])) * 1000;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n * 1000 : 0;
}

/** Detect if a text payload is TTML. */
export function isTtml(text: string): boolean {
  if (!text) return false;
  const head = text.trimStart().slice(0, 400).toLowerCase();
  if (head.startsWith("<?xml") && head.includes("<tt")) return true;
  if (head.startsWith("<tt") || head.includes("ttml")) return true;
  return /<tt\b[^>]*xmlns/i.test(head);
}

function fmtLrcTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total - Math.floor(total / 60) * 60).toFixed(2).padStart(5, "0");
  return `${mm}:${ss}`;
}

/** Convert TTML XML text to Enhanced LRC text. Returns "" on parse failure. */
export function ttmlToELrc(content: string): string {
  if (typeof DOMParser === "undefined") return "";
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(content, "text/xml");
  } catch {
    return "";
  }
  // If XML parser hit an error, parsererror element will exist
  if (doc.getElementsByTagName("parsererror").length) {
    // Fall back to HTML-style parse — TTML usually still works as HTML
    try {
      doc = new DOMParser().parseFromString(content, "text/html");
    } catch {
      return "";
    }
  }
  const ps = Array.from(doc.getElementsByTagName("p"));
  if (!ps.length) return "";

  const lines: string[] = [];
  for (const p of ps) {
    const beginAttr = p.getAttribute("begin");
    if (!beginAttr) continue;
    const begin = parseTtmlTime(beginAttr);
    const end = parseTtmlTime(p.getAttribute("end") ?? "");

    const spans = Array.from(p.getElementsByTagName("span")).filter(
      (s) => s.getAttribute("begin") !== null,
    );

    let body: string;
    if (spans.length) {
      // Karaoke / word-level
      let out = "";
      for (const s of spans) {
        const wb = parseTtmlTime(s.getAttribute("begin"));
        out += `<${fmtLrcTime(wb)}>${(s.textContent ?? "").replace(/\s+/g, " ")}`;
      }
      const last = spans[spans.length - 1];
      const lastEnd = last.getAttribute("end");
      if (lastEnd) out += `<${fmtLrcTime(parseTtmlTime(lastEnd))}>`;
      else if (end) out += `<${fmtLrcTime(end)}>`;
      body = out;
    } else {
      body = (p.textContent ?? "").replace(/\s+/g, " ").trim();
    }
    lines.push(`[${fmtLrcTime(begin)}]${body}`);
  }
  return lines.join("\n");
}

/** Normalize any lyrics text (LRC, eLRC, or TTML) to eLRC. */
export function normalizeLyricsText(text: string): string {
  if (!text) return text;
  if (isTtml(text)) {
    const converted = ttmlToELrc(text);
    if (converted) return converted;
  }
  return text;
}

/** Shift every [mm:ss.xx] and <mm:ss.xx> timestamp in an LRC/eLRC payload. */
export function applyLrcOffset(lrc: string, offsetMs: number): string {
  if (!offsetMs || !lrc) return lrc;
  const shift = (mm: string, ss: string) => {
    const totalMs = (parseInt(mm, 10) * 60 + parseFloat(ss)) * 1000 + offsetMs;
    return fmtLrcTime(totalMs);
  };
  return lrc
    .replace(/\[(\d+):(\d+(?:\.\d+)?)\]/g, (_, mm, ss) => `[${shift(mm, ss)}]`)
    .replace(/<(\d+):(\d+(?:\.\d+)?)>/g, (_, mm, ss) => `<${shift(mm, ss)}>`);
}
