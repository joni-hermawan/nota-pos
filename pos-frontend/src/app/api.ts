// src/app/api.ts
// Semua panggilan ke backend dipusatkan di sini. Auth memakai cookie
// httpOnly (credentials: "include"), BUKAN Authorization header - browser
// otomatis menyertakan cookie di setiap request, jadi tidak ada token yang
// perlu disimpan/dibaca manual di sisi frontend sama sekali.
import { logEvent } from "./utils/logger";
import type {
  AuthProfile,
  Product,
  ProductFormInput,
  PaymentMethod,
  PayResult,
  DashboardData,
  ReconciliationRow,
  Merchant,
  MerchantFormInput,
  MerchantBranding,
  UserSummary,
  UserFormInput,
  UserUpdateInput,
  Store,
  StoreFormInput,
  PlatformDashboard,
  PendingTransaction,
  TransactionHistoryRow,
  TransactionDetail,
} from "./types";

// Path RELATIF, bukan URL absolut - diteruskan Next.js (next.config.js
// rewrites) ke backend Go di sisi SERVER. Browser hanya pernah bicara ke
// origin-nya sendiri (mis. http://localhost:3000), jadi ini SELALU
// same-origin dan tidak akan pernah kena masalah CORS, apa pun alamat/port
// backend yang sesungguhnya.
export const BASE_URL = "/backend";

export const SESSION_EXPIRED_EVENT = "nota-pos:session-expired";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  logEvent("info", `→ ${opts.method ?? "GET"} ${path}`, { requestBody: opts.body });

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      credentials: "include", // send the httpOnly session cookie
      headers: { "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    logEvent("error", `network error calling ${path}`, { error: String(err) });
    throw new NetworkError(`Tidak bisa menghubungi server (${url}). Pastikan backend berjalan.`);
  }

  if (res.status === 401) {
    logEvent("warn", `401 unauthorized on ${path} - dispatching session-expired`);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  }

  // Read the raw text once so we can log the exact response body
  // regardless of whether it's a success or an error response - res.json()
  // can only be called once, so we parse from this same string below.
  const rawText = await res.text().catch(() => "");
  let parsedBody: unknown = rawText;
  try {
    parsedBody = rawText ? JSON.parse(rawText) : null;
  } catch {
    // response wasn't JSON - keep the raw text as-is for the log/error message
  }

  if (!res.ok) {
    const message =
      parsedBody && typeof parsedBody === "object" && "error" in (parsedBody as Record<string, unknown>)
        ? String((parsedBody as Record<string, unknown>).error)
        : rawText;
    logEvent("error", `← ${res.status} ${path}`, { responseBody: parsedBody });
    throw new ApiError(res.status, message || res.statusText);
  }

  logEvent("info", `← ${res.status} ${path}`, { responseBody: parsedBody });
  return parsedBody as T;
}

// ---------------------------------------------------------------------------

export const authApi = {
  login: (username: string, password: string) =>
    request<AuthProfile>("/auth/login", { method: "POST", body: { username, password } }),
  logout: () => request<{ status: string }>("/auth/logout", { method: "POST" }),
  me: () => request<AuthProfile>("/auth/me"),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ status: string }>("/auth/password", { method: "PATCH", body: { oldPassword, newPassword } }),
};

export const productApi = {
  // storeId: wajib untuk admin (pilih store mana yang mau dilihat stoknya);
  // diabaikan untuk kasir/ppic/store_manager (backend pakai store mereka sendiri).
  list: (storeId?: string) => request<Product[]>(`/products${storeId ? `?storeId=${storeId}` : ""}`),
  create: (input: ProductFormInput) => request<Product>("/products", { method: "POST", body: input }),
  update: (id: string, input: ProductFormInput) => request<Product>(`/products/${id}`, { method: "PUT", body: input }),
  adjustStock: (id: string, delta: number, reason = "adjustment", storeId?: string) =>
    request<{ status: string }>(`/products/${id}/stock`, { method: "PATCH", body: { delta, reason, storeId } }),
  updateImage: (id: string, imageUrl: string) =>
    request<{ status: string }>(`/products/${id}/image`, { method: "PATCH", body: { imageUrl } }),
};

export const transactionApi = {
  create: (items: { productId: string; qty: number }[]) =>
    request<{ id: string; total: number; invoiceNo: string }>("/transactions", { method: "POST", body: { items } }),
  // Semua order yang sudah dibuat (stok sudah dipotong) tapi belum dibayar
  // di store ini - inilah yang memisahkan "Order" (Kasir) dari "Pembayaran".
  listPending: () => request<PendingTransaction[]>("/transactions/pending"),
  // Riwayat transaksi yang sudah selesai (paid/voided) - untuk cari & cetak
  // ulang struk. storeId opsional, sama seperti reportApi.
  history: (storeId?: string, days = 30) =>
    request<TransactionHistoryRow[]>(`/transactions/history?days=${days}${storeId ? `&storeId=${storeId}` : ""}`),
  detail: (transactionId: string) => request<TransactionDetail>(`/transactions/${transactionId}/detail`),
  pay: (transactionId: string, method: PaymentMethod, amountReceived?: number) =>
    request<PayResult>(`/transactions/${transactionId}/pay`, { method: "POST", body: { method, amountReceived } }),
  // Cancels a still-pending transaction and restores the reserved stock -
  // called when the cashier backs out of the payment screen to the cart.
  void: (transactionId: string) => request<{ status: string }>(`/transactions/${transactionId}/void`, { method: "POST" }),
  // Manual fallback for when Midtrans's webhook can't reach a local/
  // unreachable backend - actively asks the gateway for the current status.
  checkQrisStatus: (transactionId: string) =>
    request<{ status: string; gatewayStatus: string }>(`/transactions/${transactionId}/qris-status`),
  // SSE endpoint - opened directly with `new EventSource(...)` by the
  // caller (native EventSource can't go through this generic request()
  // helper), see PaymentMethodSelector.tsx.
  eventsUrl: (transactionId: string) => `${BASE_URL}/transactions/${transactionId}/events`,
};

// publicApi: endpoints callable BEFORE login (no session cookie needed on
// the backend side - see /api/public/ carve-out in middleware/auth.go).
// Currently just the branded-login-screen lookup.
export const publicApi = {
  merchantBranding: (slug: string) => request<MerchantBranding>(`/public/merchants/branding/${encodeURIComponent(slug)}`),
};

export const reportApi = {
  dashboard: (storeId?: string) => request<DashboardData>(`/reports/dashboard${storeId ? `?storeId=${storeId}` : ""}`),
  reconciliation: (storeId?: string) =>
    request<ReconciliationRow[]>(`/reports/reconciliation${storeId ? `?storeId=${storeId}` : ""}`),
};

export const merchantApi = {
  list: () => request<Merchant[]>("/merchants"),
  create: (input: MerchantFormInput) => request<Merchant>("/merchants", { method: "POST", body: input }),
  update: (id: string, input: MerchantFormInput) => request<Merchant>(`/merchants/${id}`, { method: "PUT", body: input }),
  setActive: (id: string, active: boolean) =>
    request<{ status: string }>(`/merchants/${id}/active`, { method: "PATCH", body: { active } }),
  // Self-service - admin (owner) manages their OWN merchant's branding,
  // no superadmin needed. This is what makes "1 aplikasi, banyak merchant"
  // actually work: each merchant's name/logo shows correctly on their own
  // receipts and UI, not a hardcoded demo name.
  getMine: () => request<Merchant>("/merchants/me"),
  updateMine: (input: MerchantFormInput) => request<Merchant>("/merchants/me", { method: "PUT", body: input }),
  updateMyLogo: (logoUrl: string) => request<Merchant>("/merchants/me/logo", { method: "PATCH", body: { logoUrl } }),
};

export const userApi = {
  list: () => request<UserSummary[]>("/users"),
  create: (input: UserFormInput) => request<UserSummary>("/users", { method: "POST", body: input }),
  update: (id: string, input: UserUpdateInput) => request<UserSummary>(`/users/${id}`, { method: "PUT", body: input }),
  resetPassword: (id: string, newPassword: string) =>
    request<{ status: string }>(`/users/${id}/password`, { method: "PATCH", body: { newPassword } }),
  // superadmin-only - moves a user to a different merchant
  reassignMerchant: (id: string, merchantId: string) =>
    request<UserSummary>(`/users/${id}/merchant`, { method: "PATCH", body: { merchantId } }),
  // admin-only - moves a user to a different store within the SAME merchant
  reassignStore: (id: string, storeId: string) =>
    request<UserSummary>(`/users/${id}/store`, { method: "PATCH", body: { storeId } }),
};

export const storeApi = {
  list: () => request<Store[]>("/stores"),
  create: (input: StoreFormInput) => request<Store>("/stores", { method: "POST", body: input }),
  update: (id: string, input: StoreFormInput) => request<Store>(`/stores/${id}`, { method: "PUT", body: input }),
  setActive: (id: string, active: boolean) =>
    request<{ status: string }>(`/stores/${id}/active`, { method: "PATCH", body: { active } }),
};

export const platformApi = {
  dashboard: () => request<PlatformDashboard>("/superadmin/dashboard"),
};
