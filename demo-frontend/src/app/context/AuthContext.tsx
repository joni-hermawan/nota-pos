// src/app/context/AuthContext.tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { authApi, ApiError, SESSION_EXPIRED_EVENT } from "../api";
import { logEvent } from "../utils/logger";
import type { AuthProfile } from "../types";

const SESSION_KEY = "nota_pos_sess";
const LAST_ACTIVITY_KEY = "nota_pos_last_activity";

// Waktu tidak ada aktivitas (menit) sebelum user otomatis di-logout - lebih
// cepat dari masa berlaku JWT (JWT_EXPIRES_IN di backend, default 8 jam).
// Dikonfigurasi lewat NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES kalau perlu.
const DEFAULT_TIMEOUT_MINUTES = 60;
function getTimeoutMinutes(): number {
  const raw = Number(process.env.NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MINUTES;
}
const SESSION_TIMEOUT_MS = getTimeoutMinutes() * 60 * 1000;

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel"];
const CHECK_INTERVAL_MS = 15_000;

interface AuthCtx {
  user: AuthProfile | null;
  // true selagi status login sedang diverifikasi ke server saat aplikasi
  // pertama kali dimuat - mencegah "kelip" ke LoginPage sebelum tahu
  // sebenarnya cookie sesi masih valid atau tidak.
  loading: boolean;
  login(username: string, password: string): Promise<boolean>;
  loginError: string | null;
  logout(): void;
  // Muat ulang profil dari server (mis. setelah ganti nama/logo merchant
  // di halaman Branding) supaya Sidebar/Topbar/struk langsung ikut update
  // tanpa perlu logout-login lagi.
  refreshUser(): Promise<void>;
}

const Auth = createContext<AuthCtx>({
  user: null,
  loading: true,
  login: async () => false,
  loginError: null,
  logout: () => {},
  refreshUser: async () => {},
});

function readCachedUser(): AuthProfile | null {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}
function persistUser(u: AuthProfile) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
  } catch {}
}
function clearPersistedSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {}
}
function touchActivity() {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {}
}
function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    return raw ? Number(raw) : Date.now();
  } catch {
    return Date.now();
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const userRef = useRef<AuthProfile | null>(null);
  userRef.current = user;

  const logout = useCallback(() => {
    authApi.logout().catch(() => undefined);
    clearPersistedSession();
    setUser(null);
    logEvent("info", "user logged out");
  }, []);

  // Verifikasi ke server sekali di awal - cookie httpOnly tidak bisa dibaca
  // JS, jadi satu-satunya cara tahu "masih login atau tidak" adalah
  // menanyakan ke backend (yang membaca cookie itu sendiri).
  useEffect(() => {
    const cached = readCachedUser();
    if (cached) setUser(cached); // tampilkan optimistically dulu supaya tidak kelip

    authApi
      .me()
      .then((profile) => {
        setUser(profile);
        persistUser(profile);
        touchActivity();
      })
      .catch(() => {
        setUser(null);
        clearPersistedSession();
      })
      .finally(() => setLoading(false));
  }, []);

  // Idle timeout: logout otomatis kalau tidak ada aktivitas dalam
  // SESSION_TIMEOUT_MS, dicek tiap CHECK_INTERVAL_MS.
  useEffect(() => {
    if (!user) return;

    const onActivity = () => touchActivity();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }));

    const interval = setInterval(() => {
      if (Date.now() - readLastActivity() > SESSION_TIMEOUT_MS) {
        logEvent("info", "session idle timeout - logging out");
        logout();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
      clearInterval(interval);
    };
  }, [user, logout]);

  // Kalau API manapun mengembalikan 401, api.ts men-dispatch event ini -
  // tangkap di sini supaya UI langsung tahu sesi berakhir tanpa perlu
  // menunggu request lain.
  useEffect(() => {
    const handler = () => {
      if (userRef.current) {
        setUser(null);
        clearPersistedSession();
      }
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setLoginError(null);
    try {
      const profile = await authApi.login(username, password);
      setUser(profile);
      persistUser(profile);
      touchActivity();
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Tidak bisa menghubungi server.";
      setLoginError(message);
      return false;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await authApi.me();
      setUser(profile);
      persistUser(profile);
    } catch {
      // kalau gagal (mis. sesi sudah tidak valid), biarkan state lama -
      // pemanggilan API lain yang gagal karena 401 akan menangani logout
      // lewat SESSION_EXPIRED_EVENT di atas.
    }
  }, []);

  return <Auth.Provider value={{ user, loading, login, loginError, logout, refreshUser }}>{children}</Auth.Provider>;
}

export function useAuth() {
  return useContext(Auth);
}
