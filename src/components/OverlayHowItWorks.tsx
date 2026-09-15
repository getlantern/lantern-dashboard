// The overlay tab's reference page. It explains the model the rest of the tab
// renders — what an overlay is, how an artifact travels from publication to a
// box, and which gates keep clients away from one — so an operator reading a
// "pending" or "evaluation_evidence_missing" somewhere else knows what it means.
//
// Kept in sync with docs/src/concepts/overlays.md,
// docs/src/details/overlay_control_path.md and
// docs/src/operations/overlay_runbook.md in lantern-cloud.
import type { CSSProperties, ReactNode } from "react";

import { card, sectionLabel } from "./overlayStyles";

const prose: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.75rem",
  color: "#8090a0",
  lineHeight: 1.65,
};

const heading: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "0.85rem",
  fontWeight: 600,
  color: "#c0c8d4",
  marginBottom: "0.4rem",
};

const term: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.72rem",
  color: "var(--accent-primary)",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={card}>
      <div style={heading}>{title}</div>
      <div style={prose}>{children}</div>
    </div>
  );
}

function Glossary({ items }: { items: Array<[string, string]> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))", gap: "0.7rem", marginTop: "0.5rem" }}>
      {items.map(([name, description]) => (
        <div key={name} style={{ borderLeft: "2px solid #ffffff14", paddingLeft: "0.6rem" }}>
          <div style={term}>{name}</div>
          <div style={{ ...prose, fontSize: "0.7rem" }}>{description}</div>
        </div>
      ))}
    </div>
  );
}

export default function OverlayHowItWorks() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <Section title="What an overlay is">
        <p>
          An <strong>overlay</strong> is a censorship-avoidance behavior applied alongside an existing proxy track without
          becoming a track. It changes what a box <em>does with the traffic it already receives</em>; it never changes
          which box a client is sent to. That boundary is the whole design: overlays need no client work, and a symptom
          of the form "clients are being sent somewhere new" is never an overlay.
        </p>
        <p style={{ marginTop: "0.4rem" }}>
          A <strong>technique</strong> (Geneva today) produces immutable, content-addressed <strong>artifact
          revisions</strong>. The control plane evaluates them in the countries they are meant for, ranks them on the
          evidence it gathered, and rolls the winner out box by box — with the ability to stop and return to the previous
          artifact at any point.
        </p>
      </Section>

      <div style={card}>
        <div style={heading}>The loop</div>
        <svg viewBox="0 0 760 320" style={{ width: "100%", maxWidth: "760px", margin: "0.4rem 0" }}>
          <defs>
            <marker id="ov-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#00e5c8" />
            </marker>
            <marker id="ov-arrow-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb432" />
            </marker>
            <marker id="ov-arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64b4ff" />
            </marker>
          </defs>

          <rect x="10" y="20" width="160" height="52" rx="8" fill="rgba(0,229,200,0.1)" stroke="#00e5c8" strokeWidth="1.5" />
          <text x="90" y="42" textAnchor="middle" fill="#c0c8d4" fontSize="11" fontWeight="600">Publish artifact</text>
          <text x="90" y="57" textAnchor="middle" fill="#8090a0" fontSize="9">immutable, sha256-addressed</text>

          <rect x="210" y="20" width="170" height="52" rx="8" fill="rgba(100,180,255,0.1)" stroke="#64b4ff" strokeWidth="1.5" />
          <text x="295" y="42" textAnchor="middle" fill="#64b4ff" fontSize="11" fontWeight="600">Evaluate in country</text>
          <text x="295" y="57" textAnchor="middle" fill="#8090a0" fontSize="9">dedicated pool + residential exits</text>

          <rect x="420" y="20" width="160" height="52" rx="8" fill="rgba(100,180,255,0.1)" stroke="#64b4ff" strokeWidth="1.5" />
          <text x="500" y="42" textAnchor="middle" fill="#64b4ff" fontSize="11" fontWeight="600">Leaderboard</text>
          <text x="500" y="57" textAnchor="middle" fill="#8090a0" fontSize="9">decayed, per runtime cohort</text>

          <rect x="620" y="20" width="130" height="52" rx="8" fill="rgba(0,229,200,0.1)" stroke="#00e5c8" strokeWidth="1.5" />
          <text x="685" y="42" textAnchor="middle" fill="#c0c8d4" fontSize="11" fontWeight="600">Rollout</text>
          <text x="685" y="57" textAnchor="middle" fill="#8090a0" fontSize="9">canary → widen</text>

          <line x1="170" y1="46" x2="206" y2="46" stroke="#00e5c8" strokeWidth="1.5" markerEnd="url(#ov-arrow)" />
          <line x1="380" y1="46" x2="416" y2="46" stroke="#64b4ff" strokeWidth="1.5" markerEnd="url(#ov-arrow-blue)" />
          <line x1="580" y1="46" x2="616" y2="46" stroke="#64b4ff" strokeWidth="1.5" markerEnd="url(#ov-arrow-blue)" />

          <rect x="560" y="130" width="190" height="60" rx="8" fill="rgba(0,229,200,0.06)" stroke="#00e5c8" strokeWidth="1.5" />
          <text x="655" y="152" textAnchor="middle" fill="#c0c8d4" fontSize="11" fontWeight="600">Desired state</text>
          <text x="655" y="167" textAnchor="middle" fill="#8090a0" fontSize="9">one generation + digest</text>
          <text x="655" y="180" textAnchor="middle" fill="#8090a0" fontSize="9">per box, never a delta</text>
          <line x1="685" y1="72" x2="685" y2="126" stroke="#00e5c8" strokeWidth="1.5" markerEnd="url(#ov-arrow)" />

          <rect x="300" y="130" width="190" height="60" rx="8" fill="rgba(0,229,200,0.06)" stroke="#00e5c8" strokeWidth="1.5" />
          <text x="395" y="152" textAnchor="middle" fill="#c0c8d4" fontSize="11" fontWeight="600">Agent on the box</text>
          <text x="395" y="167" textAnchor="middle" fill="#8090a0" fontSize="9">prepare → verify → activate</text>
          <text x="395" y="180" textAnchor="middle" fill="#8090a0" fontSize="9">then drain the old generation</text>
          <line x1="556" y1="160" x2="494" y2="160" stroke="#00e5c8" strokeWidth="1.5" markerEnd="url(#ov-arrow)" />

          <rect x="40" y="130" width="200" height="60" rx="8" fill="rgba(255,180,50,0.08)" stroke="#ffb432" strokeWidth="1.5" />
          <text x="140" y="152" textAnchor="middle" fill="#ffb432" fontSize="11" fontWeight="600">Observed report</text>
          <text x="140" y="167" textAnchor="middle" fill="#8090a0" fontSize="9">echoes generation + digest</text>
          <text x="140" y="180" textAnchor="middle" fill="#8090a0" fontSize="9">converged, or a rejection code</text>
          <line x1="296" y1="160" x2="244" y2="160" stroke="#ffb432" strokeWidth="1.5" markerEnd="url(#ov-arrow-amber)" />

          <rect x="300" y="240" width="190" height="56" rx="8" fill="rgba(255,180,50,0.08)" stroke="#ffb432" strokeWidth="1.5" />
          <text x="395" y="262" textAnchor="middle" fill="#ffb432" fontSize="11" fontWeight="600">Production observations</text>
          <text x="395" y="277" textAnchor="middle" fill="#8090a0" fontSize="9">feed the same leaderboard</text>
          <line x1="140" y1="190" x2="140" y2="268" stroke="#ffb432" strokeWidth="1" strokeDasharray="4,3" />
          <line x1="140" y1="268" x2="296" y2="268" stroke="#ffb432" strokeWidth="1" markerEnd="url(#ov-arrow-amber)" />
          <line x1="490" y1="268" x2="560" y2="268" stroke="#ffb432" strokeWidth="1" strokeDasharray="4,3" />
          <line x1="560" y1="268" x2="560" y2="80" stroke="#ffb432" strokeWidth="1" strokeDasharray="4,3" />
          <text x="520" y="110" textAnchor="middle" fill="#506070" fontSize="8">evidence</text>
        </svg>
      </div>

      <Section title="Desired state is a generation, not a delta">
        <p>
          A box's assignment is one row holding both halves: what the controller <strong>desires</strong> and what the box
          last reported <strong>observing</strong>. Every semantic change to the desired half advances the generation
          exactly once and stamps a new snapshot digest; an identical retry changes neither. The pair is the fence a box
          quotes back in every report, so a command or a report from a superseded generation is refused rather than
          applied.
        </p>
        <p style={{ marginTop: "0.4rem" }}>
          <strong>Converged</strong> in the Fleet panel is strict: the same generation, the same digest, the artifact
          identity the controller named, and no outstanding rejection. A box that is running <em>something</em> is not
          converged. The other states each mean something specific:
        </p>
        <Glossary
          items={[
            ["pending", "The box has the desired snapshot and has not reported it yet. Normal for a few seconds after a change."],
            ["stale_agent", "The subscription exists but the last heartbeat aged out. Nothing progresses until it comes back, and a stale box can never satisfy a rollout gate."],
            ["unreported", "No agent has ever reported for this route. Either the agent is not running or provisioning never finished."],
            ["rejected", "The box refused the snapshot and gave a reason code — usually an artifact its installed runtime cannot run."],
            ["failed", "The box tried and the local lifecycle failed. The previous generation keeps serving its existing connections."],
          ]}
        />
        <p style={{ marginTop: "0.5rem" }}>
          Desired state may explicitly assign <strong>no technique</strong>. Neutral is a state a box converges to — not
          the absence of an assignment — so diagnosing a neutral box means checking that it reported neutral, not that it
          reported nothing.
        </p>
      </Section>

      <Section title="Activation is new-connections-only">
        <p>
          The agent applies a snapshot in a fixed order: prepare, verify, activate for new connections, and only then
          deactivate what it replaced. The retired generation keeps serving the connections it already has and is
          collected only once the controller has seen it reach <span style={term}>drained</span>. That is why the Fleet
          panel shows drains as a normal state rather than an error — and why a rollout will not widen while a box still
          has one outstanding.
        </p>
        <p style={{ marginTop: "0.4rem" }}>
          <strong>Quarantined generations</strong> are different: they are generations the adapter is holding fail-closed
          because the controller could not attribute them (an unknown generation, or more than one active at once). They
          never authorize artifact lineage and they always mean something on that box is not in the state the controller
          believes.
        </p>
      </Section>

      <Section title="Three independent gates keep clients away">
        <p>All three fail closed, and all three are visible in this tab.</p>
        <Glossary
          items={[
            [
              "the rollout config",
              "An absent or unparseable overlay_rollout_config resolves to the disabled policy with the master kill engaged, and client assignment then uses no technique in any country. The Settings panel shows configured vs effective per scope.",
            ],
            [
              "the serving filter",
              "Only routes of tracks carrying an overlay provisioning config are submitted to the eligibility filter at all. Under the disabled policy such a route is refused even when it is converged, ready and healthy; a route that cannot be tied to a country lease and a deployment is refused as unowned.",
            ],
            [
              "the evidence gate",
              "Box activation widens on box-local gates alone — a box carrying a technique at zero client exposure exposes no one. Widening CLIENT exposure additionally requires in-country evidence: the target artifact must hold the champion or challenger role on the published leaderboard. Without it the controller pauses the rollout with reason evaluation_evidence_missing.",
            ],
          ]}
        />
        <p style={{ marginTop: "0.5rem" }}>
          An operator can approve a step past the evidence gate; that approval is audited. Automation never bypasses it.
        </p>
      </Section>

      <Section title="Where the evidence comes from">
        <p>
          Box-local signals cannot prove reachability — a box reports on the state of its own process, not on whether
          anyone in the country can reach it. The positive evidence comes from <strong>runners</strong>: each measurement
          window opens a fresh residential session, attests its exit against the public edge (so the country and ASN are
          derived server-side and never taken from the runner's claim), and measures the candidate against a control
          through the same exit.
        </p>
        <p style={{ marginTop: "0.4rem" }}>
          The pairing is the point. A candidate failing where the control also failed says nothing about the technique,
          and the server marks those observations attribution-invalid rather than scoring them. The leaderboard then
          decays what is left by age, so a ranking reflects what works now rather than what worked when the censor was
          configured differently. Rank and role are only comparable within one <span style={term}>compatibility key</span>
          — a runtime cohort — because artifacts requiring different runtimes were never candidates for the same box.
        </p>
      </Section>

      <Section title="Evaluation pools">
        <p>
          Evaluations run on dedicated boxes, never on production traffic. A pool holds back a{" "}
          <strong>clean-IP reserve</strong> of assignable boxes: without one, retiring a burned address leaves nothing to
          move the next evaluation onto and rotation stalls exactly when the censor is most active. Addresses rotate on
          age, and early on burn evidence — where "burned" requires failures across more than one distinct artifact,
          which is what separates a burned address from a bad candidate.
        </p>
      </Section>

      <Section title="Country leases are permanent">
        <p>
          A route's country attribution is written once, by the first writer, and no operator RPC reassigns or releases
          one. Retiring the route is the only way to end a lease. This is what makes an observation attributable months
          later: the box that produced it cannot have changed country in the meantime.
        </p>
      </Section>

      <Section title="Rollout states">
        <Glossary
          items={[
            ["draft", "Created, zero exposure. Nothing is deployed yet."],
            ["canary", "A first bounded step. Box activation only, unless client exposure was explicitly set."],
            ["widening", "Advancing one configured step per controller tick, each step gated on the fleet having converged on the previous one."],
            ["paused", "Frozen where it is, by an operator or by a gate the controller could not satisfy. The reason says which."],
            ["completed", "The target artifact is the country's champion and the rollout is done."],
            ["rolled_back", "Every box returned to the previous known good — republished as an ordinary champion — and client exposure dropped to zero in the same step."],
            ["failed", "The controller could not carry the rollout to either end state. Read the audit ledger for what it last tried."],
          ]}
        />
        <p style={{ marginTop: "0.5rem" }}>
          Reductions are never gated: narrowing, pausing and rolling back do not depend on the telemetry that would
          justify continuing. Stopping an overlay must never require the system to be healthy enough to explain itself.
        </p>
      </Section>

      <Section title="Budgets">
        <p>These are the ceilings the end-to-end suite asserts on every run, not observed medians.</p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem", fontSize: "0.7rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <th style={{ textAlign: "left", padding: "4px 8px", color: "#c0c8d4" }}>Budget</th>
              <th style={{ textAlign: "left", padding: "4px 8px", color: "#c0c8d4" }}>Value</th>
              <th style={{ textAlign: "left", padding: "4px 8px", color: "#c0c8d4" }}>What it covers</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: "3px 8px" }}>Desired-state convergence</td><td style={{ padding: "3px 8px" }}>30s</td><td style={{ padding: "3px 8px" }}>Publish to the box reporting it exactly converged, on a connected subscription</td></tr>
            <tr><td style={{ padding: "3px 8px" }}>Cross-replica convergence</td><td style={{ padding: "3px 8px" }}>45s</td><td style={{ padding: "3px 8px" }}>The same when the publishing replica is not the one holding the subscription</td></tr>
            <tr><td style={{ padding: "3px 8px" }}>Rollback</td><td style={{ padding: "3px 8px" }}>30s</td><td style={{ padding: "3px 8px" }}>Operator rollback to the box serving the previous known good again</td></tr>
            <tr><td style={{ padding: "3px 8px" }}>Reconnect</td><td style={{ padding: "3px 8px" }}>90s</td><td style={{ padding: "3px 8px" }}>A box re-establishing its subscription and receiving a full snapshot</td></tr>
            <tr><td style={{ padding: "3px 8px" }}>Drain completion</td><td style={{ padding: "3px 8px" }}>30s</td><td style={{ padding: "3px 8px" }}>A retired generation reaching drained once its last connection is gone</td></tr>
            <tr><td style={{ padding: "3px 8px" }}>Controller reconciliation</td><td style={{ padding: "3px 8px" }}>15s</td><td style={{ padding: "3px 8px" }}>The longest a box may hold state the controller has already replaced with no wakeup</td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Reading this tab">
        <Glossary
          items={[
            ["Overview", "Effective policy, the technique catalog, champions per country, and the fleet convergence rollup. Start here."],
            ["Fleet", "One row per managed route: desired vs observed, the agent's own liveness, drains and quarantines. The drill-down behind every convergence tile."],
            ["Rollouts", "Live and historical migrations, with the controls to widen, pause, complete or roll one back."],
            ["Catalog", "Techniques and the immutable artifact registry, including lifecycle transitions and publication."],
            ["Evaluations", "Queued and running evaluations plus the pools that host them."],
            ["Leaderboards", "Published rankings per country/technique/cohort, and the paired observations under them."],
            ["Audit", "Every mutation with its actor and entity snapshot. Append-only."],
            ["Settings", "Worker knobs, the rollout controller document, and the contract limits that are not settings."],
          ]}
        />
      </Section>

      <div style={{ ...card, ...prose }}>
        <div style={sectionLabel}>Further reading</div>
        Deeper detail lives in the lantern-cloud book: <span style={term}>docs/src/concepts/overlays.md</span> for the
        glossary, <span style={term}>docs/src/details/overlay_control_path.md</span> for the protocol and its fences, and{" "}
        <span style={term}>docs/src/operations/overlay_runbook.md</span> for the operator procedures — including{" "}
        <span style={term}>lc overlay policy --assert-disabled</span>, the single check that client exposure is provably
        off.
      </div>
    </div>
  );
}
