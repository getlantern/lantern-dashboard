import { useState, useEffect } from "react";
import "./App.css";
import WorldMap from "./components/WorldMap";
import StatsRow from "./components/StatsRow";
import ImpactCard from "./components/ImpactCard";
import ProtocolFeed from "./components/ProtocolFeed";
import { mockGlobalStats, mockVolunteerStats, type GlobalStats } from "./data/mock";

function LanternLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Lantern body */}
      <rect x="10" y="8" width="12" height="18" rx="2" stroke="#00e5c8" strokeWidth="1.5" fill="none" />
      {/* Top cap */}
      <rect x="12" y="5" width="8" height="3" rx="1" fill="#00e5c8" opacity="0.6" />
      {/* Handle */}
      <path d="M14 5 L14 3 Q16 1 18 3 L18 5" stroke="#00e5c8" strokeWidth="1.2" fill="none" opacity="0.5" />
      {/* Inner glow */}
      <ellipse cx="16" cy="17" rx="3" ry="4" fill="#00e5c8" opacity="0.15" />
      {/* Flame */}
      <path d="M16 13 Q14.5 16 15 18 Q15.5 20 16 20 Q16.5 20 17 18 Q17.5 16 16 13Z" fill="#00e5c8" opacity="0.7" />
      <path d="M16 14.5 Q15.2 16 15.5 17.5 Q15.8 19 16 19 Q16.2 19 16.5 17.5 Q16.8 16 16 14.5Z" fill="#f0a030" opacity="0.8" />
      {/* Cross bars */}
      <line x1="10" y1="12" x2="22" y2="12" stroke="#00e5c8" strokeWidth="0.8" opacity="0.3" />
      <line x1="10" y1="22" x2="22" y2="22" stroke="#00e5c8" strokeWidth="0.8" opacity="0.3" />
      {/* Bottom */}
      <rect x="11" y="26" width="10" height="2" rx="1" fill="#00e5c8" opacity="0.4" />
    </svg>
  );
}

function App() {
  const [stats, setStats] = useState<GlobalStats>(mockGlobalStats);

  // Simulate live stat updates
  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => ({
        ...prev,
        activeVolunteers: prev.activeVolunteers + Math.floor(Math.random() * 10 - 4),
        activeUsers: prev.activeUsers + Math.floor(Math.random() * 40 - 15),
        blocksEvadedToday: prev.blocksEvadedToday + Math.floor(Math.random() * 8),
        totalSessionsToday: prev.totalSessionsToday + Math.floor(Math.random() * 30),
        bandwidthTodayTB: +(prev.bandwidthTodayTB + Math.random() * 0.01).toFixed(2),
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
        <div className="header-live">
          <div className="live-dot" />
          <span className="mono">LIVE</span>
          <span className="mono" style={{ color: "var(--text-muted)" }}>
            {timeStr}
          </span>
        </div>
      </header>

      <div className="main-grid">
        <StatsRow stats={stats} />

        <div className="map-section">
          <div className="map-header">
            <h2>Global Network</h2>
            <p>Real-time volunteer connections</p>
          </div>
          <WorldMap />
          <div className="map-legend">
            <div className="legend-item">
              <div className="legend-dot volunteer" />
              <span>Volunteer</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot user" />
              <span>User</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot route" />
              <span>Active Route</span>
            </div>
          </div>
        </div>

        <div className="right-panel">
          <ImpactCard stats={mockVolunteerStats} />
          <ProtocolFeed />
        </div>
      </div>
    </div>
  );
}

export default App;
