import { useState, useEffect, useMemo, useCallback, useRef, memo, type CSSProperties } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { fetchTracks, fetchSigNozMetrics, type DashboardTrackDetail, type TrackMetrics } from "../api/client";

const TIER_COLORS: Record<string, string> = {
  FREE: "#a0c8a0",
  PRO: "#64b4ff",
  NEW: "#f0a030",
  Free: "#a0c8a0",
  Pro: "#64b4ff",
  New: "#f0a030",
};

const STATUS_COLORS: Record<string, string> = {
  running: "#a0c8a0",
  configuring: "#80b0e0",
  provisioning: "#f0a030",
  pending: "#667080",
  destroyed: "#e06060",
};

function formatBps(bps: number): string {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${Math.round(bps)} bps`;
}

function formatCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

// Per-track throughput chart — fetches 7d time-series from SigNoz on mount.
function TrackThroughputChart({ trackName }: { trackName: string }) {
  const [data, setData] = useState<{ ts: number; bps: number }[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const endMs = Date.now();
    const startMs = endMs - 7 * 86400000;

    // SigNoz v4 query_range format matching the existing "Throughput by Track" panel
    const query = {
      start: startMs,
      end: endMs,
      compositeQuery: {
        queryType: "builder",
        panelType: "graph",
        builderQueries: {
          A: {
            dataSource: "metrics",
            queryName: "A",
            aggregateAttribute: { key: "proxy.io", dataType: "float64", type: "Sum", isColumn: true, isJSON: false },
            timeAggregation: "rate",
            spaceAggregation: "sum",
            filters: {
              items: [
                { key: { key: "network.io.direction", dataType: "string", type: "tag", isColumn: false, isJSON: false }, op: "=", value: "transmit" },
                { key: { key: "proxy.track", dataType: "string", type: "tag", isColumn: false, isJSON: false }, op: "=", value: trackName },
              ],
              op: "AND",
            },
            expression: "A",
            disabled: false,
            groupBy: [],
            legend: trackName,
            having: [],
            limit: null,
            orderBy: [],
            reduceTo: "avg",
            stepInterval: 300,
          },
        },
      },
    };

    fetchSigNozMetrics(query)
      .then((resp) => {
        // Parse SigNoz time-series response
        const points: { ts: number; bps: number }[] = [];
        // SigNoz v4: data.result[0].series[].values[]
        const queryResult = resp?.data?.result || [];
        for (const qr of queryResult) {
          for (const s of qr.series || []) {
            for (const v of s.values || []) {
              const ts = Number(v.timestamp) || 0;
              const val = parseFloat(v.value) || 0;
              points.push({ ts, bps: val * 8 });
            }
          }
        }
        points.sort((a, b) => a.ts - b.ts);
        setData(points);
      })
      .catch(() => setError(true));
  }, [trackName]);

  if (error) {
    return <div style={{ fontSize: "0.55rem", color: "#667080", padding: "0.5rem" }}>Failed to load chart</div>;
  }
  if (!data) {
    return <div style={{ fontSize: "0.55rem", color: "#667080", padding: "0.5rem" }}>Loading chart...</div>;
  }
  if (data.length === 0) {
    return <div style={{ fontSize: "0.55rem", color: "#667080", padding: "0.5rem" }}>No throughput data for this track</div>;
  }

  const maxBps = Math.max(...data.map((d) => d.bps));
  const unit = maxBps >= 1e9 ? "Gbps" : maxBps >= 1e6 ? "Mbps" : maxBps >= 1e3 ? "Kbps" : "bps";
  const divisor = maxBps >= 1e9 ? 1e9 : maxBps >= 1e6 ? 1e6 : maxBps >= 1e3 ? 1e3 : 1;
  const chartData = data.map((d) => ({ ts: d.ts, value: d.bps / divisor }));

  return (
    <div style={{ width: "100%", height: 140 }}>
      <div style={{ fontSize: "0.5rem", color: "#667080", marginBottom: "0.2rem", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Throughput (7 days) — {unit}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${trackName}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f0a030" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f0a030" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ts: number) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" })}
            tick={{ fontSize: 9, fill: "#667080" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#667080" }}
            axisLine={false}
            tickLine={false}
            width={35}
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={{ background: "#1a2030", border: "1px solid #ffffff10", borderRadius: 6, fontSize: "0.6rem", fontFamily: "var(--font-mono)" }}
            labelFormatter={(ts) => new Date(Number(ts)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            formatter={(v) => [`${Number(v).toFixed(2)} ${unit}`, "Throughput"]}
          />
          <Area type="monotone" dataKey="value" stroke="#f0a030" strokeWidth={1.5} fill={`url(#grad-${trackName})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

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

const chipStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.5rem",
  padding: "0.1rem 0.4rem",
  borderRadius: "3px",
  background: "#ffffff08",
  color: "#8890a0",
  whiteSpace: "nowrap",
  display: "inline-block",
};

const badgeBase: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.48rem",
  padding: "0.1rem 0.35rem",
  borderRadius: "3px",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  whiteSpace: "nowrap",
};

const trackRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.6rem 0.85rem",
  cursor: "pointer",
  userSelect: "none",
  borderBottom: "1px solid #ffffff06",
  background: "rgba(255,255,255,0.015)",
  transition: "background 0.15s",
};

const detailGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "0.5rem 1.2rem",
  padding: "0.6rem 0.85rem 0.8rem 2.4rem",
  borderBottom: "1px solid #ffffff04",
  background: "rgba(255,255,255,0.008)",
  fontSize: "0.62rem",
  fontFamily: "var(--font-mono)",
  color: "#a0a8b8",
};

const detailLabel: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.52rem",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#667080",
  marginBottom: "0.15rem",
};

type SortField = "name" | "tier" | "protocol" | "vpsRunning" | "vpsPoolSize";
type FilterTier = "all" | "Free" | "Pro" | "New";
type FilterStatus = "all" | "withRoutes" | "empty";

function VPSBar({ track }: { track: DashboardTrackDetail }) {
  const total = track.vpsRunning + track.vpsProvisioning + track.vpsConfiguring + track.vpsPending + track.vpsDestroyed;
  if (total === 0) return null;
  const segments = [
    { count: track.vpsRunning, color: STATUS_COLORS.running, label: "running" },
    { count: track.vpsConfiguring, color: STATUS_COLORS.configuring, label: "configuring" },
    { count: track.vpsProvisioning, color: STATUS_COLORS.provisioning, label: "provisioning" },
    { count: track.vpsPending, color: STATUS_COLORS.pending, label: "pending" },
    { count: track.vpsDestroyed, color: STATUS_COLORS.destroyed, label: "destroyed" },
  ].filter((s) => s.count > 0);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: "80px" }}>
      <div style={{ flex: 1, height: "4px", background: "#ffffff08", borderRadius: "2px", overflow: "hidden", display: "flex" }}>
        {segments.map((s) => (
          <div
            key={s.label}
            title={`${s.count} ${s.label}`}
            style={{ width: `${(s.count / total) * 100}%`, height: "100%", background: s.color, opacity: 0.7 }}
          />
        ))}
      </div>
      <span style={{ fontSize: "0.5rem", color: "#8890a0", fontFamily: "var(--font-mono)", minWidth: "24px", textAlign: "right" }}>
        {total}
      </span>
    </div>
  );
}

function TracksOverview() {
  const [tracks, setTracks] = useState<DashboardTrackDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortField, setSortField] = useState<SortField>("vpsRunning");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterTier, setFilterTier] = useState<FilterTier>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [metrics, setMetrics] = useState<TrackMetrics | null>(null);
  const [metricsTimeRange, setMetricsTimeRange] = useState<"1h" | "6h" | "24h" | "7d">("6h");
  const metricsLoadingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchTracks();
        if (!cancelled) {
          setTracks(data.tracks || []);
          setError(null);
          setIsLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load tracks");
          setIsLoading(false);
        }
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Fetch SigNoz metrics grouped by track
  useEffect(() => {
    if (metricsLoadingRef.current) return;
    metricsLoadingRef.current = true;

    const rangeMs: Record<string, number> = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000 };
    const endMs = Date.now();
    const startMs = endMs - (rangeMs[metricsTimeRange] || 21600000);

    // SigNoz v5 builder format — matches the existing "Track Performance Overview" dashboard panels.
    const buildQuery = (metricName: string, timeAgg: string, spaceAgg: string, _filterExpr: string, groupByKey: string) => ({
      start: startMs,
      end: endMs,
      compositeQuery: {
        queryType: "builder",
        panelType: "table",
        builderQueries: {
          A: {
            dataSource: "metrics",
            queryName: "A",
            aggregateAttribute: { key: metricName, dataType: "float64", type: "Sum", isColumn: true, isJSON: false },
            timeAggregation: timeAgg,
            spaceAggregation: spaceAgg,
            filters: { items: [], op: "AND" },
            expression: "A",
            disabled: false,
            groupBy: [{ key: groupByKey, dataType: "string", type: "tag", isColumn: false, isJSON: false }],
            legend: `{{${groupByKey}}}`,
            having: [],
            limit: null,
            orderBy: [],
            reduceTo: "avg",
            stepInterval: 300,
          },
        },
      },
    });

    const queries = [
      { key: "throughputBps" as const, query: buildQuery("proxy.io", "rate", "sum", "network.io.direction = 'transmit'", "proxy.track") },
      { key: "connections" as const, query: buildQuery("proxy.connections", "increase", "sum", "", "proxy.track") },
      { key: "callbacks" as const, query: buildQuery("bandit.callbacks", "increase", "sum", "", "proxy.track") },
      { key: "selections" as const, query: buildQuery("bandit.selections", "increase", "sum", "", "proxy.track") },
    ];

    const result: TrackMetrics = { throughputBps: {}, connections: {}, callbacks: {}, selections: {} };

    Promise.allSettled(queries.map(async ({ key, query }) => {
      try {
        const resp = await fetchSigNozMetrics(query);
        // SigNoz v4 response: data.result[0].series[] with labels + values
        const queryResult = resp?.data?.result || [];
        for (const qr of queryResult) {
          const seriesList = qr.series || [];
          for (const s of seriesList) {
            const trackName = s.labels?.["proxy.track"] || "";
            if (!trackName) continue;
            const values = s.values || [];
            if (values.length > 0) {
              const sum = values.reduce((acc: number, v: any) => acc + (parseFloat(v.value || v[1]) || 0), 0);
              result[key][trackName] = key === "throughputBps" ? (sum / values.length) * 8 : sum;
            }
          }
        }
      } catch {
        // Silently skip failed metric queries
      }
    })).then(() => {
      setMetrics(result);
      metricsLoadingRef.current = false;
    });

    const interval = setInterval(() => {
      metricsLoadingRef.current = false;
      // Trigger re-run by updating a dep — but we use ref to avoid loops
    }, 120_000);
    return () => clearInterval(interval);
  }, [metricsTimeRange]);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(field === "name");
      return field;
    });
  }, []);

  // Collect unique target countries across all tracks for the filter dropdown
  const availableCountries = useMemo(() => {
    const countries = new Set<string>();
    for (const t of tracks) {
      if (t.targetCountries && Array.isArray(t.targetCountries)) {
        for (const c of t.targetCountries) countries.add(c);
      }
    }
    return ["all", "global", ...Array.from(countries).sort()];
  }, [tracks]);

  const filtered = useMemo(() => {
    let result = tracks;
    if (filterTier !== "all") result = result.filter((t) => t.tier.toUpperCase() === filterTier.toUpperCase());
    if (filterStatus === "withRoutes") result = result.filter((t) => t.vpsRunning > 0);
    else if (filterStatus === "empty") result = result.filter((t) => t.vpsRunning === 0);
    if (filterCountry !== "all") {
      if (filterCountry === "global") {
        // "global" = tracks with no target countries (serve everyone)
        result = result.filter((t) => !t.targetCountries || !Array.isArray(t.targetCountries) || t.targetCountries.length === 0);
      } else {
        // Show tracks that target this country OR have no country restriction
        // (UNCENSORED tracks serve all countries including censored ones)
        result = result.filter((t) =>
          (!t.targetCountries || !Array.isArray(t.targetCountries) || t.targetCountries.length === 0) ||
          t.targetCountries.includes(filterCountry)
        );
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.protocol.toLowerCase().includes(q) ||
        (t.providers || []).some((p) => p.toLowerCase().includes(q)) ||
        (t.description || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [tracks, filterTier, filterStatus, filterCountry, searchQuery]);

  const sorted = useMemo(() => {
    const mult = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "name": return mult * a.name.localeCompare(b.name);
        case "tier": return mult * a.tier.localeCompare(b.tier);
        case "protocol": return mult * a.protocol.localeCompare(b.protocol);
        case "vpsRunning": return mult * (a.vpsRunning - b.vpsRunning);
        case "vpsPoolSize": return mult * (a.vpsPoolSize - b.vpsPoolSize);
        default: return 0;
      }
    });
  }, [filtered, sortField, sortAsc]);

  // Summary stats
  const stats = useMemo(() => {
    const enabled = tracks.filter((t) => !t.disabled);
    const withRoutes = enabled.filter((t) => t.vpsRunning > 0);
    const totalRunning = tracks.reduce((s, t) => s + t.vpsRunning, 0);
    const totalProvisioning = tracks.reduce((s, t) => s + t.vpsProvisioning, 0);
    const totalPending = tracks.reduce((s, t) => s + t.vpsPending, 0);
    const tiers: Record<string, number> = {};
    for (const t of enabled) tiers[t.tier] = (tiers[t.tier] || 0) + 1;
    const protocols: Record<string, number> = {};
    for (const t of enabled) protocols[t.protocol] = (protocols[t.protocol] || 0) + 1;
    return { total: tracks.length, enabled: enabled.length, withRoutes: withRoutes.length, totalRunning, totalProvisioning, totalPending, tiers, protocols };
  }, [tracks]);

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#667080", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        Loading tracks...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#e06060", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", padding: "0.75rem" }}>
      {/* Summary Cards */}
      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
        <div style={card}>
          <div style={cardLabel}>Total Tracks</div>
          <div style={{ ...cardValue, color: "#00e5c8" }}>{stats.total}</div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
            <span style={chipStyle}>{stats.enabled} enabled</span>
            <span style={chipStyle}>{stats.total - stats.enabled} disabled</span>
          </div>
        </div>
        <div style={card}>
          <div style={cardLabel}>With Running Routes</div>
          <div style={{ ...cardValue, color: "#64b4ff" }}>{stats.withRoutes}</div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
            {Object.entries(stats.tiers).sort((a, b) => b[1] - a[1]).map(([tier, count]) => (
              <span key={tier} style={{ ...chipStyle, color: TIER_COLORS[tier] || "#8890a0" }}>{tier} {count}</span>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={cardLabel}>VPS Running</div>
          <div style={{ ...cardValue, color: "#a0c8a0" }}>{stats.totalRunning}</div>
          {stats.totalProvisioning > 0 && (
            <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.35rem" }}>
              <span style={{ ...chipStyle, color: "#f0a030" }}>{stats.totalProvisioning} provisioning</span>
            </div>
          )}
        </div>
        {stats.totalPending > 0 && (
          <div style={card}>
            <div style={cardLabel}>VPS Pending</div>
            <div style={{ ...cardValue, color: "#667080" }}>{stats.totalPending}</div>
          </div>
        )}
        <div style={card}>
          <div style={cardLabel}>Protocols</div>
          <div style={{ ...cardValue, color: "#c0c8d4" }}>{Object.keys(stats.protocols).length}</div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
            {Object.entries(stats.protocols).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([proto, count]) => (
              <span key={proto} style={chipStyle}>{proto} {count}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search tracks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            padding: "0.3rem 0.6rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid #ffffff10",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            outline: "none",
            width: "180px",
          }}
        />
        <div style={{ display: "flex", gap: "0.2rem" }}>
          {(["all", "withRoutes", "empty"] as const).map((s) => (
            <div
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                ...chipStyle,
                cursor: "pointer",
                background: filterStatus === s ? "var(--accent-primary-dim)" : "#ffffff08",
                color: filterStatus === s ? "var(--accent-primary)" : "#8890a0",
                border: `1px solid ${filterStatus === s ? "#00e5c830" : "transparent"}`,
              }}
            >
              {s}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.2rem" }}>
          {(["all", "Free", "Pro", "New"] as const).map((t) => (
            <div
              key={t}
              onClick={() => setFilterTier(t)}
              style={{
                ...chipStyle,
                cursor: "pointer",
                background: filterTier === t ? "var(--accent-primary-dim)" : "#ffffff08",
                color: filterTier === t ? (TIER_COLORS[t] || "var(--accent-primary)") : "#8890a0",
                border: `1px solid ${filterTier === t ? "#00e5c830" : "transparent"}`,
              }}
            >
              {t}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.2rem" }}>
          {availableCountries.map((c) => (
            <div
              key={c}
              onClick={() => setFilterCountry(c)}
              style={{
                ...chipStyle,
                cursor: "pointer",
                background: filterCountry === c ? "#e0606020" : "#ffffff08",
                color: filterCountry === c ? "#e06060" : "#8890a0",
                border: `1px solid ${filterCountry === c ? "#e0606030" : "transparent"}`,
              }}
            >
              {c === "all" ? "all" : c === "global" ? "global" : c}
            </div>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#667080" }}>
          {filtered.length} of {tracks.length} tracks
        </span>
        <div style={{ display: "flex", gap: "0.2rem", marginLeft: "0.5rem" }}>
          {(["1h", "6h", "24h", "7d"] as const).map((r) => (
            <div
              key={r}
              onClick={() => setMetricsTimeRange(r)}
              style={{
                ...chipStyle,
                cursor: "pointer",
                background: metricsTimeRange === r ? "#ffb43220" : "#ffffff08",
                color: metricsTimeRange === r ? "#ffb432" : "#8890a0",
                border: `1px solid ${metricsTimeRange === r ? "#ffb43230" : "transparent"}`,
              }}
            >
              {r}
            </div>
          ))}
        </div>
      </div>

      {/* Sort Headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr 0.35fr 0.5fr 0.4fr 90px 0.35fr 0.5fr 0.45fr",
        gap: "0.5rem",
        padding: "0.4rem 0.85rem",
        fontSize: "0.5rem",
        fontFamily: "var(--font-sans)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "#667080",
        borderBottom: "1px solid #ffffff08",
        background: "var(--bg-card)",
        borderRadius: "var(--radius-md) var(--radius-md) 0 0",
        userSelect: "none",
      }}>
        <span />
        {([["name", "Name"], ["tier", "Tier"], ["protocol", "Protocol"], ["vpsPoolSize", "Pool"], ["vpsRunning", ""], ["vpsRunning", "Routes"], ["name", "Throughput"], ["name", "Callbacks"]] as [SortField, string][]).map(([field, label], i) => (
          <span
            key={`${field}-${i}`}
            onClick={() => handleSort(field)}
            style={{ cursor: "pointer", color: sortField === field ? "var(--accent-primary)" : "#667080" }}
          >
            {label || "VPS Routes"} {sortField === field ? (sortAsc ? "▲" : "▼") : ""}
          </span>
        ))}
      </div>

      {/* Track List */}
      <div style={{
        background: "var(--bg-card)",
        borderRadius: "0 0 var(--radius-md) var(--radius-md)",
        border: "1px solid #ffffff08",
        borderTop: "none",
        overflow: "auto",
        flex: 1,
        maxHeight: "calc(100vh - 360px)",
      }}>
        {sorted.map((track) => {
          const isExpanded = expanded.has(track.id);
          const tierColor = TIER_COLORS[track.tier] || "#8890a0";
          const isBandit = track.vpsPoolSize > 0;
          const totalVPS = track.vpsRunning + track.vpsProvisioning + track.vpsConfiguring + track.vpsPending + track.vpsDestroyed;

          return (
            <div key={track.id}>
              {/* Track row */}
              <div
                style={{
                  ...trackRowStyle,
                  display: "grid",
                  gridTemplateColumns: "20px 1fr 0.35fr 0.5fr 0.4fr 90px 0.35fr 0.5fr 0.45fr",
                  opacity: track.disabled ? 0.5 : 1,
                }}
                onClick={() => toggleExpand(track.id)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.015)"; }}
              >
                {/* Chevron */}
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#667080",
                  transition: "transform 0.15s", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                  textAlign: "center",
                }}>&#9662;</span>

                {/* Name + description */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", fontWeight: 600, color: "#d0d8e4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {track.name}
                    </span>
                    {track.disabled && (
                      <span style={{ ...badgeBase, background: "#e0606018", color: "#e06060" }}>disabled</span>
                    )}
                    {track.testing && (
                      <span style={{ ...badgeBase, background: "#f0a03018", color: "#f0a030" }}>testing</span>
                    )}
                  </div>
                  {track.description && (
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.52rem", color: "#667080", marginTop: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {track.description}
                    </div>
                  )}
                </div>

                {/* Tier */}
                <span style={{ ...badgeBase, background: `${tierColor}18`, color: tierColor, border: `1px solid ${tierColor}30`, alignSelf: "center" }}>
                  {track.tier}
                </span>

                {/* Protocol */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "#a0a8b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {track.protocol}
                </span>

                {/* Pool size */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: isBandit ? "#64b4ff" : "#4a5568" }}>
                  {isBandit ? `${track.vpsPoolSize}/loc` : "--"}
                </span>

                {/* VPS bar */}
                {totalVPS > 0 ? <VPSBar track={track} /> : <span style={{ fontSize: "0.5rem", color: "#4a5568" }}>--</span>}

                {/* Running count */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: track.vpsRunning > 0 ? "#a0c8a0" : "#4a5568" }}>
                  {track.vpsRunning > 0 ? track.vpsRunning : "--"}
                </span>

                {/* Throughput */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#f0a030" }}>
                  {metrics?.throughputBps[track.name] != null
                    ? formatBps(metrics.throughputBps[track.name])
                    : metrics ? "--" : "..."}
                </span>

                {/* Callbacks */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#a0c8a0" }}>
                  {metrics?.callbacks[track.name] != null
                    ? formatCount(metrics.callbacks[track.name])
                    : metrics ? "--" : "..."}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={detailGrid}>
                  <div>
                    <div style={detailLabel}>Providers</div>
                    <div>{track.providers?.length > 0 ? track.providers.join(", ") : "none"}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Platforms</div>
                    <div>{track.platforms?.length > 0 ? track.platforms.join(", ") : "all"}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Target Regions</div>
                    <div>{track.targetRegions?.length > 0 ? track.targetRegions.join(", ") : "all"}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Locations</div>
                    <div>{track.locations?.length > 0 ? track.locations.join(", ") : isBandit ? "all provider locations" : "n/a"}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Client Version</div>
                    <div>{track.clientVersion || "any"}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Routes/Client</div>
                    <div>{track.routesPerClient || "default"}</div>
                  </div>
                  {isBandit && (
                    <>
                      <div>
                        <div style={detailLabel}>Pool Size</div>
                        <div>{track.vpsPoolSize} per location</div>
                      </div>
                      <div>
                        <div style={detailLabel}>Max Clients/Route</div>
                        <div>{track.vpsMaxClientsPerRoute || "unlimited"}</div>
                      </div>
                      <div>
                        <div style={detailLabel}>Route Age</div>
                        <div>{track.routeAgeHours ? `${track.routeAgeHours}h` : "never expires"}</div>
                      </div>
                    </>
                  )}
                  <div>
                    <div style={detailLabel}>Client Floor/Ceil</div>
                    <div>{track.clientFloor.toFixed(2)} – {track.clientCeil.toFixed(2)}</div>
                  </div>
                  {track.targetCountries && (
                    <div>
                      <div style={detailLabel}>Target Countries</div>
                      <div>{Array.isArray(track.targetCountries) ? track.targetCountries.join(", ") : String(track.targetCountries)}</div>
                    </div>
                  )}
                  {track.excludedCountries && (
                    <div>
                      <div style={detailLabel}>Excluded Countries</div>
                      <div>{Array.isArray(track.excludedCountries) ? track.excludedCountries.join(", ") : String(track.excludedCountries)}</div>
                    </div>
                  )}
                  {track.dockerImage && (
                    <div>
                      <div style={detailLabel}>Docker Image</div>
                      <div>{track.dockerImage}</div>
                    </div>
                  )}

                  {/* SigNoz metrics */}
                  {metrics && (
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1.5rem", marginTop: "0.3rem", paddingTop: "0.4rem", borderTop: "1px solid #ffffff06" }}>
                      <div>
                        <div style={detailLabel}>Throughput ({metricsTimeRange})</div>
                        <div style={{ color: "#f0a030", fontWeight: 600 }}>
                          {metrics.throughputBps[track.name] != null ? formatBps(metrics.throughputBps[track.name]) : "--"}
                        </div>
                      </div>
                      <div>
                        <div style={detailLabel}>Connections ({metricsTimeRange})</div>
                        <div style={{ color: "#64b4ff" }}>
                          {metrics.connections[track.name] != null ? formatCount(metrics.connections[track.name]) : "--"}
                        </div>
                      </div>
                      <div>
                        <div style={detailLabel}>Bandit Selections ({metricsTimeRange})</div>
                        <div style={{ color: "#00e5c8" }}>
                          {metrics.selections[track.name] != null ? formatCount(metrics.selections[track.name]) : "--"}
                        </div>
                      </div>
                      <div>
                        <div style={detailLabel}>Callbacks ({metricsTimeRange})</div>
                        <div style={{ color: "#a0c8a0" }}>
                          {metrics.callbacks[track.name] != null ? formatCount(metrics.callbacks[track.name]) : "--"}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Throughput chart */}
                  <div style={{ gridColumn: "1 / -1", marginTop: "0.3rem", paddingTop: "0.4rem", borderTop: "1px solid #ffffff06" }}>
                    <TrackThroughputChart trackName={track.name} />
                  </div>

                  {/* VPS status breakdown */}
                  {totalVPS > 0 && (
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.5rem", marginTop: "0.3rem", paddingTop: "0.4rem", borderTop: "1px solid #ffffff06" }}>
                      {([
                        ["running", track.vpsRunning, STATUS_COLORS.running],
                        ["configuring", track.vpsConfiguring, STATUS_COLORS.configuring],
                        ["provisioning", track.vpsProvisioning, STATUS_COLORS.provisioning],
                        ["pending", track.vpsPending, STATUS_COLORS.pending],
                        ["destroyed", track.vpsDestroyed, STATUS_COLORS.destroyed],
                      ] as [string, number, string][]).filter(([, c]) => c > 0).map(([label, count, color]) => (
                        <span key={label} style={{ ...badgeBase, background: `${color}18`, color, border: `1px solid ${color}30` }}>
                          {count} {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ padding: "2rem", textAlign: "center", color: "#667080", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>
            No tracks match filters
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TracksOverview);
