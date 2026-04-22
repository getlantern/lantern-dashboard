import { useState, useMemo, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { useLiveData } from "../hooks/useLiveData";
import { useProxy } from "../hooks/useProxy";
import { useGeoLookup } from "../hooks/useGeoLookup";
import { useVPSData } from "../hooks/useVPSData";
import WorldMap, { type MapSelection } from "./WorldMap";
import StatsRow from "./StatsRow";
import ProtocolFeed from "./ProtocolFeed";
import ProxyWidget from "./ProxyWidget";
import VPSOverview from "./VPSOverview";
import BanditArmsOverview, { BanditHowItWorks } from "./BanditArmsOverview";
import TracksOverview from "./TracksOverview";
import BandwidthOverview from "./BandwidthOverview";
import AISummary from "./AISummary";
import AdminPanel from "./AdminPanel";
import { getApiEnv } from "../api/client";
import type { GlobalStats } from "../data/mock";

// ApiEnvBadge makes the current API environment impossible to miss.
// Staging routes 1x1 pixel of your attention when you'd otherwise think
// you're looking at prod. Clicking jumps to the Admin tab where the
// actual toggle lives — this is just an indicator + shortcut, not the
// toggle itself, so no reload is needed.
function ApiEnvBadge({ onJumpToAdmin }: { onJumpToAdmin: () => void }) {
  const env = getApiEnv();
  const color =
    env === "prod" ? "var(--accent-primary)" :
    env === "staging" ? "#f0a030" :
    "#ff4060"; // custom — red so it can't be confused with the two canonical envs
  const bg =
    env === "prod" ? "var(--accent-primary-dim)" :
    env === "staging" ? "#f0a03015" :
    "#ff406015";
  const border =
    env === "prod" ? "#00e5c830" :
    env === "staging" ? "#f0a03040" :
    "#ff406040";
  return (
    <button
      type="button"
      onClick={onJumpToAdmin}
      title="Click to open Admin panel and switch environments"
      aria-label={`API environment: ${env} — click to open Admin panel`}
      style={{
        marginLeft: "0.75rem",
        padding: "0.15rem 0.5rem",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-mono)",
        fontSize: "0.55rem",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        cursor: "pointer",
        userSelect: "none" as const,
        color,
        background: bg,
        border: `1px solid ${border}`,
      }}
    >
      {env}
    </button>
  );
}

function LanternLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="8" width="12" height="18" rx="2" stroke="#00e5c8" strokeWidth="1.5" fill="none" />
      <rect x="12" y="5" width="8" height="3" rx="1" fill="#00e5c8" opacity="0.6" />
      <path d="M14 5 L14 3 Q16 1 18 3 L18 5" stroke="#00e5c8" strokeWidth="1.2" fill="none" opacity="0.5" />
      <ellipse cx="16" cy="17" rx="3" ry="4" fill="#00e5c8" opacity="0.15" />
      <path d="M16 13 Q14.5 16 15 18 Q15.5 20 16 20 Q16.5 20 17 18 Q17.5 16 16 13Z" fill="#00e5c8" opacity="0.7" />
      <path d="M16 14.5 Q15.2 16 15.5 17.5 Q15.8 19 16 19 Q16.2 19 16.5 17.5 Q16.8 16 16 14.5Z" fill="#f0a030" opacity="0.8" />
      <line x1="10" y1="12" x2="22" y2="12" stroke="#00e5c8" strokeWidth="0.8" opacity="0.3" />
      <line x1="10" y1="22" x2="22" y2="22" stroke="#00e5c8" strokeWidth="0.8" opacity="0.3" />
      <rect x="11" y="26" width="10" height="2" rx="1" fill="#00e5c8" opacity="0.4" />
    </svg>
  );
}

export default function Dashboard() {
  const { isAuthenticated, user, logout, token } = useAuth();
  const { globalStats, dataCenters, activityEvents, trafficFlows, isLive, blockedRoutes, demoMode, toggleDemoMode } = useLiveData();
  const [activeTab, setActiveTab] = useState<'map' | 'overview' | 'vps' | 'arms' | 'tracks' | 'bandwidth' | 'proxy' | 'admin'>(() => {
    const hash = window.location.hash;
    if (hash === '#overview') return 'overview';
    if (hash === '#vps') return 'vps';
    if (hash === '#arms') return 'arms';
    if (hash === '#tracks') return 'tracks';
    if (hash === '#bandwidth') return 'bandwidth';
    if (hash === '#proxy') return 'proxy';
    if (hash === '#admin') return 'admin';
    return 'map';
  });
  const switchTab = useCallback((tab: 'map' | 'overview' | 'vps' | 'arms' | 'tracks' | 'bandwidth' | 'proxy' | 'admin') => {
    setActiveTab(tab);
    window.location.hash = tab === 'map' ? '' : `#${tab}`;
  }, []);
  const vpsData = useVPSData(activeTab === 'vps');
  const proxy = useProxy();
  const [myProxyView, setMyProxyView] = useState(false);
  const connectionAddrs = useMemo(
    () => proxy.liveData.connectionDetails.map((c) => c.addr),
    [proxy.liveData.connectionDetails],
  );
  const { self: myGeo, peers: peerGeos } = useGeoLookup(connectionAddrs, proxy.isRunning);
  const [mapSelection, setMapSelection] = useState<MapSelection>({ country: null, asn: null, asnName: null, countryASNs: [] });
  const handleSelectionChange = useCallback((sel: MapSelection) => {
    setMapSelection(sel);
  }, []);

  // Compute filtered stats based on map selection
  const { displayStats, filterLabel } = useMemo(() => {
    const { country, asn, asnName, countryASNs } = mapSelection;

    if (!country) return { displayStats: globalStats, filterLabel: null };

    // Find the country data
    const countryData = globalStats.countries?.find((c) => c.country === country);
    const totalASNs = globalStats.countries?.reduce((s, c) => s + c.asnCount, 0) || 1;
    const countryASNCount = countryData?.asnCount || 0;
    const countryFraction = countryASNCount / Math.max(totalASNs, 1);

    if (asn) {
      // Filter to specific ISP
      const ispData = countryASNs.find((a) => a.asn === asn);
      const ispPulls = ispData?.totalPulls || 0;
      const countryTotalPulls = countryASNs.reduce((s, a) => s + a.totalPulls, 0) || 1;
      const ispFraction = countryFraction * (ispPulls / countryTotalPulls);

      const filtered: GlobalStats = {
        activeVolunteers: Math.max(1, Math.round(globalStats.activeVolunteers * ispFraction * 0.5)),
        activeUsers: Math.max(1, Math.round(globalStats.activeUsers * ispFraction)),
        countriesReached: 1,
        protocolsGenerated: globalStats.protocolsGenerated,
        protocolsActive: ispData?.numArms || globalStats.protocolsActive,
        blocksEvadedToday: ispData?.numBlocked || Math.round(globalStats.blocksEvadedToday * ispFraction),
        totalSessionsToday: Math.round(globalStats.totalSessionsToday * ispFraction),
        bandwidthTodayTB: +(globalStats.bandwidthTodayTB * ispFraction).toFixed(2),
      };
      return { displayStats: filtered, filterLabel: `${country} / ${asnName || asn}` };
    }

    // Filter to country
    const filtered: GlobalStats = {
      activeVolunteers: Math.max(1, Math.round(globalStats.activeVolunteers * countryFraction * 0.3)),
      activeUsers: Math.max(1, Math.round(globalStats.activeUsers * countryFraction)),
      countriesReached: 1,
      protocolsGenerated: globalStats.protocolsGenerated,
      protocolsActive: globalStats.protocolsActive,
      blocksEvadedToday: Math.round(globalStats.blocksEvadedToday * countryFraction),
      totalSessionsToday: Math.round(globalStats.totalSessionsToday * countryFraction),
      bandwidthTodayTB: +(globalStats.bandwidthTodayTB * countryFraction).toFixed(2),
    };
    return { displayStats: filtered, filterLabel: country };
  }, [globalStats, mapSelection]);

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="dashboard">
      <header className="header">
        <div className="header-brand">
          <LanternLogo />
          <div>
            <div className="header-title">Lantern</div>
            <div className="header-subtitle">Bandit Dashboard</div>
          </div>
          <ApiEnvBadge onJumpToAdmin={() => switchTab("admin")} />
        </div>
        <div style={{ display: "flex", gap: "0.25rem", marginLeft: "1.5rem" }}>
          {(["map", "overview", "vps", "arms", "tracks", "bandwidth", "proxy", "admin"] as const).map((tab) => (
            <div
              key={tab}
              onClick={() => switchTab(tab)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.55rem",
                padding: "0.15rem 0.55rem",
                borderRadius: "var(--radius-sm)",
                background: activeTab === tab ? "var(--accent-primary-dim)" : "#ffffff08",
                color: activeTab === tab ? "var(--accent-primary)" : "var(--text-muted)",
                border: `1px solid ${activeTab === tab ? "#00e5c830" : "#ffffff10"}`,
                cursor: "pointer",
                userSelect: "none" as const,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              {{ map: "Map", overview: "Overview", vps: "VPS Fleet", arms: "Bandit Arms", tracks: "Tracks", bandwidth: "Bandwidth", proxy: "Share Proxy", admin: "Admin" }[tab]}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginLeft: "auto" }}>
          <div
            onClick={toggleDemoMode}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.55rem",
              padding: "0.15rem 0.45rem",
              borderRadius: "var(--radius-sm)",
              background: demoMode ? "var(--accent-secondary-dim)" : isLive ? "var(--accent-primary-dim)" : "#ffffff08",
              color: demoMode ? "var(--accent-secondary)" : isLive ? "var(--accent-primary)" : "var(--text-muted)",
              border: `1px solid ${demoMode ? "#f0a03030" : isLive ? "#00e5c830" : "#ffffff10"}`,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            {demoMode ? "DEMO" : isLive ? "LIVE DATA" : "CONNECTING..."}
          </div>
          {blockedRoutes.length > 0 && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.55rem",
                padding: "0.15rem 0.45rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--accent-danger-dim)",
                color: "var(--accent-danger)",
                border: "1px solid #ff406030",
              }}
            >
              {blockedRoutes.length} BLOCKED
            </div>
          )}
          <div className="header-live">
            <div className="live-dot" />
            <span className="mono">LIVE</span>
            <span className="mono" style={{ color: "var(--text-muted)" }}>{timeStr}</span>
          </div>
          {isAuthenticated && user && (
            <button
              onClick={logout}
              style={{
                background: "none",
                border: "1px solid #ffffff10",
                borderRadius: "var(--radius-sm)",
                padding: "0.2rem 0.5rem",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              {user.picture && (
                <img
                  src={user.picture}
                  alt=""
                  style={{ width: 16, height: 16, borderRadius: "50%" }}
                />
              )}
              {user.name.split(" ")[0]}
            </button>
          )}
        </div>
      </header>

      <div className="main-layout">
        {activeTab === "overview" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: "0.75rem", background: "var(--bg-card)" }}>
            <BanditHowItWorks />
          </div>
        ) : activeTab === "vps" ? (
          <VPSOverview
            routes={vpsData.routes}
            summary={vpsData.summary}
            isLoading={vpsData.isLoading}
            hasLoaded={vpsData.hasLoaded}
            error={vpsData.error}
          />
        ) : activeTab === "arms" ? (
          <BanditArmsOverview countries={globalStats.countries} dataCenters={dataCenters} isLive={isLive} />
        ) : activeTab === "tracks" ? (
          <TracksOverview />
        ) : activeTab === "bandwidth" ? (
          <BandwidthOverview enabled={activeTab === "bandwidth"} countries={globalStats.countries} />
        ) : activeTab === "proxy" ? (
          <div style={{ flex: 1, padding: "1rem" }}>
            <ProxyWidget {...proxy} />
          </div>
        ) : activeTab === "admin" ? (
          <AdminPanel />
        ) : (
        <div className="map-section">
          <div className="map-header">
            <h2>Global Network</h2>
            <p>
              {isLive
                ? `Live bandit data — ${globalStats.countries.length} countries`
                : "Simulated connections"}
            </p>
          </div>
          <WorldMap
            liveCountries={globalStats.countries.length > 0 ? globalStats.countries : undefined}
            dataCenters={dataCenters}
            trafficFlows={trafficFlows}
            onSelectionChange={handleSelectionChange}
            myProxyView={myProxyView}
            myGeo={myGeo}
            peerGeos={peerGeos}
          />
          <div className="map-legend">
            {proxy.isRunning && (
              <div
                onClick={() => setMyProxyView((v) => !v)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6rem",
                  padding: "0.2rem 0.55rem",
                  borderRadius: "4px",
                  background: myProxyView ? "var(--accent-primary-dim)" : "#ffffff08",
                  color: myProxyView ? "var(--accent-primary)" : "var(--text-secondary)",
                  border: `1px solid ${myProxyView ? "#00e5c830" : "#ffffff10"}`,
                  cursor: "pointer",
                  userSelect: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                {myProxyView && (
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: "var(--accent-primary)",
                    boxShadow: "0 0 4px var(--accent-primary-glow)",
                    display: "inline-block",
                  }} />
                )}
                MY PROXY
              </div>
            )}
            {!myProxyView && (isLive ? (
              <>
                <div className="legend-item">
                  <div className="legend-dot" style={{ background: "#00e5c8", boxShadow: "0 0 6px #00e5c840" }} />
                  <span>Low block rate</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot" style={{ background: "#f0a030", boxShadow: "0 0 6px #f0a03040" }} />
                  <span>Medium</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot" style={{ background: "#ff4060", boxShadow: "0 0 6px #ff406040" }} />
                  <span>High</span>
                </div>
              </>
            ) : (
              <>
                <div className="legend-item">
                  <div className="legend-dot volunteer" />
                  <span>Volunteer</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot user" />
                  <span>User (censored)</span>
                </div>
              </>
            ))}
            {myProxyView && (
              <>
                <div className="legend-item">
                  <div className="legend-dot" style={{ background: "#00e5c8", boxShadow: "0 0 6px #00e5c840" }} />
                  <span>You</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot" style={{ background: "#f0a030", boxShadow: "0 0 6px #f0a03040" }} />
                  <span>Users you're helping</span>
                </div>
              </>
            )}
          </div>
          <StatsRow stats={displayStats} filterLabel={filterLabel} proxyLive={proxy.isRunning ? proxy.liveData : null} />
        </div>
        )}

        <div className="right-panel">
          <AISummary authToken={token} />
          <ProtocolFeed liveEvents={activityEvents} demoMode={demoMode} />
        </div>
      </div>
    </div>
  );
}
