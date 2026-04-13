const API_URL = import.meta.env.VITE_API_URL || "https://api.iantem.io";

let authToken: string | null = null;
let onAuthExpired: (() => Promise<string | null>) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setOnAuthExpired(handler: () => Promise<string | null>) {
  onAuthExpired = handler;
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}/v1/dashboard${path}`);
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
  const url = `${API_URL}/v1/dashboard/metrics`;
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

// ── Admin actions ──

export interface BanditResetResponse {
  keysFound: number;
  keysDeleted: number;
}

export async function resetBanditData(): Promise<BanditResetResponse> {
  const url = `${API_URL}/v1/dashboard/bandit/reset`;
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
  const url = new URL(`${API_URL}/v1/dashboard/stream`);
  if (authToken) url.searchParams.set("token", authToken);
  return url.toString();
}
