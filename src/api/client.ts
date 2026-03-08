const API_URL = import.meta.env.VITE_API_URL || "https://api.staging.iantem.io";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
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

  const res = await fetch(url.toString(), { headers });
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

// ── API calls ──

export function fetchGlobalStats(): Promise<DashboardGlobalStats> {
  return apiFetch("/global");
}

export function fetchASNs(country: string): Promise<DashboardASN[]> {
  return apiFetch("/asns", { country });
}

export function fetchASNHistory(asn: string): Promise<DashboardASN[]> {
  return apiFetch("/asn-history", { asn });
}

export function fetchBlockedRoutes(): Promise<string[]> {
  return apiFetch("/blocked-routes");
}
