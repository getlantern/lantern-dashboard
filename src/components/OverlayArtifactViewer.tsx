// The artifact behind a reference. Rollouts, deployments, evaluations,
// leaderboards and champions all name an artifact by revision id or content
// hash; this is the one place that turns that name into the document itself —
// its identity, lifecycle, metadata and the payload a box actually receives —
// so an operator never has to leave the panel they are on to see what is
// being rolled out.
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { OverlayArtifact } from "../api/overlays";
import { useOverlayArtifact } from "../hooks/useOverlays";
import { Badge, ErrorNote, JSONBlock, Loading } from "./OverlayUI";
import { buttonStyle, lifecycleColor, mono, muted, sectionLabel, shortID, since } from "./overlayStyles";

// ArtifactRef renders an artifact reference as an opener for the viewer. The
// visible text is the short revision id (or a caller-supplied label); the full
// id and hash are in the tooltip. Nothing is fetched until the operator opens
// it. The technique, when the caller knows it, narrows the registry lookup.
// Clicks do not bubble, so the ref can sit in a row whose own click expands or
// selects the row.
export function ArtifactRef({
  id,
  sha,
  technique,
  label,
  full = false,
}: {
  id?: string;
  sha?: string;
  technique?: string;
  label?: string;
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!id) return <span style={mono}>—</span>;

  const onClick = (event: MouseEvent) => {
    event.stopPropagation();
    setOpen(true);
  };
  const title = sha ? `${id}\nsha256 ${sha}\nclick to view the artifact` : `${id}\nclick to view the artifact`;

  return (
    <>
      <button type="button" onClick={onClick} title={title} style={refStyle}>
        {label ?? (full ? id : shortID(id))}
      </button>
      {open && <ArtifactModal id={id} technique={technique} onClose={() => setOpen(false)} />}
    </>
  );
}

const refStyle: CSSProperties = {
  ...mono,
  background: "none",
  border: 0,
  padding: 0,
  margin: 0,
  cursor: "pointer",
  color: "var(--accent-info)",
  textDecoration: "underline dotted",
  textUnderlineOffset: "2px",
  wordBreak: "break-all",
  textAlign: "left",
};

// ArtifactModal fetches one revision and shows it over the current panel. It
// is portaled to the document body so a table cell's overflow or a card's
// stacking context cannot clip it.
export function ArtifactModal({ id, technique, onClose }: { id: string; technique?: string; onClose: () => void }) {
  const { artifact, error } = useOverlayArtifact(id, technique);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div style={backdrop} onClick={onClose} role="presentation">
      <div style={panel} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Overlay artifact">
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={titleStyle}>
              {artifact ? `${artifact.techniqueKey} artifact` : "Artifact"}
              {artifact && (
                <span style={{ marginLeft: "0.5rem", verticalAlign: "middle" }}>
                  <Badge text={artifact.lifecycle} color={lifecycleColor(artifact.lifecycle)} />
                </span>
              )}
            </div>
            <div style={{ ...mono, color: "var(--text-secondary)", wordBreak: "break-all" }}>{id}</div>
          </div>
          <button type="button" onClick={onClose} style={buttonStyle(false)}>close</button>
        </div>
        <div style={{ overflow: "auto", minHeight: 0 }}>
          {error && <ErrorNote>{error}</ErrorNote>}
          {!artifact && !error && <Loading what="artifact" />}
          {artifact && <ArtifactBody artifact={artifact} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(6, 10, 18, 0.72)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
  padding: "1.5rem",
};

const panel: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid #ffffff18",
  borderRadius: "var(--radius-md)",
  padding: "1.25rem 1.4rem 1.1rem",
  width: "min(960px, 96vw)",
  maxHeight: "88vh",
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
  boxShadow: "0 20px 48px rgba(0,0,0,0.55)",
};

const titleStyle: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "#e4e8ee",
  letterSpacing: "-0.005em",
  marginBottom: "0.2rem",
};

// ArtifactBody is the full view of a loaded revision: identity and
// provenance on the left, metadata and the payload on the right.
export function ArtifactBody({ artifact }: { artifact: OverlayArtifact }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(18rem, 1fr) minmax(24rem, 2fr)", gap: "1rem" }}>
      <div>
        <div style={sectionLabel}>Identity</div>
        <Row label="revision" value={artifact.id} />
        <Row label="sha256" value={artifact.contentSha256} />
        <Row label="technique" value={artifact.techniqueKey} />
        <Row label="lifecycle" value={<Badge text={artifact.lifecycle} color={lifecycleColor(artifact.lifecycle)} />} />
        <Row label="schema" value={`v${artifact.schemaVersion}`} />
        <Row label="runtime" value={`${artifact.requiredRuntimeName} ${artifact.requiredRuntimeVersion}`} />
        <Row label="adapter" value={`v${artifact.adapterProtocol}`} />
        <Row label="media type" value={artifact.mediaType} />
        <Row label="size" value={`${artifact.payloadBytes} bytes`} />
        <Row label="published" value={`${since(artifact.createdAt)} by ${artifact.createdBy}`} />
        {artifact.stateUpdatedBy && (
          <Row label="lifecycle set" value={`${since(artifact.stateUpdatedAt)} by ${artifact.stateUpdatedBy}`} />
        )}
        {artifact.quarantineReason && (
          <Row label="quarantined" value={`${since(artifact.quarantinedAt)}: ${artifact.quarantineReason}`} />
        )}
      </div>
      <ArtifactDocument artifact={artifact} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", padding: "0.1rem 0" }}>
      <span style={{ ...muted, minWidth: "6.5rem", flexShrink: 0 }}>{label}</span>
      <span style={{ ...mono, wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

// ArtifactDocument is the metadata and payload of a loaded revision. Panels
// that already have the identity on screen (the catalog row) use this alone.
export function ArtifactDocument({ artifact }: { artifact: OverlayArtifact }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={sectionLabel}>Metadata</div>
      {artifact.metadata === undefined || artifact.metadata === null ? (
        <div style={muted}>none</div>
      ) : (
        <JSONBlock value={artifact.metadata} maxHeight={160} />
      )}
      <div style={{ ...sectionLabel, marginTop: "0.7rem" }}>Payload</div>
      <ArtifactPayload artifact={artifact} />
    </div>
  );
}

// LazyArtifactDocument is ArtifactDocument for a caller that has only the
// revision id; it loads the revision itself.
export function LazyArtifactDocument({ id, technique }: { id: string; technique?: string }) {
  const { artifact, error } = useOverlayArtifact(id, technique);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!artifact) return <Loading what="artifact payload" />;
  return <ArtifactDocument artifact={artifact} />;
}

// ArtifactPayload renders the document pretty-printed when it parses as JSON
// and verbatim otherwise. The API omits the payload when it is not UTF-8
// text, so a revision without one is a binary document.
function ArtifactPayload({ artifact }: { artifact: OverlayArtifact }) {
  const [copied, setCopied] = useState(false);

  const rendered = renderPayload(artifact);
  if (!rendered) return <div style={muted}>payload is not UTF-8 text; the API does not return it</div>;

  const copy = async () => {
    await navigator.clipboard.writeText(rendered.copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
        <span style={muted}>{rendered.kind} · {artifact.payloadBytes} bytes · {artifact.mediaType}</span>
        <button type="button" onClick={copy} style={{ ...buttonStyle(false), padding: "0.1rem 0.5rem" }}>
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <JSONBlock value={rendered.text} maxHeight={420} />
    </div>
  );
}

interface RenderedPayload {
  kind: "json" | "text";
  text: string;
  copyText: string;
}

function renderPayload(artifact: OverlayArtifact): RenderedPayload | null {
  if (artifact.payload !== undefined) {
    try {
      const parsed: unknown = JSON.parse(artifact.payload);
      return { kind: "json", text: JSON.stringify(parsed, null, 2), copyText: artifact.payload };
    } catch {
      // Not JSON: fall through and show the text as it is.
    }
    return { kind: "text", text: artifact.payload, copyText: artifact.payload };
  }
  return null;
}
