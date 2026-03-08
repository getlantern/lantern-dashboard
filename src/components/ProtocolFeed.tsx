import { useEffect, useState, useRef } from "react";
import { generateProtocolEvent, type ProtocolEvent } from "../data/mock";

const TYPE_ICONS: Record<ProtocolEvent["type"], string> = {
  generated: "🧬",
  deployed: "🚀",
  blocked: "🚫",
  evaded: "⚡",
};

const TYPE_LABELS: Record<ProtocolEvent["type"], string> = {
  generated: "Protocol Generated",
  deployed: "Protocol Deployed",
  blocked: "Block Detected",
  evaded: "Block Evaded",
};

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function ProtocolFeed() {
  const [events, setEvents] = useState<ProtocolEvent[]>(() => {
    // Seed with some initial events
    const initial: ProtocolEvent[] = [];
    for (let i = 0; i < 8; i++) {
      const e = generateProtocolEvent();
      e.timestamp = Date.now() - (8 - i) * 15000;
      initial.push(e);
    }
    return initial;
  });

  const listRef = useRef<HTMLDivElement>(null);

  // Add new events periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setEvents((prev) => {
        const next = [generateProtocolEvent(), ...prev];
        return next.slice(0, 50); // keep last 50
      });
    }, 4000 + Math.random() * 6000);
    return () => clearInterval(interval);
  }, []);

  // Re-render for time-ago updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="feed-section">
      <div className="feed-header">
        <h3>Protocol Activity</h3>
        <span className="feed-count mono">{events.length} events</span>
      </div>
      <div className="feed-list" ref={listRef}>
        {events.map((event) => (
          <div key={event.id} className="feed-item">
            <div className={`feed-icon ${event.type}`}>
              {TYPE_ICONS[event.type]}
            </div>
            <div className="feed-content">
              <div className="feed-title">
                {TYPE_LABELS[event.type]}: {event.detail}
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
