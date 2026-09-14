// Leaderboards and the evidence under them. Rank and role are only comparable
// inside one compatibility key — a runtime cohort — so the table groups by it
// rather than presenting one flat ranking that would compare artifacts no
// single box could both run.
import { useEffect, useState } from "react";

import {
  fetchOverlayLeaderboard,
  fetchOverlayObservations,
  type OverlayLeaderboardEntry,
  type OverlayObservation,
  type OverlayTechnique,
} from "../api/overlays";
import { Badge, Empty, ErrorNote, Loading } from "./OverlayUI";
import {
  bytesPerSec,
  card,
  chipStyle,
  inputStyle,
  mono,
  muted,
  sectionLabel,
  shortID,
  since,
  td,
  th,
} from "./overlayStyles";

function roleColor(role: string): string {
  switch (role) {
    case "champion":
      return "#20e070";
    case "challenger":
      return "#64b4ff";
    case "previous_known_good":
      return "#ffb432";
    default:
      return "#8890a0";
  }
}

export default function OverlayLeaderboards({
  enabled,
  techniques,
  countries,
}: {
  enabled: boolean;
  techniques: OverlayTechnique[];
  countries: string[];
}) {
  const [country, setCountry] = useState(countries[0] ?? "");
  const [technique, setTechnique] = useState(techniques[0]?.key ?? "");
  const [entries, setEntries] = useState<OverlayLeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !country || !technique) return;
    let cancelled = false;
    fetchOverlayLeaderboard(country, technique)
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      });
    return () => { cancelled = true; };
  }, [enabled, country, technique]);

  const cohorts = new Map<string, OverlayLeaderboardEntry[]>();
  for (const entry of entries ?? []) {
    const list = cohorts.get(entry.compatibilityKey) ?? [];
    list.push(entry);
    cohorts.set(entry.compatibilityKey, list);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={card}>
        <div style={sectionLabel}>Population</div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
          {countries.map((code) => (
            <button key={code} type="button" style={chipStyle(country === code)} onClick={() => setCountry(code)}>
              {code}
            </button>
          ))}
          <input
            value={country}
            placeholder="country"
            onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
            style={{ ...inputStyle, width: 100 }}
          />
          <span style={{ width: "1rem" }} />
          {techniques.map((t) => (
            <button key={t.key} type="button" style={chipStyle(technique === t.key)} onClick={() => setTechnique(t.key)}>
              {t.key}
            </button>
          ))}
        </div>
        <div style={{ ...muted, marginTop: "0.5rem" }}>
          Scores are the controller's own published evidence, rebuilt on a fixed cadence from decayed observations — not a
          re-derivation in the browser. An entry only holds the champion role while its evidence is fresh.
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!entries && !error && country && technique && <Loading what="the leaderboard" />}
      {entries && entries.length === 0 && <Empty what="ranked artifacts for this population" />}

      {[...cohorts.entries()].map(([cohort, rows]) => (
        <div key={cohort} style={{ ...card, overflowX: "auto" }}>
          <div style={sectionLabel}>Cohort {cohort}</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Rank</th>
                <th style={th}>Role</th>
                <th style={th}>Artifact</th>
                <th style={th}>Reach</th>
                <th style={th}>Stability</th>
                <th style={th}>Latency</th>
                <th style={th}>Throughput</th>
                <th style={th}>Cost</th>
                <th style={th}>Confidence</th>
                <th style={th}>Samples</th>
                <th style={th}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr
                  key={entry.artifactRevisionId}
                  onClick={() => setSelected(selected === entry.artifactRevisionId ? null : entry.artifactRevisionId)}
                  style={{ cursor: "pointer", background: selected === entry.artifactRevisionId ? "#ffffff06" : undefined }}
                >
                  <td style={td}>{entry.rank}</td>
                  <td style={td}><Badge text={entry.role} color={roleColor(entry.role)} /></td>
                  <td style={td} title={entry.artifactRevisionId}>{shortID(entry.artifactRevisionId)}</td>
                  <td style={td}>{(entry.reachabilityScore * 100).toFixed(1)}%</td>
                  <td style={td}>{(entry.stabilityScore * 100).toFixed(1)}%</td>
                  <td style={td}>{entry.latencyMs ? `${entry.latencyMs.toFixed(0)}ms` : "—"}</td>
                  <td style={td}>{bytesPerSec(entry.throughputBytesPerSecond)}</td>
                  <td style={td}>{entry.resourceCost.toFixed(2)}</td>
                  <td style={td}>{(entry.confidence * 100).toFixed(0)}%</td>
                  <td style={td}>{entry.sampleCount}</td>
                  <td style={td}>{since(entry.evidenceFreshAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Keyed so selecting a different artifact remounts with empty state
          rather than briefly showing the previous artifact's observations. */}
      {selected && <Observations key={`${selected}/${country}`} artifact={selected} country={country} />}
    </div>
  );
}

// Observations are the paired candidate/control rows the ranking is computed
// from. The pairing is the point: a candidate that fails where the control also
// failed says nothing about the technique, and the server marks those
// attribution-invalid rather than scoring them.
function Observations({ artifact, country }: { artifact: string; country: string }) {
  const [rows, setRows] = useState<OverlayObservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOverlayObservations(artifact, { country: country || undefined, limit: 200 })
      .then((data) => { if (!cancelled) setRows(data.observations); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "failed"); });
    return () => { cancelled = true; };
  }, [artifact, country]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!rows) return <Loading what="observations" />;

  return (
    <div style={{ ...card, overflowX: "auto" }}>
      <div style={sectionLabel}>Observations for {shortID(artifact)} ({rows.length})</div>
      <div style={{ ...mono, marginBottom: "0.4rem" }}>{artifact}</div>
      {rows.length === 0 ? (
        <Empty what="observations" />
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Observed</th>
              <th style={th}>Source</th>
              <th style={th}>Target / observed country</th>
              <th style={th}>ASN</th>
              <th style={th}>Candidate</th>
              <th style={th}>Cand. latency</th>
              <th style={th}>Cand. throughput</th>
              <th style={th}>Control</th>
              <th style={th}>Ctrl latency</th>
              <th style={th}>Attribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={td}>{since(row.observedAt)}</td>
                <td style={td}>{row.source}</td>
                <td style={td}>{row.targetCountryCode} / {row.observedCountryCode || "—"}</td>
                <td style={td}>{row.asn ?? "—"}</td>
                <td style={td}>
                  <Badge
                    text={row.candidateOutcome}
                    color={row.candidateOutcome === "success" ? "#20e070" : row.candidateOutcome === "failure" ? "#ff4060" : "#8890a0"}
                  />
                  {row.candidateFailureCode && <span style={{ ...muted, marginLeft: "0.3rem" }}>{row.candidateFailureCode}</span>}
                </td>
                <td style={td}>{row.candidateLatencyMs != null ? `${row.candidateLatencyMs.toFixed(0)}ms` : "—"}</td>
                <td style={td}>{row.candidateThroughputBytesPerSecond ? bytesPerSec(row.candidateThroughputBytesPerSecond) : "—"}</td>
                <td style={td}>
                  <Badge
                    text={row.controlOutcome}
                    color={row.controlOutcome === "success" ? "#20e070" : row.controlOutcome === "failure" ? "#ff4060" : "#8890a0"}
                  />
                </td>
                <td style={td}>{row.controlLatencyMs != null ? `${row.controlLatencyMs.toFixed(0)}ms` : "—"}</td>
                <td style={td}>
                  {row.attributionValid ? (
                    <Badge text="valid" color="#20e070" />
                  ) : (
                    <Badge text={row.excludedReason || "excluded"} color="#ffb432" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
