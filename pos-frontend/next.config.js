/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ── Proxy ke backend Go ──────────────────────────────────────────────
  // Browser TIDAK PERNAH tahu alamat/port asli backend - semua panggilan
  // dari browser cukup ke path relatif "/backend/..." pada origin frontend
  // ini sendiri (same-origin, TIDAK ADA CORS SAMA SEKALI). Next.js (di sisi
  // SERVER) yang meneruskan request tsb ke backend Go sesungguhnya.
  //
  // Alamat backend dibaca dari env BACKEND_INTERNAL_URL - SENGAJA TANPA
  // prefix NEXT_PUBLIC_, supaya nilainya hanya pernah dibaca di proses
  // Node (di sini & di server), dan TIDAK PERNAH ikut ter-bundle ke
  // JavaScript yang dikirim ke browser.
  async rewrites() {
    const backend = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080/api";
    return [
      { source: "/backend/:path*", destination: `${backend}/:path*` },
    ];
  },
};

module.exports = nextConfig;
