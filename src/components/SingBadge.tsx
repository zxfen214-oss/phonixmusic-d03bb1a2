// Animated "Sing" badge shown below the playback bar while karaoke mode is on.
import { motion } from "framer-motion";

export default function SingBadge() {
  return (
    <div className="flex justify-center pointer-events-none select-none">
      <motion.span
        initial={{ opacity: 0, y: 6, backgroundPosition: "0% 50%" }}
        animate={{ opacity: 1, y: 0, backgroundPosition: ["0% 50%", "100% 50%"] }}
        exit={{ opacity: 0, y: 6 }}
        transition={{
          opacity: { duration: 0.35, ease: [0.32, 0.72, 0, 1] },
          y: { duration: 0.35, ease: [0.32, 0.72, 0, 1] },
          backgroundPosition: { duration: 2.4, repeat: Infinity, ease: "linear" },
        }}
        style={{
          fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 700,
          fontSize: "13px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.35) 0%, #ffffff 25%, rgba(0,0,0,0.85) 50%, #ffffff 75%, rgba(255,255,255,0.35) 100%)",
          backgroundSize: "300% 100%",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        }}
      >
        Sing
      </motion.span>
    </div>
  );
}
