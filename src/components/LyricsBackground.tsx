import { useEffect, useRef } from "react";
import { BackgroundRender, MeshGradientRenderer } from "@applemusic-like-lyrics/core";

interface Props {
  /** Image URL (or any HTMLImageElement source) for the album artwork */
  albumSrc?: string | null;
  /** Flow speed, default 8 */
  flowSpeed?: number;
  /** Render scale 0-1, default 0.5 */
  renderScale?: number;
  /** FPS cap, default 30 */
  fps?: number;
  className?: string;
}

/**
 * Apple Music-like flowing background using AMLL's official MeshGradientRenderer.
 * Repo: https://github.com/amll-dev/applemusic-like-lyrics
 */
const LyricsBackground = ({
  albumSrc,
  flowSpeed = 8,
  renderScale = 0.5,
  fps = 30,
  className,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<BackgroundRender<MeshGradientRenderer> | null>(null);

  // Mount renderer once
  useEffect(() => {
    if (!containerRef.current) return;
    const bg = BackgroundRender.new(MeshGradientRenderer);
    const el = bg.getElement();
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "block";
    containerRef.current.appendChild(el);
    bgRef.current = bg;

    bg.setFlowSpeed(flowSpeed);
    bg.setRenderScale(renderScale);
    bg.setFPS(fps);

    return () => {
      bg.dispose();
      bgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to settings changes
  useEffect(() => {
    bgRef.current?.setFlowSpeed(flowSpeed);
  }, [flowSpeed]);
  useEffect(() => {
    bgRef.current?.setRenderScale(renderScale);
  }, [renderScale]);
  useEffect(() => {
    bgRef.current?.setFPS(fps);
  }, [fps]);

  // React to album change
  useEffect(() => {
    if (!bgRef.current || !albumSrc) return;
    bgRef.current.setAlbum(albumSrc).catch((err) => {
      console.error("setAlbum failed", err);
    });
  }, [albumSrc]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden ${className ?? ""}`}
      aria-hidden
    />
  );
};

export default LyricsBackground;
