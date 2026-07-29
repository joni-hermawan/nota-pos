/* Migrasi: tambah kolom foto produk ke tabel products yang sudah ada.
   Aman dijalankan berkali-kali (idempotent check). */

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('products') AND name = 'image_url'
)
BEGIN
    ALTER TABLE products ADD image_url NVARCHAR(500) NULL;
END
GO

-- contoh isi foto untuk data seed yang sudah ada (opsional, sesuaikan/hapus)
UPDATE products SET image_url = 'https://picsum.photos/seed/kopi-susu/200' WHERE sku = 'BVG-001';
UPDATE products SET image_url = 'https://picsum.photos/seed/americano/200' WHERE sku = 'BVG-002';
UPDATE products SET image_url = 'https://picsum.photos/seed/roti-bakar/200' WHERE sku = 'FD-001';
UPDATE products SET image_url = 'https://picsum.photos/seed/croissant/200' WHERE sku = 'FD-002';
GO
