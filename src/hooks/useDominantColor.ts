import { useState, useEffect } from 'react';

interface RGB {
  r: number;
  g: number;
  b: number;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function isValidColor(r: number, g: number, b: number): boolean {
  const { s, l } = rgbToHsl(r, g, b);
  return s > 20 && l > 20 && l < 85;
}

function getContrastRatio(r: number, g: number, b: number, bgL: number): number {
  const rsRGB = r / 255;
  const gsRGB = g / 255;
  const bsRGB = b / 255;
  
  const rLum = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const gLum = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const bLum = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
  
  const colorLum = 0.2126 * rLum + 0.7152 * gLum + 0.0722 * bLum;
  const bgLum = bgL / 100 * 0.1;
  
  const lighter = Math.max(colorLum, bgLum);
  const darker = Math.min(colorLum, bgLum);
  
  return (lighter + 0.05) / (darker + 0.05);
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

interface DominantColorResult {
  primary: string | null;
  palette: string[];
}

export function useDominantColor(imageUrl: string | null | undefined): string | null {
  const result = useDominantColors(imageUrl);
  return result.primary;
}

export function useDominantColors(imageUrl: string | null | undefined): DominantColorResult {
  const [result, setResult] = useState<DominantColorResult>({ primary: null, palette: [] });

  useEffect(() => {
    if (!imageUrl) {
      setResult({ primary: null, palette: [] });
      return;
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = 50;
        canvas.width = size;
        canvas.height = size;

        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size).data;

        const colorCounts: Map<string, { count: number; rgb: RGB }> = new Map();

        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const a = imageData[i + 3];

          if (a < 200) continue;
          if (!isValidColor(r, g, b)) continue;

          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = `${qr},${qg},${qb}`;

          const existing = colorCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            colorCounts.set(key, { count: 1, rgb: { r: qr, g: qg, b: qb } });
          }
        }

        // Score and sort all colors
        const scored: { rgb: RGB; score: number }[] = [];
        colorCounts.forEach(({ count, rgb }) => {
          const { s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
          const contrast = getContrastRatio(rgb.r, rgb.g, rgb.b, 5);
          const score = count * (s / 100) * Math.min(contrast, 5);
          scored.push({ rgb, score });
        });

        scored.sort((a, b) => b.score - a.score);

        // Pick top distinct colors (minimum distance apart)
        const picked: RGB[] = [];
        for (const { rgb } of scored) {
          if (picked.length >= 5) break;
          const tooClose = picked.some(p => colorDistance(p, rgb) < 80);
          if (!tooClose) picked.push(rgb);
        }

        const toHsl = (rgb: RGB): string => {
          const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
          const adjustedS = Math.min(s + 20, 90);
          const adjustedL = Math.max(Math.min(l, 70), 50);
          return `hsl(${Math.round(h)}, ${Math.round(adjustedS)}%, ${Math.round(adjustedL)}%)`;
        };

        const fallbackColor = 'hsl(4, 90%, 55%)';
        const fallbackPalette = ['hsl(4, 90%, 55%)', 'hsl(220, 70%, 50%)'];

        if (picked.length > 0) {
          setResult({
            primary: toHsl(picked[0]),
            palette: picked.map(toHsl),
          });
        } else {
          setResult({
            primary: fallbackColor,
            palette: fallbackPalette,
          });
        }
      } catch (error) {
        console.error('Error extracting dominant color:', error);
        const fallbackColor = 'hsl(4, 90%, 55%)';
        const fallbackPalette = ['hsl(4, 90%, 55%)', 'hsl(220, 70%, 50%)'];
        setResult({ primary: fallbackColor, palette: fallbackPalette });
      }
    };

    img.onerror = () => {
      const fallbackColor = 'hsl(4, 90%, 55%)';
      const fallbackPalette = ['hsl(4, 90%, 55%)', 'hsl(220, 70%, 50%)'];
      setResult({ primary: fallbackColor, palette: fallbackPalette });
    };

    img.src = imageUrl;
  }, [imageUrl]);

  return result;
}
