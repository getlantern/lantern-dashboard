import { useState, useEffect, useCallback } from "react";
import {
  fetchGlobalStats,
  fetchBlockedRoutes,
  type DashboardCountry,
} from "../api/client";
import { mockGlobalStats, mockVolunteerStats, type GlobalStats } from "../data/mock";
import { useAuth } from "./useAuth";


export interface LiveGlobalStats extends GlobalStats {
  countries: DashboardCountry[];
}

export function useLiveData() {
  const { isAuthenticated } = useAuth();
  const [globalStats, setGlobalStats] = useState<LiveGlobalStats>({
    ...mockGlobalStats,
    countries: [],
  });
  const [blockedRoutes, setBlockedRoutes] = useState<string[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || demoMode) return;

    try {
      const [global, blocked] = await Promise.all([
        fetchGlobalStats(),
        fetchBlockedRoutes(),
      ]);

      const totalASNs = global.countries.reduce((sum, c) => sum + c.asnCount, 0);

      setGlobalStats((prev) => ({
        ...prev,
        countriesReached: global.countries.length,
        blocksEvadedToday: global.blockedCount > 0 ? global.blockedCount : prev.blocksEvadedToday,
        countries: global.countries,
        activeUsers: totalASNs > 0 ? totalASNs * 50 : prev.activeUsers,
      }));

      setBlockedRoutes(blocked);
      setIsLive(true);
      setError(null);
    } catch (err) {
      console.warn("Dashboard API unavailable, using mock data:", err);
      setError(err instanceof Error ? err.message : "API error");
      setIsLive(false);
    }
  }, [isAuthenticated, demoMode]);

  const toggleDemoMode = useCallback(() => {
    setDemoMode((prev) => {
      const next = !prev;
      if (next) {
        // Switch to demo: reset to mock data
        setGlobalStats({ ...mockGlobalStats, countries: [] });
        setBlockedRoutes([]);
        setIsLive(false);
      }
      return next;
    });
  }, []);

  // Initial fetch + polling every 30s (also re-triggers when leaving demo mode)
  useEffect(() => {
    if (!isAuthenticated || demoMode) return;

    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, demoMode, refresh]);

  // Simulate stat jitter only in demo/mock mode — don't corrupt live API data
  useEffect(() => {
    if (isLive) return;
    const interval = setInterval(() => {
      setGlobalStats((prev) => ({
        ...prev,
        activeVolunteers: prev.activeVolunteers + Math.floor(Math.random() * 10 - 4),
        activeUsers: prev.activeUsers + Math.floor(Math.random() * 40 - 15),
        totalSessionsToday: prev.totalSessionsToday + Math.floor(Math.random() * 30),
        bandwidthTodayTB: +(prev.bandwidthTodayTB + Math.random() * 0.01).toFixed(2),
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, [isLive]);

  return {
    globalStats,
    blockedRoutes,
    volunteerStats: mockVolunteerStats,
    isLive,
    demoMode,
    toggleDemoMode,
    error,
    refresh,
  };
}
