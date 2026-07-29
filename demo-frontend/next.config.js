/** @type {import('next').NextConfig} */
// ============================================================================
// DEMO MODE — dikonfigurasi untuk static export (output: 'export') supaya
// bisa di-hosting di GitHub Pages tanpa server Node/backend sama sekali.
// Tidak ada rewrites ke backend Go seperti versi asli - semua data berasal
// dari mock layer di api.ts.
// ============================================================================
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: "/nota-pos",
  assetPrefix: "/nota-pos/",
  trailingSlash: true,
  images: { unoptimized: true },
};

module.exports = nextConfig;
