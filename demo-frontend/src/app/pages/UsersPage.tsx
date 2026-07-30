// src/app/pages/UsersPage.tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, KeyRound, ArrowRightLeft } from "lucide-react";
import { userApi, merchantApi, storeApi } from "../api";
import { useAuth } from "../context/AuthContext";
import { Btn } from "../components/ui/Btn";
import { useToast } from "../context/ToastContext";
import { ROLE_LABEL } from "../constants";
import type { UserSummary, UserFormInput, UserUpdateInput, Merchant, Store, Role } from "../types";

const STORE_LOCKED_ROLES: Role[] = ["kasir", "ppic", "store_manager"];

export function UsersPage() {
  const { user: me } = useAuth();
  const { showToast } = useToast();
  const isSuperAdmin = me?.role === "superadmin";
  const isStoreManager = me?.role === "store_manager";

  // Role apa saja yang boleh caller ini buat/ubah - store_manager cuma
  // kasir/ppic; admin/superadmin dapat semua kecuali superadmin sendiri.
  const assignableRoles: Role[] = isStoreManager ? ["kasir", "ppic"] : ["kasir", "ppic", "finance", "admin", "store_manager"];

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; user?: UserSummary } | null>(null);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);
  const [reassignMerchantTarget, setReassignMerchantTarget] = useState<UserSummary | null>(null);
  const [reassignStoreTarget, setReassignStoreTarget] = useState<UserSummary | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    userApi
      .list()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat daftar pengguna."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  useEffect(() => {
    if (isSuperAdmin) merchantApi.list().then(setMerchants).catch(() => undefined);
  }, [isSuperAdmin]);

  useEffect(() => {
    // admin butuh daftar store untuk pilih di form (store_manager sudah
    // terkunci ke store-nya sendiri, tidak butuh ini)
    if (!isSuperAdmin && !isStoreManager) storeApi.list().then(setStores).catch(() => undefined);
  }, [isSuperAdmin, isStoreManager]);

  async function handleCreate(input: UserFormInput) {
    const created = await userApi.create(input);
    setUsers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    showToast({ type: "success", message: "Pengguna ditambahkan", description: created.name });
  }

  async function handleUpdate(id: string, input: UserUpdateInput) {
    const updated = await userApi.update(id, input);
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    showToast({ type: "success", message: "Pengguna diperbarui", description: updated.name });
  }

  const showMerchantColumn = isSuperAdmin;
  const showStoreColumn = isSuperAdmin || !isStoreManager; // store_manager sudah tahu semuanya di store sendiri

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Pengguna</h1>
          <p className="text-sm text-ink-soft">
            {isSuperAdmin ? "Semua akun staff lintas merchant" : isStoreManager ? `Kelola kasir & PPIC untuk ${me?.storeName}` : `Kelola akun staff untuk ${me?.merchantName}`}
          </p>
        </div>
        <Btn ch={<><Plus size={16} /> Pengguna baru</>} onClick={() => setModal({ mode: "create" })} />
      </div>

      {error && <p className="mb-4 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat pengguna…</div>
      ) : users.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-soft">Belum ada pengguna.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/10 bg-paper-dim text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Role</th>
                {showMerchantColumn && <th className="px-4 py-3 font-medium">Merchant</th>}
                {showStoreColumn && <th className="px-4 py-3 font-medium">Store</th>}
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">{u.username}</td>
                  <td className="px-4 py-3 text-ink-soft">{ROLE_LABEL[u.role]}</td>
                  {showMerchantColumn && <td className="px-4 py-3 text-ink-soft">{u.merchantName}</td>}
                  {showStoreColumn && <td className="px-4 py-3 text-ink-soft">{u.storeName || "-"}</td>}
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.active ? "bg-teal/10 text-teal" : "bg-alert/10 text-alert"}`}>
                      {u.active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => setResetTarget(u)} title="Reset password" className="text-ink-soft hover:text-register">
                        <KeyRound size={15} />
                      </button>
                      {isSuperAdmin && (
                        <button onClick={() => setReassignMerchantTarget(u)} title="Pindah merchant" className="text-ink-soft hover:text-register">
                          <ArrowRightLeft size={15} />
                        </button>
                      )}
                      {!isSuperAdmin && !isStoreManager && STORE_LOCKED_ROLES.includes(u.role) && (
                        <button onClick={() => setReassignStoreTarget(u)} title="Pindah store" className="text-ink-soft hover:text-register">
                          <ArrowRightLeft size={15} />
                        </button>
                      )}
                      <button onClick={() => setModal({ mode: "edit", user: u })} className="text-xs font-medium text-register hover:underline">
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
        <UserFormModal
          mode={modal.mode}
          initial={modal.user}
          isSuperAdmin={isSuperAdmin}
          isStoreManager={isStoreManager}
          assignableRoles={assignableRoles}
          merchants={merchants}
          stores={stores}
          onSubmit={(input) =>
            modal.mode === "create"
              ? handleCreate(input as UserFormInput)
              : handleUpdate(modal.user!.id, input as UserUpdateInput)
          }
          onClose={() => setModal(null)}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onSubmit={async (newPassword) => {
            await userApi.resetPassword(resetTarget.id, newPassword);
            showToast({ type: "success", message: "Password direset", description: resetTarget.name });
          }}
          onClose={() => setResetTarget(null)}
        />
      )}

      {reassignMerchantTarget && (
        <ReassignMerchantModal
          user={reassignMerchantTarget}
          merchants={merchants}
          onSubmit={async (merchantId) => {
            const updated = await userApi.reassignMerchant(reassignMerchantTarget.id, merchantId);
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
            showToast({ type: "success", message: "Merchant pengguna diubah", description: updated.name });
          }}
          onClose={() => setReassignMerchantTarget(null)}
        />
      )}

      {reassignStoreTarget && (
        <ReassignStoreModal
          user={reassignStoreTarget}
          stores={stores}
          onSubmit={async (storeId) => {
            const updated = await userApi.reassignStore(reassignStoreTarget.id, storeId);
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
            showToast({ type: "success", message: "Store pengguna diubah", description: updated.name });
          }}
          onClose={() => setReassignStoreTarget(null)}
        />
      )}
    </div>
  );
}

function UserFormModal({
  mode,
  initial,
  isSuperAdmin,
  isStoreManager,
  assignableRoles,
  merchants,
  stores,
  onSubmit,
  onClose,
}: {
  mode: "create" | "edit";
  initial?: UserSummary;
  isSuperAdmin: boolean;
  isStoreManager: boolean;
  assignableRoles: Role[];
  merchants: Merchant[];
  stores: Store[];
  onSubmit: (input: UserFormInput | UserUpdateInput) => Promise<void>;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<Role>(initial?.role ?? assignableRoles[0]);
  const [active, setActive] = useState(initial?.active ?? true);
  const [merchantId, setMerchantId] = useState(initial?.merchantId ?? "");
  const [storeId, setStoreId] = useState(initial?.storeId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsStorePicker = mode === "create" && !isStoreManager && STORE_LOCKED_ROLES.includes(role);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        await onSubmit({
          username, password, name, role,
          merchantId: isSuperAdmin ? merchantId : undefined,
          storeId: isStoreManager ? undefined : storeId || undefined,
        });
      } else {
        await onSubmit({ name, role, active });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengguna.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 font-display text-lg font-semibold">{mode === "create" ? "Pengguna baru" : "Edit pengguna"}</h2>
        {error && <p className="mb-3 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "create" && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Username</span>
                <input required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="kasir02" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Password awal</span>
                <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Minimal 6 karakter" />
              </label>
            </>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Nama</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Nama lengkap" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm">
              {assignableRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </label>
          {mode === "create" && isSuperAdmin && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Merchant</span>
              <select required value={merchantId} onChange={(e) => setMerchantId(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm">
                <option value="">Pilih merchant…</option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
          {needsStorePicker && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Store</span>
              <select required value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm">
                <option value="">Pilih store…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}
          {mode === "edit" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Akun aktif
            </label>
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

function ResetPasswordModal({ user, onSubmit, onClose }: { user: UserSummary; onSubmit: (newPassword: string) => Promise<void>; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal reset password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-1 font-display text-lg font-semibold">Reset password</h2>
        <p className="mb-4 text-sm text-ink-soft">Untuk pengguna: <strong>{user.name}</strong></p>
        {error && <p className="mb-3 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Password baru (min. 6 karakter)" autoFocus />
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-md bg-register py-2.5 text-sm font-medium text-paper disabled:opacity-50">
              {saving ? "Menyimpan…" : "Reset"}
            </button>
            <button type="button" onClick={onClose} className="rounded-md border border-ink/15 px-4 py-2.5 text-sm font-medium">Batal</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReassignMerchantModal({
  user,
  merchants,
  onSubmit,
  onClose,
}: {
  user: UserSummary;
  merchants: Merchant[];
  onSubmit: (merchantId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [merchantId, setMerchantId] = useState(user.merchantId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(merchantId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memindahkan merchant.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-1 font-display text-lg font-semibold">Pindah merchant</h2>
        <p className="mb-4 text-sm text-ink-soft">Untuk pengguna: <strong>{user.name}</strong> (saat ini: {user.merchantName})</p>
        {error && <p className="mb-3 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm">
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-md bg-register py-2.5 text-sm font-medium text-paper disabled:opacity-50">
              {saving ? "Menyimpan…" : "Pindahkan"}
            </button>
            <button type="button" onClick={onClose} className="rounded-md border border-ink/15 px-4 py-2.5 text-sm font-medium">Batal</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReassignStoreModal({
  user,
  stores,
  onSubmit,
  onClose,
}: {
  user: UserSummary;
  stores: Store[];
  onSubmit: (storeId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [storeId, setStoreId] = useState(user.storeId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(storeId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memindahkan store.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-1 font-display text-lg font-semibold">Pindah store</h2>
        <p className="mb-4 text-sm text-ink-soft">Untuk pengguna: <strong>{user.name}</strong> (saat ini: {user.storeName || "-"})</p>
        {error && <p className="mb-3 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <select required value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm">
            <option value="">Pilih store…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-md bg-register py-2.5 text-sm font-medium text-paper disabled:opacity-50">
              {saving ? "Menyimpan…" : "Pindahkan"}
            </button>
            <button type="button" onClick={onClose} className="rounded-md border border-ink/15 px-4 py-2.5 text-sm font-medium">Batal</button>
          </div>
        </form>
      </div>
    </div>
  );
}
