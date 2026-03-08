import { useState, useEffect, useCallback } from "react";
import {
  fetchGlobalStats,
  fetchBlockedRoutes,
  type DashboardCountry,
} from "../api/client";
import { mockGlobalStats, mockVolunteerStats, type GlobalStats } from "../data/mock";
import { useAuth } from "./useAuth";

// Country code → approximate lat/lng for map placement
const COUNTRY_COORDS: Record<string, [number, number]> = {
  IR: [32.43, 53.69],
  CN: [35.86, 104.20],
  RU: [61.52, 105.32],
  MM: [19.76, 96.08],
  BY: [53.71, 27.95],
  TM: [38.97, 59.56],
  VN: [14.06, 108.28],
  CU: [21.52, -77.78],
  US: [37.09, -95.71],
  PK: [30.38, 69.35],
  TH: [15.87, 100.99],
  UZ: [41.38, 64.59],
  SA: [23.89, 45.08],
  AE: [23.42, 53.85],
  IN: [20.59, 78.96],
  BD: [23.68, 90.36],
  EG: [26.82, 30.80],
  TR: [38.96, 35.24],
  VE: [6.42, -66.59],
  KZ: [48.02, 66.92],
};

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

  // When leaving demo mode, trigger a refresh
  useEffect(() => {
    if (!demoMode && isAuthenticated) {
      refresh();
    }
  }, [demoMode, isAuthenticated, refresh]);

  // Initial fetch + polling every 30s
  useEffect(() => {
    if (!isAuthenticated || demoMode) return;

    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, demoMode, refresh]);

  // Simulate stat updates between API polls
  useEffect(() => {
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
  }, []);

  return {
    globalStats,
    blockedRoutes,
    volunteerStats: mockVolunteerStats,
    isLive,
    demoMode,
    toggleDemoMode,
    error,
    countryCoords: COUNTRY_COORDS,
    refresh,
  };
}
