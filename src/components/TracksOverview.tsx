import { useState, useEffect, useMemo, useCallback, memo, type CSSProperties } from "react";
import { fetchTracks, type DashboardTrackDetail } from "../api/client";

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

  const filtered = useMemo(() => {
    let result = tracks;
    if (filterTier !== "all") result = result.filter((t) => t.tier.toUpperCase() === filterTier.toUpperCase());
    if (filterStatus === "withRoutes") result = result.filter((t) => t.vpsRunning > 0);
    else if (filterStatus === "empty") result = result.filter((t) => t.vpsRunning === 0);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.protocol.toLowerCase().includes(q) ||
        t.providers.some((p) => p.toLowerCase().includes(q)) ||
        (t.description || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [tracks, filterTier, filterStatus, searchQuery]);

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
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#667080" }}>
          {filtered.length} of {tracks.length} tracks
        </span>
      </div>

      {/* Sort Headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr 0.4fr 0.6fr 0.5fr 100px 0.4fr",
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
        {([["name", "Name"], ["tier", "Tier"], ["protocol", "Protocol"], ["vpsPoolSize", "Pool"], ["vpsRunning", ""], ["vpsRunning", "Routes"]] as [SortField, string][]).map(([field, label], i) => (
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
                  gridTemplateColumns: "20px 1fr 0.4fr 0.6fr 0.5fr 100px 0.4fr",
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
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={detailGrid}>
                  <div>
                    <div style={detailLabel}>Providers</div>
                    <div>{track.providers.length > 0 ? track.providers.join(", ") : "none"}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Platforms</div>
                    <div>{track.platforms.length > 0 ? track.platforms.join(", ") : "all"}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Target Regions</div>
                    <div>{track.targetRegions.length > 0 ? track.targetRegions.join(", ") : "all"}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Locations</div>
                    <div>{track.locations.length > 0 ? track.locations.join(", ") : isBandit ? "all provider locations" : "n/a"}</div>
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
                      <div>{track.targetCountries}</div>
                    </div>
                  )}
                  {track.excludedCountries && (
                    <div>
                      <div style={detailLabel}>Excluded Countries</div>
                      <div>{track.excludedCountries}</div>
                    </div>
                  )}
                  {track.dockerImage && (
                    <div>
                      <div style={detailLabel}>Docker Image</div>
                      <div>{track.dockerImage}</div>
                    </div>
                  )}

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
