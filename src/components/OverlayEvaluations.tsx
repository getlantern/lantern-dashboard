// Evaluations and the box pools that run them. An evaluation is one artifact
// measured in one country from residential exits; the pool is the set of boxes
// it can be placed on, and a pool with no clean reserve is a pool that cannot
// rotate away from a burned address.
import { useState } from "react";

import { createOverlayEvaluation, type OverlayEvalPoolBox, type OverlayEvaluation } from "../api/overlays";
import { ArtifactRef } from "./OverlayArtifactViewer";
import { Badge, Empty, ErrorNote, JSONBlock, Loading, Tile, TileRow } from "./OverlayUI";
import {
  buttonStyle,
  card,
  chipStyle,
  evaluationStatusColor,
  inputStyle,
  mono,
  muted,
  sectionLabel,
  shortID,
  since,
  td,
  th,
} from "./overlayStyles";
import { useOverlayEvaluations } from "../hooks/useOverlays";

const STATUSES = ["pending", "running", "succeeded", "failed", "cancelled"];

export default function OverlayEvaluations({ enabled }: { enabled: boolean }) {
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, hasLoaded, error, refresh } = useOverlayEvaluations(enabled, country, status);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (isLoading && !hasLoaded) return <Loading what="evaluations" />;
  if (!data) return null;

  const ready = data.pool.filter((box) => box.readiness === "ready").length;
  const idle = data.pool.filter((box) => box.neutralIdle).length;
  const leased = data.pool.filter((box) => box.leasedBy).length;
  const draining = data.pool.filter((box) => box.draining).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={card}>
        <div style={sectionLabel}>Evaluation pools</div>
        <TileRow>
          <Tile label="pool boxes" value={data.pool.length} />
          <Tile label="ready" value={ready} color="#20e070" />
          <Tile label="leased to an evaluation" value={leased} color="#64b4ff" />
          <Tile label="neutral idle" value={idle} sub="assignable right now" />
          <Tile label="draining" value={draining} color="#ffb432" />
        </TileRow>
        <div style={{ ...muted, marginTop: "0.5rem" }}>
          Neutral-idle boxes are the pool's clean-address reserve. When it hits zero, retiring a burned box leaves nothing
          to move the next evaluation onto and rotation stalls exactly when the censor is most active.
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={country}
            placeholder="country"
            onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
            style={{ ...inputStyle, width: 120 }}
          />
          <button type="button" style={chipStyle(status === "")} onClick={() => setStatus("")}>all</button>
          {STATUSES.map((s) => (
            <button key={s} type="button" style={chipStyle(status === s)} onClick={() => setStatus(status === s ? "" : s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={sectionLabel}>Evaluations ({data.evaluations.length})</div>
        {data.evaluations.length === 0 ? (
          <Empty what="evaluations" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Evaluation</th>
                <th style={th}>Country</th>
                <th style={th}>Technique</th>
                <th style={th}>Artifact</th>
                <th style={th}>Status</th>
                <th style={th}>Box</th>
                <th style={th}>Started</th>
                <th style={th}>Completed</th>
              </tr>
            </thead>
            <tbody>
              {data.evaluations.map((evaluation) => (
                <EvaluationRow
                  key={evaluation.id}
                  evaluation={evaluation}
                  expanded={expanded === evaluation.id}
                  onToggle={() => setExpanded(expanded === evaluation.id ? null : evaluation.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={sectionLabel}>Pool boxes ({data.pool.length})</div>
        {data.pool.length === 0 ? <Empty what="pool boxes" /> : <PoolTable pool={data.pool} />}
      </div>

      <NewEvaluation onCreated={refresh} />
    </div>
  );
}

function EvaluationRow({
  evaluation,
  expanded,
  onToggle,
}: {
  evaluation: OverlayEvaluation;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", background: expanded ? "#ffffff06" : undefined }}>
        <td style={td} title={evaluation.id}>{shortID(evaluation.id)}</td>
        <td style={td}>{evaluation.countryCode}</td>
        <td style={td}>{evaluation.techniqueKey}</td>
        <td style={td}><ArtifactRef id={evaluation.artifactRevisionId} sha={evaluation.contentSha256} technique={evaluation.techniqueKey} /></td>
        <td style={td}><Badge text={evaluation.status} color={evaluationStatusColor(evaluation.status)} /></td>
        <td style={td} title={evaluation.routeId}>{evaluation.routeId ? shortID(evaluation.routeId) : "—"}</td>
        <td style={td}>{since(evaluation.startedAt)}</td>
        <td style={td}>{since(evaluation.completedAt)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ ...td, whiteSpace: "normal", background: "#ffffff04" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))", gap: "1rem", padding: "0.5rem 0" }}>
              <div>
                <div style={sectionLabel}>Identity</div>
                <div style={mono}>{evaluation.id}</div>
                <div style={muted}>artifact <ArtifactRef id={evaluation.artifactRevisionId} sha={evaluation.contentSha256} technique={evaluation.techniqueKey} full /></div>
                <div style={muted}>sha256 {evaluation.contentSha256}</div>
                <div style={muted}>created by {evaluation.createdBy} {since(evaluation.createdAt)}</div>
                {evaluation.holderId && (
                  <div style={muted}>
                    lease held by {evaluation.holderId}, expires {since(evaluation.leaseExpiresAt)}
                  </div>
                )}
              </div>
              <div>
                <div style={sectionLabel}>Acceptance criteria</div>
                <JSONBlock value={evaluation.acceptanceCriteria} />
              </div>
              <div>
                <div style={sectionLabel}>Result summary</div>
                <JSONBlock value={evaluation.resultSummary} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PoolTable({ pool }: { pool: OverlayEvalPoolBox[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={th}>Route</th>
          <th style={th}>Country</th>
          <th style={th}>Technique</th>
          <th style={th}>Readiness</th>
          <th style={th}>Runtime</th>
          <th style={th}>State</th>
          <th style={th}>Heartbeat</th>
          <th style={th}>Joined</th>
          <th style={th}>Lease</th>
        </tr>
      </thead>
      <tbody>
        {pool.map((box) => (
          <tr key={box.routeId}>
            <td style={td} title={box.routeId}>{shortID(box.routeId)}</td>
            <td style={td}>{box.countryCode}</td>
            <td style={td}>{box.techniqueKey}</td>
            <td style={td}>
              <Badge text={box.readiness} color={box.readiness === "ready" ? "#20e070" : "#ffb432"} />
            </td>
            <td style={td}>{box.runtimeInstalled ? "installed" : "missing"}</td>
            <td style={td}>
              <span style={{ display: "inline-flex", gap: "0.25rem" }}>
                {box.neutralIdle && <Badge text="idle" color="#8890a0" />}
                {box.hasDeployment && <Badge text="deployed" color="#64b4ff" />}
                {box.draining && <Badge text="draining" color="#ffb432" />}
                {box.quarantinedAt && <Badge text="quarantined" color="#ff4060" />}
                {box.deprecatedAt && <Badge text="deprecated" color="#ff4060" />}
              </span>
            </td>
            <td style={td}>{since(box.lastHeartbeatAt)}</td>
            <td style={td}>{since(box.joinedPoolAt)}</td>
            <td style={td}>{box.leasedBy ? since(box.leaseExpiresAt) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NewEvaluation({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [techniqueKey, setTechniqueKey] = useState("");
  const [artifact, setArtifact] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [criteria, setCriteria] = useState('{\n  "min_samples": 20\n}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div style={card}>
        <button type="button" style={buttonStyle(false)} onClick={() => setOpen(true)}>Queue evaluation</button>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={sectionLabel}>Queue evaluation</div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <input value={techniqueKey} placeholder="technique" onChange={(e) => setTechniqueKey(e.target.value)} style={{ ...inputStyle, width: 160 }} />
        <input value={artifact} placeholder="artifact revision id" onChange={(e) => setArtifact(e.target.value)} style={{ ...inputStyle, width: 320 }} />
        <input value={countryCode} placeholder="country" onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))} style={{ ...inputStyle, width: 100 }} />
      </div>
      <textarea
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        style={{ ...inputStyle, width: "100%", minHeight: 100, whiteSpace: "pre" }}
      />
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.4rem" }}>
        <button
          type="button"
          disabled={busy}
          style={buttonStyle(busy)}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await createOverlayEvaluation({
                techniqueKey,
                artifactRevisionId: artifact,
                countryCode,
                acceptanceCriteria: JSON.parse(criteria),
              });
              setOpen(false);
              await onCreated();
            } catch (err) {
              setError(err instanceof Error ? err.message : "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          queue
        </button>
        <button type="button" style={buttonStyle(false)} onClick={() => setOpen(false)}>cancel</button>
        {error && <span style={{ ...muted, color: "#ff4060" }}>{error}</span>}
      </div>
      <div style={{ ...muted, marginTop: "0.4rem" }}>
        A queued evaluation waits for the pool controller to place it on a box in that country; it never picks a box
        itself. Acceptance criteria are technique-owned and stored verbatim.
      </div>
    </div>
  );
}
