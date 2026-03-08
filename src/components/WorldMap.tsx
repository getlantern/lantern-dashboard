import { memo, useMemo, useEffect, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
} from "react-simple-maps";
import { mockNodes, mockRoutes, type ConnectionNode, type ActiveRoute } from "../data/mock";
import type { DashboardCountry } from "../api/client";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const CENSORED = new Set(["IR", "CN", "RU", "MM", "BY", "TM", "VN", "CU"]);

// Approximate country centroids for live data markers
const COUNTRY_COORDS: Record<string, [number, number]> = {
  IR: [53.69, 32.43], CN: [104.20, 35.86], RU: [105.32, 61.52],
  MM: [96.08, 19.76], BY: [27.95, 53.71], TM: [59.56, 38.97],
  VN: [108.28, 14.06], CU: [-77.78, 21.52], US: [-95.71, 37.09],
  PK: [69.35, 30.38], TH: [100.99, 15.87], UZ: [64.59, 41.38],
  SA: [45.08, 23.89], AE: [53.85, 23.42], IN: [78.96, 20.59],
  BD: [90.36, 23.68], EG: [30.80, 26.82], TR: [35.24, 38.96],
  VE: [-66.59, 6.42], KZ: [66.92, 48.02],
};

interface WorldMapProps {
  liveCountries?: DashboardCountry[];
}

function blockRateColor(rate: number): string {
  if (rate > 0.5) return "#ff4060";
  if (rate > 0.2) return "#f0a030";
  return "#00e5c8";
}

function NodeMarker({ node, pulse }: { node: ConnectionNode; pulse: boolean }) {
  const color = node.type === "volunteer" ? "#00e5c8" : "#f0a030";
  const size = node.type === "volunteer" ? 4 : 3.5;

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
        strokeWidth={0.8}
        opacity={node.active ? 0.9 : 0.3}
        style={{ filter: node.active ? `drop-shadow(0 0 4px ${color})` : "none" }}
      />
    </Marker>
  );
}

function LiveCountryMarker({ country, index }: { country: DashboardCountry; index: number }) {
  const coords = COUNTRY_COORDS[country.country];
  if (!coords) return null;

  const color = blockRateColor(country.avgBlockRate);
  const size = Math.max(3, Math.min(8, country.asnCount / 2));

  return (
    <Marker coordinates={coords}>
      <circle r={size + 4} fill="none" stroke={color} strokeWidth={0.4} opacity={0.2}>
        <animate
          attributeName="r"
          from={String(size)} to={String(size + 8)}
          dur="3s" begin={`${index * 0.4}s`}
          repeatCount="indefinite"
        />
        <animate attributeName="opacity" from="0.4" to="0" dur="3s" begin={`${index * 0.4}s`} repeatCount="indefinite" />
      </circle>
      <circle r={size} fill={color} opacity={0.7} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      <text
        y={-size - 4}
        textAnchor="middle"
        style={{ fontFamily: "var(--font-mono)", fontSize: "6px", fill: "#e8ecf4", opacity: 0.8 }}
      >
        {country.country}
      </text>
      <text
        y={size + 8}
        textAnchor="middle"
        style={{ fontFamily: "var(--font-mono)", fontSize: "5px", fill: color, opacity: 0.7 }}
      >
        {country.asnCount} ASN{country.asnCount !== 1 ? "s" : ""}
      </text>
    </Marker>
  );
}

function RouteLines({ routes, visible }: { routes: ActiveRoute[]; visible: Set<number> }) {
  return (
    <>
      {routes.map((route, i) => {
        if (!visible.has(i)) return null;
        return (
          <Line
            key={`${route.from.id}-${route.to.id}`}
            from={[route.from.lng, route.from.lat]}
            to={[route.to.lng, route.to.lat]}
            stroke="#4090ff"
            strokeWidth={0.6}
            strokeLinecap="round"
            strokeOpacity={0.35}
            strokeDasharray="4 3"
          />
        );
      })}
    </>
  );
}

function WorldMap({ liveCountries }: WorldMapProps) {
  const [visibleRoutes, setVisibleRoutes] = useState<Set<number>>(new Set());
  const [pulseIndex, setPulseIndex] = useState(0);
  const hasLiveData = liveCountries && liveCountries.length > 0;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    mockRoutes.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleRoutes((prev) => new Set([...prev, i]));
        }, 400 + i * 200)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const nodes = hasLiveData ? liveCountries : mockNodes;
    const interval = setInterval(() => {
      setPulseIndex((p) => (p + 1) % nodes.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [hasLiveData, liveCountries]);

  const censoredSet = useMemo(() => CENSORED, []);

  // Build a set of countries with live data for map coloring
  const liveCountrySet = useMemo(() => {
    if (!liveCountries) return new Set<string>();
    return new Set(liveCountries.map((c) => c.country));
  }, [liveCountries]);

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140, center: [30, 25] }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const iso = geo.properties.ISO_A2 || geo.id;
              const isCensored = censoredSet.has(iso);
              const hasData = liveCountrySet.has(iso);
              let fill = isCensored ? "#1a1520" : "#0f1318";
              if (hasData) fill = "#1a1828";
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="#1a2030"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: hasData ? "#252040" : isCensored ? "#251828" : "#151a24" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>

        {!hasLiveData && <RouteLines routes={mockRoutes} visible={visibleRoutes} />}

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
