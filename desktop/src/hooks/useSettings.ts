import { useState, useEffect, useCallback } from "react";
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  onSyncFolderChanged,
  saveAppSettings,
} from "../services/db";

export function useSettings() {
  const [settings, setSettingsState] =
    useState<AppSettings>(DEFAULT_APP_SETTINGS);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const next = await loadAppSettings();
      if (!cancelled) setSettingsState(next);
    };

    load();
    const unsubscribe = onSyncFolderChanged(() => {
      load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const update = useCallback((partial: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...partial };
      if (next.fontSize < 12) next.fontSize = 12;
      if (next.fontSize > 20) next.fontSize = 20;
      void saveAppSettings(next);
      return next;
    });
  }, []);

  const addContextCategory = useCallback(
    (name: string): boolean => {
      if (settings.contextCategories.length >= 5) return false;
      if (settings.contextCategories.includes(name)) return false;
      update({ contextCategories: [...settings.contextCategories, name] });
      return true;
    },
    [settings.contextCategories, update],
  );

  const removeContextCategory = useCallback(
    (name: string) => {
      update({
        contextCategories: settings.contextCategories.filter((c) => c !== name),
      });
    },
    [settings.contextCategories, update],
  );

  return { ...settings, update, addContextCategory, removeContextCategory };
}
