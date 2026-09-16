import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchOverlayArtifact,
  fetchOverlayAudit,
  fetchOverlayDeployments,
  fetchOverlayEvaluations,
  fetchOverlayOverview,
  fetchOverlayRollouts,
  fetchOverlaySettings,
  type OverlayArtifact,
  type OverlayAuditEvent,
  type OverlayDeploymentsResponse,
  type OverlayEvalPoolBox,
  type OverlayEvaluation,
  type OverlayOverview,
  type OverlayRollout,
  type OverlaySettingsResponse,
} from "../api/overlays";
import { useAuth } from "./useAuth";

// Overlay state moves on the controller's own cadence (a rollout step every few
// minutes), so a 30s poll matches the other operator tabs without chasing the
// worker.
const POLL_MS = 30000;

interface Poll<T> {
  data: T | null;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// usePolled is the shared load/poll/refresh contract every overlay panel uses.
// The monotonic request id is what keeps an action's refresh from being undone
// by a slower in-flight poll landing after it — without it a just-paused
// rollout flickers back to "widening".
function usePolled<T>(enabled: boolean, load: () => Promise<T>, pollMs = POLL_MS): Poll<T> {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const run = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const next = await load();
      if (seq !== seqRef.current) return;
      setData(next);
      setError(null);
      setHasLoaded(true);
    } catch (err) {
      if (seq === seqRef.current) setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [load]);

  const refresh = useCallback(async () => {
    if (!enabled || !isAuthenticated) return;
    await run();
  }, [enabled, isAuthenticated, run]);

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    let cancelled = false;
    let first = true;
    const tick = async () => {
      if (first) setIsLoading(true);
      await run();
      if (!cancelled && first) setIsLoading(false);
      first = false;
    };
    tick();
    if (pollMs <= 0) return () => { cancelled = true; };
    const interval = setInterval(tick, pollMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, isAuthenticated, run, pollMs]);

  return { data, isLoading, hasLoaded, error, refresh };
}

export function useOverlayOverview(enabled: boolean): Poll<OverlayOverview> {
  return usePolled(enabled, fetchOverlayOverview);
}

export function useOverlayDeployments(enabled: boolean, country: string): Poll<OverlayDeploymentsResponse> {
  const load = useCallback(() => fetchOverlayDeployments({ country: country || undefined, limit: 500 }), [country]);
  return usePolled(enabled, load);
}

export function useOverlayRollouts(enabled: boolean, country: string, activeOnly: boolean): Poll<{ rollouts: OverlayRollout[]; truncated: boolean }> {
  const load = useCallback(
    () => fetchOverlayRollouts({ country: country || undefined, activeOnly, limit: 200 }),
    [country, activeOnly],
  );
  return usePolled(enabled, load);
}

export function useOverlayEvaluations(
  enabled: boolean,
  country: string,
  status: string,
): Poll<{ evaluations: OverlayEvaluation[]; pool: OverlayEvalPoolBox[]; truncated: boolean }> {
  const load = useCallback(
    () => fetchOverlayEvaluations({ country: country || undefined, status: status || undefined, limit: 200 }),
    [country, status],
  );
  return usePolled(enabled, load);
}

// The audit ledger is append-only and read backwards from a cursor, so polling
// it would fight the operator's paging. It reloads when the panel opens or the
// filter changes.
export function useOverlayAudit(
  enabled: boolean,
  filter: { entityType?: string; entityId?: string; before?: number },
): Poll<{ events: OverlayAuditEvent[]; nextBeforeSequence: number }> {
  const { entityType, entityId, before } = filter;
  const load = useCallback(
    () => fetchOverlayAudit({ entityType, entityId, before, limit: 100 }),
    [entityType, entityId, before],
  );
  return usePolled(enabled, load, 0);
}

// Settings are operator-authored; polling them would overwrite a half-edited
// document under the cursor. They load on open and reload after a save.
export function useOverlaySettings(enabled: boolean): Poll<OverlaySettingsResponse> {
  return usePolled(enabled, fetchOverlaySettings, 0);
}

// useOverlayArtifact loads one revision with its payload, once. Artifacts are
// immutable, so there is nothing to poll: the payload a revision id names
// today is the payload it names forever, and only the lifecycle (which the
// polled lists already carry) moves. The result is keyed by the id it was
// loaded for, so switching ids reads as loading rather than briefly showing
// the previous artifact.
export function useOverlayArtifact(id: string | undefined, technique?: string): { artifact: OverlayArtifact | null; error: string | null } {
  const [loaded, setLoaded] = useState<{ id: string; artifact: OverlayArtifact | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchOverlayArtifact(id, technique)
      .then((artifact) => { if (!cancelled) setLoaded({ id, artifact, error: null }); })
      .catch((err) => {
        if (!cancelled) setLoaded({ id, artifact: null, error: err instanceof Error ? err.message : "failed to load artifact" });
      });
    return () => { cancelled = true; };
  }, [id, technique]);

  if (!id || !loaded || loaded.id !== id) return { artifact: null, error: null };
  return { artifact: loaded.artifact, error: loaded.error };
}
