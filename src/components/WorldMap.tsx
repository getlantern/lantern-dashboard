import { memo, useMemo, useEffect, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
} from "react-simple-maps";
import { mockNodes, mockRoutes, type ConnectionNode, type ActiveRoute } from "../data/mock";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Censored countries get a subtle highlight
const CENSORED = new Set(["IR", "CN", "RU", "MM", "BY", "TM", "VN", "CU"]);

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
        style={{
          filter: node.active ? `drop-shadow(0 0 4px ${color})` : "none",
        }}
      />
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
          >
          </Line>
        );
      })}
    </>
  );
}

function WorldMap() {
  const [visibleRoutes, setVisibleRoutes] = useState<Set<number>>(new Set());
  const [pulseIndex, setPulseIndex] = useState(0);

  // Stagger route appearance
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

  // Cycle pulse through volunteer nodes
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseIndex((p) => (p + 1) % mockNodes.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const censoredSet = useMemo(() => CENSORED, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 140,
          center: [30, 25],
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const iso = geo.properties.ISO_A2 || geo.id;
              const isCensored = censoredSet.has(iso);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isCensored ? "#1a1520" : "#0f1318"}
                  stroke="#1a2030"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: isCensored ? "#251828" : "#151a24" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>

        <RouteLines routes={mockRoutes} visible={visibleRoutes} />

        {mockNodes.map((node, i) => (
          <NodeMarker key={node.id} node={node} pulse={i === pulseIndex} />
        ))}
      </ComposableMap>
    </div>
  );
}

export default memo(WorldMap);
