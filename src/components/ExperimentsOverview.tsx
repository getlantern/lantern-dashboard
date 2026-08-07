import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  abortExperiment,
  buildExperimentTrackQuery,
  fetchSigNozMetrics,
  fetchTracks,
  retireExperiment,
  type ExperimentDetail,
  type ExperimentStratum,
  type ExperimentSummary,
  type ExperimentPipeline,
  type PromotedComparisonPoint,
} from "../api/client";
import { useExperiments, useExperimentDetail, useExperimentSettings, usePromotedComparison } from "../hooks/useExperiments";
import { useAuth } from "../hooks/useAuth";
import ExperimentSettings from "./ExperimentSettings";
import PromotionImpactLedger from "./PromotionImpactLedger";

const CHALLENGER_COLOR = "#00e5c8";
const CONTROL_COLOR = "#f0a030";

// Selectable now-relative windows for the promoted-vs-original traffic charts.
const COMPARISON_WINDOWS: Array<{ label: string; hours: number }> = [
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
];

// Lifecycle status → display color, matching the dashboard's accent palette.
const STATUS_COLORS: Record<string, string> = {
  proposed: "#667080",
  provisioning: "#80b0e0",
  gathering: "#f0a030",
  deciding: "#c090e0",
  promoting: "#60c0d0",
  promoted: "#20e070",
  retiring: "#e0a060",
  retired: "#8890a0",
  aborted: "#ff4060",
};

const VERDICT_COLORS: Record<string, string> = {
  promote: "#20e070",
  retire: "#ff4060",
  hold: "#8890a0",
};

// Terminal lifecycle states — an experiment here is already torn down (or
// promoted), so the operator abort/retire actions are hidden. Mirrors the
// experiment package's terminalStatuses.
const TERMINAL_STATUSES = new Set(["promoted", "retired", "aborted"]);

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

const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "0.7rem" };

function formatBytesPerSec(v: number): string {
  if (!v || v <= 0) return "0";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let i = 0;
  let n = v;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#8890a0";
  return (
    <span style={{
      ...mono, fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.05em",
      padding: "0.1rem 0.4rem", borderRadius: "3px",
      color, background: `${color}1a`, border: `1px solid ${color}40`,
    }}>{status}</span>
  );
}

// ── Lifecycle pipeline strip ──

// PipelineStrip doubles as the table's status filter: each stage card is a toggle
// button. A stage that's toggled off (dimmed + struck through) is hidden from the
// experiments list below. Counts always reflect the full pipeline, not the filter.
function PipelineStrip({ pipeline, hiddenStatuses, onToggle }: {
  pipeline: ExperimentPipeline | null;
  hiddenStatuses: Set<string>;
  onToggle: (status: string) => void;
}) {
  if (!pipeline) return null;
  return (
    <div style={card}>
      <div style={{ ...sectionLabel, display: "flex", justifyContent: "space-between", gap: "1rem" }}>
        <span>Lifecycle pipeline</span>
        <span style={{ textTransform: "none", letterSpacing: 0 }}>click a stage to show / hide it in the list</span>
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {pipeline.order.map((status) => {
          const count = pipeline.counts[status] ?? 0;
          const color = STATUS_COLORS[status] || "#8890a0";
          const hasCount = count > 0;
          const on = !hiddenStatuses.has(status);
          return (
            <button
              type="button"
              key={status}
              onClick={() => onToggle(status)}
              aria-pressed={on}
              title={on ? `Hide ${status} from the list` : `Show ${status} in the list`}
              style={{
                flex: "1 1 6rem", minWidth: "5.5rem", textAlign: "left",
                appearance: "none", cursor: "pointer",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${on && hasCount ? `${color}40` : "#ffffff0d"}`,
                background: on && hasCount ? `${color}12` : "#ffffff05",
                padding: "0.5rem 0.6rem",
                opacity: on ? 1 : 0.45,
              }}
            >
              <div style={{ ...mono, fontSize: "1.3rem", fontWeight: 600, color: on && hasCount ? color : "#5a6472" }}>{count}</div>
              <div style={{ ...mono, fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", textDecoration: on ? "none" : "line-through" }}>{status}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Per-stratum comparison charts ──

function StrataCharts({ strata, challenger, control }: { strata: ExperimentStratum[]; challenger: string; control: string }) {
  const goodputData = strata.map((s) => ({ country: s.country, challenger: s.challengerGoodput, control: s.controlGoodput, qualifies: s.qualifies }));
  const successData = strata.map((s) => ({ country: s.country, challenger: +(s.challengerSuccessRate * 100).toFixed(1), control: +(s.controlSuccessRate * 100).toFixed(1) }));

  if (strata.length === 0) {
    return <div style={{ ...mono, color: "var(--text-muted)" }}>No per-country strata yet for this window.</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))", gap: "1rem" }}>
      <div>
        <div style={{ ...mono, fontSize: "0.6rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>Median goodput by country</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={goodputData} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="country" tick={{ fontSize: 10, fill: "#8890a0" }} />
            <YAxis tick={{ fontSize: 10, fill: "#8890a0" }} tickFormatter={formatBytesPerSec} width={64} />
            <Tooltip formatter={(v) => formatBytesPerSec(Number(v))} contentStyle={{ background: "var(--bg-secondary)", border: "1px solid #ffffff14", fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar name={`${challenger} (challenger)`} dataKey="challenger" fill={CHALLENGER_COLOR} />
            <Bar name={`${control} (control)`} dataKey="control" fill={CONTROL_COLOR} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div style={{ ...mono, fontSize: "0.6rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>Success rate by country (%)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={successData} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="country" tick={{ fontSize: 10, fill: "#8890a0" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#8890a0" }} width={36} />
            <Tooltip formatter={(v) => `${Number(v)}%`} contentStyle={{ background: "var(--bg-secondary)", border: "1px solid #ffffff14", fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar name={`${challenger} (challenger)`} dataKey="challenger" fill={CHALLENGER_COLOR} />
            <Bar name={`${control} (control)`} dataKey="control" fill={CONTROL_COLOR} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Decision + guardrail cards ──

function DecisionCard({ detail }: { detail: ExperimentDetail }) {
  const d = detail.decisionPreview;
  const color = VERDICT_COLORS[d.verdict] || "#8890a0";
  return (
    <div style={{ ...card, flex: "1 1 16rem" }}>
      <div style={sectionLabel}>Decision preview</div>
      <div style={{ ...mono, fontSize: "1.1rem", fontWeight: 600, color, textTransform: "uppercase" }}>{d.verdict || "—"}</div>
      <div style={{ ...mono, fontSize: "0.62rem", color: "var(--text-secondary)", marginTop: "0.25rem", lineHeight: 1.4 }}>{d.reason}</div>
      <div style={{ display: "flex", gap: "1rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
        <Stat label="Qualifying strata" value={`${d.qualifyingStrata} / ${d.minStrata}`} ok={d.qualifyingStrata >= d.minStrata} />
        <Stat label="Wins" value={String(d.wins)} />
        <Stat label="Losses" value={String(d.losses)} />
        <Stat label="Win margin" value={`${Math.round(d.winMargin * 100)}%`} />
      </div>
    </div>
  );
}

function GuardrailsCard({ detail }: { detail: ExperimentDetail }) {
  const g = detail.guardrails;
  return (
    <div style={{ ...card, flex: "1 1 16rem" }}>
      <div style={sectionLabel}>Reliability guardrails</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        <GuardrailRow
          name="Blocking"
          ok={g.blockingOk}
          detail={`${g.blockedRoutes}/${g.totalRoutes} routes blocked (veto ≥ ${Math.round(g.maxBlockedFraction * 100)}%)`}
          reason={g.blockingReason}
        />
        <GuardrailRow
          name="Success rate"
          ok={g.successOk}
          detail={g.successReason || "challenger not materially below control"}
          reason={g.successOk ? undefined : g.successReason}
        />
      </div>
    </div>
  );
}

// RevalidationCard surfaces the post-promotion re-validation sweep
// (eng#3719/#3742): only 'promoted' rows ever go through it, so a demoted
// row's decision/decisionReason already tells that story. The backend records
// one of the experiment.RevalidationOutcome* tokens (lantern-cloud,
// SetExperimentRevalidated); rows stamped before the outcome column existed
// carry no token and fall through to the generic "Concluded".
const REVALIDATION_OUTCOMES: Record<string, { label: string; color: string; detail: string }> = {
  held: { label: "Held", color: "#20e070", detail: "Re-measured against the original control; the win held." },
  control_missing: { label: "Skipped", color: "#8890a0", detail: "Control track no longer live; nothing to measure against." },
  track_disabled: { label: "Skipped", color: "#8890a0", detail: "Promoted track already disabled; nothing left to demote." },
  aged_out: { label: "Aged out", color: "#e0a060", detail: "Left the sweep window without any axis ever becoming measurable." },
};

function classifyOutcome(outcome: string | undefined): { label: string; color: string; detail: string } {
  // Own-property check: the token comes from the backend, and a plain object
  // lookup would resolve inherited keys ("toString", "constructor") to junk.
  if (outcome && Object.prototype.hasOwnProperty.call(REVALIDATION_OUTCOMES, outcome)) return REVALIDATION_OUTCOMES[outcome];
  // An unknown token means the backend added an outcome this build doesn't
  // know yet — name it rather than hiding it (this is an operator debugging
  // surface); no token at all means the row predates the outcome column.
  if (outcome) return { label: "Concluded", color: "#8890a0", detail: `Unrecognized outcome token: ${outcome}` };
  return { label: "Concluded", color: "#8890a0", detail: "Concluded before outcomes were recorded." };
}

function RevalidationCard({ detail }: { detail: ExperimentDetail }) {
  if (detail.status !== "promoted") return null;
  const pending = !detail.revalidatedAt;
  const outcome = pending
    ? { label: "Pending", color: "#8890a0", detail: "Awaiting the post-promotion re-check." }
    : classifyOutcome(detail.revalidationOutcome);
  return (
    <div style={{ ...card, flex: "1 1 16rem" }}>
      <div style={sectionLabel}>Re-validation</div>
      <div style={{ ...mono, fontSize: "1.1rem", fontWeight: 600, color: outcome.color, textTransform: "uppercase" }}>{outcome.label}</div>
      <div style={{ ...mono, fontSize: "0.62rem", color: "var(--text-secondary)", marginTop: "0.25rem", lineHeight: 1.4 }}>
        {outcome.detail}
      </div>
      {detail.revalidatedAt && (
        <div style={{ ...mono, fontSize: "0.55rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
          Concluded {new Date(detail.revalidatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function GuardrailRow({ name, ok, detail, reason }: { name: string; ok: boolean; detail: string; reason?: string }) {
  const color = ok ? "#20e070" : "#ff4060";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
        <span style={{ ...mono, fontSize: "0.72rem", color: "var(--text-primary)" }}>{name}</span>
        <span style={{ ...mono, fontSize: "0.55rem", color, textTransform: "uppercase" }}>{ok ? "pass" : "veto"}</span>
      </div>
      <div style={{ ...mono, fontSize: "0.58rem", color: "var(--text-muted)", marginLeft: "1rem", marginTop: "0.1rem" }}>{reason || detail}</div>
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <div style={{ ...mono, fontSize: "0.95rem", fontWeight: 600, color: ok === undefined ? "var(--text-primary)" : ok ? "#20e070" : "#e0a060" }}>{value}</div>
      <div style={{ ...mono, fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

// ── Time-series: success rate over the gathering window (SigNoz) ──

interface TrackSeries { key: string; points: Array<{ ts: number; value: number }>; }

function extractTrackSeries(resp: unknown): TrackSeries[] {
  const out: TrackSeries[] = [];
  const r = resp as { data?: { result?: Array<{ series?: Array<{ labels?: Record<string, string>; values?: Array<{ timestamp?: number | string; value?: number | string }> }> }> } };
  for (const qr of r?.data?.result ?? []) {
    for (const s of qr.series ?? []) {
      const label = s.labels?.track || s.labels?.["proxy.track"];
      if (!label) continue;
      const points = (s.values ?? [])
        .map((v) => ({ ts: Number(v.timestamp) || 0, value: Number(v.value) || 0 }))
        .filter((p) => p.ts > 0)
        .sort((a, b) => a.ts - b.ts);
      if (points.length > 0) out.push({ key: label, points });
    }
  }
  return out;
}

function ExperimentTimeSeries({ challenger, control, startMs, endMs }: { challenger: string; control: string; startMs: number; endMs: number }) {
  const { isAuthenticated } = useAuth();
  const [rows, setRows] = useState<Array<Record<string, number>>>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const tracks = useMemo(() => [challenger, control].filter(Boolean), [challenger, control]);

  useEffect(() => {
    if (!isAuthenticated || tracks.length === 0 || !(endMs > startMs)) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      const windowSec = (endMs - startMs) / 1000;
      const stepSeconds = Math.max(300, Math.round(windowSec / 200));
      const mk = (metric: string) => buildExperimentTrackQuery({
        metricName: metric, trackNames: tracks, trackKey: "track",
        timeAggregation: "rate", spaceAggregation: "sum", startMs, endMs, stepSeconds,
      });

      try {
        const [cbResp, exResp] = await Promise.all([
          fetchSigNozMetrics(mk("bandit.callbacks")),
          fetchSigNozMetrics(mk("bandit.probes_expired")),
        ]);
        if (cancelled) return;
        const cb = extractTrackSeries(cbResp);
        const ex = extractTrackSeries(exResp);
        // success rate per (track, ts) = callbacks / (callbacks + expired).
        // Index both series by track→ts→count and union them, so a track with
        // only expired probes (zero successful callbacks) — the failing-challenger
        // case the chart exists to surface — still renders a 0% line.
        const index = (series: TrackSeries[]) => {
          const m = new Map<string, Map<number, number>>();
          for (const s of series) {
            const ts = m.get(s.key) ?? new Map<number, number>();
            for (const p of s.points) ts.set(p.ts, p.value);
            m.set(s.key, ts);
          }
          return m;
        };
        const cbByTrackTs = index(cb);
        const exByTrackTs = index(ex);
        const seenKeys = new Set<string>([...cbByTrackTs.keys(), ...exByTrackTs.keys()]);

        const byTs = new Map<number, Record<string, number>>();
        for (const key of seenKeys) {
          const cbTs = cbByTrackTs.get(key);
          const exTs = exByTrackTs.get(key);
          const timestamps = new Set<number>([...(cbTs?.keys() ?? []), ...(exTs?.keys() ?? [])]);
          for (const ts of timestamps) {
            const callbacks = cbTs?.get(ts) ?? 0;
            const expired = exTs?.get(ts) ?? 0;
            const denom = callbacks + expired;
            const rate = denom > 0 ? (callbacks / denom) * 100 : 0;
            if (!byTs.has(ts)) byTs.set(ts, { ts });
            byTs.get(ts)![key] = +rate.toFixed(1);
          }
        }
        setRows(Array.from(byTs.values()).sort((a, b) => a.ts - b.ts));
        setKeys(Array.from(seenKeys));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load time-series");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [tracks, startMs, endMs, isAuthenticated]);

  if (error) return <div style={{ ...mono, fontSize: "0.6rem", color: "var(--text-muted)" }}>Time-series unavailable: {error}</div>;
  if (loading && rows.length === 0) return <div style={{ ...mono, fontSize: "0.6rem", color: "var(--text-muted)" }}>Loading time-series…</div>;
  if (rows.length === 0) return <div style={{ ...mono, fontSize: "0.6rem", color: "var(--text-muted)" }}>No probe activity in this window.</div>;

  const colorFor = (k: string) => (k === challenger ? CHALLENGER_COLOR : CONTROL_COLOR);
  return (
    <div>
      <div style={{ ...mono, fontSize: "0.6rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>Probe success rate over time (%)</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} scale="time"
            tickFormatter={(ts: number) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" })}
            tick={{ fontSize: 10, fill: "#8890a0" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#8890a0" }} width={36} />
          <Tooltip
            formatter={(v) => `${Number(v)}%`}
            labelFormatter={(ts) => new Date(Number(ts)).toLocaleString()}
            contentStyle={{ background: "var(--bg-secondary)", border: "1px solid #ffffff14", fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {keys.map((k) => (
            <Line key={k} type="monotone" dataKey={k} name={k === challenger ? `${k} (challenger)` : k === control ? `${k} (control)` : k}
              stroke={colorFor(k)} dot={false} strokeWidth={2} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Operator actions (abort / retire) ──

function ExperimentActions({ id, status, onChanged }: { id: number; status: string; onChanged: () => void }) {
  const [busy, setBusy] = useState<"abort" | "retire" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Already terminal — nothing left to tear down.
  if (TERMINAL_STATUSES.has(status)) return null;

  const run = async (action: "abort" | "retire") => {
    const reason = window.prompt(
      `${action === "abort" ? "Abort" : "Retire"} experiment #${id}?\n\n` +
        "This disables its challenger track, zeroes its VPS pool, and deprecates its routes.\n\n" +
        "Optional reason (recorded as the experiment's decision reason). Click Cancel to back out.",
      "",
    );
    if (reason === null) return; // operator cancelled
    setBusy(action);
    setErr(null);
    setMsg(null);
    try {
      const updated = action === "abort" ? await abortExperiment(id, reason) : await retireExperiment(id, reason);
      setMsg(`Experiment #${updated.id} is now ${updated.status}.`);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  };

  const btn = (color: string): CSSProperties => ({
    ...mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.05em",
    padding: "0.3rem 0.8rem", borderRadius: "var(--radius-sm)", cursor: busy ? "default" : "pointer",
    color, background: `${color}14`, border: `1px solid ${color}40`, opacity: busy ? 0.6 : 1,
  });

  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
      <div style={{ ...sectionLabel, marginBottom: 0 }}>Operator actions</div>
      <button type="button" disabled={busy !== null} style={btn("#ff4060")} onClick={() => run("abort")}>
        {busy === "abort" ? "Aborting…" : "Abort"}
      </button>
      <button type="button" disabled={busy !== null} style={btn("#e0a060")} onClick={() => run("retire")}>
        {busy === "retire" ? "Retiring…" : "Retire"}
      </button>
      {msg && <span style={{ ...mono, fontSize: "0.6rem", color: "#20e070" }}>{msg}</span>}
      {err && <span style={{ ...mono, fontSize: "0.6rem", color: "#ff4060" }}>{err}</span>}
    </div>
  );
}

// ── Detail panel (loaded on row expand) ──

function ExperimentDetailPanel({ id, status, onChanged }: { id: number; status: string; onChanged: () => void }) {
  const { detail, isLoading, error } = useExperimentDetail(id);

  if (isLoading && !detail) return <div style={{ ...mono, color: "var(--text-muted)", padding: "0.75rem" }}>Loading stats…</div>;
  if (error) return <div style={{ ...mono, color: "var(--accent-danger, #ff4060)", padding: "0.75rem" }}>{error}</div>;
  if (!detail) return null;

  const challenger = detail.challengerTrackName || "challenger";
  const control = detail.controlTrackName || "control";
  const startMs = detail.windowStart ? Date.parse(detail.windowStart) : 0;
  const endMs = detail.windowEnd ? Date.parse(detail.windowEnd) : 0;

  // useExperimentDetail isn't re-fetched after an action, so detail.status can
  // lag behind the row's status prop (which onChanged() refreshes). Treat the
  // experiment as terminal as soon as EITHER source says so, so the action bar
  // disappears immediately after a successful abort/retire.
  const actionStatus = TERMINAL_STATUSES.has(status) ? status : (detail.status || status);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", padding: "0.75rem 0.25rem" }}>
      <ExperimentActions id={id} status={actionStatus} onChanged={onChanged} />
      {detail.statsError && (
        <div style={{ ...mono, fontSize: "0.62rem", color: "#e0a060", background: "#f0a03012", border: "1px solid #f0a03030", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.7rem" }}>
          {detail.statsError}
        </div>
      )}
      <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap" }}>
        <DecisionCard detail={detail} />
        <GuardrailsCard detail={detail} />
        <RevalidationCard detail={detail} />
      </div>
      <div style={card}>
        <div style={sectionLabel}>Per-country strata — challenger vs control</div>
        <StrataCharts strata={detail.strata ?? []} challenger={challenger} control={control} />
      </div>
      {startMs > 0 && endMs > startMs && (
        <div style={card}>
          <div style={sectionLabel}>Time-series</div>
          <ExperimentTimeSeries challenger={challenger} control={control} startMs={startMs} endMs={endMs} />
        </div>
      )}
    </div>
  );
}

// ── Experiments table ──

const colTemplate = "3rem 7rem 1fr 1fr 0.8fr 1fr 0.8fr";

function ExperimentsTable({ experiments, selectedId, onSelect, onChanged }: {
  experiments: ExperimentSummary[]; selectedId: number | null; onSelect: (id: number | null) => void; onChanged: () => void;
}) {
  if (experiments.length === 0) {
    return <div style={{ ...mono, color: "var(--text-muted)", padding: "1rem" }}>No experiments in the selected stages.</div>;
  }
  const headerStyle: CSSProperties = {
    display: "grid", gridTemplateColumns: colTemplate, gap: "0.5rem",
    padding: "0.4rem 0.75rem", ...mono, fontSize: "0.55rem", textTransform: "uppercase",
    letterSpacing: "0.05em", color: "var(--text-muted)", borderBottom: "1px solid #ffffff10",
  };
  return (
    <div style={card}>
      <div style={sectionLabel}>Experiments</div>
      <div style={headerStyle}>
        <div>ID</div><div>Status</div><div>Market / Serving DC</div><div>Challenger → Control</div><div>Protocol</div><div>Decision</div><div>Gathering</div>
      </div>
      {experiments.map((e) => {
        const expanded = selectedId === e.id;
        return (
          <div key={e.id}>
            <div
              onClick={() => onSelect(expanded ? null : e.id)}
              style={{
                display: "grid", gridTemplateColumns: colTemplate, gap: "0.5rem", alignItems: "center",
                padding: "0.5rem 0.75rem", ...mono, fontSize: "0.65rem", cursor: "pointer",
                background: expanded ? "#ffffff08" : "transparent",
                borderBottom: "1px solid #ffffff08",
              }}
            >
              <div style={{ color: "var(--text-muted)" }}>#{e.id}</div>
              <div><StatusBadge status={e.status} /></div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--text-primary)" }}>{e.targetCountry || "—"}</span>
                <span style={{ color: "var(--text-muted)" }}> / {e.locationName || "—"}{e.providerName ? ` (${e.providerName})` : ""}</span>
              </div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: CHALLENGER_COLOR }}>{e.challengerTrackName || "—"}</span>
                <span style={{ color: "var(--text-muted)" }}> → </span>
                <span style={{ color: CONTROL_COLOR }}>{e.controlTrackName || "—"}</span>
              </div>
              <div style={{ color: "var(--text-secondary)" }}>{e.protocolName || "—"}</div>
              <div style={{ color: e.decision === "promote" ? "#20e070" : e.decision === "retire" ? "#ff4060" : "var(--text-muted)" }}>
                {e.decision || "—"}
              </div>
              <div style={{ color: "var(--text-secondary)" }}>{e.gatheringHours ? `${e.gatheringHours.toFixed(0)}h` : "—"}</div>
            </div>
            {expanded && <ExperimentDetailPanel id={e.id} status={e.status} onChanged={onChanged} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Promoted vs original — traffic over time ──

const filterLabel: CSSProperties = {
  ...mono, fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em",
  color: "var(--text-muted)", marginBottom: "0.2rem",
};

const filterSelect: CSSProperties = {
  ...mono, fontSize: "0.65rem", color: "var(--text-primary)",
  background: "#ffffff08", border: "1px solid #ffffff10",
  borderRadius: "var(--radius-sm)", padding: "0.35rem 0.55rem",
};

function chip(active: boolean): CSSProperties {
  return {
    ...mono, fontSize: "0.6rem", padding: "0.3rem 0.7rem", borderRadius: "var(--radius-sm)",
    cursor: "pointer", userSelect: "none", appearance: "none",
    background: active ? "var(--accent-primary-dim)" : "#ffffff08",
    color: active ? "var(--accent-primary)" : "var(--text-muted)",
    border: `1px solid ${active ? "#00e5c830" : "#ffffff10"}`,
  };
}

// mergeTrafficRows folds the promoted and original per-track series into recharts
// rows keyed by timestamp, so a single LineChart can draw both lines. On a log
// axis a zero can't be plotted, so zeros become gaps (undefined) rather than
// dropping the point to the axis floor.
function mergeTrafficRows(
  promoted: Array<{ ts: number; value: number }>,
  original: Array<{ ts: number; value: number }>,
  logScale: boolean,
): Array<{ ts: number; promoted?: number; original?: number }> {
  const coerce = (v: number) => (logScale && v <= 0 ? undefined : v);
  const byTs = new Map<number, { ts: number; promoted?: number; original?: number }>();
  for (const p of promoted) { const r = byTs.get(p.ts) ?? { ts: p.ts }; r.promoted = coerce(p.value); byTs.set(p.ts, r); }
  for (const p of original) { const r = byTs.get(p.ts) ?? { ts: p.ts }; r.original = coerce(p.value); byTs.set(p.ts, r); }
  return Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
}

// trackCountryKey keys the per-(track, market) series map; both arms of a
// promotion are read at the experiment's target market, the stratum they share.
// The "|" separator is safe: track names are [a-z0-9-] and countries are ISO
// alpha-2, so neither contains it.
function trackCountryKey(track: string, country: string): string {
  return `${track}|${country}`;
}

// The two things a card can plot per track: total throughput (proxy.io bytes/s)
// or mean per-session goodput (proxy.session.goodput sum/count) — goodput being
// the metric the evaluator actually promotes on, so "quality" not just "volume".
type TrafficMetric = "traffic" | "goodput";

// avgGoodputByTrack turns the goodput sum + count series into mean per-session
// goodput (bytes/sec) per track: rate(sum)/rate(count) at each step (time
// cancels), the counter analog of the median the evaluator gates on.
function avgGoodputByTrack(
  sumSeries: Array<{ key: string; points: Array<{ ts: number; value: number }> }>,
  countSeries: Array<{ key: string; points: Array<{ ts: number; value: number }> }>,
): Map<string, Array<{ ts: number; value: number }>> {
  const index = (series: typeof sumSeries) => {
    const m = new Map<string, Map<number, number>>();
    for (const s of series) {
      const ts = m.get(s.key) ?? new Map<number, number>();
      for (const p of s.points) ts.set(p.ts, p.value);
      m.set(s.key, ts);
    }
    return m;
  };
  const sums = index(sumSeries), counts = index(countSeries);
  const out = new Map<string, Array<{ ts: number; value: number }>>();
  for (const track of new Set([...sums.keys(), ...counts.keys()])) {
    const st = sums.get(track), ct = counts.get(track);
    const pts: Array<{ ts: number; value: number }> = [];
    for (const ts of new Set([...(st?.keys() ?? []), ...(ct?.keys() ?? [])])) {
      const c = ct?.get(ts) ?? 0;
      // No sessions in this bucket ⇒ goodput is undefined, not 0. Omit the point
      // so it renders as a gap ("no data"), never a misleading flat-0 line.
      if (c > 0) pts.push({ ts, value: (st?.get(ts) ?? 0) / c });
    }
    pts.sort((a, b) => a.ts - b.ts);
    out.set(track, pts);
  }
  return out;
}

// deadBadge marks a track that is disabled in the tracks table — most commonly
// culled by a later promotion in the same market — so a flat/absent line reads
// as "torn down", never as a mysteriously silent live track.
const deadBadge: CSSProperties = {
  ...mono, fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em",
  padding: "0.05rem 0.35rem", borderRadius: "3px",
  color: "#ff4060", background: "#ff40601a", border: "1px solid #ff406040",
};

// PromotionTrafficCard is one promotion's traffic chart: the promoted track's
// line vs the original (control), both scoped to the experiment's target market,
// over the shared window. A vertical marker at the promotion time (when it falls
// in-window) shows the hand-off. If the promotion is working the promoted line
// climbs while the control's share of this market falls.
function PromotionTrafficCard({ point, seriesByTrackCountry, startMs, endMs, logScale, promotedDisabled, originalDisabled }: {
  point: PromotedComparisonPoint;
  seriesByTrackCountry: Map<string, Array<{ ts: number; value: number }>>;
  startMs: number;
  endMs: number;
  logScale: boolean;
  promotedDisabled: boolean;
  originalDisabled: boolean;
}) {
  const rows = useMemo(
    () => mergeTrafficRows(
      seriesByTrackCountry.get(trackCountryKey(point.promotedTrackName, point.targetCountry)) ?? [],
      seriesByTrackCountry.get(trackCountryKey(point.originalTrackName, point.targetCountry)) ?? [],
      logScale,
    ),
    [seriesByTrackCountry, point.promotedTrackName, point.originalTrackName, point.targetCountry, logScale],
  );
  const promotedMs = point.promotedAt ? Date.parse(point.promotedAt) : NaN;
  const showMarker = !Number.isNaN(promotedMs) && promotedMs >= startMs && promotedMs <= endMs;
  const hasData = rows.some((r) => r.promoted !== undefined || r.original !== undefined);

  return (
    <div style={{ border: "1px solid #ffffff0d", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.7rem" }}>
      <div style={{ ...mono, fontSize: "0.58rem", color: "var(--text-muted)", marginBottom: "0.15rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <span>#{point.experimentId} · {point.targetCountry} · {point.protocolName || "—"}{point.providerName ? ` · ${point.providerName}` : ""}</span>
        {promotedDisabled && (
          <span style={deadBadge} title="The promoted track is disabled — most commonly culled by a later promotion in this market — so it carries no traffic. The experiment row still reads 'promoted'.">culled</span>
        )}
        {originalDisabled && (
          <span style={{ ...deadBadge, color: "#8890a0", background: "#8890a01a", border: "1px solid #8890a040" }} title="The original (control) track is disabled; only the promoted line carries meaning in this window.">original disabled</span>
        )}
      </div>
      <div style={{ ...mono, fontSize: "0.62rem", marginBottom: "0.35rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ color: CHALLENGER_COLOR }}>{point.promotedTrackName}</span>
        <span style={{ color: "var(--text-muted)" }}> vs </span>
        <span style={{ color: CONTROL_COLOR }}>{point.originalTrackName}</span>
      </div>
      {!hasData ? (
        <div style={{ ...mono, fontSize: "0.58rem", color: "var(--text-muted)", padding: "2.5rem 0", textAlign: "center" }}>No {point.targetCountry} data in this window.</div>
      ) : (
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={rows} margin={{ top: 10, right: 10, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="ts" type="number" domain={[startMs, endMs]} scale="time"
              tickFormatter={(ts: number) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" })}
              tick={{ fontSize: 9, fill: "#8890a0" }} />
            <YAxis
              scale={logScale ? "log" : "linear"}
              domain={logScale ? [1, "auto"] : [0, "auto"]}
              allowDataOverflow={logScale}
              tickFormatter={formatBytesPerSec} tick={{ fontSize: 9, fill: "#8890a0" }} width={58} />
            <Tooltip
              formatter={(v, name) => [Number.isFinite(Number(v)) ? formatBytesPerSec(Number(v)) : "—", name === "promoted" ? "promoted" : "original"]}
              labelFormatter={(ts) => new Date(Number(ts)).toLocaleString()}
              contentStyle={{ background: "var(--bg-secondary)", border: "1px solid #ffffff14", fontSize: 11 }} />
            {showMarker && (
              <ReferenceLine x={promotedMs} stroke="#c090e0" strokeDasharray="4 3"
                label={{ value: "promoted", position: "insideTopRight", fontSize: 9, fill: "#c090e0" }} />
            )}
            {/* No connectNulls: a track dropping to zero (a gap on the log axis)
                must read as a break, not a bridged line implying phantom traffic. */}
            <Line type="monotone" dataKey="promoted" name="promoted" stroke={CHALLENGER_COLOR} dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="original" name="original" stroke={CONTROL_COLOR} dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function PromotedTraffic({ enabled }: { enabled: boolean }) {
  const { isAuthenticated } = useAuth();
  const [hours, setHours] = useState(168);
  const [logScale, setLogScale] = useState(true);
  const [metric, setMetric] = useState<TrafficMetric>("traffic");
  const [country, setCountry] = useState("");
  const [protocol, setProtocol] = useState("");
  const [provider, setProvider] = useState("");
  const { data, isLoading, error } = usePromotedComparison(enabled, hours);

  // Track liveness from the tracks endpoint (name → disabled), fetched once per
  // activation. A promoted track can be culled by a LATER promotion in the same
  // market while its experiment row stays 'promoted' forever, so without this
  // cross-reference the section charts dead tracks as mysteriously silent live
  // ones. A fetch failure leaves the map null: everything renders unbadged and
  // unhidden rather than mislabeled.
  const [trackDisabled, setTrackDisabled] = useState<Map<string, boolean> | null>(null);
  const [showCulled, setShowCulled] = useState(false);
  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      // Drop the map when the tab deactivates or auth lapses, mirroring the
      // traffic effect's reset: a stale map must not keep hiding/badging cards
      // when we can no longer (re)fetch liveness.
      setTrackDisabled(null);
      return;
    }
    let cancelled = false;
    fetchTracks()
      .then((d) => {
        if (cancelled) return;
        const m = new Map<string, boolean>();
        for (const t of d.tracks ?? []) m.set(t.name, t.disabled);
        setTrackDisabled(m);
      })
      .catch(() => { if (!cancelled) setTrackDisabled(null); });
    return () => { cancelled = true; };
  }, [enabled, isAuthenticated]);
  // Only an explicit disabled=true counts: a track missing from the map (or a
  // failed fetch) is treated as live so an endpoint hiccup can't hide real cards.
  const isTrackDisabled = useCallback((name: string) => trackDisabled?.get(name) === true, [trackDisabled]);

  const allPoints = useMemo(() => data?.points ?? [], [data]);

  // Filter option lists come from all promotions (before country/protocol/provider
  // filtering) so choosing one filter never empties the others' dropdowns.
  const countries = useMemo(() => [...new Set(allPoints.map((p) => p.targetCountry).filter(Boolean))].sort(), [allPoints]);
  const protocols = useMemo(() => [...new Set(allPoints.map((p) => p.protocolName).filter(Boolean))].sort(), [allPoints]);
  const providers = useMemo(() => [...new Set(allPoints.map((p) => p.providerName).filter(Boolean))].sort(), [allPoints]);

  const matchesFilters = useCallback((p: PromotedComparisonPoint) =>
    (!country || p.targetCountry === country) &&
    (!protocol || p.protocolName === protocol) &&
    (!provider || p.providerName === provider),
  [country, protocol, provider]);

  const filteredPoints = useMemo(() => allPoints.filter(matchesFilters), [allPoints, matchesFilters]);
  // Culled promotions (promoted track disabled) are hidden by default: they
  // carry no traffic, so their cards are pure noise unless explicitly asked
  // for. Hiding them BEFORE byMarket also skips their SigNoz traffic queries.
  const culledCount = useMemo(
    () => filteredPoints.filter((p) => isTrackDisabled(p.promotedTrackName)).length,
    [filteredPoints, isTrackDisabled],
  );
  const promotions = useMemo(
    () => (showCulled ? filteredPoints : filteredPoints.filter((p) => !isTrackDisabled(p.promotedTrackName))),
    [filteredPoints, showCulled, isTrackDisabled],
  );

  const startMs = data?.windowStart ? Date.parse(data.windowStart) : 0;
  const endMs = data?.windowEnd ? Date.parse(data.windowEnd) : 0;

  // Everything is scoped to each promotion's target market: a control is often a
  // multi-market incumbent, so its total dwarfs a single-market challenger — only
  // the target-market slice is a fair comparison. Queries run per distinct market
  // (filtered to that market), keyed by (track, market) for the cards to slice.
  const byMarket = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of promotions) {
      const names = m.get(p.targetCountry) ?? [];
      if (!names.includes(p.promotedTrackName)) names.push(p.promotedTrackName);
      if (!names.includes(p.originalTrackName)) names.push(p.originalTrackName);
      m.set(p.targetCountry, names);
    }
    return m;
  }, [promotions]);
  // Stable primitive dep for the fetch effect (byMarket is a fresh Map each render).
  const marketsKey = useMemo(
    () => [...byMarket.entries()].map(([c, ns]) => `${c}:${ns.join(",")}`).sort().join("|"),
    [byMarket],
  );

  const [seriesByTrackCountry, setSeriesByTrackCountry] = useState<Map<string, Array<{ ts: number; value: number }>>>(new Map());
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficError, setTrafficError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || byMarket.size === 0 || !(endMs > startMs)) {
      // Reset everything, including the loading/error flags, so a filter change
      // that empties the market set can't leave the UI stuck on "loading traffic".
      setSeriesByTrackCountry(new Map());
      setTrafficLoading(false);
      setTrafficError(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setTrafficLoading(true);
      setTrafficError(null);
      const windowSec = (endMs - startMs) / 1000;
      const stepSeconds = Math.max(900, Math.round(windowSec / 168)); // ~a point/hour over a week
      const countryFilter = (market: string) => ({ key: "geo.country.iso_code", dataType: "string", op: "=", value: market });
      try {
        const m = new Map<string, Array<{ ts: number; value: number }>>();
        if (metric === "traffic") {
          // Total throughput: proxy.io (transmit) per market, tagged proxy.track.
          const results = await Promise.all(
            [...byMarket.entries()].map(([market, names]) =>
              fetchSigNozMetrics(buildExperimentTrackQuery({
                metricName: "proxy.io", trackNames: names, trackKey: "proxy.track",
                timeAggregation: "rate", spaceAggregation: "sum", startMs, endMs, stepSeconds,
                extraFilters: [{ key: "network.io.direction", dataType: "string", op: "=", value: "transmit" }, countryFilter(market)],
              })).then((resp) => ({ market, series: extractTrackSeries(resp) })),
            ),
          );
          if (cancelled) return;
          for (const { market, series } of results) {
            for (const s of series) m.set(trackCountryKey(s.key, market), s.points);
          }
        } else {
          // Mean per-session goodput: sum/count per market, tagged track.
          const results = await Promise.all(
            [...byMarket.entries()].map(async ([market, names]) => {
              const mk = (metricName: string) => buildExperimentTrackQuery({
                metricName, trackNames: names, trackKey: "track",
                timeAggregation: "rate", spaceAggregation: "sum", startMs, endMs, stepSeconds,
                extraFilters: [countryFilter(market)],
                // goodput.* are cumulative histogram streams — v4 returns nothing
                // for rate() over them without this.
                temporality: "Cumulative",
              });
              const [sumResp, countResp] = await Promise.all([
                fetchSigNozMetrics(mk("proxy.session.goodput.sum")),
                fetchSigNozMetrics(mk("proxy.session.goodput.count")),
              ]);
              return { market, avg: avgGoodputByTrack(extractTrackSeries(sumResp), extractTrackSeries(countResp)) };
            }),
          );
          if (cancelled) return;
          for (const { market, avg } of results) {
            for (const [track, points] of avg) m.set(trackCountryKey(track, market), points);
          }
        }
        setSeriesByTrackCountry(m);
      } catch (err) {
        if (!cancelled) setTrafficError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        if (!cancelled) setTrafficLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
    // byMarket is captured but keyed on the stable marketsKey string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketsKey, startMs, endMs, isAuthenticated, metric]);

  const hasFilters = Boolean(country || protocol || provider);
  const windowLabel = COMPARISON_WINDOWS.find((w) => w.hours === hours)?.label ?? `${hours}h`;
  const metricNoun = metric === "goodput" ? "goodput" : "traffic";

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
        <div>
          <div style={{ ...sectionLabel, marginBottom: "0.15rem" }}>Promoted vs original — {metric === "goodput" ? "goodput over time" : "traffic over time"}</div>
          <div style={{ ...mono, fontSize: "0.55rem", color: "var(--text-muted)" }}>
            One card per promotion over the last {windowLabel}, scoped to the experiment's target market: the <span style={{ color: CHALLENGER_COLOR }}>promoted</span> track vs the <span style={{ color: CONTROL_COLOR }}>original</span> (control). {metric === "goodput"
              ? "Goodput (mean bytes/sec per session) is the metric the evaluator promotes on — this shows whether the promoted track still wins on quality."
              : "Traffic is total throughput; if the promotion is working the promoted line climbs while the control's share of that market falls."}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setMetric("traffic")} style={chip(metric === "traffic")} aria-pressed={metric === "traffic"}>traffic</button>
          <button type="button" onClick={() => setMetric("goodput")} style={chip(metric === "goodput")} aria-pressed={metric === "goodput"}>goodput</button>
          <span style={{ width: 1, height: "1rem", background: "#ffffff14", margin: "0 0.15rem" }} />
          <button type="button" onClick={() => setLogScale((v) => !v)} style={chip(false)} title="Toggle log / linear axis">
            {logScale ? "log" : "linear"}
          </button>
          <span style={{ width: 1, height: "1rem", background: "#ffffff14", margin: "0 0.15rem" }} />
          {COMPARISON_WINDOWS.map((w) => (
            <button type="button" key={w.hours} onClick={() => setHours(w.hours)} style={chip(hours === w.hours)} aria-pressed={hours === w.hours}>{w.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "0.6rem" }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 110 }}>
          <span style={filterLabel}>Country</span>
          <select style={filterSelect} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 130 }}>
          <span style={filterLabel}>Protocol</span>
          <select style={filterSelect} value={protocol} onChange={(e) => setProtocol(e.target.value)}>
            <option value="">All</option>
            {protocols.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 130 }}>
          <span style={filterLabel}>Provider</span>
          <select style={filterSelect} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">All</option>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {culledCount > 0 && (
          <button
            type="button"
            onClick={() => setShowCulled((v) => !v)}
            style={chip(showCulled)}
            aria-pressed={showCulled}
            title="Promotions whose promoted track has since been disabled (most commonly culled by a later promotion in the same market). They carry no traffic, so their cards are hidden by default."
          >
            {showCulled ? `hide culled (${culledCount})` : `show culled (${culledCount})`}
          </button>
        )}
        {hasFilters && (
          <button type="button" onClick={() => { setCountry(""); setProtocol(""); setProvider(""); }} style={chip(false)}>Clear</button>
        )}
      </div>

      {error ? (
        <div style={{ ...mono, fontSize: "0.65rem", color: "var(--accent-danger, #ff4060)" }}>{error}</div>
      ) : !data || (isLoading && promotions.length === 0) ? (
        <div style={{ ...mono, fontSize: "0.65rem", color: "var(--text-muted)" }}>Loading promotions…</div>
      ) : promotions.length === 0 ? (
        <div style={{ ...mono, fontSize: "0.65rem", color: "var(--text-muted)" }}>
          No live promoted experiments{hasFilters ? " for the selected filters" : ""}.
          {!showCulled && culledCount > 0 ? ` ${culledCount} culled ${culledCount === 1 ? "promotion is" : "promotions are"} hidden — use the "show culled" toggle.` : ""}
        </div>
      ) : (
        <>
          {trafficError && (
            <div style={{ ...mono, fontSize: "0.6rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>{metricNoun === "goodput" ? "Goodput" : "Traffic"} unavailable: {trafficError}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(26rem, 1fr))", gap: "1rem" }}>
            {promotions.map((p) => (
              <PromotionTrafficCard
                key={p.experimentId}
                point={p}
                seriesByTrackCountry={seriesByTrackCountry}
                startMs={startMs}
                endMs={endMs}
                logScale={logScale}
                promotedDisabled={isTrackDisabled(p.promotedTrackName)}
                originalDisabled={isTrackDisabled(p.originalTrackName)}
              />
            ))}
          </div>
          <div style={{ ...mono, fontSize: "0.55rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            {promotions.length} {promotions.length === 1 ? "promotion" : "promotions"}
            {!showCulled && culledCount > 0 ? ` · ${culledCount} culled hidden` : ""}
            {trafficLoading ? ` · loading ${metricNoun}…` : ""}
          </div>
        </>
      )}
    </div>
  );
}

// ── Top-level tab content ──

export default function ExperimentsOverview({ enabled }: { enabled: boolean }) {
  const [view, setView] = useState<"experiments" | "settings">("experiments");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Status filter driven by the pipeline strip. Retired and aborted experiments
  // are hidden by default — together they're the bulk of terminal history and
  // rarely what you're after; the strip's counts still show them.
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(() => new Set(["retired", "aborted"]));
  const { experiments, pipeline, isLoading, hasLoaded, error, refresh } = useExperiments(enabled);
  const settings = useExperimentSettings(enabled);

  const toggleStatus = useCallback((status: string) => {
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }, []);

  const visibleExperiments = useMemo(
    () => experiments.filter((e) => !hiddenStatuses.has(e.status)),
    [experiments, hiddenStatuses],
  );

  // Surface a banner when the core automation workers are paused.
  const automationOff = useMemo(() => {
    const ed = settings.settings?.editable ?? [];
    const get = (k: string) => ed.find((s) => s.key === k)?.value === true;
    if (ed.length === 0) return false;
    return !(get("experiment_proposer_enabled") && get("experiment_evaluator_enabled"));
  }, [settings.settings]);

  const tabBtn = (v: "experiments" | "settings"): CSSProperties => ({
    ...mono, fontSize: "0.6rem", padding: "0.25rem 0.7rem", borderRadius: "var(--radius-sm)",
    cursor: "pointer", userSelect: "none", textTransform: "uppercase", letterSpacing: "0.05em",
    background: view === v ? "var(--accent-primary-dim)" : "#ffffff08",
    color: view === v ? "var(--accent-primary)" : "var(--text-muted)",
    border: `1px solid ${view === v ? "#00e5c830" : "#ffffff10"}`,
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", padding: "0.75rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
        <div onClick={() => setView("experiments")} style={tabBtn("experiments")}>Experiments</div>
        <div onClick={() => setView("settings")} style={tabBtn("settings")}>Settings</div>
      </div>

      {automationOff && view === "experiments" && (
        <div style={{ ...mono, fontSize: "0.62rem", color: "#e0a060", background: "#f0a03012", border: "1px solid #f0a03030", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.75rem" }}>
          Automation is paused — the proposer and/or evaluator are disabled. Enable them in <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => setView("settings")}>Settings</span>.
        </div>
      )}

      {view === "settings" ? (
        <ExperimentSettings settings={settings.settings} isLoading={settings.isLoading} error={settings.error} onSaved={settings.reload} />
      ) : (
        <>
          {error && (
            <div style={{ ...mono, fontSize: "0.65rem", color: "var(--accent-danger, #ff4060)", background: "#ff406012", border: "1px solid #ff406030", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.75rem" }}>{error}</div>
          )}
          <PipelineStrip pipeline={pipeline} hiddenStatuses={hiddenStatuses} onToggle={toggleStatus} />
          <PromotionImpactLedger enabled={enabled && view === "experiments"} />
          <PromotedTraffic enabled={enabled && view === "experiments"} />
          {isLoading && !hasLoaded ? (
            <div style={{ ...mono, color: "var(--text-muted)", padding: "1rem" }}>Loading experiments…</div>
          ) : (
            <ExperimentsTable experiments={visibleExperiments} selectedId={selectedId} onSelect={setSelectedId} onChanged={refresh} />
          )}
        </>
      )}
    </div>
  );
}
