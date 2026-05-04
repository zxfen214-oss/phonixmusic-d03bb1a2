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
  /** When true, use cheaper render scale + FPS. Default false. */
  lowEnd?: boolean;
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
  lowEnd = false,
  className,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<BackgroundRender<MeshGradientRenderer> | null>(null);

  const effFps = lowEnd ? Math.min(fps, 24) : fps;
  const effScale = lowEnd ? Math.min(renderScale, 0.35) : renderScale;


  // Mount renderer once
  useEffect(() => {
    if (!containerRef.current) return;
    const bg = BackgroundRender.new(MeshGradientRenderer);
    const el = bg.getElement();
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "block";
    el.style.willChange = "transform";
    (el.style as any).contain = "layout paint style";
    containerRef.current.appendChild(el);
    bgRef.current = bg;

    bg.setFlowSpeed(flowSpeed);
    bg.setRenderScale(effScale);
    bg.setFPS(effFps);

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
    bgRef.current?.setRenderScale(effScale);
  }, [effScale]);
  useEffect(() => {
    bgRef.current?.setFPS(effFps);
  }, [effFps]);

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
