# Nota EDC Agent

Aplikasi **terpisah** dari backend utama Nota POS — di-install di **tiap komputer kasir** yang mesin EDC-nya tersambung lewat USB.

## Kenapa perlu aplikasi terpisah?

Browser (tempat frontend Nota POS jalan) **tidak bisa** mengakses port USB/serial langsung — itu batasan keamanan browser, bukan bug. Aplikasi kecil ini yang jadi "jembatan": dia jalan di komputer kasir yang sama, browser memanggilnya lewat `localhost:9100`, dan dia yang bicara ke mesin EDC lewat kabel USB.

## Cara build jadi `.exe` (sekali saja, di komputer Anda yang ada internet)

```powershell
cd nota-edc-agent
go mod tidy
go build -o nota-edc-agent.exe ./cmd/agent
```

Build dari Mac/Linux tapi target Windows:
```bash
GOOS=windows GOARCH=amd64 go build -o nota-edc-agent.exe ./cmd/agent
```

Hasilnya **satu file `.exe`** — tinggal copy ke komputer kasir mana pun, tidak perlu install Go di komputer kasir sama sekali.

## Cara pakai di komputer kasir

1. Copy `nota-edc-agent.exe` ke folder mana saja (misal Desktop), **double-click**
2. Jendela ini akan langsung tampil siap (**tidak ada pertanyaan apa pun di jendela ini**)
3. Buka **Nota POS di browser** → login → masuk menu **"Pengaturan EDC"**
4. Di situ pilih port USB EDC dari daftar (otomatis terdeteksi), klik **Simpan**
5. Klik **"Tes Koneksi"** untuk pastikan mesin EDC benar-benar tersambung

**PC kasir cuma perlu tahu SATU alamat: URL Nota POS (frontend) yang biasa mereka buka.** Agent ini tidak pernah perlu tahu alamat backend/database sesungguhnya - dia melapor hasil transaksi lewat `{alamat Nota POS}/backend/...`, yang otomatis diteruskan Next.js ke backend asli (pola proxy yang sama dipakai browser untuk semua panggilan API lainnya). Alamat ini pun **diambil otomatis** dari `window.location.origin` saat halaman "Pengaturan EDC" dibuka - tidak pernah diketik manual.

Jendela `.exe` cuma perlu tetap terbuka (boleh di-minimize) selama kasir memakai POS.

## Supaya otomatis jalan tiap komputer nyala (opsional tapi disarankan)

**Cara termudah** — taruh shortcut di folder Startup Windows:
1. Tekan `Win + R`, ketik `shell:startup`, Enter
2. Copy **shortcut** (bukan file aslinya) `nota-edc-agent.exe` ke folder yang terbuka itu
3. Selesai — otomatis jalan tiap kali Windows login

**Cara lebih rapi (jalan di background, tanpa jendela)** — pakai [NSSM](https://nssm.cc/):
```powershell
nssm install NotaEDCAgent "C:\path\ke\nota-edc-agent.exe"
nssm start NotaEDCAgent
```

## Kalau ganti port EDC atau pindah komputer

Buka lagi menu **"Pengaturan EDC"** di Nota POS, pilih port yang benar, Simpan — **tidak perlu restart agent**, perubahan langsung berlaku di transaksi berikutnya.

## Endpoint yang disediakan

| Endpoint | Fungsi |
|---|---|
| `POST /edc/charge` | Trigger transaksi ke mesin EDC (dipanggil otomatis oleh frontend) |
| `GET /edc/check-connection` | Cek koneksi ke mesin EDC |
| `GET /edc/version` | Info versi firmware mesin EDC |
| `GET /edc/ports` | Daftar port USB/serial yang terdeteksi (dipakai halaman Pengaturan EDC) |
| `GET /edc/config` | Baca konfigurasi saat ini |
| `POST /edc/config` | Simpan konfigurasi baru (port EDC, alamat pelaporan) - dipanggil halaman Pengaturan EDC |

## Yang belum lengkap (jujur)

- Baru dukung penuh **Regular Sale** (transaksi normal) sesuai spec WIDE EDC Whitelabel. Void/prepaid/cash-withdrawal/QR-via-EDC sudah ada konstanta protokolnya di `internal/protocol.go`, tapi belum ada handler HTTP-nya
- Belum ada system tray icon (masih console window biasa)
- Port lokal agent ini sendiri (default `9100`) **tidak bisa** diubah lewat halaman Pengaturan EDC - itu perlu edit `config.json` manual + restart agent, karena frontend selalu memanggil agent di port yang sudah ditentukan
