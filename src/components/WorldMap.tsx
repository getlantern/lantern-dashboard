import { memo, useMemo, useEffect, useState, useRef, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { mockNodes, type ConnectionNode } from "../data/mock";
import { fetchASNs, type DashboardCountry, type DashboardASN } from "../api/client";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const CENSORED = new Set(["IR", "CN", "RU", "MM", "BY", "TM", "VN", "CU", "SA", "PK", "UZ", "TH"]);

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
};

// Country center coords (used for country markers / fallback)
const COORDS: Record<string, [number, number]> = {
  IR: [53.69, 32.43], CN: [104.20, 35.86], RU: [40.32, 55.75],
  MM: [96.08, 19.76], BY: [27.95, 53.71], TM: [59.56, 38.97],
  VN: [108.28, 14.06], CU: [-77.78, 21.52], PK: [69.35, 30.38],
  TH: [100.99, 15.87], UZ: [64.59, 41.38], SA: [45.08, 23.89],
  IN: [78.96, 20.59], BD: [90.36, 23.68], EG: [30.80, 26.82],
  TR: [35.24, 38.96], VE: [-66.59, 6.42], KZ: [66.92, 48.02],
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

interface WorldMapProps {
  liveCountries?: DashboardCountry[];
  onSelectionChange?: (selection: MapSelection) => void;
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


function nearestProxy(lng: number, lat: number) {
  let best = PROXY_NODES[0];
  let bestDist = Infinity;
  for (const p of PROXY_NODES) {
    const d = (p.lng - lng) ** 2 + (p.lat - lat) ** 2;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

function buildMockArcs(): { arcs: TrafficArc[]; scattered: ScatteredNode[] } {
  const arcs: TrafficArc[] = [];
  const allScattered: ScatteredNode[] = [];

  // Build arcs from cities in each censored country
  const censoredCountries = Array.from(CENSORED);
  let arcIndex = 0;
  for (const country of censoredCountries) {
    const cities = CITIES[country];
    if (!cities) continue;
    const color = regionColor(country);

    // Scatter nodes around cities
    const scatterCount = Math.min(15, Math.max(4, cities.length * 3));
    allScattered.push(...scatterNodes(country, scatterCount, color));

    // Each city gets arcs proportional to its weight
    for (const city of cities) {
      const proxy = nearestProxy(city.lng, city.lat);
      const traffic = 0.2 + city.weight * 0.6;
      const count = city.weight > 0.6 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        arcs.push({
          id: `mock-${country}-${city.name}-${proxy.id}-${k}`,
          from: [city.lng, city.lat],
          to: [proxy.lng, proxy.lat],
          traffic,
          color,
          curveIndex: k,
          country,
        });
        arcIndex++;
      }
    }
  }
  return { arcs, scattered: allScattered };
}

function buildLiveArcs(countries: DashboardCountry[]): { arcs: TrafficArc[]; scattered: ScatteredNode[] } {
  const maxASN = Math.max(1, ...countries.map((c) => c.asnCount));
  const arcs: TrafficArc[] = [];
  const allScattered: ScatteredNode[] = [];

  for (const cd of countries) {
    const cities = CITIES[cd.country];
    const color = regionColor(cd.country);
    const traffic = cd.asnCount / maxASN;

    // Scatter nodes around cities
    const scatterCount = Math.min(20, Math.max(3, Math.round(Math.sqrt(cd.asnCount) * 2)));
    allScattered.push(...scatterNodes(cd.country, scatterCount, color));

    if (cities && cities.length > 0) {
      // Distribute arcs across cities weighted by population
      const totalWeight = cities.reduce((s, c) => s + c.weight, 0);
      for (const city of cities) {
        const cityTraffic = traffic * (city.weight / totalWeight) * cities.length;
        const proxy = nearestProxy(city.lng, city.lat);
        const count = cityTraffic > 0.6 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          arcs.push({
            id: `${cd.country}-${city.name}-${proxy.id}-${k}`,
            from: [city.lng, city.lat],
            to: [proxy.lng, proxy.lat],
            traffic: Math.min(1, cityTraffic),
            color,
            curveIndex: k,
            country: cd.country,
          });
        }
      }
    } else {
      // Fallback to country center
      const coords = COORDS[cd.country];
      if (!coords) continue;
      const proxy = nearestProxy(coords[0], coords[1]);
      arcs.push({
        id: `${cd.country}-${proxy.id}-0`,
        from: coords,
        to: [proxy.lng, proxy.lat],
        traffic,
        color,
        curveIndex: 0,
        country: cd.country,
      });
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
          opacity={0.06}
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
        opacity={0.7}
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
          opacity={0.4}
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
          opacity={0.6}
          style={{ filter: `drop-shadow(0 0 3px ${arc.color})` }}
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
  const rafRef = useRef<number>(0);
  const startRef = useRef(performance.now());

  useEffect(() => {
    function tick() {
      const elapsed = (performance.now() - startRef.current) / 1000;
      setTime(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
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

function ProxyMarker({ node, dimmed }: { node: typeof PROXY_NODES[0]; dimmed: boolean }) {
  return (
    <Marker coordinates={[node.lng, node.lat]}>
      <circle r={2} fill="#d5c8a0" opacity={dimmed ? 0.03 : 0.08} />
      <circle r={1} fill="#d5c8a0" opacity={dimmed ? 0.12 : 0.35} style={{ filter: "drop-shadow(0 0 2px #d5c8a0)" }} />
    </Marker>
  );
}

function NodeMarker({ node, pulse, dimmed }: { node: ConnectionNode; pulse: boolean; dimmed: boolean }) {
  const color = node.type === "volunteer" ? "#c8b878" : "#d4a860";
  const size = node.type === "volunteer" ? 2.5 : 2;
  const baseOpacity = dimmed ? 0.08 : node.active ? 0.6 : 0.15;
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
}

function ScatterMarker({ node, dimmed }: { node: ScatteredNode; dimmed: boolean }) {
  const opacity = dimmed ? 0.06 : 0.3;
  return (
    <Marker coordinates={[node.lng, node.lat]}>
      <circle r={1} fill={node.color} opacity={opacity} />
    </Marker>
  );
}

function LiveCountryMarker({ country, index, dimmed }: { country: DashboardCountry; index: number; dimmed: boolean }) {
  const coords = COORDS[country.country];
  if (!coords) return null;
  const color = regionColor(country.country);
  const size = Math.max(1.5, Math.min(4, country.asnCount / 2));
  const baseOpacity = dimmed ? 0.1 : 0.45;
  return (
    <Marker coordinates={coords}>
      {!dimmed && (
        <circle r={size + 2} fill="none" stroke={color} strokeWidth={0.2} opacity={0.1}>
          <animate attributeName="r" from={String(size)} to={String(size + 5)} dur="3s" begin={`${index * 0.3}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.2" to="0" dur="3s" begin={`${index * 0.3}s`} repeatCount="indefinite" />
        </circle>
      )}
      <circle r={size} fill={color} opacity={baseOpacity} style={{ filter: dimmed ? "none" : `drop-shadow(0 0 2px ${color})` }} />
      <text y={-size - 2.5} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: "4px", fill: "#e8ecf4", opacity: dimmed ? 0.15 : 0.5 }}>
        {country.country}
      </text>
    </Marker>
  );
}

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
        width: "220px",
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
            color: "#6670800",
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
      <div style={{ maxHeight: "200px", overflowY: "auto", padding: "0.3rem 0" }}>
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

function WorldMap({ liveCountries, onSelectionChange }: WorldMapProps) {
  const [pulseIndex, setPulseIndex] = useState(0);
  const [projectionFn, setProjectionFn] = useState<((c: [number, number]) => [number, number] | null) | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedASN, setSelectedASN] = useState<string | null>(null);
  const [countryASNs, setCountryASNs] = useState<DashboardASN[]>([]);
  const [asnLoading, setAsnLoading] = useState(false);

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

  const { arcs: allArcs, scattered: allScattered } = useMemo(
    () => (hasLiveData ? buildLiveArcs(liveCountries) : buildMockArcs()),
    [hasLiveData, liveCountries],
  );

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

  // Filter arcs and scatter nodes when a country is selected
  const arcs = useMemo(() => {
    if (!selectedCountry) return allArcs;
    return allArcs.filter((a) => a.country === selectedCountry);
  }, [allArcs, selectedCountry]);


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
      for (const p of PROXY_NODES) {
        if (arc.to[0] === p.lng && arc.to[1] === p.lat) ids.add(p.id);
        if (arc.from[0] === p.lng && arc.from[1] === p.lat) ids.add(p.id);
      }
    }
    return ids;
  }, [arcs, selectedCountry]);

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
              setTimeout(() => setProjectionFn(() => renderProps.projection), 0);
            }
            return renderProps.geographies.map((geo) => {
              const iso = geoToAlpha2(geo);
              const isCensored = CENSORED.has(iso);
              const hasData = hasLiveData && liveCountries.some((c) => c.country === iso);
              const isSelected = selectedCountry === iso;
              let fill = "#0f1318";
              let stroke = "#1a2030";
              if (isCensored) { fill = "#1a1520"; stroke = "#2a2540"; }
              if (hasData) { fill = "#1c1828"; stroke = "#3a3555"; }
              if (isSelected) {
                const rc = regionColor(iso);
                fill = rc + "18";
                stroke = rc + "50";
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
                    hover: { outline: "none", fill: isSelected ? fill : hasData ? "#22203a" : isCensored ? "#201a2a" : "#161a22", cursor: isCensored || hasData ? "pointer" : "default" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            });
          }}
        </Geographies>

        {/* Scattered user nodes within censored countries */}
        {allScattered.map((node) => (
          <ScatterMarker
            key={node.id}
            node={node}
            dimmed={!!selectedCountry && node.country !== selectedCountry}
          />
        ))}

        {/* Draw-on arcs */}
        {projectionFn && <ArcLayer arcs={arcs} proj={projectionFn} />}

        {/* Proxy markers */}
        {PROXY_NODES.map((n) => (
          <ProxyMarker
            key={n.id}
            node={n}
            dimmed={!!activeProxyIds && !activeProxyIds.has(n.id)}
          />
        ))}

        {/* Node markers */}
        {hasLiveData
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
            ))}
      </ComposableMap>
    </div>
  );
}

export default memo(WorldMap);
