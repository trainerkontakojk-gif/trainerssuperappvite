import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark";
type ThemePreference = ThemeMode | "system";

const THEME_EVENT = "themechange";
const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    return "system";
  }
  return "system";
}

function storePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    return;
  }
}

function systemTheme(): ThemeMode {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * The tab's theme preference: "system" follows the OS, "light"/"dark" is an
 * explicit override. It lives in memory so toggling still works when storage
 * is unavailable; storage only carries the override across tabs and reloads.
 * `public/theme-init.js` applies the stored value before React loads.
 */
let currentPreference: ThemePreference | null = null;

function getPreference(): ThemePreference {
  currentPreference ??= readStoredPreference();
  return currentPreference;
}

function resolveTheme(preference: ThemePreference): ThemeMode {
  return preference === "system" ? systemTheme() : preference;
}

function applyTheme(preference: ThemePreference) {
  const meta = window.document.querySelector('meta[name="color-scheme"]');
  meta?.setAttribute(
    "content",
    preference === "system" ? "light dark" : preference,
  );
  window.document.documentElement.classList.toggle(
    "dark",
    resolveTheme(preference) === "dark",
  );
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    currentPreference = readStoredPreference();
    applyTheme(currentPreference);
    onChange();
  };
  const onSystemChange = () => {
    applyTheme(getPreference());
    onChange();
  };
  const media = window.matchMedia(DARK_QUERY);

  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);

  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemChange);
  };
}

function getSnapshot(): ThemeMode {
  return resolveTheme(getPreference());
}

function getServerSnapshot(): ThemeMode {
  return "light";
}

function setTheme(nextTheme: ThemeMode) {
  const next: ThemePreference =
    nextTheme === systemTheme() ? "system" : nextTheme;
  currentPreference = next;
  storePreference(next);
  applyTheme(next);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useThemeMode() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { theme, setTheme };
}
