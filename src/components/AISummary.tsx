import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

import { getApiUrl } from "../api/client";

interface SummaryData {
  text: string;
  generatedAt: string;
  model: string;
  cached: boolean;
}

type SummaryState = "idle" | "loading" | "streaming" | "complete" | "error";

marked.setOptions({ breaks: true, gfm: true });

// The briefing panel unmounts when collapsed, so every re-open would otherwise
// fire a fresh (LLM-backed, expensive) summary request. Cache the last summary
// at module scope for the same window as the refresh cooldown and reuse it.
const SUMMARY_TTL_MS = 60_000;
let cachedSummary: { data: SummaryData; at: number } | null = null;

export default function AISummary({ authToken }: { authToken: string | null }) {
  const [state, setState] = useState<SummaryState>("idle");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The streaming EventSource outlives the request that created it, so it needs
  // a ref to be closable from unmount cleanup — the panel unmounts on collapse.
  const streamRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  const resumeCooldown = useCallback((seconds: number) => {
    setCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const startCooldown = useCallback(
    () => resumeCooldown(SUMMARY_TTL_MS / 1000),
    [resumeCooldown],
  );

  const fetchSummary = useCallback(async () => {
    if (!authToken) return;
    setState("loading");
    setError(null);

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    try {
      const res = await fetch(`${getApiUrl()}/v1/dashboard/ai-summary`, { headers });

      if (res.ok) {
        const data = await res.json();
        const next: SummaryData = {
          text: data.summary,
          generatedAt: data.generatedAt,
          model: data.model,
          cached: data.cached || false,
        };
        cachedSummary = { data: next, at: Date.now() };
        setSummary(next);
        setState("complete");
        startCooldown();
        return;
      }

      if (res.status === 503) {
        setState("error");
        setError("AI summary not configured on server");
        return;
      }

      streamSummary();
    } catch {
      streamSummary();
    }
  }, [authToken, startCooldown]);

  const streamSummary = useCallback(() => {
    if (!authToken || !mountedRef.current) return;
    setState("streaming");
    setSummary({ text: "", generatedAt: "", model: "", cached: false });

    const url = `${getApiUrl()}/v1/dashboard/ai-summary/stream`;
    streamRef.current?.close();
    const es = new EventSource(`${url}?token=${authToken}`);
    streamRef.current = es;

    es.addEventListener("summary", (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "delta") {
        setSummary((prev) =>
          prev ? { ...prev, text: prev.text + data.text } : null,
        );
      } else if (data.type === "complete") {
        const next: SummaryData = {
          text: data.text,
          generatedAt: data.generatedAt,
          model: data.model,
          cached: false,
        };
        cachedSummary = { data: next, at: Date.now() };
        setSummary(next);
        setState("complete");
        startCooldown();
        es.close();
      } else if (data.type === "error") {
        setError(data.error);
        setState("error");
        es.close();
      }
    });

    es.onerror = () => {
      setState((prev) => (prev === "streaming" ? "error" : prev));
      setError("Connection lost");
      es.close();
    };
  }, [authToken, startCooldown]);

  useEffect(() => {
    if (!authToken) return;
    const age = cachedSummary ? Date.now() - cachedSummary.at : Infinity;
    if (cachedSummary && age < SUMMARY_TTL_MS) {
      setSummary(cachedSummary.data);
      setState("complete");
      resumeCooldown(Math.ceil((SUMMARY_TTL_MS - age) / 1000));
      return;
    }
    fetchSummary();
  }, [authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // The panel unmounts whenever the briefing is collapsed; drop the cooldown
  // ticker with it rather than leaving an interval running per open/close.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, []);

  // Close expanded view on Escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [expanded]);

  const renderedHTML = useMemo(() => {
    if (!summary?.text) return "";
    const raw = marked.parse(summary.text) as string;
    return DOMPurify.sanitize(raw);
  }, [summary?.text]);

  const severityColor = useMemo(() => {
    if (!summary?.text) return "var(--panel-border)";
    const text = summary.text.toLowerCase();
    if (text.includes("critical") || text.includes("severe") || text.includes("emergency"))
      return "var(--danger)";
    if (text.includes("elevated") || text.includes("spike") || text.includes("actively blocking"))
      return "var(--secondary)";
    return "var(--primary)";
  }, [summary?.text]);

  const timeAgo = useCallback((dateStr: string) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min ago";
    return `${mins} min ago`;
  }, []);

  const card = (
    <div
      className={`ai-summary ${expanded ? "ai-summary--expanded" : ""}`}
      style={{ borderLeftColor: severityColor }}
    >
      <div className="ai-summary-header">
        <div className="ai-summary-title">
          <span className="ai-summary-icon">&#x2726;</span>
          SYSTEM BRIEFING
        </div>
        <div className="ai-summary-actions">
          {summary?.generatedAt && (
            <span className="ai-summary-timestamp">
              {timeAgo(summary.generatedAt)}
            </span>
          )}
          <button
            className="ai-summary-refresh"
            onClick={fetchSummary}
            disabled={state === "loading" || state === "streaming" || cooldown > 0}
            title={cooldown > 0 ? `Refresh in ${cooldown}s` : "Refresh summary"}
          >
            {cooldown > 0 ? `${cooldown}s` : "↻"}
          </button>
          <button
            className="ai-summary-expand"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse (Esc)" : "Expand"}
          >
            {expanded ? "✕" : "⛶"}
          </button>
        </div>
      </div>

      <div className="ai-summary-body" ref={bodyRef}>
        {state === "idle" && (
          <div className="ai-summary-placeholder">Waiting for data...</div>
        )}

        {state === "loading" && (
          <div className="ai-summary-loading">
            <div className="ai-summary-pulse" />
            Analyzing system state...
          </div>
        )}

        {(state === "streaming" || state === "complete") && summary?.text && (
          <div className="ai-summary-text">
            <div
              className="ai-summary-md"
              dangerouslySetInnerHTML={{ __html: renderedHTML }}
            />
            {state === "streaming" && (
              <span className="ai-summary-cursor">&#x2588;</span>
            )}
          </div>
        )}

        {state === "error" && (
          <div className="ai-summary-error">
            {error || "Failed to generate summary"}
            <button className="ai-summary-retry" onClick={fetchSummary}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (expanded) {
    return (
      <>
        <div className="ai-summary-overlay" onClick={() => setExpanded(false)} />
        {card}
      </>
    );
  }

  return card;
}
