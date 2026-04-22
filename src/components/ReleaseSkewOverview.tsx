import { useMemo, type CSSProperties } from "react";
import { useReleaseSkew } from "../hooks/useReleaseSkew";

// ReleaseSkewOverview renders the current convergence state of the
// bandit VPS fleet: per track, a stacked bar showing how many running
// routes sit at each (target, current) release-tag pair, with a single
// fleet-wide target at the top and a "lag" timestamp per mismatched
// track. Powered by /dashboard/release-skew (GetBanditVPSImageSkew).
//
// Design doc: lantern-cloud/docs/design/central-vps-updates.md.
export default function ReleaseSkewOverview() {
  const { data, isLoading, hasLoaded, error } = useReleaseSkew(true);

  // Summary numbers across the whole fleet.
  const summary = useMemo(() => {
    if (!data) return { running: 0, converged: 0, lagging: 0, tracks: 0 };
    let running = 0;
    let converged = 0;
    let lagging = 0;
    for (const t of data.tracks) {
      running += t.totalRunning;
      for (const b of t.buckets) {
        if (b.matched) converged += b.routeCount;
        else lagging += b.routeCount;
      }
    }
    return { running, converged, lagging, tracks: data.tracks.length };
  }, [data]);

  if (isLoading && !hasLoaded) {
    return <div style={messageStyle}>Loading release skew…</div>;
  }
  if (error && !hasLoaded) {
    return <div style={{ ...messageStyle, color: "#e06060" }}>{error}</div>;
  }
  if (!data) {
    return <div style={messageStyle}>No data</div>;
  }

  const fleetDefault = data.fleetDefault || "(unset)";
  const orchestrationOn = data.autoreplaceActive;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", padding: "0.75rem" }}>
      {/* Summary cards */}
      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
        <div style={card}>
          <div style={cardLabel}>Fleet target</div>
          <div style={{ ...cardValue, color: orchestrationOn ? "#00e5c8" : "#8890a0" }}>{fleetDefault}</div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
            <span style={{ ...chipStyle, color: orchestrationOn ? "#a0c8a0" : "#667080" }}>
              {orchestrationOn ? "autoreplace ON" : "autoreplace OFF"}
            </span>
          </div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Running routes</div>
          <div style={{ ...cardValue, color: "#64b4ff" }}>{summary.running}</div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
            <span style={chipStyle}>{summary.tracks} tracks</span>
          </div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Converged</div>
          <div style={{ ...cardValue, color: "#a0c8a0" }}>{summary.converged}</div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
            <span style={{ ...chipStyle, color: "#a0c8a0" }}>
              {summary.running > 0 ? `${Math.round((summary.converged / summary.running) * 100)}% of fleet` : "—"}
            </span>
          </div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Lagging</div>
          <div style={{ ...cardValue, color: summary.lagging > 0 ? "#f0a030" : "#667080" }}>{summary.lagging}</div>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
            <span style={chipStyle}>target ≠ current</span>
          </div>
        </div>
      </div>

      {/* Per-track rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {data.tracks.map((t) => (
          <TrackRow
            key={t.trackId}
            trackName={t.trackName}
            targetOverride={t.targetTag}
            fleetDefault={fleetDefault}
            totalRunning={t.totalRunning}
            lagOldest={t.lagOldest}
            buckets={t.buckets}
          />
        ))}
        {data.tracks.length === 0 && (
          <div style={messageStyle}>No running bandit VPS routes.</div>
        )}
      </div>
    </div>
  );
}

function TrackRow({
  trackName,
  targetOverride,
  fleetDefault,
  totalRunning,
  lagOldest,
  buckets,
}: {
  trackName: string;
  targetOverride?: string;
  fleetDefault: string;
  totalRunning: number;
  lagOldest?: string;
  buckets: Array<{ targetTag: string; currentTag: string; routeCount: number; matched: boolean }>;
}) {
  const effectiveTarget = targetOverride || fleetDefault;
  const lagAge = lagOldest ? formatAge(lagOldest) : null;

  return (
    <div style={rowStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.35rem" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", fontWeight: 600, color: "#e0e5ec" }}>
          {trackName}
        </span>
        <span style={{ ...chipStyle, color: "#64b4ff" }}>target {effectiveTarget}</span>
        {targetOverride && (
          <span style={{ ...chipStyle, color: "#f0a030" }}>per-track override</span>
        )}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "#667080" }}>
          {totalRunning} running
        </span>
        {lagAge && (
          <span style={{ ...chipStyle, color: "#e06060", marginLeft: "auto" }}>
            oldest lag {lagAge}
          </span>
        )}
      </div>

      {/* Stacked bar */}
      <div style={{ display: "flex", height: 14, borderRadius: 3, overflow: "hidden", background: "#0a0d12" }}>
        {buckets.map((b, i) => {
          const pct = totalRunning > 0 ? (b.routeCount / totalRunning) * 100 : 0;
          const color = b.matched ? "#a0c8a0" : "#f0a030";
          return (
            <div
              key={i}
              title={bucketTooltip(b)}
              style={{
                width: `${pct}%`,
                background: color,
                opacity: b.matched ? 0.9 : 0.75,
                borderRight: i < buckets.length - 1 ? "1px solid #0a0d12" : "none",
              }}
            />
          );
        })}
      </div>

      {/* Per-bucket legend */}
      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
        {buckets.map((b, i) => (
          <span
            key={i}
            style={{
              ...chipStyle,
              color: b.matched ? "#a0c8a0" : "#f0a030",
              background: "#ffffff05",
            }}
          >
            {bucketLabel(b)} · {b.routeCount}
          </span>
        ))}
      </div>
    </div>
  );
}

function bucketLabel(b: { targetTag: string; currentTag: string; matched: boolean }): string {
  const t = b.targetTag || "—";
  const c = b.currentTag || "—";
  if (b.matched) return `✓ ${c}`;
  return `${c} → ${t}`;
}

function bucketTooltip(b: { targetTag: string; currentTag: string; routeCount: number; matched: boolean; oldestCreated?: string }): string {
  const parts = [
    `current: ${b.currentTag || "(unset)"}`,
    `target: ${b.targetTag || "(unset)"}`,
    `routes: ${b.routeCount}`,
    b.matched ? "converged" : "release drift",
  ];
  return parts.join("\n");
}

function formatAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return iso;
  const deltaMs = Date.now() - then;
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ── styles (match TracksOverview.tsx so the tab feels consistent) ──

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
  borderRadius: 3,
  background: "#ffffff08",
  color: "#8890a0",
  whiteSpace: "nowrap",
  display: "inline-block",
};

const rowStyle: CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: "var(--radius-md)",
  border: "1px solid #ffffff08",
  padding: "0.75rem 1rem",
};

const messageStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 300,
  color: "#667080",
  fontFamily: "var(--font-mono)",
  fontSize: "0.75rem",
};
