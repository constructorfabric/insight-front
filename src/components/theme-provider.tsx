import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

const THEMES: readonly Theme[] = ["dark", "light", "system"];

/**
 * Read the persisted theme, tolerating a hostile / stale `localStorage`.
 *
 * The value is user-controllable storage, so it cannot be trusted as a `Theme`:
 * a stale key, a manual edit, or a value with whitespace (e.g. `"light dark"`)
 * would otherwise flow into `classList.add(theme)` and throw
 * `InvalidCharacterError`, crashing the whole app at the React error boundary
 * (Refs #1294). Validate against the known set and fall back to the default.
 * `localStorage` access itself can throw (Safari private mode) — guard that too.
 */
function readStoredTheme(storageKey: string, fallback: Theme): Theme {
  try {
    const stored = localStorage.getItem(storageKey);
    return THEMES.includes(stored as Theme) ? (stored as Theme) : fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() =>
    readStoredTheme(storageKey, defaultTheme),
  );

  useEffect(() => {
    const root = window.document.documentElement;
    const apply = (next: "light" | "dark") => {
      root.classList.remove("light", "dark");
      root.classList.add(next);
    };

    if (theme !== "system") {
      apply(theme);
      return;
    }

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    apply(mql.matches ? "dark" : "light");
    const onChange = (e: MediaQueryListEvent) =>
      apply(e.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
