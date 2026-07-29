// src/app/components/ui/StoreFilterBar.tsx
"use client";

import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { storeApi } from "../../api";
import type { Store as StoreType } from "../../types";

interface Props {
  value: string; // "" = semua store (agregat)
  onChange: (storeId: string) => void;
}

// Dipakai di halaman Dashboard/Reporting untuk role yang TIDAK terkunci ke
// 1 store (admin, finance) - mereka boleh lihat data agregat semua store,
// atau filter ke 1 store spesifik. Untuk role yang terkunci (kasir/ppic/
// store_manager), komponen ini tidak pernah dirender sama sekali - lihat
// pemanggilnya (cek user.storeId dulu).
export function StoreFilterBar({ value, onChange }: Props) {
  const [stores, setStores] = useState<StoreType[]>([]);

  useEffect(() => {
    storeApi.list().then(setStores).catch(() => undefined);
  }, []);

  if (stores.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-2">
      <Store size={14} className="text-ink-soft" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-ink/15 bg-white px-3 py-1.5 text-sm"
      >
        <option value="">Semua Store</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
