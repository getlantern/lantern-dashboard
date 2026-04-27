// Environment selection
//
// Two canonical environments for the lantern-cloud API:
//   - prod:    https://api.iantem.io
//   - staging: https://api.staging.iantem.io
//
// An operator can override via the Admin panel (see setApiEnv below);
// the choice persists in localStorage per-browser. If nothing is set,
// we fall back to VITE_API_URL (build-time default for local dev) and
// finally to prod.
//
// Callers should NEVER capture API_URL at import time — use getApiUrl()
// so a post-toggle reload hits the new endpoint.
export const API_ENV_STORAGE_KEY = "lantern-dashboard-api-env";

// "custom" is reported when VITE_API_URL is set to a non-canonical URL
// (typically a local-dev tunnel) and no operator override is stored —
// makes the badge say "custom" instead of lying with "prod" while
// actually talking to something else.
export type ApiEnv = "prod" | "staging" | "custom";

const API_URLS: Record<Exclude<ApiEnv, "custom">, string> = {
  prod: "https://api.iantem.io",
  staging: "https://api.staging.iantem.io",
};

function getStoredApiEnv(): Exclude<ApiEnv, "custom"> | null {
  try {
    const v = localStorage.getItem(API_ENV_STORAGE_KEY);
    if (v === "prod" || v === "staging") return v;
  } catch {
    // localStorage unavailable (private tab, etc.) — fall through.
  }
  return null;
}

export function getApiEnv(): ApiEnv {
  const stored = getStoredApiEnv();
  if (stored) return stored;

  // Build-time VITE_API_URL takes effect only when no explicit override:
  // lets local dev point at anything (including a tunnel) without the
  // toggle UI fighting the build config.
  const built = import.meta.env.VITE_API_URL;
  if (built === API_URLS.staging) return "staging";
  if (built === API_URLS.prod) return "prod";
  if (built) return "custom";
  return "prod";
}

export function getApiUrl(): string {
  // If a build-time URL was set AND no explicit override is stored,
  // honor it (supports local dev against a non-canonical tunnel).
  const stored = getStoredApiEnv();
  if (!stored) {
    const built = import.meta.env.VITE_API_URL;
    if (built) return built;
  }
  const env = getApiEnv();
  if (env === "staging") return API_URLS.staging;
  return API_URLS.prod;
}

// setApiEnv writes the operator's choice to localStorage and reloads
// the page. Reload is the simplest way to propagate the change: every
// in-flight hook tears down, and the next render reads the new URL
// via getApiUrl(). Anything cached in module-scope closures (e.g.
// auth handlers that snapshotted the URL) also resets.
export function setApiEnv(env: ApiEnv): void {
  try {
    localStorage.setItem(API_ENV_STORAGE_KEY, env);
  } catch {
    // If localStorage is unavailable we can't persist — but still
    // reload, since a transient override via setting window.location
    // would be confusing.
  }
  window.location.reload();
}

let authToken: string | null = null;
let onAuthExpired: (() => Promise<string | null>) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setOnAuthExpired(handler: () => Promise<string | null>) {
  onAuthExpired = handler;
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${getApiUrl()}/v1/dashboard${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let res = await fetch(url.toString(), { headers });

  // If 401 and we have a refresh handler, try to get a new token and retry once
  if (res.status === 401 && onAuthExpired) {
    const newToken = await onAuthExpired();
    if (newToken) {
      authToken = newToken;
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(url.toString(), { headers });
    }
  }

  if (!res.ok) {
    throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ── Types matching backend dashboard_handler.go ──

export interface DashboardCountry {
  country: string;
  asnCount: number;
  avgBlockRate: number;
  avgEntropy: number;
  avgErrorRate?: number;
  totalSuccess?: number;
  totalTests?: number;
}

export interface DashboardGlobalStats {
  countries: DashboardCountry[];
  blockedCount: number;
}

export interface DashboardArmEntry {
  armId: string;
  weight: number;
  blocked: boolean;
  regionName?: string;
  trackName?: string;
  regionId?: number;
  trackId?: number;
  routeCount?: number;
  selectionProbability?: number;
  successCount?: number;
  totalTests?: number;
  successRate?: number;
  activeVps?: number;
  activeDevices?: number;
  routesPerClient?: number;
}

export interface DashboardASN {
  asn: string;
  country: string;
  numArms: number;
  numBlocked: number;
  totalPulls: number;
  entropy: number;
  snapshotTime: string;
  topArms: DashboardArmEntry[];
  totalSuccess?: number;
  totalTests?: number;
  errorRate?: number;
}

export interface DashboardTrackInfo {
  trackId: number;
  trackName: string;
  protocolName: string;
  activeRoutes: number;
}

export interface DashboardProviderInfo {
  name: string;
  activeRoutes: number;
}

export interface DashboardDataCenter {
  regionId: number;
  regionName: string;
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  tracks: DashboardTrackInfo[];
  providers: DashboardProviderInfo[];
  totalRoutes: number;
}

export interface DashboardInfraResponse {
  dataCenters: DashboardDataCenter[];
}

// ── Consolidated overview response ──

export interface DashboardOverviewResponse {
  countries: DashboardCountry[];
  blockedCount: number;
  blockedRoutes: string[];
  trafficFlows: DashboardTrafficFlow[];
}

// ── API calls ──

/** Single call for the overview page: countries, blocked routes, and traffic flows. */
export function fetchOverview(): Promise<DashboardOverviewResponse> {
  return apiFetch("/overview");
}

export function fetchGlobalStats(): Promise<DashboardGlobalStats> {
  return apiFetch("/global");
}

export function fetchASNs(country: string): Promise<DashboardASN[]> {
  return apiFetch("/asns", { country });
}

export interface DashboardASNArmsResponse {
  asn: string;
  country: string;
  totalPulls: number;
  fetchedAt: string;
  arms: DashboardArmEntry[];
}

// fetchASNArms returns the full live EXP3 arm list for a single ASN, read
// directly from Redis (not the snapshot table). Use this for the drill-in
// view where all arms — including low-weight ones — matter.
export function fetchASNArms(asn: string): Promise<DashboardASNArmsResponse> {
  return apiFetch("/asn-arms", { asn });
}

export function fetchInfrastructure(includeRoutes?: boolean): Promise<DashboardInfraResponse & { vpsRoutes?: DashboardVPSRoutesResponse }> {
  const params: Record<string, string> = {};
  if (includeRoutes) params.include_routes = "true";
  return apiFetch("/infrastructure", params);
}

export const EventType = {
  ROUTE_BLOCKED: "route_blocked",
  ROUTE_UNBLOCKED: "route_unblocked",
  ROUTE_DEPRECATED: "route_deprecated",
  ROUTE_PROVISIONED: "route_provisioned",
  ROUTE_PROVISION_STARTED: "route_provision_started",
  CALLBACK: "callback",
} as const;

export interface DashboardActivityEvent {
  eventType: string;
  trackName?: string;
  regionName?: string;
  country?: string;
  asn?: string;
  routeId?: string;
  detail?: string;
  reason?: string;
  reward?: number;
  latencyMs?: number;
  timestamp: number;
}



export interface DashboardTrafficFlow {
  country: string;
  regionId: number;
  regionName: string;
  weightedPulls: number;
}

export interface DashboardTrafficFlowsResponse {
  flows: DashboardTrafficFlow[];
}

export function fetchTrafficFlows(): Promise<DashboardTrafficFlowsResponse> {
  return apiFetch("/traffic-flows");
}

export interface DashboardVPSRoute {
  id: string;
  address?: string;
  port?: number;
  created: string;
  deprecated?: string;
  status: string;
  vpsProvider: string;
  vpsRegion: string;
  vpsInstanceId?: string;
  assignmentCount: number;
  peakAssignmentCount: number;
  trackName: string;
  protocolName: string;
  locationName?: string;
  providerName: string;
  regionName: string;
  city?: string;
  countryCode?: string;
}

export interface DashboardVPSSummary {
  total: number;
  byStatus: Record<string, number>;
  byProvider: Record<string, number>;
}

export interface DashboardVPSRoutesResponse {
  routes: DashboardVPSRoute[];
  summary: DashboardVPSSummary;
}

export function fetchVPSRoutes(): Promise<DashboardVPSRoutesResponse> {
  return apiFetch("/vps-routes");
}

// ── Track details for Tracks tab ──

export interface DashboardTrackDetail {
  id: number;
  name: string;
  description?: string;
  tier: string;
  protocol: string;
  protocolOpts?: string;
  dockerImage?: string;
  providers: string[];
  platforms: string[];
  targetRegions: string[];
  locations: string[];
  routesPerClient: number;
  clientVersion?: string;
  vpsPoolSize: number;
  vpsMaxClientsPerRoute: number;
  disabled: boolean;
  testing: boolean;
  routeAgeHours: number;
  targetCountries?: string;
  excludedCountries?: string;
  targetASNs?: string;
  excludedASNs?: string;
  clientFloor: number;
  clientCeil: number;
  vpsRunning: number;
  vpsPending: number;
  vpsProvisioning: number;
  vpsConfiguring: number;
  vpsDestroyed: number;
  k8sCompatible: boolean;
}

export interface DashboardTracksResponse {
  tracks: DashboardTrackDetail[];
}

export function fetchTracks(): Promise<DashboardTracksResponse> {
  return apiFetch("/tracks");
}

// ── SigNoz metrics proxy ──

// Posts a SigNoz v5 builder query to the API's /proxy/metrics endpoint.
// Returns the raw SigNoz response (caller must parse the result structure).
export async function fetchSigNozMetrics(body: object): Promise<any> {
  const url = `${getApiUrl()}/v1/dashboard/metrics`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`SigNoz query failed: ${res.status}`);
  return res.json();
}

// Build a SigNoz v5 builder query for a metric grouped by proxy.track.
export function buildTrackMetricQuery(opts: {
  metricName: string;
  timeAggregation: string;
  spaceAggregation: string;
  filterExpression?: string;
  startMs: number;
  endMs: number;
}): object {
  return {
    start: opts.startMs,
    end: opts.endMs,
    compositeQuery: {
      queryType: "builder",
      panelType: "graph",
      builderQueries: {
        A: {
          dataSource: "metrics",
          queryName: "A",
          aggregateAttribute: {
            key: opts.metricName,
            dataType: "float64",
            type: "Sum",
            isColumn: true,
          },
          timeAggregation: opts.timeAggregation,
          spaceAggregation: opts.spaceAggregation,
          filters: {
            items: [],
            op: "AND",
          },
          expression: "A",
          disabled: false,
          groupBy: [{
            key: "proxy.track",
            dataType: "string",
            type: "tag",
            isColumn: false,
          }],
          legend: "{{proxy.track}}",
          reduceTo: "avg",
          ...(opts.filterExpression ? { having: { expression: opts.filterExpression } } : {}),
        },
      },
    },
  };
}

// Per-track aggregated metrics from SigNoz.
export interface TrackMetrics {
  throughputBps: Record<string, number>;    // track name → bytes/sec * 8
  connections: Record<string, number>;       // track name → connection count
  callbacks: Record<string, number>;         // track name → callback count
  selections: Record<string, number>;        // track name → selection count
}

// MetricsFilters drives queries on the Metrics tab. Any field left
// undefined/empty means "no filter on this dimension". Filters apply to both
// the bandwidth (proxy.io) and connection-duration (sing.connection_duration)
// queries — a non-applicable filter is just a no-op for queries that don't
// carry that label.
export interface MetricsFilters {
  country?: string;           // ISO-2, matches `geo.country.iso_code`
  tier?: "pro" | "free";      // maps to client.is_pro = true|false
  protocol?: string;          // matches `proxy.protocol`
  version?: string;           // matches `client.version` (e.g. "9.0.25")
  platform?: string;          // matches `client.platform` (e.g. "android", "ios")
}

// BandwidthFilters is preserved as an alias for any external caller that
// imports the old name. New code should use MetricsFilters directly.
export type BandwidthFilters = MetricsFilters;

function filterItems(f: MetricsFilters): object[] {
  const items: object[] = [];
  if (f.country) {
    items.push({ key: { key: "geo.country.iso_code", dataType: "string", type: "tag", isColumn: false, isJSON: false }, op: "=", value: f.country });
  }
  if (f.tier) {
    items.push({ key: { key: "client.is_pro", dataType: "bool", type: "tag", isColumn: false, isJSON: false }, op: "=", value: f.tier === "pro" });
  }
  if (f.protocol) {
    items.push({ key: { key: "proxy.protocol", dataType: "string", type: "tag", isColumn: false, isJSON: false }, op: "=", value: f.protocol });
  }
  if (f.version) {
    items.push({ key: { key: "client.version", dataType: "string", type: "tag", isColumn: false, isJSON: false }, op: "=", value: f.version });
  }
  if (f.platform) {
    items.push({ key: { key: "client.platform", dataType: "string", type: "tag", isColumn: false, isJSON: false }, op: "=", value: f.platform });
  }
  return items;
}

// Build a SigNoz query for proxy.io as bytes/sec, optionally grouped by `proxy.track`.
export function buildBandwidthQuery(opts: {
  filters: MetricsFilters;
  groupByTrack: boolean;
  startMs: number;
  endMs: number;
  stepSeconds: number;
}): object {
  // proxy.io carries a network.io.direction tag (transmit | receive); we only
  // care about transmit (egress to the user). Inject here rather than in
  // filterItems because other metrics on this tab don't have that tag.
  const items = [
    { key: { key: "network.io.direction", dataType: "string", type: "tag", isColumn: false, isJSON: false }, op: "=", value: "transmit" },
    ...filterItems(opts.filters),
  ];
  return {
    start: opts.startMs,
    end: opts.endMs,
    compositeQuery: {
      queryType: "builder",
      panelType: "graph",
      builderQueries: {
        A: {
          dataSource: "metrics",
          queryName: "A",
          aggregateAttribute: { key: "proxy.io", dataType: "float64", type: "Sum", isColumn: true, isJSON: false },
          timeAggregation: "rate",
          spaceAggregation: "sum",
          filters: { items, op: "AND" },
          expression: "A",
          disabled: false,
          groupBy: opts.groupByTrack
            ? [{ key: "proxy.track", dataType: "string", type: "tag", isColumn: false, isJSON: false }]
            : [],
          legend: opts.groupByTrack ? "{{proxy.track}}" : "total",
          having: [],
          limit: null,
          orderBy: [],
          reduceTo: "avg",
          stepInterval: opts.stepSeconds,
        },
      },
    },
  };
}

// Build a SigNoz query for mean sing.connection_duration per group (= sum/count
// of the histogram, in the metric's native unit). The result is a "C" formula
// series whose value is the average duration of connections seen in each step.
// Group-by is "track" (sing-box's `track` resource attribute) by default, since
// that's how clients organize outbounds.
export function buildConnectionDurationQuery(opts: {
  filters: MetricsFilters;
  groupBy?: string;          // resource/tag key to group by; defaults to "track"
  startMs: number;
  endMs: number;
  stepSeconds: number;
}): object {
  const groupKey = opts.groupBy || "track";
  const items = filterItems(opts.filters);
  const filterBlock = { items, op: "AND" };
  const groupBy = [{ key: groupKey, dataType: "string", type: "tag", isColumn: false, isJSON: false }];
  return {
    start: opts.startMs,
    end: opts.endMs,
    compositeQuery: {
      queryType: "builder",
      panelType: "graph",
      builderQueries: {
        // A = total connection-time per step (sum of the histogram, rate over time)
        A: {
          dataSource: "metrics",
          queryName: "A",
          aggregateAttribute: { key: "sing.connection_duration.sum", dataType: "float64", type: "Sum", isColumn: true, isJSON: false },
          timeAggregation: "rate",
          spaceAggregation: "sum",
          filters: filterBlock,
          expression: "A",
          disabled: true,    // disabled: not rendered on its own; only used in formula C
          groupBy,
          legend: "",
          having: [],
          limit: null,
          orderBy: [],
          reduceTo: "avg",
          stepInterval: opts.stepSeconds,
        },
        // B = number of connections per step (count of the histogram, rate over time)
        B: {
          dataSource: "metrics",
          queryName: "B",
          aggregateAttribute: { key: "sing.connection_duration.count", dataType: "float64", type: "Sum", isColumn: true, isJSON: false },
          timeAggregation: "rate",
          spaceAggregation: "sum",
          filters: filterBlock,
          expression: "B",
          disabled: true,
          groupBy,
          legend: "",
          having: [],
          limit: null,
          orderBy: [],
          reduceTo: "avg",
          stepInterval: opts.stepSeconds,
        },
        // C = mean connection duration = A/B
        C: {
          queryName: "C",
          expression: "A/B",
          disabled: false,
          legend: `{{${groupKey}}}`,
        },
      },
    },
  };
}

// ── Admin actions ──

export interface BanditResetResponse {
  keysFound: number;
  keysDeleted: number;
}

export async function resetBanditData(): Promise<BanditResetResponse> {
  const url = `${getApiUrl()}/v1/dashboard/bandit/reset`;
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(url, { method: "POST", headers });
  if (!res.ok) throw new Error(`Bandit reset failed: ${res.status}`);
  const data = await res.json();
  return {
    keysFound: data.keys_found,
    keysDeleted: data.keys_deleted,
  };
}

export function getStreamURL(): string {
  const url = new URL(`${getApiUrl()}/v1/dashboard/stream`);
  if (authToken) url.searchParams.set("token", authToken);
  return url.toString();
}
