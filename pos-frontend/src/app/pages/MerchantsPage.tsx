// src/app/pages/MerchantsPage.tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, Store, Loader2, Power, Copy, Check } from "lucide-react";
import { merchantApi } from "../api";
import { Btn } from "../components/ui/Btn";
import { useToast } from "../context/ToastContext";
import type { Merchant, MerchantFormInput } from "../types";

const EMPTY: MerchantFormInput = { name: "", address: "" };

export function MerchantsPage() {
  const { showToast } = useToast();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; merchant?: Merchant } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopyLoginLink(m: Merchant) {
    const url = `${window.location.origin}/t/${m.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast({ type: "error", message: "Gagal menyalin link" });
    }
  }

  function load() {
    setLoading(true);
    merchantApi
      .list()
      .then(setMerchants)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat daftar merchant."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleToggleActive(m: Merchant) {
    try {
      await merchantApi.setActive(m.id, !m.active);
      setMerchants((prev) => prev.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)));
      showToast({ type: "success", message: !m.active ? "Merchant diaktifkan" : "Merchant dinonaktifkan", description: m.name });
    } catch (err) {
      showToast({ type: "error", message: "Gagal mengubah status", description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Merchant</h1>
          <p className="text-sm text-ink-soft">Semua toko yang memakai aplikasi ini</p>
        </div>
        <Btn ch={<><Plus size={16} /> Merchant baru</>} onClick={() => setModal({ mode: "create" })} />
      </div>

      {error && <p className="mb-4 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat merchant…</div>
      ) : merchants.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-soft">Belum ada merchant. Klik &quot;Merchant baru&quot; untuk menambahkan.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/10 bg-paper-dim text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Nama Toko</th>
                <th className="px-4 py-3 font-medium">Alamat</th>
                <th className="px-4 py-3 font-medium">Link login</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Store size={14} className="text-ink-soft" />
                      <span className="font-medium">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{m.address || "-"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleCopyLoginLink(m)} className="flex items-center gap-1.5 font-mono text-xs text-ink-soft hover:text-register">
                      {copiedId === m.id ? <><Check size={12} className="text-teal" /> Tersalin</> : <><Copy size={12} /> /t/{m.slug}</>}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.active ? "bg-teal/10 text-teal" : "bg-alert/10 text-alert"}`}>
                      {m.active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => handleToggleActive(m)} title={m.active ? "Nonaktifkan" : "Aktifkan"} className="text-ink-soft hover:text-alert">
                        <Power size={15} />
                      </button>
                      <button onClick={() => setModal({ mode: "edit", merchant: m })} className="text-xs font-medium text-register hover:underline">
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
        <MerchantFormModal
          mode={modal.mode}
          initial={modal.merchant ? { name: modal.merchant.name, address: modal.merchant.address } : undefined}
          onSubmit={async (input) => {
            if (modal.mode === "create") {
              const created = await merchantApi.create(input);
              setMerchants((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
              showToast({ type: "success", message: "Merchant ditambahkan", description: created.name });
            } else {
              const updated = await merchantApi.update(modal.merchant!.id, input);
              setMerchants((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
              showToast({ type: "success", message: "Merchant diperbarui", description: updated.name });
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function MerchantFormModal({
  mode,
  initial,
  onSubmit,
  onClose,
}: {
  mode: "create" | "edit";
  initial?: MerchantFormInput;
  onSubmit: (input: MerchantFormInput) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<MerchantFormInput>(initial ?? EMPTY);
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
      setError(err instanceof Error ? err.message : "Gagal menyimpan merchant.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 font-display text-lg font-semibold">{mode === "create" ? "Merchant baru" : "Edit merchant"}</h2>
        {error && <p className="mb-3 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Nama toko</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Toko Kopi Senja" />
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
