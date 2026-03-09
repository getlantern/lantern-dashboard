import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { setAuthToken, setOnAuthExpired } from "../api/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; getMomentType: () => string }) => void) => void;
        };
      };
    };
  }
}

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

function isTokenExpired(token: string): boolean {
  try {
    const payload = decodeJwtPayload(token);
    const exp = payload.exp as number;
    if (!exp) return true;
    // Consider expired 60s before actual expiry
    return Date.now() / 1000 > exp - 60;
  } catch {
    return true;
  }
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

  const applyCredential = useCallback((credential: string) => {
    const payload = decodeJwtPayload(credential);
    const hd = payload.hd as string | undefined;

    if (hd !== "getlantern.org") {
      return false;
    }

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

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setAuthToken(null);
    localStorage.removeItem("dashboard_user");
    localStorage.removeItem("dashboard_token");
  }, []);

  // Register the 401 handler that silently refreshes the token
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    setOnAuthExpired(() => {
      return new Promise<string | null>((resolve) => {
        if (!window.google?.accounts?.id) {
          logout();
          resolve(null);
          return;
        }

        // Set up a one-time callback for the silent refresh
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential?: string }) => {
            if (response.credential && applyCredential(response.credential)) {
              resolve(response.credential);
            } else {
              logout();
              resolve(null);
            }
          },
          auto_select: true,
        });

        // Prompt for silent re-auth (One Tap)
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // Silent refresh failed — force re-login
            logout();
            resolve(null);
          }
        });
      });
    });
  }, [applyCredential, logout]);

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
