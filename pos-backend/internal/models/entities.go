// Package models berisi struct data domain (User, Product, Transaction,
// Payment, dst) beserta method query database masing-masing - setara
// "models" pada ORM ringan, tapi di sini query SQL ditulis eksplisit
// (bukan lewat ORM) supaya mudah dioptimasi/dibaca.
package models

import "time"

// Merchant mewakili satu toko/tenant. Semua data operasional (users,
// products, transactions, payments) selalu terhubung ke satu merchant, dan
// setiap query di package ini WAJIB di-scope dengan merchant_id supaya satu
// merchant tidak pernah bisa melihat/mengubah data merchant lain.
type Merchant struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Address string  `json:"address"`
	LogoURL *string `json:"logoUrl"`
	Active  bool    `json:"active"`
	// Slug identifies this merchant in the pre-login branded URL
	// (/t/{slug}) - see GetMerchantBranding. Generated once at creation,
	// never editable (changing it would break any login link already
	// shared with staff).
	Slug string `json:"slug"`
}

// MerchantBranding is the PUBLIC, pre-login subset of Merchant exposed at
// /api/public/merchants/branding/{slug} - deliberately excludes address,
// active status, and id, so an unauthenticated visitor can't learn
// anything about a merchant beyond its name/logo.
type MerchantBranding struct {
	Name    string  `json:"name"`
	LogoURL *string `json:"logoUrl"`
}

// Store mewakili satu cabang/outlet fisik dalam satu merchant. Katalog
// produk (nama, harga) dishare semua store dalam satu merchant, tapi
// STOK selalu per-store (lihat ProductStock).
type Store struct {
	ID         string `json:"id"`
	MerchantID string `json:"merchantId"`
	Name       string `json:"name"`
	Address    string `json:"address"`
	Active     bool   `json:"active"`
}

type Role string

const (
	RoleKasir        Role = "kasir"
	RolePPIC         Role = "ppic"
	RoleFinance      Role = "finance"
	RoleAdmin        Role = "admin"
	RoleSuperAdmin   Role = "superadmin"    // lintas-merchant
	RoleStoreManager Role = "store_manager" // terkunci ke 1 store, akses operasional penuh di store itu
)

// User.StoreID kosong ("") untuk role yang lingkupnya bukan 1 store
// (admin, finance, superadmin) - WAJIB diisi untuk kasir/ppic/store_manager.
type User struct {
	ID           string
	MerchantID   string
	StoreID      string
	Username     string
	PasswordHash string
	Name         string
	Role         Role
	Active       bool
}

// Product adalah KATALOG (nama, harga, foto) - level MERCHANT, dishare
// semua store karena harga seragam per keputusan bisnis. Stok TIDAK ada di
// sini lagi - lihat ProductStock.
type Product struct {
	ID       string  `json:"id"`
	SKU      string  `json:"sku"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	Price    float64 `json:"price"`
	ImageURL *string `json:"imageUrl"`
}

// ProductCatalogWithStock adalah bentuk gabungan Product + stok SATU store
// tertentu - inilah yang sebenarnya dikembalikan ke frontend (POS grid,
// halaman Produk & Stok), supaya UI tidak perlu tahu soal pemisahan
// katalog/stok ini sama sekali.
type ProductCatalogWithStock struct {
	ID       string  `json:"id"`
	SKU      string  `json:"sku"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	Price    float64 `json:"price"`
	ImageURL *string `json:"imageUrl"`
	Stock    int     `json:"stock"`
	MinStock int     `json:"minStock"`
}

type TransactionStatus string

const (
	TrxPending TransactionStatus = "pending"
	TrxPaid    TransactionStatus = "paid"
	TrxVoided  TransactionStatus = "voided"
)

type Transaction struct {
	ID        string            `json:"id"`
	StoreID   string            `json:"storeId"`
	InvoiceNo string            `json:"invoiceNo"`
	CashierID string            `json:"cashierId"`
	Total     float64           `json:"total"`
	Status    TransactionStatus `json:"status"`
	CreatedAt time.Time         `json:"createdAt"`
}

type PaymentMethod string

const (
	PaymentCash PaymentMethod = "cash"
	PaymentQRIS PaymentMethod = "qris"
	PaymentEDC  PaymentMethod = "edc"
)

type PaymentStatus string

const (
	PaymentPending PaymentStatus = "pending"
	PaymentPaid    PaymentStatus = "paid"
	PaymentFailed  PaymentStatus = "failed"
)

type Payment struct {
	ID              string
	TransactionID   string
	Method          PaymentMethod
	Amount          float64
	AmountReceived  *float64 // cash tendered by customer - only set for method=cash
	Status          PaymentStatus
	ReferenceNo     string
	GatewayResponse string
	PaidAt          *time.Time
}
