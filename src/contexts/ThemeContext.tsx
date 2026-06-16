import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Theme = "light" | "dark" | "ocean" | "sunset" | "forest" | "midnight" | "rose";

export const ALL_THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: "light", label: "Light", swatch: "#ffffff" },
  { id: "dark", label: "Dark", swatch: "#0a0a0a" },
  { id: "ocean", label: "Ocean", swatch: "#0b2942" },
  { id: "sunset", label: "Sunset", swatch: "#2a0f1d" },
  { id: "forest", label: "Forest", swatch: "#0e2018" },
  { id: "midnight", label: "Midnight", swatch: "#0b0b1f" },
  { id: "rose", label: "Rose", swatch: "#2a1418" },
];

const ALL_CLASSES = ALL_THEMES.map((t) => t.id);

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("phonix-theme") as Theme;
      if (stored && ALL_CLASSES.includes(stored)) return stored;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "dark";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    ALL_CLASSES.forEach((c) => root.classList.remove(c));
    root.classList.add(theme);
    localStorage.setItem("phonix-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setTheme = (newTheme: Theme) => setThemeState(newTheme);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
