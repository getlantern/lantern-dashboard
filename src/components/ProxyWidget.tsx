import { memo, useEffect, useRef, useCallback, useState } from "react";
import { useProxy, type ProxySessionStats, type ProxyLiveData } from "../hooks/useProxy";

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatThroughput(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} KB/s`;
  return `${bps} B/s`;
}

// Isolated component for the ticking counter — only this re-renders every second
const SessionStats = memo(function SessionStats({
  stats,
  isRunning,
  currentSeconds,
  liveData,
}: {
  stats: ProxySessionStats;
  isRunning: boolean;
  currentSeconds: number;
  liveData: ProxyLiveData;
}) {
  const totalTime = stats.totalSessionSeconds + currentSeconds;
  return (
    <div className="proxy-session-stats">
      <div className="proxy-session-stat">
        <span className="proxy-session-value mono">{stats.totalSessions}</span>
        <span className="proxy-session-label">Sessions</span>
      </div>
      <div className="proxy-session-stat">
        <span className="proxy-session-value mono">{formatDuration(totalTime)}</span>
        <span className="proxy-session-label">Total time</span>
      </div>
      {isRunning && (
        <>
          <div className="proxy-session-stat">
            <span className="proxy-session-value mono current">{formatDuration(currentSeconds)}</span>
            <span className="proxy-session-label">This session</span>
          </div>
          <div className="proxy-session-stat">
            <span className="proxy-session-value mono" style={{ color: "var(--accent-info)" }}>
              {liveData.connections}
            </span>
            <span className="proxy-session-label">Active conns</span>
          </div>
          <div className="proxy-session-stat">
            <span className="proxy-session-value mono" style={{ color: "var(--accent-success)" }}>
              {formatThroughput(liveData.throughputBps)}
            </span>
            <span className="proxy-session-label">Throughput</span>
          </div>
        </>
      )}
    </div>
  );
});

export default function ProxyWidget() {
  const { scriptLoaded, scriptError, isRunning, stats, currentSeconds, liveData, loadScript, initProxy, startSession, stopSession } = useProxy();
  const [widgetEnabled, setWidgetEnabled] = useState(false);
  const hasInitializedRef = useRef(false);

  // Load the embed script when user enables the widget
  useEffect(() => {
    if (widgetEnabled && !scriptLoaded && !scriptError) {
      loadScript();
    }
  }, [widgetEnabled, scriptLoaded, scriptError, loadScript]);

  // Initialize the headless proxy API once script is loaded
  useEffect(() => {
    if (widgetEnabled && scriptLoaded && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      initProxy();
    }
  }, [widgetEnabled, scriptLoaded, initProxy]);

  const handleToggle = useCallback(() => {
    if (!widgetEnabled) {
      setWidgetEnabled(true);
    } else {
      if (isRunning) stopSession();
      hasInitializedRef.current = false;
      setWidgetEnabled(false);
    }
  }, [widgetEnabled, isRunning, stopSession]);

  // Start proxying once the headless API is ready
  useEffect(() => {
    if (!widgetEnabled || !scriptLoaded) return;

    const timer = setTimeout(() => {
      if (liveData.ready || window.LanternProxy?.initialized) {
        startSession();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [widgetEnabled, scriptLoaded, liveData.ready, startSession]);

  // Compact bar when off
  if (!widgetEnabled) {
    return (
      <div className="proxy-bar" onClick={handleToggle}>
        <div className="proxy-bar-left">
          <span className="proxy-bar-icon">
            {stats.totalSessions > 0 ? "◉" : "○"}
          </span>
          <span className="proxy-bar-label">
            {stats.totalSessions > 0
              ? `Shared ${formatDuration(stats.totalSessionSeconds)} across ${stats.totalSessions} session${stats.totalSessions !== 1 ? "s" : ""}`
              : "Share your connection as a proxy"}
          </span>
        </div>
        <button
          className="proxy-toggle"
          onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          aria-label="Start proxy"
        >
          <span className="proxy-toggle-knob" />
        </button>
      </div>
    );
  }

  // Expanded view when on — fully native UI, no embedded widget
  return (
    <div className="proxy-widget">
      <div className="proxy-header">
        <div>
          <h3>Volunteering</h3>
          <p className="proxy-subtitle">
            {isRunning
              ? liveData.sharing
                ? "Actively helping users in censored regions"
                : "Connected — waiting for traffic"
              : liveData.ready
                ? "Proxy ready — starting session..."
                : "Initializing WASM proxy..."}
          </p>
        </div>
        <button
          className="proxy-toggle active"
          onClick={handleToggle}
          aria-label="Stop proxy"
        >
          <span className="proxy-toggle-knob" />
        </button>
      </div>

      {scriptError && (
        <div className="proxy-error">
          Failed to load proxy module. Check your connection.
        </div>
      )}

      {isRunning && liveData.sharing && (
        <div className="proxy-live-indicator">
          <div className="proxy-live-dot" />
          <span>Proxying traffic</span>
          <span className="proxy-live-conns">{liveData.lifetimeConnections} total connections served</span>
        </div>
      )}

      <SessionStats stats={stats} isRunning={isRunning} currentSeconds={currentSeconds} liveData={liveData} />
    </div>
  );
}
