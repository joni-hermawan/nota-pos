package models

import "database/sql"

func GetUserByUsername(db *sql.DB, username string) (*User, error) {
	var u User
	var storeID sql.NullString
	// CAST(id AS NVARCHAR(36)) wajib: driver mssql mengembalikan kolom
	// UNIQUEIDENTIFIER sebagai 16-byte binary mentah kalau di-scan langsung
	// ke string Go, bukan teks GUID berformat - CAST ini yang meluruskannya.
	err := db.QueryRow(
		`SELECT CAST(id AS NVARCHAR(36)), CAST(merchant_id AS NVARCHAR(36)), CAST(store_id AS NVARCHAR(36)),
		        username, password_hash, name, role, active
		 FROM users WHERE username = @p1 AND active = 1`,
		username,
	).Scan(&u.ID, &u.MerchantID, &storeID, &u.Username, &u.PasswordHash, &u.Name, &u.Role, &u.Active)
	if err != nil {
		return nil, err
	}
	u.StoreID = storeID.String
	return &u, nil
}

// GetUserByID includes the password hash - used for self-service "ganti
// password" (need to verify the CURRENT password before allowing a
// change). No merchant scoping needed here since a user always looks up
// their own record via their own JWT-derived ID.
func GetUserByID(db *sql.DB, id string) (*User, error) {
	var u User
	var storeID sql.NullString
	err := db.QueryRow(
		`SELECT CAST(id AS NVARCHAR(36)), CAST(merchant_id AS NVARCHAR(36)), CAST(store_id AS NVARCHAR(36)),
		        username, password_hash, name, role, active
		 FROM users WHERE id = @p1`, id,
	).Scan(&u.ID, &u.MerchantID, &storeID, &u.Username, &u.PasswordHash, &u.Name, &u.Role, &u.Active)
	if err != nil {
		return nil, err
	}
	u.StoreID = storeID.String
	return &u, nil
}

// UserSummary is what's exposed via the Users management API - never
// includes password_hash. StoreID/StoreName are empty for roles whose
// scope isn't a single store (admin, finance, superadmin).
type UserSummary struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	Name         string `json:"name"`
	Role         string `json:"role"`
	Active       bool   `json:"active"`
	MerchantID   string `json:"merchantId"`
	MerchantName string `json:"merchantName"`
	StoreID      string `json:"storeId"`
	StoreName    string `json:"storeName"`
}

const userSummarySelect = `
	SELECT CAST(u.id AS NVARCHAR(36)), u.username, u.name, u.role, u.active,
	       CAST(u.merchant_id AS NVARCHAR(36)), m.name,
	       ISNULL(CAST(u.store_id AS NVARCHAR(36)), ''), ISNULL(s.name, '')
	FROM users u
	JOIN merchants m ON m.id = u.merchant_id
	LEFT JOIN stores s ON s.id = u.store_id
`

// ListUsersByMerchant is used by a per-merchant admin managing ALL of
// their store's staff (every store in the merchant).
func ListUsersByMerchant(db *sql.DB, merchantID string) ([]UserSummary, error) {
	rows, err := db.Query(userSummarySelect+` WHERE u.merchant_id = @p1 ORDER BY u.name`, merchantID)
	if err != nil {
		return nil, err
	}
	return scanUserSummaries(rows)
}

// ListUsersByStore is used by a store_manager - only sees staff (kasir,
// ppic) assigned to THEIR OWN store, never other stores in the merchant.
func ListUsersByStore(db *sql.DB, storeID string) ([]UserSummary, error) {
	rows, err := db.Query(userSummarySelect+` WHERE u.store_id = @p1 ORDER BY u.name`, storeID)
	if err != nil {
		return nil, err
	}
	return scanUserSummaries(rows)
}

// ListAllUsers is superadmin-only - lists users across every merchant.
func ListAllUsers(db *sql.DB) ([]UserSummary, error) {
	rows, err := db.Query(userSummarySelect + ` ORDER BY m.name, u.name`)
	if err != nil {
		return nil, err
	}
	return scanUserSummaries(rows)
}

func scanUserSummaries(rows *sql.Rows) ([]UserSummary, error) {
	defer rows.Close()
	result := []UserSummary{}
	for rows.Next() {
		var u UserSummary
		if err := rows.Scan(&u.ID, &u.Username, &u.Name, &u.Role, &u.Active, &u.MerchantID, &u.MerchantName, &u.StoreID, &u.StoreName); err != nil {
			return nil, err
		}
		result = append(result, u)
	}
	return result, rows.Err()
}

// GetUserSummaryByID scopes to merchantID if provided (non-empty) - a
// per-merchant admin/store_manager must never be able to look up/edit a
// user outside their own scope even by guessing an ID. Superadmin callers
// pass "" to look up across all merchants.
func GetUserSummaryByID(db *sql.DB, id, merchantID string) (*UserSummary, error) {
	var u UserSummary
	query := userSummarySelect + ` WHERE u.id = @p1`
	args := []interface{}{id}
	if merchantID != "" {
		query += " AND u.merchant_id = @p2"
		args = append(args, merchantID)
	}
	err := db.QueryRow(query, args...).Scan(&u.ID, &u.Username, &u.Name, &u.Role, &u.Active, &u.MerchantID, &u.MerchantName, &u.StoreID, &u.StoreName)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

type UserInput struct {
	Username     string
	PasswordHash string
	Name         string
	Role         string
	StoreID      string // empty string -> NULL (admin/finance/superadmin); required for kasir/ppic/store_manager
}

func CreateUser(db *sql.DB, merchantID string, in UserInput) (string, error) {
	var id string
	var storeID interface{}
	if in.StoreID == "" {
		storeID = nil
	} else {
		storeID = in.StoreID
	}
	err := db.QueryRow(
		`INSERT INTO users (id, merchant_id, store_id, username, password_hash, name, role, active, created_at)
		 OUTPUT INSERTED.id
		 VALUES (NEWID(), @p1, @p2, @p3, @p4, @p5, @p6, 1, SYSUTCDATETIME())`,
		merchantID, storeID, in.Username, in.PasswordHash, in.Name, in.Role,
	).Scan(&id)
	return id, err
}

type UserUpdateInput struct {
	Name   string
	Role   string
	Active bool
}

// UpdateUser edits a user's core fields (not password, not merchant/store
// assignment - those are separate, more sensitive operations). Scoped by
// merchantID when non-empty (per-merchant admin/store_manager can only
// edit within their own scope); superadmin passes "" to edit anyone.
func UpdateUser(db *sql.DB, id, merchantID string, in UserUpdateInput) error {
	query := `UPDATE users SET name = @p1, role = @p2, active = @p3 WHERE id = @p4`
	args := []interface{}{in.Name, in.Role, in.Active, id}
	if merchantID != "" {
		query += " AND merchant_id = @p5"
		args = append(args, merchantID)
	}
	_, err := db.Exec(query, args...)
	return err
}

// ReassignUserMerchant moves a user to a different merchant - superadmin
// only capability. Clears store_id (a store from the OLD merchant would be
// invalid for the new one) - the superadmin/new merchant's admin must
// assign a new store afterward if the role needs one.
func ReassignUserMerchant(db *sql.DB, id, newMerchantID string) error {
	_, err := db.Exec(`UPDATE users SET merchant_id = @p1, store_id = NULL WHERE id = @p2`, newMerchantID, id)
	return err
}

// ReassignUserStore moves a user to a different store WITHIN THE SAME
// merchant (e.g. admin transfers a kasir from one branch to another).
func ReassignUserStore(db *sql.DB, id, merchantID, newStoreID string) error {
	_, err := db.Exec(`UPDATE users SET store_id = @p1 WHERE id = @p2 AND merchant_id = @p3`, newStoreID, id, merchantID)
	return err
}

func ResetUserPassword(db *sql.DB, id, merchantID, newPasswordHash string) error {
	query := `UPDATE users SET password_hash = @p1 WHERE id = @p2`
	args := []interface{}{newPasswordHash, id}
	if merchantID != "" {
		query += " AND merchant_id = @p3"
		args = append(args, merchantID)
	}
	_, err := db.Exec(query, args...)
	return err
}
