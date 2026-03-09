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

async function lookupIP(ip: string): Promise<GeoResult | null> {
  if (cache.has(ip)) return cache.get(ip)!;
  if (inflight.has(ip)) return inflight.get(ip)!;

  const p = (async () => {
    try {
      const res = await fetch(`${GEO_API}/${ip}`);
      if (!res.ok) return null;
      const data = await res.json();
      const result: GeoResult = {
        ip,
        lat: data.Latitude ?? data.latitude ?? 0,
        lng: data.Longitude ?? data.longitude ?? 0,
        country: data.Country ?? data.country ?? "",
        city: data.City ?? data.city,
      };
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
      selfGeo = {
        ip: data.IP ?? data.ip ?? "self",
        lat: data.Latitude ?? data.latitude ?? 0,
        lng: data.Longitude ?? data.longitude ?? 0,
        country: data.Country ?? data.country ?? "",
        city: data.City ?? data.city,
      };
      return selfGeo;
    } catch {
      return null;
    }
  })();
  return selfGeoPromise;
}

/**
 * Given a list of IP:port addresses, resolve them to geo locations.
 * Also resolves the user's own location.
 * Batches lookups and caches results.
 */
export function useGeoLookup(addresses: string[]): {
  self: GeoResult | null;
  peers: GeoResult[];
} {
  const [self, setSelf] = useState<GeoResult | null>(selfGeo);
  const [peers, setPeers] = useState<GeoResult[]>([]);
  const prevAddrsRef = useRef("");

  // Look up own location once
  useEffect(() => {
    if (!self) {
      lookupSelf().then((r) => { if (r) setSelf(r); });
    }
  }, [self]);

  // Look up peer IPs (debounced — only when the set of IPs changes)
  useEffect(() => {
    const ips = [...new Set(addresses.map((a) => a.split(":")[0]).filter(Boolean))];
    const key = ips.sort().join(",");
    if (key === prevAddrsRef.current) return;
    prevAddrsRef.current = key;

    if (ips.length === 0) {
      setPeers([]);
      return;
    }

    // Resolve all (most will be cached)
    Promise.all(ips.map(lookupIP)).then((results) => {
      setPeers(results.filter((r): r is GeoResult => r !== null));
    });
  }, [addresses]);

  return { self, peers };
}
