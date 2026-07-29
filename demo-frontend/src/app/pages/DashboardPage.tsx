// src/app/pages/DashboardPage.tsx
"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Wallet, Receipt, TrendingUp, Loader2 } from "lucide-react";
import { StatCard } from "../components/ui/StatCard";
import { StoreFilterBar } from "../components/ui/StoreFilterBar";
import { reportApi } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PAYMENT_METHOD_LABEL } from "../constants";
import type { DashboardData } from "../types";

export function DashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState(""); // "" = agregat semua store

  const isLocked = !!user?.storeId;
  const effectiveStoreId = isLocked ? user!.storeId : storeFilter;

  useEffect(() => {
    setLoading(true);
    reportApi
      .dashboard(effectiveStoreId)
      .then(setData)
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Gagal memuat data dashboard.";
        setError(message);
        showToast({ type: "error", message: "Gagal memuat dashboard", description: message });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStoreId]);

  if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat dashboard…</div>;
  if (error || !data) return <div className="p-6"><p className="rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error ?? "Data tidak tersedia."}</p></div>;

  const todayRevenue = data.todayRevenue ?? 0;
  const todayTrxCount = data.todayTransactionCount ?? 0;
  const avgTrx = todayTrxCount > 0 ? todayRevenue / todayTrxCount : 0;
  const weekRevenue = (data.salesTrend ?? []).reduce((s, d) => s + d.revenue, 0);
  const paymentBreakdown = data.paymentBreakdown ?? [];
  const topProducts = data.topProducts ?? [];
  const leastProducts = data.leastProducts ?? [];
  const totalPaymentAmount = paymentBreakdown.reduce((s, p) => s + p.totalAmount, 0);

  return (
    <div className="p-6">
      {!isLocked && <StoreFilterBar value={storeFilter} onChange={setStoreFilter} />}
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-ink-soft">Ringkasan performa toko</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pendapatan hari ini" value={`Rp ${todayRevenue.toLocaleString("id-ID")}`} icon={<Wallet size={18} className="text-register" />} color="bg-register/10" />
        <StatCard label="Transaksi hari ini" value={todayTrxCount} icon={<Receipt size={18} className="text-teal" />} color="bg-teal/10" />
        <StatCard label="Rata-rata nilai transaksi" value={`Rp ${Math.round(avgTrx).toLocaleString("id-ID")}`} icon={<TrendingUp size={18} className="text-brass" />} color="bg-brass/10" />
        <StatCard label="Pendapatan 7 hari terakhir" value={`Rp ${weekRevenue.toLocaleString("id-ID")}`} icon={<Wallet size={18} className="text-register" />} color="bg-register/10" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-4 font-display font-semibold">Tren penjualan 7 hari terakhir</h3>
          {!data.salesTrend || data.salesTrend.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-soft">Belum ada data penjualan.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.salesTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C1B1810" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "var(--font-plex-mono)" }} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}jt`} tick={{ fontSize: 12, fontFamily: "var(--font-plex-mono)" }} />
                <Tooltip formatter={(v: number) => `Rp ${v.toLocaleString("id-ID")}`} />
                <Line type="monotone" dataKey="revenue" stroke="#0B3D2E" strokeWidth={2.5} dot={{ fill: "#C7973B" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-1 font-display font-semibold">Metode pembayaran</h3>
          <p className="mb-4 text-xs text-ink-soft">Distribusi hari ini</p>
          {paymentBreakdown.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-soft">Belum ada transaksi hari ini.</p>
          ) : (
            <div className="space-y-3">
              {paymentBreakdown.map((p) => {
                const pct = totalPaymentAmount > 0 ? Math.round((p.totalAmount / totalPaymentAmount) * 100) : 0;
                return <PaymentBar key={p.method} label={PAYMENT_METHOD_LABEL[p.method] ?? p.method} pct={pct} count={p.paymentCount} />;
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-1 font-display font-semibold">Produk terlaris</h3>
          <p className="mb-4 text-xs text-ink-soft">Berdasarkan jumlah terjual</p>
          {topProducts.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-soft">Belum ada data penjualan produk.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" tick={{ fontSize: 11, fontFamily: "var(--font-plex-mono)" }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qtySold" fill="#1D7A73" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-1 font-display font-semibold">Produk kurang peminat</h3>
          <p className="mb-4 text-xs text-ink-soft">Kandidat evaluasi stok atau harga</p>
          {leastProducts.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-soft">Belum ada data penjualan produk.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={leastProducts} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" tick={{ fontSize: 11, fontFamily: "var(--font-plex-mono)" }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qtySold" fill="#B3412C" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentBar({ label, pct, count }: { label: string; pct: number; count: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="font-mono tabular text-ink-soft">{count}x · {pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink/5">
        <div className="h-full rounded-full bg-brass" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
