import { memo, useMemo, useEffect, useState, useRef, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { mockNodes, type ConnectionNode } from "../data/mock";
import { fetchASNs, type DashboardCountry, type DashboardASN, type DashboardDataCenter, type DashboardTrafficFlow } from "../api/client";
import type { GeoResult } from "../hooks/useGeoLookup";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const CENSORED = new Set(["IR", "CN", "RU", "MM", "BY", "TM", "VN", "CU", "SA", "PK", "UZ", "TH", "AE"]);

// Top 5 cities per censored country [lng, lat, relative population weight 0-1]
interface City { name: string; lng: number; lat: number; weight: number }
const CITIES: Record<string, City[]> = {
  IR: [
    { name: "Tehran", lng: 51.39, lat: 35.69, weight: 1.0 },
    { name: "Mashhad", lng: 59.60, lat: 36.30, weight: 0.35 },
    { name: "Isfahan", lng: 51.68, lat: 32.65, weight: 0.28 },
    { name: "Tabriz", lng: 46.30, lat: 38.08, weight: 0.22 },
    { name: "Shiraz", lng: 52.53, lat: 29.59, weight: 0.20 },
  ],
  CN: [
    { name: "Shanghai", lng: 121.47, lat: 31.23, weight: 1.0 },
    { name: "Beijing", lng: 116.41, lat: 39.90, weight: 0.85 },
    { name: "Guangzhou", lng: 113.26, lat: 23.13, weight: 0.60 },
    { name: "Shenzhen", lng: 114.06, lat: 22.54, weight: 0.55 },
    { name: "Chengdu", lng: 104.07, lat: 30.57, weight: 0.40 },
  ],
  RU: [
    { name: "Moscow", lng: 37.62, lat: 55.76, weight: 1.0 },
    { name: "St Petersburg", lng: 30.32, lat: 59.93, weight: 0.42 },
    { name: "Novosibirsk", lng: 82.93, lat: 55.01, weight: 0.12 },
    { name: "Yekaterinburg", lng: 60.60, lat: 56.84, weight: 0.11 },
    { name: "Kazan", lng: 49.11, lat: 55.80, weight: 0.10 },
  ],
  MM: [
    { name: "Yangon", lng: 96.20, lat: 16.87, weight: 1.0 },
    { name: "Mandalay", lng: 96.08, lat: 21.97, weight: 0.35 },
    { name: "Naypyidaw", lng: 96.13, lat: 19.76, weight: 0.18 },
    { name: "Mawlamyine", lng: 97.63, lat: 16.49, weight: 0.10 },
    { name: "Taunggyi", lng: 97.04, lat: 20.78, weight: 0.08 },
  ],
  BY: [
    { name: "Minsk", lng: 27.56, lat: 53.90, weight: 1.0 },
    { name: "Gomel", lng: 30.98, lat: 52.44, weight: 0.26 },
    { name: "Mogilev", lng: 30.34, lat: 53.91, weight: 0.18 },
    { name: "Vitebsk", lng: 30.20, lat: 55.19, weight: 0.17 },
    { name: "Grodno", lng: 23.83, lat: 53.68, weight: 0.16 },
  ],
  TM: [
    { name: "Ashgabat", lng: 58.39, lat: 37.95, weight: 1.0 },
    { name: "Turkmenabat", lng: 63.58, lat: 39.07, weight: 0.28 },
    { name: "Dashoguz", lng: 59.97, lat: 41.84, weight: 0.22 },
    { name: "Mary", lng: 61.83, lat: 37.60, weight: 0.18 },
    { name: "Balkanabat", lng: 54.37, lat: 39.51, weight: 0.10 },
  ],
  VN: [
    { name: "Ho Chi Minh", lng: 106.63, lat: 10.82, weight: 1.0 },
    { name: "Hanoi", lng: 105.85, lat: 21.03, weight: 0.85 },
    { name: "Da Nang", lng: 108.21, lat: 16.05, weight: 0.20 },
    { name: "Hai Phong", lng: 106.68, lat: 20.86, weight: 0.18 },
    { name: "Can Tho", lng: 105.77, lat: 10.04, weight: 0.15 },
  ],
  CU: [
    { name: "Havana", lng: -82.37, lat: 23.11, weight: 1.0 },
    { name: "Santiago", lng: -75.83, lat: 20.02, weight: 0.25 },
    { name: "Camaguey", lng: -77.92, lat: 21.38, weight: 0.15 },
    { name: "Holguin", lng: -76.26, lat: 20.72, weight: 0.14 },
    { name: "Santa Clara", lng: -79.97, lat: 22.41, weight: 0.12 },
  ],
  SA: [
    { name: "Riyadh", lng: 46.68, lat: 24.71, weight: 1.0 },
    { name: "Jeddah", lng: 39.17, lat: 21.49, weight: 0.55 },
    { name: "Mecca", lng: 39.83, lat: 21.39, weight: 0.30 },
    { name: "Medina", lng: 39.61, lat: 24.47, weight: 0.22 },
    { name: "Dammam", lng: 50.10, lat: 26.43, weight: 0.20 },
  ],
  PK: [
    { name: "Karachi", lng: 67.01, lat: 24.86, weight: 1.0 },
    { name: "Lahore", lng: 74.35, lat: 31.55, weight: 0.75 },
    { name: "Islamabad", lng: 73.05, lat: 33.69, weight: 0.30 },
    { name: "Faisalabad", lng: 73.08, lat: 31.42, weight: 0.25 },
    { name: "Rawalpindi", lng: 73.05, lat: 33.60, weight: 0.22 },
  ],
  UZ: [
    { name: "Tashkent", lng: 69.28, lat: 41.30, weight: 1.0 },
    { name: "Samarkand", lng: 66.96, lat: 39.65, weight: 0.25 },
    { name: "Namangan", lng: 71.67, lat: 41.00, weight: 0.20 },
    { name: "Bukhara", lng: 64.42, lat: 39.77, weight: 0.15 },
    { name: "Andijan", lng: 72.34, lat: 40.78, weight: 0.14 },
  ],
  TH: [
    { name: "Bangkok", lng: 100.50, lat: 13.76, weight: 1.0 },
    { name: "Chiang Mai", lng: 98.98, lat: 18.79, weight: 0.15 },
    { name: "Pattaya", lng: 100.88, lat: 12.93, weight: 0.12 },
    { name: "Nakhon Ratchasima", lng: 102.10, lat: 14.97, weight: 0.10 },
    { name: "Khon Kaen", lng: 102.83, lat: 16.43, weight: 0.09 },
  ],
  AE: [
    { name: "Dubai", lng: 55.27, lat: 25.20, weight: 1.0 },
    { name: "Abu Dhabi", lng: 54.37, lat: 24.45, weight: 0.60 },
    { name: "Sharjah", lng: 55.39, lat: 25.34, weight: 0.30 },
    { name: "Al Ain", lng: 55.76, lat: 24.19, weight: 0.15 },
    { name: "Ajman", lng: 55.44, lat: 25.41, weight: 0.10 },
  ],
};

// Country center coords (used for country markers / fallback)
const COORDS: Record<string, [number, number]> = {
  // Censored regions
  IR: [53.69, 32.43], CN: [104.20, 35.86], RU: [40.32, 55.75],
  MM: [96.08, 19.76], BY: [27.95, 53.71], TM: [59.56, 38.97],
  VN: [108.28, 14.06], CU: [-77.78, 21.52], PK: [69.35, 30.38],
  TH: [100.99, 15.87], UZ: [64.59, 41.38], SA: [45.08, 23.89], AE: [53.85, 23.42],
  IN: [78.96, 20.59], BD: [90.36, 23.68], EG: [30.80, 26.82],
  TR: [35.24, 38.96], VE: [-66.59, 6.42], KZ: [66.92, 48.02],
  // Non-censored user countries
  US: [-95.71, 37.09], GB: [-3.44, 55.38], FR: [2.21, 46.23],
  DE: [10.45, 51.17], JP: [138.25, 36.20], KR: [127.77, 35.91],
  AU: [133.78, -25.27], CA: [-106.35, 56.13], SE: [18.64, 60.13],
  CH: [8.23, 46.82], NL: [5.29, 52.13], SG: [103.82, 1.35],
  BR: [-51.93, -14.24], MX: [-102.55, 23.63], ID: [113.92, -0.79],
  NG: [8.68, 9.08], KE: [37.91, -0.02], ZA: [22.94, -30.56],
  UA: [31.17, 48.38], PL: [19.15, 51.92], RO: [24.97, 45.94],
  IQ: [43.68, 33.22], AF: [67.71, 33.94], MY: [101.98, 4.21],
  PH: [121.77, 12.88], ET: [40.49, 9.15], TZ: [34.89, -6.37],
};

// ISO 3166-1 numeric → alpha-2 for countries we care about
const NUM_TO_ALPHA2: Record<string, string> = {
  "364": "IR", "156": "CN", "643": "RU", "104": "MM", "112": "BY",
  "795": "TM", "704": "VN", "192": "CU", "682": "SA", "586": "PK",
  "860": "UZ", "764": "TH", "356": "IN", "050": "BD", "818": "EG",
  "792": "TR", "862": "VE", "398": "KZ",
  // Uncensored proxy host countries
  "840": "US", "826": "GB", "250": "FR", "276": "DE", "392": "JP",
  "410": "KR", "036": "AU", "124": "CA", "752": "SE", "756": "CH",
  "528": "NL", "702": "SG",
};

function geoToAlpha2(geo: { properties: Record<string, string>; id: string }): string {
  return geo.properties.ISO_A2 || NUM_TO_ALPHA2[geo.id] || geo.id;
}

const PROXY_NODES = [
  { id: "us-east", lng: -74.0, lat: 40.7 },
  { id: "us-west", lng: -118.2, lat: 34.1 },
  { id: "eu-west", lng: -0.13, lat: 51.5 },
  { id: "eu-central", lng: 13.4, lat: 52.5 },
  { id: "ap-east", lng: 139.7, lat: 35.7 },
  { id: "ap-south", lng: 103.9, lat: 1.35 },
];

interface TrafficArc {
  id: string;
  from: [number, number];
  to: [number, number];
  traffic: number;
  color: string;
  curveIndex?: number;
  country: string;
}

interface ScatteredNode {
  id: string;
  lng: number;
  lat: number;
  country: string;
  color: string;
}

export interface MapSelection {
  country: string | null;
  asn: string | null;
  asnName: string | null;
  countryASNs: DashboardASN[];
}

interface ProxyNode {
  id: string;
  lng: number;
  lat: number;
  dc: DashboardDataCenter | null;
  providerName?: string;
  providerRoutes?: number;
  color: string;
}

interface WorldMapProps {
  liveCountries?: DashboardCountry[];
  dataCenters?: DashboardDataCenter[];
  trafficFlows?: DashboardTrafficFlow[];
  onSelectionChange?: (selection: MapSelection) => void;
  myProxyView?: boolean;
  myGeo?: GeoResult | null;
  peerGeos?: GeoResult[];
}

// Provider colors — each cloud provider gets a distinct hue
// Keys are matched via includes() so "linode-first" still matches "linode"
const PROVIDER_COLOR_ENTRIES: [string, string][] = [
  ["oci", "#e06060"],         // red
  ["linode", "#00b050"],      // green
  ["alicloud", "#f0a030"],    // amber
  ["brightdata", "#a080e0"],  // violet
  ["oxylabs", "#60c0e0"],     // sky
  ["iproyal", "#e0a0c0"],     // pink
  ["soax", "#c0e060"],        // lime
  ["packetstream", "#80d0a0"], // mint
];
const PROVIDER_COLOR_FALLBACKS = ["#00e5c8", "#f0a030", "#a080e0", "#e06080", "#60c0e0", "#c0e060"];

// Stable color per provider name — uses substring match and deterministic hash fallback
function providerColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of PROVIDER_COLOR_ENTRIES) {
    if (lower.includes(key)) return color;
  }
  // Deterministic fallback based on name hash
  let hash = 0;
  for (let i = 0; i < lower.length; i++) hash = ((hash << 5) - hash + lower.charCodeAt(i)) | 0;
  return PROVIDER_COLOR_FALLBACKS[Math.abs(hash) % PROVIDER_COLOR_FALLBACKS.length];
}

// Each censored region gets a distinct warm hue
const REGION_COLORS: Record<string, string> = {
  IR: "#e8b87a",  // amber
  CN: "#d4a0c8",  // mauve
  RU: "#a0c8e0",  // pale steel
  MM: "#c8d8a0",  // sage
  BY: "#b0b8d8",  // lavender
  TM: "#e0c0a0",  // sand
  VN: "#a8d0b8",  // seafoam
  CU: "#e0a8a0",  // coral
  SA: "#d0b890",  // wheat
  PK: "#c0d0c0",  // celadon
  UZ: "#d8c090",  // honey
  TH: "#b8c8d0",  // mist
  AE: "#d0b0c0",  // rose dust
};
const DEFAULT_ARC_COLOR = "#d5c8a0";

function regionColor(country: string): string {
  return REGION_COLORS[country] ?? DEFAULT_ARC_COLOR;
}

// Deterministic pseudo-random for stable scatter positions
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Scatter user nodes around cities proportional to city population
function scatterNodes(country: string, count: number, color: string): ScatteredNode[] {
  const cities = CITIES[country];
  if (!cities) return [];
  const rand = seededRandom(country.charCodeAt(0) * 1000 + country.charCodeAt(1) * 100 + count);
  const totalWeight = cities.reduce((s, c) => s + c.weight, 0);
  const nodes: ScatteredNode[] = [];
  for (const city of cities) {
    const cityCount = Math.max(1, Math.round((city.weight / totalWeight) * count));
    const spread = 2.5 + city.weight * 1.5; // bigger cities get wider spread
    for (let i = 0; i < cityCount && nodes.length < count; i++) {
      nodes.push({
        id: `scatter-${country}-${nodes.length}`,
        lng: city.lng + (rand() - 0.5) * spread,
        lat: city.lat + (rand() - 0.5) * spread * 0.7,
        country,
        color,
      });
    }
  }
  return nodes;
}


function nearestProxy(lng: number, lat: number, nodes: ProxyNode[]) {
  let best = nodes[0];
  let bestDist = Infinity;
  for (const p of nodes) {
    const d = (p.lng - lng) ** 2 + (p.lat - lat) ** 2;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

function buildCountryArcs(
  country: string,
  traffic: number,
  target: ProxyNode,
  arcColor: string,
  idPrefix: string,
  skipLowTraffic = false,
): TrafficArc[] {
  const arcs: TrafficArc[] = [];
  const cities = CITIES[country];
  if (cities && cities.length > 0) {
    const totalWeight = cities.reduce((s, c) => s + c.weight, 0);
    for (const city of cities) {
      const cityTraffic = traffic * (city.weight / totalWeight) * cities.length;
      if (cityTraffic < 0.05 && skipLowTraffic) continue;
      const count = cityTraffic > 0.6 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        arcs.push({
          id: `${idPrefix}-${country}-${city.name}-${target.id}-${k}`,
          from: [city.lng, city.lat],
          to: [target.lng, target.lat],
          traffic: Math.min(1, cityTraffic),
          color: arcColor,
          curveIndex: k,
          country,
        });
      }
    }
  } else {
    const coords = COORDS[country];
    if (coords) {
      arcs.push({
        id: `${idPrefix}-${country}-${target.id}-0`,
        from: coords,
        to: [target.lng, target.lat],
        traffic,
        color: arcColor,
        curveIndex: 0,
        country,
      });
    }
  }
  return arcs;
}

function buildMockArcs(proxyNodes: ProxyNode[]): { arcs: TrafficArc[]; scattered: ScatteredNode[] } {
  const arcs: TrafficArc[] = [];
  const allScattered: ScatteredNode[] = [];

  for (const country of Array.from(CENSORED)) {
    const cities = CITIES[country];
    if (!cities) continue;
    const color = regionColor(country);
    allScattered.push(...scatterNodes(country, Math.min(15, Math.max(4, cities.length * 3)), color));

    const proxy = nearestProxy(cities[0].lng, cities[0].lat, proxyNodes);
    arcs.push(...buildCountryArcs(country, 0.5, proxy, color, "mock"));
  }
  return { arcs, scattered: allScattered };
}

function buildLiveArcs(countries: DashboardCountry[], proxyNodes: ProxyNode[]): { arcs: TrafficArc[]; scattered: ScatteredNode[] } {
  const maxASN = Math.max(1, ...countries.map((c) => c.asnCount));
  const arcs: TrafficArc[] = [];
  const allScattered: ScatteredNode[] = [];

  for (const cd of countries) {
    const color = regionColor(cd.country);
    const traffic = cd.asnCount / maxASN;
    const scatterCount = Math.min(20, Math.max(3, Math.round(Math.sqrt(cd.asnCount) * 2)));
    allScattered.push(...scatterNodes(cd.country, scatterCount, color));

    const cities = CITIES[cd.country];
    const refCity = cities?.[0];
    const coords = refCity ? [refCity.lng, refCity.lat] as [number, number] : COORDS[cd.country];
    if (!coords) continue;
    const proxy = nearestProxy(coords[0], coords[1], proxyNodes);
    arcs.push(...buildCountryArcs(cd.country, traffic, proxy, color, "live"));
  }
  return { arcs, scattered: allScattered };
}

// Build arcs from real bandit traffic flow data — shows actual DC-to-country relationships
function buildFlowArcs(
  flows: DashboardTrafficFlow[],
  proxyNodes: ProxyNode[],
  countries: DashboardCountry[],
): { arcs: TrafficArc[]; scattered: ScatteredNode[] } {
  const arcs: TrafficArc[] = [];
  const allScattered: ScatteredNode[] = [];
  const maxPulls = Math.max(1, ...flows.map((f) => f.weightedPulls));

  // Index one proxy node per region for arc targeting (use DC center position)
  const nodeByRegion = new Map<number, ProxyNode>();
  for (const n of proxyNodes) {
    if (n.dc && !nodeByRegion.has(n.dc.regionId)) {
      nodeByRegion.set(n.dc.regionId, n);
    }
  }
  // Arcs go to the nearest provider node within the target region

  // Group flows by country
  const flowsByCountry = new Map<string, DashboardTrafficFlow[]>();
  for (const f of flows) {
    const list = flowsByCountry.get(f.country) || [];
    list.push(f);
    flowsByCountry.set(f.country, list);
  }

  // Index countries for O(1) lookup
  const countryMap = new Map(countries.map((c) => [c.country, c]));

  for (const [country, countryFlows] of flowsByCountry) {
    const color = regionColor(country);
    const cd = countryMap.get(country);
    const scatterCount = cd
      ? Math.min(20, Math.max(3, Math.round(Math.sqrt(cd.asnCount) * 2)))
      : 8;
    allScattered.push(...scatterNodes(country, scatterCount, color));

    for (const flow of countryFlows) {
      const proxyNode = nodeByRegion.get(flow.regionId);
      if (!proxyNode) continue;
      const traffic = flow.weightedPulls / maxPulls;
      arcs.push(...buildCountryArcs(country, traffic, proxyNode, proxyNode.color, "flow", true));
    }
  }
  return { arcs, scattered: allScattered };
}

// High graceful arc — curvature peaks well above midpoint
// curveIndex offsets parallel arcs so they don't overlap
function arcPath(
  from: [number, number],
  to: [number, number],
  proj: (c: [number, number]) => [number, number] | null,
  curveIndex = 0,
): string | null {
  const p1 = proj(from);
  const p2 = proj(to);
  if (!p1 || !p2) return null;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return null;
  const baseCurvature = dist * 0.35;
  const spread = dist * 0.12;
  const offset = (curveIndex - 0.5) * spread;
  const curvature = baseCurvature + offset;
  const mx = (p1[0] + p2[0]) / 2 - (dy / dist) * curvature;
  const my = (p1[1] + p2[1]) / 2 + (dx / dist) * curvature;
  return `M${p1[0]},${p1[1]} Q${mx},${my} ${p2[0]},${p2[1]}`;
}

// ── Draw-on arc: line grows from origin to destination, holds, fades ──

function DrawOnArc({
  arc,
  proj,
  progress,
  opacity,
}: {
  arc: TrafficArc;
  proj: (c: [number, number]) => [number, number] | null;
  progress: number;
  opacity: number;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLen, setPathLen] = useState(0);

  const d = useMemo(() => arcPath(arc.from, arc.to, proj, arc.curveIndex ?? 0), [arc, proj]);

  useEffect(() => {
    if (pathRef.current) {
      setPathLen(pathRef.current.getTotalLength());
    }
  }, [d]);

  if (!d) return null;

  const baseWidth = 0.5 + arc.traffic * 1.0;
  const drawn = pathLen * Math.min(progress, 1);
  const dashOffset = pathLen - drawn;

  const originPt = proj(arc.from);

  return (
    <g opacity={opacity}>
      {pathLen > 0 && (
        <path
          d={d}
          fill="none"
          stroke={arc.color}
          strokeWidth={baseWidth * 4}
          strokeLinecap="round"
          opacity={0.12}
          strokeDasharray={pathLen}
          strokeDashoffset={dashOffset}
        />
      )}
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke={arc.color}
        strokeWidth={baseWidth}
        strokeLinecap="round"
        opacity={0.85}
        strokeDasharray={pathLen || 1000}
        strokeDashoffset={pathLen > 0 ? dashOffset : 1000}
      />
      {pathLen > 0 && progress > 0 && progress < 1 && (
        <path
          d={d}
          fill="none"
          stroke="white"
          strokeWidth={baseWidth * 0.5}
          strokeLinecap="round"
          opacity={0.55}
          strokeDasharray={`${Math.min(drawn, 8)} ${pathLen}`}
          strokeDashoffset={-Math.max(drawn - 8, 0)}
        />
      )}
      {originPt && progress > 0 && (
        <circle
          cx={originPt[0]}
          cy={originPt[1]}
          r={baseWidth * 1.5}
          fill={arc.color}
          opacity={0.8}
        />
      )}
    </g>
  );
}

// ── Arc scheduler — staggers arcs so a few are always animating ──

function ArcLayer({
  arcs,
  proj,
}: {
  arcs: TrafficArc[];
  proj: (c: [number, number]) => [number, number] | null;
}) {
  const [time, setTime] = useState(0);
  const startRef = useRef(performance.now());

  // 10fps is plenty for slow arc draw-on animations — avoids 60fps React reconciliation
  useEffect(() => {
    const id = setInterval(() => {
      setTime((performance.now() - startRef.current) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, []);

  if (arcs.length === 0) return null;

  const drawDur = 2.8;
  const holdDur = 2.0;
  const fadeDur = 1.4;
  const cycleDur = drawDur + holdDur + fadeDur;
  const totalCycle = cycleDur + 1.5;

  return (
    <g>
      {arcs.map((arc) => {
        // Stable offset derived from arc ID so filtering doesn't disrupt timing
        let hash = 0;
        for (let j = 0; j < arc.id.length; j++) {
          hash = ((hash << 5) - hash + arc.id.charCodeAt(j)) | 0;
        }
        const stableOffset = (Math.abs(hash) % 1000) / 1000 * totalCycle * 3;
        const siblingDelay = (arc.curveIndex ?? 0) * 0.6;
        const offset = stableOffset + siblingDelay;
        const localTime = ((time - offset) % totalCycle + totalCycle) % totalCycle;
        if (localTime < 0) return null;

        let progress: number;
        let opacity: number;

        if (localTime < drawDur) {
          const t = localTime / drawDur;
          progress = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          opacity = 1;
        } else if (localTime < drawDur + holdDur) {
          progress = 1;
          opacity = 1;
        } else if (localTime < cycleDur) {
          const t = (localTime - drawDur - holdDur) / fadeDur;
          progress = 1;
          opacity = 1 - t;
        } else {
          return null;
        }

        return (
          <DrawOnArc
            key={arc.id}
            arc={arc}
            proj={proj}
            progress={progress}
            opacity={opacity}
          />
        );
      })}
    </g>
  );
}

// ── Markers ──

const DCMarker = memo(function DCMarker({ node, dimmed }: { node: ProxyNode; dimmed: boolean }) {
  const [hovered, setHovered] = useState(false);
  const dc = node.dc;
  const hasData = dc !== null;
  const routes = node.providerRoutes ?? (hasData ? dc.totalRoutes : 0);
  const baseSize = hasData ? Math.max(2.5, Math.min(6, 1.5 + Math.sqrt(routes) * 0.6)) : 1.5;
  const color = node.color;
  const label = node.providerName
    ? node.providerName
    : hasData ? dc.city || dc.regionName : node.id;

  return (
    <Marker coordinates={[node.lng, node.lat]}>
      <g
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: hasData ? "pointer" : "default" }}
      >
        {hasData && !dimmed && (
          <circle r={baseSize + 3} fill="none" stroke={color} strokeWidth={0.3} opacity={0.15}>
            <animate attributeName="r" from={String(baseSize)} to={String(baseSize + 5)} dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.2" to="0" dur="3s" repeatCount="indefinite" />
          </circle>
        )}
        <circle r={baseSize + 1.5} fill={color} opacity={dimmed ? 0.03 : 0.08} />
        <circle r={baseSize} fill={color} opacity={dimmed ? 0.15 : 0.55}
          style={{ filter: dimmed ? "none" : `drop-shadow(0 0 4px ${color})` }} />
        <text y={-baseSize - 2.5} textAnchor="middle"
          style={{ fontFamily: "var(--font-mono)", fontSize: "3.2px", fill: color, opacity: dimmed ? 0.15 : 0.55 }}>
          {label}
        </text>
        <circle r={baseSize + 5} fill="transparent" />
      </g>
      {hovered && hasData && !dimmed && (
        <foreignObject x={baseSize + 4} y={-35} width={150} height={100} style={{ overflow: "visible", pointerEvents: "none" }}>
          <div style={{
            background: "rgba(10, 12, 18, 0.94)",
            border: `1px solid ${color}30`,
            borderRadius: "6px",
            padding: "8px 10px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "#c8ccd4",
            lineHeight: 1.5,
            backdropFilter: "blur(8px)",
            boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 15px ${color}10`,
          }}>
            <div style={{ fontWeight: 700, color, fontSize: "11px", marginBottom: 2 }}>
              {node.providerName ? `${node.providerName} — ${dc.city}` : `${dc.regionName} — ${dc.city}`}
            </div>
            <div style={{ color: "#8890a0", marginBottom: 5, fontSize: "9px" }}>
              {routes} routes · {dc.regionName} · {dc.country}
            </div>
            {dc.tracks.length > 0 && (
              <div>
                <div style={{ fontSize: "8px", color: "#6a7080", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Protocols</div>
                {dc.tracks.map((t) => (
                  <div key={t.trackId} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: "#a0a8b4" }}>{t.protocolName || t.trackName}</span>
                    <span style={{ color: "#6a7080" }}>{t.activeRoutes}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </Marker>
  );
});

const NodeMarker = memo(function NodeMarker({ node, pulse, dimmed }: { node: ConnectionNode; pulse: boolean; dimmed: boolean }) {
  const color = node.type === "volunteer" ? "#c8b878" : "#d4a860";
  const size = node.type === "volunteer" ? 2.5 : 2;
  const baseOpacity = dimmed ? 0.12 : node.active ? 0.75 : 0.25;
  return (
    <Marker coordinates={[node.lng, node.lat]}>
      {node.active && pulse && !dimmed && (
        <circle r={size + 5} fill="none" stroke={color} strokeWidth={0.3} opacity={0.15}>
          <animate attributeName="r" from={String(size + 1)} to={String(size + 8)} dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.3" to="0" dur="2.5s" repeatCount="indefinite" />
        </circle>
      )}
      <circle
        r={size}
        fill={color}
        opacity={baseOpacity}
        style={{ filter: node.active && !dimmed ? `drop-shadow(0 0 2px ${color})` : "none" }}
      />
    </Marker>
  );
});

const ScatterMarker = memo(function ScatterMarker({ node, dimmed }: { node: ScatteredNode; dimmed: boolean }) {
  const opacity = dimmed ? 0.1 : 0.45;
  return (
    <Marker coordinates={[node.lng, node.lat]}>
      <circle r={1} fill={node.color} opacity={opacity} />
    </Marker>
  );
});

const LiveCountryMarker = memo(function LiveCountryMarker({ country, index, dimmed }: { country: DashboardCountry; index: number; dimmed: boolean }) {
  const coords = COORDS[country.country];
  if (!coords) return null;
  const color = regionColor(country.country);
  const size = Math.max(1.5, Math.min(4, country.asnCount / 2));
  const baseOpacity = dimmed ? 0.15 : 0.6;
  return (
    <Marker coordinates={coords}>
      {!dimmed && (
        <circle r={size + 2} fill="none" stroke={color} strokeWidth={0.3} opacity={0.15}>
          <animate attributeName="r" from={String(size)} to={String(size + 5)} dur="3s" begin={`${index * 0.3}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.2" to="0" dur="3s" begin={`${index * 0.3}s`} repeatCount="indefinite" />
        </circle>
      )}
      <circle r={size} fill={color} opacity={baseOpacity} style={{ filter: dimmed ? "none" : `drop-shadow(0 0 4px ${color})` }} />
      <text y={-size - 2.5} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: "4px", fill: "#e8ecf4", opacity: dimmed ? 0.2 : 0.65 }}>
        {country.country}
      </text>
    </Marker>
  );
});

// ── Mock ISP data for when API is unavailable ──

const MOCK_ISPS: Record<string, DashboardASN[]> = {
  IR: [
    { asn: "AS44244", country: "IR", numArms: 18, numBlocked: 3, totalPulls: 4200, entropy: 2.1, snapshotTime: "", topArms: [] },
    { asn: "AS197207", country: "IR", numArms: 12, numBlocked: 5, totalPulls: 3100, entropy: 1.4, snapshotTime: "", topArms: [] },
    { asn: "AS58224", country: "IR", numArms: 9, numBlocked: 1, totalPulls: 1800, entropy: 2.8, snapshotTime: "", topArms: [] },
    { asn: "AS12880", country: "IR", numArms: 15, numBlocked: 7, totalPulls: 5200, entropy: 0.9, snapshotTime: "", topArms: [] },
  ],
  CN: [
    { asn: "AS4134", country: "CN", numArms: 24, numBlocked: 8, totalPulls: 9400, entropy: 1.8, snapshotTime: "", topArms: [] },
    { asn: "AS4837", country: "CN", numArms: 20, numBlocked: 6, totalPulls: 7200, entropy: 2.0, snapshotTime: "", topArms: [] },
    { asn: "AS9808", country: "CN", numArms: 16, numBlocked: 4, totalPulls: 5100, entropy: 2.4, snapshotTime: "", topArms: [] },
    { asn: "AS56040", country: "CN", numArms: 11, numBlocked: 9, totalPulls: 3800, entropy: 0.6, snapshotTime: "", topArms: [] },
    { asn: "AS56046", country: "CN", numArms: 8, numBlocked: 2, totalPulls: 2100, entropy: 2.7, snapshotTime: "", topArms: [] },
  ],
  RU: [
    { asn: "AS12389", country: "RU", numArms: 14, numBlocked: 4, totalPulls: 3900, entropy: 1.9, snapshotTime: "", topArms: [] },
    { asn: "AS25513", country: "RU", numArms: 10, numBlocked: 2, totalPulls: 2400, entropy: 2.5, snapshotTime: "", topArms: [] },
    { asn: "AS8359", country: "RU", numArms: 12, numBlocked: 5, totalPulls: 3200, entropy: 1.3, snapshotTime: "", topArms: [] },
  ],
};

// Well-known ASN → ISP name mapping
const ASN_NAMES: Record<string, string> = {
  AS44244: "Irancell", AS197207: "MCI", AS58224: "TCI", AS12880: "Afranet",
  AS4134: "China Telecom", AS4837: "China Unicom", AS9808: "China Mobile",
  AS56040: "China Mobile GD", AS56046: "China Mobile ZJ",
  AS12389: "Rostelecom", AS25513: "PJSC MTS", AS8359: "MTS OJSC",
  AS17974: "Telkom Indonesia", AS209: "CenturyLink",
};

export function asnDisplayName(asn: string): string {
  return ASN_NAMES[asn] || asn;
}

// ── ISP Panel — shown when a country is selected ──

function ISPPanel({
  country,
  asns,
  loading,
  selectedASN,
  onSelectASN,
  onClose,
}: {
  country: string;
  asns: DashboardASN[];
  loading: boolean;
  selectedASN: string | null;
  onSelectASN: (asn: string | null) => void;
  onClose: () => void;
}) {
  const color = regionColor(country);
  const maxPulls = Math.max(1, ...asns.map((a) => a.totalPulls));

  return (
    <div
      style={{
        position: "absolute",
        bottom: "5.5rem",
        right: "0.75rem",
        zIndex: 20,
        width: "260px",
        background: "rgba(12, 14, 20, 0.92)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${color}30`,
        borderRadius: "6px",
        overflow: "hidden",
        fontFamily: "var(--font-mono)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.5rem 0.65rem",
          borderBottom: `1px solid ${color}18`,
          background: `${color}08`,
        }}
      >
        <div>
          <div style={{ fontSize: "0.65rem", fontWeight: 600, color }}>
            {country}
          </div>
          <div style={{ fontSize: "0.5rem", color: "#8890a0", marginTop: "1px" }}>
            {asns.length} ISP{asns.length !== 1 ? "s" : ""} detected
          </div>
        </div>
        <div
          onClick={onClose}
          style={{
            fontSize: "0.65rem",
            color: "#667080",
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: "3px",
            lineHeight: 1,
          }}
        >
          ×
        </div>
      </div>

      {/* ISP list */}
      <div style={{ maxHeight: "320px", overflowY: "auto", padding: "0.3rem 0" }}>
        {loading ? (
          <div style={{ padding: "1rem", textAlign: "center", fontSize: "0.55rem", color: "#667080" }}>
            Loading ISPs...
          </div>
        ) : asns.length === 0 ? (
          <div style={{ padding: "1rem", textAlign: "center", fontSize: "0.55rem", color: "#667080" }}>
            No ISP data
          </div>
        ) : (
          asns.map((asn) => {
            const isSelected = selectedASN === asn.asn;
            const blockRate = asn.numArms > 0 ? asn.numBlocked / asn.numArms : 0;
            const pullBar = asn.totalPulls / maxPulls;
            return (
              <div
                key={asn.asn}
                onClick={() => onSelectASN(isSelected ? null : asn.asn)}
                style={{
                  padding: "0.4rem 0.65rem",
                  cursor: "pointer",
                  background: isSelected ? `${color}15` : "transparent",
                  borderLeft: isSelected ? `2px solid ${color}` : "2px solid transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = `${color}0a`;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: "0.58rem", fontWeight: 500, color: isSelected ? color : "#c8ccd4" }}>
                    {asnDisplayName(asn.asn)}
                  </span>
                  <span style={{ fontSize: "0.48rem", color: "#667080" }}>
                    {asn.asn}
                  </span>
                </div>
                {/* Traffic bar */}
                <div style={{ marginTop: "3px", height: "3px", background: "#ffffff08", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pullBar * 100}%`, background: color, opacity: 0.5, borderRadius: "2px" }} />
                </div>
                {/* Stats row */}
                <div style={{ display: "flex", gap: "0.6rem", marginTop: "3px", fontSize: "0.48rem", color: "#667080" }}>
                  <span>{asn.numArms} arms</span>
                  <span style={{ color: blockRate > 0.3 ? "#e0a080" : blockRate > 0.1 ? "#d8c090" : "#a0c8a0" }}>
                    {asn.numBlocked} blocked
                  </span>
                  <span>{asn.totalPulls.toLocaleString()} pulls</span>
                </div>
                {/* Arm detail when selected */}
                {isSelected && asn.topArms.length > 0 && (
                  <div style={{ marginTop: "6px", borderTop: `1px solid ${color}15`, paddingTop: "5px" }}>
                    {asn.topArms.map((arm) => {
                      const sr = arm.successRate ?? 0;
                      const srColor = sr > 0.8 ? "#a0c8a0" : sr > 0.5 ? "#d8c090" : sr > 0 ? "#e0a080" : "#667080";
                      const prob = arm.selectionProbability ?? 0;
                      return (
                        <div key={arm.armId} style={{ marginBottom: "5px", fontSize: "0.48rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: arm.blocked ? "#e0a080" : "#c8ccd4", fontWeight: 500 }}>
                              {arm.trackName || arm.armId}
                              {arm.regionName ? ` · ${arm.regionName}` : ""}
                            </span>
                            {arm.blocked && <span style={{ color: "#e06060", fontSize: "0.42rem" }}>BLOCKED</span>}
                          </div>
                          {/* Success rate bar */}
                          {arm.totalTests != null && arm.totalTests > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                              <div style={{ flex: 1, height: "3px", background: "#ffffff08", borderRadius: "2px", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${sr * 100}%`, background: srColor, borderRadius: "2px" }} />
                              </div>
                              <span style={{ color: srColor, minWidth: "28px", textAlign: "right" }}>
                                {Math.round(sr * 100)}%
                              </span>
                            </div>
                          )}
                          {/* Metrics row */}
                          <div style={{ display: "flex", gap: "0.5rem", marginTop: "2px", fontSize: "0.42rem", color: "#667080" }}>
                            {arm.totalTests != null && arm.totalTests > 0 && (
                              <span>{arm.successCount}/{arm.totalTests} tests</span>
                            )}
                            {prob > 0 && <span>P={Math.round(prob * 100)}%</span>}
                            {arm.routeCount != null && arm.routeCount > 0 && <span>{arm.routeCount} routes</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      {selectedASN && (
        <div style={{ padding: "0.35rem 0.65rem", borderTop: `1px solid ${color}18`, fontSize: "0.48rem", color: "#667080" }}>
          Showing traffic for {asnDisplayName(selectedASN)}
        </div>
      )}
    </div>
  );
}

// ── Main ──

// ── "My Proxy" markers ──

const MyLocationMarker = memo(function MyLocationMarker({ geo }: { geo: GeoResult }) {
  return (
    <Marker coordinates={[geo.lng, geo.lat]}>
      <circle r={6} fill="none" stroke="#00e5c8" strokeWidth={0.5} opacity={0.3}>
        <animate attributeName="r" from="4" to="14" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.4" to="0" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle r={4} fill="#00e5c8" opacity={0.2} />
      <circle r={2.5} fill="#00e5c8" opacity={0.7} style={{ filter: "drop-shadow(0 0 4px #00e5c8)" }} />
      <text y={-7} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: "4px", fill: "#00e5c8", fontWeight: 600 }}>
        YOU
      </text>
    </Marker>
  );
});

const PeerMarker = memo(function PeerMarker({ geo, index }: { geo: GeoResult; index: number }) {
  return (
    <Marker coordinates={[geo.lng, geo.lat]}>
      <circle r={3} fill="none" stroke="#f0a030" strokeWidth={0.3} opacity={0.2}>
        <animate attributeName="r" from="2" to="8" dur="2.5s" begin={`${index * 0.4}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.3" to="0" dur="2.5s" begin={`${index * 0.4}s`} repeatCount="indefinite" />
      </circle>
      <circle r={2} fill="#f0a030" opacity={0.6} style={{ filter: "drop-shadow(0 0 3px #f0a030)" }} />
      {geo.city && (
        <text y={-5} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: "3px", fill: "#f0a030", opacity: 0.7 }}>
          {geo.city}
        </text>
      )}
    </Marker>
  );
});

function WorldMap({ liveCountries, dataCenters, trafficFlows, onSelectionChange, myProxyView, myGeo, peerGeos }: WorldMapProps) {
  const [pulseIndex, setPulseIndex] = useState(0);
  const [projectionFn, setProjectionFn] = useState<((c: [number, number]) => [number, number] | null) | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedASN, setSelectedASN] = useState<string | null>(null);
  const [countryASNs, setCountryASNs] = useState<DashboardASN[]>([]);
  const [asnLoading, setAsnLoading] = useState(false);

  // Compute proxy nodes from real DC data, falling back to hardcoded
  // Split each DC into one node per provider, offset slightly so they don't stack
  const effectiveProxyNodes: ProxyNode[] = useMemo(() => {
    if (dataCenters && dataCenters.length > 0) {
      const nodes: ProxyNode[] = [];
      for (const dc of dataCenters) {
        if (dc.providers && dc.providers.length > 0) {
          const count = dc.providers.length;
          dc.providers.forEach((prov, i) => {
            const angle = (2 * Math.PI * i) / count - Math.PI / 2;
            const spread = count > 1 ? 0.5 : 0;
            nodes.push({
              id: `${dc.regionName}-${prov.name}`,
              lng: dc.longitude + Math.cos(angle) * spread,
              lat: dc.latitude + Math.sin(angle) * spread * 0.7,
              dc,
              providerName: prov.name,
              providerRoutes: prov.activeRoutes,
              color: providerColor(prov.name),
            });
          });
        } else {
          nodes.push({
            id: dc.regionName,
            lng: dc.longitude,
            lat: dc.latitude,
            dc,
            color: "#00e5c8",
          });
        }
      }
      return nodes;
    }
    return PROXY_NODES.map((n) => ({ ...n, dc: null, color: "#00e5c8" }));
  }, [dataCenters]);

  // Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.({
      country: selectedCountry,
      asn: selectedASN,
      asnName: selectedASN ? asnDisplayName(selectedASN) : null,
      countryASNs,
    });
  }, [selectedCountry, selectedASN, countryASNs, onSelectionChange]);
  const hasLiveData = liveCountries && liveCountries.length > 0;

  // Pre-compute set for O(1) lookups in geography render loop
  const liveCountrySet = useMemo(
    () => hasLiveData ? new Set(liveCountries.map((c) => c.country)) : new Set<string>(),
    [hasLiveData, liveCountries],
  );

  const hasFlowData = trafficFlows && trafficFlows.length > 0;
  const { arcs: allArcs, scattered: allScattered } = useMemo(() => {
    if (hasFlowData && hasLiveData) {
      return buildFlowArcs(trafficFlows, effectiveProxyNodes, liveCountries);
    }
    if (hasLiveData) {
      return buildLiveArcs(liveCountries, effectiveProxyNodes);
    }
    return buildMockArcs(effectiveProxyNodes);
  }, [hasLiveData, hasFlowData, liveCountries, trafficFlows, effectiveProxyNodes]);

  // Fetch ASN data when a country is selected
  useEffect(() => {
    if (!selectedCountry) {
      setCountryASNs([]);
      setSelectedASN(null);
      return;
    }
    setSelectedASN(null);
    setAsnLoading(true);

    fetchASNs(selectedCountry)
      .then((asns) => {
        setCountryASNs(asns.length > 0 ? asns : (MOCK_ISPS[selectedCountry] ?? []));
        setAsnLoading(false);
      })
      .catch(() => {
        setCountryASNs(MOCK_ISPS[selectedCountry] ?? []);
        setAsnLoading(false);
      });
  }, [selectedCountry]);

  // Build "My Proxy" arcs from self → each peer
  const proxyArcs = useMemo((): TrafficArc[] => {
    if (!myProxyView || !myGeo || !peerGeos || peerGeos.length === 0) return [];
    return peerGeos.map((peer, i) => ({
      id: `proxy-${peer.ip}-${i}`,
      from: [myGeo.lng, myGeo.lat],
      to: [peer.lng, peer.lat],
      traffic: 0.6,
      color: "#00e5c8",
      curveIndex: 0,
      country: peer.country,
    }));
  }, [myProxyView, myGeo, peerGeos]);

  // Filter arcs and scatter nodes when a country is selected
  const arcs = useMemo(() => {
    if (myProxyView) return proxyArcs;
    if (!selectedCountry) return allArcs;
    return allArcs.filter((a) => a.country === selectedCountry);
  }, [allArcs, selectedCountry, myProxyView, proxyArcs]);


  useEffect(() => {
    const len = hasLiveData ? (liveCountries?.length || 1) : mockNodes.length;
    const interval = setInterval(() => setPulseIndex((p) => (p + 1) % len), 3000);
    return () => clearInterval(interval);
  }, [hasLiveData, liveCountries]);

  const handleGeoClick = useCallback((iso: string) => {
    setSelectedCountry((prev) => (prev === iso ? null : iso));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedCountry(null);
    setSelectedASN(null);
  }, []);

  // Determine which proxy IDs are involved in filtered arcs (for dimming)
  const activeProxyIds = useMemo(() => {
    if (!selectedCountry) return null;
    const ids = new Set<string>();
    for (const arc of arcs) {
      for (const p of effectiveProxyNodes) {
        if (arc.to[0] === p.lng && arc.to[1] === p.lat) ids.add(p.id);
        if (arc.from[0] === p.lng && arc.from[1] === p.lat) ids.add(p.id);
      }
    }
    return ids;
  }, [arcs, selectedCountry, effectiveProxyNodes]);

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      {/* Selected country indicator */}
      {selectedCountry && (
        <div
          onClick={handleClearSelection}
          style={{
            position: "absolute",
            top: "0.75rem",
            right: "1rem",
            zIndex: 20,
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            padding: "0.25rem 0.6rem",
            borderRadius: "4px",
            background: regionColor(selectedCountry) + "20",
            color: regionColor(selectedCountry),
            border: `1px solid ${regionColor(selectedCountry)}40`,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          {selectedCountry}{selectedASN ? ` / ${asnDisplayName(selectedASN)}` : ""} — click to clear
        </div>
      )}

      {/* ISP Panel */}
      {selectedCountry && (
        <ISPPanel
          country={selectedCountry}
          asns={countryASNs}
          loading={asnLoading}
          selectedASN={selectedASN}
          onSelectASN={setSelectedASN}
          onClose={handleClearSelection}
        />
      )}

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140, center: [20, 25] }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {(renderProps) => {
            if (!projectionFn && renderProps.projection) {
              // Defer to avoid setState during render
              Promise.resolve().then(() => setProjectionFn(() => renderProps.projection));
            }
            return renderProps.geographies.map((geo) => {
              const iso = geoToAlpha2(geo);
              const isCensored = CENSORED.has(iso);
              const hasData = liveCountrySet.has(iso);
              const isSelected = selectedCountry === iso;
              let fill = "#252d3e";
              let stroke = "#38445a";
              if (isCensored) { fill = "#332a42"; stroke = "#504470"; }
              if (hasData) { fill = "#382e50"; stroke = "#5a4e80"; }
              if (isSelected) {
                const rc = regionColor(iso);
                fill = rc + "35";
                stroke = rc + "70";
              }
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSelected ? 0.8 : 0.4}
                  onClick={() => handleGeoClick(iso)}
                  style={{
                    default: { outline: "none", cursor: isCensored || hasData ? "pointer" : "default" },
                    hover: { outline: "none", fill: isSelected ? fill : hasData ? "#443860" : isCensored ? "#3e3250" : "#2e3648", cursor: isCensored || hasData ? "pointer" : "default" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            });
          }}
        </Geographies>

        {/* Scattered user nodes within censored countries */}
        {!myProxyView && allScattered.map((node) => (
          <ScatterMarker
            key={node.id}
            node={node}
            dimmed={!!selectedCountry && node.country !== selectedCountry}
          />
        ))}

        {/* Draw-on arcs */}
        {projectionFn && <ArcLayer arcs={arcs} proj={projectionFn} />}

        {/* Data center markers (global view) */}
        {!myProxyView && effectiveProxyNodes.map((n) => (
          <DCMarker
            key={n.id}
            node={n}
            dimmed={!!activeProxyIds && !activeProxyIds.has(n.id)}
          />
        ))}

        {/* Node markers (global view) */}
        {!myProxyView && (hasLiveData
          ? liveCountries.map((c, i) => (
              <LiveCountryMarker
                key={c.country}
                country={c}
                index={i}
                dimmed={!!selectedCountry && c.country !== selectedCountry}
              />
            ))
          : mockNodes.map((n, i) => (
              <NodeMarker
                key={n.id}
                node={n}
                pulse={i === pulseIndex}
                dimmed={!!selectedCountry && n.country !== selectedCountry}
              />
            )))}

        {/* My Proxy view markers */}
        {myProxyView && myGeo && <MyLocationMarker geo={myGeo} />}
        {myProxyView && peerGeos?.map((peer, i) => (
          <PeerMarker key={peer.ip} geo={peer} index={i} />
        ))}
      </ComposableMap>
    </div>
  );
}

export default memo(WorldMap);
