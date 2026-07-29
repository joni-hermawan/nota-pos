import dynamic from "next/dynamic";

// Aplikasi ini murni client-side (cookie httpOnly diverifikasi via
// authApi.me(), context auth, sessionStorage untuk halaman aktif, dsb).
// ssr:false membuat Next.js melewati percobaan pre-render di server untuk
// route ini.
const App = dynamic(() => import("./App"), { ssr: false });

// SPA auth-gated tunggal (App.tsx yang menentukan LoginPage vs AppLayout
// berdasarkan status login) - bukan multi-route seperti Next.js pada
// umumnya. Cukup satu route "/" yang me-mount App.tsx.
export default function Page() {
  return <App />;
}
