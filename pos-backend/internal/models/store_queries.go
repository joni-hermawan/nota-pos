package models

import (
	"database/sql"

	"github.com/google/uuid"
)

func GetStoreByID(db *sql.DB, id, merchantID string) (*Store, error) {
	var s Store
	err := db.QueryRow(
		`SELECT CAST(id AS NVARCHAR(36)), CAST(merchant_id AS NVARCHAR(36)), name, ISNULL(address,''), active
		 FROM stores WHERE id = @p1 AND merchant_id = @p2`, id, merchantID,
	).Scan(&s.ID, &s.MerchantID, &s.Name, &s.Address, &s.Active)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// ListStoresByMerchant is used by an admin/owner managing their own
// merchant's branches.
func ListStoresByMerchant(db *sql.DB, merchantID string) ([]Store, error) {
	rows, err := db.Query(
		`SELECT CAST(id AS NVARCHAR(36)), CAST(merchant_id AS NVARCHAR(36)), name, ISNULL(address,''), active
		 FROM stores WHERE merchant_id = @p1 ORDER BY name`, merchantID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stores := []Store{}
	for rows.Next() {
		var s Store
		if err := rows.Scan(&s.ID, &s.MerchantID, &s.Name, &s.Address, &s.Active); err != nil {
			return nil, err
		}
		stores = append(stores, s)
	}
	return stores, rows.Err()
}

type StoreInput struct {
	Name    string
	Address string
}

func CreateStore(db *sql.DB, merchantID string, in StoreInput) (*Store, error) {
	id := uuid.NewString()
	_, err := db.Exec(
		`INSERT INTO stores (id, merchant_id, name, address, active, created_at) VALUES (@p1, @p2, @p3, @p4, 1, SYSUTCDATETIME())`,
		id, merchantID, in.Name, in.Address,
	)
	if err != nil {
		return nil, err
	}
	return GetStoreByID(db, id, merchantID)
}

func UpdateStore(db *sql.DB, id, merchantID string, in StoreInput) (*Store, error) {
	_, err := db.Exec(
		`UPDATE stores SET name = @p1, address = @p2 WHERE id = @p3 AND merchant_id = @p4`,
		in.Name, in.Address, id, merchantID,
	)
	if err != nil {
		return nil, err
	}
	return GetStoreByID(db, id, merchantID)
}

func SetStoreActive(db *sql.DB, id, merchantID string, active bool) error {
	_, err := db.Exec(`UPDATE stores SET active = @p1 WHERE id = @p2 AND merchant_id = @p3`, active, id, merchantID)
	return err
}
