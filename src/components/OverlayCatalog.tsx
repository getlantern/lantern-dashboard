// Technique catalog and artifact registry. Artifacts are immutable and
// content-addressed; the only thing an operator changes about one is its
// lifecycle, which is a compare-and-swap against the lifecycle shown here.
import { useCallback, useEffect, useState } from "react";

import {
  createOverlayTechnique,
  fetchOverlayArtifacts,
  publishOverlayArtifact,
  setOverlayArtifactLifecycle,
  setOverlayTechniqueEnabled,
  type OverlayArtifact,
  type OverlayTechnique,
} from "../api/overlays";
import { LazyArtifactDocument } from "./OverlayArtifactViewer";
import { Badge, Empty, ErrorNote, Loading, ReasonAction } from "./OverlayUI";
import {
  buttonStyle,
  card,
  chipStyle,
  inputStyle,
  lifecycleColor,
  mono,
  muted,
  sectionLabel,
  shortID,
  since,
  td,
  th,
} from "./overlayStyles";

const LIFECYCLES = ["candidate", "qualified", "quarantined", "rejected", "retired"];

export default function OverlayCatalog({
  enabled,
  techniques,
  onTechniquesChanged,
}: {
  enabled: boolean;
  techniques: OverlayTechnique[];
  onTechniquesChanged: () => Promise<void>;
}) {
  const [technique, setTechnique] = useState("");
  const [artifacts, setArtifacts] = useState<OverlayArtifact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // reloadKey re-runs the fetch effect after a mutation without the effect
  // depending on a callback that writes state — which is what keeps the load
  // out of the render path.
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(async () => { setReloadKey((k) => k + 1); }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchOverlayArtifacts({ technique: technique || undefined, limit: 300 })
      .then((data) => {
        if (cancelled) return;
        setArtifacts(data.artifacts);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load artifacts");
      });
    return () => { cancelled = true; };
  }, [enabled, technique, reloadKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={{ ...card, overflowX: "auto" }}>
        <div style={sectionLabel}>Techniques</div>
        {techniques.length === 0 ? (
          <Empty what="registered techniques" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Key</th>
                <th style={th}>Name</th>
                <th style={th}>Enabled</th>
                <th style={th}>Artifacts</th>
                <th style={th}>Champions</th>
                <th style={th}>Description</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {techniques.map((t) => (
                <tr key={t.key}>
                  <td style={td}>{t.key}</td>
                  <td style={td}>{t.displayName}</td>
                  <td style={td}>
                    <Badge text={t.enabled ? "enabled" : "disabled"} color={t.enabled ? "#20e070" : "#8890a0"} />
                  </td>
                  <td style={td}>{t.artifactCount}</td>
                  <td style={td}>{t.championCount}</td>
                  <td style={{ ...td, whiteSpace: "normal", maxWidth: "24rem" }}>{t.description || "—"}</td>
                  <td style={td}>
                    <ReasonAction
                      label={t.enabled ? "disable" : "enable"}
                      tone={t.enabled ? "danger" : "normal"}
                      placeholder="reason"
                      onRun={async (reason) => {
                        await setOverlayTechniqueEnabled(t.key, !t.enabled, reason);
                        await onTechniquesChanged();
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <NewTechnique onCreated={onTechniquesChanged} />
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={sectionLabel}>Artifact revisions</div>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.6rem" }}>
          <button type="button" style={chipStyle(technique === "")} onClick={() => setTechnique("")}>all</button>
          {techniques.map((t) => (
            <button key={t.key} type="button" style={chipStyle(technique === t.key)} onClick={() => setTechnique(t.key)}>
              {t.key}
            </button>
          ))}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        {!artifacts && !error && <Loading what="artifacts" />}
        {artifacts && artifacts.length === 0 && <Empty what="artifact revisions" />}
        {artifacts && artifacts.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Revision</th>
                <th style={th}>Technique</th>
                <th style={th}>Lifecycle</th>
                <th style={th}>Schema</th>
                <th style={th}>Runtime</th>
                <th style={th}>Adapter</th>
                <th style={th}>Size</th>
                <th style={th}>Published</th>
                <th style={th}>By</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.map((artifact) => (
                <ArtifactRow
                  key={artifact.id}
                  artifact={artifact}
                  expanded={expanded === artifact.id}
                  onToggle={() => setExpanded(expanded === artifact.id ? null : artifact.id)}
                  onChanged={load}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PublishArtifact techniques={techniques} onPublished={load} />
    </div>
  );
}

function ArtifactRow({
  artifact,
  expanded,
  onToggle,
  onChanged,
}: {
  artifact: OverlayArtifact;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [target, setTarget] = useState(LIFECYCLES.find((l) => l !== artifact.lifecycle) ?? "qualified");
  const [quarantineReason, setQuarantineReason] = useState("");

  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", background: expanded ? "#ffffff06" : undefined }}>
        <td style={td} title={artifact.id}>{shortID(artifact.id)}</td>
        <td style={td}>{artifact.techniqueKey}</td>
        <td style={td}><Badge text={artifact.lifecycle} color={lifecycleColor(artifact.lifecycle)} /></td>
        <td style={td}>v{artifact.schemaVersion}</td>
        <td style={td}>{artifact.requiredRuntimeName} {artifact.requiredRuntimeVersion}</td>
        <td style={td}>v{artifact.adapterProtocol}</td>
        <td style={td}>{artifact.payloadBytes} B</td>
        <td style={td}>{since(artifact.createdAt)}</td>
        <td style={td}>{artifact.createdBy}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ ...td, whiteSpace: "normal", background: "#ffffff04" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(18rem, 1fr) minmax(18rem, 1fr) minmax(24rem, 2fr)", gap: "1rem", padding: "0.5rem 0" }}>
              <div>
                <div style={sectionLabel}>Identity</div>
                <div style={mono}>{artifact.id}</div>
                <div style={muted}>sha256 {artifact.contentSha256}</div>
                <div style={muted}>media type {artifact.mediaType}</div>
                {artifact.quarantineReason && (
                  <div style={{ ...muted, marginTop: "0.3rem" }}>
                    quarantined {since(artifact.quarantinedAt)}: {artifact.quarantineReason}
                  </div>
                )}
                {artifact.stateUpdatedBy && (
                  <div style={{ ...muted, marginTop: "0.3rem" }}>
                    lifecycle last set by {artifact.stateUpdatedBy} {since(artifact.stateUpdatedAt)}
                  </div>
                )}
              </div>
              <div>
                <div style={sectionLabel}>Lifecycle</div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                  <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...inputStyle, width: 150 }}>
                    {LIFECYCLES.filter((l) => l !== artifact.lifecycle).map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  {target === "quarantined" && (
                    <input
                      value={quarantineReason}
                      placeholder="quarantine reason"
                      onChange={(e) => setQuarantineReason(e.target.value)}
                      style={{ ...inputStyle, width: 220 }}
                    />
                  )}
                </div>
                <ReasonAction
                  label={`set ${target}`}
                  tone={target === "rejected" || target === "quarantined" ? "danger" : "normal"}
                  placeholder="reason (audited)"
                  onRun={async () => {
                    await setOverlayArtifactLifecycle({
                      artifactRevisionId: artifact.id,
                      expectedLifecycle: artifact.lifecycle,
                      lifecycle: target,
                      quarantineReason: target === "quarantined" ? quarantineReason : undefined,
                    });
                    await onChanged();
                  }}
                />
                <div style={{ ...muted, marginTop: "0.4rem" }}>
                  The transition is checked against the lifecycle shown in this row, so two operators acting on the same
                  stale view cannot both succeed.
                </div>
              </div>
              <LazyArtifactDocument id={artifact.id} technique={artifact.techniqueKey} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function NewTechnique({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <div style={{ marginTop: "0.6rem" }}>
        <button type="button" style={buttonStyle(false)} onClick={() => setOpen(true)}>Register technique</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
      <input value={key} placeholder="key" onChange={(e) => setKey(e.target.value)} style={{ ...inputStyle, width: 140 }} />
      <input value={displayName} placeholder="display name" onChange={(e) => setDisplayName(e.target.value)} style={{ ...inputStyle, width: 180 }} />
      <input value={description} placeholder="description" onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, width: 320 }} />
      <button
        type="button"
        disabled={busy}
        style={buttonStyle(busy)}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await createOverlayTechnique(key, displayName, description);
            setOpen(false);
            await onCreated();
          } catch (err) {
            setError(err instanceof Error ? err.message : "failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        create
      </button>
      <button type="button" style={buttonStyle(false)} onClick={() => setOpen(false)}>cancel</button>
      {error && <span style={{ ...muted, color: "#ff4060" }}>{error}</span>}
    </div>
  );
}

function PublishArtifact({ techniques, onPublished }: { techniques: OverlayTechnique[]; onPublished: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [techniqueKey, setTechniqueKey] = useState(techniques[0]?.key ?? "");
  const [payload, setPayload] = useState("");
  const [digest, setDigest] = useState("");
  const [schemaVersion, setSchemaVersion] = useState("1");
  const [runtimeName, setRuntimeName] = useState("");
  const [runtimeVersion, setRuntimeVersion] = useState("");
  const [mediaType, setMediaType] = useState("application/json");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The digest is computed here rather than asked for, and still verified
  // server-side: it is the artifact's identity, and a hand-typed one is just a
  // way to publish a document nobody can activate.
  const computeDigest = async (text: string) => {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  if (!open) {
    return (
      <div style={card}>
        <button type="button" style={buttonStyle(false)} onClick={() => setOpen(true)}>Publish artifact revision</button>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={sectionLabel}>Publish artifact revision</div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <select value={techniqueKey} onChange={(e) => setTechniqueKey(e.target.value)} style={{ ...inputStyle, width: 160 }}>
          {techniques.map((t) => <option key={t.key} value={t.key}>{t.key}</option>)}
        </select>
        <input value={schemaVersion} placeholder="schema version" onChange={(e) => setSchemaVersion(e.target.value)} style={{ ...inputStyle, width: 120 }} />
        <input value={runtimeName} placeholder="required runtime name" onChange={(e) => setRuntimeName(e.target.value)} style={{ ...inputStyle, width: 200 }} />
        <input value={runtimeVersion} placeholder="required runtime version" onChange={(e) => setRuntimeVersion(e.target.value)} style={{ ...inputStyle, width: 200 }} />
        <input value={mediaType} placeholder="media type" onChange={(e) => setMediaType(e.target.value)} style={{ ...inputStyle, width: 200 }} />
      </div>
      <textarea
        value={payload}
        placeholder="artifact payload (the technique-owned document)"
        onChange={async (e) => {
          setPayload(e.target.value);
          setDigest(await computeDigest(e.target.value));
        }}
        style={{ ...inputStyle, width: "100%", minHeight: 160, whiteSpace: "pre" }}
      />
      <div style={{ ...muted, margin: "0.3rem 0" }}>sha256 {digest || "—"} · {new TextEncoder().encode(payload).length} bytes (max 262144)</div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button
          type="button"
          disabled={busy || !digest}
          style={buttonStyle(busy)}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await publishOverlayArtifact({
                techniqueKey,
                contentSha256: digest,
                schemaVersion: Number(schemaVersion),
                requiredRuntimeName: runtimeName,
                requiredRuntimeVersion: runtimeVersion,
                adapterProtocol: 1,
                mediaType,
                payload,
              });
              setOpen(false);
              setPayload("");
              await onPublished();
            } catch (err) {
              setError(err instanceof Error ? err.message : "failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          publish
        </button>
        <button type="button" style={buttonStyle(false)} onClick={() => setOpen(false)}>cancel</button>
        {error && <span style={{ ...muted, color: "#ff4060" }}>{error}</span>}
      </div>
      <div style={{ ...muted, marginTop: "0.4rem" }}>
        A published revision is immutable and starts as a candidate: it reaches boxes only through an evaluation or a
        rollout, and only once its required runtime is installed on them.
      </div>
    </div>
  );
}
