// The overlay panels' shared components. The style tokens, state colours and
// formatters they build on live in overlayStyles.ts.
import { useState, type ReactNode } from "react";

import { BAD, buttonStyle, card, inputStyle, mono, muted } from "./overlayStyles";

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.4rem",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${color}40`,
        background: `${color}14`,
        color,
        fontFamily: "var(--font-mono)",
        fontSize: "0.62rem",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export function Tile({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ borderLeft: `2px solid ${color ?? "#ffffff14"}`, paddingLeft: "0.6rem" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.1rem", color: color ?? "var(--accent-primary)" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.66rem", color: "var(--text-secondary)" }}>{label}</div>
      {sub && <div style={{ ...muted, marginTop: "0.1rem" }}>{sub}</div>}
    </div>
  );
}

export function TileRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))", gap: "0.7rem" }}>
      {children}
    </div>
  );
}

// ReasonAction is the shape every overlay mutation takes: a reason is not
// optional decoration, it is written to the audit ledger next to the operator's
// identity, so the control refuses to fire without one.
export function ReasonAction({
  label,
  placeholder,
  tone,
  onRun,
}: {
  label: string;
  placeholder?: string;
  tone?: "normal" | "danger";
  onRun: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!reason.trim()) {
      setError("a reason is required — it goes to the audit ledger");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRun(reason.trim());
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
      <input
        value={reason}
        disabled={busy}
        placeholder={placeholder ?? "reason"}
        onChange={(e) => setReason(e.target.value)}
        style={{ ...inputStyle, width: 220 }}
      />
      <button type="button" disabled={busy} onClick={run} style={buttonStyle(busy, tone)}>
        {busy ? "…" : label}
      </button>
      {error && <span style={{ ...muted, color: BAD }}>{error}</span>}
    </span>
  );
}

export function JSONBlock({ value, maxHeight = 260 }: { value: unknown; maxHeight?: number }) {
  if (value === undefined || value === null) return null;
  return (
    <pre
      style={{
        background: "#00000030",
        border: "1px solid #ffffff10",
        borderRadius: "var(--radius-sm)",
        padding: "0.5rem 0.6rem",
        margin: 0,
        maxHeight,
        overflow: "auto",
        fontFamily: "var(--font-mono)",
        fontSize: "0.65rem",
        color: "var(--text-secondary)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...card, color: BAD, fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{children}</div>
  );
}

export function Loading({ what }: { what: string }) {
  return <div style={{ ...card, ...mono, color: "var(--text-muted)" }}>Loading {what}…</div>;
}

export function Empty({ what }: { what: string }) {
  return <div style={{ ...muted, padding: "0.5rem 0" }}>No {what}.</div>;
}

