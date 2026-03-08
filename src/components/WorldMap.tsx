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

const COORDS: Record<string, [number, number]> = {
  IR: [53.69, 32.43], CN: [104.20, 35.86], RU: [40.32, 55.75],
  MM: [96.08, 19.76], BY: [27.95, 53.71], TM: [59.56, 38.97],
  VN: [108.28, 14.06], CU: [-77.78, 21.52], PK: [69.35, 30.38],
  TH: [100.99, 15.87], UZ: [64.59, 41.38], SA: [45.08, 23.89],
  IN: [78.96, 20.59], BD: [90.36, 23.68], EG: [30.80, 26.82],
  TR: [35.24, 38.96], VE: [-66.59, 6.42], KZ: [66.92, 48.02],
};

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
}

interface WorldMapProps {
  liveCountries?: DashboardCountry[];
}

function blockRateColor(rate: number): string {
  if (rate > 0.5) return "#e08050";
  if (rate > 0.2) return "#d4a860";
  return "#c8b878";
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
      color: "#c8b070",
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

// High graceful arc — curvature peaks well above midpoint
function arcPath(
  from: [number, number],
  to: [number, number],
  proj: (c: [number, number]) => [number, number] | null,
): string | null {
  const p1 = proj(from);
  const p2 = proj(to);
  if (!p1 || !p2) return null;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return null;
  // High graceful arc — perpendicular offset scaled strongly with distance
  const curvature = dist * 0.4;
  const mx = (p1[0] + p2[0]) / 2 - (dy / dist) * curvature;
  const my = (p1[1] + p2[1]) / 2 + (dx / dist) * curvature;
  return `M${p1[0]},${p1[1]} Q${mx},${my} ${p2[0]},${p2[1]}`;
}

// ── Draw-on arc: line grows from origin to destination, holds, fades ──

interface ActiveArc {
  arc: TrafficArc;
  startTime: number;
}

function DrawOnArc({
  arc,
  proj,
  progress,
  opacity,
}: {
  arc: TrafficArc;
  proj: (c: [number, number]) => [number, number] | null;
  progress: number; // 0→1 how much of the arc is drawn
  opacity: number;  // overall opacity (for fade-out)
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLen, setPathLen] = useState(0);

  const d = useMemo(() => arcPath(arc.from, arc.to, proj), [arc, proj]);

  useEffect(() => {
    if (pathRef.current) {
      setPathLen(pathRef.current.getTotalLength());
    }
  }, [d]);

  if (!d) return null;

  const baseWidth = 0.5 + arc.traffic * 1.0;
  const drawn = pathLen * Math.min(progress, 1);
  const dashOffset = pathLen - drawn;

  // Origin glow — bright point where the arc begins
  const originPt = proj(arc.from);

  return (
    <g opacity={opacity}>
      {/* Soft glow under the arc */}
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
      {/* Main solid arc — draws on progressively */}
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
      {/* Brighter leading edge — thin bright line at the drawn front */}
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
      {/* Origin glow point */}
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

  // Each arc gets a cycle: draw (1.5s) → hold (1s) → fade (0.8s) → pause
  // Stagger them so multiple are visible at once
  const drawDur = 1.6;
  const holdDur = 1.2;
  const fadeDur = 0.8;
  const cycleDur = drawDur + holdDur + fadeDur;
  // Stagger: space arcs evenly but overlap so ~3-4 are visible at once
  const stagger = Math.max(0.8, cycleDur / Math.min(arcs.length, 5));

  return (
    <g>
      {arcs.map((arc, i) => {
        // Each arc's local time within its cycle
        const offset = i * stagger;
        const localTime = ((time - offset) % (cycleDur + stagger * 0.5));
        if (localTime < 0) return null;

        let progress: number;
        let opacity: number;

        if (localTime < drawDur) {
          // Drawing phase — ease-out curve for natural feel
          const t = localTime / drawDur;
          progress = 1 - Math.pow(1 - t, 2.5);
          opacity = 1;
        } else if (localTime < drawDur + holdDur) {
          // Hold phase — fully drawn
          progress = 1;
          opacity = 1;
        } else if (localTime < cycleDur) {
          // Fade phase
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

function ProxyMarker({ node }: { node: typeof PROXY_NODES[0] }) {
  return (
    <Marker coordinates={[node.lng, node.lat]}>
      <circle r={2} fill="#c8b070" opacity={0.08} />
      <circle r={1} fill="#c8b070" opacity={0.35} style={{ filter: "drop-shadow(0 0 2px #c8b070)" }} />
    </Marker>
  );
}

function NodeMarker({ node, pulse }: { node: ConnectionNode; pulse: boolean }) {
  const color = node.type === "volunteer" ? "#c8b878" : "#d4a860";
  const size = node.type === "volunteer" ? 2.5 : 2;
  return (
    <Marker coordinates={[node.lng, node.lat]}>
      {node.active && pulse && (
        <circle r={size + 5} fill="none" stroke={color} strokeWidth={0.3} opacity={0.15}>
          <animate attributeName="r" from={String(size + 1)} to={String(size + 8)} dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.3" to="0" dur="2.5s" repeatCount="indefinite" />
        </circle>
      )}
      <circle
        r={size}
        fill={color}
        opacity={node.active ? 0.6 : 0.15}
        style={{ filter: node.active ? `drop-shadow(0 0 2px ${color})` : "none" }}
      />
    </Marker>
  );
}

function LiveCountryMarker({ country, index }: { country: DashboardCountry; index: number }) {
  const coords = COORDS[country.country];
  if (!coords) return null;
  const color = blockRateColor(country.avgBlockRate);
  const size = Math.max(1.5, Math.min(4, country.asnCount / 2));
  return (
    <Marker coordinates={coords}>
      <circle r={size + 2} fill="none" stroke={color} strokeWidth={0.2} opacity={0.1}>
        <animate attributeName="r" from={String(size)} to={String(size + 5)} dur="3s" begin={`${index * 0.3}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.2" to="0" dur="3s" begin={`${index * 0.3}s`} repeatCount="indefinite" />
      </circle>
      <circle r={size} fill={color} opacity={0.45} style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
      <text y={-size - 2.5} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: "4px", fill: "#e8ecf4", opacity: 0.5 }}>
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
    [hasLiveData, liveCountries],
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
              // Dark slate blue-gray to match the Lantern video aesthetic
              let fill = "#1a2030";
              let stroke = "#2a3548";
              if (isCensored) { fill = "#1c2234"; stroke = "#3a4a60"; }
              if (hasData) { fill = "#1e2438"; stroke = "#4a5a70"; }
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: hasData ? "#242a40" : isCensored ? "#222838" : "#1e2636" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            });
          }}
        </Geographies>

        {/* Draw-on arcs */}
        {projectionFn && <ArcLayer arcs={arcs} proj={projectionFn} />}

        {/* Proxy markers */}
        {hasLiveData && PROXY_NODES.map((n) => <ProxyMarker key={n.id} node={n} />)}

        {/* Node markers */}
        {hasLiveData
          ? liveCountries.map((c, i) => <LiveCountryMarker key={c.country} country={c} index={i} />)
          : mockNodes.map((n, i) => <NodeMarker key={n.id} node={n} pulse={i === pulseIndex} />)}
      </ComposableMap>
    </div>
  );
}

export default memo(WorldMap);
