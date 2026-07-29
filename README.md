# Nota POS — Rebuild (struktur mengikuti project referensi)

Rebuild total dari sistem POS sebelumnya, mengikuti pola arsitektur project
referensi Anda: JWT di cookie httpOnly, sesi tercatat di database (bisa
di-revoke), logger frontend/backend terpisah, router `gorilla/mux`, dan
struktur folder `internal/` yang konsisten. **Spec protokol EDC (WIDE
Whitelabel) tidak berubah sama sekali** dari implementasi sebelumnya.

## Struktur folder

```
nota-pos/
├── pos-backend/
│   ├── cmd/server/main.go       ← entrypoint API utama
│   ├── cmd/edc-agent/main.go    ← agent EDC (jalan di PC kasir, USB)
│   └── internal/
│       ├── config/    db/    auth/    session/    audit/
│       ├── logger/    middleware/    models/    handlers/    router/
│       ├── realtime/  (SSE broker)   paymentgw/  (adapter QRIS)
│       └── edcagent/  (protocol.go, serial_device.go — spec EDC)
├── pos-frontend/
│   └── src/app/
│       ├── api.ts, types.ts, constants.ts   ← pola file-level referensi
│       ├── context/    (AuthContext, ToastContext)
│       ├── components/ui/   components/layout/
│       ├── utils/      (logger.ts, cn.ts)
│       ├── login/
│       └── (kasir)/ (ppic)/ (finance)/ (admin)/   ← route group per role
└── database/schema.sql + migrations/
```

## Perubahan arsitektur kunci vs versi sebelumnya

| Aspek | Sebelumnya | Sekarang |
|---|---|---|
| Auth | JWT di cookie biasa (bisa dibaca JS) | JWT di cookie httpOnly (tidak bisa dibaca JS sama sekali) |
| Sesi | Cuma andalkan JWT expiry | Tercatat di DB (user_sessions) - bisa di-revoke paksa |
| Router | chi | gorilla/mux |
| Query DB | sqlx | database/sql polos |
| Logger | Satu file gabungan | Terpisah logs/frontend/ dan logs/backend/ |
| Route guard frontend | middleware.ts (Next.js edge) | Client-side via AuthContext + AppLayout |
| Audit trail | Tabel audit_logs ada tapi tak terpakai | Package internal/audit siap pakai |

## Setup

### 1. Database
```
sqlcmd -S localhost -U sa -P YourPass -Q "CREATE DATABASE nota_pos"
sqlcmd -S localhost -U sa -P YourPass -d nota_pos -i database/schema.sql
```
Kalau database Anda sudah ada dari versi sebelumnya, cukup jalankan migrasi baru:
```
sqlcmd ... -i database/migrations/004_add_user_sessions.sql
```

### 2. Backend
```
cd pos-backend
cp .env.example .env
go mod tidy
go run ./cmd/server
```

### 3. Frontend
```
cd pos-frontend
cp .env.local.example .env.local
npm install
npm run dev
```

### 4. Agent EDC (di PC kasir)
```
cd pos-backend
set EDC_SERIAL_PORT=COM8
go run ./cmd/edc-agent
```

## Login default
| Username | Password | Role |
|---|---|---|
| admin01 | password123 | admin |
| kasir01 | password123 | kasir |
| ppic01 | password123 | ppic |
| finance01 | password123 | finance |

Ganti password ini sebelum produksi.

## Catatan jujur - yang belum lengkap
1. Upload foto produk masih preview lokal saja (belum ke object storage sungguhan)
2. Reporting/rekonsiliasi baru bandingkan data internal sendiri (belum ada sumber data bank/gateway eksternal)
3. Hanya command Regular Sale dari spec EDC yang terhubung penuh ke Charge(); command lain (prepaid, cash withdrawal, QR via EDC) sudah ada konstanta protokolnya tapi belum ada request/response builder-nya
4. Belum ada go build/npm run build end-to-end di sandbox ini (dibatasi akses jaringan sandbox ke golang.org/go.bug.st) - sudah divalidasi lewat gofmt (backend) dan tsc --noEmit (frontend), build penuh perlu dicoba di komputer Anda
