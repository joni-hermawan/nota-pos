"use client";
// Next.js merender Server Component secara default. Aplikasi ini sepenuhnya
// interaktif (state, context) sehingga seluruh pohon komponen di bawah App
// perlu berjalan di client - cukup ditandai di sini, semua import di
// bawahnya otomatis ikut sebagai client component.

import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { AppLayout } from "./components/layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { publicApi } from "./api";
import type { MerchantBranding } from "./types";

function AppInner({ merchantSlug }: { merchantSlug?: string }) {
  const { user, loading } = useAuth();
  const [branding, setBranding] = useState<MerchantBranding | null>(null);

  // /t/{slug} - fetch that merchant's public name/logo so LoginPage can
  // show it BEFORE anyone is authenticated. Only fires once we know
  // there's no existing session (no point branding a screen that's about
  // to be replaced by AppLayout). A missing/inactive slug just silently
  // falls back to the generic LoginPage - it's a cosmetic lookup, not a
  // gate on being able to log in at all.
  useEffect(() => {
    if (!merchantSlug || loading || user) return;
    publicApi
      .merchantBranding(merchantSlug)
      .then(setBranding)
      .catch(() => setBranding(null));
  }, [merchantSlug, loading, user]);

  // Selagi status login masih diverifikasi ke backend (authApi.me(), lihat
  // AuthContext) - cookie httpOnly tidak bisa dibaca langsung dari sini,
  // jadi kita tunggu hasil verifikasi server dulu, supaya tidak sempat
  // "kelip" menampilkan LoginPage padahal user sebenarnya masih punya sesi
  // yang valid (mis. setelah refresh halaman).
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper text-sm text-ink-soft">
        Memuat sesi…
      </div>
    );
  }

  return user ? <AppLayout /> : <LoginPage branding={branding} />;
}

export default function App({ merchantSlug }: { merchantSlug?: string }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInner merchantSlug={merchantSlug} />
      </AuthProvider>
    </ToastProvider>
  );
}
