// src/app/pages/SuperadminDashboardPage.tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, Building2, Store, Receipt, Wallet, AlertTriangle, Clock } from "lucide-react";
import { platformApi } from "../api";
import { StatCard } from "../components/ui/StatCard";
import { useToast } from "../context/ToastContext";
import type { PlatformDashboard } from "../types";

export function SuperadminDashboardPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<PlatformDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformApi
      .dashboard()
      .then(setData)
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Gagal memuat dashboard platform.";
        setError(message);
        showToast({ type: "error", message: "Gagal memuat dashboard", description: message });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat dashboard…</div>;
  if (error || !data) return <div className="p-6"><p className="rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error ?? "Data tidak tersedia."}</p></div>;

  // group merchantHealth rows by merchant for a compact per-merchant breakdown
  const byMerchant = new Map<string, { name: string; paid: number; pending: number; voided: number }>();
  for (const row of data.merchantHealth) {
    const entry = byMerchant.get(row.merchantId) ?? { name: row.merchantName, paid: 0, pending: 0, voided: 0 };
    if (row.status === "paid") entry.paid += row.trxCount;
    else if (row.status === "pending") entry.pending += row.trxCount;
    else if (row.status === "voided") entry.voided += row.trxCount;
    byMerchant.set(row.merchantId, entry);
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold">Dashboard Platform</h1>
        <p className="text-sm text-ink-soft">Monitor seluruh merchant, store, dan kesehatan transaksi</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Merchant" value={data.merchantCount} sub={`${data.activeMerchantCount} aktif`} icon={<Building2 size={18} className="text-register" />} color="bg-register/10" />
        <StatCard label="Total Store" value={data.storeCount} sub={`${data.activeStoreCount} aktif`} icon={<Store size={18} className="text-teal" />} color="bg-teal/10" />
        <StatCard label="Transaksi hari ini" value={data.todayTransactionCount} icon={<Receipt size={18} className="text-brass" />} color="bg-brass/10" />
        <StatCard label="Pendapatan hari ini" value={`Rp ${data.todayRevenue.toLocaleString("id-ID")}`} icon={<Wallet size={18} className="text-register" />} color="bg-register/10" />
      </div>

      {data.todayFailedCount > 0 && (
        <div className="mb-6 flex items-center gap-2 rounded-md bg-alert/10 px-4 py-3 text-sm text-alert">
          <AlertTriangle size={16} />
          <span><strong>{data.todayFailedCount}</strong> pembayaran gagal hari ini - lihat rincian di bawah.</span>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
        <h3 className="mb-4 font-display font-semibold">Kesehatan transaksi per merchant</h3>
        {byMerchant.size === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">Belum ada transaksi tercatat.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="py-2 pr-4 font-medium">Merchant</th>
                  <th className="py-2 px-4 text-right font-medium text-teal">Sukses</th>
                  <th className="py-2 px-4 text-right font-medium text-brass">Pending</th>
                  <th className="py-2 px-4 text-right font-medium text-alert">Voided</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byMerchant.values()).map((m, i) => (
                  <tr key={i} className="border-b border-ink/5 last:border-0">
                    <td className="py-2 pr-4 font-medium">{m.name}</td>
                    <td className="py-2 px-4 text-right font-mono tabular text-teal">{m.paid}</td>
                    <td className="py-2 px-4 text-right font-mono tabular text-brass">{m.pending}</td>
                    <td className="py-2 px-4 text-right font-mono tabular text-alert">{m.voided}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-1 flex items-center gap-2 font-display font-semibold"><AlertTriangle size={16} className="text-alert" /> Pembayaran gagal terbaru</h3>
          <p className="mb-4 text-xs text-ink-soft">Lintas semua merchant</p>
          {data.recentFailed.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-soft">Tidak ada pembayaran gagal.</p>
          ) : (
            <div className="space-y-2">
              {data.recentFailed.map((f) => (
                <div key={f.transactionId} className="rounded-md bg-alert/5 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{f.merchantName}</span>
                    <span className="font-mono tabular text-ink-soft">{f.createdAt}</span>
                  </div>
                  <p className="mt-0.5 text-ink-soft">
                    {f.invoiceNo} · {f.method.toUpperCase()} · Rp {f.amount.toLocaleString("id-ID")}
                  </p>
                  {f.reason && <p className="mt-0.5 truncate text-ink-soft/70" title={f.reason}>{f.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h3 className="mb-1 flex items-center gap-2 font-display font-semibold"><Clock size={16} className="text-brass" /> Transaksi pending yang macet</h3>
          <p className="mb-4 text-xs text-ink-soft">Belum selesai lebih dari 10 menit</p>
          {data.stuckPending.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-soft">Tidak ada transaksi yang macet.</p>
          ) : (
            <div className="space-y-2">
              {data.stuckPending.map((s) => (
                <div key={s.transactionId} className="rounded-md bg-brass/5 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.merchantName}</span>
                    <span className="font-mono tabular text-brass">{s.minutesStuck} menit</span>
                  </div>
                  <p className="mt-0.5 text-ink-soft">{s.invoiceNo} · Rp {s.amount.toLocaleString("id-ID")}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
