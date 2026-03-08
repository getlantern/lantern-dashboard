import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { setAuthToken } from "../api/client";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState["user"]>(() => {
    const saved = localStorage.getItem("dashboard_user");
    if (saved) {
      const token = localStorage.getItem("dashboard_token");
      if (token) setAuthToken(token);
      return JSON.parse(saved);
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("dashboard_token")
  );

  const login = useCallback((credentialResponse: { credential?: string }) => {
    const credential = credentialResponse.credential;
    if (!credential) return;

    const payload = decodeJwtPayload(credential);
    const hd = payload.hd as string | undefined;

    if (hd !== "getlantern.org") {
      alert("Access restricted to getlantern.org team members.");
      return;
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
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setAuthToken(null);
    localStorage.removeItem("dashboard_user");
    localStorage.removeItem("dashboard_token");
  }, []);

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
