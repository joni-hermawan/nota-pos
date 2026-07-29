package models

import (
	"database/sql"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

func GetMerchantByID(db *sql.DB, id string) (*Merchant, error) {
	var m Merchant
	err := db.QueryRow(
		`SELECT CAST(id AS NVARCHAR(36)), name, ISNULL(address, ''), logo_url, active, ISNULL(slug, '')
		 FROM merchants WHERE id = @p1`, id,
	).Scan(&m.ID, &m.Name, &m.Address, &m.LogoURL, &m.Active, &m.Slug)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// GetMerchantBranding is the public (pre-login) lookup used by the
// branded login screen at /t/{slug} - only ever returns the two fields
// safe to expose to an unauthenticated visitor. Returns sql.ErrNoRows if
// the slug doesn't match any ACTIVE merchant (an inactive/deactivated
// merchant's login link deliberately stops resolving, same as if it never
// existed - no point branding a page for a store that's been shut off).
func GetMerchantBranding(db *sql.DB, slug string) (*MerchantBranding, error) {
	var b MerchantBranding
	err := db.QueryRow(
		`SELECT name, logo_url FROM merchants WHERE slug = @p1 AND active = 1`, slug,
	).Scan(&b.Name, &b.LogoURL)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// ListMerchants is a superadmin-only capability (platform-level, not
// scoped to any single merchant).
func ListMerchants(db *sql.DB) ([]Merchant, error) {
	rows, err := db.Query(
		`SELECT CAST(id AS NVARCHAR(36)), name, ISNULL(address, ''), logo_url, active, ISNULL(slug, '')
		 FROM merchants ORDER BY name`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	merchants := []Merchant{}
	for rows.Next() {
		var m Merchant
		if err := rows.Scan(&m.ID, &m.Name, &m.Address, &m.LogoURL, &m.Active, &m.Slug); err != nil {
			return nil, err
		}
		merchants = append(merchants, m)
	}
	return merchants, rows.Err()
}

type MerchantInput struct {
	Name    string
	Address string
}

var nonSlugChars = regexp.MustCompile(`[^a-z0-9]+`)

// slugify turns a merchant name into a URL-safe fragment. Not guaranteed
// globally unique on its own - CreateMerchant appends a short id suffix,
// same backfill strategy as migration 005_add_merchant_slug.sql, so both
// paths that can produce a slug agree on the format.
func slugify(name string) string {
	s := nonSlugChars.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	return strings.Trim(s, "-")
}

func CreateMerchant(db *sql.DB, in MerchantInput) (*Merchant, error) {
	id := uuid.NewString()
	slug := slugify(in.Name) + "-" + strings.ToLower(id[:8])
	_, err := db.Exec(
		`INSERT INTO merchants (id, name, address, active, created_at, slug) VALUES (@p1, @p2, @p3, 1, SYSUTCDATETIME(), @p4)`,
		id, in.Name, in.Address, slug,
	)
	if err != nil {
		return nil, err
	}
	return GetMerchantByID(db, id)
}

func UpdateMerchant(db *sql.DB, id string, in MerchantInput) (*Merchant, error) {
	_, err := db.Exec(`UPDATE merchants SET name = @p1, address = @p2 WHERE id = @p3`, in.Name, in.Address, id)
	if err != nil {
		return nil, err
	}
	return GetMerchantByID(db, id)
}

// UpdateMerchantLogo sets the logo shown across the UI and printed on
// receipts for this merchant - self-service (admin doesn't need
// superadmin's help just to change their own logo).
func UpdateMerchantLogo(db *sql.DB, id, logoURL string) (*Merchant, error) {
	_, err := db.Exec(`UPDATE merchants SET logo_url = @p1 WHERE id = @p2`, logoURL, id)
	if err != nil {
		return nil, err
	}
	return GetMerchantByID(db, id)
}

func SetMerchantActive(db *sql.DB, id string, active bool) error {
	_, err := db.Exec(`UPDATE merchants SET active = @p1 WHERE id = @p2`, active, id)
	return err
}
