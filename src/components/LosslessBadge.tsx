import iconLossless from "@/assets/icon-lossless.png";
import iconDolby from "@/assets/Untitled57_20260516142150.png";
import sfHeavy from "@/assets/SF-Pro-Display-Heavy-2.ttf";
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

// Inject font once
const fontId = "sf-pro-display-heavy-font";

if (typeof document !== "undefined" && !document.getElementById(fontId)) {
  const style = document.createElement("style");
  style.id = fontId;

  style.innerHTML = `
    @font-face {
      font-family: 'SF Pro Display Heavy';
      src: url(${sfHeavy}) format('truetype');
      font-weight: 900;
      font-style: normal;
    }
  `;

  document.head.appendChild(style);
}

export function LosslessBadge({
  className,
  iconSize = 14,
  fontSize = 11,
  format = "lossless",
}: BadgeFullProps) {
  const isDolby = format === "dolby";

  const label = isDolby ? "Dolby Atmos" : "Lossless";
  const icon = isDolby ? iconDolby : iconLossless;

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
        fontFamily: "'SF Pro Display Heavy', sans-serif",
        fontWeight: 900,
        letterSpacing: "0.06em",
        borderRadius: "4px",
      }}
    >
      <img
        src={icon}
        alt=""
        style={{
          height: `${iconSize}px`,
          width: "auto",
          userSelect: "none",
        }}
        className="select-none"
        draggable={false}
      />

      <span>{label}</span>
    </div>
  );
}
