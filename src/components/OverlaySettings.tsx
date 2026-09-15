// Every operator-editable overlay control in one place: the worker knobs, the
// rollout controller document, and the protocol limits that are not settings at
// all but which an operator hitting one needs to recognize.
import { useEffect, useState } from "react";

import {
  saveOverlayRolloutConfig,
  updateOverlaySetting,
  type OverlayKnob,
  type OverlaySettingsResponse,
} from "../api/overlays";
import { Badge, ErrorNote, JSONBlock, Loading, Tile, TileRow } from "./OverlayUI";
import {
  bps,
  buttonStyle,
  card,
  duration,
  inputStyle,
  muted,
  nanosToSeconds,
  sectionLabel,
} from "./overlayStyles";

function Toggle({ on, disabled, onClick, label }: { on: boolean; disabled: boolean; onClick: () => void; label: string }) {
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
        background: on ? "#20e070" : "#ffffff12",
        position: "relative",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.5 : 1,
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

export default function OverlaySettings({
  settings,
  isLoading,
  error,
  onSaved,
}: {
  settings: OverlaySettingsResponse | null;
  isLoading: boolean;
  error: string | null;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (isLoading && !settings) return <Loading what="overlay settings" />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!settings) return null;

  const save = async (key: string, value: boolean | number | string) => {
    setSaving((s) => ({ ...s, [key]: true }));
    setRowError((e) => ({ ...e, [key]: "" }));
    try {
      await updateOverlaySetting(key, value);
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      await onSaved();
    } catch (err) {
      setRowError((e) => ({ ...e, [key]: err instanceof Error ? err.message : "save failed" }));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const control = (knob: OverlayKnob) => {
    const busy = !!saving[knob.key];
    if (knob.type === "bool") {
      return <Toggle on={knob.value === true} disabled={busy} label={knob.label} onClick={() => save(knob.key, knob.value !== true)} />;
    }
    const current = drafts[knob.key] ?? String(knob.value ?? knob.default);
    const commit = () => {
      if (knob.type === "int") {
        if (current.trim() === "" || !Number.isInteger(Number(current)) || Number(current) < 0) {
          setRowError((e) => ({ ...e, [knob.key]: "must be a non-negative integer" }));
          return;
        }
        if (Number(current) !== knob.value) save(knob.key, Number(current));
        return;
      }
      if (knob.type === "float") {
        const value = Number(current);
        if (current.trim() === "" || Number.isNaN(value) || value < 0 || value > 1) {
          setRowError((e) => ({ ...e, [knob.key]: "must be a number in [0, 1]" }));
          return;
        }
        if (value !== knob.value) save(knob.key, value);
        return;
      }
      if (current !== knob.value) save(knob.key, current);
    };
    return (
      <input
        type={knob.type === "string" ? "text" : "number"}
        step={knob.type === "float" ? "0.01" : undefined}
        value={current}
        disabled={busy}
        onChange={(e) => setDrafts((d) => ({ ...d, [knob.key]: e.target.value }))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{ ...inputStyle, width: knob.type === "string" ? 140 : 110 }}
      />
    );
  };

  const applyMins = Math.max(1, Math.round(settings.applyDelaySeconds / 60));
  const diagnostics = settings.rolloutConfig.diagnostics;
  const effective = diagnostics.default.effective;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={card}>
        <div style={sectionLabel}>Effective policy</div>
        <TileRow>
          <Tile label="controller" value={diagnostics.enabled ? "enabled" : "disabled"} color={diagnostics.enabled ? "#20e070" : "#8890a0"} />
          <Tile label="master kill" value={diagnostics.master_kill ? "engaged" : "clear"} color={diagnostics.master_kill ? "#ff4060" : "#20e070"} />
          <Tile label="default box activation" value={bps(effective.box_activation_basis_points)} />
          <Tile label="default client exposure" value={bps(effective.new_client_assignment_exposure_basis_points)} />
          <Tile label="heartbeat freshness" value={duration(nanosToSeconds(diagnostics.max_heartbeat_age))} />
          <Tile label="country overrides" value={Object.keys(diagnostics.countries ?? {}).length} />
        </TileRow>
        {settings.rolloutConfig.error && (
          <div style={{ ...muted, color: "#ff4060", marginTop: "0.5rem" }}>
            The persisted document does not parse ({settings.rolloutConfig.error}). The API is serving the fail-closed
            disabled policy shown above, not the document below.
          </div>
        )}
      </div>

      <RolloutConfigEditor settings={settings} onSaved={onSaved} />

      <div style={card}>
        <div style={sectionLabel}>Worker controls</div>
        <div style={{ ...muted, marginBottom: "0.5rem" }}>
          Saved immediately; workers pick a change up within ~{applyMins} min (settings cache).
        </div>
        {settings.editable.map((knob) => (
          <div
            key={knob.key}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "0.75rem",
              alignItems: "center",
              padding: "0.55rem 0",
              borderBottom: "1px solid #ffffff08",
            }}
          >
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.78rem", color: "var(--text-primary)" }}>{knob.label}</div>
              <div style={{ ...muted, marginTop: "0.15rem", maxWidth: "48rem" }}>{knob.description}</div>
              <div style={{ ...muted, marginTop: "0.1rem", opacity: 0.7 }}>{knob.key} · default {String(knob.default)}</div>
              {rowError[knob.key] && <div style={{ ...muted, color: "#ff4060" }}>{rowError[knob.key]}</div>}
            </div>
            <div style={{ justifySelf: "end" }}>{control(knob)}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={sectionLabel}>Contract limits (read-only)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", gap: "0.7rem" }}>
          {settings.readOnly.map((constant) => (
            <div key={constant.label} style={{ borderLeft: "2px solid #ffffff14", paddingLeft: "0.6rem" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--accent-primary)" }}>{constant.value}</div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", color: "var(--text-secondary)" }}>{constant.label}</div>
              <div style={{ ...muted, marginTop: "0.15rem" }}>{constant.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// RolloutConfigEditor edits the whole controller document. Whole-document
// replacement is what the API accepts, and deliberately so: the country
// overrides, technique shares and holdbacks are validated together, and a
// per-field patch is how a share map ends up summing past its ceiling.
function RolloutConfigEditor({ settings, onSaved }: { settings: OverlaySettingsResponse; onSaved: () => Promise<void> }) {
  const persisted = JSON.stringify(settings.rolloutConfig.config ?? {}, null, 2);
  const [draft, setDraft] = useState(persisted);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed the editor when the server's document changes underneath it (a
  // reload after somebody else's write), but never while the operator has
  // unsaved edits in the box.
  useEffect(() => {
    setDraft((current) => (current === "" || !isDirty(current, persisted) ? persisted : current));
  }, [persisted]);

  const dirty = isDirty(draft, persisted);

  return (
    <div style={card}>
      <div style={sectionLabel}>Rollout controller document ({settings.rolloutConfig.settingKey})</div>
      <div style={{ ...muted, marginBottom: "0.5rem" }}>
        The one setting that can widen live exposure. Shares are basis points (10000 = 100%). An empty or unparseable
        document resolves to the disabled policy, so nothing can be exposed by accident.
      </div>
      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
        spellCheck={false}
        style={{ ...inputStyle, width: "100%", minHeight: 320, whiteSpace: "pre", fontSize: "0.68rem" }}
      />
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
        <input
          value={reason}
          placeholder="reason (audited)"
          onChange={(e) => setReason(e.target.value)}
          style={{ ...inputStyle, width: 320 }}
        />
        <button
          type="button"
          disabled={busy || !dirty}
          style={buttonStyle(busy)}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const parsed = JSON.parse(draft);
              await saveOverlayRolloutConfig(parsed, reason);
              setReason("");
              setSaved(true);
              await onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : "save failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          save document
        </button>
        <button type="button" disabled={!dirty} style={buttonStyle(false)} onClick={() => { setDraft(persisted); setError(null); }}>
          revert
        </button>
        {dirty && <Badge text="unsaved changes" color="#ffb432" />}
        {saved && !dirty && <Badge text="saved" color="#20e070" />}
        {error && <span style={{ ...muted, color: "#ff4060" }}>{error}</span>}
      </div>

      <div style={{ ...sectionLabel, marginTop: "0.8rem" }}>Configured vs effective, per scope</div>
      <div style={{ ...muted, marginBottom: "0.4rem" }}>
        Effective is what the controller applies after the global enable, the master kill and the scope's pause.
      </div>
      <JSONBlock value={settings.rolloutConfig.diagnostics} maxHeight={320} />
    </div>
  );
}

// isDirty compares documents semantically, so re-indentation or key reordering
// by the server does not look like a pending edit.
function isDirty(draft: string, persisted: string): boolean {
  try {
    return JSON.stringify(JSON.parse(draft)) !== JSON.stringify(JSON.parse(persisted));
  } catch {
    return true;
  }
}
