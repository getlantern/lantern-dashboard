import { useEffect, useState } from "react";
import { buildConnectionDurationQuery, fetchSigNozMetrics, type MetricsFilters } from "../api/client";
import { useAuth } from "./useAuth";

export interface ConnectionDurationSeries {
  key: string;            // group-by value (track name by default)
  points: Array<{ ts: number; value: number }>;  // value = mean duration in metric-native units
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
  groupBy: string = "track",
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

// Extract the C-expression result series (formula A/B) and key each by the
// group-by label value. Series whose label is missing or empty are dropped.
function extractSeries(resp: unknown, groupKey: string): ConnectionDurationSeries[] {
  const out: ConnectionDurationSeries[] = [];
  const r = resp as { data?: { result?: Array<{ queryName?: string; series?: Array<{ labels?: Record<string, string>; values?: Array<{ timestamp?: number | string; value?: number | string }> }> }> } };
  const results = r?.data?.result ?? [];
  // Prefer the "C" expression (formula A/B). If absent, fall back to the first
  // result that has data (defensive against a SigNoz response shape change).
  const formula = results.find((q) => q.queryName === "C") ?? results[0];
  if (!formula) return out;
  for (const s of formula.series ?? []) {
    const label = s.labels?.[groupKey];
    if (!label) continue;
    const points = (s.values ?? [])
      .map((v) => ({ ts: Number(v.timestamp) || 0, value: Number(v.value) || 0 }))
      .filter((p) => p.ts > 0 && Number.isFinite(p.value))
      .sort((a, b) => a.ts - b.ts);
    if (points.length > 0) out.push({ key: label, points });
  }
  return out;
}
