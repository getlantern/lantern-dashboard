import { useEffect, useState, useRef } from "react";
import { generateProtocolEvent, type ProtocolEvent } from "../data/mock";
import { EventType, type DashboardActivityEvent } from "../api/client";

const MOCK_TYPE_ICONS: Record<ProtocolEvent["type"], string> = {
  generated: "🧬",
  deployed: "🚀",
  blocked: "🚫",
  evaded: "⚡",
};

const MOCK_TYPE_LABELS: Record<ProtocolEvent["type"], string> = {
  generated: "Protocol Generated",
  deployed: "Protocol Deployed",
  blocked: "Block Detected",
  evaded: "Block Evaded",
};

const LIVE_TYPE_ICONS: Record<string, string> = {
  [EventType.ROUTE_BLOCKED]: "🚫",
  [EventType.ROUTE_UNBLOCKED]: "⚡",
  [EventType.ROUTE_DEPRECATED]: "💀",
  [EventType.ROUTE_PROVISIONED]: "🚀",
  [EventType.CALLBACK]: "📡",
};

const LIVE_TYPE_LABELS: Record<string, string> = {
  [EventType.ROUTE_BLOCKED]: "Block Detected",
  [EventType.ROUTE_UNBLOCKED]: "Block Evaded",
  [EventType.ROUTE_DEPRECATED]: "Route Deprecated",
  [EventType.ROUTE_PROVISIONED]: "Route Deployed",
  [EventType.CALLBACK]: "Probe Callback",
};

const LIVE_CSS_CLASS: Record<string, string> = {
  [EventType.ROUTE_BLOCKED]: "blocked",
  [EventType.ROUTE_UNBLOCKED]: "evaded",
  [EventType.ROUTE_DEPRECATED]: "blocked",
  [EventType.ROUTE_PROVISIONED]: "deployed",
  [EventType.CALLBACK]: "generated",
};

const CALLBACK_SUCCESS_THRESHOLD = 0.1;

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

interface ProtocolFeedProps {
  liveEvents?: DashboardActivityEvent[];
  demoMode?: boolean;
}

export default function ProtocolFeed({ liveEvents, demoMode }: ProtocolFeedProps) {
  const useLive = !demoMode && liveEvents !== undefined;

  const [mockEvents, setMockEvents] = useState<ProtocolEvent[]>(() => {
    const initial: ProtocolEvent[] = [];
    for (let i = 0; i < 8; i++) {
      const e = generateProtocolEvent();
      e.timestamp = Date.now() - (8 - i) * 15000;
      initial.push(e);
    }
    return initial;
  });

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!demoMode) return;
    const interval = setInterval(() => {
      setMockEvents((prev) => {
        const next = [generateProtocolEvent(), ...prev];
        return next.slice(0, 50);
      });
    }, 4000 + Math.random() * 6000);
    return () => clearInterval(interval);
  }, [demoMode]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const liveList = useLive ? liveEvents! : [];
  const eventCount = useLive ? liveList.length : mockEvents.length;

  return (
    <div className="feed-section">
      <div className="feed-header">
        <h3>Protocol Activity</h3>
        <span className="feed-count mono">{eventCount} events</span>
      </div>
      <div className="feed-list" ref={listRef}>
        {useLive
          ? liveList.map((event, i) => {
              const isCallback = event.eventType === EventType.CALLBACK;
              const callbackOk = isCallback && (event.reward ?? 0) > CALLBACK_SUCCESS_THRESHOLD;
              return (
              <div key={`${event.timestamp}-${i}`} className="feed-item"
                style={isCallback ? { opacity: 0.7 } : undefined}>
                <div className={`feed-icon ${
                  isCallback
                    ? (callbackOk ? "evaded" : "blocked")
                    : (LIVE_CSS_CLASS[event.eventType] || "generated")
                }`}>
                  {isCallback
                    ? (callbackOk ? "✓" : "✗")
                    : (LIVE_TYPE_ICONS[event.eventType] || "📡")}
                </div>
                <div className="feed-content">
                  <div className="feed-title">
                    {isCallback
                      ? `${callbackOk ? "Route OK" : "Probe Failed"}${event.trackName ? ` — ${event.trackName}` : ""}${event.regionName ? ` via ${event.regionName}` : ""}`
                      : `${LIVE_TYPE_LABELS[event.eventType] || event.eventType}${event.detail ? `: ${event.detail}` : ""}`}
                  </div>
                  <div className="feed-meta">
                    {event.trackName && <span className="feed-protocol">{event.trackName}</span>}
                    {event.regionName && <span>{event.regionName}</span>}
                    {event.country && <span>{event.country}</span>}
                    <span>{timeAgo(event.timestamp)}</span>
                  </div>
                </div>
              </div>
              );
            })
          : mockEvents.map((event) => (
              <div key={event.id} className="feed-item">
                <div className={`feed-icon ${event.type}`}>
                  {MOCK_TYPE_ICONS[event.type]}
                </div>
                <div className="feed-content">
                  <div className="feed-title">
                    {MOCK_TYPE_LABELS[event.type]}: {event.detail}
                  </div>
                  <div className="feed-meta">
                    <span className="feed-protocol">{event.protocol}</span>
                    <span>{event.country}</span>
                    <span>{timeAgo(event.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
