// src/app/pages/ProdukStokPage.tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, AlertTriangle, Search, ImageOff, Loader2 } from "lucide-react";
import { productApi } from "../api";
import { ProductFormModal } from "../components/ui/ProductFormModal";
import { StoreGate } from "../components/ui/StoreGate";
import { Btn } from "../components/ui/Btn";
import { useToast } from "../context/ToastContext";
import type { Product, ProductFormInput } from "../types";

export function ProdukStokPage() {
  return <StoreGate>{(storeId) => <ProdukStokPageInner storeId={storeId} />}</StoreGate>;
}

function ProdukStokPageInner({ storeId }: { storeId: string }) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; product?: Product } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function loadProducts() {
    setLoading(true);
    setError(null);
    productApi
      .list(storeId)
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat daftar produk."))
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadProducts, [storeId]);

  const filtered = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase()));

  async function adjustStock(id: string, delta: number) {
    setPendingId(id);
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p)));
    try {
      await productApi.adjustStock(id, delta, delta > 0 ? "restock" : "adjustment", storeId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal memperbarui stok.";
      setError(message);
      showToast({ type: "error", message: "Gagal memperbarui stok", description: message });
      loadProducts();
    } finally {
      setPendingId(null);
    }
  }

  // imageDataUrl === undefined -> foto tidak diubah (biarkan yang lama)
  // imageDataUrl === ""        -> tidak dipakai saat ini (belum ada tombol hapus foto)
  // imageDataUrl === "data:.." -> foto baru, simpan ke backend
  async function handleCreate(input: ProductFormInput, imageDataUrl?: string) {
    const created = await productApi.create({ ...input, storeId });
    let finalProduct = created;
    if (imageDataUrl) {
      await productApi.updateImage(created.id, imageDataUrl);
      finalProduct = { ...created, imageUrl: imageDataUrl };
    }
    setProducts((prev) => [...prev, finalProduct].sort((a, b) => a.name.localeCompare(b.name)));
    showToast({ type: "success", message: "Produk ditambahkan", description: created.name });
  }

  async function handleEdit(id: string, input: ProductFormInput, imageDataUrl?: string) {
    const updated = await productApi.update(id, { ...input, storeId });
    let finalProduct = updated;
    if (imageDataUrl) {
      await productApi.updateImage(id, imageDataUrl);
      finalProduct = { ...updated, imageUrl: imageDataUrl };
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? finalProduct : p)));
    showToast({ type: "success", message: "Produk diperbarui", description: updated.name });
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Produk & Stok</h1>
          <p className="text-sm text-ink-soft">Kelola katalog produk dan mutasi stok gudang</p>
        </div>
        <Btn ch={<><Plus size={16} /> Produk baru</>} onClick={() => setModal({ mode: "create" })} />
      </div>

      {error && <p className="mb-4 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="mb-4 flex items-center gap-2 rounded-md border border-ink/15 bg-white px-3 py-2 sm:w-80">
        <Search size={16} className="text-ink-soft" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari produk atau SKU…" className="w-full text-sm outline-none" />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat produk…</div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-soft">Belum ada produk. Klik &quot;Produk baru&quot; untuk menambahkan.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/10 bg-paper-dim text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Foto</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Produk</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium text-right">Harga</th>
                <th className="px-4 py-3 font-medium text-right">Stok</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const low = p.stock <= p.minStock;
                const isPending = pendingId === p.id;
                return (
                  <tr key={p.id} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setModal({ mode: "edit", product: p })}
                        className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-paper-dim"
                        title="Klik untuk ubah foto lewat form edit"
                      >
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff size={16} className="text-ink-soft/40" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{p.sku}</td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-ink-soft">{p.category}</td>
                    <td className="px-4 py-3 text-right font-mono tabular">Rp {p.price.toLocaleString("id-ID")}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {low && <AlertTriangle size={14} className="text-alert" />}
                        <button disabled={isPending} onClick={() => adjustStock(p.id, -1)} className="rounded border border-ink/15 px-2 text-xs disabled:opacity-40">−</button>
                        <span className={`w-8 text-center font-mono tabular ${low ? "text-alert font-semibold" : ""}`}>
                          {isPending ? <Loader2 size={12} className="mx-auto animate-spin" /> : p.stock}
                        </span>
                        <button disabled={isPending} onClick={() => adjustStock(p.id, 1)} className="rounded border border-ink/15 px-2 text-xs disabled:opacity-40">+</button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setModal({ mode: "edit", product: p })} className="text-ink-soft hover:text-register"><Pencil size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-ink-soft">
        <AlertTriangle size={12} className="mb-0.5 mr-1 inline text-alert" />
        Produk dengan stok di bawah batas minimum ditandai untuk direstok segera.
      </p>

      {modal && (
        <ProductFormModal
          mode={modal.mode}
          initial={modal.product ? { sku: modal.product.sku, name: modal.product.name, category: modal.product.category, price: modal.product.price, stock: modal.product.stock, minStock: modal.product.minStock } : undefined}
          initialImageUrl={modal.product?.imageUrl}
          onSubmit={(input, imageDataUrl) => (modal.mode === "create" ? handleCreate(input, imageDataUrl) : handleEdit(modal.product!.id, input, imageDataUrl))}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
