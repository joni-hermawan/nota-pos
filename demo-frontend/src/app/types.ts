// src/app/types.ts
// Tipe data yang dipakai lintas komponen/halaman - dipusatkan di sini
// (bukan didefinisikan ulang di tiap file) supaya kalau bentuk data dari
// backend berubah, cukup diubah satu tempat.

export type Role = "kasir" | "ppic" | "finance" | "admin" | "superadmin" | "store_manager";

// Setiap "halaman" dalam SPA ini adalah nilai PageId, BUKAN route Next.js -
// AppLayout merender komponen yang sesuai berdasarkan state `page`, mirip
// pola project referensi.
export type PageId =
  | "dashboard"
  | "pos"
  | "pembayaran"
  | "riwayat"
  | "produk-stok"
  | "reporting"
  | "branding"
  | "edc-setup"
  | "users"
  | "merchants"
  | "stores"
  | "superadmin-dashboard";

export interface AuthProfile {
  id: string;
  username: string;
  name: string;
  role: Role;
  merchantId: string;
  merchantName: string;
  merchantAddress: string;
  merchantLogoUrl: string;
  merchantSlug: string;
  // Kosong ("") untuk role yang lingkupnya bukan 1 store (admin, finance,
  // superadmin) - terisi untuk kasir/ppic/store_manager.
  storeId: string;
  storeName: string;
  storeAddress: string;
}

export interface Merchant {
  id: string;
  name: string;
  address: string;
  logoUrl: string | null;
  active: boolean;
  slug: string;
}

export interface MerchantFormInput {
  name: string;
  address: string;
}

// Public (pre-login) subset of Merchant, returned by
// publicApi.merchantBranding - deliberately just name + logo, see
// MerchantBranding on the Go side.
export interface MerchantBranding {
  name: string;
  logoUrl: string | null;
}

export interface Store {
  id: string;
  merchantId: string;
  name: string;
  address: string;
  active: boolean;
}

export interface StoreFormInput {
  name: string;
  address: string;
}

export interface UserSummary {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  merchantId: string;
  merchantName: string;
  storeId: string;
  storeName: string;
}

export interface UserFormInput {
  username: string;
  password: string;
  name: string;
  role: Role;
  merchantId?: string; // only used/required when the caller is superadmin
  storeId?: string; // required for kasir/ppic/store_manager; ignored for admin/finance
}

export interface UserUpdateInput {
  name: string;
  role: Role;
  active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  minStock: number;
  imageUrl: string | null;
}

export interface ProductFormInput {
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  minStock: number;
  storeId?: string; // only used/required when the caller isn't locked to one store (admin)
}

export type PaymentMethod = "cash" | "qris" | "edc";
export type PaymentStatus = "pending" | "paid" | "failed";

export interface PayResult {
  paymentId: string;
  status: PaymentStatus;
  qrImageUrl?: string;
  qrExpiresAt?: string; // ISO 8601 - dipakai buat hitung mundur di layar QRIS
}

// Satu order yang sudah dibuat (stok sudah dipotong) tapi belum dibayar -
// muncul di halaman "Pembayaran" untuk dipilih.
export interface PendingTransaction {
  id: string;
  invoiceNo: string;
  total: number;
  itemCount: number;
  cashierName: string;
  createdAt: string;
  minutesOpen: number;
}

export interface DailySales {
  date: string;
  transactionCount: number;
  revenue: number;
}

export interface PaymentMethodShare {
  method: string;
  paymentCount: number;
  totalAmount: number;
}

export interface ProductPerformance {
  productId: string;
  name: string;
  qtySold: number;
  revenue: number;
}

export interface DashboardData {
  salesTrend: DailySales[];
  paymentBreakdown: PaymentMethodShare[];
  topProducts: ProductPerformance[];
  leastProducts: ProductPerformance[];
  todayTransactionCount: number;
  todayRevenue: number;
}

export interface ReconciliationRow {
  date: string;
  method: string;
  systemTotal: number;
  paymentCount: number;
}

// --- Riwayat Transaksi ---

export interface TransactionHistoryRow {
  id: string;
  invoiceNo: string;
  total: number;
  status: "paid" | "voided";
  method: string; // "" untuk transaksi voided (tidak pernah ada pembayaran sukses)
  cashierName: string;
  createdAt: string;
  itemCount: number;
}

export interface TransactionDetailItem {
  name: string;
  qty: number;
  unitPrice: number;
}

export interface TransactionDetail {
  id: string;
  invoiceNo: string;
  total: number;
  status: string;
  createdAt: string;
  cashierName: string;
  storeName: string;
  storeAddress: string;
  method: string;
  amountReceived: number | null;
  items: TransactionDetailItem[];
}

// --- Superadmin platform dashboard ---

export interface MerchantTransactionHealth {
  merchantId: string;
  merchantName: string;
  status: "pending" | "paid" | "voided";
  trxCount: number;
  totalAmount: number;
  lastTransactionAt: string;
}

export interface FailedTransactionRow {
  transactionId: string;
  invoiceNo: string;
  merchantName: string;
  method: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface StuckTransactionRow {
  transactionId: string;
  invoiceNo: string;
  merchantName: string;
  amount: number;
  createdAt: string;
  minutesStuck: number;
}

export interface PlatformDashboard {
  merchantCount: number;
  activeMerchantCount: number;
  storeCount: number;
  activeStoreCount: number;
  todayTransactionCount: number;
  todayRevenue: number;
  todayFailedCount: number;
  merchantHealth: MerchantTransactionHealth[];
  recentFailed: FailedTransactionRow[];
  stuckPending: StuckTransactionRow[];
}
