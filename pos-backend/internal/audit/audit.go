// Package audit mencatat aksi-aksi penting (void transaksi, ubah harga,
// hapus produk, dll) ke tabel audit_logs, terpisah dari logger aktivitas
// teknis (internal/logger). Audit log ini yang ditampilkan di halaman
// "Audit Trail" untuk admin/finance, sementara internal/logger untuk
// debugging developer.
package audit

import (
	"database/sql"
	"encoding/json"
)

// Record menyimpan satu baris audit. detail di-marshal ke JSON apa adanya -
// pemanggil bertanggung jawab tidak menaruh data sensitif di sana (lihat
// logger.Redact kalau perlu pola serupa untuk detail ini).
func Record(db *sql.DB, userID, action, entity, entityID string, detail interface{}) error {
	detailJSON, err := json.Marshal(detail)
	if err != nil {
		return err
	}
	_, err = db.Exec(
		`INSERT INTO audit_logs (id, user_id, action, entity, entity_id, detail, created_at)
		 VALUES (NEWID(), @p1, @p2, @p3, @p4, @p5, SYSUTCDATETIME())`,
		userID, action, entity, entityID, string(detailJSON),
	)
	return err
}

type Entry struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Action    string `json:"action"`
	Entity    string `json:"entity"`
	EntityID  string `json:"entityId"`
	Detail    string `json:"detail"`
	CreatedAt string `json:"createdAt"`
}

// List returns the most recent audit entries, newest first.
func List(db *sql.DB, limit int) ([]Entry, error) {
	rows, err := db.Query(
		`SELECT TOP (@p1) CAST(id AS NVARCHAR(36)), CAST(ISNULL(user_id, '') AS NVARCHAR(36)),
		        action, entity, ISNULL(entity_id, ''), ISNULL(detail, ''), CONVERT(varchar, created_at, 126)
		 FROM audit_logs ORDER BY created_at DESC`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []Entry{}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.UserID, &e.Action, &e.Entity, &e.EntityID, &e.Detail, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
