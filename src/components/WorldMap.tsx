import { memo, useMemo, useEffect, useState, useRef } from "react";
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

const COORDS: Record<string, [number, number]> = {
  IR: [53.69, 32.43], CN: [104.20, 35.86], RU: [40.32, 55.75],
  MM: [96.08, 19.76], BY: [27.95, 53.71], TM: [59.56, 38.97],
  VN: [108.28, 14.06], CU: [-77.78, 21.52], PK: [69.35, 30.38],
  TH: [100.99, 15.87], UZ: [64.59, 41.38], SA: [45.08, 23.89],
  IN: [78.96, 20.59], BD: [90.36, 23.68], EG: [30.80, 26.82],
  TR: [35.24, 38.96], VE: [-66.59, 6.42], KZ: [66.92, 48.02],
};

const PROXY_NODES = [
  { id: "us-east", lng: -74.0, lat: 40.7, label: "US-East" },
  { id: "us-west", lng: -118.2, lat: 34.1, label: "US-West" },
  { id: "eu-west", lng: -0.13, lat: 51.5, label: "EU-West" },
  { id: "eu-central", lng: 13.4, lat: 52.5, label: "EU-Central" },
  { id: "ap-east", lng: 139.7, lat: 35.7, label: "AP-East" },
  { id: "ap-south", lng: 103.9, lat: 1.35, label: "AP-South" },
];

interface TrafficArc {
  id: string;
  from: [number, number];
  to: [number, number];
  traffic: number;
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

function nearestProxy(lng: number, lat: number) {
  let best = PROXY_NODES[0];
  let bestDist = Infinity;
  for (const p of PROXY_NODES) {
    const d = (p.lng - lng) ** 2 + (p.lat - lat) ** 2;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

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

function buildLiveArcs(countries: DashboardCountry[]): TrafficArc[] {
  const maxASN = Math.max(1, ...countries.map((c) => c.asnCount));
  const arcs: TrafficArc[] = [];
  for (const country of countries) {
    const coords = COORDS[country.country];
    if (!coords) continue;
    const proxy = nearestProxy(coords[0], coords[1]);
    const traffic = country.asnCount / maxASN;
    arcs.push({
      id: `${proxy.id}-${country.country}`,
      from: [proxy.lng, proxy.lat],
      to: coords,
      traffic,
      color: blockRateColor(country.avgBlockRate),
    });
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

// ── Arc geometry ──

function arcPath(
  from: [number, number],
  to: [number, number],
  proj: (c: [number, number]) => [number, number] | null
): string | null {
  const p1 = proj(from);
  const p2 = proj(to);
  if (!p1 || !p2) return null;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return null;
  const curvature = dist * 0.3;
  const mx = (p1[0] + p2[0]) / 2 - (dy / dist) * curvature;
  const my = (p1[1] + p2[1]) / 2 + (dx / dist) * curvature;
  return `M${p1[0]},${p1[1]} Q${mx},${my} ${p2[0]},${p2[1]}`;
}

// ── Luminous pulse arc ──
// Each arc renders:
//   1. A barely-visible static trace (the "rail")
//   2. Multiple luminous pulses that shoot along it — bright head, fading tail
//   The pulse is a short stroke-dasharray segment animated via stroke-dashoffset.
//   Traffic controls: number of pulses, stroke width, brightness, speed.

function LuminousArc({
  arc,
  proj,
  index,
}: {
  arc: TrafficArc;
  proj: (c: [number, number]) => [number, number] | null;
  index: number;
}) {
  const trailRef = useRef<SVGPathElement>(null);
  const [pathLen, setPathLen] = useState(0);
  const d = arcPath(arc.from, arc.to, proj);

  useEffect(() => {
    if (trailRef.current) {
      setPathLen(trailRef.current.getTotalLength());
    }
  }, [d]);

  if (!d) return null;

  const baseWidth = 0.3 + arc.traffic * 1.5;
  // How many pulses on this arc — busier routes get more
  const pulseCount = arc.traffic > 0.6 ? 3 : arc.traffic > 0.3 ? 2 : 1;
  // Pulse length as fraction of total path — shorter = sharper comet
  const pulseLen = Math.max(12, pathLen * (0.08 + arc.traffic * 0.10));
  // Duration — busier = faster
  const dur = 2.8 + (1 - arc.traffic) * 3.5;

  const gradientId = `pulse-grad-${arc.id}-${index}`;

  return (
    <g>
      {/* Gradient for comet tail effect */}
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={arc.color} stopOpacity="0" />
          <stop offset="70%" stopColor={arc.color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={arc.color} stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* 1. Static rail — very faint */}
      <path
        ref={trailRef}
        d={d}
        fill="none"
        stroke={arc.color}
        strokeWidth={baseWidth * 0.2}
        strokeLinecap="round"
        opacity={0.07}
      />

      {/* 2. Soft glow underneath the pulses */}
      {pathLen > 0 && Array.from({ length: pulseCount }).map((_, pi) => {
        const stagger = (pi / pulseCount) * dur;
        const glowDash = `${pulseLen * 1.5} ${pathLen + pulseLen * 2}`;
        return (
          <path
            key={`glow-${pi}`}
            d={d}
            fill="none"
            stroke={arc.color}
            strokeWidth={baseWidth * 3}
            strokeLinecap="round"
            opacity={0.04 + arc.traffic * 0.03}
            strokeDasharray={glowDash}
            strokeDashoffset={pathLen + pulseLen}
          >
            <animate
              attributeName="stroke-dashoffset"
              from={String(pathLen + pulseLen)}
              to={String(-pulseLen * 2)}
              dur={`${dur}s`}
              begin={`${stagger + index * 0.2}s`}
              repeatCount="indefinite"
            />
          </path>
        );
      })}

      {/* 3. Luminous comet pulses */}
      {pathLen > 0 && Array.from({ length: pulseCount }).map((_, pi) => {
        const stagger = (pi / pulseCount) * dur;
        // The dash: [bright segment] [gap big enough to hide the rest]
        const cometDash = `${pulseLen} ${pathLen + pulseLen * 2}`;
        return (
          <path
            key={`comet-${pi}`}
            d={d}
            fill="none"
            stroke={arc.color}
            strokeWidth={baseWidth}
            strokeLinecap="round"
            opacity={0.5 + arc.traffic * 0.4}
            strokeDasharray={cometDash}
            strokeDashoffset={pathLen + pulseLen}
          >
            <animate
              attributeName="stroke-dashoffset"
              from={String(pathLen + pulseLen)}
              to={String(-pulseLen * 2)}
              dur={`${dur}s`}
              begin={`${stagger + index * 0.2}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values={`0;${0.5 + arc.traffic * 0.4};${0.5 + arc.traffic * 0.4};0`}
              keyTimes="0;0.05;0.85;1"
              dur={`${dur}s`}
              begin={`${stagger + index * 0.2}s`}
              repeatCount="indefinite"
            />
          </path>
        );
      })}

      {/* 4. Bright head dot — travels the path */}
      {pathLen > 0 && Array.from({ length: pulseCount }).map((_, pi) => {
        const stagger = (pi / pulseCount) * dur;
        return (
          <circle
            key={`head-${pi}`}
            r={baseWidth * 0.8}
            fill="white"
            opacity={0}
          >
            <animateMotion
              dur={`${dur}s`}
              begin={`${stagger + index * 0.2}s`}
              repeatCount="indefinite"
              path={d}
              keyPoints="0;1"
              keyTimes="0;1"
            />
            <animate
              attributeName="opacity"
              values="0;0.9;0.9;0"
              keyTimes="0;0.05;0.85;1"
              dur={`${dur}s`}
              begin={`${stagger + index * 0.2}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values={`${baseWidth * 0.4};${baseWidth * 0.9};${baseWidth * 0.4}`}
              dur={`${dur}s`}
              begin={`${stagger + index * 0.2}s`}
              repeatCount="indefinite"
            />
          </circle>
        );
      })}
    </g>
  );
}

// ── Markers ──

function ProxyMarker({ node }: { node: typeof PROXY_NODES[0] }) {
  return (
    <Marker coordinates={[node.lng, node.lat]}>
      <circle r={3} fill="#00e5c8" opacity={0.08} />
      <circle r={1.5} fill="#00e5c8" opacity={0.6} style={{ filter: "drop-shadow(0 0 2px #00e5c8)" }} />
    </Marker>
  );
}

function NodeMarker({ node, pulse }: { node: ConnectionNode; pulse: boolean }) {
  const color = node.type === "volunteer" ? "#00e5c8" : "#f0a030";
  const size = node.type === "volunteer" ? 3 : 2.5;
  return (
    <Marker coordinates={[node.lng, node.lat]}>
      {node.active && pulse && (
        <circle r={size + 5} fill="none" stroke={color} strokeWidth={0.4} opacity={0.2}>
          <animate attributeName="r" from={String(size + 1)} to={String(size + 9)} dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.4" to="0" dur="2.5s" repeatCount="indefinite" />
        </circle>
      )}
      <circle
        r={size}
        fill={color}
        opacity={node.active ? 0.8 : 0.2}
        style={{ filter: node.active ? `drop-shadow(0 0 3px ${color})` : "none" }}
      />
    </Marker>
  );
}

function LiveCountryMarker({ country, index }: { country: DashboardCountry; index: number }) {
  const coords = COORDS[country.country];
  if (!coords) return null;
  const color = blockRateColor(country.avgBlockRate);
  const size = Math.max(2, Math.min(5, country.asnCount / 2));
  return (
    <Marker coordinates={coords}>
      <circle r={size + 3} fill="none" stroke={color} strokeWidth={0.25} opacity={0.12}>
        <animate attributeName="r" from={String(size)} to={String(size + 6)} dur="3s" begin={`${index * 0.3}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.25" to="0" dur="3s" begin={`${index * 0.3}s`} repeatCount="indefinite" />
      </circle>
      <circle r={size} fill={color} opacity={0.55} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
      <text y={-size - 3} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: "4.5px", fill: "#e8ecf4", opacity: 0.6 }}>
        {country.country}
      </text>
    </Marker>
  );
}

// ── Main ──

function WorldMap({ liveCountries }: WorldMapProps) {
  const [pulseIndex, setPulseIndex] = useState(0);
  const [projectionFn, setProjectionFn] = useState<((c: [number, number]) => [number, number] | null) | null>(null);
  const hasLiveData = liveCountries && liveCountries.length > 0;

  const arcs = useMemo(
    () => (hasLiveData ? buildLiveArcs(liveCountries) : buildMockArcs()),
    [hasLiveData, liveCountries]
  );

  useEffect(() => {
    const len = hasLiveData ? (liveCountries?.length || 1) : mockNodes.length;
    const interval = setInterval(() => setPulseIndex((p) => (p + 1) % len), 3000);
    return () => clearInterval(interval);
  }, [hasLiveData, liveCountries]);

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 150, center: [40, 28] }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {(renderProps) => {
            if (!projectionFn && renderProps.projection) {
              setTimeout(() => setProjectionFn(() => renderProps.projection), 0);
            }
            return renderProps.geographies.map((geo) => {
              const iso = geo.properties.ISO_A2 || geo.id;
              const isCensored = CENSORED.has(iso);
              const hasData = hasLiveData && liveCountries.some((c) => c.country === iso);
              let fill = "#0a0d14";
              if (isCensored) fill = "#110e18";
              if (hasData) fill = "#14112a";
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="#151a28"
                  strokeWidth={0.25}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: hasData ? "#1c1836" : isCensored ? "#171224" : "#0e111a" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            });
          }}
        </Geographies>

        {/* Luminous traffic arcs */}
        {projectionFn && arcs.map((arc, i) => (
          <LuminousArc key={arc.id} arc={arc} proj={projectionFn} index={i} />
        ))}

        {/* Proxy markers */}
        {hasLiveData && PROXY_NODES.map((n) => <ProxyMarker key={n.id} node={n} />)}

        {/* Country / node markers */}
        {hasLiveData
          ? liveCountries.map((c, i) => <LiveCountryMarker key={c.country} country={c} index={i} />)
          : mockNodes.map((n, i) => <NodeMarker key={n.id} node={n} pulse={i === pulseIndex} />)}
      </ComposableMap>
    </div>
  );
}

export default memo(WorldMap);
