// src/app/api.ts
//
// ============================================================================
// DEMO MODE — versi mock dari api.ts asli.
// Tidak ada panggilan jaringan sama sekali; semua fungsi di bawah membaca/
// menulis ke data dummy in-memory (reset setiap refresh browser) supaya
// prototype ini bisa di-hosting sebagai situs statis tanpa backend Go/SQL
// Server/mesin EDC fisik. Signature tiap fungsi SENGAJA dibuat identik
// dengan api.ts asli, sehingga seluruh halaman & komponen di atasnya bisa
// dipakai tanpa perubahan apa pun.
// ============================================================================

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
  Role,
} from "./types";

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

// Simulasi latensi jaringan supaya loading state terasa nyata, bukan instan.
function delay<T>(value: T, ms = 380): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

let uidCounter = 1000;
function uid(prefix: string) {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

// ---------------------------------------------------------------------------
// DATA DUMMY
// ---------------------------------------------------------------------------

const MERCHANT: Merchant = {
  id: "merchant-demo",
  name: "Kopi & Roti Nusantara",
  address: "Jl. Sudirman No. 88, Jakarta Selatan",
  logoUrl: null,
  active: true,
  slug: "demo",
};

let stores: Store[] = [
  { id: "store-1", merchantId: "merchant-demo", name: "Toko Pusat - Sudirman", address: "Jl. Sudirman No. 88, Jakarta Selatan", active: true },
  { id: "store-2", merchantId: "merchant-demo", name: "Cabang Bandung", address: "Jl. Braga No. 21, Bandung", active: true },
];

interface DemoUser extends UserSummary {
  password: string;
}

let users: DemoUser[] = [
  { id: "user-admin", username: "admin01", password: "demo123", name: "Rangga Saputra", role: "admin", active: true, merchantId: MERCHANT.id, merchantName: MERCHANT.name, storeId: "", storeName: "" },
  { id: "user-kasir", username: "kasir01", password: "demo123", name: "Dewi Anjani", role: "kasir", active: true, merchantId: MERCHANT.id, merchantName: MERCHANT.name, storeId: "store-1", storeName: stores[0].name },
  { id: "user-ppic", username: "ppic01", password: "demo123", name: "Fajar Nugroho", role: "ppic", active: true, merchantId: MERCHANT.id, merchantName: MERCHANT.name, storeId: "store-1", storeName: stores[0].name },
  { id: "user-finance", username: "finance01", password: "demo123", name: "Melati Putri", role: "finance", active: true, merchantId: MERCHANT.id, merchantName: MERCHANT.name, storeId: "", storeName: "" },
];

let products: Product[] = [
  { id: "prod-1", sku: "KOP-001", name: "Kopi Susu Gula Aren", category: "Minuman", price: 22000, stock: 48, minStock: 10, imageUrl: null },
  { id: "prod-2", sku: "KOP-002", name: "Americano", category: "Minuman", price: 18000, stock: 35, minStock: 10, imageUrl: null },
  { id: "prod-3", sku: "KOP-003", name: "Matcha Latte", category: "Minuman", price: 25000, stock: 6, minStock: 10, imageUrl: null },
  { id: "prod-4", sku: "ROT-001", name: "Croissant Butter", category: "Roti", price: 19000, stock: 22, minStock: 8, imageUrl: null },
  { id: "prod-5", sku: "ROT-002", name: "Roti Sourdough", category: "Roti", price: 32000, stock: 14, minStock: 5, imageUrl: null },
  { id: "prod-6", sku: "ROT-003", name: "Donat Cokelat", category: "Roti", price: 12000, stock: 40, minStock: 15, imageUrl: null },
  { id: "prod-7", sku: "SNK-001", name: "Kentang Goreng", category: "Snack", price: 21000, stock: 3, minStock: 10, imageUrl: null },
  { id: "prod-8", sku: "SNK-002", name: "Nugget Ayam", category: "Snack", price: 24000, stock: 18, minStock: 8, imageUrl: null },
  { id: "prod-9", sku: "MKN-001", name: "Nasi Goreng Spesial", category: "Makanan", price: 35000, stock: 25, minStock: 10, imageUrl: null },
  { id: "prod-10", sku: "MKN-002", name: "Mie Ayam Bakso", category: "Makanan", price: 28000, stock: 20, minStock: 10, imageUrl: null },
  { id: "prod-11", sku: "KOP-004", name: "Es Teh Manis", category: "Minuman", price: 10000, stock: 60, minStock: 15, imageUrl: null },
  { id: "prod-12", sku: "ROT-004", name: "Cheese Cake Slice", category: "Roti", price: 27000, stock: 9, minStock: 6, imageUrl: null },
];

interface DemoTransaction {
  id: string;
  invoiceNo: string;
  status: "pending" | "paid" | "voided";
  method: PaymentMethod | "";
  amountReceived: number | null;
  total: number;
  itemCount: number;
  cashierName: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  createdAt: string;
  items: { name: string; qty: number; unitPrice: number }[];
}

function pastDate(daysAgo: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

let transactions: DemoTransaction[] = [
  { id: "trx-p1", invoiceNo: "INV-20260730-0091", status: "pending", method: "", amountReceived: null, total: 47000, itemCount: 2, cashierName: "Dewi Anjani", storeId: "store-1", storeName: stores[0].name, storeAddress: stores[0].address, createdAt: pastDate(0, 9, 40), items: [{ name: "Kopi Susu Gula Aren", qty: 1, unitPrice: 22000 }, { name: "Croissant Butter", qty: 1, unitPrice: 19000 }] },
  { id: "trx-p2", invoiceNo: "INV-20260730-0092", status: "pending", method: "", amountReceived: null, total: 35000, itemCount: 1, cashierName: "Dewi Anjani", storeId: "store-1", storeName: stores[0].name, storeAddress: stores[0].address, createdAt: pastDate(0, 9, 55), items: [{ name: "Nasi Goreng Spesial", qty: 1, unitPrice: 35000 }] },
];

const METHODS: PaymentMethod[] = ["cash", "qris", "edc"];
for (let i = 0; i < 34; i++) {
  const daysAgo = Math.floor(i / 5);
  const paid = i % 9 !== 0;
  const items = Array.from({ length: 1 + (i % 3) }).map(() => {
    const p = products[(i * 3 + Math.floor(i / 2)) % products.length];
    return { name: p.name, qty: 1 + (i % 2), unitPrice: p.price };
  });
  const total = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  transactions.push({
    id: uid("trx"),
    invoiceNo: `INV-${pastDate(daysAgo).slice(0, 10).replace(/-/g, "")}-${(1000 + i).toString().padStart(4, "0")}`,
    status: paid ? "paid" : "voided",
    method: paid ? METHODS[i % METHODS.length] : "",
    amountReceived: paid && METHODS[i % METHODS.length] === "cash" ? total + 5000 : null,
    total,
    itemCount: items.reduce((s, it) => s + it.qty, 0),
    cashierName: i % 2 === 0 ? "Dewi Anjani" : "Rangga Saputra",
    storeId: i % 3 === 0 ? "store-2" : "store-1",
    storeName: i % 3 === 0 ? stores[1].name : stores[0].name,
    storeAddress: i % 3 === 0 ? stores[1].address : stores[0].address,
    createdAt: pastDate(daysAgo, 9 + (i % 8), (i * 7) % 60),
    items,
  });
}

// ---------------------------------------------------------------------------
// SESSION (mock auth, disimpan di module state)
// ---------------------------------------------------------------------------

let currentUser: DemoUser | null = null;

function toAuthProfile(u: DemoUser): AuthProfile {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    merchantId: MERCHANT.id,
    merchantName: MERCHANT.name,
    merchantAddress: MERCHANT.address,
    merchantLogoUrl: MERCHANT.logoUrl ?? "",
    merchantSlug: MERCHANT.slug,
    storeId: u.storeId,
    storeName: u.storeName,
    storeAddress: u.storeId ? stores.find((s) => s.id === u.storeId)?.address ?? "" : "",
  };
}

export const authApi = {
  login: async (username: string, password: string) => {
    const u = users.find((x) => x.username === username && x.active);
    await delay(null, 500);
    if (!u || u.password !== password) {
      throw new ApiError(401, "Username atau password salah.");
    }
    currentUser = u;
    return toAuthProfile(u);
  },
  logout: async () => {
    currentUser = null;
    return delay({ status: "ok" }, 150);
  },
  me: async () => {
    await delay(null, 150);
    if (!currentUser) throw new ApiError(401, "Belum login.");
    return toAuthProfile(currentUser);
  },
  changePassword: async (_oldPassword: string, newPassword: string) => {
    if (currentUser) currentUser.password = newPassword;
    return delay({ status: "ok" });
  },
};

// ---------------------------------------------------------------------------

export const productApi = {
  list: (_storeId?: string) => delay(products.slice().sort((a, b) => a.name.localeCompare(b.name))),
  create: (input: ProductFormInput) => {
    const p: Product = { id: uid("prod"), sku: input.sku, name: input.name, category: input.category, price: input.price, stock: input.stock, minStock: input.minStock, imageUrl: null };
    products = [p, ...products];
    return delay(p);
  },
  update: (id: string, input: ProductFormInput) => {
    products = products.map((p) => (p.id === id ? { ...p, ...input, imageUrl: p.imageUrl } : p));
    return delay(products.find((p) => p.id === id)!);
  },
  adjustStock: (id: string, delta: number, _reason = "adjustment", _storeId?: string) => {
    products = products.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p));
    return delay({ status: "ok" });
  },
  updateImage: (id: string, imageUrl: string) => {
    products = products.map((p) => (p.id === id ? { ...p, imageUrl } : p));
    return delay({ status: "ok" });
  },
};

// SVG QR placeholder (data URI) - biar tampilan QRIS tidak kosong di demo.
const QR_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='#fff'/><g fill='#0B3D2E'>${Array.from(
      { length: 12 }
    )
      .map((_, i) =>
        Array.from({ length: 12 })
          .map((__, j) => (((i * 7 + j * 13) % 5 === 0) ? `<rect x='${i * 16}' y='${j * 16}' width='14' height='14'/>` : ""))
          .join("")
      )
      .join("")}</g></svg>`
  );

export const transactionApi = {
  create: (items: { productId: string; qty: number }[]) => {
    const detailedItems = items.map((it) => {
      const p = products.find((x) => x.id === it.productId)!;
      products = products.map((x) => (x.id === it.productId ? { ...x, stock: Math.max(0, x.stock - it.qty) } : x));
      return { name: p.name, qty: it.qty, unitPrice: p.price };
    });
    const total = detailedItems.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const storeId = currentUser?.storeId || "store-1";
    const trx: DemoTransaction = {
      id: uid("trx"),
      invoiceNo: `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${uidCounter}`,
      status: "pending",
      method: "",
      amountReceived: null,
      total,
      itemCount: detailedItems.reduce((s, it) => s + it.qty, 0),
      cashierName: currentUser?.name ?? "Kasir Demo",
      storeId,
      storeName: stores.find((s) => s.id === storeId)?.name ?? stores[0].name,
      storeAddress: stores.find((s) => s.id === storeId)?.address ?? stores[0].address,
      createdAt: new Date().toISOString(),
      items: detailedItems,
    };
    transactions = [trx, ...transactions];
    return delay({ id: trx.id, total: trx.total, invoiceNo: trx.invoiceNo }, 500);
  },
  listPending: () => {
    const list: PendingTransaction[] = transactions
      .filter((t) => t.status === "pending")
      .map((t) => ({
        id: t.id,
        invoiceNo: t.invoiceNo,
        total: t.total,
        itemCount: t.itemCount,
        cashierName: t.cashierName,
        createdAt: t.createdAt,
        minutesOpen: Math.max(1, Math.round((Date.now() - new Date(t.createdAt).getTime()) / 60000)),
      }));
    return delay(list);
  },
  history: (storeId?: string, days = 30) => {
    const cutoff = Date.now() - days * 86400000;
    const list: TransactionHistoryRow[] = transactions
      .filter((t) => t.status !== "pending" && new Date(t.createdAt).getTime() >= cutoff && (!storeId || t.storeId === storeId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((t) => ({ id: t.id, invoiceNo: t.invoiceNo, total: t.total, status: t.status as "paid" | "voided", method: t.method, cashierName: t.cashierName, createdAt: t.createdAt, itemCount: t.itemCount }));
    return delay(list);
  },
  detail: (transactionId: string) => {
    const t = transactions.find((x) => x.id === transactionId)!;
    const detail: TransactionDetail = {
      id: t.id, invoiceNo: t.invoiceNo, total: t.total, status: t.status, createdAt: t.createdAt,
      cashierName: t.cashierName, storeName: t.storeName, storeAddress: t.storeAddress,
      method: t.method, amountReceived: t.amountReceived, items: t.items,
    };
    return delay(detail);
  },
  pay: (transactionId: string, method: PaymentMethod, amountReceived?: number) => {
    transactions = transactions.map((t) => (t.id === transactionId ? { ...t, status: "paid", method, amountReceived: amountReceived ?? null } : t));
    const result: PayResult = { paymentId: uid("pay"), status: "paid", qrImageUrl: method === "qris" ? QR_PLACEHOLDER : undefined, qrExpiresAt: method === "qris" ? new Date(Date.now() + 15 * 60000).toISOString() : undefined };
    return delay(result, 400);
  },
  void: (transactionId: string) => {
    transactions = transactions.map((t) => (t.id === transactionId ? { ...t, status: "voided" } : t));
    return delay({ status: "ok" });
  },
  checkQrisStatus: (_transactionId: string) => delay({ status: "paid", gatewayStatus: "settlement" }),
  eventsUrl: (_transactionId: string) => "",
};

export const publicApi = {
  merchantBranding: (_slug: string) => delay<MerchantBranding>({ name: MERCHANT.name, logoUrl: MERCHANT.logoUrl }),
};

export const reportApi = {
  dashboard: (storeId?: string) => {
    const scoped = transactions.filter((t) => t.status === "paid" && (!storeId || t.storeId === storeId));
    const today = new Date().toDateString();
    const todayTrx = scoped.filter((t) => new Date(t.createdAt).toDateString() === today);

    const salesTrend = Array.from({ length: 7 }).map((_, i) => {
      const dayIdx = 6 - i;
      const dayTrx = scoped.filter((t) => Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000) === dayIdx);
      const d = new Date();
      d.setDate(d.getDate() - dayIdx);
      return { date: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }), transactionCount: dayTrx.length, revenue: dayTrx.reduce((s, t) => s + t.total, 0) };
    });

    const methodMap = new Map<string, { count: number; amount: number }>();
    scoped.forEach((t) => {
      const cur = methodMap.get(t.method) ?? { count: 0, amount: 0 };
      methodMap.set(t.method, { count: cur.count + 1, amount: cur.amount + t.total });
    });
    const paymentBreakdown = Array.from(methodMap.entries()).map(([method, v]) => ({ method, paymentCount: v.count, totalAmount: v.amount }));

    const productAgg = new Map<string, { qty: number; revenue: number }>();
    scoped.forEach((t) => t.items.forEach((it) => {
      const cur = productAgg.get(it.name) ?? { qty: 0, revenue: 0 };
      productAgg.set(it.name, { qty: cur.qty + it.qty, revenue: cur.revenue + it.qty * it.unitPrice });
    }));
    const sortedProducts = Array.from(productAgg.entries()).map(([name, v], idx) => ({ productId: `p${idx}`, name, qtySold: v.qty, revenue: v.revenue }));
    const topProducts = [...sortedProducts].sort((a, b) => b.qtySold - a.qtySold).slice(0, 5);
    const leastProducts = [...sortedProducts].sort((a, b) => a.qtySold - b.qtySold).slice(0, 5);

    const data: DashboardData = {
      salesTrend, paymentBreakdown, topProducts, leastProducts,
      todayTransactionCount: todayTrx.length,
      todayRevenue: todayTrx.reduce((s, t) => s + t.total, 0),
    };
    return delay(data);
  },
  reconciliation: (storeId?: string) => {
    const scoped = transactions.filter((t) => t.status === "paid" && (!storeId || t.storeId === storeId));
    const map = new Map<string, { date: string; method: string; total: number; count: number }>();
    scoped.forEach((t) => {
      const date = t.createdAt.slice(0, 10);
      const key = `${date}|${t.method}`;
      const cur = map.get(key) ?? { date, method: t.method, total: 0, count: 0 };
      cur.total += t.total;
      cur.count += 1;
      map.set(key, cur);
    });
    const rows: ReconciliationRow[] = Array.from(map.values())
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((r) => ({ date: r.date, method: r.method, systemTotal: r.total, paymentCount: r.count }));
    return delay(rows);
  },
};

export const merchantApi = {
  list: () => delay([MERCHANT]),
  create: (input: MerchantFormInput) => delay({ ...MERCHANT, ...input, id: uid("merchant") }),
  update: (_id: string, input: MerchantFormInput) => delay({ ...MERCHANT, ...input }),
  setActive: (_id: string, _active: boolean) => delay({ status: "ok" }),
  getMine: () => delay(MERCHANT),
  updateMine: (input: MerchantFormInput) => {
    Object.assign(MERCHANT, input);
    return delay(MERCHANT);
  },
  updateMyLogo: (logoUrl: string) => {
    MERCHANT.logoUrl = logoUrl;
    return delay(MERCHANT);
  },
};

export const userApi = {
  list: () => delay(users.map(({ password: _pw, ...u }) => u)),
  create: (input: UserFormInput) => {
    const store = stores.find((s) => s.id === input.storeId);
    const u: DemoUser = {
      id: uid("user"), username: input.username, password: input.password, name: input.name, role: input.role,
      active: true, merchantId: MERCHANT.id, merchantName: MERCHANT.name,
      storeId: input.storeId ?? "", storeName: store?.name ?? "",
    };
    users = [...users, u];
    const { password: _pw, ...rest } = u;
    return delay(rest);
  },
  update: (id: string, input: UserUpdateInput) => {
    users = users.map((u) => (u.id === id ? { ...u, name: input.name, role: input.role, active: input.active } : u));
    const { password: _pw, ...rest } = users.find((u) => u.id === id)!;
    return delay(rest);
  },
  resetPassword: (id: string, newPassword: string) => {
    users = users.map((u) => (u.id === id ? { ...u, password: newPassword } : u));
    return delay({ status: "ok" });
  },
  reassignMerchant: (id: string, _merchantId: string) => {
    const { password: _pw, ...rest } = users.find((u) => u.id === id)!;
    return delay(rest);
  },
  reassignStore: (id: string, storeId: string) => {
    const store = stores.find((s) => s.id === storeId);
    users = users.map((u) => (u.id === id ? { ...u, storeId, storeName: store?.name ?? "" } : u));
    const { password: _pw, ...rest } = users.find((u) => u.id === id)!;
    return delay(rest);
  },
};

export const storeApi = {
  list: () => delay(stores),
  create: (input: StoreFormInput) => {
    const s: Store = { id: uid("store"), merchantId: MERCHANT.id, name: input.name, address: input.address, active: true };
    stores = [...stores, s];
    return delay(s);
  },
  update: (id: string, input: StoreFormInput) => {
    stores = stores.map((s) => (s.id === id ? { ...s, ...input } : s));
    return delay(stores.find((s) => s.id === id)!);
  },
  setActive: (id: string, active: boolean) => {
    stores = stores.map((s) => (s.id === id ? { ...s, active } : s));
    return delay({ status: "ok" });
  },
};

export const platformApi = {
  dashboard: () =>
    delay<PlatformDashboard>({
      merchantCount: 1, activeMerchantCount: 1, storeCount: stores.length, activeStoreCount: stores.filter((s) => s.active).length,
      todayTransactionCount: 6, todayRevenue: 480000, todayFailedCount: 0,
      merchantHealth: [{ merchantId: MERCHANT.id, merchantName: MERCHANT.name, status: "paid", trxCount: 34, totalAmount: 5200000, lastTransactionAt: new Date().toISOString() }],
      recentFailed: [], stuckPending: [],
    }),
};

export function currentDemoRole(): Role | null {
  return currentUser?.role ?? null;
}
