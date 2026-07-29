"use client";

import { useState } from "react";
import { X, ImageOff, Camera } from "lucide-react";
import type { ProductFormInput } from "../../types";

type Props = {
  mode: "create" | "edit";
  initial?: ProductFormInput;
  initialImageUrl?: string | null;
  // imageDataUrl is undefined when the photo wasn't touched (keep whatever
  // is already saved), or a data URL string when the user picked a new file.
  onSubmit: (input: ProductFormInput, imageDataUrl?: string) => Promise<void>;
  onClose: () => void;
};

const EMPTY: ProductFormInput = { sku: "", name: "", category: "", price: 0, stock: 0, minStock: 0 };
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB - keeps the base64 payload reasonable

export function ProductFormModal({ mode, initial, initialImageUrl, onSubmit, onClose }: Props) {
  const [form, setForm] = useState<ProductFormInput>(initial ?? EMPTY);
  const [imagePreview, setImagePreview] = useState<string | null>(initialImageUrl ?? null);
  const [imageChanged, setImageChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Ukuran foto maksimal 2MB.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
      setImageChanged(true);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form, imageChanged ? imagePreview ?? "" : undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan produk.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{mode === "create" ? "Produk baru" : "Edit produk"}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink"><X size={18} /></button>
        </div>

        {error && <p className="mb-3 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Foto produk</label>
          <label className="group relative flex h-28 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-ink/20 bg-paper-dim">
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="Pratinjau produk" className="h-full w-full object-cover" />
            ) : (
              <ImageOff size={22} className="text-ink-soft/40" />
            )}
            <span className="absolute inset-0 hidden flex-col items-center justify-center gap-1 bg-ink/50 text-paper group-hover:flex">
              <Camera size={18} />
              <span className="text-[10px]">Ganti foto</span>
            </span>
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFile} />
          </label>

          <Field label="SKU">
            <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="BVG-003" />
          </Field>
          <Field label="Nama produk">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Teh Tarik" />
          </Field>
          <Field label="Kategori">
            <input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Minuman" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Harga (Rp)">
              <input required type="number" min={0} value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm font-mono tabular" />
            </Field>
            <Field label="Stok minimum">
              <input required type="number" min={0} value={form.minStock || ""} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm font-mono tabular" />
            </Field>
          </div>
          {mode === "create" && (
            <Field label="Stok awal">
              <input type="number" min={0} value={form.stock || ""} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm font-mono tabular" />
            </Field>
          )}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-md bg-register py-2.5 text-sm font-medium text-paper disabled:opacity-50">
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
            <button type="button" onClick={onClose} className="rounded-md border border-ink/15 px-4 py-2.5 text-sm font-medium">Batal</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
