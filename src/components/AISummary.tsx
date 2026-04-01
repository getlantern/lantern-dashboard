import { useState, useCallback, useEffect, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "https://api.staging.iantem.io";

interface SummaryData {
  text: string;
  generatedAt: string;
  model: string;
  cached: boolean;
}

type SummaryState = "idle" | "loading" | "streaming" | "complete" | "error";

export default function AISummary({ authToken }: { authToken: string | null }) {
  const [state, setState] = useState<SummaryState>("idle");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      // Try cached JSON endpoint first
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
        // AI not configured — try debug endpoint for raw data view
        setState("error");
        setError("AI summary not configured on server");
        return;
      }

      // Fall through to streaming
      streamSummary();
    } catch {
      // Network error — try streaming
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

  // Fetch on mount
  useEffect(() => {
    if (authToken) fetchSummary();
  }, [authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const severityColor = useCallback(() => {
    if (!summary?.text) return "var(--panel-border)";
    const text = summary.text.toLowerCase();
    if (
      text.includes("critical") ||
      text.includes("severe") ||
      text.includes("emergency")
    )
      return "var(--danger)";
    if (
      text.includes("elevated") ||
      text.includes("spike") ||
      text.includes("actively blocking")
    )
      return "var(--secondary)";
    return "var(--primary)";
  }, [summary]);

  const timeAgo = useCallback((dateStr: string) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min ago";
    return `${mins} min ago`;
  }, []);

  return (
    <div className="ai-summary" style={{ borderLeftColor: severityColor() }}>
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
        </div>
      </div>

      <div className="ai-summary-body">
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
            {summary.text.split("\n").map((line, i) => {
              if (line.startsWith("**") && line.endsWith("**")) {
                return (
                  <h4 key={i} className="ai-summary-section">
                    {line.replace(/\*\*/g, "")}
                  </h4>
                );
              }
              if (line.startsWith("- ")) {
                return (
                  <div key={i} className="ai-summary-bullet">
                    {line}
                  </div>
                );
              }
              if (line.trim() === "") return <br key={i} />;
              return <p key={i}>{line}</p>;
            })}
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
}
