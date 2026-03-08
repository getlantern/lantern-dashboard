import { useAuth } from "../hooks/useAuth";
import { useLiveData } from "../hooks/useLiveData";
import WorldMap from "./WorldMap";
import StatsRow from "./StatsRow";
import ImpactCard from "./ImpactCard";
import ProtocolFeed from "./ProtocolFeed";

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
  const { isAuthenticated, user, logout } = useAuth();
  const { globalStats, volunteerStats, isLive, blockedRoutes } = useLiveData();

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="dashboard">
      <header className="header">
        <div className="header-brand">
          <LanternLogo />
          <div>
            <div className="header-title">Lantern</div>
            <div className="header-subtitle">Impact Dashboard</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {isLive && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.55rem",
                padding: "0.15rem 0.45rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--accent-primary-dim)",
                color: "var(--accent-primary)",
                border: "1px solid #00e5c830",
              }}
            >
              LIVE DATA
            </div>
          )}
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
        <div className="map-section">
          <div className="map-header">
            <h2>Global Network</h2>
            <p>
              {isLive
                ? `Live bandit data — ${globalStats.countries.length} countries`
                : "Simulated connections"}
            </p>
          </div>
          <WorldMap liveCountries={globalStats.countries.length > 0 ? globalStats.countries : undefined} />
          <div className="map-legend">
            {isLive ? (
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
            )}
          </div>
          <StatsRow stats={globalStats} />
        </div>

        <div className="right-panel">
          <ImpactCard stats={volunteerStats} />
          <ProtocolFeed />
        </div>
      </div>
    </div>
  );
}
