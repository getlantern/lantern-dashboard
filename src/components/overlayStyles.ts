// Shared style tokens, state colours and formatters for the overlay panels.
// They live apart from OverlayUI.tsx so that file exports only components —
// which is what keeps fast refresh working for both.
import type { CSSProperties } from "react";

export const card: CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: "var(--radius-md)",
  border: "1px solid #ffffff08",
  padding: "1rem 1.1rem",
};

export const sectionLabel: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.6rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#8890a0",
  marginBottom: "0.6rem",
};

export const mono: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.7rem",
  color: "var(--text-primary)",
};

export const muted: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.65rem",
  color: "var(--text-muted)",
  lineHeight: 1.4,
};

export const th: CSSProperties = {
  textAlign: "left",
  padding: "0.35rem 0.5rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.6rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#8890a0",
  borderBottom: "1px solid #ffffff10",
  whiteSpace: "nowrap",
};

export const td: CSSProperties = {
  padding: "0.35rem 0.5rem",
  fontFamily: "var(--font-mono)",
  fontSize: "0.68rem",
  color: "var(--text-secondary)",
  borderBottom: "1px solid #ffffff06",
  whiteSpace: "nowrap",
};

// The state palette. Exported because a few panels colour their own badges
// from the same five meanings.
export const OK = "#20e070";
export const WARN = "#ffb432";
export const BAD = "#ff4060";
export const IDLE = "#8890a0";
export const INFO = "#64b4ff";

// convergenceColor maps the server's convergence verdict to the one colour the
// whole tab uses for it. Anything the backend adds later renders neutral rather
// than silently green.
export function convergenceColor(state: string): string {
  switch (state) {
    case "converged":
      return OK;
    case "pending":
      return INFO;
    case "stale_agent":
    case "unreported":
      return WARN;
    case "rejected":
    case "failed":
      return BAD;
    default:
      return IDLE;
  }
}

export function lifecycleColor(lifecycle: string): string {
  switch (lifecycle) {
    case "qualified":
      return OK;
    case "candidate":
      return INFO;
    case "quarantined":
      return WARN;
    case "rejected":
    case "retired":
      return BAD;
    default:
      return IDLE;
  }
}

export function rolloutStateColor(state: string): string {
  switch (state) {
    case "completed":
      return OK;
    case "canary":
    case "widening":
      return INFO;
    case "paused":
    case "draft":
      return WARN;
    case "rolled_back":
    case "failed":
      return BAD;
    default:
      return IDLE;
  }
}

export function evaluationStatusColor(status: string): string {
  switch (status) {
    case "succeeded":
      return OK;
    case "running":
      return INFO;
    case "pending":
      return WARN;
    case "failed":
    case "cancelled":
      return BAD;
    default:
      return IDLE;
  }
}

export function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "0.25rem 0.6rem",
    borderRadius: "var(--radius-sm)",
    background: active ? "var(--accent-primary-dim)" : "#ffffff08",
    color: active ? "var(--accent-primary)" : "var(--text-muted)",
    border: `1px solid ${active ? "#00e5c830" : "#ffffff10"}`,
    fontFamily: "var(--font-sans)",
    fontSize: "0.68rem",
    cursor: "pointer",
  };
}

export const inputStyle: CSSProperties = {
  background: "#ffffff08",
  border: "1px solid #ffffff14",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.7rem",
  padding: "0.3rem 0.5rem",
};

export function buttonStyle(disabled: boolean, tone: "normal" | "danger" = "normal"): CSSProperties {
  const color = tone === "danger" ? BAD : "var(--accent-primary)";
  return {
    padding: "0.28rem 0.6rem",
    borderRadius: "var(--radius-sm)",
    background: "#ffffff08",
    border: `1px solid ${tone === "danger" ? "#ff406040" : "#00e5c830"}`,
    color,
    fontFamily: "var(--font-sans)",
    fontSize: "0.68rem",
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

// ── formatters ──

export function shortID(id?: string): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function bps(value: number): string {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}

export function bytesPerSec(value: number): string {
  if (!value) return "—";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = value;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function since(timestamp?: string): string {
  if (!timestamp) return "—";
  const then = Date.parse(timestamp);
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

// nanosToSeconds converts a Go duration (marshalled as nanoseconds) for display.
export function nanosToSeconds(nanos: number): number {
  return nanos / 1e9;
}
