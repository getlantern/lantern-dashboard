import { useState, useMemo, useEffect, memo, type CSSProperties } from "react";
import type { DashboardVPSRoute, DashboardVPSSummary } from "../api/client";
import VPSBandwidthModal from "./VPSBandwidthModal";

interface VPSOverviewProps {
  routes: DashboardVPSRoute[];
  summary: DashboardVPSSummary | null;
  isLoading: boolean;
  error: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  running: "#a0c8a0",
  configuring: "#80b0e0",
  provisioning: "#f0a030",
  pending: "#667080",
};

function statusColor(route: DashboardVPSRoute): string {
  if (route.deprecated) return "#e06060";
  return STATUS_COLORS[route.status] || "#667080";
}

function formatUptime(createdISO: string): string {
  const elapsed = Date.now() - Date.parse(createdISO);
  if (elapsed < 0) return "0m";
  const totalMinutes = Math.floor(elapsed / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface RegionGroup {
  regionName: string;
  city?: string;
  tracks: TrackGroup[];
  totalRoutes: number;
}

interface TrackGroup {
  trackName: string;
  protocolName: string;
  routes: DashboardVPSRoute[];
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
};

const tableContainer: CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: "var(--radius-md)",
  border: "1px solid #ffffff08",
  overflow: "auto",
  maxHeight: "calc(100vh - 280px)",
};

const regionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.65rem 1rem",
  cursor: "pointer",
  userSelect: "none",
  borderBottom: "1px solid #ffffff06",
  background: "rgba(255,255,255,0.015)",
  transition: "background 0.15s",
};

const trackHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.4rem 1rem 0.4rem 2.2rem",
  borderBottom: "1px solid #ffffff04",
  background: "rgba(255,255,255,0.008)",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "20px 1fr 0.7fr 0.6fr 0.5fr 0.6fr 0.5fr 0.7fr",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.4rem 1rem 0.4rem 3rem",
  borderBottom: "1px solid #ffffff04",
  fontSize: "0.65rem",
  fontFamily: "var(--font-mono)",
  color: "#c0c8d4",
  minHeight: "2rem",
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

function VPSOverview({ routes, summary, isLoading, error }: VPSOverviewProps) {
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(new Set());
  const [copiedRouteId, setCopiedRouteId] = useState<string | null>(null);
  const [bandwidthRoute, setBandwidthRoute] = useState<DashboardVPSRoute | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const toggleRegion = (regionName: string) => {
    setCollapsedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionName)) next.delete(regionName);
      else next.add(regionName);
      return next;
    });
  };

  const regionGroups: RegionGroup[] = useMemo(() => {
    const regionMap = new Map<string, { city?: string; trackMap: Map<string, { protocolName: string; routes: DashboardVPSRoute[] }> }>();

    for (const route of routes) {
      const rKey = route.regionName || "Unknown";
      if (!regionMap.has(rKey)) {
        regionMap.set(rKey, { city: route.city, trackMap: new Map() });
      }
      const region = regionMap.get(rKey)!;
      const tKey = route.trackName || "default";
      if (!region.trackMap.has(tKey)) {
        region.trackMap.set(tKey, { protocolName: route.protocolName, routes: [] });
      }
      region.trackMap.get(tKey)!.routes.push(route);
    }

    return Array.from(regionMap.entries())
      .map(([regionName, { city, trackMap }]) => {
        const tracks: TrackGroup[] = Array.from(trackMap.entries()).map(([trackName, { protocolName, routes: tRoutes }]) => ({
          trackName,
          protocolName,
          routes: tRoutes.sort((a, b) => (a.deprecated ? 1 : 0) - (b.deprecated ? 1 : 0) || a.status.localeCompare(b.status)),
        }));
        const totalRoutes = tracks.reduce((s, t) => s + t.routes.length, 0);
        return { regionName, city, tracks, totalRoutes };
      })
      .sort((a, b) => b.totalRoutes - a.totalRoutes);
  }, [routes]);

  const deprecatedCount = useMemo(() => routes.filter((r) => r.deprecated).length, [routes]);

  // Compute per-status breakdowns: count by provider + average age
  const statusBreakdown = useMemo(() => {
    const now = Date.now();
    const groups: Record<string, { byProvider: Record<string, number>; totalAge: number; count: number }> = {};
    for (const r of routes) {
      const status = r.deprecated ? "deprecated" : (["pending", "provisioning"].includes(r.status) ? "provisioning" : r.status);
      if (!groups[status]) groups[status] = { byProvider: {}, totalAge: 0, count: 0 };
      const g = groups[status];
      const provider = r.vpsProvider || r.providerName || "unknown";
      g.byProvider[provider] = (g.byProvider[provider] || 0) + 1;
      g.totalAge += now - new Date(r.created).getTime();
      g.count++;
    }
    return groups;
  }, [routes]);

  const formatAge = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m`;
    return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
  };

  const provisioningCount = statusBreakdown["provisioning"]?.count ?? 0;
  const configuringCount = statusBreakdown["configuring"]?.count ?? 0;
  const runningCount = statusBreakdown["running"]?.count ?? 0;
  const totalCount = summary?.total ?? routes.length;

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#667080", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        Loading VPS data...
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

  if (routes.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#667080", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        No active VPS routes
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", padding: "0.75rem" }}>
      {/* Summary Cards */}
      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
        <div style={card}>
          <div style={cardLabel}>Total VPS</div>
          <div style={{ ...cardValue, color: "#00e5c8" }}>{totalCount}</div>
          {summary?.byProvider && (
            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.45rem" }}>
              {Object.entries(summary.byProvider).map(([provider, count]) => (
                <span key={provider} style={chipStyle}>
                  {provider.toUpperCase()} {count}
                </span>
              ))}
            </div>
          )}
        </div>

        {(["running", "configuring", "provisioning", "deprecated"] as const).map((status) => {
          const colors: Record<string, string> = { running: "#a0c8a0", configuring: "#80b0e0", provisioning: "#f0a030", deprecated: "#e06060" };
          const counts: Record<string, number> = { running: runningCount, configuring: configuringCount, provisioning: provisioningCount, deprecated: deprecatedCount };
          const tooltips: Record<string, string> = {
            running: "VPS is fully provisioned, configured, and serving traffic. Avg age = average time since the route DB entry was created (includes provisioning + configuring time).",
            configuring: "VM has been created by the cloud provider. The API is pushing sing-box config via SSH. Avg age = time since route creation. Typically takes 2-5 minutes after VM is ready.",
            provisioning: "Includes 'pending' (waiting for pool worker) and 'provisioning' (VM creation in progress). Avg age = time waiting. If >30 min, check provider quotas or Vault region configs.",
            deprecated: "Route has been marked for removal. The destroy worker will terminate the VM and clean up the DB entry after a 1-hour grace period.",
          };
          const bd = statusBreakdown[status];
          return (
            <div key={status} style={{ ...card, position: "relative" }} title={tooltips[status]}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <div style={cardLabel}>{status.charAt(0).toUpperCase() + status.slice(1)}</div>
                <span style={{ fontSize: "0.55rem", color: "#556070", cursor: "help" }} title={tooltips[status]}>ⓘ</span>
              </div>
              <div style={{ ...cardValue, color: colors[status] }}>{counts[status]}</div>
              {bd && bd.count > 0 && (
                <>
                  <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
                    {Object.entries(bd.byProvider).sort((a, b) => b[1] - a[1]).map(([p, c]) => (
                      <span key={p} style={chipStyle}>{p.toUpperCase()} {c}</span>
                    ))}
                  </div>
                  <div style={{ marginTop: "0.3rem", fontSize: "0.55rem", color: "#667080", fontFamily: "var(--font-mono)" }} title="Average time since the route's DB entry was created. This includes all prior stages, not just time in the current state.">
                    avg age: {formatAge(bd.totalAge / bd.count)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Grouped Table */}
      <div style={tableContainer}>
        {/* Column headers */}
        <div style={{ ...rowStyle, padding: "0.5rem 1rem 0.5rem 3rem", color: "#667080", fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-sans)", borderBottom: "1px solid #ffffff08", position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 2 }}>
          <span />
          <span>Address</span>
          <span>Provider</span>
          <span>VPS Region</span>
          <span>Uptime</span>
          <span>Assignments</span>
          <span>Status</span>
          <span>SSH</span>
        </div>

        {regionGroups.map((region) => {
          const collapsed = collapsedRegions.has(region.regionName);
          return (
            <div key={region.regionName}>
              {/* Region header */}
              <div
                style={regionHeaderStyle}
                onClick={() => toggleRegion(region.regionName)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.015)"; }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#667080", width: "1rem", textAlign: "center", transition: "transform 0.15s", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
                  &#9662;
                </span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 600, color: "#d0d8e4" }}>
                  {region.regionName}
                </span>
                {region.city && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#667080" }}>
                    {region.city}
                  </span>
                )}
                <span style={{ marginLeft: "auto", ...chipStyle }}>
                  {region.totalRoutes} route{region.totalRoutes !== 1 ? "s" : ""}
                </span>
              </div>

              {!collapsed && region.tracks.map((track) => (
                <div key={`${region.regionName}-${track.trackName}`}>
                  {/* Track sub-header */}
                  <div style={trackHeaderStyle}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.62rem", fontWeight: 500, color: "#a0a8b8" }}>
                      {track.trackName}
                    </span>
                    <span style={{ ...badgeBase, background: "#ffffff06", color: "#667080" }}>
                      {track.protocolName}
                    </span>
                  </div>

                  {/* Route rows */}
                  {track.routes.map((route) => {
                    const sc = statusColor(route);
                    const addr = route.address && route.port ? `${route.address}:${route.port}` : route.address || "--";
                    const isDeprecated = !!route.deprecated;

                    return (
                      <div
                        key={route.id}
                        style={{ ...rowStyle, opacity: isDeprecated ? 0.5 : 1, cursor: "pointer", outline: "none" }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open bandwidth chart for vps-${route.id.substring(0, 8)}`}
                        title="Click to view last 7 days of bandwidth"
                        onClick={() => setBandwidthRoute(route)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setBandwidthRoute(route);
                          }
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLDivElement;
                          // Only clear hover bg if the row isn't the current keyboard-focus target;
                          // the onFocus handler owns the focused background otherwise.
                          if (el !== document.activeElement) {
                            el.style.background = "transparent";
                          }
                        }}
                        onFocus={(e) => {
                          const el = e.currentTarget as HTMLDivElement;
                          el.style.background = "rgba(255,255,255,0.04)";
                          el.style.boxShadow = "inset 0 0 0 1px var(--accent-primary, #00e5c8)";
                        }}
                        onBlur={(e) => {
                          const el = e.currentTarget as HTMLDivElement;
                          el.style.background = "transparent";
                          el.style.boxShadow = "none";
                        }}
                      >
                        {/* Status dot */}
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc, boxShadow: `0 0 5px ${sc}60`, display: "inline-block", flexShrink: 0 }} />

                        {/* IP:port */}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {addr}
                        </span>

                        {/* Provider badge */}
                        <span>
                          <span style={{ ...badgeBase, background: "#ffffff08", color: "#a0a8b8" }}>
                            {route.providerName}
                          </span>
                        </span>

                        {/* VPS region */}
                        <span style={{ fontSize: "0.58rem", color: "#8890a0" }}>
                          {route.vpsRegion}
                        </span>

                        {/* Uptime */}
                        <span style={{ fontSize: "0.58rem", color: "#8890a0" }}>
                          {formatUptime(route.created)}
                        </span>

                        {/* Assignments */}
                        <span style={{ fontSize: "0.58rem" }}>
                          <span style={{ color: "#c0c8d4" }}>{route.assignmentCount}</span>
                          <span style={{ color: "#667080" }}> / {route.peakAssignmentCount}</span>
                        </span>

                        {/* Status / Deprecated badge */}
                        <span>
                          {isDeprecated ? (
                            <span style={{ ...badgeBase, background: "#e0606018", color: "#e06060", border: "1px solid #e0606030" }}>
                              deprecated
                            </span>
                          ) : (
                            <span style={{ ...badgeBase, background: `${sc}18`, color: sc, border: `1px solid ${sc}30` }}>
                              {route.status}
                            </span>
                          )}
                        </span>

                        {/* SSH command — copy to clipboard */}
                        <button
                          type="button"
                          aria-label={`Copy SSH command for vps-${route.id.substring(0, 8)}`}
                          title={`Copy: ssh lantern@vps-${route.id.substring(0, 8)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const cmd = `ssh lantern@vps-${route.id.substring(0, 8)}`;
                            navigator.clipboard.writeText(cmd).then(() => {
                              setCopiedRouteId(route.id);
                              setTimeout(() => setCopiedRouteId((prev) => prev === route.id ? null : prev), 1200);
                            });
                          }}
                          style={{
                            all: "unset",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.52rem",
                            color: copiedRouteId === route.id ? "var(--accent-primary)" : "#667080",
                            cursor: "pointer",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
                          <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                            {copiedRouteId === route.id ? "✓" : "⎘"}
                          </span>
                          vps-{route.id.substring(0, 8)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {bandwidthRoute && (
        <VPSBandwidthModal route={bandwidthRoute} onClose={() => setBandwidthRoute(null)} />
      )}
    </div>
  );
}

export default memo(VPSOverview);
