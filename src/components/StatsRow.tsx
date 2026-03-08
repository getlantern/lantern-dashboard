import { useEffect, useState, useRef } from "react";
import type { GlobalStats } from "../data/mock";

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
      // ease-out cubic
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

export default function StatsRow({ stats }: { stats: GlobalStats }) {
  return (
    <div className="stats-row">
      <div className="stat-card">
        <span className="stat-label">Active Volunteers</span>
        <span className="stat-value accent mono">
          <AnimatedNumber value={stats.activeVolunteers} />
        </span>
        <span className="stat-detail">sharing bandwidth right now</span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Users Reached</span>
        <span className="stat-value secondary mono">
          <AnimatedNumber value={stats.activeUsers} />
        </span>
        <span className="stat-detail">
          across {stats.countriesReached} countries
        </span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Blocks Evaded Today</span>
        <span className="stat-value info mono">
          <AnimatedNumber value={stats.blocksEvadedToday} />
        </span>
        <span className="stat-detail">
          using {stats.protocolsActive} AI protocols
        </span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Bandwidth Today</span>
        <span className="stat-value success mono">
          <AnimatedNumber value={stats.bandwidthTodayTB} decimals={1} />
          <span style={{ fontSize: "0.5em", opacity: 0.7 }}> TB</span>
        </span>
        <span className="stat-detail">
          {stats.totalSessionsToday.toLocaleString()} sessions
        </span>
      </div>
    </div>
  );
}
