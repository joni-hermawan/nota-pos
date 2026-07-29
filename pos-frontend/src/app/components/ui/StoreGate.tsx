// src/app/components/ui/StoreGate.tsx
"use client";

import { useEffect, useState } from "react";
import { Store, Loader2 } from "lucide-react";
import { storeApi } from "../../api";
import { useAuth } from "../../context/AuthContext";
import type { Store as StoreType } from "../../types";

// Halaman operasional (Kasir, Produk & Stok) BUTUH tahu store mana yang
// sedang dikerjakan - untuk kasir/ppic/store_manager itu sudah pasti
// (user.storeId), tapi admin (yang tidak terkunci ke 1 store) harus pilih
// dulu. Komponen ini mem-block konten sampai storeId tersedia.
export function StoreGate({ children }: { children: (storeId: string) => React.ReactNode }) {
  const { user } = useAuth();
  const [stores, setStores] = useState<StoreType[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const locked = !!user?.storeId;

  useEffect(() => {
    if (locked) {
      setLoading(false);
      return;
    }
    storeApi
      .list()
      .then((list) => {
        setStores(list.filter((s) => s.active));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [locked]);

  if (locked) return <>{children(user!.storeId)}</>;

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat store…</div>;
  }

  if (selected) return <>{children(selected)}</>;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brass/10">
        <Store size={22} className="text-brass" />
      </div>
      <div>
        <h2 className="font-display font-semibold">Pilih store dulu</h2>
        <p className="mt-1 text-sm text-ink-soft">Akun Anda tidak terkunci ke 1 store - pilih store yang ingin dikerjakan.</p>
      </div>
      {stores.length === 0 ? (
        <p className="text-sm text-alert">Belum ada store aktif. Buat store dulu di menu Stores.</p>
      ) : (
        <select
          onChange={(e) => setSelected(e.target.value)}
          defaultValue=""
          className="w-64 rounded-md border border-ink/15 bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>Pilih store…</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
