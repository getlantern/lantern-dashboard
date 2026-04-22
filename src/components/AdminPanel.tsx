import { useState } from "react";
import {
  resetBanditData,
  type BanditResetResponse,
  getApiEnv,
  setApiEnv,
  type ApiEnv,
} from "../api/client";

export default function AdminPanel() {
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<BanditResetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const currentEnv = getApiEnv();

  const handleReset = async () => {
    setConfirmOpen(false);
    setResetting(true);
    setError(null);
    setResult(null);
    try {
      const res = await resetBanditData();
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 720 }}>
      <h2 style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.85rem",
        color: "var(--text-primary)",
        marginBottom: "1.5rem",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}>
        Admin
      </h2>

      {/* API environment */}
      <div style={{
        background: "var(--bg-secondary)",
        border: "1px solid #ffffff0a",
        borderRadius: "var(--radius-md)",
        padding: "1.25rem",
        marginBottom: "1rem",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--text-primary)",
          marginBottom: "0.5rem",
          fontWeight: 600,
        }}>
          API Environment
        </div>
        <div style={{
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          lineHeight: 1.6,
          marginBottom: "1rem",
        }}>
          Switch which lantern-cloud API the dashboard talks to. Stored per-browser
          in localStorage; selecting a value reloads the page so all hooks and
          caches pick up the change.
          <br />
          <span style={{ color: "var(--text-secondary)" }}>
            prod: <code>api.iantem.io</code> &middot; staging: <code>api.staging.iantem.io</code>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {(["prod", "staging"] as const).map((env) => (
            <EnvButton key={env} env={env} active={currentEnv === env} />
          ))}
          <span style={{
            marginLeft: "0.75rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.55rem",
            color: "var(--text-muted)",
          }}>
            current: <span style={{
              color: currentEnv === "prod" ? "var(--accent-primary)" : "#f0a030",
            }}>{currentEnv}</span>
          </span>
        </div>
      </div>

      {/* Bandit Reset */}
      <div style={{
        background: "var(--bg-secondary)",
        border: "1px solid #ffffff0a",
        borderRadius: "var(--radius-md)",
        padding: "1.25rem",
        marginBottom: "1rem",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--text-primary)",
          marginBottom: "0.5rem",
          fontWeight: 600,
        }}>
          Reset Bandit Data
        </div>
        <div style={{
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          lineHeight: 1.6,
          marginBottom: "1rem",
        }}>
          Deletes all bandit state from Redis: EXP3 arm weights, blocking signals,
          latency EMAs, probe ledgers, and cached configs. All arms return to uniform
          weights and the bandit restarts learning from scratch. Use this after fixing
          bugs that polluted the reward data.
        </div>

        {!confirmOpen ? (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={resetting}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              padding: "0.4rem 1rem",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-danger-dim)",
              color: "var(--accent-danger)",
              border: "1px solid #ff406030",
              cursor: resetting ? "not-allowed" : "pointer",
              opacity: resetting ? 0.5 : 1,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {resetting ? "Resetting..." : "Reset Bandit Data"}
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{
              fontSize: "0.6rem",
              color: "var(--accent-danger)",
              fontFamily: "var(--font-mono)",
            }}>
              Are you sure? This cannot be undone.
            </span>
            <button
              onClick={handleReset}
              disabled={resetting}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                padding: "0.35rem 0.8rem",
                borderRadius: "var(--radius-sm)",
                background: resetting ? "#ff406080" : "#ff4060",
                color: "#fff",
                border: "none",
                cursor: resetting ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Confirm Reset
            </button>
            <button
              onClick={() => setConfirmOpen(false)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                padding: "0.35rem 0.8rem",
                borderRadius: "var(--radius-sm)",
                background: "#ffffff08",
                color: "var(--text-muted)",
                border: "1px solid #ffffff10",
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {result && (
          <div style={{
            marginTop: "0.75rem",
            padding: "0.6rem 0.8rem",
            background: "var(--accent-primary-dim)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid #00e5c820",
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            color: "var(--accent-primary)",
          }}>
            Reset complete: {result.keysDeleted} / {result.keysFound} keys deleted
          </div>
        )}

        {error && (
          <div style={{
            marginTop: "0.75rem",
            padding: "0.6rem 0.8rem",
            background: "var(--accent-danger-dim)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid #ff406020",
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            color: "var(--accent-danger)",
          }}>
            Error: {error}
          </div>
        )}
      </div>
    </div>
  );
}

function EnvButton({ env, active }: { env: ApiEnv; active: boolean }) {
  const activeBg = env === "prod" ? "var(--accent-primary-dim)" : "#f0a03020";
  const activeColor = env === "prod" ? "var(--accent-primary)" : "#f0a030";
  const activeBorder = env === "prod" ? "#00e5c830" : "#f0a03040";
  return (
    <button
      onClick={() => {
        if (!active) setApiEnv(env);
      }}
      disabled={active}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.6rem",
        padding: "0.4rem 1rem",
        borderRadius: "var(--radius-sm)",
        background: active ? activeBg : "#ffffff08",
        color: active ? activeColor : "var(--text-muted)",
        border: `1px solid ${active ? activeBorder : "#ffffff10"}`,
        cursor: active ? "default" : "pointer",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {env}
    </button>
  );
}
