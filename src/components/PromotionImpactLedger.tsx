import { useMemo, useState, type CSSProperties } from "react";
import { type PromotionImpactRow } from "../api/client";
import { usePromotionImpact } from "../hooks/useExperiments";

// Promotion impact ledger: did each promotion move its target MARKET, or did
// the cohort win just substitute experiment-track share for incumbent share?
// One terminal row per promotion, written by the backend's hourly worker:
// market-wide goodput p50 + probe ok-rate over a window before vs after the
// promotion, diff-in-differenced against the median of non-target markets.
// Mirrors GET /v1/dashboard/experiments/impact
// (cmd/api/dashboard_experiments_handler.go).

const PROMOTED_COLOR = "#00e5c8";

const OUTCOME_META: Record<string, { label: string; color: string; detail: string }> = {
  market_win: { label: "Market win", color: "#20e070", detail: "A judged axis improved past its threshold and none regressed — the promotion moved the market." },
  market_regression: { label: "Regression", color: "#ff4060", detail: "A judged axis regressed past its threshold after the promotion." },
  no_market_effect: { label: "No effect", color: "#8890a0", detail: "Every judged axis stayed within its threshold — the cohort win was substitution." },
  inconclusive: { label: "Inconclusive", color: "#e0a060", detail: "No judgeable axis: sample floors unmet or the control basket was too small." },
  no_data: { label: "No data", color: "#667080", detail: "Aged out unmeasured — the windows predate the goodput metric or SigNoz retention." },
};

function outcomeMeta(outcome: string): { label: string; color: string; detail: string } {
  // Own-property check: the token comes from the backend, and a plain object
  // lookup would resolve inherited keys ("toString") to junk.
  if (Object.prototype.hasOwnProperty.call(OUTCOME_META, outcome)) return OUTCOME_META[outcome];
  return { label: outcome || "unknown", color: "#8890a0", detail: `Unrecognized outcome token: ${outcome}` };
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

const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "0.7rem" };

// formatEffect renders a diff-in-diff effect: goodput as a signed percentage,
// ok-rate as signed percentage points. Undefined means the axis wasn't judged.
function formatEffect(v: number | undefined, unit: "%" | "pp"): string {
  if (v === undefined) return "—";
  const pct = v * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}${unit}`;
}

// effectColor grades a judged effect by sign; unjudged axes stay muted.
function effectColor(v: number | undefined): string {
  if (v === undefined) return "var(--text-muted)";
  if (v > 0) return "#20e070";
  if (v < 0) return "#ff4060";
  return "var(--text-secondary)";
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const m = outcomeMeta(outcome);
  return (
    <span
      title={m.detail}
      style={{
        ...mono, fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.05em",
        padding: "0.1rem 0.4rem", borderRadius: "3px",
        color: m.color, background: `${m.color}1a`, border: `1px solid ${m.color}40`,
        whiteSpace: "nowrap",
      }}
    >{m.label}</span>
  );
}

// TotalsStrip headlines the win/substitution/regression ratio across the ledger.
function TotalsStrip({ totals }: { totals: Record<string, number> }) {
  const order = ["market_win", "no_market_effect", "market_regression", "inconclusive", "no_data"];
  const known = order.filter((k) => (totals[k] ?? 0) > 0);
  // Outcomes the backend added that this build doesn't know yet still count.
  const unknown = Object.keys(totals).filter((k) => !order.includes(k) && totals[k] > 0).sort();
  const keys = [...known, ...unknown];
  if (keys.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
      {keys.map((k) => {
        const m = outcomeMeta(k);
        return (
          <div key={k} title={m.detail} style={{
            flex: "1 1 7rem", minWidth: "6.5rem",
            borderRadius: "var(--radius-sm)", border: `1px solid ${m.color}30`,
            background: `${m.color}10`, padding: "0.5rem 0.6rem",
          }}>
            <div style={{ ...mono, fontSize: "1.3rem", fontWeight: 600, color: m.color }}>{totals[k]}</div>
            <div style={{ ...mono, fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>{m.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// BasketTable lists the control markets behind the row's counterfactual medians.
function BasketTable({ row }: { row: PromotionImpactRow }) {
  const basket = row.detail?.basket ?? [];
  if (basket.length === 0) return null;
  const cell: CSSProperties = { ...mono, fontSize: "0.58rem", padding: "0.15rem 0.5rem 0.15rem 0", color: "var(--text-secondary)" };
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ ...mono, fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
        Control basket ({basket.length} markets{row.detail?.excluded?.length ? `; excluded: ${row.detail.excluded.join(", ")}` : ""})
      </div>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Market", "p50 before", "p50 after", "Δ goodput", "ok before", "ok after", "Δ ok-rate"].map((h) => (
              <th key={h} style={{ ...cell, color: "var(--text-muted)", textAlign: "left", fontWeight: 400 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {basket.map((b) => (
            <tr key={b.country}>
              <td style={{ ...cell, color: "var(--text-primary)" }}>{b.country}</td>
              <td style={cell}>{b.goodputP50Before !== undefined ? b.goodputP50Before.toFixed(0) : "—"}</td>
              <td style={cell}>{b.goodputP50After !== undefined ? b.goodputP50After.toFixed(0) : "—"}</td>
              <td style={cell}>{b.goodputLogRatio !== undefined ? formatEffect(Math.expm1(b.goodputLogRatio), "%") : "—"}</td>
              <td style={cell}>{b.okRateBefore !== undefined ? `${(b.okRateBefore * 100).toFixed(1)}%` : "—"}</td>
              <td style={cell}>{b.okRateAfter !== undefined ? `${(b.okRateAfter * 100).toFixed(1)}%` : "—"}</td>
              <td style={cell}>{b.okRateDelta !== undefined ? formatEffect(b.okRateDelta, "pp") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function windowSpan(start: string, end: string): string {
  const fmt = (s: string) => new Date(s).toLocaleDateString([], { month: "short", day: "numeric" });
  return `${fmt(start)} → ${fmt(end)}`;
}

// ImpactDetailPanel expands a ledger row: the full reason, both windows, the
// target market's raw values behind each effect, and the control basket.
function ImpactDetailPanel({ row }: { row: PromotionImpactRow }) {
  const label: CSSProperties = { ...mono, fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" };
  const val: CSSProperties = { ...mono, fontSize: "0.65rem", color: "var(--text-secondary)" };
  const gw = row.detail?.goodputWindows;
  return (
    <div style={{ padding: "0.6rem 0.75rem 0.8rem", borderBottom: "1px solid #ffffff08", background: "#ffffff05" }}>
      <div style={{ ...mono, fontSize: "0.62rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "0.5rem" }}>{row.reason}</div>
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <div style={label}>Before window</div>
          <div style={val}>{windowSpan(row.beforeStart, row.beforeEnd)}</div>
        </div>
        <div>
          <div style={label}>After window</div>
          <div style={val}>{windowSpan(row.afterStart, row.afterEnd)}</div>
        </div>
        {gw && (
          <div>
            <div style={label}>Goodput sub-windows (bucket-layout clamp)</div>
            <div style={val}>{windowSpan(gw.beforeStart, gw.beforeEnd)} vs {windowSpan(gw.afterStart, gw.afterEnd)}</div>
          </div>
        )}
        <div>
          <div style={label}>Target goodput p50</div>
          <div style={val}>
            {row.tgtGoodputP50Before !== undefined ? row.tgtGoodputP50Before.toFixed(0) : "—"} → {row.tgtGoodputP50After !== undefined ? row.tgtGoodputP50After.toFixed(0) : "—"}
            <span style={{ color: "var(--text-muted)" }}> (relative scale — the histogram clips)</span>
          </div>
        </div>
        <div>
          <div style={label}>Target ok-rate</div>
          <div style={val}>
            {row.tgtOkRateBefore !== undefined ? `${(row.tgtOkRateBefore * 100).toFixed(1)}%` : "—"} → {row.tgtOkRateAfter !== undefined ? `${(row.tgtOkRateAfter * 100).toFixed(1)}%` : "—"}
          </div>
        </div>
        <div>
          <div style={label}>Measured</div>
          <div style={val}>{new Date(row.measuredAt).toLocaleString()}</div>
        </div>
      </div>
      <BasketTable row={row} />
    </div>
  );
}

const colTemplate = "3rem 6.5rem 5rem 1fr 6rem 6rem 4.5rem 6.5rem";

export default function PromotionImpactLedger({ enabled }: { enabled: boolean }) {
  const { data, isLoading, error } = usePromotionImpact(enabled);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const headerStyle: CSSProperties = {
    display: "grid", gridTemplateColumns: colTemplate, gap: "0.5rem",
    padding: "0.4rem 0.75rem", ...mono, fontSize: "0.55rem", textTransform: "uppercase",
    letterSpacing: "0.05em", color: "var(--text-muted)", borderBottom: "1px solid #ffffff10",
  };

  return (
    <div style={card}>
      <div style={{ ...sectionLabel, marginBottom: "0.15rem" }}>Promotion impact ledger</div>
      <div style={{ ...mono, fontSize: "0.55rem", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
        Did the promotion move its target market, or did the cohort win just substitute experiment-track
        share for incumbent share? Market-wide goodput p50 and probe ok-rate, before vs after each
        promotion, diff-in-diff against the median of non-target markets. One terminal row per promotion.
      </div>

      {error ? (
        <div style={{ ...mono, fontSize: "0.65rem", color: "var(--accent-danger, #ff4060)" }}>{error}</div>
      ) : isLoading && rows.length === 0 ? (
        <div style={{ ...mono, fontSize: "0.65rem", color: "var(--text-muted)" }}>Loading impact ledger…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...mono, fontSize: "0.65rem", color: "var(--text-muted)" }}>
          No impact rows yet — the ledger fills in as promotions' after-windows elapse (and backfills once
          promotion_impact_enabled is on).
        </div>
      ) : (
        <>
          <TotalsStrip totals={data?.totals ?? {}} />
          <div style={headerStyle}>
            <div>ID</div><div>Outcome</div><div>Market</div><div>Promoted track</div>
            <div>Goodput DiD</div><div>Ok-rate DiD</div><div>Basket</div><div>Promoted at</div>
          </div>
          {rows.map((r) => {
            const expanded = expandedId === r.experimentId;
            return (
              <div key={r.experimentId}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : r.experimentId)}
                  aria-expanded={expanded}
                  style={{
                    display: "grid", gridTemplateColumns: colTemplate, gap: "0.5rem", alignItems: "center",
                    width: "100%", padding: "0.5rem 0.75rem", ...mono, fontSize: "0.65rem", cursor: "pointer",
                    appearance: "none", textAlign: "left",
                    background: expanded ? "#ffffff08" : "transparent",
                    border: 0, borderBottom: "1px solid #ffffff08",
                  }}
                >
                  <div style={{ color: "var(--text-muted)" }}>#{r.experimentId}</div>
                  <div><OutcomeBadge outcome={r.outcome} /></div>
                  <div style={{ color: "var(--text-primary)" }}>{r.targetCountry || "—"}</div>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: PROMOTED_COLOR }}>{r.promotedTrackName || "—"}</span>
                    <span style={{ color: "var(--text-muted)" }}>{r.protocolName ? ` · ${r.protocolName}` : ""}</span>
                  </div>
                  <div style={{ color: effectColor(r.goodputEffect) }}>{formatEffect(r.goodputEffect, "%")}</div>
                  <div style={{ color: effectColor(r.okRateEffect) }}>{formatEffect(r.okRateEffect, "pp")}</div>
                  <div style={{ color: "var(--text-secondary)" }}>{r.ctrlCountries}</div>
                  <div style={{ color: "var(--text-secondary)" }}>{new Date(r.promotedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</div>
                </button>
                {expanded && <ImpactDetailPanel row={r} />}
              </div>
            );
          })}
          <div style={{ ...mono, fontSize: "0.55rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            {rows.length} {rows.length === 1 ? "promotion" : "promotions"} measured
          </div>
        </>
      )}
    </div>
  );
}
