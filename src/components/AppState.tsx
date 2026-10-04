"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, repo, StorageError } from "@/lib/persistence";
import type { ReadingSettings } from "@/lib/types";

interface AppState {
  settings: ReadingSettings;
  ready: boolean;
  storageError: string | null;
  updateSettings: (patch: Partial<ReadingSettings>) => Promise<void>;
  reportStorageError: (e: unknown) => void;
}

const Ctx = createContext<AppState | null>(null);

export function applyTheme(theme: ReadingSettings["theme"]) {
  const root = document.documentElement;
  if (theme === "sistema") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("lemais-theme", theme);
  } catch {
    /* preferência visual apenas; ignora se indisponível */
  }
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ReadingSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const reportStorageError = useCallback((e: unknown) => {
    setStorageError(e instanceof StorageError ? e.message : "Falha ao acessar o armazenamento local.");
  }, []);

  useEffect(() => {
    const load = () =>
      repo()
        .getSettings()
        .then((s) => {
          setSettings(s);
          applyTheme(s.theme);
        })
        .catch(reportStorageError)
        .finally(() => setReady(true));
    void load();
    // preferências podem chegar de outro aparelho pela sincronização
    window.addEventListener("lemais:synced", load);
    return () => window.removeEventListener("lemais:synced", load);
  }, [reportStorageError]);

  const updateSettings = useCallback(
    async (patch: Partial<ReadingSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      if (patch.theme) applyTheme(patch.theme);
      try {
        await repo().putSettings(next);
      } catch (e) {
        reportStorageError(e);
      }
    },
    [settings, reportStorageError],
  );

  const value = useMemo(() => ({ settings, ready, storageError, updateSettings, reportStorageError }), [settings, ready, storageError, updateSettings, reportStorageError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error("AppStateProvider ausente");
  return c;
}

export function StorageBanner() {
  const { storageError } = useAppState();
  if (!storageError) return null;
  return (
    <div role="alert" className="border-b-2 border-danger bg-surface px-4 py-3 text-sm">
      <strong className="text-danger">Armazenamento indisponível.</strong> {storageError} Você ainda pode ler, mas o progresso
      não será salvo nem poderá ser recuperado.
    </div>
  );
}
