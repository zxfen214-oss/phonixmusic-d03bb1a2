import { useRef, useEffect, useState } from "react";

interface MarqueeTextProps {
  text: string;
  className?: string;
  pauseMs?: number;
  speedPxPerSec?: number;
}

export default function MarqueeText({
  text,
  className = "",
  pauseMs = 2500,
  speedPxPerSec = 80,
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const measure = () => {
      const tw = textEl.scrollWidth;
      const cw = container.clientWidth;
      setTextWidth(tw);
      setContainerWidth(cw);
      setOverflow(tw > cw + 2 ? tw - cw : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text]);

  useEffect(() => {
    if (overflow <= 0) return;

    let timeout: ReturnType<typeof setTimeout>;
    let raf: number;
    let cancelled = false;

    const textEl = textRef.current;
    if (!textEl) return;

    const cycle = () => {
      if (cancelled) return;
      textEl.style.transition = "none";
      textEl.style.transform = "translateX(0)";

      timeout = setTimeout(() => {
        if (cancelled) return;
        const scrollOutDist = textWidth + 20;
        const scrollOutMs = (scrollOutDist / speedPxPerSec) * 1000;
        textEl.style.transition = `transform ${scrollOutMs}ms linear`;
        textEl.style.transform = `translateX(-${scrollOutDist}px)`;

        timeout = setTimeout(() => {
          if (cancelled) return;
          textEl.style.transition = "none";
          textEl.style.transform = `translateX(${containerWidth + 20}px)`;

          raf = requestAnimationFrame(() => {
            if (cancelled) return;
            const scrollInDist = containerWidth + 20;
            const scrollInMs = (scrollInDist / speedPxPerSec) * 1000;
            textEl.style.transition = `transform ${scrollInMs}ms linear`;
            textEl.style.transform = "translateX(0)";

            timeout = setTimeout(() => {
              if (cancelled) return;
              timeout = setTimeout(() => {
                if (cancelled) return;
                cycle();
              }, pauseMs);
            }, scrollInMs);
          });
        }, scrollOutMs);
      }, pauseMs);
    };

    cycle();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [overflow, textWidth, containerWidth, pauseMs, speedPxPerSec]);

  return (
    <div ref={containerRef} className="overflow-hidden whitespace-nowrap">
      <span ref={textRef} className={`inline-block ${className}`}>
        {text}
      </span>
    </div>
  );
}
