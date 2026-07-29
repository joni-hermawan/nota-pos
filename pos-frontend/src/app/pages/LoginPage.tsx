// src/app/pages/LoginPage.tsx
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/layout/Logo";
import { Btn } from "../components/ui/Btn";
import type { MerchantBranding } from "../types";

export function LoginPage({ branding }: { branding?: MerchantBranding | null }) {
  const { login, loginError } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await login(username, password);
    setSubmitting(false);
    // Kalau berhasil, AppInner (App.tsx) otomatis merender AppLayout begitu
    // `user` ter-update lewat AuthContext - tidak perlu redirect manual di sini.
  }

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-register p-10 text-paper md:flex">
        {branding ? (
          <div className="flex items-center gap-2">
            {branding.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.name} style={{ height: 30 }} className="object-contain" />
            )}
            <span className="font-display text-xl font-semibold">{branding.name}</span>
          </div>
        ) : (
          <Logo variant="light" size={30} />
        )}
        <div>
          <p className="font-display text-3xl font-semibold leading-tight">
            {branding ? (
              <>Selamat datang kembali,<br />{branding.name}.</>
            ) : (
              <>Satu meja kasir,<br /> satu sumber kebenaran.</>
            )}
          </p>
          <p className="mt-3 max-w-sm text-sm text-paper/70">
            Transaksi, stok, keuangan, dan analitik penjualan tersambung langsung.
          </p>
        </div>
        <p className="font-mono text-xs text-paper/40">Nota POS &copy; {new Date().getFullYear()}</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 md:hidden">
            {branding ? (
              <>
                {branding.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={branding.logoUrl} alt={branding.name} style={{ height: 28 }} className="object-contain" />
                )}
                <span className="font-display text-lg font-semibold text-register">{branding.name}</span>
              </>
            ) : (
              <Logo size={28} />
            )}
          </div>
          <h1 className="font-display text-xl font-semibold">Masuk</h1>
          <p className="mb-6 mt-1 text-sm text-ink-soft">Gunakan akun yang diberikan administrator toko.</p>

          {loginError && <p className="mb-4 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{loginError}</p>}

          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mb-4 w-full rounded-md border border-ink/15 px-3 py-2 text-sm focus:border-brass"
            placeholder="kasir01"
            required
          />

          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-6 w-full rounded-md border border-ink/15 px-3 py-2 text-sm focus:border-brass"
            placeholder="••••••••"
            required
          />

          <Btn
            type="submit"
            disabled={submitting}
            cls="w-full justify-center"
            ch={
              <>
                {submitting && <Loader2 size={16} className="animate-spin" />}
                Masuk
              </>
            }
          />
        </form>
      </div>
    </div>
  );
}
