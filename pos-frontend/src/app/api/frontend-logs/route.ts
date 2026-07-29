// src/app/api/frontend-logs/route.ts
//
// Menulis log aktivitas frontend LANGSUNG ke disk di server tempat
// FRONTEND ini sendiri di-hosting - BUKAN dikirim ke backend Go. Ini
// route handler Next.js biasa (bukan proxy), jadi punya akses filesystem
// penuh di sisi server, terpisah total dari backend.
//
// Kenapa dipisah dari backend: frontend dan backend bisa saja jalan di
// server yang berbeda (mis. skenario "server backend di rumah, kasir di
// lokasi lain" yang pernah dibahas) - kalau logging frontend bergantung
// pada koneksi ke backend yang jauh, logging bisa gagal justru di saat
// paling dibutuhkan (koneksi lagi bermasalah). Menulis lokal di server
// frontend sendiri jauh lebih andal.
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs"; // butuh akses filesystem, tidak tersedia di Edge runtime

const LOG_DIR = path.join(process.cwd(), "logs", "frontend");

const SENSITIVE_KEYS = new Set(["password", "token", "jwt", "authorization", "oldpasswordhash", "newpasswordhash"]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

export async function POST(req: NextRequest) {
  try {
    // navigator.sendBeacon() mengirim body sebagai Blob dengan
    // Content-Type "text/plain;charset=UTF-8" (bukan application/json),
    // jadi kita baca sebagai teks lalu parse manual - req.json() akan
    // gagal untuk request dari sendBeacon.
    const raw = await req.text();
    const entry = JSON.parse(raw);
    const safeEntry = redact(entry);

    await fs.mkdir(LOG_DIR, { recursive: true });
    const filename = path.join(LOG_DIR, `frontend-${new Date().toISOString().slice(0, 10)}.log`);
    await fs.appendFile(filename, JSON.stringify(safeEntry) + "\n", "utf-8");
  } catch (err) {
    // Kegagalan menulis log TIDAK BOLEH memunculkan error ke pengguna -
    // cukup dicatat di console server.
    console.error("[frontend-logs] gagal menulis log:", err);
  }

  return NextResponse.json({ ok: true });
}
