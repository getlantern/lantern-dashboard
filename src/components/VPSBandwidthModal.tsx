import { useEffect, useState, type CSSProperties } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchSigNozMetrics, type DashboardVPSRoute } from "../api/client";

interface VPSBandwidthModalProps {
  route: DashboardVPSRoute;
  onClose: () => void;
}

interface Point {
  ts: number;
  bps: number;
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(6, 10, 18, 0.72)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
  padding: "1.5rem",
};

const panel: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid #ffffff18",
  borderRadius: "var(--radius-md)",
  padding: "1.25rem 1.4rem 1.1rem",
  width: "min(860px, 96vw)",
  maxHeight: "88vh",
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
  boxShadow: "0 20px 48px rgba(0,0,0,0.55)",
};

const header: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.8rem",
};

const titleBlock: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const titleStyle: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "#e4e8ee",
  letterSpacing: "-0.005em",
  marginBottom: "0.2rem",
};

const subtitleStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.62rem",
  color: "#8890a0",
};

const closeBtn: CSSProperties = {
  background: "transparent",
  fontFamily: "var(--font-mono)",
  fontSize: "0.9rem",
  color: "#8890a0",
  cursor: "pointer",
  padding: "0.1rem 0.5rem",
  borderRadius: 4,
  border: "1px solid #ffffff14",
  outline: "none",
};

const closeBtnFocused: CSSProperties = {
  outline: "2px solid var(--accent-primary, #00e5c8)",
  outlineOffset: 2,
};

const statsRow: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const statPill: CSSProperties = {
  background: "#ffffff08",
  borderRadius: 4,
  padding: "0.3rem 0.6rem",
  fontFamily: "var(--font-mono)",
  fontSize: "0.58rem",
  color: "#c0c8d4",
};

const statLabel: CSSProperties = {
  color: "#667080",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginRight: "0.35rem",
  fontSize: "0.5rem",
};

const chartBox: CSSProperties = {
  width: "100%",
  height: 320,
  background: "#ffffff04",
  borderRadius: 6,
  padding: "0.6rem 0.4rem 0.4rem",
};

const messageStyle: CSSProperties = {
  width: "100%",
  height: 320,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#667080",
  fontFamily: "var(--font-mono)",
  fontSize: "0.65rem",
};

function pickUnit(maxBps: number): { unit: string; divisor: number } {
  if (maxBps >= 1e9) return { unit: "Gbps", divisor: 1e9 };
  if (maxBps >= 1e6) return { unit: "Mbps", divisor: 1e6 };
  if (maxBps >= 1e3) return { unit: "Kbps", divisor: 1e3 };
  return { unit: "bps", divisor: 1 };
}

function formatBps(bps: number): string {
  const { unit, divisor } = pickUnit(bps);
  return `${(bps / divisor).toFixed(2)} ${unit}`;
}

// buildRouteBandwidthQuery returns a SigNoz v5 builder query for the
// `proxy.io` metric filtered to a single VPS route. `route.id` is the
// OTel resource attribute set by `cloudinit_packer.go` on every lantern-box
// VPS; `network.io.direction=transmit` matches the convention used by
// TracksOverview so we surface the same egress throughput the tracks tab
// shows, just scoped to one route.
function buildRouteBandwidthQuery(routeId: string, startMs: number, endMs: number): object {
  return {
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
              { key: { key: "route.id", dataType: "string", type: "tag", isColumn: false, isJSON: false }, op: "=", value: routeId },
            ],
            op: "AND",
          },
          expression: "A",
          disabled: false,
          groupBy: [],
          legend: "bandwidth",
          having: [],
          limit: null,
          orderBy: [],
          reduceTo: "avg",
          stepInterval: 3600, // 1h buckets for a 7-day window
        },
      },
    },
  };
}

export default function VPSBandwidthModal({ route, onClose }: VPSBandwidthModalProps) {
  const [data, setData] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closeFocused, setCloseFocused] = useState(false);

  useEffect(() => {
    const endMs = Date.now();
    const startMs = endMs - 7 * 86400_000;
    fetchSigNozMetrics(buildRouteBandwidthQuery(route.id, startMs, endMs))
      .then((resp) => {
        const points: Point[] = [];
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
      .catch((e) => setError(e instanceof Error ? e.message : "SigNoz query failed"));
  }, [route.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const maxBps = data && data.length ? Math.max(...data.map((d) => d.bps)) : 0;
  const avgBps = data && data.length ? data.reduce((s, d) => s + d.bps, 0) / data.length : 0;
  const totalBytes = data && data.length
    ? data.reduce((s, d, i) => {
        if (i === 0) return 0;
        const dtSec = (d.ts - data[i - 1].ts) / 1000;
        return s + ((d.bps / 8) * dtSec);
      }, 0)
    : 0;

  const { unit, divisor } = pickUnit(Math.max(maxBps, 1));
  const chartData = data?.map((d) => ({ ts: d.ts, value: d.bps / divisor })) ?? [];
  const shortId = route.id.substring(0, 8);
  const addr = route.address ? `${route.address}${route.port ? `:${route.port}` : ""}` : "(no address)";

  const titleId = `vps-bw-title-${shortId}`;

  return (
    <div style={overlay} onClick={onClose}>
      <div
        style={panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div style={header}>
          <div style={titleBlock}>
            <div id={titleId} style={titleStyle}>
              Bandwidth — vps-{shortId}
            </div>
            <div style={subtitleStyle}>
              {route.trackName} · {route.regionName}{route.city ? ` (${route.city})` : ""} · {route.providerName} · {addr}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close bandwidth panel"
            onClick={onClose}
            onFocus={() => setCloseFocused(true)}
            onBlur={() => setCloseFocused(false)}
            style={closeFocused ? { ...closeBtn, ...closeBtnFocused } : closeBtn}
          >
            ✕
          </button>
        </div>

        <div style={statsRow}>
          <div style={statPill}>
            <span style={statLabel}>window</span>7 days (hourly)
          </div>
          <div style={statPill}>
            <span style={statLabel}>peak</span>{formatBps(maxBps)}
          </div>
          <div style={statPill}>
            <span style={statLabel}>avg</span>{formatBps(avgBps)}
          </div>
          <div style={statPill}>
            <span style={statLabel}>egress</span>{formatBytes(totalBytes)}
          </div>
        </div>

        <div style={chartBox}>
          {error ? (
            <div style={messageStyle}>Failed to load bandwidth: {error}</div>
          ) : !data ? (
            <div style={messageStyle}>Loading bandwidth…</div>
          ) : data.length === 0 ? (
            <div style={messageStyle}>No bandwidth samples for this VPS in the last 7 days</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <defs>
                  <linearGradient id={`vps-bw-${shortId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00e5c8" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#00e5c8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(ts: number) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" })}
                  tick={{ fontSize: 10, fill: "#667080" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#667080" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  label={{ value: unit, angle: -90, position: "insideLeft", fill: "#667080", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ background: "#1a2030", border: "1px solid #ffffff10", borderRadius: 6, fontSize: "0.65rem", fontFamily: "var(--font-mono)" }}
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  formatter={(v) => [`${Number(v).toFixed(2)} ${unit}`, "Bandwidth"]}
                />
                <Area type="monotone" dataKey="value" stroke="#00e5c8" strokeWidth={1.5} fill={`url(#vps-bw-${shortId})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
  return `${bytes.toFixed(0)} B`;
}
