import { useState, useEffect, useCallback } from "react";
import {
  fetchOverview,
  fetchInfrastructure,
  getStreamURL,
  type DashboardCountry,
  type DashboardDataCenter,
  type DashboardActivityEvent,
  type DashboardTrafficFlow,
} from "../api/client";
import { mockGlobalStats, mockVolunteerStats, type GlobalStats } from "../data/mock";
import { useAuth } from "./useAuth";


export interface LiveGlobalStats extends GlobalStats {
  countries: DashboardCountry[];
}

const emptyStats: LiveGlobalStats = {
  activeVolunteers: 0,
  activeUsers: 0,
  countriesReached: 0,
  protocolsGenerated: 0,
  protocolsActive: 0,
  blocksEvadedToday: 0,
  totalSessionsToday: 0,
  bandwidthTodayTB: 0,
  countries: [],
};

export function useLiveData() {
  const { isAuthenticated, token } = useAuth();
  const [globalStats, setGlobalStats] = useState<LiveGlobalStats>(emptyStats);
  const [dataCenters, setDataCenters] = useState<DashboardDataCenter[]>([]);
  const [activityEvents, setActivityEvents] = useState<DashboardActivityEvent[]>([]);
  const [trafficFlows, setTrafficFlows] = useState<DashboardTrafficFlow[]>([]);
  const [blockedRoutes, setBlockedRoutes] = useState<string[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || demoMode) return;

    try {
      // Two calls instead of four: /overview (countries + blocked + flows)
      // and /infrastructure (data centers).
      const [overview, infra] = await Promise.allSettled([
        fetchOverview(),
        fetchInfrastructure(),
      ]);

      if (overview.status !== "fulfilled") {
        throw overview.reason;
      }

      if (infra.status === "fulfilled") setDataCenters(infra.value.dataCenters);

      const data = overview.value;
      const totalASNs = data.countries.reduce((sum, c) => sum + c.asnCount, 0);

      setGlobalStats((prev) => ({
        ...prev,
        activeUsers: totalASNs > 0 ? totalASNs * 50 : prev.activeUsers,
        countriesReached: data.countries.length,
        blocksEvadedToday: data.blockedCount > 0 ? data.blockedCount : prev.blocksEvadedToday,
        countries: data.countries,
      }));

      setBlockedRoutes(data.blockedRoutes);
      setTrafficFlows(data.trafficFlows);
      setIsLive(true);
      setError(null);
    } catch (err) {
      console.warn("Dashboard API unavailable:", err);
      setError(err instanceof Error ? err.message : "API error");
      setIsLive(false);
    }
  }, [isAuthenticated, demoMode]);

  const toggleDemoMode = useCallback(() => {
    setDemoMode((prev) => {
      const next = !prev;
      if (next) {
        setGlobalStats({ ...mockGlobalStats, countries: [] });
        setDataCenters([]);
        setActivityEvents([]);
        setTrafficFlows([]);
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

  // SSE stream for real-time activity events
  useEffect(() => {
    if (!isAuthenticated || demoMode) return;

    const url = getStreamURL();
    if (!url) return;

    const es = new EventSource(url);
    const maxEvents = 100;

    es.addEventListener("activity", (e) => {
      try {
        const event: DashboardActivityEvent = JSON.parse(e.data);
        setActivityEvents((prev) => [event, ...prev].slice(0, maxEvents));
      } catch {
        // ignore malformed events
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do
    };

    return () => es.close();
  }, [isAuthenticated, demoMode, token]);

  // Simulate stat jitter only in demo mode
  useEffect(() => {
    if (!demoMode) return;
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
  }, [demoMode]);

  return {
    globalStats,
    dataCenters,
    activityEvents,
    trafficFlows,
    blockedRoutes,
    volunteerStats: mockVolunteerStats,
    isLive,
    demoMode,
    toggleDemoMode,
    error,
    refresh,
  };
}
