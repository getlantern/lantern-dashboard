import { useState, useEffect, useCallback, useRef } from "react";

const EMBED_SCRIPT_URL = "https://embed.lantern.io/static/js/main.js";
const STORAGE_KEY = "lantern_proxy_stats";

export interface ProxySessionStats {
  totalSessionSeconds: number;
  totalSessions: number;
  lastSessionStart: number | null;
}

function loadStoredStats(): ProxySessionStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProxySessionStats;
      // Recover crashed session: if lastSessionStart is set, the previous session
      // didn't shut down cleanly. Estimate elapsed time and fold it in.
      if (parsed.lastSessionStart) {
        const crashed = Math.max(0, Math.floor((Date.now() - parsed.lastSessionStart) / 1000));
        parsed.totalSessionSeconds += crashed;
        parsed.lastSessionStart = null;
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return { totalSessionSeconds: 0, totalSessions: 0, lastSessionStart: null };
}

function saveStats(stats: ProxySessionStats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function useProxy() {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<ProxySessionStats>(loadStoredStats);
  // currentSessionSeconds lives in a ref + dedicated state to avoid re-rendering
  // the entire ProxyWidget tree (including the embed) every second
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const sessionStartRef = useRef<number | null>(null);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  // Load the embed script once
  const loadScript = useCallback(() => {
    if (document.querySelector(`script[src="${EMBED_SCRIPT_URL}"]`)) {
      setScriptLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = EMBED_SCRIPT_URL;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setScriptError(true);
    document.body.appendChild(script);
  }, []);

  // Track session duration
  const startSession = useCallback(() => {
    // Guard against double invocation (e.g. React strict mode)
    if (timerRef.current) return;

    const now = Date.now();
    sessionStartRef.current = now;
    setIsRunning(true);
    setCurrentSeconds(0);
    setStats((prev) => {
      const updated = {
        ...prev,
        totalSessions: prev.totalSessions + 1,
        lastSessionStart: now,
      };
      saveStats(updated);
      return updated;
    });

    // Only update the lightweight currentSeconds counter each tick —
    // no localStorage writes, no full-tree re-renders
    timerRef.current = setInterval(() => {
      if (!sessionStartRef.current) return;
      setCurrentSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
  }, []);

  const stopSession = useCallback(() => {
    setIsRunning(false);
    setCurrentSeconds(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    if (sessionStartRef.current) {
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      setStats((prev) => {
        const updated = {
          ...prev,
          totalSessionSeconds: prev.totalSessionSeconds + elapsed,
          lastSessionStart: null,
        };
        saveStats(updated);
        return updated;
      });
    }
    sessionStartRef.current = null;
  }, []);

  // Persist on beforeunload for crash recovery, and clean up on unmount
  useEffect(() => {
    const handleUnload = () => {
      if (sessionStartRef.current) {
        const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
        const current = statsRef.current;
        saveStats({
          ...current,
          totalSessionSeconds: current.totalSessionSeconds + elapsed,
          lastSessionStart: null,
        });
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      // Finalize session on unmount (e.g. tab switch in dashboard)
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
      if (sessionStartRef.current) {
        const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
        const current = statsRef.current;
        saveStats({
          ...current,
          totalSessionSeconds: current.totalSessionSeconds + elapsed,
          lastSessionStart: null,
        });
        sessionStartRef.current = null;
      }
    };
  }, []);

  return {
    scriptLoaded,
    scriptError,
    isRunning,
    stats,
    currentSeconds,
    loadScript,
    startSession,
    stopSession,
  };
}
