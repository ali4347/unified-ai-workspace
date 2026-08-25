"use client";

import * as React from "react";

/**
 * Theme preference (PRD §40): light / dark / system, persisted in
 * localStorage under the same key the no-flash script in the root layout
 * reads before first paint.
 */
export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "uaw-theme";

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function useTheme(): {
  /** `null` until mounted — avoids a server/client hydration mismatch. */
  preference: ThemePreference | null;
  setPreference: (preference: ThemePreference) => void;
} {
  const [preference, setPreference] = React.useState<ThemePreference | null>(
    null
  );

  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage unavailable — fall back to system.
    }
    setPreference(isThemePreference(stored) ? stored : "system");
  }, []);

  React.useEffect(() => {
    if (preference === null) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        preference === "dark" || (preference === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };

    apply();
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Preference simply won't persist.
    }

    if (preference === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [preference]);

  return { preference, setPreference };
}
