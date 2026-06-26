import { useState, useEffect, useCallback } from "react";
import {
  fetchExperiments,
  fetchExperimentDetail,
  fetchExperimentSettings,
  type ExperimentSummary,
  type ExperimentPipeline,
  type ExperimentDetail,
  type ExperimentSettingsResponse,
} from "../api/client";
import { useAuth } from "./useAuth";

// useExperiments polls the experiments list + pipeline every 30s while the tab is
// active. Mirrors useVPSData's loading/error/hasLoaded contract.
export function useExperiments(enabled: boolean) {
  const { isAuthenticated } = useAuth();
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [pipeline, setPipeline] = useState<ExperimentPipeline | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    let cancelled = false;
    let isFirst = true;

    const refresh = async () => {
      if (isFirst) setIsLoading(true);
      try {
        const data = await fetchExperiments();
        if (cancelled) return;
        setExperiments(data.experiments ?? []);
        setPipeline(data.pipeline ?? null);
        setError(null);
        setHasLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load experiments");
      } finally {
        if (!cancelled && isFirst) setIsLoading(false);
        isFirst = false;
      }
    };

    refresh();
    const interval = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, isAuthenticated]);

  return { experiments, pipeline, isLoading, hasLoaded, error };
}

// useExperimentDetail fetches one experiment's full stats on demand (when a row is
// expanded). Re-fetches whenever id changes; null id clears.
export function useExperimentDetail(id: number | null) {
  const [detail, setDetail] = useState<ExperimentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (id == null) {
        setDetail(null);
        setError(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const d = await fetchExperimentDetail(id);
        if (!cancelled) setDetail(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load detail");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [id]);

  return { detail, isLoading, error };
}

// useExperimentSettings loads the knob registry + read-only constants once, with a
// reload callback used after a successful write.
export function useExperimentSettings(enabled: boolean) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<ExperimentSettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchExperimentSettings();
      setSettings(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    reload();
  }, [enabled, isAuthenticated, reload]);

  return { settings, setSettings, isLoading, error, reload };
}
