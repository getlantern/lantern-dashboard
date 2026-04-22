import { useEffect, useState } from "react";
import { buildBandwidthQuery, fetchSigNozMetrics, type BandwidthFilters } from "../api/client";
import { useAuth } from "./useAuth";

export interface BandwidthSeries {
  key: string;            // "total" or track name
  points: Array<{ ts: number; value: number }>;  // value in bytes/sec
}

export interface BandwidthData {
  total: BandwidthSeries | null;
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

    const totalQ = buildBandwidthQuery({ filters, groupByTrack: false, startMs, endMs, stepSeconds });
    const trackQ = buildBandwidthQuery({ filters, groupByTrack: true,  startMs, endMs, stepSeconds });

    Promise.all([fetchSigNozMetrics(totalQ), fetchSigNozMetrics(trackQ)])
      .then(([totalResp, trackResp]) => {
        if (cancelled) return;
        setData({
          total: extractTotal(totalResp),
          byTrack: extractSeries(trackResp),
        });
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

function extractTotal(resp: unknown): BandwidthSeries | null {
  const series = extractSeries(resp);
  if (series.length === 0) return null;
  if (series.length === 1) return { key: "total", points: series[0].points };
  // Fallback: sum across any extra series we weren't expecting.
  const merged = new Map<number, number>();
  for (const s of series) {
    for (const p of s.points) merged.set(p.ts, (merged.get(p.ts) ?? 0) + p.value);
  }
  return { key: "total", points: Array.from(merged.entries()).sort((a, b) => a[0] - b[0]).map(([ts, value]) => ({ ts, value })) };
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
