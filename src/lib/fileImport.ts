import { Track } from '@/types/music';
import { saveTrack, saveAudioFile } from '@/lib/database';

interface MediaTags {
  title?: string;
  artist?: string;
  album?: string;
  picture?: string;
}

// Parse ID3v1 tags from the last 128 bytes
function parseID3v1(buffer: ArrayBuffer): MediaTags {
  const view = new DataView(buffer);
  const decoder = new TextDecoder('iso-8859-1');
  
  // Check for TAG marker
  const tagMarker = decoder.decode(new Uint8Array(buffer.slice(-128, -125)));
  if (tagMarker !== 'TAG') {
    return {};
  }
  
  const data = buffer.slice(-128);
  
  return {
    title: decoder.decode(new Uint8Array(data.slice(3, 33))).replace(/\0/g, '').trim() || undefined,
    artist: decoder.decode(new Uint8Array(data.slice(33, 63))).replace(/\0/g, '').trim() || undefined,
    album: decoder.decode(new Uint8Array(data.slice(63, 93))).replace(/\0/g, '').trim() || undefined,
  };
}

// Parse ID3v2 tags from the beginning of the file
function parseID3v2(buffer: ArrayBuffer): MediaTags {
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');
  
  // Check for ID3 marker
  const id3Marker = decoder.decode(new Uint8Array(buffer.slice(0, 3)));
  if (id3Marker !== 'ID3') {
    return {};
  }
  
  const tags: MediaTags = {};
  
  // Get ID3v2 header info
  const majorVersion = view.getUint8(3);
  const flags = view.getUint8(5);
  
  // Calculate tag size (syncsafe integer)
  const size = (view.getUint8(6) << 21) | (view.getUint8(7) << 14) | 
               (view.getUint8(8) << 7) | view.getUint8(9);
  
  let offset = 10;
  const endOffset = Math.min(10 + size, buffer.byteLength);
  
  while (offset < endOffset - 10) {
    // Read frame header
    let frameId: string;
    let frameSize: number;
    
    if (majorVersion >= 3) {
      frameId = decoder.decode(new Uint8Array(buffer.slice(offset, offset + 4)));
      if (majorVersion === 4) {
        // ID3v2.4 uses syncsafe integers
        frameSize = (view.getUint8(offset + 4) << 21) | (view.getUint8(offset + 5) << 14) | 
                    (view.getUint8(offset + 6) << 7) | view.getUint8(offset + 7);
      } else {
        frameSize = view.getUint32(offset + 4);
      }
      offset += 10;
    } else {
      // ID3v2.2
      frameId = decoder.decode(new Uint8Array(buffer.slice(offset, offset + 3)));
      frameSize = (view.getUint8(offset + 3) << 16) | (view.getUint8(offset + 4) << 8) | 
                  view.getUint8(offset + 5);
      offset += 6;
    }
    
    if (frameSize === 0 || !frameId.match(/^[A-Z0-9]+$/)) {
      break;
    }
    
    const frameData = new Uint8Array(buffer.slice(offset, offset + frameSize));
    
    // Parse text frames
    if (frameId === 'TIT2' || frameId === 'TT2') {
      tags.title = parseTextFrame(frameData);
    } else if (frameId === 'TPE1' || frameId === 'TP1') {
      tags.artist = parseTextFrame(frameData);
    } else if (frameId === 'TALB' || frameId === 'TAL') {
      tags.album = parseTextFrame(frameData);
    } else if (frameId === 'APIC' || frameId === 'PIC') {
      tags.picture = parseImageFrame(frameData, majorVersion);
    }
    
    offset += frameSize;
  }
  
  return tags;
}

function parseTextFrame(data: Uint8Array): string | undefined {
  if (data.length === 0) return undefined;
  
  const encoding = data[0];
  let text: string;
  
  if (encoding === 0) {
    // ISO-8859-1
    text = new TextDecoder('iso-8859-1').decode(data.slice(1));
  } else if (encoding === 1) {
    // UTF-16 with BOM
    text = new TextDecoder('utf-16').decode(data.slice(1));
  } else if (encoding === 2) {
    // UTF-16BE
    text = new TextDecoder('utf-16be').decode(data.slice(1));
  } else {
    // UTF-8
    text = new TextDecoder('utf-8').decode(data.slice(1));
  }
  
  return text.replace(/\0/g, '').trim() || undefined;
}

function parseImageFrame(data: Uint8Array, version: number): string | undefined {
  try {
    let offset = 1; // Skip encoding byte
    
    // Get MIME type
    let mimeType = '';
    if (version >= 3) {
      while (offset < data.length && data[offset] !== 0) {
        mimeType += String.fromCharCode(data[offset]);
        offset++;
      }
      offset++; // Skip null terminator
    } else {
      // ID3v2.2 uses 3-character image format
      const format = String.fromCharCode(data[1], data[2], data[3]);
      mimeType = format === 'PNG' ? 'image/png' : 'image/jpeg';
      offset = 4;
    }
    
    // Skip picture type
    offset++;
    
    // Skip description
    while (offset < data.length && data[offset] !== 0) {
      offset++;
    }
    offset++;
    
    // Handle UTF-16 descriptions (double null terminator)
    if (data[0] === 1 || data[0] === 2) {
      while (offset < data.length - 1 && (data[offset] !== 0 || data[offset + 1] !== 0)) {
        offset++;
      }
      offset += 2;
    }
    
    // Rest is image data
    const imageData = data.slice(offset);
    if (imageData.length === 0) return undefined;
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < imageData.length; i++) {
      binary += String.fromCharCode(imageData[i]);
    }
    
    const finalMimeType = mimeType || 'image/jpeg';
    return `data:${finalMimeType};base64,${btoa(binary)}`;
  } catch {
    return undefined;
  }
}

export async function readMediaTags(file: File): Promise<MediaTags> {
  try {
    const buffer = await file.arrayBuffer();
    
    // Try ID3v2 first (more complete), then fall back to ID3v1
    let tags = parseID3v2(buffer);
    
    if (!tags.title && !tags.artist && !tags.album) {
      tags = { ...tags, ...parseID3v1(buffer) };
    }
    
    return tags;
  } catch (error) {
    console.warn('Error reading media tags:', error);
    return {};
  }
}

export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });
    
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load audio file'));
    });
    
    audio.src = url;
  });
}

export async function importLocalFile(file: File): Promise<Track> {
  // Read metadata
  const tags = await readMediaTags(file);
  const duration = await getAudioDuration(file);
  
  // Generate unique ID
  const id = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Create track object
  const track: Track = {
    id,
    title: tags.title || file.name.replace(/\.[^/.]+$/, ''),
    artist: tags.artist || 'Unknown Artist',
    album: tags.album || 'Unknown Album',
    duration: Math.round(duration),
    artwork: tags.picture,
    source: 'local',
    filePath: file.name,
    addedAt: new Date(),
  };
  
  // Save to IndexedDB
  await saveTrack(track);
  await saveAudioFile(id, file, file.type);
  
  return track;
}

export async function importMultipleFiles(files: FileList): Promise<Track[]> {
  const supportedExtensions = /\.(mp3|wav|ogg|mp4|m4a|flac|aac)$/i;
  const tracks: Track[] = [];
  
  for (const file of Array.from(files)) {
    if (!supportedExtensions.test(file.name)) {
      console.warn(`Skipping unsupported file: ${file.name}`);
      continue;
    }
    
    try {
      const track = await importLocalFile(file);
      tracks.push(track);
    } catch (error) {
      console.error(`Failed to import ${file.name}:`, error);
    }
  }
  
  return tracks;
}

export function getSupportedFormats(): string {
  return '.mp3,.wav,.ogg,.mp4,.m4a,.flac,.aac';
}
