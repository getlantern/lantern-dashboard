// Rollouts: one row per country/technique migration, with the controls that
// drive it. Every button is a compare-and-swap on the generation the row was
// rendered from and carries a reason into the audit ledger; the safety gates
// (step ceiling, convergence, telemetry freshness, leaderboard evidence) are
// enforced by the API, so a refusal here is the same refusal `lc` would give.
import { useState } from "react";

import { advanceOverlayRollout, createOverlayRollout, type OverlayRollout } from "../api/overlays";
import { ArtifactRef } from "./OverlayArtifactViewer";
import { Badge, Empty, ErrorNote, Loading, ReasonAction } from "./OverlayUI";
import {
  bps,
  buttonStyle,
  card,
  chipStyle,
  inputStyle,
  mono,
  muted,
  rolloutStateColor,
  sectionLabel,
  shortID,
  since,
  td,
  th,
} from "./overlayStyles";
import { useOverlayRollouts } from "../hooks/useOverlays";

export default function OverlayRollouts({ enabled }: { enabled: boolean }) {
  const [country, setCountry] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, hasLoaded, error, refresh } = useOverlayRollouts(enabled, country, activeOnly);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (isLoading && !hasLoaded) return <Loading what="rollouts" />;
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={card}>
        <div style={sectionLabel}>Filters</div>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={country}
            placeholder="country (e.g. RU)"
            onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
            style={{ ...inputStyle, width: 140 }}
          />
          <button type="button" style={chipStyle(activeOnly)} onClick={() => setActiveOnly(!activeOnly)}>
            active only
          </button>
        </div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={sectionLabel}>Rollouts ({data.rollouts.length})</div>
        {data.rollouts.length === 0 ? (
          <Empty what="rollouts" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Rollout</th>
                <th style={th}>Country</th>
                <th style={th}>Technique</th>
                <th style={th}>State</th>
                <th style={th}>Box activation</th>
                <th style={th}>Client exposure</th>
                <th style={th}>Converged</th>
                <th style={th}>Gen</th>
                <th style={th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.rollouts.map((rollout) => (
                <RolloutRow
                  key={rollout.id}
                  rollout={rollout}
                  expanded={expanded === rollout.id}
                  onToggle={() => setExpanded(expanded === rollout.id ? null : rollout.id)}
                  onChanged={refresh}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewRollout onCreated={refresh} />
    </div>
  );
}

function RolloutRow({
  rollout,
  expanded,
  onToggle,
  onChanged,
}: {
  rollout: OverlayRollout;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", background: expanded ? "#ffffff06" : undefined }}>
        <td style={td} title={rollout.id}>{shortID(rollout.id)}</td>
        <td style={td}>{rollout.countryCode}</td>
        <td style={td}>{rollout.techniqueKey}</td>
        <td style={td}><Badge text={rollout.state} color={rolloutStateColor(rollout.state)} /></td>
        <td style={td}>{bps(rollout.boxActivationBasisPoints)}</td>
        <td style={td}>{bps(rollout.clientExposureBasisPoints)}</td>
        <td style={td}>{rollout.converged}/{rollout.routes}</td>
        <td style={td}>{rollout.generation}</td>
        <td style={td}>{since(rollout.updatedAt)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ ...td, whiteSpace: "normal", background: "#ffffff04" }}>
            <RolloutDetail rollout={rollout} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

function RolloutDetail({ rollout, onChanged }: { rollout: OverlayRollout; onChanged: () => Promise<void> }) {
  const [boxBps, setBoxBps] = useState(String(rollout.boxActivationBasisPoints));
  const [clientBps, setClientBps] = useState(String(rollout.clientExposureBasisPoints));

  const advance = (state: string, box: number, client: number) => (reason: string) =>
    advanceOverlayRollout({
      id: rollout.id,
      expectedGeneration: rollout.generation,
      state,
      boxActivationBasisPoints: box,
      clientExposureBasisPoints: client,
      reason,
    }).then(onChanged);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(22rem, 1fr))", gap: "1rem", padding: "0.5rem 0" }}>
      <div>
        <div style={sectionLabel}>Artifacts</div>
        <div style={mono}>target <ArtifactRef id={rollout.targetArtifactRevisionId} sha={rollout.targetContentSha256} technique={rollout.techniqueKey} full /></div>
        <div style={muted}>sha256 {rollout.targetContentSha256}</div>
        {rollout.previousArtifactRevisionId && (
          <>
            <div style={{ ...mono, marginTop: "0.3rem" }}>
              previous <ArtifactRef id={rollout.previousArtifactRevisionId} sha={rollout.previousContentSha256} technique={rollout.techniqueKey} full />
            </div>
            <div style={muted}>sha256 {rollout.previousContentSha256}</div>
          </>
        )}
        <div style={{ ...muted, marginTop: "0.4rem" }}>
          created by {rollout.createdBy} {since(rollout.createdAt)}
          {rollout.completedAt && ` · completed ${since(rollout.completedAt)}`}
        </div>
        {rollout.reason && <div style={{ ...muted, marginTop: "0.2rem" }}>reason: {rollout.reason}</div>}
        {rollout.techniqueSharesRevision && (
          <div style={{ ...muted, marginTop: "0.2rem" }}>technique shares revision {rollout.techniqueSharesRevision}</div>
        )}
      </div>

      <div>
        <div style={sectionLabel}>Move exposure</div>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.4rem" }}>
          <label style={muted}>box bps</label>
          <input value={boxBps} onChange={(e) => setBoxBps(e.target.value)} style={{ ...inputStyle, width: 90 }} />
          <label style={muted}>client bps</label>
          <input value={clientBps} onChange={(e) => setClientBps(e.target.value)} style={{ ...inputStyle, width: 90 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <ReasonAction
            label="widen"
            placeholder="why widen"
            onRun={advance("widening", Number(boxBps), Number(clientBps))}
          />
          <ReasonAction label="canary" placeholder="why canary" onRun={advance("canary", Number(boxBps), Number(clientBps))} />
          <ReasonAction label="complete" placeholder="why complete" onRun={advance("completed", Number(boxBps), Number(clientBps))} />
        </div>
        <div style={{ ...muted, marginTop: "0.4rem" }}>
          Basis points: 10000 = 100%. Widening is refused unless the fleet has converged on the current step with fresh
          telemetry and the configured ceiling allows the next one; a reduction is never gated.
        </div>
      </div>

      <div>
        <div style={sectionLabel}>Stop</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <ReasonAction label="pause" tone="danger" placeholder="why pause" onRun={advance("paused", rollout.boxActivationBasisPoints, rollout.clientExposureBasisPoints)} />
          <ReasonAction label="roll back" tone="danger" placeholder="why roll back" onRun={advance("rolled_back", 0, 0)} />
        </div>
        <div style={{ ...muted, marginTop: "0.4rem" }}>
          Pause freezes exposure where it is. Roll back returns every box to the previous artifact (or to neutral when the
          rollout has none) and drops client exposure to zero in the same step.
        </div>
      </div>
    </div>
  );
}

function NewRollout({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [techniqueKey, setTechniqueKey] = useState("");
  const [target, setTarget] = useState("");
  const [previous, setPrevious] = useState("");

  if (!open) {
    return (
      <div style={card}>
        <button type="button" style={buttonStyle(false)} onClick={() => setOpen(true)}>
          New rollout
        </button>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={sectionLabel}>New rollout</div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <input value={countryCode} placeholder="country" onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))} style={{ ...inputStyle, width: 100 }} />
        <input value={techniqueKey} placeholder="technique" onChange={(e) => setTechniqueKey(e.target.value)} style={{ ...inputStyle, width: 160 }} />
        <input value={target} placeholder="target artifact revision id" onChange={(e) => setTarget(e.target.value)} style={{ ...inputStyle, width: 320 }} />
        <input value={previous} placeholder="previous artifact revision id (optional)" onChange={(e) => setPrevious(e.target.value)} style={{ ...inputStyle, width: 320 }} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <ReasonAction
          label="create"
          placeholder="why this rollout"
          onRun={async (reason) => {
            await createOverlayRollout({
              countryCode,
              techniqueKey,
              targetArtifactRevisionId: target,
              previousArtifactRevisionId: previous || undefined,
              reason,
            });
            setOpen(false);
            await onCreated();
          }}
        />
        <button type="button" style={buttonStyle(false)} onClick={() => setOpen(false)}>
          cancel
        </button>
      </div>
      <div style={{ ...muted, marginTop: "0.4rem" }}>
        A new rollout starts at draft with zero exposure. The previous artifact is what a rollback returns boxes to — leave
        it empty only when neutral is the safe fallback.
      </div>
    </div>
  );
}
