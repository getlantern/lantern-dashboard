import { memo, useEffect, useRef, useCallback, useState } from "react";
import { useProxy, type ProxySessionStats } from "../hooks/useProxy";

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Isolated component for the ticking counter — only this re-renders every second
const SessionStats = memo(function SessionStats({
  stats,
  isRunning,
  currentSeconds,
}: {
  stats: ProxySessionStats;
  isRunning: boolean;
  currentSeconds: number;
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
        <div className="proxy-session-stat">
          <span className="proxy-session-value mono current">{formatDuration(currentSeconds)}</span>
          <span className="proxy-session-label">This session</span>
        </div>
      )}
    </div>
  );
});

export default function ProxyWidget() {
  const { scriptLoaded, scriptError, isRunning, stats, currentSeconds, loadScript, startSession, stopSession } = useProxy();
  const embedRef = useRef<HTMLDivElement>(null);
  const [widgetEnabled, setWidgetEnabled] = useState(false);
  const hasInitializedRef = useRef(false);

  // Load the embed script when user enables the widget
  useEffect(() => {
    if (widgetEnabled && !scriptLoaded && !scriptError) {
      loadScript();
    }
  }, [widgetEnabled, scriptLoaded, scriptError, loadScript]);

  const handleToggle = useCallback(() => {
    if (!widgetEnabled) {
      setWidgetEnabled(true);
    } else {
      if (isRunning) stopSession();
      hasInitializedRef.current = false;
      setWidgetEnabled(false);
    }
  }, [widgetEnabled, isRunning, stopSession]);

  // Start tracking once the embed script has loaded
  useEffect(() => {
    if (!widgetEnabled || !scriptLoaded) return;

    // Give the embed a moment to initialize, then start tracking
    const timer = setTimeout(() => {
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        startSession();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [widgetEnabled, scriptLoaded, startSession]);

  return (
    <div className="proxy-widget">
      <div className="proxy-header">
        <div>
          <h3>Volunteer as Proxy</h3>
          <p className="proxy-subtitle">
            {widgetEnabled
              ? isRunning
                ? "Helping users in censored regions"
                : "Initializing..."
              : "Share your connection"}
          </p>
        </div>
        <button
          className={`proxy-toggle ${widgetEnabled ? "active" : ""}`}
          onClick={handleToggle}
          aria-label={widgetEnabled ? "Stop proxy" : "Start proxy"}
        >
          <span className="proxy-toggle-knob" />
        </button>
      </div>

      {widgetEnabled && (
        <>
          {scriptError && (
            <div className="proxy-error">
              Failed to load proxy module. Check your connection.
            </div>
          )}

          <SessionStats stats={stats} isRunning={isRunning} currentSeconds={currentSeconds} />

          {/* The unbounded embed renders inside this custom element */}
          <div className="proxy-embed-container" ref={embedRef}>
            {scriptLoaded && (
              <browsers-unbounded
                data-layout="panel"
                data-theme="dark"
                data-globe="false"
                data-branding="false"
                data-exit="false"
                data-keep-text="false"
                data-menu="false"
                data-title="false"
                data-collapse="false"
                style={{ width: "100%", display: "block" }}
              />
            )}
          </div>
        </>
      )}

      {!widgetEnabled && stats.totalSessions > 0 && (
        <div className="proxy-lifetime">
          <div className="proxy-lifetime-row">
            <span className="proxy-lifetime-label">Lifetime sessions</span>
            <span className="proxy-lifetime-value mono">{stats.totalSessions}</span>
          </div>
          <div className="proxy-lifetime-row">
            <span className="proxy-lifetime-label">Total time shared</span>
            <span className="proxy-lifetime-value mono">{formatDuration(stats.totalSessionSeconds)}</span>
          </div>
        </div>
      )}

      {!widgetEnabled && stats.totalSessions === 0 && (
        <div className="proxy-cta">
          <p>
            Turn on to run as a proxy node directly in your browser.
            Your spare bandwidth helps people in censored regions access the open internet.
          </p>
        </div>
      )}
    </div>
  );
}

// Declare the custom element for TypeScript
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "browsers-unbounded": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "data-layout"?: string;
          "data-theme"?: string;
          "data-globe"?: string;
          "data-branding"?: string;
          "data-exit"?: string;
          "data-keep-text"?: string;
          "data-menu"?: string;
          "data-mock"?: string;
          "data-title"?: string;
          "data-collapse"?: string;
        },
        HTMLElement
      >;
    }
  }
}
