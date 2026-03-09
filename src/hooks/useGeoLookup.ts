import { useState, useEffect, useRef } from "react";

export interface GeoResult {
  ip: string;
  lat: number;
  lng: number;
  country: string;
  city?: string;
}

const GEO_API = "https://geo.getiantem.org/lookup";
const cache = new Map<string, GeoResult>();
const inflight = new Map<string, Promise<GeoResult | null>>();

function parseGeoResponse(ip: string, data: Record<string, any>): GeoResult {
  const loc = data.Location ?? data.location ?? {};
  return {
    ip,
    lat: loc.Latitude ?? loc.latitude ?? data.Latitude ?? data.latitude ?? 0,
    lng: loc.Longitude ?? loc.longitude ?? data.Longitude ?? data.longitude ?? 0,
    country: data.Country?.IsoCode ?? data.Country?.isoCode ?? data.country ?? "",
    city: data.City?.Names?.en ?? data.City?.names?.en ?? data.city,
  };
}

async function lookupIP(ip: string): Promise<GeoResult | null> {
  if (cache.has(ip)) return cache.get(ip)!;
  if (inflight.has(ip)) return inflight.get(ip)!;

  const p = (async () => {
    try {
      const res = await fetch(`${GEO_API}/${ip}`);
      if (!res.ok) return null;
      const data = await res.json();
      const result = parseGeoResponse(ip, data);
      cache.set(ip, result);
      return result;
    } catch {
      return null;
    } finally {
      inflight.delete(ip);
    }
  })();

  inflight.set(ip, p);
  return p;
}

// Look up the user's own location (no IP param = self-lookup)
let selfGeo: GeoResult | null = null;
let selfGeoPromise: Promise<GeoResult | null> | null = null;

async function lookupSelf(): Promise<GeoResult | null> {
  if (selfGeo) return selfGeo;
  if (selfGeoPromise) return selfGeoPromise;
  selfGeoPromise = (async () => {
    try {
      const res = await fetch(GEO_API);
      if (!res.ok) return null;
      const data = await res.json();
      selfGeo = parseGeoResponse(data.IP ?? data.ip ?? "self", data);
      return selfGeo;
    } catch {
      return null;
    } finally {
      // Clear promise on failure so retries are possible
      if (!selfGeo) selfGeoPromise = null;
    }
  })();
  return selfGeoPromise;
}

/**
 * Given a list of IP:port addresses, resolve them to geo locations.
 * Also resolves the user's own location.
 * Lookups are deferred until `enabled` is true.
 */
export function useGeoLookup(addresses: string[], enabled = true): {
  self: GeoResult | null;
  peers: GeoResult[];
} {
  const [self, setSelf] = useState<GeoResult | null>(selfGeo);
  const [peers, setPeers] = useState<GeoResult[]>([]);
  const prevAddrsRef = useRef("");

  // Look up own location once (only when enabled)
  useEffect(() => {
    if (!enabled || self) return;
    let cancelled = false;
    lookupSelf().then((r) => { if (r && !cancelled) setSelf(r); });
    return () => { cancelled = true; };
  }, [enabled, self]);

  // Look up peer IPs (only when the set of IPs actually changes)
  useEffect(() => {
    if (!enabled) return;

    const ips = [...new Set(addresses.map((a) => a.split(":")[0]).filter(Boolean))];
    const key = ips.sort().join(",");
    if (key === prevAddrsRef.current) return;
    prevAddrsRef.current = key;

    if (ips.length === 0) {
      setPeers([]);
      return;
    }

    let cancelled = false;
    Promise.all(ips.map(lookupIP)).then((results) => {
      if (!cancelled) {
        setPeers(results.filter((r): r is GeoResult => r !== null));
      }
    });
    return () => { cancelled = true; };
  }, [addresses, enabled]);

  return { self, peers };
}
