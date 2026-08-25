import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const roleHome = (role) =>
  ({ doctor: "/doctor", pharmacy: "/pharmacy", delivery: "/delivery", user: "/shop", admin: "/admin" }[role] || "/");

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem("kash_token");
    if (!token) {
      setUser(false);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("kash_token");
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Handle Emergent Google OAuth callback (session_id in URL fragment) BEFORE the normal /me check.
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const hash = window.location.hash;
    if (hash && hash.includes("session_id=")) {
      const sid = new URLSearchParams(hash.replace(/^#/, "")).get("session_id");
      (async () => {
        try {
          const { data } = await api.post("/auth/google-session", {}, { headers: { "X-Session-ID": sid } });
          localStorage.setItem("kash_token", data.access_token);
          setUser(data.user);
        } catch {
          setUser(false);
        } finally {
          setLoading(false);
          window.history.replaceState(null, "", window.location.pathname);
        }
      })();
      return;
    }
    loadMe();
  }, [loadMe]);

  const persist = (data) => {
    localStorage.setItem("kash_token", data.access_token);
    setUser(data.user);
    return data.user;
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    return persist(data);
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    return persist(data);
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("kash_token");
    setUser(false);
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/shop";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, googleLogin }}>
      {children}
    </AuthContext.Provider>
  );
}
