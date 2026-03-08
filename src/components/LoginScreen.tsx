import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../hooks/useAuth";

export default function LoginScreen() {
  const { login } = useAuth();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "2.5rem",
        background: "var(--bg-primary)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 40, height: 40 }}>
            <rect x="10" y="8" width="12" height="18" rx="2" stroke="#00e5c8" strokeWidth="1.5" fill="none" />
            <rect x="12" y="5" width="8" height="3" rx="1" fill="#00e5c8" opacity="0.6" />
            <path d="M14 5 L14 3 Q16 1 18 3 L18 5" stroke="#00e5c8" strokeWidth="1.2" fill="none" opacity="0.5" />
            <ellipse cx="16" cy="17" rx="3" ry="4" fill="#00e5c8" opacity="0.15" />
            <path d="M16 13 Q14.5 16 15 18 Q15.5 20 16 20 Q16.5 20 17 18 Q17.5 16 16 13Z" fill="#00e5c8" opacity="0.7" />
            <path d="M16 14.5 Q15.2 16 15.5 17.5 Q15.8 19 16 19 Q16.2 19 16.5 17.5 Q16.8 16 16 14.5Z" fill="#f0a030" opacity="0.8" />
            <line x1="10" y1="12" x2="22" y2="12" stroke="#00e5c8" strokeWidth="0.8" opacity="0.3" />
            <line x1="10" y1="22" x2="22" y2="22" stroke="#00e5c8" strokeWidth="0.8" opacity="0.3" />
            <rect x="11" y="26" width="10" height="2" rx="1" fill="#00e5c8" opacity="0.4" />
          </svg>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: "2rem",
              letterSpacing: "-0.03em",
            }}
          >
            Lantern
          </h1>
        </div>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--accent-primary)",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
          }}
        >
          Impact Dashboard
        </p>
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            marginTop: "1rem",
            maxWidth: 320,
          }}
        >
          Real-time visibility into the global Lantern network.
          <br />
          Sign in with your Lantern team account.
        </p>
      </div>

      <div
        style={{
          padding: "2rem",
          background: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid #ffffff08",
        }}
      >
        <GoogleLogin
          onSuccess={login}
          onError={() => console.error("Login failed")}
          theme="filled_black"
          shape="pill"
          size="large"
          text="signin_with"
        />
      </div>

      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.6rem",
          color: "var(--text-muted)",
        }}
      >
        Restricted to @getlantern.org accounts
      </p>
    </div>
  );
}
