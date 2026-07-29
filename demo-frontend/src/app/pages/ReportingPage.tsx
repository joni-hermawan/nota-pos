// src/app/pages/ReportingPage.tsx
"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Info, FileBarChart, Wallet, Receipt, Scale } from "lucide-react";
import { reportApi } from "../api";
import { Btn } from "../components/ui/Btn";
import { StatCard } from "../components/ui/StatCard";
import { StoreFilterBar } from "../components/ui/StoreFilterBar";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PAYMENT_METHOD_LABEL } from "../constants";
import type { ReconciliationRow } from "../types";

export function ReportingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState("");

  const isLocked = !!user?.storeId;
  const effectiveStoreId = isLocked ? user!.storeId : storeFilter;

  useEffect(() => {
    setLoading(true);
    reportApi
      .reconciliation(effectiveStoreId)
      .then(setRows)
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Gagal memuat data reporting.";
        setError(message);
        showToast({ type: "error", message: "Gagal memuat reporting", description: message });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStoreId]);

  function handleExport() {
    const header = "Tanggal,Metode,Total Sistem,Jumlah Transaksi\n";
    const body = rows.map((r) => `${r.date},${PAYMENT_METHOD_LABEL[r.method] ?? r.method},${r.systemTotal},${r.paymentCount}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const grandTotal = rows.reduce((s, r) => s + r.systemTotal, 0);
  const totalTrx = rows.reduce((s, r) => s + r.paymentCount, 0);
  const daysCovered = new Set(rows.map((r) => r.date)).size;

  // Agregat per metode pembayaran (bukan per hari) - ini yang menjawab
  // "berapa banyak transaksi dari masing-masing metode" untuk seluruh
  // periode yang ditampilkan, dihitung dari baris per-hari yang sudah ada.
  const byMethod = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const entry = byMethod.get(r.method) ?? { count: 0, total: 0 };
    entry.count += r.paymentCount;
    entry.total += r.systemTotal;
    byMethod.set(r.method, entry);
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Reporting & Rekonsiliasi</h1>
          <p className="text-sm text-ink-soft">Catatan sistem per hari & metode pembayaran, 14 hari terakhir</p>
        </div>
        <Btn ch={<><Download size={16} /> Export CSV</>} v="secondary" disabled={rows.length === 0} onClick={handleExport} />
      </div>

      {!isLocked && <StoreFilterBar value={storeFilter} onChange={setStoreFilter} />}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat data…</div>
      ) : error ? (
        <p className="rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total tercatat sistem" value={`Rp ${grandTotal.toLocaleString("id-ID")}`} sub={`${daysCovered} hari`} icon={<Wallet size={18} className="text-register" />} color="bg-register/10" />
            <StatCard label="Jumlah transaksi" value={totalTrx} icon={<Receipt size={18} className="text-teal" />} color="bg-teal/10" />
            <StatCard label="Rata-rata per transaksi" value={`Rp ${totalTrx > 0 ? Math.round(grandTotal / totalTrx).toLocaleString("id-ID") : 0}`} icon={<Scale size={18} className="text-brass" />} color="bg-brass/10" />
          </div>

          <div className="mb-4 flex items-start gap-2 rounded-md bg-brass/10 px-3 py-2 text-xs text-ink-soft">
            <Info size={14} className="mt-0.5 shrink-0 text-brass" />
            <p>
              Angka di bawah ini adalah catatan dari sistem kita sendiri (tabel <code className="font-mono">payments</code>). Untuk rekonsiliasi penuh -
              membandingkan dengan mutasi/settlement sungguhan dari bank atau payment gateway - perlu sumber data eksternal yang belum terhubung ke sistem ini.
            </p>
          </div>

          <div className="mb-6 rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
            <h3 className="mb-1 font-display font-semibold">Total per metode pembayaran</h3>
            <p className="mb-4 text-xs text-ink-soft">Jumlah transaksi & total nominal, {daysCovered} hari terakhir</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from(byMethod.entries()).map(([method, agg]) => (
                <div key={method} className="rounded-md bg-paper-dim px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{PAYMENT_METHOD_LABEL[method] ?? method}</p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular text-ink">{agg.count}x</p>
                  <p className="font-mono text-xs tabular text-ink-soft">Rp {agg.total.toLocaleString("id-ID")}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 bg-paper-dim text-left text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Metode</th>
                  <th className="px-4 py-3 font-medium text-right">Jumlah Transaksi</th>
                  <th className="px-4 py-3 font-medium text-right">Total Sistem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-3 text-ink-soft">{r.date}</td>
                    <td className="px-4 py-3 font-medium">{PAYMENT_METHOD_LABEL[r.method] ?? r.method}</td>
                    <td className="px-4 py-3 text-right font-mono tabular">{r.paymentCount}</td>
                    <td className="px-4 py-3 text-right font-mono tabular">Rp {r.systemTotal.toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-ink/15 bg-white px-6 py-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brass/10">
        <FileBarChart size={22} className="text-brass" />
      </div>
      <h3 className="font-display font-semibold text-ink">Belum ada transaksi untuk dilaporkan</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
        Halaman ini otomatis terisi begitu ada transaksi yang <strong>berhasil dibayar</strong> lewat menu Kasir. Setelah itu, di sini akan tampil:
      </p>
      <ul className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm text-ink-soft">
        <li className="flex gap-2"><span className="text-brass">•</span> Total pendapatan yang tercatat sistem, per hari &amp; per metode pembayaran (Cash/QRIS/EDC)</li>
        <li className="flex gap-2"><span className="text-brass">•</span> Jumlah transaksi dan rata-rata nilai transaksi</li>
        <li className="flex gap-2"><span className="text-brass">•</span> Tabel rincian 14 hari terakhir yang bisa di-export ke CSV untuk keperluan pembukuan</li>
      </ul>
      <p className="mx-auto mt-4 max-w-md text-xs text-ink-soft">
        Catatan: ini bukan rekonsiliasi bank sungguhan - halaman ini menampilkan apa yang <em>tercatat di sistem kita</em>, bukan mutasi/settlement asli dari bank atau payment gateway.
      </p>
    </div>
  );
}
