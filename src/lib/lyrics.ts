import { supabase } from "@/integrations/supabase/client";
import { fetchMergedSongRecord } from "@/lib/songRecords";

export interface LyricLine {
  time: number; // in seconds
  text: string;
  secondaryText?: string; // parenthesized text like (ooh), rendered smaller & skipped in karaoke
  alignment?: 'left' | 'right'; // text alignment directive
  isMusic?: boolean; // instrumental section marker
  musicEnd?: number; // end time for music section (seconds)
  isNl?: boolean; // <nl> tag: next line joins as secondary main line
  elrcWords?: { word: string; startTime: number; endTime: number }[]; // eLRC word-level timestamps
  emWords?: Set<number>; // indices of words that have <em> emphasis
}

export interface ParsedLyrics {
  lines: LyricLine[];
  isSynced: boolean;
  defaultAlignment?: 'left' | 'right';
}

export async function fetchTextUtf8(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch text: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/**
 * Extract parenthesized segments from a lyric line.
 */
function extractParenthesized(text: string): { main: string; secondary: string | undefined } {
  const regex = /\([^)]+\)/g;
  const parens: string[] = [];
  const main = text.replace(regex, (match) => {
    parens.push(match);
    return '';
  }).replace(/\s{2,}/g, ' ').trim();

  if (parens.length === 0) return { main: text, secondary: undefined };
  return { main: main || text, secondary: parens.join(' ') };
}

/**
 * Parse time string like "00:30" or "01:25" to seconds
 */
function parseTimeStr(str: string): number {
  const parts = str.trim().split(':');
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(str) || 0;
}

/**
 * Parse eLRC word-level timestamps from a line text.
 * eLRC format: <hh:mm:ss.xx>word<hh:mm:ss.xx>word...
 * Returns the words with their timings, or null if not eLRC.
 */
function parseELRCWords(text: string, lineStartTime: number): { word: string; startTime: number; endTime: number }[] | null {
  // eLRC pattern: text contains inline word timestamps like <00:01.50>word
  const elrcPattern = /<(\d{1,2}):(\d{2})(?:[.:])(\d{2,3})>/g;
  const matches = [...text.matchAll(elrcPattern)];
  
  if (matches.length < 2) return null; // Need at least 2 timestamps for word-level
  
  const words: { word: string; startTime: number; endTime: number }[] = [];
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const centiseconds = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
    const startTime = minutes * 60 + seconds + centiseconds / 1000;
    
    // Get the text between this timestamp and the next
    const startIdx = match.index! + match[0].length;
    const endIdx = i < matches.length - 1 ? matches[i + 1].index! : text.length;
    const wordText = text.slice(startIdx, endIdx).trim();
    
    if (wordText) {
      const nextMatch = matches[i + 1];
      let endTime: number;
      if (nextMatch) {
        const nm = parseInt(nextMatch[1], 10);
        const ns = parseInt(nextMatch[2], 10);
        const nc = nextMatch[3] ? parseInt(nextMatch[3].padEnd(3, '0').slice(0, 3), 10) : 0;
        endTime = nm * 60 + ns + nc / 1000;
      } else {
        endTime = startTime + 0.5; // default 500ms for last word
      }
      
      words.push({ word: wordText, startTime, endTime });
    }
  }
  
  return words.length > 0 ? words : null;
}

/**
 * Parse an LRC file content into structured lyrics with timestamps.
 * Supports: standard LRC, eLRC (word-level), <left>, <right>, <music>start</music>end, <nl>
 */
export function parseLRC(content: string): ParsedLyrics {
  const lines: LyricLine[] = [];
  const lrcLines = content.replace(/\r\n?/g, "\n").split("\n");
  
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:[.:])(\d{2,3})?\]/g;
  const metadataRegex = /^\[(?:ar|ti|al|by|offset|re|ve|length):/i;
  
  let currentAlignment: 'left' | 'right' = 'left';
  let defaultAlignment: 'left' | 'right' = 'left';

  // Track if the previous timestamped line should be paired with the next one (standalone <nl> separator)
  let pendingNlPairing = false;

  for (const line of lrcLines) {
    const trimmedLine = line.trim();
    
    if (!trimmedLine || metadataRegex.test(trimmedLine)) {
      continue;
    }

    // Standalone <nl> on its own line: marks the previous timestamped line as paired with the next one.
    if (trimmedLine === '<nl>' || trimmedLine === '<dual>') {
      if (lines.length > 0) {
        lines[lines.length - 1].isNl = true;
        pendingNlPairing = true;
      }
      continue;
    }

    if (trimmedLine === '<left>') {
      currentAlignment = 'left';
      defaultAlignment = 'left';
      continue;
    }
    if (trimmedLine === '<right>') {
      currentAlignment = 'right';
      defaultAlignment = 'right';
      continue;
    }

    const musicMatch = trimmedLine.match(/^<music>([\d:]+)<\/music>([\d:]+)$/);
    if (musicMatch) {
      const musicStart = parseTimeStr(musicMatch[1]);
      const musicEnd = parseTimeStr(musicMatch[2]);
      lines.push({
        time: musicStart,
        text: '♪',
        isMusic: true,
        musicEnd,
        alignment: currentAlignment,
      });
      continue;
    }

    // Find all timestamps in the line
    const matches: { time: number; index: number }[] = [];
    let match;
    
    while ((match = timeRegex.exec(trimmedLine)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const centiseconds = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      const time = minutes * 60 + seconds + centiseconds / 1000;
      matches.push({ time, index: match.index + match[0].length });
    }
    
    timeRegex.lastIndex = 0;
    
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      let text = trimmedLine.slice(lastMatch.index).trim();
      
      // Check for inline alignment tags
      let lineAlignment = currentAlignment;
      if (text.startsWith('<right>')) {
        lineAlignment = 'right';
        text = text.slice(7).trim();
      } else if (text.startsWith('<left>')) {
        lineAlignment = 'left';
        text = text.slice(6).trim();
      }

      // Handle <nl> or <dual> as inline separator: "[00:05.00]Line A<nl>Line B"
      // or "[00:05.00]Line A<dual>Line B" — Line B becomes a parallel companion line
      // displayed at the same position, with its own karaoke timing.
      let isNl = false;
      let nlCompanionRaw: string | undefined;

      const dualIdx = text.indexOf('<dual>');
      const nlIdx = text.indexOf('<nl>');
      const splitIdx = dualIdx !== -1 ? dualIdx : nlIdx;
      const splitLen = dualIdx !== -1 ? 6 : 4;
      if (splitIdx !== -1) {
        isNl = true;
        nlCompanionRaw = text.slice(splitIdx + splitLen).trim();
        text = text.slice(0, splitIdx).trim();
      }
      
      // Also support <nl> at end without companion (legacy)
      if (text.endsWith('<nl>')) {
        isNl = true;
        text = text.slice(0, -4).trim();
      }
      
      for (const { time } of matches) {
        if (text) {
          const elrcWords = parseELRCWords(text, time);
          
          let displayText = text;
          if (elrcWords) {
            displayText = elrcWords.map(w => w.word).join(' ');
          }
          
          // Parse <em> tags
          const emWords = new Set<number>();
          const parts = displayText.split(/(<em>|<\/em>)/gi);
          let inEm = false;
          let finalWords: string[] = [];
          for (const part of parts) {
            if (part.toLowerCase() === '<em>') { inEm = true; continue; }
            if (part.toLowerCase() === '</em>') { inEm = false; continue; }
            const ws = part.split(/\s+/).filter(w => w.length > 0);
            for (const w of ws) {
              if (inEm) emWords.add(finalWords.length);
              finalWords.push(w);
            }
          }
          const emClean = finalWords.join(' ');
          
          const { main, secondary } = extractParenthesized(emClean);
          lines.push({ 
            time, 
            text: main, 
            secondaryText: secondary, 
            alignment: lineAlignment,
            isNl,
            elrcWords: elrcWords || undefined,
            emWords: emWords.size > 0 ? emWords : undefined,
          });

          // If there's an inline nl companion, add it as a separate line right after
          if (nlCompanionRaw) {
            const companionElrc = parseELRCWords(nlCompanionRaw, time);
            let companionDisplay = nlCompanionRaw;
            if (companionElrc) {
              companionDisplay = companionElrc.map(w => w.word).join(' ');
            }
            // Strip any remaining tags
            companionDisplay = companionDisplay.replace(/<\/?em>/gi, '');
            const { main: cMain, secondary: cSecondary } = extractParenthesized(companionDisplay);
            lines.push({
              time: time + 0.001, // tiny offset so it sorts right after parent
              text: cMain,
              secondaryText: cSecondary,
              alignment: lineAlignment,
              elrcWords: companionElrc || undefined,
            });
          }
        }
      }
    }
  }
  
  lines.sort((a, b) => a.time - b.time);
  
  return {
    lines,
    isSynced: lines.length > 0,
    defaultAlignment,
  };
}

/**
 * Fetch lyrics for a track - first checks database for .lrc file, then falls back to API
 */
export async function fetchSyncedLyrics(
  youtubeId: string | undefined,
  artist: string,
  title: string,
  album?: string
): Promise<ParsedLyrics | null> {
  if (youtubeId || title || artist) {
    try {
      const { merged: song } = await fetchMergedSongRecord(
        { youtubeId, title, artist, album },
        "lyrics_url, synced_lyrics, plain_lyrics, updated_at, created_at"
      );
      
      // Priority 1: synced_lyrics (DB source of truth)
      if (song?.synced_lyrics) {
        const parsed = parseLRC(song.synced_lyrics);
        if (parsed.lines.length > 0) {
          console.log(`Loaded synced lyrics from DB for ${title} with ${parsed.lines.length} lines`);
          return parsed;
        }
      }

      // Priority 2: lyrics_url (.lrc file backup)
      if (song?.lyrics_url) {
        const content = await fetchTextUtf8(song.lyrics_url);
        const parsed = parseLRC(content);
        if (parsed.lines.length > 0) {
          console.log(`Loaded synced lyrics for ${title} with ${parsed.lines.length} lines`);
          return parsed;
        }
      }

      // Priority 3: plain_lyrics (unsynced)
      if (song?.plain_lyrics) {
        const plainLines = song.plain_lyrics
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0);
        
        if (plainLines.length > 0) {
          return {
            lines: plainLines.map((text: string) => ({ time: -1, text })),
            isSynced: false,
          };
        }
      }
    } catch (error) {
      console.error("Error fetching lyrics from database:", error);
    }
  }
  
  try {
    const response = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    );
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.lyrics) {
        const plainLines = data.lyrics
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0);
        
        return {
          lines: plainLines.map((text: string) => ({
            time: -1,
            text,
          })),
          isSynced: false,
        };
      }
    }
  } catch (error) {
    console.error("Failed to fetch lyrics from API:", error);
  }
  
  return null;
}

/**
 * Find the current lyric line based on the current playback time
 */
export function getCurrentLyricIndex(lyrics: LyricLine[], currentTime: number, earlyAppearance: number = 0): number {
  if (lyrics.length === 0) return -1;
  
  if (lyrics[0].time === -1) {
    return -1;
  }
  
  // With early appearance, we check if the NEXT line should appear early
  const effectiveTime = currentTime + earlyAppearance;
  
  if (currentTime < lyrics[0].time && effectiveTime < lyrics[0].time) {
    return -1;
  }
  
  // First, find the normal index based on actual time
  let normalIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime) {
      normalIndex = i;
    } else {
      break;
    }
  }
  
  // Then check if the next line should appear early
  if (earlyAppearance > 0) {
    const nextIndex = normalIndex + 1;
    if (nextIndex < lyrics.length && lyrics[nextIndex].time <= effectiveTime) {
      return nextIndex;
    }
  }
  
  // For the very first line with early appearance
  if (normalIndex === -1 && earlyAppearance > 0 && lyrics[0].time <= effectiveTime) {
    return 0;
  }
  
  return normalIndex;
}
