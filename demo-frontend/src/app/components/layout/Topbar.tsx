// src/app/components/layout/Topbar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, KeyRound } from "lucide-react";
import type { AuthProfile } from "../../types";
import { ROLE_LABEL } from "../../constants";
import { authApi, ApiError } from "../../api";
import { useToast } from "../../context/ToastContext";

interface TopbarProps {
  title: string;
  subtitle?: string;
  user: AuthProfile;
  onLogout: () => void;
}

export function Topbar({ title, subtitle, user }: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink/10 bg-white px-6">
      <div>
        <h1 className="font-display text-sm font-semibold text-ink">{title}</h1>
        {subtitle && <p className="text-xs text-ink-soft">{subtitle}</p>}
      </div>

      <div className="relative" ref={menuRef}>
        <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-all hover:bg-paper-dim">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-register">
            <span className="text-xs font-bold text-paper">{user.name[0]}</span>
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-semibold text-ink">{user.name}</p>
            <p className="font-mono text-[10px] text-brass">{ROLE_LABEL[user.role]}</p>
          </div>
          <ChevronDown size={14} className="hidden text-ink-soft sm:block" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-lg border border-ink/10 bg-white py-1 shadow-lg">
            <div className="px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-ink-soft">Toko</p>
              <p className="truncate text-xs font-semibold text-ink" title={user.merchantName}>{user.merchantName}</p>
            </div>
            <div className="my-1 border-t border-ink/10" />
            {/* Logout hidup di Sidebar (pojok kiri bawah) - di sini sengaja
                TIDAK ada tombol Keluar lagi supaya tidak duplikat. */}
            <button
              onClick={() => {
                setMenuOpen(false);
                setPasswordModalOpen(true);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-ink-soft transition-all hover:bg-paper-dim hover:text-ink"
            >
              <KeyRound size={14} /> Ganti Password
            </button>
          </div>
        )}
      </div>

      {passwordModalOpen && <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak cocok.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      showToast({ type: "success", message: "Password berhasil diganti" });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengganti password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 font-display text-lg font-semibold">Ganti Password</h2>
        {error && <p className="mb-3 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Password saat ini</span>
            <input required type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Password baru</span>
            <input required type="password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Minimal 6 karakter" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Konfirmasi password baru</span>
            <input required type="password" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" />
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
