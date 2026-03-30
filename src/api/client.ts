const API_URL = import.meta.env.VITE_API_URL || "https://api.staging.iantem.io";

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

export function getStreamURL(): string {
  const url = new URL(`${API_URL}/v1/dashboard/stream`);
  if (authToken) url.searchParams.set("token", authToken);
  return url.toString();
}
