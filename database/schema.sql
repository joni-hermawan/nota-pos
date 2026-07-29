/* =========================================================
   Nota POS - SQL Server Schema
   Jalankan di database kosong, misal: CREATE DATABASE nota_pos;
   ========================================================= */

IF DB_ID('nota_pos') IS NULL
BEGIN
    PRINT 'Jalankan di dalam database nota_pos. Buat dulu dengan: CREATE DATABASE nota_pos;';
END
GO

/* ---------- Users & Roles ---------- */

CREATE TABLE users (
    id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    username      NVARCHAR(50)  NOT NULL UNIQUE,
    password_hash NVARCHAR(200) NOT NULL,
    name          NVARCHAR(100) NOT NULL,
    role          NVARCHAR(20)  NOT NULL CHECK (role IN ('kasir','ppic','finance','admin')),
    active        BIT           NOT NULL DEFAULT 1,
    created_at    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* Setiap login membuat satu baris di sini. JWT membawa id baris ini
   sebagai klaim "jti" - jadi walau tanda tangan JWT masih kriptografis
   valid, sesi tetap bisa ditolak kalau baris ini sudah di-revoke
   (logout, atau dicabut paksa admin), atau sudah lewat expires_at. */
CREATE TABLE user_sessions (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id    UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES users(id),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    expires_at DATETIME2 NOT NULL,
    revoked_at DATETIME2 NULL
);
GO
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
GO

/* granular permission tables, for when role-level access isn't enough
   (e.g. admin wants to give one finance user export-only access) */
CREATE TABLE permissions (
    id   INT IDENTITY PRIMARY KEY,
    code NVARCHAR(80) NOT NULL UNIQUE,     -- e.g. 'transaction.void', 'report.export'
    description NVARCHAR(200) NULL
);
GO

CREATE TABLE role_permissions (
    role NVARCHAR(20) NOT NULL,
    permission_id INT NOT NULL FOREIGN KEY REFERENCES permissions(id),
    PRIMARY KEY (role, permission_id)
);
GO

/* ---------- Branding ---------- */

CREATE TABLE settings (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    store_name    NVARCHAR(150) NOT NULL DEFAULT 'Toko Saya',
    store_address NVARCHAR(300) NULL,
    logo_url      NVARCHAR(500) NULL,      -- served to Next.js UI
    logo_escpos_bitmap VARBINARY(MAX) NULL, -- pre-converted 1-bit bitmap for receipt printing
    updated_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- Products & Stock ---------- */

CREATE TABLE categories (
    id   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    name NVARCHAR(100) NOT NULL UNIQUE
);
GO

CREATE TABLE products (
    id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    sku         NVARCHAR(50)  NOT NULL UNIQUE,
    name        NVARCHAR(150) NOT NULL,
    category_id UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES categories(id),
    category    NVARCHAR(100) NOT NULL,     -- denormalized for fast reads on POS grid
    price       DECIMAL(14,2) NOT NULL CHECK (price >= 0),
    stock       INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    min_stock   INT NOT NULL DEFAULT 0,
    image_url   NVARCHAR(500) NULL,          -- product photo shown on POS grid & produk-stok table
    active      BIT NOT NULL DEFAULT 1,
    created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX idx_products_active ON products(active);
GO

CREATE TABLE stock_movements (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    product_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES products(id),
    delta      INT NOT NULL,                 -- negative = keluar (sale), positive = masuk (restock)
    reason     NVARCHAR(30) NOT NULL,        -- 'sale' | 'restock' | 'adjustment' | 'void'
    created_by UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES users(id),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at);
GO

/* ---------- Transactions ---------- */

CREATE TABLE transactions (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    invoice_no NVARCHAR(30) NOT NULL UNIQUE,
    cashier_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES users(id),
    total      DECIMAL(14,2) NOT NULL,
    status     NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','voided')),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX idx_transactions_created ON transactions(created_at);
CREATE INDEX idx_transactions_status ON transactions(status);
GO

CREATE TABLE transaction_items (
    id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    transaction_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES transactions(id),
    product_id     UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES products(id),
    qty            INT NOT NULL CHECK (qty > 0),
    unit_price     DECIMAL(14,2) NOT NULL
);
GO
CREATE INDEX idx_transaction_items_trx ON transaction_items(transaction_id);
CREATE INDEX idx_transaction_items_product ON transaction_items(product_id);
GO

/* ---------- Payments ---------- */

CREATE TABLE payment_methods (
    code NVARCHAR(20) NOT NULL PRIMARY KEY,  -- 'cash' | 'qris' | 'edc'
    label NVARCHAR(50) NOT NULL
);
INSERT INTO payment_methods (code, label) VALUES
    ('cash', 'Tunai'), ('qris', 'QRIS'), ('edc', 'Kartu (EDC)');
GO

CREATE TABLE payments (
    id               UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    transaction_id   UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES transactions(id),
    method           NVARCHAR(20) NOT NULL FOREIGN KEY REFERENCES payment_methods(code),
    amount           DECIMAL(14,2) NOT NULL,
    status           NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
    reference_no     NVARCHAR(100) NULL,      -- gateway/bank reference, for reconciliation
    gateway_response NVARCHAR(MAX) NULL,      -- raw JSON, kept verbatim for finance audit
    paid_at          DATETIME2 NULL,
    created_at       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX idx_payments_transaction ON payments(transaction_id);
CREATE INDEX idx_payments_method_status ON payments(method, status);
GO

/* ---------- Audit Log (for finance reconciliation & admin oversight) ---------- */

CREATE TABLE audit_logs (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id    UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES users(id),
    action     NVARCHAR(100) NOT NULL,   -- e.g. 'transaction.void', 'product.update'
    entity     NVARCHAR(50) NOT NULL,    -- e.g. 'transaction', 'product'
    entity_id  NVARCHAR(100) NULL,
    detail     NVARCHAR(MAX) NULL,       -- JSON snapshot of the change
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id);
GO

/* =========================================================
   Views for dashboard analytics
   Refresh cadence: these are plain views (computed on read).
   If data volume grows large, convert to indexed views or a
   nightly ETL job (SQL Agent / Go cron) into materialized tables.
   ========================================================= */

CREATE VIEW v_daily_sales AS
SELECT
    CAST(t.created_at AS DATE) AS sale_date,
    COUNT(DISTINCT t.id)       AS transaction_count,
    SUM(t.total)               AS revenue
FROM transactions t
WHERE t.status = 'paid'
GROUP BY CAST(t.created_at AS DATE);
GO

CREATE VIEW v_payment_method_breakdown AS
SELECT
    CAST(p.paid_at AS DATE) AS sale_date,
    p.method,
    COUNT(*)      AS payment_count,
    SUM(p.amount) AS total_amount
FROM payments p
WHERE p.status = 'paid'
GROUP BY CAST(p.paid_at AS DATE), p.method;
GO

CREATE VIEW v_product_performance AS
SELECT
    pr.id AS product_id,
    pr.name,
    pr.category,
    SUM(ti.qty)                      AS qty_sold,
    SUM(ti.qty * ti.unit_price)      AS revenue
FROM transaction_items ti
JOIN transactions t ON t.id = ti.transaction_id AND t.status = 'paid'
JOIN products pr    ON pr.id = ti.product_id
GROUP BY pr.id, pr.name, pr.category;
GO

/* Reconciliation helper: system total vs gateway-reported total per day/method */
CREATE VIEW v_reconciliation AS
SELECT
    CAST(p.paid_at AS DATE) AS recon_date,
    p.method,
    SUM(p.amount) AS system_total,
    COUNT(*)      AS payment_count
FROM payments p
WHERE p.status = 'paid'
GROUP BY CAST(p.paid_at AS DATE), p.method;
GO

/* =========================================================
   Seed data (dev only)
   Default password for all seed users below is: password123
   Generate real bcrypt hashes before using in production.
   ========================================================= */

INSERT INTO users (username, password_hash, name, role) VALUES
    ('admin01',   '$2b$10$2.fEgnqjcCseOb7vqlRSA.iPa5r2sHxj6OKTv0DrKmUDZxUEUTWya', 'Admin Toko',   'admin'),
    ('kasir01',   '$2b$10$KopEvUjqro1aiyacZK8lneD2xJl/SMm4561NKyZlBv5lfLm37CwTy', 'Kasir Satu',   'kasir'),
    ('ppic01',    '$2b$10$MDX52nYbYReUx/NgBBKl4eqIY8XGS0.Fq5b9R7uRZQ0JVRYtJJSpi', 'Staff PPIC',   'ppic'),
    ('finance01', '$2b$10$Tyv8iuRD9eh/umTApXCNtOT7auuXMQVnUvC541Gp4ilHATmzK2zKq', 'Staff Finance','finance');
GO

INSERT INTO products (sku, name, category, price, stock, min_stock) VALUES
    ('BVG-001', 'Kopi Susu Gula Aren', 'Minuman', 18000, 42, 15),
    ('BVG-002', 'Americano',           'Minuman', 15000, 8,  15),
    ('FD-001',  'Roti Bakar Coklat',   'Makanan', 20000, 26, 10),
    ('FD-002',  'Croissant Almond',    'Makanan', 22000, 3,  10);
GO
