// src/app/components/layout/AppLayout.tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { PAGE_META, effectivePages } from "../../constants";
import type { PageId } from "../../types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { DashboardPage } from "../../pages/DashboardPage";
import { PosPage } from "../../pages/PosPage";
import { PembayaranPage } from "../../pages/PembayaranPage";
import { RiwayatTransaksiPage } from "../../pages/RiwayatTransaksiPage";
import { EdcSetupPage } from "../../pages/EdcSetupPage";
import { ProdukStokPage } from "../../pages/ProdukStokPage";
import { ReportingPage } from "../../pages/ReportingPage";
import { BrandingPage } from "../../pages/BrandingPage";
import { UsersPage } from "../../pages/UsersPage";
import { MerchantsPage } from "../../pages/MerchantsPage";
import { StoresPage } from "../../pages/StoresPage";
import { SuperadminDashboardPage } from "../../pages/SuperadminDashboardPage";

// Menyimpan halaman yang sedang aktif supaya kalau browser di-refresh,
// user tetap di halaman yang sama (bukan otomatis kembali ke default).
// sessionStorage (bukan localStorage) supaya otomatis bersih begitu tab
// ditutup, sejalan dengan siklus hidup sesi login.
const ACTIVE_PAGE_KEY = "nota_pos_active_page";

function isAllowedPage(pageId: string, allowed: PageId[]): pageId is PageId {
  return allowed.includes(pageId as PageId);
}

function getInitialPage(allowed: PageId[]): PageId {
  try {
    const saved = sessionStorage.getItem(ACTIVE_PAGE_KEY);
    if (saved && isAllowedPage(saved, allowed)) return saved;
  } catch {
    // sessionStorage tidak tersedia (mis. private mode) - abaikan, pakai default
  }
  return allowed[0];
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const allowed = user ? effectivePages(user.role) : [];
  const [page, setPageState] = useState<PageId>(() => getInitialPage(allowed));
  const [collapsed, setCollapsed] = useState(false);

  const setPage = (p: PageId) => {
    setPageState(p);
    try {
      sessionStorage.setItem(ACTIVE_PAGE_KEY, p);
    } catch {
      // abaikan kalau storage tidak tersedia
    }
  };

  // PosPage men-dispatch event ini lewat tombol "Buka Pembayaran" setelah
  // order dibuat - AppLayout yang pegang state `page`, jadi navigasi lintas
  // halaman harus lewat sini, bukan langsung dari PosPage.
  useEffect(() => {
    const handler = (e: Event) => {
      const target = (e as CustomEvent<PageId>).detail;
      if (target && allowed.includes(target)) setPage(target);
    };
    window.addEventListener("nota-pos:navigate", handler);
    return () => window.removeEventListener("nota-pos:navigate", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!user) return null;

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return <DashboardPage />;
      case "pos":
        return <PosPage />;
      case "pembayaran":
        return <PembayaranPage />;
      case "riwayat":
        return <RiwayatTransaksiPage />;
      case "edc-setup":
        return <EdcSetupPage />;
      case "produk-stok":
        return <ProdukStokPage />;
      case "reporting":
        return <ReportingPage />;
      case "branding":
        return <BrandingPage />;
      case "users":
        return <UsersPage />;
      case "merchants":
        return <MerchantsPage />;
      case "stores":
        return <StoresPage />;
      case "superadmin-dashboard":
        return <SuperadminDashboardPage />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-paper-dim">
      <Sidebar page={page} setPage={setPage} user={user} onLogout={logout} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={PAGE_META[page].title} subtitle={PAGE_META[page].subtitle} user={user} onLogout={logout} />
        <main className="flex-1 overflow-y-auto">{renderPage()}</main>
      </div>
    </div>
  );
}
