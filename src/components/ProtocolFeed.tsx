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

// Reward is a sigmoid of callback latency ∈ [0, 1]. ANY callback arriving
// means the tunnel worked — the server treats it as a success for blocking
// signals regardless of reward value. Reward just ranks arms for EXP3
// weight updates: fast (~200ms) → 0.98, slow (~3s+) → ≈0.
// We use the reward to color the feed — fast uses the success/deployed
// accent (green), slow uses the primary/generated accent (teal) — but
// never label a callback-event as "failed" (no callback = no event at all).
const CALLBACK_FAST_THRESHOLD = 0.5; // ~1500ms on the latency sigmoid

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// Convert "123456ms" in text to human-readable "2m3s"
function humanizeMs(text: string): string {
  return text.replace(/(\d+)ms\b/g, (_, ms) => {
    const total = parseInt(ms, 10);
    if (total < 1000) return `${total}ms`;
    const s = Math.floor(total / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m${s % 60}s`;
  });
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
              const callbackFast = isCallback && (event.reward ?? 0) > CALLBACK_FAST_THRESHOLD;
              const latencyMs = event.latencyMs ?? 0;
              const latencySuffix = isCallback && latencyMs > 0 ? ` (${humanizeMs(`${latencyMs}ms`)})` : "";
              return (
              <div key={`${event.timestamp}-${i}`} className="feed-item"
                style={isCallback ? { opacity: 0.7 } : undefined}>
                <div className={`feed-icon ${
                  isCallback
                    ? (callbackFast ? "deployed" : "generated")
                    : (LIVE_CSS_CLASS[event.eventType] || "generated")
                }`}>
                  {isCallback
                    ? (callbackFast ? "✓" : "⏱")
                    : (LIVE_TYPE_ICONS[event.eventType] || "📡")}
                </div>
                <div className="feed-content">
                  <div className="feed-title">
                    {isCallback
                      ? `${callbackFast ? "Route OK" : "Route OK (slow)"}${event.trackName ? ` — ${event.trackName}` : ""}${event.regionName ? ` via ${event.regionName}` : ""}${latencySuffix}`
                      : `${LIVE_TYPE_LABELS[event.eventType] || event.eventType}${event.detail ? `: ${humanizeMs(event.detail)}` : ""}`}
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
