// eLRC export helpers. Supports plain LRC, eLRC karaoke words, and TTML input.
import { isTtml, ttmlToELrc, applyLrcOffset } from "./ttml";

export function safeFilename(s: string): string {
  return (s || "untitled").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 120);
}

export function buildELrc(input: {
  synced_lyrics?: string | null;
  karaoke_words?: any[];
  title?: string;
  artist?: string;
  /** Optional offset in milliseconds (positive = delay, negative = earlier). */
  offsetMs?: number;
}): string {
  const header = `[ti:${input.title ?? ""}]\n[ar:${input.artist ?? ""}]\n`;
  const offsetMs = input.offsetMs ?? 0;

  // Priority 1: word-level karaoke timings.
  if (input.karaoke_words && input.karaoke_words.length) {
    const lines = input.karaoke_words
      .map((w: any) => {
        const tSec = Number(w.time ?? w.startTime ?? 0) + offsetMs / 1000;
        const safe = Math.max(0, tSec);
        const m = Math.floor(safe / 60).toString().padStart(2, "0");
        const s = (safe - Math.floor(safe / 60) * 60).toFixed(2).padStart(5, "0");
        return `[${m}:${s}]${w.text ?? w.word ?? ""}`;
      })
      .join("\n");
    return header + lines;
  }

  // Priority 2: synced lyrics. Convert TTML if needed, then apply offset.
  let synced = input.synced_lyrics ?? "";
  if (synced && isTtml(synced)) {
    synced = ttmlToELrc(synced) || synced;
  }
  if (offsetMs) synced = applyLrcOffset(synced, offsetMs);

  return header + synced;
}

export function downloadELrcFile(content: string, filename: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
