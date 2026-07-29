// src/app/utils/logger.ts
// ============================================================
// Logger aktivitas FRONTEND.
//
// PENTING: log ini SENGAJA tidak dikirim ke backend Go - frontend dan
// backend bisa berjalan di server yang berbeda, dan log aktivitas
// frontend ini harus dicatat di server tempat FRONTEND ini sendiri
// di-hosting, bukan ikut bergantung pada koneksi ke backend.
//
// Browser tidak bisa menulis file langsung ke disk server (tidak ada
// akses filesystem dari sandbox browser). Jadi logger ini hanya
// MENGIRIM setiap event ke route Next.js miliknya sendiri
// (POST /api/frontend-logs, selalu same-origin), dan route itu yang
// menulis ke file .log di server - lihat route.ts di folder yang sama.
//
// Prinsip penting:
// - Logging TIDAK BOLEH mengganggu UX. Kalau pengiriman log gagal,
//   jangan sampai melempar error ke pengguna - cukup dicatat di console.
// - Password/token TIDAK PERNAH ikut terlog (di-redact otomatis di
//   route.ts, sebagai lapis kedua selain yang di sini).
// - Pakai navigator.sendBeacon supaya log tetap terkirim walau pengguna
//   langsung menutup tab/pindah halaman (fetch biasa bisa ke-cancel saat
//   itu terjadi, sendBeacon dijamin browser tetap diproses).
// ============================================================

const FRONTEND_LOG_ENDPOINT = "/api/frontend-logs";

export type Level = "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: Level;
  message: string;
  context?: unknown;
}

function getTimestamp(): string {
  return new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function send(entry: LogEntry) {
  const body = JSON.stringify(entry);

  // sendBeacon tetap terkirim walau halaman langsung ditutup/navigasi -
  // fetch() biasa bisa dibatalkan browser di tengah jalan pada momen itu.
  // Fallback ke fetch kalau sendBeacon tidak tersedia (browser sangat lama).
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(FRONTEND_LOG_ENDPOINT, blob);
    return;
  }

  fetch(FRONTEND_LOG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch((err) => {
    console.error("[logger] gagal mengirim log:", err);
  });
}

export function logEvent(level: Level, message: string, context?: unknown) {
  const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn(`[${level}] ${message}`, context ?? "");

  send({ timestamp: getTimestamp(), level, message, context });
}
