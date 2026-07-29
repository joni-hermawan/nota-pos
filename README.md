# Nota POS — Sistem Kasir Multi-Role

Sistem Point of Sale (POS) full-stack dengan integrasi pembayaran EDC & QRIS, dibangun untuk mendukung operasional retail dari transaksi harian hingga rekonsiliasi keuangan — dengan akses berbeda untuk Kasir, PPIC, Finance, dan Administrator.

## Tentang Project

Nota POS menggabungkan dua hal yang jarang ditemukan bersamaan dalam satu project pribadi: pengalaman langsung di infrastruktur pembayaran (EDC, HSM) dan pengembangan aplikasi full-stack modern. Sistem ini tidak hanya mensimulasikan transaksi kasir, tapi benar-benar berkomunikasi dengan perangkat EDC fisik melalui implementasi protokol serial resmi, serta terintegrasi dengan payment gateway QRIS.

## Fitur Utama

- **Multi-role** — akses berbeda untuk Kasir, PPIC, Finance, dan Administrator
- **Transaksi pembayaran EDC** — komunikasi langsung ke mesin EDC fisik via serial port (agent lokal terpisah)
- **Pembayaran QRIS** — integrasi payment gateway (Midtrans)
- **Cetak struk thermal** — format ESC/POS
- **Manajemen produk & stok**
- **Multi-toko / multi-merchant**
- **Laporan & rekonsiliasi transaksi**
- **Update real-time** — status transaksi ter-update otomatis di layar kasir via Server-Sent Events
- **Audit trail & manajemen sesi** — setiap sesi login tercatat di database dan bisa di-revoke paksa

## Arsitektur & Tech Stack

| Komponen | Teknologi |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS |
| Backend | Golang (Clean Architecture), gorilla/mux |
| Database | SQL Server |
| Agent EDC | Aplikasi Go terpisah, berjalan di PC kasir, komunikasi via port serial (USB) |
| Payment Gateway | QRIS (Midtrans) |

```
nota-pos/
├── pos-backend/     # API utama (Go)
├── pos-frontend/     # Aplikasi kasir (Next.js)
├── nota-edc-agent/  # Agent lokal penghubung ke mesin EDC fisik
└── database/         # Schema & migrasi SQL Server
```

## Highlight Teknis

- **Implementasi protokol EDC dari spesifikasi teknis resmi** (WIDE EDC Whitelabel) — mencakup penyusunan frame data, perhitungan checksum CRC, dan pemetaan kode transaksi untuk berbagai bank & payment provider.
- **Keamanan sesi tingkat lanjut** — JWT disimpan di cookie `httpOnly` (tidak bisa diakses JavaScript), dan setiap sesi tercatat di database sehingga bisa di-revoke sewaktu-waktu.
- **Update real-time** via Server-Sent Events, tanpa perlu polling.
- **Role-based access control** granular per modul dan aksi.

## Cara Menjalankan

### 1. Database
```bash
sqlcmd -S localhost -U sa -P YourPass -Q "CREATE DATABASE nota_pos"
sqlcmd -S localhost -U sa -P YourPass -d nota_pos -i database/schema.sql
```

### 2. Backend
```bash
cd pos-backend
cp .env.example .env
go mod tidy
go run ./cmd/server
```

### 3. Frontend
```bash
cd pos-frontend
cp .env.local.example .env.local
npm install
npm run dev
```

### 4. Agent EDC (di PC kasir)
```bash
cd pos-backend
set EDC_SERIAL_PORT=COM8
go run ./cmd/edc-agent
```

## Login Default

| Username | Password | Role |
|---|---|---|
| admin01 | password123 | Administrator |
| kasir01 | password123 | Kasir |
| ppic01 | password123 | PPIC |
| finance01 | password123 | Finance |

*Kredensial demo — wajib diganti sebelum digunakan di lingkungan produksi.*

## Status & Roadmap

Project ini aktif dikembangkan. Beberapa area yang masih dalam pengembangan lebih lanjut:
- Upload foto produk saat ini masih preview lokal, belum terhubung ke object storage
- Command EDC selain Regular Sale (prepaid, cash withdrawal, QR via EDC) sudah punya definisi protokol lengkap, tinggal dihubungkan ke handler transaksi
- Rekonsiliasi laporan saat ini membandingkan data internal; integrasi dengan sumber data bank/gateway eksternal sedang direncanakan
