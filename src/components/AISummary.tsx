import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

const API_URL = import.meta.env.VITE_API_URL || "https://api.staging.iantem.io";

interface SummaryData {
  text: string;
  generatedAt: string;
  model: string;
  cached: boolean;
}

type SummaryState = "idle" | "loading" | "streaming" | "complete" | "error";

marked.setOptions({ breaks: true, gfm: true });

export default function AISummary({ authToken }: { authToken: string | null }) {
  const [state, setState] = useState<SummaryState>("idle");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const startCooldown = useCallback(() => {
    setCooldown(60);
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

  const fetchSummary = useCallback(async () => {
    if (!authToken) return;
    setState("loading");
    setError(null);

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    try {
      const res = await fetch(`${API_URL}/v1/dashboard/ai-summary`, { headers });

      if (res.ok) {
        const data = await res.json();
        setSummary({
          text: data.summary,
          generatedAt: data.generatedAt,
          model: data.model,
          cached: data.cached || false,
        });
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
    if (!authToken) return;
    setState("streaming");
    setSummary({ text: "", generatedAt: "", model: "", cached: false });

    const url = `${API_URL}/v1/dashboard/ai-summary/stream`;
    const es = new EventSource(`${url}?token=${authToken}`);

    es.addEventListener("summary", (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "delta") {
        setSummary((prev) =>
          prev ? { ...prev, text: prev.text + data.text } : null,
        );
      } else if (data.type === "complete") {
        setSummary({
          text: data.text,
          generatedAt: data.generatedAt,
          model: data.model,
          cached: false,
        });
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
    if (authToken) fetchSummary();
  }, [authToken]); // eslint-disable-line react-hooks/exhaustive-deps

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
