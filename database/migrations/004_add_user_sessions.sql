/* Migrasi: tambah tabel user_sessions untuk arsitektur auth baru
   (JWT cookie httpOnly + sesi yang bisa di-revoke dari database).
   Aman dijalankan berkali-kali. */

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_sessions')
BEGIN
    CREATE TABLE user_sessions (
        id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        user_id    UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES users(id),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        expires_at DATETIME2 NOT NULL,
        revoked_at DATETIME2 NULL
    );
    CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
END
GO
