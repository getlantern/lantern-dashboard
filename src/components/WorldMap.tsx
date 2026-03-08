import { memo, useMemo, useEffect, useState, useRef, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { mockNodes, type ConnectionNode } from "../data/mock";
import type { DashboardCountry } from "../api/client";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const CENSORED = new Set(["IR", "CN", "RU", "MM", "BY", "TM", "VN", "CU", "SA", "PK", "UZ", "TH"]);

// [lng, lat] for country centroids
const COORDS: Record<string, [number, number]> = {
  IR: [53.69, 32.43], CN: [104.20, 35.86], RU: [40.32, 55.75],
  MM: [96.08, 19.76], BY: [27.95, 53.71], TM: [59.56, 38.97],
  VN: [108.28, 14.06], CU: [-77.78, 21.52], PK: [69.35, 30.38],
  TH: [100.99, 15.87], UZ: [64.59, 41.38], SA: [45.08, 23.89],
  IN: [78.96, 20.59], BD: [90.36, 23.68], EG: [30.80, 26.82],
  TR: [35.24, 38.96], VE: [-66.59, 6.42], KZ: [66.92, 48.02],
};

// Proxy server locations (approximate data center cities)
const PROXY_NODES: { id: string; lng: number; lat: number; label: string }[] = [
  { id: "us-east", lng: -74.0, lat: 40.7, label: "US-East" },
  { id: "us-west", lng: -118.2, lat: 34.1, label: "US-West" },
  { id: "eu-west", lng: -0.13, lat: 51.5, label: "EU-West" },
  { id: "eu-central", lng: 13.4, lat: 52.5, label: "EU-Central" },
  { id: "ap-east", lng: 139.7, lat: 35.7, label: "AP-East" },
  { id: "ap-south", lng: 103.9, lat: 1.35, label: "AP-South" },
];

interface TrafficArc {
  id: string;
  from: [number, number]; // [lng, lat] — proxy
  to: [number, number];   // [lng, lat] — censored country
  traffic: number;         // 0-1 normalized
  color: string;
}

interface WorldMapProps {
  liveCountries?: DashboardCountry[];
}

function blockRateColor(rate: number): string {
  if (rate > 0.5) return "#ff4060";
  if (rate > 0.2) return "#f0a030";
  return "#00e5c8";
}

// Pick nearest proxy for a country coordinate
function nearestProxy(lng: number, lat: number) {
  let best = PROXY_NODES[0];
  let bestDist = Infinity;
  for (const p of PROXY_NODES) {
    const d = (p.lng - lng) ** 2 + (p.lat - lat) ** 2;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

// Build arcs from mock data (volunteer→user pairs)
function buildMockArcs(): TrafficArc[] {
  const volunteers = mockNodes.filter((n) => n.type === "volunteer" && n.active);
  const users = mockNodes.filter((n) => n.type === "user" && n.active);
  return users.map((u, i) => {
    const v = volunteers[i % volunteers.length];
    return {
      id: `${v.id}-${u.id}`,
      from: [v.lng, v.lat],
      to: [u.lng, u.lat],
      traffic: 0.3 + Math.random() * 0.7,
      color: "#4090ff",
    };
  });
}

// Build arcs from live country data
function buildLiveArcs(countries: DashboardCountry[]): TrafficArc[] {
  const maxASN = Math.max(1, ...countries.map((c) => c.asnCount));
  const arcs: TrafficArc[] = [];

  for (const country of countries) {
    const coords = COORDS[country.country];
    if (!coords) continue;
    const proxy = nearestProxy(coords[0], coords[1]);
    // Also connect to a second proxy for countries with more traffic
    const traffic = country.asnCount / maxASN;

    arcs.push({
      id: `${proxy.id}-${country.country}`,
      from: [proxy.lng, proxy.lat],
      to: coords,
      traffic,
      color: blockRateColor(country.avgBlockRate),
    });

    // High-traffic countries get a second route
    if (traffic > 0.4) {
      const secondProxy = PROXY_NODES.find((p) => p.id !== proxy.id)!;
      arcs.push({
        id: `${secondProxy.id}-${country.country}`,
        from: [secondProxy.lng, secondProxy.lat],
        to: coords,
        traffic: traffic * 0.6,
        color: blockRateColor(country.avgBlockRate),
      });
    }
  }

  return arcs;
}

// SVG quadratic bezier arc with curvature
function arcPath(from: [number, number], to: [number, number], projection: (coords: [number, number]) => [number, number] | null): string | null {
  const p1 = projection(from);
  const p2 = projection(to);
  if (!p1 || !p2) return null;

  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Curve outward — perpendicular offset proportional to distance
  const curvature = dist * 0.25;
  const mx = (p1[0] + p2[0]) / 2 - (dy / dist) * curvature;
  const my = (p1[1] + p2[1]) / 2 + (dx / dist) * curvature;

  return `M${p1[0]},${p1[1]} Q${mx},${my} ${p2[0]},${p2[1]}`;
}

// Animated arc component using SVG stroke-dashoffset
function AnimatedArc({
  arc,
  projection,
  delay,
}: {
  arc: TrafficArc;
  projection: (coords: [number, number]) => [number, number] | null;
  delay: number;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const d = arcPath(arc.from, arc.to, projection);
  if (!d) return null;

  const strokeWidth = 0.4 + arc.traffic * 2.2;
  const glowWidth = strokeWidth + 2;

  return (
    <g>
      {/* Glow layer */}
      <path
        d={d}
        fill="none"
        stroke={arc.color}
        strokeWidth={glowWidth}
        strokeLinecap="round"
        opacity={0.06 + arc.traffic * 0.06}
      />
      {/* Base path — faint static line */}
      <path
        d={d}
        fill="none"
        stroke={arc.color}
        strokeWidth={strokeWidth * 0.3}
        strokeLinecap="round"
        opacity={0.15}
      />
      {/* Animated flowing dash */}
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke={arc.color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={0.25 + arc.traffic * 0.35}
        strokeDasharray="6 10"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-32"
          dur={`${1.5 + (1 - arc.traffic) * 2}s`}
          begin={`${delay}s`}
          repeatCount="indefinite"
        />
      </path>
      {/* Bright leading particle */}
      <circle r={strokeWidth * 0.6} fill={arc.color} opacity={0.6 + arc.traffic * 0.3}>
        <animateMotion
          dur={`${3 + (1 - arc.traffic) * 4}s`}
          begin={`${delay}s`}
          repeatCount="indefinite"
          path={d}
        />
      </circle>
    </g>
  );
}

function ProxyMarker({ node }: { node: typeof PROXY_NODES[0] }) {
  return (
    <Marker coordinates={[node.lng, node.lat]}>
      <circle r={3} fill="#00e5c8" opacity={0.15} />
      <circle r={1.8} fill="#00e5c8" opacity={0.7} style={{ filter: "drop-shadow(0 0 3px #00e5c8)" }} />
      <text
        y={-6}
        textAnchor="middle"
        style={{ fontFamily: "var(--font-mono)", fontSize: "4.5px", fill: "#00e5c8", opacity: 0.5 }}
      >
        {node.label}
      </text>
    </Marker>
  );
}

function NodeMarker({ node, pulse }: { node: ConnectionNode; pulse: boolean }) {
  const color = node.type === "volunteer" ? "#00e5c8" : "#f0a030";
  const size = node.type === "volunteer" ? 3.5 : 3;

  return (
    <Marker coordinates={[node.lng, node.lat]}>
      {node.active && pulse && (
        <circle r={size + 6} fill="none" stroke={color} strokeWidth={0.5} opacity={0.3}>
          <animate attributeName="r" from={String(size + 2)} to={String(size + 10)} dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.5" to="0" dur="2.5s" repeatCount="indefinite" />
        </circle>
      )}
      <circle
        r={size}
        fill={color}
        stroke={node.active ? color : "#4a5568"}
        strokeWidth={0.6}
        opacity={node.active ? 0.85 : 0.3}
        style={{ filter: node.active ? `drop-shadow(0 0 3px ${color})` : "none" }}
      />
    </Marker>
  );
}

function LiveCountryMarker({ country, index }: { country: DashboardCountry; index: number }) {
  const coords = COORDS[country.country];
  if (!coords) return null;

  const color = blockRateColor(country.avgBlockRate);
  const size = Math.max(2.5, Math.min(6, country.asnCount / 2));

  return (
    <Marker coordinates={coords}>
      <circle r={size + 3} fill="none" stroke={color} strokeWidth={0.3} opacity={0.15}>
        <animate
          attributeName="r" from={String(size)} to={String(size + 7)}
          dur="3s" begin={`${index * 0.3}s`} repeatCount="indefinite"
        />
        <animate attributeName="opacity" from="0.3" to="0" dur="3s" begin={`${index * 0.3}s`} repeatCount="indefinite" />
      </circle>
      <circle r={size} fill={color} opacity={0.6} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      <text
        y={-size - 3}
        textAnchor="middle"
        style={{ fontFamily: "var(--font-mono)", fontSize: "5px", fill: "#e8ecf4", opacity: 0.7 }}
      >
        {country.country}
      </text>
    </Marker>
  );
}

function WorldMap({ liveCountries }: WorldMapProps) {
  const [pulseIndex, setPulseIndex] = useState(0);
  const [projectionFn, setProjectionFn] = useState<((coords: [number, number]) => [number, number] | null) | null>(null);
  const hasLiveData = liveCountries && liveCountries.length > 0;

  const arcs = useMemo(
    () => (hasLiveData ? buildLiveArcs(liveCountries) : buildMockArcs()),
    [hasLiveData, liveCountries]
  );

  useEffect(() => {
    const nodes = hasLiveData ? (liveCountries || []) : mockNodes;
    const interval = setInterval(() => {
      setPulseIndex((p) => (p + 1) % Math.max(1, nodes.length));
    }, 3000);
    return () => clearInterval(interval);
  }, [hasLiveData, liveCountries]);

  // Capture projection function from ComposableMap via a hidden Marker
  const captureProjection = useCallback((geo: { projection: () => (coords: [number, number]) => [number, number] | null }) => {
    if (geo?.projection) {
      setProjectionFn(() => geo.projection());
    }
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 150, center: [40, 28] }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {(renderProps) => {
            // Capture the projection on first render
            if (!projectionFn && renderProps.projection) {
              // Schedule to avoid setState during render
              setTimeout(() => setProjectionFn(() => renderProps.projection), 0);
            }
            return renderProps.geographies.map((geo) => {
              const iso = geo.properties.ISO_A2 || geo.id;
              const isCensored = CENSORED.has(iso);
              const hasData = hasLiveData && liveCountries.some((c) => c.country === iso);
              let fill = "#0c0f16";
              if (isCensored) fill = "#14101c";
              if (hasData) fill = "#18142a";
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="#1a2030"
                  strokeWidth={0.3}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: hasData ? "#221a3a" : isCensored ? "#1c1528" : "#111620" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            });
          }}
        </Geographies>

        {/* Animated traffic arcs */}
        {projectionFn && arcs.map((arc, i) => (
          <AnimatedArc
            key={arc.id}
            arc={arc}
            projection={projectionFn}
            delay={i * 0.3}
          />
        ))}

        {/* Proxy server markers (always shown) */}
        {hasLiveData && PROXY_NODES.map((node) => (
          <ProxyMarker key={node.id} node={node} />
        ))}

        {/* Country/node markers */}
        {hasLiveData
          ? liveCountries.map((country, i) => (
              <LiveCountryMarker key={country.country} country={country} index={i} />
            ))
          : mockNodes.map((node, i) => (
              <NodeMarker key={node.id} node={node} pulse={i === pulseIndex} />
            ))}
      </ComposableMap>
    </div>
  );
}

export default memo(WorldMap);
