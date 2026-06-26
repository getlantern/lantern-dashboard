import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildExperimentTrackQuery,
  fetchSigNozMetrics,
  type ExperimentDetail,
  type ExperimentStratum,
  type ExperimentSummary,
  type ExperimentPipeline,
} from "../api/client";
import { useExperiments, useExperimentDetail, useExperimentSettings } from "../hooks/useExperiments";
import { useAuth } from "../hooks/useAuth";
import ExperimentSettings from "./ExperimentSettings";

const CHALLENGER_COLOR = "#00e5c8";
const CONTROL_COLOR = "#f0a030";

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

function PipelineStrip({ pipeline }: { pipeline: ExperimentPipeline | null }) {
  if (!pipeline) return null;
  return (
    <div style={card}>
      <div style={sectionLabel}>Lifecycle pipeline</div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {pipeline.order.map((status) => {
          const count = pipeline.counts[status] ?? 0;
          const color = STATUS_COLORS[status] || "#8890a0";
          const active = count > 0;
          return (
            <div key={status} style={{
              flex: "1 1 6rem", minWidth: "5.5rem",
              borderRadius: "var(--radius-sm)",
              border: `1px solid ${active ? `${color}40` : "#ffffff0d"}`,
              background: active ? `${color}12` : "#ffffff05",
              padding: "0.5rem 0.6rem",
            }}>
              <div style={{ ...mono, fontSize: "1.3rem", fontWeight: 600, color: active ? color : "#5a6472" }}>{count}</div>
              <div style={{ ...mono, fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{status}</div>
            </div>
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
        // success rate per (track, ts) = callbacks / (callbacks + expired)
        const expiredByTrackTs = new Map<string, Map<number, number>>();
        for (const s of ex) {
          const m = new Map<number, number>();
          for (const p of s.points) m.set(p.ts, p.value);
          expiredByTrackTs.set(s.key, m);
        }
        const byTs = new Map<number, Record<string, number>>();
        const seenKeys = new Set<string>();
        for (const s of cb) {
          seenKeys.add(s.key);
          const exMap = expiredByTrackTs.get(s.key);
          for (const p of s.points) {
            const expired = exMap?.get(p.ts) ?? 0;
            const denom = p.value + expired;
            const rate = denom > 0 ? (p.value / denom) * 100 : 0;
            if (!byTs.has(p.ts)) byTs.set(p.ts, { ts: p.ts });
            byTs.get(p.ts)![s.key] = +rate.toFixed(1);
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

// ── Detail panel (loaded on row expand) ──

function ExperimentDetailPanel({ id }: { id: number }) {
  const { detail, isLoading, error } = useExperimentDetail(id);

  if (isLoading && !detail) return <div style={{ ...mono, color: "var(--text-muted)", padding: "0.75rem" }}>Loading stats…</div>;
  if (error) return <div style={{ ...mono, color: "var(--accent-danger, #ff4060)", padding: "0.75rem" }}>{error}</div>;
  if (!detail) return null;

  const challenger = detail.challengerTrackName || "challenger";
  const control = detail.controlTrackName || "control";
  const startMs = detail.windowStart ? Date.parse(detail.windowStart) : 0;
  const endMs = detail.windowEnd ? Date.parse(detail.windowEnd) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", padding: "0.75rem 0.25rem" }}>
      {detail.statsError && (
        <div style={{ ...mono, fontSize: "0.62rem", color: "#e0a060", background: "#f0a03012", border: "1px solid #f0a03030", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.7rem" }}>
          {detail.statsError}
        </div>
      )}
      <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap" }}>
        <DecisionCard detail={detail} />
        <GuardrailsCard detail={detail} />
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

function ExperimentsTable({ experiments, selectedId, onSelect }: {
  experiments: ExperimentSummary[]; selectedId: number | null; onSelect: (id: number | null) => void;
}) {
  if (experiments.length === 0) {
    return <div style={{ ...mono, color: "var(--text-muted)", padding: "1rem" }}>No experiments yet.</div>;
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
        <div>ID</div><div>Status</div><div>Region / Location</div><div>Challenger → Control</div><div>Protocol</div><div>Decision</div><div>Gathering</div>
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
                <span style={{ color: "var(--text-primary)" }}>{e.regionName || `r${e.regionId}`}</span>
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
            {expanded && <ExperimentDetailPanel id={e.id} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Top-level tab content ──

export default function ExperimentsOverview({ enabled }: { enabled: boolean }) {
  const [view, setView] = useState<"experiments" | "settings">("experiments");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { experiments, pipeline, isLoading, hasLoaded, error } = useExperiments(enabled);
  const settings = useExperimentSettings(enabled);

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
          <PipelineStrip pipeline={pipeline} />
          {isLoading && !hasLoaded ? (
            <div style={{ ...mono, color: "var(--text-muted)", padding: "1rem" }}>Loading experiments…</div>
          ) : (
            <ExperimentsTable experiments={experiments} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </>
      )}
    </div>
  );
}
