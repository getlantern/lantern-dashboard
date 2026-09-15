// The overlay audit ledger: every mutation, its actor, and the entity snapshot
// it wrote. It is append-only and read backwards from a cursor, so paging here
// walks the sequence rather than offsetting into a moving table.
import { useState } from "react";

import { type OverlayAuditEvent } from "../api/overlays";
import { Badge, Empty, ErrorNote, JSONBlock, Loading } from "./OverlayUI";
import {
  buttonStyle,
  card,
  inputStyle,
  mono,
  muted,
  sectionLabel,
  since,
  td,
  th,
} from "./overlayStyles";
import { useOverlayAudit } from "../hooks/useOverlays";

export default function OverlayAudit({ enabled }: { enabled: boolean }) {
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [cursors, setCursors] = useState<number[]>([]);
  const before = cursors[cursors.length - 1];
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading, hasLoaded, error } = useOverlayAudit(enabled, {
    entityType: entityType && entityId ? entityType : undefined,
    entityId: entityType && entityId ? entityId : undefined,
    before,
  });

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (isLoading && !hasLoaded) return <Loading what="the audit ledger" />;

  const events = data?.events ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={card}>
        <div style={sectionLabel}>Filter</div>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={entityType}
            placeholder="entity type (e.g. overlay_rollout)"
            onChange={(e) => { setEntityType(e.target.value); setCursors([]); }}
            style={{ ...inputStyle, width: 260 }}
          />
          <input
            value={entityId}
            placeholder="entity id"
            onChange={(e) => { setEntityId(e.target.value); setCursors([]); }}
            style={{ ...inputStyle, width: 320 }}
          />
        </div>
        <div style={{ ...muted, marginTop: "0.4rem" }}>
          Both fields are needed to filter — the ledger is indexed by the pair. Actors come from the authenticated
          principal, never from request data, so a row names whoever actually made the change.
        </div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={sectionLabel}>Events ({events.length})</div>
        {events.length === 0 ? (
          <Empty what="audit events" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Seq</th>
                <th style={th}>When</th>
                <th style={th}>Actor</th>
                <th style={th}>Action</th>
                <th style={th}>Entity</th>
                <th style={th}>Country</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <AuditRow
                  key={event.sequence}
                  event={event}
                  expanded={expanded === event.sequence}
                  onToggle={() => setExpanded(expanded === event.sequence ? null : event.sequence)}
                />
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
          <button
            type="button"
            disabled={cursors.length === 0}
            style={buttonStyle(false)}
            onClick={() => setCursors(cursors.slice(0, -1))}
          >
            newer
          </button>
          <button
            type="button"
            disabled={!data?.nextBeforeSequence}
            style={buttonStyle(false)}
            onClick={() => data?.nextBeforeSequence && setCursors([...cursors, data.nextBeforeSequence])}
          >
            older
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditRow({ event, expanded, onToggle }: { event: OverlayAuditEvent; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", background: expanded ? "#ffffff06" : undefined }}>
        <td style={td}>{event.sequence}</td>
        <td style={td}>{since(event.occurredAt)}</td>
        <td style={td}>{event.actor}</td>
        <td style={td}><Badge text={event.action} color="#64b4ff" /></td>
        <td style={td} title={event.entityId}>{event.entityType} {event.entityId}</td>
        <td style={td}>{event.countryCode || "—"}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ ...td, whiteSpace: "normal", background: "#ffffff04" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))", gap: "1rem" }}>
              <div>
                <div style={sectionLabel}>Occurred</div>
                <div style={mono}>{event.occurredAt}</div>
              </div>
              <div>
                <div style={sectionLabel}>Entity snapshot</div>
                <JSONBlock value={event.entitySnapshot} />
              </div>
              <div>
                <div style={sectionLabel}>Detail</div>
                <JSONBlock value={event.detail} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
