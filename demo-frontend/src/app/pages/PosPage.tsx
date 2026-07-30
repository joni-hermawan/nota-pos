// src/app/pages/PosPage.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Minus, Trash2, ImageOff, Loader2, CheckCircle2, Wallet } from "lucide-react";
import { StoreGate } from "../components/ui/StoreGate";
import { Btn } from "../components/ui/Btn";
import { productApi, transactionApi } from "../api";
import { useToast } from "../context/ToastContext";
import type { Product } from "../types";

type CartLine = { productId: string; name: string; price: number; qty: number };

export function PosPage() {
  return <StoreGate>{(storeId) => <PosPageInner storeId={storeId} />}</StoreGate>;
}

function PosPageInner({ storeId }: { storeId: string }) {
  const { showToast } = useToast();

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  const [creatingTrx, setCreatingTrx] = useState(false);
  const [trxError, setTrxError] = useState<string | null>(null);
  // Order yang BARU DIBUAT (belum dibayar - pembayarannya diproses terpisah
  // di menu "Pembayaran", bukan di sini). Ini yang memisahkan alur
  // order-taking dari payment-collection, mirip POS restoran/retail pada
  // umumnya.
  const [createdOrder, setCreatedOrder] = useState<{ invoiceNo: string; total: number; itemCount: number } | null>(null);

  function loadCatalog() {
    setLoadingCatalog(true);
    productApi
      .list(storeId)
      .then(setCatalog)
      .catch((err) => setCatalogError(err instanceof Error ? err.message : "Gagal memuat produk."))
      .finally(() => setLoadingCatalog(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadCatalog, [storeId]);

  const filtered = catalog.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const total = useMemo(() => cart.reduce((s, l) => s + l.price * l.qty, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);

  function addItem(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      const currentQty = existing?.qty ?? 0;
      if (currentQty + 1 > p.stock) {
        showToast({ type: "error", message: "Stok tidak cukup", description: `${p.name} tersisa ${p.stock}` });
        return prev;
      }
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { productId: p.id, name: p.name, price: p.price, qty: 1 }];
    });
  }
  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.productId !== productId) return l;
          if (delta > 0) {
            const stock = catalog.find((p) => p.id === productId)?.stock ?? Infinity;
            if (l.qty + delta > stock) {
              showToast({ type: "error", message: "Stok tidak cukup", description: `Tersisa ${stock}` });
              return l;
            }
          }
          return { ...l, qty: l.qty + delta };
        })
        .filter((l) => l.qty > 0)
    );
  }
  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function handleCreateOrder() {
    setTrxError(null);
    setCreatingTrx(true);
    try {
      const items = cart.map((l) => ({ productId: l.productId, qty: l.qty }));
      const trx = await transactionApi.create(items);
      setCreatedOrder({ invoiceNo: trx.invoiceNo, total: trx.total, itemCount });
      setCart([]);
      showToast({ type: "success", message: "Pesanan dibuat", description: trx.invoiceNo });
    } catch (err) {
      setTrxError(err instanceof Error ? err.message : "Gagal membuat pesanan.");
    } finally {
      setCreatingTrx(false);
    }
  }

  function handleNewOrder() {
    setCreatedOrder(null);
    setTrxError(null);
    loadCatalog();
  }

  if (createdOrder) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <CheckCircle2 size={44} className="text-teal" />
        <div>
          <h2 className="font-display text-lg font-semibold">Pesanan dibuat</h2>
          <p className="font-mono text-sm text-ink-soft">{createdOrder.invoiceNo}</p>
        </div>
        <div className="rounded-md bg-paper-dim px-4 py-2.5 text-sm">
          {createdOrder.itemCount} item · <span className="font-mono font-semibold tabular">Rp {createdOrder.total.toLocaleString("id-ID")}</span>
        </div>
        <p className="max-w-xs text-xs text-ink-soft">
          Pesanan ini menunggu di menu <strong>Pembayaran</strong> - proses kapan saja, bisa oleh kasir yang sama atau yang lain.
        </p>
        <div className="flex gap-3">
          <Btn ch={<><Wallet size={16} /> Buka Pembayaran</>} onClick={() => window.dispatchEvent(new CustomEvent("nota-pos:navigate", { detail: "pembayaran" }))} />
          <Btn v="secondary" ch="Pesanan baru" onClick={handleNewOrder} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:grid lg:grid-cols-[1fr_360px] lg:overflow-hidden">
      <div className="p-6 lg:overflow-y-auto">
        <div className="mb-5 flex items-center gap-2 rounded-md border border-ink/15 bg-white px-3 py-2">
          <Search size={16} className="text-ink-soft" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari produk…" className="w-full text-sm outline-none" />
        </div>

        {catalogError && <p className="mb-4 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{catalogError}</p>}

        {loadingCatalog ? (
          <div className="flex items-center gap-2 py-10 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat produk…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addItem(p)}
                disabled={p.stock <= 0}
                className="rounded-lg border border-ink/10 bg-white p-3 text-left transition-colors hover:border-brass hover:bg-brass/5 disabled:opacity-40"
              >
                <div className="mb-2 flex h-24 w-full items-center justify-center overflow-hidden rounded-md bg-paper-dim">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <ImageOff size={22} className="text-ink-soft/40" />
                  )}
                </div>
                <p className="text-xs text-ink-soft">{p.category}</p>
                <p className="mt-1 font-display text-sm font-medium leading-snug">{p.name}</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="font-mono text-sm tabular text-register">Rp {p.price.toLocaleString("id-ID")}</p>
                  <p className="font-mono text-xs tabular text-ink-soft">Stok {p.stock}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col border-t border-ink/10 bg-white lg:border-l lg:border-t-0">
        <div className="border-b border-ink/10 px-5 py-4">
          <h2 className="font-display font-semibold">Keranjang</h2>
        </div>

        <div className="px-5 py-3 lg:flex-1 lg:overflow-y-auto">
          {cart.length === 0 && <p className="mt-10 text-center text-sm text-ink-soft">Belum ada item. Pilih produk di sebelah kiri.</p>}
          {cart.map((l) => (
            <div key={l.productId} className="mb-3 flex items-center justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium">{l.name}</p>
                <p className="font-mono text-xs tabular text-ink-soft">Rp {l.price.toLocaleString("id-ID")}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => updateQty(l.productId, -1)} className="rounded border border-ink/15 p-1"><Minus size={12} /></button>
                <span className="w-5 text-center font-mono text-sm tabular">{l.qty}</span>
                <button onClick={() => updateQty(l.productId, 1)} className="rounded border border-ink/15 p-1"><Plus size={12} /></button>
                <button onClick={() => removeLine(l.productId)} className="ml-1 text-alert"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 border-t border-ink/10 bg-white px-5 py-4">
          {trxError && <p className="mb-3 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{trxError}</p>}

          <div className="mb-4 flex items-center justify-between font-mono text-lg font-semibold tabular">
            <span className="font-body text-sm font-medium text-ink-soft">Total</span>
            <span>Rp {total.toLocaleString("id-ID")}</span>
          </div>
          <Btn
            cls="w-full justify-center"
            disabled={cart.length === 0 || creatingTrx}
            onClick={handleCreateOrder}
            ch={<>{creatingTrx && <Loader2 size={16} className="animate-spin" />} Buat Pesanan</>}
          />
        </div>
      </div>
    </div>
  );
}
