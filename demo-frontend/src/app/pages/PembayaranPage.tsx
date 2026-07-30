// src/app/pages/PembayaranPage.tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, Receipt, Printer, ArrowLeft } from "lucide-react";
import { PaymentMethodSelector } from "../components/ui/PaymentMethodSelector";
import { ReceiptPreview } from "../components/ui/ReceiptPreview";
import { Btn } from "../components/ui/Btn";
import { transactionApi } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PAYMENT_METHOD_LABEL } from "../constants";
import type { PendingTransaction, PaymentMethod, TransactionDetailItem } from "../types";

export function PembayaranPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PendingTransaction | null>(null);
  const [paid, setPaid] = useState(false);
  const [paidInfo, setPaidInfo] = useState<{ method: PaymentMethod; amountReceived?: number } | null>(null);
  // Detail item asli transaksi (nama, qty, harga per item) - diambil dari
  // transactionApi.detail() setelah pembayaran berhasil, supaya struk
  // menampilkan rincian produk sungguhan, bukan cuma "N item".
  const [receiptItems, setReceiptItems] = useState<TransactionDetailItem[]>([]);

  function loadPending() {
    setLoading(true);
    transactionApi
      .listPending()
      .then(setPending)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat daftar pesanan."))
      .finally(() => setLoading(false));
  }
  useEffect(loadPending, []);

  async function handleVoidAndBack() {
    if (!selected) return;
    try {
      await transactionApi.void(selected.id);
    } catch (err) {
      showToast({ type: "error", message: "Gagal membatalkan otomatis", description: err instanceof Error ? err.message : undefined });
    }
    setSelected(null);
    loadPending();
  }

  function handleDone() {
    setSelected(null);
    setPaid(false);
    setPaidInfo(null);
    setReceiptItems([]);
    loadPending();
  }

  if (paid && selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
        <ReceiptPreview
          merchantName={user?.merchantName || "Toko"}
          storeName={user?.storeName || ""}
          storeAddress={user?.storeAddress || user?.merchantAddress || ""}
          logoSrc={user?.merchantLogoUrl || null}
          invoiceNo={selected.invoiceNo}
          cashierName={user?.name ?? "Kasir"}
          items={receiptItems.map((i) => ({ name: i.name, qty: i.qty, price: i.unitPrice }))}
          total={selected.total}
          method={paidInfo ? PAYMENT_METHOD_LABEL[paidInfo.method] : "-"}
          amountReceived={paidInfo?.amountReceived}
          change={paidInfo?.amountReceived !== undefined ? paidInfo.amountReceived - selected.total : undefined}
          paidAt={new Date().toLocaleString("id-ID")}
        />
        <div className="flex gap-3 print:hidden">
          <Btn ch={<><Printer size={16} /> Cetak struk</>} onClick={() => window.print()} />
          <Btn v="secondary" ch="Selesai" onClick={handleDone} />
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <button onClick={() => setSelected(null)} className="mb-4 flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink">
          <ArrowLeft size={14} /> Kembali ke daftar
        </button>
        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <p className="mb-1 font-mono text-xs text-ink-soft">{selected.invoiceNo}</p>
          <PaymentMethodSelector
            transactionId={selected.id}
            total={selected.total}
            itemCount={selected.itemCount}
            onBack={() => void handleVoidAndBack()}
            onPaid={(info) => {
              setPaid(true);
              setPaidInfo(info);
              showToast({ type: "success", message: "Pembayaran berhasil", description: selected.invoiceNo });
              transactionApi
                .detail(selected.id)
                .then((d) => setReceiptItems(d.items))
                .catch(() => setReceiptItems([]));
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold">Pembayaran</h1>
        <p className="text-sm text-ink-soft">Pesanan yang menunggu dibayar di store ini</p>
      </div>

      {error && <p className="mb-4 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat pesanan…</div>
      ) : pending.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/15 bg-white px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brass/10">
            <Receipt size={22} className="text-brass" />
          </div>
          <h3 className="font-display font-semibold text-ink">Tidak ada pesanan menunggu</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">Pesanan baru dibuat lewat menu Kasir akan muncul di sini untuk diproses pembayarannya.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pending.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="rounded-xl border border-ink/10 bg-white p-4 text-left shadow-sm transition-colors hover:border-brass hover:bg-brass/5"
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs text-ink-soft">{p.invoiceNo}</p>
                {p.minutesOpen >= 10 && <span className="rounded-full bg-alert/10 px-2 py-0.5 text-[10px] font-medium text-alert">{p.minutesOpen} menit</span>}
              </div>
              <p className="mt-2 font-mono text-xl font-semibold tabular text-ink">Rp {p.total.toLocaleString("id-ID")}</p>
              <p className="mt-1 text-xs text-ink-soft">{p.itemCount} item · {p.cashierName}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
