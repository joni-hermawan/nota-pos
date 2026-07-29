// src/app/constants.ts
import type { Role, PageId } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  kasir: "Kasir",
  ppic: "PPIC",
  finance: "Finance",
  admin: "Administrator",
  superadmin: "Superadmin",
  store_manager: "Store Manager",
};

// Halaman mana saja yang boleh diakses tiap role.
// - admin (owner): semua store dalam merchant-nya, akses penuh
// - store_manager: TERKUNCI ke 1 store, tapi dapat menu operasional penuh
//   (kasir, produk & stok, dashboard, reporting) + kelola user (kasir/ppic)
//   di store-nya sendiri
// - superadmin: lintas merchant, TIDAK ada menu operasional (bukan staff
//   1 toko tertentu) - hanya Merchant, Pengguna, dan Dashboard Platform
export function effectivePages(role: Role): PageId[] {
  const base: Record<Role, PageId[]> = {
    admin: ["dashboard", "pos", "pembayaran", "riwayat", "produk-stok", "reporting", "branding", "edc-setup", "users", "stores"],
    store_manager: ["dashboard", "pos", "pembayaran", "riwayat", "produk-stok", "reporting", "edc-setup", "users"],
    kasir: ["pos", "pembayaran", "riwayat", "edc-setup"],
    ppic: ["produk-stok"],
    finance: ["reporting", "riwayat"],
    superadmin: ["superadmin-dashboard", "merchants", "users"],
  };
  return base[role];
}

export const PAGE_META: Record<PageId, { title: string; subtitle?: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Ringkasan performa toko" },
  pos: { title: "Kasir", subtitle: "Buat pesanan/order" },
  pembayaran: { title: "Pembayaran", subtitle: "Pilih order untuk diproses pembayarannya" },
  riwayat: { title: "Riwayat Transaksi", subtitle: "Cari & cetak ulang struk transaksi yang sudah selesai" },
  "produk-stok": { title: "Produk & Stok", subtitle: "Kelola katalog produk dan mutasi stok gudang" },
  reporting: { title: "Reporting & Rekonsiliasi", subtitle: "Catatan sistem per metode pembayaran" },
  branding: { title: "Branding", subtitle: "Logo untuk UI dan struk cetak" },
  "edc-setup": { title: "Pengaturan EDC", subtitle: "Atur koneksi mesin EDC di komputer ini" },
  users: { title: "Pengguna", subtitle: "Kelola akun staff, role, dan akses" },
  merchants: { title: "Merchant", subtitle: "Kelola semua toko yang memakai aplikasi ini" },
  stores: { title: "Stores", subtitle: "Kelola cabang/outlet dalam merchant Anda" },
  "superadmin-dashboard": { title: "Dashboard Platform", subtitle: "Monitor seluruh merchant, store, dan transaksi" },
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  qris: "QRIS",
  edc: "EDC",
};
