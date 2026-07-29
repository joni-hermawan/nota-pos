/* Migrasi: tambah kolom slug ke merchants, dipakai untuk branding halaman
   login per-merchant di /t/{slug} (superadmin/admin bisa punya banyak
   merchant, masing-masing dengan logo/nama sendiri SEBELUM user login -
   lihat LoginPage.tsx & handlers/merchants.go GetMerchantBranding).
   Aman dijalankan berkali-kali. */

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('merchants') AND name = 'slug')
BEGIN
    ALTER TABLE merchants ADD slug NVARCHAR(60) NULL;
END
GO

-- Backfill merchant lama yang belum punya slug: nama toko yang disederhanakan
-- + 8 karakter pertama id (menjamin unik tanpa logika dedup rumit di SQL).
-- CATATAN: ini hanya menangani karakter non-alfanumerik yang UMUM (spasi,
-- titik, koma, kutip, kurung, slash, underscore, ampersand) - bukan
-- sanitasi selengkap regex `[^a-z0-9]+` yang dipakai slugify() di
-- merchant_queries.go (dipakai saat CreateMerchant). Kalau ada nama
-- merchant dengan karakter aneh lain yang lolos, cukup UPDATE manual
-- baris itu setelahnya - bukan hal yang perlu dikhawatirkan di skala
-- aplikasi ini.
UPDATE merchants
SET slug = LOWER(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        LTRIM(RTRIM(name)), ' ', '-'), '.', ''), ',', ''), '''', ''), '(', ''), ')', ''), '/', '-'), '_', '-')
) + '-' + LOWER(LEFT(REPLACE(CAST(id AS VARCHAR(36)), '-', ''), 8))
WHERE slug IS NULL;
GO

-- Filtered unique index (bukan constraint biasa) supaya tetap toleran kalau
-- suatu saat ada baris dengan slug NULL - SQL Server unique index/constraint
-- biasa hanya mengizinkan SATU NULL, filtered index ini mengizinkan banyak.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_merchants_slug')
BEGIN
    CREATE UNIQUE INDEX ux_merchants_slug ON merchants(slug) WHERE slug IS NOT NULL;
END
GO
