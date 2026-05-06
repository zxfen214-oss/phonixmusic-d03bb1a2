import iconLossless from "@/assets/icon-lossless.png";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  iconSize?: number;
  fontSize?: number;
}

type BadgeFormat = "lossless" | "dolby";

interface BadgeFullProps extends Props {
  format?: BadgeFormat;
}

export function LosslessBadge({
  className,
  iconSize = 14,
  fontSize = 11,
  format = "lossless",
}: BadgeFullProps) {
  const label = format === "dolby" ? "Dolby Audio" : "Lossless";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 backdrop-blur-sm",
        className
      )}
      style={{
        background: "rgba(255,255,255,0.12)",
        color: "rgba(255,255,255,0.95)",
        fontSize: `${fontSize}px`,
        fontWeight: 600,
        letterSpacing: "0.06em",
        borderRadius: "4px",
      }}
    >
      <img
        src={iconLossless}
        alt=""
        style={{ height: `${iconSize}px`, width: "auto" }}
        className="select-none"
        draggable={false}
      />
      <span>{label}</span>
    </div>
  );
}
