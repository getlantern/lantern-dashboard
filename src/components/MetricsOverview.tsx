import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBanditBandwidth } from "../hooks/useBanditBandwidth";
import { useConnectionDuration } from "../hooks/useConnectionDuration";
import { fetchTracks, type DashboardCountry, type DashboardTrackDetail, type MetricsFilters } from "../api/client";

type MetricKind = "bandwidth" | "connection_duration";

// Hard-coded for now — sing-box's client.platform values. Could be derived from
// /tracks or /globalStats later if more platforms appear.
const PLATFORMS = ["android", "ios", "windows", "darwin", "linux"] as const;

interface MetricsOverviewProps {
  enabled: boolean;
  countries: DashboardCountry[];
}

// stepSeconds is chosen per window to keep point count in the 60–720 range.
const WINDOW_OPTIONS: Array<{ label: string; minutes: number; stepSeconds: number }> = [
  { label: "1h",  minutes: 60,    stepSeconds: 60 },
  { label: "3h",  minutes: 180,   stepSeconds: 60 },
  { label: "6h",  minutes: 360,   stepSeconds: 60 },
  { label: "12h", minutes: 720,   stepSeconds: 300 },
  { label: "1d",  minutes: 1440,  stepSeconds: 300 },
  { label: "3d",  minutes: 4320,  stepSeconds: 3600 },
  { label: "7d",  minutes: 10080, stepSeconds: 3600 },
];

const COLORS = [
  "#00e5c8", "#80b0e0", "#f0a030", "#a0c8a0", "#e06060",
  "#c090e0", "#e0e080", "#60c0d0", "#d07090", "#80d090",
];

const card: CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: "var(--radius-md)",
  border: "1px solid #ffffff08",
  padding: "1rem 1.1rem",
  minWidth: 0,
  flex: "1 1 0",
};

const cardLabel: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.6rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#8890a0",
  marginBottom: "0.3rem",
};

const cardValue: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "1.6rem",
  fontWeight: 600,
  lineHeight: 1.15,
};

const filterSelect: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.7rem",
  background: "#ffffff08",
  color: "#c0c8d4",
  border: "1px solid #ffffff10",
  borderRadius: "var(--radius-sm)",
  padding: "0.35rem 0.55rem",
  outline: "none",
  cursor: "pointer",
  minWidth: 0,
};

const filterLabel: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.55rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#667080",
  marginBottom: "0.25rem",
  display: "block",
};

const chartCard: CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: "var(--radius-md)",
  border: "1px solid #ffffff08",
  padding: "1rem 1.1rem",
};

export default function MetricsOverview({ enabled, countries }: MetricsOverviewProps) {
  const [metric, setMetric] = useState<MetricKind>("bandwidth");
  const [country, setCountry] = useState("");
  const [tier, setTier] = useState<"" | "pro" | "free">("");
  const [protocol, setProtocol] = useState("");
  const [version, setVersion] = useState("");
  const [platform, setPlatform] = useState("");
  const [windowMinutes, setWindowMinutes] = useState(10080); // 7d default
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const activeWindow = WINDOW_OPTIONS.find((w) => w.minutes === windowMinutes) ?? WINDOW_OPTIONS[WINDOW_OPTIONS.length - 1];
  const [tracks, setTracks] = useState<DashboardTrackDetail[]>([]);
  const [tracksReady, setTracksReady] = useState(false);
  const [tracksError, setTracksError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchTracks()
      .then((resp) => {
        if (cancelled) return;
        setTracks(resp.tracks ?? []);
        setTracksReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setTracksReady(true);
        setTracksError(true);
      });
    return () => { cancelled = true; };
  }, [enabled]);

  const filters: MetricsFilters = useMemo(() => ({
    country: country || undefined,
    tier: tier || undefined,
    protocol: protocol || undefined,
    version: version || undefined,
    platform: platform || undefined,
  }), [country, tier, protocol, version, platform]);

  // Both metrics share filters + window. Each hook returns its own series in a
  // common {key, points: [{ts, value}]} shape, which the chart then renders
  // identically — only the formatter and axis label differ.
  const isBandwidth = metric === "bandwidth";
  const bandwidth = useBanditBandwidth(enabled && isBandwidth, filters, activeWindow.minutes, activeWindow.stepSeconds);
  const duration  = useConnectionDuration(enabled && !isBandwidth, filters, activeWindow.minutes, activeWindow.stepSeconds);
  // Memoize the unified {byTrack} shape so a fresh ternary doesn't churn the
  // dependency arrays of the downstream useMemos every render.
  const data = useMemo(() => {
    if (isBandwidth) return bandwidth.data ? { byTrack: bandwidth.data.byTrack } : null;
    return duration.data ? { byTrack: duration.data.byGroup } : null;
  }, [isBandwidth, bandwidth.data, duration.data]);
  const isLoading = isBandwidth ? bandwidth.isLoading : duration.isLoading;
  const error     = isBandwidth ? bandwidth.error     : duration.error;

  const protocols = useMemo(() => {
    const set = new Set<string>();
    for (const t of tracks) if (t.protocol) set.add(t.protocol);
    return Array.from(set).sort();
  }, [tracks]);

  // Restrict every view to bandit-managed tracks (names the lantern-cloud /tracks
  // endpoint returns). Fall back to unfiltered if /tracks failed outright so a
  // transient tracks-API outage doesn't blank the whole view.
  const banditSeries = useMemo(() => {
    const all = data?.byTrack ?? [];
    if (tracksError) return all;
    if (!tracksReady) return all;
    const names = new Set(tracks.map((t) => t.name));
    return all.filter((s) => names.has(s.key));
  }, [data, tracks, tracksReady, tracksError]);

  // If the user's selected track is no longer present in the current filter
  // window, fall back to "all" for rendering (don't mutate the state — the
  // selection re-applies if the track reappears after a filter change).
  const effectiveSelectedTrack = useMemo(() => {
    if (!selectedTrack) return null;
    return banditSeries.some((s) => s.key === selectedTrack) ? selectedTrack : null;
  }, [banditSeries, selectedTrack]);

  // Stable color + gradient id per track. Keyed off the /tracks list when
  // available so a given track keeps its color across window/filter changes;
  // falls back to banditSeries when /tracks is unavailable.
  const { trackColor, trackGradientId } = useMemo(() => {
    const keys = tracksReady && !tracksError && tracks.length > 0
      ? tracks.map((t) => t.name).sort()
      : banditSeries.map((s) => s.key).sort();
    const colorMap: Record<string, string> = {};
    const gradientIdMap: Record<string, string> = {};
    keys.forEach((k, i) => {
      colorMap[k] = COLORS[i % COLORS.length];
      gradientIdMap[k] = `bw-${i}`;
    });
    return { trackColor: colorMap, trackGradientId: gradientIdMap };
  }, [tracks, tracksReady, tracksError, banditSeries]);

  // All tracks present in the current data, in stable order. Rendered as Areas;
  // non-selected ones get hide=true so the legend still lists them for switching.
  const { chartData, trackKeys } = useMemo(() => {
    const keys = banditSeries.map((s) => s.key).sort();
    const byTs = new Map<number, Record<string, number>>();
    for (const s of banditSeries) {
      for (const p of s.points) {
        if (!byTs.has(p.ts)) byTs.set(p.ts, { ts: p.ts });
        byTs.get(p.ts)![s.key] = p.value;
      }
    }
    const rows = Array.from(byTs.values())
      .map((r) => ({ ...r, ts: Number(r.ts) }))
      .sort((a, b) => a.ts - b.ts);
    return { chartData: rows, trackKeys: keys };
  }, [banditSeries]);

  // Aggregate scopes to the selected track when one is picked, so the summary
  // cards agree with what the chart shows. For bandwidth: rates summed across
  // tracks at each timestamp, then integrated over the window for total egress.
  // For connection duration: per-track means averaged across timestamps and
  // tracks (a sum across tracks of mean-durations is meaningless), with the
  // peak capturing the worst single (track, ts) sample.
  const aggregate = useMemo(() => {
    const series = effectiveSelectedTrack
      ? banditSeries.filter((s) => s.key === effectiveSelectedTrack)
      : banditSeries;

    if (isBandwidth) {
      const summed = new Map<number, number>();
      for (const s of series) {
        for (const p of s.points) summed.set(p.ts, (summed.get(p.ts) ?? 0) + p.value);
      }
      const points = Array.from(summed.entries()).sort((a, b) => a[0] - b[0]).map(([ts, value]) => ({ ts, value }));
      const { totalBytes, maxBytesPerSec } = integrateRate(points);
      const windowSec = windowMinutes * 60;
      const avgBytesPerSec = windowSec > 0 ? totalBytes / windowSec : 0;
      return { totalBytes, avgBytesPerSec, maxBytesPerSec, meanDuration: 0, peakDuration: 0 };
    }

    let total = 0;
    let n = 0;
    let peak = 0;
    for (const s of series) {
      for (const p of s.points) {
        total += p.value;
        n++;
        if (p.value > peak) peak = p.value;
      }
    }
    return {
      totalBytes: 0,
      avgBytesPerSec: 0,
      maxBytesPerSec: 0,
      meanDuration: n > 0 ? total / n : 0,
      peakDuration: peak,
    };
  }, [banditSeries, effectiveSelectedTrack, windowMinutes, isBandwidth]);

  const hasSelectedFilters = !!(country || tier || protocol || version || platform);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", padding: "0.75rem" }}>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 160 }}>
          <span style={filterLabel}>Metric</span>
          <select style={filterSelect} value={metric} onChange={(e) => setMetric(e.target.value as MetricKind)}>
            <option value="bandwidth">Bandwidth</option>
            <option value="connection_duration">Connection duration</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 140 }}>
          <span style={filterLabel}>Country</span>
          <select style={filterSelect} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All</option>
            {countries.map((c) => (
              <option key={c.country} value={c.country}>{c.country}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 120 }}>
          <span style={filterLabel}>Tier</span>
          <select style={filterSelect} value={tier} onChange={(e) => setTier(e.target.value as "" | "pro" | "free")}>
            <option value="">All</option>
            <option value="pro">Pro</option>
            <option value="free">Free</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 140 }}>
          <span style={filterLabel}>Protocol</span>
          <select style={filterSelect} value={protocol} onChange={(e) => setProtocol(e.target.value)}>
            <option value="">All</option>
            {protocols.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 120 }}>
          <span style={filterLabel}>Platform</span>
          <select style={filterSelect} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 120 }}>
          <span style={filterLabel}>Version</span>
          <input
            style={{ ...filterSelect, cursor: "text" }}
            type="text"
            placeholder="e.g. 9.0.25"
            value={version}
            onChange={(e) => setVersion(e.target.value.trim())}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 120 }}>
          <span style={filterLabel}>Window</span>
          <select style={filterSelect} value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))}>
            {WINDOW_OPTIONS.map((w) => (
              <option key={w.minutes} value={w.minutes}>{w.label}</option>
            ))}
          </select>
        </div>
        {hasSelectedFilters && (
          <button
            type="button"
            onClick={() => { setCountry(""); setTier(""); setProtocol(""); setVersion(""); setPlatform(""); }}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              background: "transparent",
              color: "#8890a0",
              border: "1px solid #ffffff10",
              borderRadius: "var(--radius-sm)",
              padding: "0.35rem 0.7rem",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)", background: "#e0606012", border: "1px solid #e0606030", color: "#e06060", fontFamily: "var(--font-mono)", fontSize: "0.65rem" }}>
          {error}
        </div>
      )}
      {tracksError && (
        <div style={{ padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)", background: "#f0a03012", border: "1px solid #f0a03030", color: "#f0a030", fontFamily: "var(--font-mono)", fontSize: "0.65rem" }}>
          Track list unavailable — showing all tracks (including non-bandit).
        </div>
      )}

      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
        {isBandwidth ? (
          <>
            <div style={card}>
              <div style={cardLabel}>Avg bandwidth</div>
              <div style={{ ...cardValue, color: "#00e5c8" }}>{formatBytesPerSec(aggregate.avgBytesPerSec)}</div>
            </div>
            <div style={card}>
              <div style={cardLabel}>Peak bandwidth</div>
              <div style={{ ...cardValue, color: "#80b0e0" }}>{formatBytesPerSec(aggregate.maxBytesPerSec)}</div>
            </div>
            <div style={card}>
              <div style={cardLabel}>Total egress</div>
              <div style={{ ...cardValue, color: "#c0c8d4" }}>{formatBytes(aggregate.totalBytes)}</div>
            </div>
          </>
        ) : (
          <>
            <div style={card}>
              <div style={cardLabel}>Mean duration</div>
              <div style={{ ...cardValue, color: "#00e5c8" }}>{formatDuration(aggregate.meanDuration)}</div>
            </div>
            <div style={card}>
              <div style={cardLabel}>Peak duration</div>
              <div style={{ ...cardValue, color: "#80b0e0" }}>{formatDuration(aggregate.peakDuration)}</div>
            </div>
          </>
        )}
        <div style={card}>
          <div style={cardLabel}>Tracks seen</div>
          <div style={{ ...cardValue, color: "#a0c8a0" }}>{effectiveSelectedTrack ? 1 : trackKeys.length}</div>
        </div>
      </div>

      <div style={chartCard}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 600, color: "#d0d8e4" }}>
              {effectiveSelectedTrack
                ? (isBandwidth ? "Bandwidth" : "Connection duration")
                : (isBandwidth ? "Bandwidth by track" : "Connection duration by track")}
            </div>
            {effectiveSelectedTrack && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "#00e5c8" }}>
                — {effectiveSelectedTrack}
              </span>
            )}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#667080" }}>
            {activeWindow.label} · {effectiveSelectedTrack ? "single track" : (isBandwidth ? "stacked" : "overlay")} · {isBandwidth ? "bytes/sec" : "duration"}
          </div>
        </div>
        <div style={{ height: 320 }}>
          {isLoading && !data ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#667080", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
              Loading…
            </div>
          ) : chartData.length === 0 ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#667080", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
              No {isBandwidth ? "bandwidth" : "connection-duration"} samples for this filter combination
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <defs>
                  {trackKeys.map((k) => (
                    <linearGradient key={k} id={trackGradientId[k]} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={trackColor[k]} stopOpacity={0.55} />
                      <stop offset="95%" stopColor={trackColor[k]} stopOpacity={0.05} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="#ffffff08" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(ts: number) => formatAxisTick(ts, activeWindow.minutes)}
                  tick={{ fontSize: 10, fill: "#667080" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#667080" }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tickFormatter={(v: number) => isBandwidth ? formatBytesPerSec(v) : formatDuration(v)}
                />
                <Tooltip
                  contentStyle={{ background: "#1a2030", border: "1px solid #ffffff10", borderRadius: 6, fontSize: "0.65rem", fontFamily: "var(--font-mono)" }}
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  formatter={(v, name) => [isBandwidth ? formatBytesPerSec(Number(v)) : formatDuration(Number(v)), name as string]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "0.6rem", fontFamily: "var(--font-mono)" }}
                  content={({ payload }) => (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", padding: "0.25rem 0" }}>
                      {(payload ?? []).map((entry, index) => {
                        const raw = (entry as { dataKey?: string; value?: string });
                        const key = raw.dataKey ?? raw.value;
                        if (typeof key !== "string") return null;
                        const isSelected = effectiveSelectedTrack === key;
                        return (
                          <button
                            key={`${key}-${index}`}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setSelectedTrack((prev) => (prev === key ? null : key))}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "2px 8px",
                              borderRadius: 999,
                              border: `1px solid ${isSelected ? "#00e5c8" : "#ffffff22"}`,
                              background: isSelected ? "#00e5c81a" : "transparent",
                              color: isSelected ? "#00e5c8" : "#c7d0dd",
                              cursor: "pointer",
                              font: "inherit",
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: (entry as { color?: string }).color ?? trackColor[key],
                                display: "inline-block",
                              }}
                            />
                            <span>{key}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
                {trackKeys.map((k) => (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={k}
                    // Stack only for bandwidth — summing mean-durations across
                    // tracks would be meaningless. Connection-duration renders
                    // as overlapping series instead.
                    stackId={isBandwidth ? "1" : undefined}
                    stroke={trackColor[k]}
                    strokeWidth={1}
                    fill={`url(#${trackGradientId[k]})`}
                    fillOpacity={isBandwidth ? 1 : 0.2}
                    dot={false}
                    isAnimationActive={false}
                    hide={effectiveSelectedTrack !== null && effectiveSelectedTrack !== k}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  );
}

// formatAxisTick picks an X-axis label granularity based on the active window.
// Sub-day windows show HH:MM; multi-day windows show month + day.
function formatAxisTick(ts: number, windowMinutes: number): string {
  const d = new Date(ts);
  if (windowMinutes < 24 * 60) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatBytesPerSec(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  let v = bytesPerSec;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${units[i]}`;
}

// integrateRate converts rate samples (bytes/sec, timestamp in ms) into total bytes
// over the observed window. Uses the step size inferred from sample gaps to credit
// the final sample with a full bucket's worth of time (otherwise the last bucket is
// dropped and egress/avg are systematically low).
function integrateRate(points: Array<{ ts: number; value: number }>): { totalBytes: number; maxBytesPerSec: number } {
  if (points.length === 0) return { totalBytes: 0, maxBytesPerSec: 0 };
  // Median gap as the assumed step; falls back to the first gap if <3 points.
  let step = 0;
  if (points.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < points.length; i++) gaps.push((points[i].ts - points[i - 1].ts) / 1000);
    gaps.sort((a, b) => a - b);
    step = gaps[Math.floor(gaps.length / 2)] || 0;
  }
  let totalBytes = 0;
  let maxBytesPerSec = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const next = points[i + 1];
    const dt = next ? (next.ts - p.ts) / 1000 : step;
    if (dt > 0) totalBytes += p.value * dt;
    if (p.value > maxBytesPerSec) maxBytesPerSec = p.value;
  }
  return { totalBytes, maxBytesPerSec };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
  return `${bytes.toFixed(0)} B`;
}

// formatDuration renders sing.connection_duration values, which sing-box
// emits in the metric's native unit (nanoseconds, per OTel semconv 1.34+).
// Auto-scales to ns / µs / ms / s. We deliberately avoid hard-coding a unit
// in the assumption that an upstream sing-box version could change it; the
// magnitude-based scale stays correct either way.
function formatDuration(ns: number): string {
  if (!Number.isFinite(ns) || ns <= 0) return "0 ns";
  if (ns >= 1e9) return `${(ns / 1e9).toFixed(ns >= 1e10 ? 1 : 2)} s`;
  if (ns >= 1e6) return `${(ns / 1e6).toFixed(ns >= 1e7 ? 1 : 2)} ms`;
  if (ns >= 1e3) return `${(ns / 1e3).toFixed(ns >= 1e4 ? 1 : 2)} µs`;
  return `${ns.toFixed(0)} ns`;
}
