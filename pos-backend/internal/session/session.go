// Package session mencatat setiap login sebagai satu baris di tabel
// user_sessions, sehingga token JWT yang secara kriptografis masih valid
// TETAP bisa ditolak kalau sesinya sudah di-revoke (logout, atau dicabut
// paksa oleh admin) - beda dengan JWT murni yang cuma bisa "expired",
// tidak bisa "dicabut lebih awal".
package session

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// Create membuat baris sesi baru dan mengembalikan session ID (dipakai
// sebagai klaim "jti" di JWT).
func Create(db *sql.DB, userID string, expiresAt time.Time) (string, error) {
	id := uuid.NewString()
	_, err := db.Exec(
		`INSERT INTO user_sessions (id, user_id, created_at, expires_at) VALUES (@p1, @p2, SYSUTCDATETIME(), @p3)`,
		id, userID, expiresAt,
	)
	return id, err
}

// IsValid mengecek apakah sesi masih aktif: ada di tabel, belum di-revoke,
// dan belum lewat expires_at.
func IsValid(db *sql.DB, sessionID string) (bool, error) {
	var revokedAt sql.NullTime
	var expiresAt time.Time
	err := db.QueryRow(
		`SELECT revoked_at, expires_at FROM user_sessions WHERE id = @p1`, sessionID,
	).Scan(&revokedAt, &expiresAt)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if revokedAt.Valid {
		return false, nil
	}
	if time.Now().After(expiresAt) {
		return false, nil
	}
	return true, nil
}

// Revoke menandai sesi sebagai berakhir (dipanggil saat logout).
func Revoke(db *sql.DB, sessionID string) error {
	_, err := db.Exec(`UPDATE user_sessions SET revoked_at = SYSUTCDATETIME() WHERE id = @p1`, sessionID)
	return err
}

// RevokeAllForUser mencabut SEMUA sesi aktif milik satu user - berguna
// untuk fitur admin "paksa logout semua perangkat" atau saat password
// diganti.
func RevokeAllForUser(db *sql.DB, userID string) error {
	_, err := db.Exec(
		`UPDATE user_sessions SET revoked_at = SYSUTCDATETIME() WHERE user_id = @p1 AND revoked_at IS NULL`,
		userID,
	)
	return err
}
