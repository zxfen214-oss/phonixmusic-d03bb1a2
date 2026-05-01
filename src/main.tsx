import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import "@applemusic-like-lyrics/core/style.css";

registerSW({
  immediate: true,
});

createRoot(document.getElementById("root")!).render(<App />);
