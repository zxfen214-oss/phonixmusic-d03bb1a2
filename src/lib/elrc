// Stub helpers for eLRC export — original repo had these inlined/missing.
export function safeFilename(s: string): string {
  return (s || "untitled").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 120);
}

export function buildELrc(input: {
  synced_lyrics?: string | null;
  karaoke_words?: any[];
  title?: string;
  artist?: string;
}): string {
  const header = `[ti:${input.title ?? ""}]\n[ar:${input.artist ?? ""}]\n`;
  if (input.karaoke_words && input.karaoke_words.length) {
    const lines = input.karaoke_words
      .map((w: any) => {
        const t = Number(w.time ?? w.startTime ?? 0);
        const m = Math.floor(t / 60).toString().padStart(2, "0");
        const s = (t % 60).toFixed(2).padStart(5, "0");
        return `[${m}:${s}]${w.text ?? w.word ?? ""}`;
      })
      .join("\n");
    return header + lines;
  }
  return header + (input.synced_lyrics ?? "");
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
