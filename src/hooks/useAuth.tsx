import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { setAuthToken, setOnAuthExpired } from "../api/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          // prompt still accepts an optional moment-listener in the GIS API; we
          // don't use it (the FedCM migration removed the moment status
          // methods), but keep the parameter optional to avoid conflicting with
          // broader upstream declarations. cancel is optional for older builds.
          prompt: (momentListener?: (notification: unknown) => void) => void;
          cancel?: () => void;
        };
      };
    };
  }
}

// Google ID tokens carry a fixed ~1h expiry that we can't extend. To keep the
// session continuous we silently re-request a fresh credential shortly before
// the current one expires (REFRESH_BUFFER_SECONDS), rather than waiting for a
// request to 401. A silent refresh that produces no credential within
// SILENT_REFRESH_TIMEOUT_MS resolves null; the proactive scheduler treats that
// as a no-op (the current token rides until it actually expires), while the
// 401 fallback treats it as a hard failure and logs out.
const REFRESH_BUFFER_SECONDS = 5 * 60;
const SILENT_REFRESH_TIMEOUT_MS = 10_000;
// If a proactive refresh comes back empty (GIS momentarily unavailable), retry
// on this interval until the token actually expires, rather than waiting for a
// request to 401.
const SILENT_REFRESH_RETRY_MS = 30_000;

interface AuthState {
  isAuthenticated: boolean;
  user: { name: string; email: string; picture: string } | null;
  token: string | null;
  login: (credentialResponse: { credential?: string }) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

// tokenExpirySeconds returns the JWT `exp` claim (seconds since epoch), or null
// if the token is malformed / has no expiry.
function tokenExpirySeconds(token: string): number | null {
  try {
    const exp = decodeJwtPayload(token).exp;
    // Guard against missing / non-numeric / NaN exp so callers don't treat an
    // invalid token as non-expired or schedule a tight refresh loop on NaN.
    return typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = tokenExpirySeconds(token);
  if (!exp) return true;
  // Consider expired 60s before actual expiry.
  return Date.now() / 1000 > exp - 60;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState["user"]>(() => {
    const saved = localStorage.getItem("dashboard_user");
    if (saved) {
      const token = localStorage.getItem("dashboard_token");
      if (token && !isTokenExpired(token)) {
        setAuthToken(token);
        return JSON.parse(saved);
      }
      // Token expired — clear it
      localStorage.removeItem("dashboard_token");
      localStorage.removeItem("dashboard_user");
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    const t = localStorage.getItem("dashboard_token");
    return t && !isTokenExpired(t) ? t : null;
  });

  // authActiveRef tracks whether the user intends to be signed in. It gates
  // silent refresh so that a refresh STARTED after an explicit logout (e.g. a
  // late 401 from an in-flight request) can't re-authenticate them — the epoch
  // guard only catches a logout that lands mid-refresh, not one before it.
  // Initialized from the stored session so a page reload keeps refreshing.
  const authActiveRef = useRef(token !== null);

  const applyCredential = useCallback((credential: string) => {
    const payload = decodeJwtPayload(credential);
    const hd = payload.hd as string | undefined;

    if (hd !== "getlantern.org") {
      return false;
    }

    authActiveRef.current = true;

    const userData = {
      name: (payload.name as string) || "Unknown",
      email: (payload.email as string) || "",
      picture: (payload.picture as string) || "",
    };

    setUser(userData);
    setToken(credential);
    setAuthToken(credential);
    localStorage.setItem("dashboard_user", JSON.stringify(userData));
    localStorage.setItem("dashboard_token", credential);
    return true;
  }, []);

  const login = useCallback((credentialResponse: { credential?: string }) => {
    const credential = credentialResponse.credential;
    if (!credential) return;

    if (!applyCredential(credential)) {
      alert("Access restricted to getlantern.org team members.");
    }
  }, [applyCredential]);

  // sessionEpochRef increments on every logout. A silent refresh captures the
  // epoch when it starts; if it changes before the GIS callback fires, the
  // user logged out in the meantime and the arriving credential must be
  // discarded rather than silently re-authenticating them.
  const sessionEpochRef = useRef(0);
  // Shared in-flight refresh promise (see requestSilentCredential) — declared
  // here so logout can drop it.
  const inFlightRef = useRef<Promise<string | null> | null>(null);

  const logout = useCallback(() => {
    authActiveRef.current = false;
    sessionEpochRef.current += 1;
    // Drop the shared in-flight refresh so a fresh login doesn't dedupe onto a
    // pre-logout refresh (which now resolves null on the epoch mismatch and
    // could spuriously trip the new session's 401 logout fallback).
    inFlightRef.current = null;
    // Cancel any in-flight One Tap UI so a stale prompt can't re-auth us after
    // an explicit logout.
    window.google?.accounts?.id?.cancel?.();
    setUser(null);
    setToken(null);
    setAuthToken(null);
    localStorage.removeItem("dashboard_user");
    localStorage.removeItem("dashboard_token");
  }, []);

  // requestSilentCredential asks Google for a fresh ID token without showing a
  // sign-in screen. With auto_select + an existing getlantern.org session this
  // returns a new credential and the GIS UI never appears. We resolve(null) on
  // timeout because, under the FedCM migration, the One Tap moment-notification
  // methods (isNotDisplayed/isSkippedMoment) were removed — there is no callback
  // for "the prompt was suppressed", so a timeout is the only reliable signal
  // that no silent credential is coming.
  //
  // A single in-flight refresh is shared across callers (inFlightRef): a
  // scheduled refresh overlapping one or more 401-driven refreshes must not
  // fire concurrent initialize/prompt calls and race applyCredential.
  const requestSilentCredential = useCallback((): Promise<string | null> => {
    // No silent refresh once the user has explicitly logged out.
    if (!authActiveRef.current) return Promise.resolve(null);
    if (inFlightRef.current) return inFlightRef.current;

    const epoch = sessionEpochRef.current;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const refresh = new Promise<string | null>((resolve) => {
      if (!clientId || !window.google?.accounts?.id) {
        resolve(null);
        return;
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const settle = (value: string | null) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        // Dismiss any pending One Tap so a credential can't arrive after we've
        // already given up (and possibly logged out) on timeout.
        window.google?.accounts?.id?.cancel?.();
        resolve(value);
      };

      timer = setTimeout(() => settle(null), SILENT_REFRESH_TIMEOUT_MS);

      // initialize/prompt can throw synchronously if GIS isn't ready or is
      // blocked; settle(null) rather than letting the Promise reject, so
      // callers always get a resolved string | null and the logout fallback
      // still runs.
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential?: string }) => {
            // A late callback (after the timeout already resolved null, and the
            // 401 path may have logged out) must not re-apply a credential.
            // The epoch check also catches an explicit logout that happened
            // while this refresh was in flight — discard the credential.
            if (settled || sessionEpochRef.current !== epoch) {
              settle(null);
              return;
            }
            try {
              // applyCredential decodes the JWT and can throw on a malformed
              // token; settle(null) on error so refresh stays deterministic
              // instead of hanging until the timeout.
              if (response.credential && applyCredential(response.credential)) {
                settle(response.credential);
              } else {
                settle(null);
              }
            } catch {
              settle(null);
            }
          },
          auto_select: true,
          use_fedcm_for_prompt: true,
        });
        window.google.accounts.id.prompt();
      } catch {
        settle(null);
      }
    });

    // Clear the shared slot once settled so the next refresh starts fresh —
    // but only if it still points at this promise, so a refresh that logout
    // already dropped (and a new one replaced) can't null out its successor.
    const tracked = refresh.finally(() => {
      if (inFlightRef.current === tracked) inFlightRef.current = null;
    });
    inFlightRef.current = tracked;
    return tracked;
  }, [applyCredential]);

  // Register the 401 fallback: if a request is rejected, try one silent refresh
  // and, only if that fails, log out. The proactive scheduler below should
  // normally renew the token before this ever fires.
  useEffect(() => {
    setOnAuthExpired(async () => {
      // Already logged out — don't refresh or re-trigger logout.
      if (!authActiveRef.current) return null;
      const credential = await requestSilentCredential();
      if (!credential) logout();
      return credential;
    });
  }, [requestSilentCredential, logout]);

  // Proactively refresh shortly before the current token expires so the session
  // never lapses mid-use. Reschedules whenever the token changes (a successful
  // refresh swaps the token, which re-runs this effect).
  const refreshRef = useRef(requestSilentCredential);
  refreshRef.current = requestSilentCredential;
  useEffect(() => {
    if (!token) return;
    const exp = tokenExpirySeconds(token);
    if (!exp) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delayMs: number) => {
      timer = setTimeout(attempt, Math.max(0, delayMs));
    };

    const attempt = async () => {
      if (cancelled) return;
      const credential = await refreshRef.current();
      if (cancelled) return;
      // Success swaps the token, which re-runs this effect with the new expiry.
      if (credential) return;
      // Transient failure: keep retrying until the token actually expires, at
      // which point the 401 handler makes the final attempt and logs out.
      // Clamp the delay to the time left so a retry near expiry still fires
      // just before (not after) the token lapses.
      const msUntilExpiry = exp * 1000 - Date.now();
      if (msUntilExpiry > 0) {
        // Floor at 1s so a refresh that resolves null instantly (e.g. GIS not
        // loaded) can't spin in a tight loop through the final window.
        schedule(Math.max(1_000, Math.min(SILENT_REFRESH_RETRY_MS, msUntilExpiry)));
      }
    };

    schedule((exp - REFRESH_BUFFER_SECONDS) * 1000 - Date.now());
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user,
        user,
        token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
