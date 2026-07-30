// src/app/pages/RiwayatTransaksiPage.tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, Printer, ArrowLeft, History } from "lucide-react";
import { transactionApi } from "../api";
import { ReceiptPreview } from "../components/ui/ReceiptPreview";
import { Btn } from "../components/ui/Btn";
import { StoreFilterBar } from "../components/ui/StoreFilterBar";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PAYMENT_METHOD_LABEL } from "../constants";
import type { TransactionHistoryRow, TransactionDetail } from "../types";

export function RiwayatTransaksiPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [rows, setRows] = useState<TransactionHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("");

  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const isLocked = !!user?.storeId;
  const effectiveStoreId = isLocked ? user!.storeId : storeFilter;

  function load() {
    setLoading(true);
    setError(null);
    transactionApi
      .history(effectiveStoreId)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat riwayat transaksi."))
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [effectiveStoreId]);

  async function openDetail(id: string) {
    setLoadingDetail(true);
    try {
      const d = await transactionApi.detail(id);
      setDetail(d);
    } catch (err) {
      showToast({ type: "error", message: "Gagal memuat detail transaksi", description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoadingDetail(false);
    }
  }

  const filtered = rows.filter((r) => r.invoiceNo.toLowerCase().includes(query.toLowerCase()));

  if (detail) {
    const change = detail.amountReceived !== null ? detail.amountReceived - detail.total : undefined;
    return (
      <div className="flex h-full flex-col items-center gap-6 p-8">
        <button onClick={() => setDetail(null)} className="mb-2 flex w-full max-w-xs items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink">
          <ArrowLeft size={14} /> Kembali ke daftar
        </button>

        {detail.status === "voided" ? (
          <div className="w-full max-w-xs rounded-md bg-alert/10 px-4 py-3 text-center text-sm text-alert">
            Transaksi ini <strong>dibatalkan (voided)</strong> - tidak pernah ada pembayaran yang selesai.
          </div>
        ) : (
          <>
            <ReceiptPreview
              merchantName={user?.merchantName || "Toko"}
              storeName={detail.storeName}
              storeAddress={detail.storeAddress}
              logoSrc={user?.merchantLogoUrl || null}
              invoiceNo={detail.invoiceNo}
              cashierName={detail.cashierName}
              items={detail.items.map((i) => ({ name: i.name, qty: i.qty, price: i.unitPrice }))}
              total={detail.total}
              method={PAYMENT_METHOD_LABEL[detail.method] ?? detail.method}
              amountReceived={detail.amountReceived ?? undefined}
              change={change}
              paidAt={detail.createdAt}
            />
            <div className="flex gap-3 print:hidden">
              <Btn ch={<><Printer size={16} /> Cetak ulang</>} onClick={() => window.print()} />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold">Riwayat Transaksi</h1>
        <p className="text-sm text-ink-soft">30 hari terakhir - cari & cetak ulang struk</p>
      </div>

      {!isLocked && <StoreFilterBar value={storeFilter} onChange={setStoreFilter} />}

      <div className="mb-4 flex items-center gap-2 rounded-md border border-ink/15 bg-white px-3 py-2 sm:w-80">
        <Search size={16} className="text-ink-soft" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nomor invoice…" className="w-full text-sm outline-none" />
      </div>

      {error && <p className="mb-4 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat riwayat…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/15 bg-white px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brass/10">
            <History size={22} className="text-brass" />
          </div>
          <h3 className="font-display font-semibold text-ink">Belum ada transaksi</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">Transaksi yang sudah dibayar atau dibatalkan akan muncul di sini.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/10 bg-paper-dim text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Waktu</th>
                <th className="px-4 py-3 font-medium">Kasir</th>
                <th className="px-4 py-3 font-medium">Metode</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">{r.invoiceNo}</td>
                  <td className="px-4 py-3 text-ink-soft">{r.createdAt}</td>
                  <td className="px-4 py-3">{r.cashierName}</td>
                  <td className="px-4 py-3 text-ink-soft">{PAYMENT_METHOD_LABEL[r.method] ?? (r.method || "-")}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "paid" ? "bg-teal/10 text-teal" : "bg-alert/10 text-alert"}`}>
                      {r.status === "paid" ? "Selesai" : "Voided"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular">Rp {r.total.toLocaleString("id-ID")}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openDetail(r.id)} disabled={loadingDetail} className="text-xs font-medium text-register hover:underline disabled:opacity-50">
                      {loadingDetail ? "Memuat…" : "Lihat"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
