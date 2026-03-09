// Mock data — will be replaced with real API calls to lantern-cloud

export interface ConnectionNode {
  id: string;
  lat: number;
  lng: number;
  country: string;
  city: string;
  type: "volunteer" | "relay" | "user";
  protocol: string;
  active: boolean;
}

export interface ActiveRoute {
  from: ConnectionNode;
  to: ConnectionNode;
  protocol: string;
  latencyMs: number;
  bytesPerSec: number;
}

export interface ProtocolEvent {
  id: string;
  timestamp: number;
  type: "generated" | "deployed" | "blocked" | "evaded";
  protocol: string;
  country: string;
  detail: string;
}

export interface VolunteerStats {
  sessionsProxied: number;
  countriesHelped: string[];
  bandwidthSharedGB: number;
  uptimeHours: number;
  peersHelpedToday: number;
  streak: number; // consecutive days
  rank: "ember" | "spark" | "flame" | "beacon" | "lighthouse";
}

export interface GlobalStats {
  activeVolunteers: number;
  activeUsers: number;
  countriesReached: number;
  protocolsGenerated: number;
  protocolsActive: number;
  blocksEvadedToday: number;
  totalSessionsToday: number;
  bandwidthTodayTB: number;
}

export const mockVolunteerStats: VolunteerStats = {
  sessionsProxied: 2847,
  countriesHelped: ["IR", "CN", "RU", "MM", "BY", "TM", "VN", "AE"],
  bandwidthSharedGB: 142.7,
  uptimeHours: 1893,
  peersHelpedToday: 47,
  streak: 12,
  rank: "flame",
};

export const mockGlobalStats: GlobalStats = {
  activeVolunteers: 14283,
  activeUsers: 89412,
  countriesReached: 24,
  protocolsGenerated: 347,
  protocolsActive: 12,
  blocksEvadedToday: 18429,
  totalSessionsToday: 312847,
  bandwidthTodayTB: 8.4,
};

const protocols = [
  "samizdat-v3.2",
  "hydra-quic",
  "mirage-tls",
  "phantom-ws",
  "echo-dtls",
  "drift-h3",
];

export const mockNodes: ConnectionNode[] = [
  // Volunteers (uncensored)
  { id: "v1", lat: 40.7128, lng: -74.006, country: "US", city: "New York", type: "volunteer", protocol: "samizdat-v3.2", active: true },
  { id: "v2", lat: 51.5074, lng: -0.1278, country: "GB", city: "London", type: "volunteer", protocol: "hydra-quic", active: true },
  { id: "v3", lat: 48.8566, lng: 2.3522, country: "FR", city: "Paris", type: "volunteer", protocol: "mirage-tls", active: true },
  { id: "v4", lat: 52.52, lng: 13.405, country: "DE", city: "Berlin", type: "volunteer", protocol: "phantom-ws", active: true },
  { id: "v5", lat: 35.6762, lng: 139.6503, country: "JP", city: "Tokyo", type: "volunteer", protocol: "echo-dtls", active: true },
  { id: "v6", lat: 37.5665, lng: 126.978, country: "KR", city: "Seoul", type: "volunteer", protocol: "drift-h3", active: true },
  { id: "v7", lat: -33.8688, lng: 151.2093, country: "AU", city: "Sydney", type: "volunteer", protocol: "samizdat-v3.2", active: true },
  { id: "v8", lat: 43.6532, lng: -79.3832, country: "CA", city: "Toronto", type: "volunteer", protocol: "hydra-quic", active: true },
  { id: "v9", lat: 59.3293, lng: 18.0686, country: "SE", city: "Stockholm", type: "volunteer", protocol: "mirage-tls", active: true },
  { id: "v10", lat: 47.3769, lng: 8.5417, country: "CH", city: "Zurich", type: "volunteer", protocol: "phantom-ws", active: false },
  { id: "v11", lat: 34.0522, lng: -118.2437, country: "US", city: "Los Angeles", type: "volunteer", protocol: "echo-dtls", active: true },
  { id: "v12", lat: 55.7558, lng: 37.6173, country: "NL", city: "Amsterdam", type: "volunteer", protocol: "drift-h3", active: true },

  // Users (censored regions)
  { id: "u1", lat: 35.6892, lng: 51.389, country: "IR", city: "Tehran", type: "user", protocol: "samizdat-v3.2", active: true },
  { id: "u2", lat: 31.2304, lng: 121.4737, country: "CN", city: "Shanghai", type: "user", protocol: "hydra-quic", active: true },
  { id: "u3", lat: 39.9042, lng: 116.4074, country: "CN", city: "Beijing", type: "user", protocol: "mirage-tls", active: true },
  { id: "u4", lat: 55.7558, lng: 37.6173, country: "RU", city: "Moscow", type: "user", protocol: "phantom-ws", active: true },
  { id: "u5", lat: 16.8661, lng: 96.1951, country: "MM", city: "Yangon", type: "user", protocol: "echo-dtls", active: true },
  { id: "u6", lat: 53.9045, lng: 27.5615, country: "BY", city: "Minsk", type: "user", protocol: "drift-h3", active: true },
  { id: "u7", lat: 37.9688, lng: 58.3894, country: "TM", city: "Ashgabat", type: "user", protocol: "samizdat-v3.2", active: true },
  { id: "u8", lat: 21.0285, lng: 105.8542, country: "VN", city: "Hanoi", type: "user", protocol: "hydra-quic", active: true },
  { id: "u9", lat: 32.4279, lng: 53.688, country: "IR", city: "Isfahan", type: "user", protocol: "mirage-tls", active: true },
  { id: "u10", lat: 29.6169, lng: 106.5516, country: "CN", city: "Chongqing", type: "user", protocol: "echo-dtls", active: true },
  { id: "u11", lat: 25.2048, lng: 55.2708, country: "AE", city: "Dubai", type: "user", protocol: "drift-h3", active: true },
];

export const mockRoutes: ActiveRoute[] = [
  { from: mockNodes[0], to: mockNodes[12], protocol: "samizdat-v3.2", latencyMs: 180, bytesPerSec: 524288 },
  { from: mockNodes[1], to: mockNodes[15], protocol: "phantom-ws", latencyMs: 95, bytesPerSec: 1048576 },
  { from: mockNodes[2], to: mockNodes[17], protocol: "drift-h3", latencyMs: 140, bytesPerSec: 786432 },
  { from: mockNodes[3], to: mockNodes[13], protocol: "hydra-quic", latencyMs: 210, bytesPerSec: 393216 },
  { from: mockNodes[4], to: mockNodes[14], protocol: "mirage-tls", latencyMs: 65, bytesPerSec: 1572864 },
  { from: mockNodes[5], to: mockNodes[19], protocol: "echo-dtls", latencyMs: 88, bytesPerSec: 655360 },
  { from: mockNodes[6], to: mockNodes[16], protocol: "samizdat-v3.2", latencyMs: 320, bytesPerSec: 262144 },
  { from: mockNodes[7], to: mockNodes[18], protocol: "mirage-tls", latencyMs: 250, bytesPerSec: 458752 },
  { from: mockNodes[8], to: mockNodes[12], protocol: "hydra-quic", latencyMs: 170, bytesPerSec: 917504 },
  { from: mockNodes[10], to: mockNodes[21], protocol: "echo-dtls", latencyMs: 290, bytesPerSec: 327680 },
];

export function generateProtocolEvent(): ProtocolEvent {
  const types: ProtocolEvent["type"][] = ["generated", "deployed", "blocked", "evaded"];
  const countries = ["IR", "CN", "RU", "MM", "BY", "TM", "VN", "CU", "AE"];
  const details: Record<ProtocolEvent["type"], string[]> = {
    generated: [
      "New QUIC-based transport compiled to WASM",
      "TLS 1.3 mimicry protocol with randomized fingerprint",
      "HTTP/3 tunnel with adaptive padding generated",
      "WebSocket transport with encrypted header rotation",
    ],
    deployed: [
      "Loaded dynamically via WATER runtime",
      "Rolling deployment to 340 volunteer nodes",
      "Hot-swapped on 12 relay servers",
      "Pushed to edge nodes in 8 regions",
    ],
    blocked: [
      "DPI signature detected by national firewall",
      "SNI-based blocking triggered",
      "Traffic pattern flagged by ML classifier",
      "Active probing detected protocol handshake",
    ],
    evaded: [
      "Rotated to new protocol within 4.2 seconds",
      "WATER runtime loaded replacement transport",
      "Bandit algorithm shifted traffic to unblocked arm",
      "AI-generated successor protocol deployed",
    ],
  };

  const type = types[Math.floor(Math.random() * types.length)];
  const protocol = protocols[Math.floor(Math.random() * protocols.length)];
  const country = countries[Math.floor(Math.random() * countries.length)];
  const detail = details[type][Math.floor(Math.random() * details[type].length)];

  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type,
    protocol,
    country,
    detail,
  };
}

// Simulated time-series for charts
export function generateBandwidthHistory(hours: number = 24): { time: string; volunteers: number; users: number }[] {
  const data = [];
  const now = new Date();
  for (let i = hours; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    const hour = t.getHours();
    // More traffic during peak hours
    const peakMultiplier = 1 + 0.6 * Math.sin((hour - 6) * Math.PI / 12);
    data.push({
      time: t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      volunteers: Math.floor((8000 + Math.random() * 4000) * peakMultiplier),
      users: Math.floor((50000 + Math.random() * 30000) * peakMultiplier),
    });
  }
  return data;
}

export function generateProtocolDistribution(): { name: string; sessions: number; evaded: number }[] {
  return protocols.map((p) => ({
    name: p,
    sessions: Math.floor(20000 + Math.random() * 80000),
    evaded: Math.floor(500 + Math.random() * 5000),
  }));
}
