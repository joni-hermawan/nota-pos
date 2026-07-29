// src/app/components/layout/Sidebar.tsx
"use client";

import { LayoutDashboard, ScanLine, Boxes, FileBarChart, Settings, LogOut, ChevronLeft, ChevronRight, Users, Store, Building2, ShieldAlert, Wallet, History, CreditCard } from "lucide-react";
import { Logo } from "./Logo";
import { ROLE_LABEL, PAGE_META, effectivePages } from "../../constants";
import type { AuthProfile, PageId } from "../../types";

const ICON: Record<PageId, React.ReactNode> = {
  dashboard: <LayoutDashboard size={18} />,
  pos: <ScanLine size={18} />,
  pembayaran: <Wallet size={18} />,
  riwayat: <History size={18} />,
  "produk-stok": <Boxes size={18} />,
  reporting: <FileBarChart size={18} />,
  branding: <Settings size={18} />,
  "edc-setup": <CreditCard size={18} />,
  users: <Users size={18} />,
  merchants: <Building2 size={18} />,
  stores: <Store size={18} />,
  "superadmin-dashboard": <ShieldAlert size={18} />,
};

interface SidebarProps {
  page: PageId;
  setPage: (p: PageId) => void;
  user: AuthProfile;
  onLogout: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export function Sidebar({ page, setPage, user, onLogout, collapsed, setCollapsed }: SidebarProps) {
  const allowed = effectivePages(user.role);

  return (
    <aside className={`flex h-full flex-col bg-register text-paper transition-all ${collapsed ? "w-16" : "w-60"}`}>
      <div className="flex items-center justify-between px-4 py-6">
        {!collapsed && (
          <div className="min-w-0">
            <Logo variant="light" size={28} src={user.merchantLogoUrl || null} />
            <p className="mt-1 truncate text-xs font-semibold text-paper" title={user.merchantName}>
              {user.merchantName}
            </p>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="rounded-md p-1 text-paper/60 hover:bg-white/5 hover:text-paper">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <div className="brass-rule mx-4" />

      <nav className="flex-1 space-y-1 px-3 py-5">
        {allowed.map((p) => {
          const active = page === p;
          return (
            <button
              key={p}
              onClick={() => setPage(p)}
              title={PAGE_META[p].title}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                active ? "bg-brass/15 text-brass font-medium" : "text-paper/70 hover:bg-white/5 hover:text-paper"
              }`}
            >
              {ICON[p]}
              {!collapsed && PAGE_META[p].title}
            </button>
          );
        })}
      </nav>

      <div className="brass-rule mx-4" />
      <div className="px-4 py-4">
        {!collapsed && (
          <>
            <p className="text-xs uppercase tracking-wide text-paper/50">Masuk sebagai</p>
            <p className="font-display text-sm font-medium">{user.name}</p>
            <p className="font-mono text-xs text-brass">{ROLE_LABEL[user.role]}</p>
          </>
        )}
        <button onClick={onLogout} className="mt-3 flex items-center gap-2 text-xs text-paper/60 hover:text-paper">
          <LogOut size={14} /> {!collapsed && "Keluar"}
        </button>
        {!collapsed && <p className="mt-4 text-center text-[10px] text-paper/30">Powered by Nota POS</p>}
      </div>
    </aside>
  );
}
