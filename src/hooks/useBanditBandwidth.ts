import { useEffect, useState } from "react";
import { buildBandwidthQuery, fetchSigNozMetrics, type BandwidthFilters } from "../api/client";
import { useAuth } from "./useAuth";

export interface BandwidthSeries {
  key: string;            // track name
  points: Array<{ ts: number; value: number }>;  // value in bytes/sec
}

export interface BandwidthData {
  byTrack: BandwidthSeries[];
}

interface UseBanditBandwidthResult {
  data: BandwidthData | null;
  isLoading: boolean;
  error: string | null;
}

export function useBanditBandwidth(enabled: boolean, filters: BandwidthFilters, windowDays: number): UseBanditBandwidthResult {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<BandwidthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = `${enabled}|${filters.country ?? ""}|${filters.tier ?? ""}|${filters.protocol ?? ""}|${windowDays}`;

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const endMs = Date.now();
    const startMs = endMs - windowDays * 86_400_000;
    const stepSeconds = windowDays > 2 ? 3600 : 300;
    const query = buildBandwidthQuery({ filters, groupByTrack: true, startMs, endMs, stepSeconds });

    fetchSigNozMetrics(query)
      .then((resp) => {
        if (cancelled) return;
        setData({ byTrack: extractSeries(resp) });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load bandwidth");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isAuthenticated]);

  return { data, isLoading, error };
}

function extractSeries(resp: unknown): BandwidthSeries[] {
  const out: BandwidthSeries[] = [];
  const r = resp as { data?: { result?: Array<{ series?: Array<{ labels?: Record<string, string>; values?: Array<{ timestamp?: number | string; value?: number | string }> }> }> } };
  const results = r?.data?.result ?? [];
  for (const qr of results) {
    for (const s of qr.series ?? []) {
      const label = s.labels?.["proxy.track"] || s.labels?.track || "total";
      const points = (s.values ?? [])
        .map((v) => ({ ts: Number(v.timestamp) || 0, value: Number(v.value) || 0 }))
        .filter((p) => p.ts > 0)
        .sort((a, b) => a.ts - b.ts);
      if (points.length > 0) out.push({ key: label, points });
    }
  }
  return out;
}
