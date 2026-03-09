import { useState, useEffect, useCallback, useRef } from "react";

const EMBED_SCRIPT_URL = "https://embed.lantern.io/beta/static/js/main.js";
const STORAGE_KEY = "lantern_proxy_stats";

export interface ProxySessionStats {
  totalSessionSeconds: number;
  totalSessions: number;
  lastSessionStart: number | null;
}

export interface ProxyConnection {
  state: 1 | -1;
  workerIdx: number;
  addr: string;
}

export interface ProxyLiveData {
  connectionDetails: ProxyConnection[];
  throughputBps: number;
  lifetimeConnections: number;
  ready: boolean;
  sharing: boolean;
}

// LanternProxy headless API type (exposed by unbounded on window)
interface LanternProxyAPI {
  init(options?: { mock?: boolean }): Promise<void>;
  start(): void;
  stop(): void;
  on<T = unknown>(event: string, callback: (value: T) => void): () => void;
  off(event: string, callback: (value: unknown) => void): void;
  getState(): {
    ready: boolean;
    sharing: boolean;
    connections: unknown[];
    throughput: number;
    lifetimeConnections: number;
    chunks: unknown[];
  };
  initialized: boolean;
}

declare global {
  interface Window {
    LanternProxy?: LanternProxyAPI;
  }
}

function elapsedSeconds(start: number): number {
  return Math.max(0, Math.floor((Date.now() - start) / 1000));
}

function loadStoredStats(): ProxySessionStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProxySessionStats;
      if (parsed.lastSessionStart) {
        parsed.totalSessionSeconds += elapsedSeconds(parsed.lastSessionStart);
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
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [liveData, setLiveData] = useState<ProxyLiveData>({
    connectionDetails: [],
    throughputBps: 0,
    lifetimeConnections: 0,
    ready: false,
    sharing: false,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const sessionStartRef = useRef<number | null>(null);
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const unsubsRef = useRef<Array<() => void>>([]);
  const proxyInitializedRef = useRef(false);

  // Inject the headless embed element + load script
  const loadScript = useCallback(() => {
    // Inject a hidden headless embed element if not present
    if (!document.querySelector('browsers-unbounded[data-headless="true"]')) {
      const el = document.createElement("browsers-unbounded");
      el.setAttribute("data-headless", "true");
      el.style.display = "none";
      document.body.appendChild(el);
    }

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

  // Initialize the headless proxy API once script is loaded
  const initProxy = useCallback(async () => {
    if (proxyInitializedRef.current) return;
    const proxy = window.LanternProxy;
    if (!proxy) return;

    try {
      await proxy.init();
      proxyInitializedRef.current = true;

      // Subscribe to live data events
      const unsubs: Array<() => void> = [];
      unsubs.push(proxy.on<boolean>("ready", (v) => setLiveData((d) => ({ ...d, ready: v }))));
      unsubs.push(proxy.on<boolean>("sharing", (v) => setLiveData((d) => ({ ...d, sharing: v }))));
      unsubs.push(proxy.on<ProxyConnection[]>("connections", (v) => setLiveData((d) => ({ ...d, connectionDetails: v }))));
      unsubs.push(proxy.on<number>("throughput", (v) => setLiveData((d) => ({ ...d, throughputBps: v }))));
      unsubs.push(proxy.on<number>("lifetimeConnections", (v) => setLiveData((d) => ({ ...d, lifetimeConnections: v }))));
      unsubsRef.current = unsubs;

      // Sync state that may have been emitted during init() before subscriptions
      const state = proxy.getState();
      setLiveData({
        connectionDetails: (state.connections ?? []) as ProxyConnection[],
        throughputBps: state.throughput ?? 0,
        lifetimeConnections: state.lifetimeConnections ?? 0,
        ready: state.ready ?? false,
        sharing: state.sharing ?? false,
      });
    } catch {
      setScriptError(true);
    }
  }, []);

  // Start proxying via headless API
  const startSession = useCallback(() => {
    if (timerRef.current) return;

    const proxy = window.LanternProxy;
    if (proxy?.initialized) {
      proxy.start();
    }

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

    timerRef.current = setInterval(() => {
      if (!sessionStartRef.current) return;
      setCurrentSeconds(elapsedSeconds(sessionStartRef.current));
    }, 1000);
  }, []);

  const stopSession = useCallback(() => {
    const proxy = window.LanternProxy;
    if (proxy?.initialized) {
      proxy.stop();
    }

    setIsRunning(false);
    setCurrentSeconds(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    if (sessionStartRef.current) {
      const elapsed = elapsedSeconds(sessionStartRef.current);
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
        const elapsed = elapsedSeconds(sessionStartRef.current);
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
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
      if (sessionStartRef.current) {
        const elapsed = elapsedSeconds(sessionStartRef.current);
        const current = statsRef.current;
        saveStats({
          ...current,
          totalSessionSeconds: current.totalSessionSeconds + elapsed,
          lastSessionStart: null,
        });
        sessionStartRef.current = null;
      }
      // Unsubscribe from proxy events and allow re-init
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];
      proxyInitializedRef.current = false;
    };
  }, []);

  return {
    scriptLoaded,
    scriptError,
    isRunning,
    stats,
    currentSeconds,
    liveData,
    loadScript,
    initProxy,
    startSession,
    stopSession,
  };
}
