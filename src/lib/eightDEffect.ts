/**
 * Re-export from the unified audio graph so existing imports keep working.
 * The actual implementation now lives in `audioGraph.ts` and shares its
 * wiring with the karaoke (vocal removal) effect.
 */
export { applyEightDToAudio } from "@/lib/audioGraph";
