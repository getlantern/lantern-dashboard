import { useState, useEffect } from "react";
import { fetchReleaseSkew, type ReleaseSkewResponse } from "../api/client";
import { useAuth } from "./useAuth";

// useReleaseSkew polls the /release-skew endpoint on a 60s cadence while
// the consumer is enabled. Preserves the last successful payload across
// refreshes (isFirst/hasLoaded) so the UI doesn't blank out between
// polls — same pattern as useVPSData.
export function useReleaseSkew(enabled: boolean) {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<ReleaseSkewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;
    let cancelled = false;
    let isFirst = true;

    const refresh = async () => {
      if (isFirst) setIsLoading(true);
      try {
        const resp = await fetchReleaseSkew();
        if (cancelled) return;
        setData(resp);
        setError(null);
        setHasLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load release skew");
      } finally {
        if (!cancelled && isFirst) setIsLoading(false);
        isFirst = false;
      }
    };

    refresh();
    const interval = setInterval(refresh, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled, isAuthenticated]);

  return { data, isLoading, hasLoaded, error };
}
