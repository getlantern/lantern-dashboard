import { useState, type CSSProperties } from "react";
import {
  updateExperimentSetting,
  type ExperimentSetting,
  type ExperimentSettingsResponse,
} from "../api/client";

interface Props {
  settings: ExperimentSettingsResponse | null;
  isLoading: boolean;
  error: string | null;
  onSaved: () => void;
}

const card: CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: "var(--radius-md)",
  border: "1px solid #ffffff08",
  padding: "1rem 1.1rem",
};

const sectionLabel: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.6rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#8890a0",
  marginBottom: "0.6rem",
};

const knobRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "0.75rem",
  alignItems: "center",
  padding: "0.55rem 0",
  borderBottom: "1px solid #ffffff08",
};

const knobLabel: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.78rem",
  color: "var(--text-primary)",
};

const knobDesc: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.62rem",
  color: "var(--text-muted)",
  marginTop: "0.15rem",
  maxWidth: "44rem",
  lineHeight: 1.35,
};

function Toggle({ on, disabled, onClick, label }: { on: boolean; disabled: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "1px solid #ffffff14",
        background: on ? "var(--accent-success, #20e070)" : "#ffffff12",
        position: "relative",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

export default function ExperimentSettings({ settings, isLoading, error, onSaved }: Props) {
  // Per-key in-flight + error state, so one row's save doesn't block others.
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  // Local text buffer for int/string inputs so typing doesn't fight re-renders.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const save = async (key: string, value: boolean | number | string) => {
    setSaving((s) => ({ ...s, [key]: true }));
    setRowError((e) => ({ ...e, [key]: "" }));
    try {
      await updateExperimentSetting(key, value);
      // Drop the local draft so the field falls back to the authoritative
      // server value (normalized — e.g. an int shows 7, not the typed "007").
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      onSaved();
    } catch (err) {
      setRowError((e) => ({ ...e, [key]: err instanceof Error ? err.message : "save failed" }));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const renderControl = (k: ExperimentSetting) => {
    const busy = !!saving[k.key];
    if (k.type === "bool") {
      return <Toggle on={k.value === true} disabled={busy} label={k.label} onClick={() => save(k.key, !(k.value === true))} />;
    }
    const draftKey = k.key;
    const current = drafts[draftKey] ?? String(k.value);
    const commit = () => {
      if (k.type === "int") {
        // Treat blank as invalid rather than letting Number("") coerce to 0 and
        // silently persist 0 on blur.
        if (current.trim() === "" || !Number.isInteger(Number(current)) || Number(current) < 0) {
          setRowError((e) => ({ ...e, [k.key]: "must be a non-negative integer" }));
          return;
        }
        const n = Number(current);
        if (n !== k.value) save(k.key, n);
      } else {
        if (current !== k.value) save(k.key, current);
      }
    };
    return (
      <input
        type={k.type === "int" ? "number" : "text"}
        min={k.type === "int" ? 0 : undefined}
        value={current}
        disabled={busy}
        onChange={(e) => setDrafts((d) => ({ ...d, [draftKey]: e.target.value }))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{
          width: k.type === "int" ? 80 : 200,
          background: "#ffffff08",
          border: "1px solid #ffffff14",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.72rem",
          padding: "0.3rem 0.5rem",
        }}
      />
    );
  };

  if (isLoading && !settings) {
    return <div style={{ ...card, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>Loading settings…</div>;
  }
  if (error) {
    return <div style={{ ...card, color: "var(--accent-danger, #ff4060)", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{error}</div>;
  }
  if (!settings) return null;

  const applyMins = Math.round(settings.applyDelaySeconds / 60);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={card}>
        <div style={sectionLabel}>Automation controls</div>
        <div style={{ ...knobDesc, marginTop: 0, marginBottom: "0.5rem" }}>
          Changes are saved immediately but workers may take up to ~{applyMins} min to pick them up (settings cache).
        </div>
        {settings.editable.map((k) => (
          <div key={k.key} style={knobRow}>
            <div>
              <div style={knobLabel}>{k.label}</div>
              <div style={knobDesc}>{k.description}</div>
              {rowError[k.key] && (
                <div style={{ ...knobDesc, color: "var(--accent-danger, #ff4060)" }}>{rowError[k.key]}</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifySelf: "end" }}>
              {renderControl(k)}
            </div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={sectionLabel}>Algorithm parameters (read-only)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))", gap: "0.6rem" }}>
          {settings.readOnly.map((c) => (
            <div key={c.label} style={{ borderLeft: "2px solid #ffffff14", paddingLeft: "0.6rem" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.95rem", color: "var(--accent-primary)" }}>{c.value}</div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>{c.label}</div>
              <div style={{ ...knobDesc, marginTop: "0.15rem" }}>{c.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
