import { useEffect, useState, useRef } from "react";
import type { GlobalStats } from "../data/mock";
import type { ProxyLiveData } from "../hooks/useProxy";
import { formatThroughput } from "./ProxyWidget";

interface StatsRowProps {
  stats: GlobalStats;
  filterLabel?: string | null;
  proxyLive?: ProxyLiveData | null;
}

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = ref.current;
    const diff = value - start;
    const duration = 1200;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + diff * eased;
      setDisplay(current);
      ref.current = current;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value]);

  return (
    <span>
      {decimals > 0
        ? display.toFixed(decimals)
        : Math.floor(display).toLocaleString()}
    </span>
  );
}

export default function StatsRow({ stats, filterLabel, proxyLive }: StatsRowProps) {
  return (
    <div className="stats-overlay">
      {filterLabel && (
        <div style={{
          position: "absolute",
          top: "-1.4rem",
          left: "0.75rem",
          fontFamily: "var(--font-mono)",
          fontSize: "0.5rem",
          color: "#8890a0",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}>
          Filtered: {filterLabel}
        </div>
      )}
      <div className="stat-card">
        <span className="stat-label">{filterLabel ? "Volunteers Serving" : "Active Volunteers"}</span>
        <span className="stat-value accent mono">
          <AnimatedNumber value={stats.activeVolunteers} />
        </span>
        <span className="stat-detail">{filterLabel ? `proxying for ${filterLabel}` : "sharing bandwidth right now"}</span>
      </div>

      <div className="stat-card">
        <span className="stat-label">{filterLabel ? "Users" : "Users Reached"}</span>
        <span className="stat-value secondary mono">
          <AnimatedNumber value={stats.activeUsers} />
        </span>
        <span className="stat-detail">
          {filterLabel ? "estimated active" : `across ${stats.countriesReached} countries`}
        </span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Blocks Evaded</span>
        <span className="stat-value info mono">
          <AnimatedNumber value={stats.blocksEvadedToday} />
        </span>
        <span className="stat-detail">
          using {stats.protocolsActive} AI protocols
        </span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Bandwidth</span>
        <span className="stat-value success mono">
          <AnimatedNumber value={stats.bandwidthTodayTB} decimals={1} />
          <span style={{ fontSize: "0.5em", opacity: 0.7 }}> TB</span>
        </span>
        <span className="stat-detail">
          {stats.totalSessionsToday.toLocaleString()} sessions
        </span>
      </div>

      {proxyLive && proxyLive.sharing && (
        <div className="stat-card" style={{ borderLeft: "2px solid var(--accent-primary)" }}>
          <span className="stat-label" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: "var(--accent-primary)",
              boxShadow: "0 0 6px var(--accent-primary-glow)",
              animation: "pulse-glow 2s ease-in-out infinite",
              display: "inline-block",
            }} />
            Your Proxy
          </span>
          <span className="stat-value accent mono">
            {proxyLive.connections}
            <span style={{ fontSize: "0.5em", opacity: 0.7 }}> conns</span>
          </span>
          <span className="stat-detail">
            {formatThroughput(proxyLive.throughputBps)} &middot; {proxyLive.lifetimeConnections} served
          </span>
        </div>
      )}
    </div>
  );
}
