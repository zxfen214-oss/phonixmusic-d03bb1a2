import { motion } from "framer-motion";

/**
 * Animated "Sing" banner shown below the playback bar while karaoke mode is on.
 * A black↔white gradient wave continuously sweeps inside the text.
 */
export function SingBanner({ className = "" }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className={`flex items-center justify-center select-none ${className}`}
    >
      <span
        className="sing-wave-text"
        style={{
          fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        Sing
      </span>
    </motion.div>
  );
}
