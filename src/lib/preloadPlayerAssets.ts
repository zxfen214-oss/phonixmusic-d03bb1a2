import iconPlay from "@/assets/icon-play.png";
import iconPause from "@/assets/icon-pause.png";
import iconNext from "@/assets/icon-next.png";
import iconPrev from "@/assets/icon-prev.png";
import lyricsIcon from "@/assets/lyrics-icon.png";

const preloaded = new Set<string>();

function preloadImage(src: string) {
  if (preloaded.has(src)) return;
  preloaded.add(src);
  const img = new Image();
  img.src = src;
}

export function preloadPlayerIcons() {
  preloadImage(iconPlay);
  preloadImage(iconPause);
  preloadImage(iconNext);
  preloadImage(iconPrev);
  preloadImage(lyricsIcon);
}

export function preloadArtwork(url: string | null | undefined) {
  if (url && !preloaded.has(url)) {
    preloadImage(url);
  }
}
