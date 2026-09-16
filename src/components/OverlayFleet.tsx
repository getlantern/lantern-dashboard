// Per-route desired-vs-observed state. This is the panel that answers "is the
// control plane actually in control", so it shows both sides of every fence the
// controller checks: generation, snapshot digest, artifact identity, the
// agent's own heartbeat, and the drains and quarantines that hold a box back.
import { useEffect, useState, type ReactNode } from "react";

import { fetchOverlayRoute, type OverlayDeployment, type OverlayRouteDetail } from "../api/overlays";
import { ArtifactRef } from "./OverlayArtifactViewer";
import { Badge, Empty, ErrorNote, JSONBlock, Loading, Tile, TileRow } from "./OverlayUI";
import {
  card,
  chipStyle,
  convergenceColor,
  inputStyle,
  mono,
  muted,
  sectionLabel,
  shortID,
  since,
  td,
  th,
} from "./overlayStyles";
import { useOverlayDeployments } from "../hooks/useOverlays";

const CONVERGENCE_ORDER = ["converged", "pending", "stale_agent", "unreported", "rejected", "failed"] as const;

export default function OverlayFleet({ enabled }: { enabled: boolean }) {
  const [country, setCountry] = useState("");
  const [filter, setFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, hasLoaded, error } = useOverlayDeployments(enabled, country);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (isLoading && !hasLoaded) return <Loading what="the overlay fleet" />;
  if (!data) return null;

  const counts: Record<string, number> = {};
  for (const deployment of data.deployments) {
    counts[deployment.convergence] = (counts[deployment.convergence] ?? 0) + 1;
  }
  const rows = filter ? data.deployments.filter((d) => d.convergence === filter) : data.deployments;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={card}>
        <div style={sectionLabel}>Convergence</div>
        <TileRow>
          {CONVERGENCE_ORDER.map((state) => (
            <Tile key={state} label={state.replace("_", " ")} value={counts[state] ?? 0} color={convergenceColor(state)} />
          ))}
        </TileRow>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.8rem", alignItems: "center" }}>
          <input
            value={country}
            placeholder="country (e.g. RU)"
            onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
            style={{ ...inputStyle, width: 140 }}
          />
          <button type="button" style={chipStyle(filter === "")} onClick={() => setFilter("")}>
            all ({data.deployments.length})
          </button>
          {CONVERGENCE_ORDER.filter((state) => counts[state]).map((state) => (
            <button key={state} type="button" style={chipStyle(filter === state)} onClick={() => setFilter(filter === state ? "" : state)}>
              {state.replace("_", " ")} ({counts[state]})
            </button>
          ))}
        </div>
        <div style={{ ...muted, marginTop: "0.5rem" }}>
          An agent whose last heartbeat is older than {Math.round(data.maxHeartbeatAgeSeconds)}s counts as stale, and a stale
          box cannot satisfy a rollout gate however healthy its last report looked.
          {data.truncated && " Listing truncated — narrow by country."}
        </div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={sectionLabel}>Routes ({rows.length})</div>
        {rows.length === 0 ? (
          <Empty what="managed routes" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Route</th>
                <th style={th}>Country</th>
                <th style={th}>Role</th>
                <th style={th}>Convergence</th>
                <th style={th}>Technique</th>
                <th style={th}>Desired gen</th>
                <th style={th}>Observed gen</th>
                <th style={th}>Observed state</th>
                <th style={th}>Agent</th>
                <th style={th}>Heartbeat</th>
                <th style={th}>Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((deployment) => (
                <DeploymentRow
                  key={deployment.routeId}
                  deployment={deployment}
                  expanded={expanded === deployment.routeId}
                  onToggle={() => setExpanded(expanded === deployment.routeId ? null : deployment.routeId)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DeploymentRow({
  deployment,
  expanded,
  onToggle,
}: {
  deployment: OverlayDeployment;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", background: expanded ? "#ffffff06" : undefined }}>
        <td style={td} title={deployment.routeId}>{shortID(deployment.routeId)}</td>
        <td style={td}>{deployment.countryCode}</td>
        <td style={td}>{deployment.role}</td>
        <td style={td}>
          <Badge text={deployment.convergence.replace("_", " ")} color={convergenceColor(deployment.convergence)} />
        </td>
        <td style={td}>{deployment.desiredTechniqueKey || "— (holdback)"}</td>
        <td style={td}>{deployment.desiredGeneration}</td>
        <td style={td}>{deployment.observedGeneration}</td>
        <td style={td}>{deployment.observedState}</td>
        <td style={td}>{deployment.agentConnected ? deployment.agentReadiness || "connected" : "absent"}</td>
        <td style={td}>{since(deployment.agentLastHeartbeatAt)}</td>
        <td style={td}>
          <span style={{ display: "inline-flex", gap: "0.25rem" }}>
            {deployment.hasDrain && <Badge text="drain" color="#ffb432" />}
            {deployment.hasQuarantine && <Badge text="quarantine" color="#ff4060" />}
            {deployment.rejectionCode && <Badge text={deployment.rejectionCode} color="#ff4060" />}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={11} style={{ ...td, whiteSpace: "normal", background: "#ffffff04" }}>
            <DeploymentDetail deployment={deployment} />
          </td>
        </tr>
      )}
    </>
  );
}

function DeploymentDetail({ deployment }: { deployment: OverlayDeployment }) {
  const [detail, setDetail] = useState<OverlayRouteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOverlayRoute(deployment.routeId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "failed to load route"); });
    return () => { cancelled = true; };
  }, [deployment.routeId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))", gap: "1rem", padding: "0.5rem 0" }}>
      <div>
        <div style={sectionLabel}>Desired</div>
        <Field label="technique" value={deployment.desiredTechniqueKey || "none (explicit holdback)"} />
        <Field label="artifact" value={<ArtifactRef id={deployment.desiredArtifactRevisionId} technique={deployment.desiredTechniqueKey} full />} />
        <Field label="fallback" value={<ArtifactRef id={deployment.fallbackArtifactRevisionId} technique={deployment.desiredTechniqueKey} full />} />
        <Field label="generation" value={String(deployment.desiredGeneration)} />
        <Field label="snapshot digest" value={deployment.desiredSnapshotDigest} />
        <Field label="published" value={since(deployment.desiredAt)} />
        <Field label="lease expires" value={deployment.leaseExpiresAt ? since(deployment.leaseExpiresAt) : "—"} />
        <Field label="rollout" value={deployment.rolloutId} />
        <Field label="evaluation" value={deployment.evaluationId} />
      </div>
      <div>
        <div style={sectionLabel}>Observed</div>
        <Field label="technique" value={deployment.observedTechniqueKey} />
        <Field label="artifact" value={<ArtifactRef id={deployment.observedArtifactRevisionId} sha={deployment.observedContentSha256} technique={deployment.observedTechniqueKey} full />} />
        <Field label="content sha256" value={deployment.observedContentSha256} />
        <Field label="target artifact" value={deployment.observedTargetTechniqueKey} />
        <Field label="generation" value={String(deployment.observedGeneration)} />
        <Field label="snapshot digest" value={deployment.observedSnapshotDigest} />
        <Field label="state" value={deployment.observedState} />
        <Field label="reported" value={since(deployment.observedAt)} />
        <Field label="activated" value={since(deployment.activatedAt)} />
        <Field label="previous known good" value={deployment.previousKnownGoodTechniqueKey} />
        <Field label="previous artifact" value={<ArtifactRef id={deployment.previousKnownGoodArtifactId} technique={deployment.previousKnownGoodTechniqueKey} full />} />
      </div>
      <div>
        <div style={sectionLabel}>Box</div>
        <Field label="vps status" value={deployment.vpsStatus} />
        <Field label="agent" value={deployment.agentConnected ? "connected" : "absent"} />
        <Field label="readiness" value={deployment.agentReadiness} />
        <Field label="acked generation" value={deployment.agentAcknowledgedGeneration != null ? String(deployment.agentAcknowledgedGeneration) : "—"} />
        <Field label="agent error" value={deployment.agentLastError} />
        <Field label="deprecated" value={deployment.deprecatedAt ? since(deployment.deprecatedAt) : "—"} />
        {deployment.rejectionCode && (
          <div style={{ marginTop: "0.4rem" }}>
            <div style={sectionLabel}>Rejection</div>
            <Field label="code" value={deployment.rejectionCode} />
            <Field label="operation" value={deployment.rejectionOperation} />
            <Field label="message" value={deployment.rejectionMessage} />
          </div>
        )}
      </div>
      <div>
        <div style={sectionLabel}>Runtime, drains and quarantine</div>
        {error && <div style={{ ...muted, color: "#ff4060" }}>{error}</div>}
        {!detail && !error && <div style={muted}>loading…</div>}
        {detail && (
          <>
            {(detail.installations ?? []).map((installation) => (
              <div key={installation.techniqueKey + installation.runtimeVersion} style={{ marginBottom: "0.4rem" }}>
                <div style={mono}>
                  {installation.techniqueKey}: {installation.runtimeName} {installation.runtimeVersion} (adapter v{installation.adapterProtocol})
                </div>
                <div style={muted}>
                  schemas {(installation.supportedSchemaVersions ?? []).join(", ") || "—"} · release {installation.releaseTag || "—"} · verified {since(installation.verifiedAt)}
                  {installation.nfqueueOut != null && ` · nfqueue ${installation.nfqueueOut}/${installation.nfqueueIn}`}
                </div>
              </div>
            ))}
            {(detail.installations ?? []).length === 0 && <Empty what="installed runtimes" />}
            {(detail.drains ?? []).length > 0 && (
              <>
                <div style={{ ...sectionLabel, marginTop: "0.5rem" }}>Draining</div>
                {(detail.drains ?? []).map((drain) => (
                  <div key={drain.artifactRevisionId + drain.observedAt} style={{ marginBottom: "0.3rem" }}>
                    <div style={mono}>
                      {drain.techniqueKey}: <ArtifactRef id={drain.artifactRevisionId} sha={drain.contentSha256} technique={drain.techniqueKey} /> · {drain.state}
                    </div>
                    <div style={muted}>
                      {drain.connectionCount} connections · observed {since(drain.observedAt)} · sha256 {drain.contentSha256}
                    </div>
                  </div>
                ))}
              </>
            )}
            {(detail.quarantined ?? []).length > 0 && (
              <>
                <div style={{ ...sectionLabel, marginTop: "0.5rem" }}>Quarantined generations</div>
                <JSONBlock value={detail.quarantined} maxHeight={140} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", padding: "0.1rem 0" }}>
      <span style={{ ...muted, minWidth: "9rem" }}>{label}</span>
      <span style={{ ...mono, wordBreak: "break-all" }}>{value || "—"}</span>
    </div>
  );
}
