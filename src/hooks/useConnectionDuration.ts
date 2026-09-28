import { useEffect, useState } from "react";
import { buildConnectionDurationQuery, fetchSigNozMetrics, type MetricsFilters } from "../api/client";
import { useAuth } from "./useAuth";

export interface ConnectionDurationSeries {
  key: string;            // group-by value (track name by default)
  points: Array<{ ts: number; value: number }>;  // value = mean duration in metric-native units
  windowMean?: number;     // total duration / completed connections over the full window
  windowSum?: number;
  windowCount?: number;
}

export interface ConnectionDurationData {
  byGroup: ConnectionDurationSeries[];
  groupKey: string;       // which label was grouped by, for legend rendering
}

interface Result {
  data: ConnectionDurationData | null;
  isLoading: boolean;
  error: string | null;
}

export function useConnectionDuration(
  enabled: boolean,
  filters: MetricsFilters,
  windowMinutes: number,
  stepSeconds: number,
  groupBy: string = "proxy.track",
): Result {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<ConnectionDurationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = `${enabled}|${filters.country ?? ""}|${filters.tier ?? ""}|${filters.protocol ?? ""}|${filters.version ?? ""}|${filters.platform ?? ""}|${groupBy}|${windowMinutes}|${stepSeconds}`;

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const endMs = Date.now();
    const startMs = endMs - windowMinutes * 60_000;
    const query = buildConnectionDurationQuery({ filters, groupBy, startMs, endMs, stepSeconds });

    fetchSigNozMetrics(query)
      .then((resp) => {
        if (cancelled) return;
        setData({ byGroup: extractSeries(resp, groupBy), groupKey: groupBy });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load connection duration");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isAuthenticated]);

  return { data, isLoading, error };
}

// Extract the C-expression time series and the full-window sum/count ratio.
function extractSeries(resp: unknown, groupKey: string): ConnectionDurationSeries[] {
  const out: ConnectionDurationSeries[] = [];
  const r = resp as { data?: { result?: Array<{ queryName?: string; series?: Array<{ labels?: Record<string, string>; values?: Array<{ timestamp?: number | string; value?: number | string }> }> }> } };
  const results = r?.data?.result ?? [];
  const totals = (queryName: string): Map<string, number> => {
    const values = new Map<string, number>();
    for (const series of results.find((q) => q.queryName === queryName)?.series ?? []) {
      const key = series.labels?.[groupKey];
      if (!key) continue;
      const total = (series.values ?? []).reduce((sum, point) => {
        const value = Number(point.value);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);
      values.set(key, total);
    }
    return values;
  };
  const sums = totals("A");
  const counts = totals("B");
  const formula = results.find((q) => q.queryName === "C");
  if (!formula) return out;
  for (const s of formula.series ?? []) {
    const label = s.labels?.[groupKey];
    if (!label) continue;
    // Coerce ts/value first, then drop non-finite — `Number(NaN) || 0` would
    // silently turn a NaN value (which the A/B formula produces when count=0
    // in a step) into a real 0ms data point. Parse, validate, then keep.
    const points = (s.values ?? [])
      .map((v) => {
        const ts = Number(v.timestamp);
        const value = Number(v.value);
        if (!Number.isFinite(ts) || !Number.isFinite(value)) return null;
        return { ts, value };
      })
      .filter((p): p is { ts: number; value: number } => p !== null && p.ts > 0)
      .sort((a, b) => a.ts - b.ts);
    if (points.length > 0) {
      const count = counts.get(label);
      const sum = sums.get(label);
      out.push({
        key: label,
        points,
        windowMean: count && sum != null ? sum / count : undefined,
        windowSum: sum,
        windowCount: count,
      });
    }
  }
  return out;
}
