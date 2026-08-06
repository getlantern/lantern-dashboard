import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchExperiments,
  fetchExperimentDetail,
  fetchExperimentSettings,
  fetchPromotedComparison,
  fetchPromotionImpact,
  type ExperimentSummary,
  type ExperimentPipeline,
  type ExperimentDetail,
  type ExperimentSettingsResponse,
  type PromotedComparisonResponse,
  type PromotionImpactResponse,
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

  // Monotonic request id: the poll and an on-demand refresh both write the same
  // state, so without ordering a slow poll could land after a newer refresh and
  // flip the UI back to the pre-action status. Only the latest request applies.
  const reqSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    try {
      const data = await fetchExperiments();
      if (seq !== reqSeq.current) return; // superseded by a newer request
      setExperiments(data.experiments ?? []);
      setPipeline(data.pipeline ?? null);
      setError(null);
      setHasLoaded(true);
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load experiments");
    }
  }, []);

  // refresh re-fetches the list on demand (e.g. right after an abort/retire), so
  // the operator doesn't wait out the 30s poll to see the new terminal status.
  // Guarded on enabled/auth like the poll so it's a no-op for an inactive or
  // logged-out tab.
  const refresh = useCallback(async () => {
    if (!enabled || !isAuthenticated) return;
    await load();
  }, [enabled, isAuthenticated, load]);

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    let cancelled = false;
    let isFirst = true;

    const tick = async () => {
      if (isFirst) setIsLoading(true);
      await load();
      if (!cancelled && isFirst) setIsLoading(false);
      isFirst = false;
    };

    tick();
    const interval = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, isAuthenticated, load]);

  return { experiments, pipeline, isLoading, hasLoaded, error, refresh };
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

// usePromotedComparison loads the promoted-vs-original goodput scatter for a
// now-relative window (hours). Re-fetches when the tab activates or the window
// changes. The single request measures every promoted track server-side, so no
// polling — the operator re-picks a window to refresh.
export function usePromotedComparison(enabled: boolean, hours: number) {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<PromotedComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      // Drop the prior window's data up front so the scatter shows a loading
      // state rather than stale points under the newly-selected window's label.
      setData(null);
      try {
        const d = await fetchPromotedComparison(hours);
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load comparison");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [enabled, isAuthenticated, hours]);

  return { data, isLoading, error };
}

// usePromotionImpact loads the promotion impact ledger when the tab activates.
// Rows are terminal (one per promotion, written by the backend's hourly
// worker), so there's no poll — re-activating the tab refreshes.
export function usePromotionImpact(enabled: boolean) {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<PromotionImpactResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const d = await fetchPromotionImpact();
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load impact ledger");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [enabled, isAuthenticated]);

  return { data, isLoading, error };
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
