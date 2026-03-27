import { useState, useEffect } from "react";
import { fetchVPSRoutes, type DashboardVPSRoute, type DashboardVPSSummary } from "../api/client";
import { useAuth } from "./useAuth";

export function useVPSData(enabled: boolean) {
  const { isAuthenticated } = useAuth();
  const [routes, setRoutes] = useState<DashboardVPSRoute[]>([]);
  const [summary, setSummary] = useState<DashboardVPSSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    let cancelled = false;

    const refresh = async () => {
      setIsLoading(true);
      try {
        const data = await fetchVPSRoutes();
        if (!cancelled) {
          setRoutes(data.routes);
          setSummary(data.summary);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load VPS data");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    refresh();
    const interval = setInterval(refresh, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, isAuthenticated]);

  return { routes, summary, isLoading, error };
}
