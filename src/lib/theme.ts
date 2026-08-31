import { useEffect, useState } from "react";

export type AppTheme = "dark" | "light";

const STORAGE_KEY = "vibely-theme";

export function readTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: AppTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#F6F7F8" : "#0A0A0B");
}

export function setStoredTheme(theme: AppTheme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private WebViews may block storage; the active document still changes.
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent("vibely-theme-change", { detail: theme }));
}

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppTheme>("dark");

  useEffect(() => {
    const sync = () => setThemeState(readTheme());
    applyTheme(readTheme());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("vibely-theme-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("vibely-theme-change", sync);
    };
  }, []);

  return { theme, setTheme: setStoredTheme };
}