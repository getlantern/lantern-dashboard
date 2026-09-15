// The overlay tab. Sub-views split the control plane along the lines an
// operator actually works in — fleet state, rollouts, the catalog, evidence,
// the ledger, the knobs — with the overview as the landing page and a reference
// page for the model behind all of it.
import { useState } from "react";

import OverlayAudit from "./OverlayAudit";
import OverlayCatalog from "./OverlayCatalog";
import OverlayEvaluations from "./OverlayEvaluations";
import OverlayFleet from "./OverlayFleet";
import OverlayHowItWorks from "./OverlayHowItWorks";
import OverlayLeaderboards from "./OverlayLeaderboards";
import OverlayRollouts from "./OverlayRollouts";
import OverlaySettings from "./OverlaySettings";
import { Badge, Empty, ErrorNote, Loading, Tile, TileRow } from "./OverlayUI";
import {
  bps,
  card,
  chipStyle,
  convergenceColor,
  duration,
  lifecycleColor,
  muted,
  nanosToSeconds,
  rolloutStateColor,
  sectionLabel,
  shortID,
  since,
  td,
  th,
} from "./overlayStyles";
import { useOverlayOverview, useOverlaySettings } from "../hooks/useOverlays";

const VIEWS = ["overview", "fleet", "rollouts", "catalog", "evaluations", "leaderboards", "audit", "settings", "how it works"] as const;
type View = (typeof VIEWS)[number];

export default function OverlaysOverview({ enabled }: { enabled: boolean }) {
  const [view, setView] = useState<View>("overview");
  const overview = useOverlayOverview(enabled && view !== "how it works");
  const settings = useOverlaySettings(enabled && view === "settings");

  const techniques = overview.data?.techniques ?? [];
  const countries = (overview.data?.countries ?? []).map((c) => c.countryCode).filter((c) => c.length === 2);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.9rem", overflowY: "auto", padding: "0.75rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {VIEWS.map((candidate) => (
          <button key={candidate} type="button" style={chipStyle(view === candidate)} onClick={() => setView(candidate)}>
            {candidate}
          </button>
        ))}
      </div>

      <ExposureBanner overview={overview.data} />

      {view === "overview" && <Overview {...overview} />}
      {view === "fleet" && <OverlayFleet enabled={enabled} />}
      {view === "rollouts" && <OverlayRollouts enabled={enabled} />}
      {view === "catalog" && (
        <OverlayCatalog enabled={enabled} techniques={techniques} onTechniquesChanged={overview.refresh} />
      )}
      {view === "evaluations" && <OverlayEvaluations enabled={enabled} />}
      {view === "leaderboards" && (
        <OverlayLeaderboards enabled={enabled} techniques={techniques} countries={countries} />
      )}
      {view === "audit" && <OverlayAudit enabled={enabled} />}
      {view === "settings" && (
        <OverlaySettings
          settings={settings.data}
          isLoading={settings.isLoading}
          error={settings.error}
          onSaved={settings.refresh}
        />
      )}
      {view === "how it works" && <OverlayHowItWorks />}
    </div>
  );
}

// ExposureBanner is deliberately always visible: the whole control plane is
// designed around clients not being exposed, so whether that is currently true
// should not be something an operator has to open a panel to learn.
function ExposureBanner({ overview }: { overview: ReturnType<typeof useOverlayOverview>["data"] }) {
  if (!overview) return null;
  const { policy } = overview;
  const exposed = (overview.countries ?? []).filter((c) => c.clientExposureBasisPoints > 0);
  const disabled = !policy.enabled || policy.master_kill;

  const tone = overview.policyError ? "#ff4060" : exposed.length > 0 ? "#ffb432" : "#20e070";
  const message = overview.policyError
    ? `The persisted rollout config does not parse (${overview.policyError}) — the API is serving the fail-closed disabled policy.`
    : disabled
      ? "Overlays are globally disabled: no client is assigned a technique in any country."
      : exposed.length > 0
        ? `Client exposure is live in ${exposed.map((c) => `${c.countryCode} ${bps(c.clientExposureBasisPoints)}`).join(", ")}.`
        : "The controller is enabled, but effective client exposure is zero in every country.";

  return (
    <div style={{ ...card, borderLeft: `3px solid ${tone}`, display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
      <Badge text={disabled ? "disabled" : "enabled"} color={disabled ? "#8890a0" : "#20e070"} />
      {policy.master_kill && <Badge text="master kill" color="#ff4060" />}
      <span style={{ ...muted, color: tone }}>{message}</span>
    </div>
  );
}

function Overview({ data, isLoading, hasLoaded, error }: ReturnType<typeof useOverlayOverview>) {
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (isLoading && !hasLoaded) return <Loading what="the overlay control plane" />;
  if (!data) return null;

  const fleet = data.fleet;
  const converged = fleet.byState.converged ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={card}>
        <div style={sectionLabel}>Fleet</div>
        <TileRow>
          <Tile label="managed routes" value={fleet.routes} sub={fleet.truncated ? "listing truncated" : undefined} />
          <Tile label="converged" value={converged} color={convergenceColor("converged")} />
          <Tile label="pending" value={fleet.byState.pending ?? 0} color={convergenceColor("pending")} />
          <Tile label="stale agents" value={(fleet.byState.stale_agent ?? 0) + (fleet.byState.unreported ?? 0)} color={convergenceColor("stale_agent")} />
          <Tile label="rejected / failed" value={(fleet.byState.rejected ?? 0) + (fleet.byState.failed ?? 0)} color={convergenceColor("rejected")} />
          <Tile label="draining" value={fleet.draining} />
          <Tile label="quarantined" value={fleet.quarantined} color={fleet.quarantined ? "#ff4060" : undefined} />
          <Tile label="country leases" value={data.counts.leases} />
          <Tile label="evaluation boxes" value={data.counts.evalPoolBoxes} />
          <Tile
            label="heartbeat freshness"
            value={duration(nanosToSeconds(data.policy.max_heartbeat_age))}
            sub="older = stale"
          />
        </TileRow>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))", gap: "0.9rem" }}>
        <div style={card}>
          <div style={sectionLabel}>Artifacts by lifecycle</div>
          <CountList counts={data.counts.artifactsByLifecycle} color={lifecycleColor} empty="artifacts" />
        </div>
        <div style={card}>
          <div style={sectionLabel}>Rollouts by state</div>
          <CountList counts={data.counts.rolloutsByState} color={rolloutStateColor} empty="rollouts" />
        </div>
        <div style={card}>
          <div style={sectionLabel}>Evaluations by status</div>
          <CountList counts={data.counts.evaluationsByStatus} color={() => "#64b4ff"} empty="evaluations" />
        </div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={sectionLabel}>Countries</div>
        {data.countries.length === 0 ? (
          <Empty what="countries with overlay state" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Country</th>
                <th style={th}>Box activation</th>
                <th style={th}>Client exposure</th>
                <th style={th}>Scope</th>
                <th style={th}>Routes</th>
                <th style={th}>Converged</th>
                <th style={th}>Active rollouts</th>
                <th style={th}>Champions</th>
                <th style={th}>Eval boxes</th>
                <th style={th}>Running evals</th>
                <th style={th}>Active runners</th>
              </tr>
            </thead>
            <tbody>
              {data.countries.map((country) => (
                <tr key={country.countryCode}>
                  <td style={td}>
                    {country.countryCode} {country.paused && <Badge text="paused" color="#ffb432" />}
                  </td>
                  <td style={td}>{bps(country.boxActivationBasisPoints)}</td>
                  <td style={{ ...td, color: country.clientExposureBasisPoints > 0 ? "#ffb432" : undefined }}>
                    {bps(country.clientExposureBasisPoints)}
                  </td>
                  <td style={td}>{country.hasOverride ? "override" : "default"}</td>
                  <td style={td}>{country.deployments}</td>
                  <td style={td}>{country.converged}</td>
                  <td style={td}>{country.activeRollouts}</td>
                  <td style={td}>{country.champions}</td>
                  <td style={td}>{country.evalPoolBoxes}</td>
                  <td style={td}>{country.runningEvaluations}</td>
                  <td style={{ ...td, color: country.activeRunners === 0 ? "#ffb432" : undefined }}>
                    {country.activeRunners}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ ...muted, marginTop: "0.5rem" }}>
          A country with zero active runners produces no independent evidence, so its rollouts cannot widen client
          exposure however healthy the fleet looks.
        </div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={sectionLabel}>Champions</div>
        {data.champions.length === 0 ? (
          <Empty what="champions" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Country</th>
                <th style={th}>Technique</th>
                <th style={th}>Artifact</th>
                <th style={th}>Confidence</th>
                <th style={th}>Samples</th>
                <th style={th}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {data.champions.map((champion) => (
                <tr key={`${champion.countryCode}/${champion.techniqueKey}/${champion.artifactRevisionId}`}>
                  <td style={td}>{champion.countryCode}</td>
                  <td style={td}>{champion.techniqueKey}</td>
                  <td style={td} title={champion.artifactRevisionId}>{shortID(champion.artifactRevisionId)}</td>
                  <td style={td}>{(champion.confidence * 100).toFixed(0)}%</td>
                  <td style={td}>{champion.sampleCount}</td>
                  <td style={td}>{since(champion.evidenceFreshAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={sectionLabel}>Provisioning intent</div>
        {data.provisioning.length === 0 ? (
          <Empty what="overlay-provisioned tracks" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Track</th>
                <th style={th}>Country</th>
                <th style={th}>Technique</th>
                <th style={th}>Purpose</th>
                <th style={th}>Declared</th>
              </tr>
            </thead>
            <tbody>
              {data.provisioning.map((config) => (
                <tr key={`${config.trackId}/${config.countryCode}`}>
                  <td style={td}>{config.trackId}</td>
                  <td style={td}>{config.countryCode}</td>
                  <td style={td}>{config.techniqueKey}</td>
                  <td style={td}>
                    <Badge
                      text={config.evaluationPool ? "evaluation pool" : "production"}
                      color={config.evaluationPool ? "#64b4ff" : "#20e070"}
                    />
                  </td>
                  <td style={td}>{since(config.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ ...muted, marginTop: "0.5rem" }}>
          Only routes of these tracks are ever submitted to the overlay eligibility filter — every other route is
          untouched by the overlay path.
        </div>
      </div>
    </div>
  );
}

function CountList({
  counts,
  color,
  empty,
}: {
  counts: Record<string, number>;
  color: (key: string) => string;
  empty: string;
}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <Empty what={empty} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      {entries.map(([key, count]) => (
        <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Badge text={key} color={color(key)} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-primary)" }}>{count}</span>
        </div>
      ))}
    </div>
  );
}
