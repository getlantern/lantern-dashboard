// Overlay control-plane API.
//
// Mirrors cmd/api/dashboard_overlays_handler.go (reads) and
// dashboard_overlays_actions.go (writes) in lantern-cloud. The write endpoints
// delegate to the same operator service the gRPC surface and `lc overlay` use,
// so anything refused here would have been refused there.
import { apiGet, apiPost } from "./client";

// ── policy ──

// Shares are basis points: 10000 = 100%. The backend speaks snake_case here
// because this is the operator-authored controller document verbatim, not a
// view model — keeping the names identical is what lets an operator paste
// between this panel, `lc overlay policy --json` and the setting itself.
export interface OverlayCountryConfig {
  paused: boolean;
  box_activation_basis_points: number;
  new_client_assignment_exposure_basis_points: number;
  autonomous_box_ceiling_basis_points: number;
  autonomous_client_ceiling_basis_points: number;
  technique_shares_basis_points: Record<string, number> | null;
  challenger_share_basis_points: number;
  no_technique_box_holdback_basis_points: number;
  no_technique_client_holdback_basis_points: number;
}

export interface OverlayCountryDiagnostic {
  configured: OverlayCountryConfig;
  effective: OverlayCountryConfig;
}

export interface OverlayDiagnostics {
  enabled: boolean;
  master_kill: boolean;
  cohort_seed: string;
  // Go duration in nanoseconds.
  max_heartbeat_age: number;
  default: OverlayCountryDiagnostic;
  countries: Record<string, OverlayCountryDiagnostic> | null;
}

// ── overview ──

export interface OverlayTechnique {
  key: string;
  displayName: string;
  description: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  artifactCount: number;
  championCount: number;
}

export interface OverlayChampion {
  countryCode: string;
  techniqueKey: string;
  artifactRevisionId: string;
  confidence: number;
  sampleCount: number;
  evidenceFreshAt: string;
}

export interface OverlayProvisioningConfig {
  trackId: number;
  countryCode: string;
  evaluationPool: boolean;
  techniqueKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface OverlayFleetRollup {
  routes: number;
  byState: Record<string, number>;
  byObserved: Record<string, number>;
  draining: number;
  quarantined: number;
  truncated: boolean;
}

export interface OverlayCountrySummary {
  countryCode: string;
  paused: boolean;
  boxActivationBasisPoints: number;
  clientExposureBasisPoints: number;
  hasOverride: boolean;
  activeRollouts: number;
  deployments: number;
  converged: number;
  leases: number;
  champions: number;
  evalPoolBoxes: number;
  runningEvaluations: number;
  activeRunners: number;
}

export interface OverlayOverview {
  policy: OverlayDiagnostics;
  policyError?: string;
  techniques: OverlayTechnique[];
  champions: OverlayChampion[];
  provisioning: OverlayProvisioningConfig[];
  countries: OverlayCountrySummary[];
  fleet: OverlayFleetRollup;
  counts: {
    artifactsByLifecycle: Record<string, number>;
    rolloutsByState: Record<string, number>;
    evaluationsByStatus: Record<string, number>;
    leases: number;
    evalPoolBoxes: number;
  };
}

// ── deployments ──

// Convergence is derived server-side so every panel agrees on the word.
export type OverlayConvergence =
  | "converged"
  | "pending"
  | "rejected"
  | "failed"
  | "unreported"
  | "stale_agent";

export interface OverlayDeployment {
  routeId: string;
  countryCode: string;
  role: string;
  convergence: OverlayConvergence;
  rolloutId?: string;
  evaluationId?: string;
  desiredTechniqueKey?: string;
  desiredArtifactRevisionId?: string;
  fallbackArtifactRevisionId?: string;
  desiredGeneration: number;
  desiredSnapshotDigest?: string;
  desiredAt?: string;
  leaseExpiresAt?: string;
  observedTechniqueKey?: string;
  observedArtifactRevisionId?: string;
  observedContentSha256?: string;
  observedTargetTechniqueKey?: string;
  observedGeneration: number;
  observedSnapshotDigest?: string;
  observedState: string;
  observedAt?: string;
  activatedAt?: string;
  rejectionCode?: string;
  rejectionOperation?: string;
  rejectionMessage?: string;
  previousKnownGoodTechniqueKey?: string;
  previousKnownGoodArtifactId?: string;
  agentConnected: boolean;
  agentReadiness?: string;
  agentLastHeartbeatAt?: string;
  agentAcknowledgedGeneration?: number;
  agentLastError?: string;
  vpsStatus?: string;
  deprecatedAt?: string;
  hasDrain: boolean;
  hasQuarantine: boolean;
}

export interface OverlayDeploymentsResponse {
  deployments: OverlayDeployment[];
  maxHeartbeatAgeSeconds: number;
  truncated: boolean;
}

export interface OverlayRouteDetail {
  routeId: string;
  installations: Array<{
    techniqueKey: string;
    runtimeName: string;
    runtimeVersion: string;
    adapterProtocol: number;
    supportedSchemaVersions: number[] | null;
    releaseTag: string;
    installedAt: string;
    verifiedAt: string;
    nfqueueOut?: number;
    nfqueueIn?: number;
    connmarkNamespace?: number;
    connmarkMask?: number;
  }> | null;
  drains: Array<{
    techniqueKey: string;
    artifactRevisionId: string;
    contentSha256: string;
    state: string;
    connectionCount: number;
    observedAt: string;
  }> | null;
  quarantined: Array<{
    techniqueKey: string;
    adapterGenerationId: string;
    state: string;
    connectionCount: number;
    reason: string;
    observedAt: string;
  }> | null;
  snapshot?: {
    vpsStatus: string;
    agentConnected: boolean;
    agentInstanceId?: string;
    agentReadiness?: string;
    agentLastHeartbeatAt?: string;
    agentAcknowledgedGeneration: number;
    agentAcknowledgedDigest?: string;
    agentLastError?: string;
  };
}

// ── rollouts ──

export interface OverlayRollout {
  id: string;
  countryCode: string;
  techniqueKey: string;
  targetArtifactRevisionId: string;
  targetContentSha256: string;
  previousArtifactRevisionId?: string;
  previousContentSha256?: string;
  state: string;
  boxActivationBasisPoints: number;
  clientExposureBasisPoints: number;
  generation: number;
  reason?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  techniqueSharesRevision?: string;
  routes: number;
  converged: number;
}

// ── artifacts ──

export interface OverlayArtifact {
  id: string;
  techniqueKey: string;
  contentSha256: string;
  schemaVersion: number;
  requiredRuntimeName: string;
  requiredRuntimeVersion: string;
  adapterProtocol: number;
  mediaType: string;
  payloadBytes: number;
  metadata?: unknown;
  lifecycle: string;
  quarantineReason?: string;
  quarantinedAt?: string;
  createdBy: string;
  createdAt: string;
  stateUpdatedBy?: string;
  stateUpdatedAt?: string;
  // payload is the document itself, present only when the request asked for
  // it and the bytes are UTF-8 text.
  payload?: string;
}

// ── evaluations ──

export interface OverlayEvaluation {
  id: string;
  techniqueKey: string;
  artifactRevisionId: string;
  contentSha256: string;
  mediaType: string;
  countryCode: string;
  status: string;
  acceptanceCriteria?: unknown;
  resultSummary?: unknown;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  routeId?: string;
  holderId?: string;
  leaseExpiresAt?: string;
}

export interface OverlayEvalPoolBox {
  routeId: string;
  techniqueKey: string;
  countryCode: string;
  readiness: string;
  lastHeartbeatAt?: string;
  joinedPoolAt: string;
  runtimeInstalled: boolean;
  hasDeployment: boolean;
  neutralIdle: boolean;
  draining: boolean;
  quarantinedAt?: string;
  deprecatedAt?: string;
  leasedBy?: string;
  leaseExpiresAt?: string;
}

// ── leaderboard and evidence ──

export interface OverlayLeaderboardEntry {
  artifactRevisionId: string;
  contentSha256: string;
  schemaVersion: number;
  compatibilityKey: string;
  role: string;
  rank: number;
  reachabilityScore: number;
  stabilityScore: number;
  latencyMs: number;
  throughputBytesPerSecond: number;
  resourceCost: number;
  confidence: number;
  sampleCount: number;
  evidenceFreshAt: string;
  updatedAt: string;
}

export interface OverlayObservation {
  id: string;
  artifactRevisionId: string;
  evaluationId?: string;
  rolloutId?: string;
  routeId?: string;
  targetCountryCode: string;
  observedCountryCode: string;
  asn?: number;
  rolloutRole?: string;
  source: string;
  candidateOutcome: string;
  candidateReachability: string;
  candidateStability?: number;
  candidateLatencyMs?: number;
  candidateThroughputBytesPerSecond?: number;
  candidateFailureCode?: string;
  candidateAttemptCount: number;
  controlOutcome: string;
  controlReachability: string;
  controlStability?: number;
  controlLatencyMs?: number;
  controlThroughputBytesPerSecond?: number;
  controlFailureCode?: string;
  controlAttemptCount: number;
  resourceCost?: number;
  attributionValid: boolean;
  excludedReason?: string;
  observedAt: string;
  receivedAt: string;
}

export interface OverlayLease {
  routeId: string;
  countryCode: string;
  leasedBy: string;
  leasedAt: string;
  trackId: number;
  vpsStatus: string;
  deprecatedAt?: string;
}

export interface OverlayAuditEvent {
  sequence: number;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  countryCode?: string;
  entitySnapshot?: unknown;
  detail?: unknown;
  occurredAt: string;
}

// ── settings ──

export interface OverlayKnob {
  key: string;
  type: "bool" | "int" | "float" | "string";
  label: string;
  description: string;
  default: boolean | number | string;
  value?: boolean | number | string;
}

export interface OverlayConstant {
  label: string;
  value: string;
  description: string;
}

export interface OverlayRolloutConfigView {
  config: Record<string, unknown> | null;
  diagnostics: OverlayDiagnostics;
  error?: string;
  settingKey: string;
}

export interface OverlaySettingsResponse {
  editable: OverlayKnob[];
  readOnly: OverlayConstant[];
  rolloutConfig: OverlayRolloutConfigView;
  applyDelaySeconds: number;
}

// ── reads ──

export function fetchOverlayOverview(): Promise<OverlayOverview> {
  return apiGet("/overlays");
}

export function fetchOverlayDeployments(params: { country?: string; limit?: number } = {}): Promise<OverlayDeploymentsResponse> {
  return apiGet("/overlays/deployments", queryOf(params));
}

export function fetchOverlayRoute(routeId: string): Promise<OverlayRouteDetail> {
  return apiGet("/overlays/route", { routeId });
}

export function fetchOverlayRollouts(params: { country?: string; activeOnly?: boolean; limit?: number } = {}): Promise<{ rollouts: OverlayRollout[]; truncated: boolean }> {
  return apiGet("/overlays/rollouts", queryOf(params));
}

export function fetchOverlayArtifacts(params: { technique?: string; payload?: boolean; limit?: number } = {}): Promise<{ artifacts: OverlayArtifact[]; truncated: boolean }> {
  return apiGet("/overlays/artifacts", queryOf(params));
}

// fetchOverlayArtifact resolves one revision, payload included, through the
// registry listing: the API has no single-artifact read, so the viewer asks
// for the technique's revisions with payloads and picks the one it needs.
// Callers only invoke this when an operator opens a detail, never for lists.
export async function fetchOverlayArtifact(id: string, technique?: string): Promise<OverlayArtifact> {
  const { artifacts, truncated } = await fetchOverlayArtifacts({ technique, payload: true, limit: 1000 });
  const found = artifacts.find((artifact) => artifact.id === id);
  if (found) return found;
  const scope = technique ? `technique ${technique}` : "registry";
  throw new Error(truncated
    ? `artifact ${id} is beyond the ${scope} listing limit`
    : `artifact ${id} is not in the ${scope} listing`);
}

export function fetchOverlayEvaluations(params: { country?: string; status?: string; limit?: number } = {}): Promise<{ evaluations: OverlayEvaluation[]; pool: OverlayEvalPoolBox[]; truncated: boolean }> {
  return apiGet("/overlays/evaluations", queryOf(params));
}

export function fetchOverlayLeaderboard(country: string, technique: string, compatibility?: string): Promise<{ countryCode: string; techniqueKey: string; entries: OverlayLeaderboardEntry[] }> {
  return apiGet("/overlays/leaderboard", queryOf({ country, technique, compatibility }));
}

export function fetchOverlayObservations(artifact: string, params: { country?: string; limit?: number } = {}): Promise<{ observations: OverlayObservation[]; truncated: boolean }> {
  return apiGet("/overlays/observations", queryOf({ artifact, ...params }));
}

export function fetchOverlayLeases(country?: string): Promise<{ leases: OverlayLease[] }> {
  return apiGet("/overlays/leases", queryOf({ country }));
}

export function fetchOverlayAudit(params: { before?: number; entityType?: string; entityId?: string; limit?: number } = {}): Promise<{ events: OverlayAuditEvent[]; nextBeforeSequence: number }> {
  return apiGet("/overlays/audit", queryOf(params));
}

export function fetchOverlaySettings(): Promise<OverlaySettingsResponse> {
  return apiGet("/overlays/settings");
}

// ── writes ──

export function updateOverlaySetting(key: string, value: boolean | number | string): Promise<OverlayKnob> {
  return apiPost("/overlays/settings", { key, value });
}

export function saveOverlayRolloutConfig(config: Record<string, unknown>, reason: string): Promise<OverlayRolloutConfigView> {
  return apiPost("/overlays/rollout-config", { config, reason });
}

export function setOverlayTechniqueEnabled(key: string, enabled: boolean, reason: string): Promise<unknown> {
  return apiPost("/overlays/techniques/enabled", { key, enabled, reason });
}

export function createOverlayTechnique(key: string, displayName: string, description: string): Promise<unknown> {
  return apiPost("/overlays/techniques", { key, displayName, description });
}

export function setOverlayArtifactLifecycle(args: {
  artifactRevisionId: string;
  expectedLifecycle: string;
  lifecycle: string;
  quarantineReason?: string;
}): Promise<unknown> {
  return apiPost("/overlays/artifacts/lifecycle", args);
}

export function publishOverlayArtifact(args: {
  techniqueKey: string;
  contentSha256: string;
  schemaVersion: number;
  requiredRuntimeName: string;
  requiredRuntimeVersion: string;
  adapterProtocol: number;
  mediaType: string;
  payload: string;
  metadata?: Record<string, unknown>;
}): Promise<unknown> {
  return apiPost("/overlays/artifacts", args);
}

export function createOverlayEvaluation(args: {
  techniqueKey: string;
  artifactRevisionId: string;
  countryCode: string;
  acceptanceCriteria: Record<string, unknown>;
}): Promise<unknown> {
  return apiPost("/overlays/evaluations", args);
}

export function createOverlayRollout(args: {
  countryCode: string;
  techniqueKey: string;
  targetArtifactRevisionId: string;
  previousArtifactRevisionId?: string;
  reason: string;
}): Promise<unknown> {
  return apiPost("/overlays/rollouts", args);
}

// advanceOverlayRollout is a compare-and-swap: expectedGeneration is the
// generation the panel rendered, so an advance built on a stale view is
// refused rather than applied on top of someone else's change.
export function advanceOverlayRollout(args: {
  id: string;
  expectedGeneration: number;
  state: string;
  boxActivationBasisPoints: number;
  clientExposureBasisPoints: number;
  reason: string;
}): Promise<unknown> {
  return apiPost("/overlays/rollouts/advance", args);
}

export function createOverlayProvisioningConfig(args: {
  trackId: number;
  countryCode: string;
  evaluationPool: boolean;
  techniqueKey: string;
  reason: string;
}): Promise<unknown> {
  return apiPost("/overlays/provisioning-configs", args);
}

// queryOf drops absent and empty parameters so an unset filter is absent from
// the URL rather than sent as an empty string the backend would have to treat
// as a filter on "".
function queryOf(params: Record<string, string | number | boolean | undefined>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === false) continue;
    query[key] = String(value);
  }
  return query;
}
