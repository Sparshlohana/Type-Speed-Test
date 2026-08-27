"use client";

import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { settingsStore } from "@/lib/store";
import { ACCENT_HEX, type Settings } from "@/lib/storage";

/** Mirror the resolved preferences onto <html> so CSS (and the charts) can read them. */
function applySettings(settings: Settings): void {
  const root = document.documentElement;
  if (settings.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", settings.theme);

  const accent = ACCENT_HEX[settings.accent];
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 16%, transparent)`);
}

export function useSettings() {
  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.get,
    settingsStore.getServer,
  );

  const update = useCallback((patch: Partial<Settings>) => {
    applySettings(settingsStore.update(patch));
  }, []);

  const reset = useCallback(() => {
    settingsStore.reset();
    applySettings(settingsStore.get());
  }, []);

  return { settings, update, reset };
}

/**
 * Keeps the document in sync with stored preferences. The inline bootstrap script in
 * the root layout has already painted the right theme; this covers the case where the
 * store changes (or the script was blocked).
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();

  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  return <>{children}</>;
}
