import { useState, useEffect, useCallback } from "react";
import { fetchInfrastructure, type DashboardVPSRoute, type DashboardVPSSummary } from "../api/client";
import { useAuth } from "./useAuth";

export function useVPSData(enabled: boolean) {
  const { isAuthenticated } = useAuth();
  const [routes, setRoutes] = useState<DashboardVPSRoute[]>([]);
  const [summary, setSummary] = useState<DashboardVPSSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchInfrastructure(true);
        if (cancelled) return;
        if (!data.vpsRoutes) {
          setRoutes([]);
          setSummary(null);
          setError("VPS route data unavailable");
          return;
        }
        setRoutes(data.vpsRoutes.routes);
        setSummary(data.vpsRoutes.summary);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load VPS data");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, isAuthenticated, refreshKey]);

  return { routes, summary, isLoading, error, refresh };
}
