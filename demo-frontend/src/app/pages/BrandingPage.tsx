// src/app/pages/BrandingPage.tsx
"use client";

import { useEffect, useState } from "react";
import { UploadCloud, Loader2, Copy, Check } from "lucide-react";
import { Logo } from "../components/layout/Logo";
import { ReceiptPreview } from "../components/ui/ReceiptPreview";
import { Btn } from "../components/ui/Btn";
import { merchantApi } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB, sama dengan batas foto produk

export function BrandingPage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState(user?.merchantName ?? "");
  const [address, setAddress] = useState(user?.merchantAddress ?? "");
  const [logoPreview, setLogoPreview] = useState<string | null>(user?.merchantLogoUrl || null);
  const [logoChanged, setLogoChanged] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const loginUrl = user?.merchantSlug && typeof window !== "undefined" ? `${window.location.origin}/t/${user.merchantSlug}` : null;

  async function handleCopyLoginLink() {
    if (!loginUrl) return;
    try {
      await navigator.clipboard.writeText(loginUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      showToast({ type: "error", message: "Gagal menyalin link" });
    }
  }

  // Kalau AuthContext belum selesai load user saat komponen pertama kali
  // render (mis. refresh halaman langsung di /branding), sinkronkan begitu
  // datanya sudah ada.
  useEffect(() => {
    if (user) {
      setName(user.merchantName);
      setAddress(user.merchantAddress);
      setLogoPreview((prev) => (logoChanged ? prev : user.merchantLogoUrl || null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setError("Ukuran logo maksimal 2MB.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(reader.result as string);
      setLogoChanged(true);
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSavingInfo(true);
    setError(null);
    try {
      await merchantApi.updateMine({ name, address });
      await refreshUser(); // Sidebar/Topbar/struk langsung ikut update
      showToast({ type: "success", message: "Info toko disimpan" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan info toko.");
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleSaveLogo() {
    if (!logoChanged || !logoPreview) return;
    setSavingLogo(true);
    setError(null);
    try {
      await merchantApi.updateMyLogo(logoPreview);
      await refreshUser();
      setLogoChanged(false);
      showToast({ type: "success", message: "Logo disimpan" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan logo.");
    } finally {
      setSavingLogo(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="font-display text-xl font-semibold">Branding</h1>
      <p className="mb-4 text-sm text-ink-soft">Nama, alamat, dan logo ini akan tampil di seluruh antarmuka dan di struk cetak.</p>

      {loginUrl && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper-dim px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Link login bermerek toko Anda</p>
            <p className="font-mono text-sm text-ink">{loginUrl}</p>
            <p className="mt-0.5 text-xs text-ink-soft">Nama & logo toko akan tampil di halaman login kalau staf masuk lewat link ini, bukan link login umum.</p>
          </div>
          <button type="button" onClick={handleCopyLoginLink} className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink/15 px-3 py-1.5 text-xs font-medium hover:bg-white">
            {linkCopied ? <><Check size={13} className="text-teal" /> Tersalin</> : <><Copy size={13} /> Salin link</>}
          </button>
        </div>
      )}

      {error && <p className="mb-4 rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <form onSubmit={handleSaveInfo} className="rounded-lg border border-ink/10 bg-white p-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft">Info toko</p>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-ink-soft">Nama toko</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Toko Kopi Senja" />
            </label>
            <label className="mb-4 block">
              <span className="mb-1 block text-xs text-ink-soft">Alamat</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm" placeholder="Jl. Contoh No. 1, Jakarta" />
            </label>
            <Btn type="submit" disabled={savingInfo} ch={savingInfo ? <><Loader2 size={14} className="animate-spin" /> Menyimpan…</> : "Simpan Info Toko"} />
          </form>

          <div className="rounded-lg border border-ink/10 bg-white p-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft">Upload logo</p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-ink/15 py-10 hover:border-brass">
              <UploadCloud size={24} className="text-ink-soft" />
              <span className="text-sm text-ink-soft">PNG transparan, minimal 512x512px, maks. 2MB</span>
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFile} />
            </label>
            <div className="mt-6">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">Pratinjau</p>
              <div className="flex items-center gap-6 rounded-lg bg-register p-4">
                <Logo variant="light" size={28} src={logoPreview} />
              </div>
            </div>
            <Btn cls="mt-4" disabled={!logoChanged || savingLogo} onClick={handleSaveLogo} ch={savingLogo ? <><Loader2 size={14} className="animate-spin" /> Menyimpan…</> : "Simpan Logo"} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">Pratinjau di struk</p>
          <ReceiptPreview
            merchantName={name || "Nama Toko Anda"}
            storeName=""
            storeAddress={address || "Alamat toko"}
            logoSrc={logoPreview}
            invoiceNo="INV-000123"
            cashierName="Kasir 01"
            items={[{ name: "Kopi Susu Gula Aren", qty: 2, price: 18000 }]}
            total={36000}
            method="QRIS"
            paidAt={new Date().toLocaleString("id-ID")}
          />
        </div>
      </div>
    </div>
  );
}
