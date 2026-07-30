// src/app/pages/StoresPage.tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, Store as StoreIcon, Loader2, Power } from "lucide-react";
import { storeApi } from "../api";
import { Btn } from "../components/ui/Btn";
import { useToast } from "../context/ToastContext";
import type { Store, StoreFormInput } from "../types";

const EMPTY: StoreFormInput = { name: "", address: "" };

export function StoresPage() {
  const { showToast } = useToast();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; store?: Store } | null>(null);

  function load() {
    setLoading(true);
    storeApi
      .list()
      .then(setStores)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat daftar store."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleToggleActive(s: Store) {
    try {
      await storeApi.setActive(s.id, !s.active);
      setStores((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)));
      showToast({ type: "success", message: !s.active ? "Store diaktifkan" : "Store dinonaktifkan", description: s.name });
    } catch (err) {
      showToast({ type: "error", message: "Gagal mengubah status", description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Stores</h1>
          <p className="text-sm text-ink-soft">Cabang/outlet dalam merchant Anda - stok dihitung terpisah per store</p>
        </div>
        <Btn ch={<><Plus size={16} /> Store baru</>} onClick={() => setModal({ mode: "create" })} />
      </div>

      {error && <p className="mb-4 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat store…</div>
      ) : stores.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-soft">Belum ada store. Klik &quot;Store baru&quot; untuk menambahkan.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/10 bg-paper-dim text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Nama Store</th>
                <th className="px-4 py-3 font-medium">Alamat</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StoreIcon size={14} className="text-ink-soft" />
                      <span className="font-medium">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{s.address || "-"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.active ? "bg-teal/10 text-teal" : "bg-alert/10 text-alert"}`}>
                      {s.active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => handleToggleActive(s)} title={s.active ? "Nonaktifkan" : "Aktifkan"} className="text-ink-soft hover:text-alert">
                        <Power size={15} />
                      </button>
                      <button onClick={() => setModal({ mode: "edit", store: s })} className="text-xs font-medium text-register hover:underline">
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <StoreFormModal
          mode={modal.mode}
          initial={modal.store ? { name: modal.store.name, address: modal.store.address } : undefined}
          onSubmit={async (input) => {
            if (modal.mode === "create") {
              const created = await storeApi.create(input);
              setStores((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
              showToast({ type: "success", message: "Store ditambahkan", description: created.name });
            } else {
              const updated = await storeApi.update(modal.store!.id, input);
              setStores((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
              showToast({ type: "success", message: "Store diperbarui", description: updated.name });
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function StoreFormModal({
  mode,
  initial,
  onSubmit,
  onClose,
}: {
  mode: "create" | "edit";
  initial?: StoreFormInput;
  onSubmit: (input: StoreFormInput) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<StoreFormInput>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan store.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 font-display text-lg font-semibold">{mode === "create" ? "Store baru" : "Edit store"}</h2>
        {error && <p className="mb-3 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Nama store</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Cabang Mall X" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Alamat</span>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Jl. Contoh No. 1" />
          </label>
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
