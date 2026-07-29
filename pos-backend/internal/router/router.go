// Package router menyusun seluruh route aplikasi memakai gorilla/mux.
package router

import (
	"database/sql"
	"net/http"

	"github.com/gorilla/mux"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/handlers"
	appMiddleware "nota-pos-backend/internal/middleware"
)

func New(h *handlers.Handlers, authManager *auth.Manager, db *sql.DB, corsAllowedOrigins []string) http.Handler {
	r := mux.NewRouter()

	r.Use(appMiddleware.CORS(corsAllowedOrigins))
	r.Use(appMiddleware.RequestLogger(h.Log))
	r.Use(appMiddleware.RequireAuth(authManager, db))

	api := r.PathPrefix("/api").Subrouter()

	// Public (no login required)
	api.HandleFunc("/auth/login", h.Login).Methods(http.MethodPost)
	api.HandleFunc("/auth/logout", h.Logout).Methods(http.MethodPost)
	api.HandleFunc("/logs", h.Logs).Methods(http.MethodPost)
	api.HandleFunc("/payments/edc/webhook", h.EDCWebhook).Methods(http.MethodPost)
	api.HandleFunc("/payments/qris/webhook", h.QRISWebhook).Methods(http.MethodPost)
	// Branded pre-login screen (/t/{slug} on the frontend) - see
	// GetMerchantBranding and the /api/public/ prefix carve-out in
	// middleware/auth.go.
	api.HandleFunc("/public/merchants/branding/{slug}", h.GetMerchantBranding).Methods(http.MethodGet)

	// Authenticated (RequireAuth middleware above already enforces login;
	// per-route role checks happen via RequireRole wrapping below)
	api.HandleFunc("/auth/me", h.Me).Methods(http.MethodGet)
	api.HandleFunc("/auth/password", h.ChangeOwnPassword).Methods(http.MethodPatch)

	api.Handle("/products",
		appMiddleware.RequireRole("kasir", "ppic", "finance", "store_manager")(http.HandlerFunc(h.ListProducts)),
	).Methods(http.MethodGet)

	api.Handle("/products",
		appMiddleware.RequireRole("ppic", "store_manager")(http.HandlerFunc(h.CreateProduct)),
	).Methods(http.MethodPost)
	api.Handle("/products/{id}",
		appMiddleware.RequireRole("ppic", "store_manager")(http.HandlerFunc(h.UpdateProduct)),
	).Methods(http.MethodPut)
	api.Handle("/products/{id}/stock",
		appMiddleware.RequireRole("ppic", "store_manager")(http.HandlerFunc(h.AdjustStock)),
	).Methods(http.MethodPatch)
	api.Handle("/products/{id}/image",
		appMiddleware.RequireRole("ppic", "store_manager")(http.HandlerFunc(h.UpdateProductImage)),
	).Methods(http.MethodPatch)

	api.Handle("/transactions",
		appMiddleware.RequireRole("kasir", "store_manager")(http.HandlerFunc(h.CreateTransaction)),
	).Methods(http.MethodPost)
	api.Handle("/transactions/pending",
		appMiddleware.RequireRole("kasir", "store_manager")(http.HandlerFunc(h.ListPendingTransactions)),
	).Methods(http.MethodGet)
	api.Handle("/transactions/history",
		appMiddleware.RequireRole("kasir", "store_manager", "finance")(http.HandlerFunc(h.ListTransactionHistory)),
	).Methods(http.MethodGet)
	api.Handle("/transactions/{id}/detail",
		appMiddleware.RequireRole("kasir", "store_manager", "finance")(http.HandlerFunc(h.GetTransactionDetail)),
	).Methods(http.MethodGet)
	api.Handle("/transactions/{id}/pay",
		appMiddleware.RequireRole("kasir", "store_manager")(http.HandlerFunc(h.Pay)),
	).Methods(http.MethodPost)
	api.Handle("/transactions/{id}/void",
		appMiddleware.RequireRole("kasir", "store_manager")(http.HandlerFunc(h.VoidTransaction)),
	).Methods(http.MethodPost)
	api.Handle("/transactions/{id}/events",
		appMiddleware.RequireRole("kasir", "store_manager")(http.HandlerFunc(h.TransactionEvents)),
	).Methods(http.MethodGet)
	api.Handle("/transactions/{id}/qris-status",
		appMiddleware.RequireRole("kasir", "store_manager")(http.HandlerFunc(h.CheckQRISStatus)),
	).Methods(http.MethodGet)

	api.Handle("/reports/dashboard",
		appMiddleware.RequireRole("admin", "store_manager")(http.HandlerFunc(h.Dashboard)),
	).Methods(http.MethodGet)
	api.Handle("/reports/reconciliation",
		appMiddleware.RequireRole("finance", "store_manager")(http.HandlerFunc(h.Reconciliation)),
	).Methods(http.MethodGet)

	// Store management - admin (owner) only. store_manager does NOT get
	// this - they operate within a store, they don't create/edit branches.
	api.Handle("/stores", appMiddleware.RequireRole("admin", "store_manager")(http.HandlerFunc(h.ListStores))).Methods(http.MethodGet)
	api.Handle("/stores", appMiddleware.RequireRole("admin")(http.HandlerFunc(h.CreateStore))).Methods(http.MethodPost)
	api.Handle("/stores/{id}", appMiddleware.RequireRole("admin")(http.HandlerFunc(h.UpdateStore))).Methods(http.MethodPut)
	api.Handle("/stores/{id}/active", appMiddleware.RequireRole("admin")(http.HandlerFunc(h.SetStoreActive))).Methods(http.MethodPatch)

	// Self-service branding - "admin" (owner) can edit their OWN merchant's
	// name/address/logo without needing superadmin. Registered BEFORE
	// /merchants/{id} below - gorilla/mux matches in registration order,
	// and {id} would otherwise greedily match the literal "me" segment.
	api.Handle("/merchants/me", appMiddleware.RequireRole("admin")(http.HandlerFunc(h.GetMyMerchant))).Methods(http.MethodGet)
	api.Handle("/merchants/me", appMiddleware.RequireRole("admin")(http.HandlerFunc(h.UpdateMyMerchant))).Methods(http.MethodPut)
	api.Handle("/merchants/me/logo", appMiddleware.RequireRole("admin")(http.HandlerFunc(h.UpdateMyMerchantLogo))).Methods(http.MethodPatch)

	// Merchant management - superadmin ONLY (platform-level, not a
	// per-merchant admin capability - RequireRole always lets "admin"
	// through, so RequireSuperAdmin is used here instead).
	api.Handle("/merchants", appMiddleware.RequireSuperAdmin(http.HandlerFunc(h.ListMerchants))).Methods(http.MethodGet)
	api.Handle("/merchants", appMiddleware.RequireSuperAdmin(http.HandlerFunc(h.CreateMerchant))).Methods(http.MethodPost)
	api.Handle("/merchants/{id}", appMiddleware.RequireSuperAdmin(http.HandlerFunc(h.UpdateMerchant))).Methods(http.MethodPut)
	api.Handle("/merchants/{id}/active", appMiddleware.RequireSuperAdmin(http.HandlerFunc(h.SetMerchantActive))).Methods(http.MethodPatch)

	// Superadmin platform-wide monitoring dashboard.
	api.Handle("/superadmin/dashboard", appMiddleware.RequireSuperAdmin(http.HandlerFunc(h.PlatformDashboard))).Methods(http.MethodGet)

	// User management - "admin" manages their own merchant's staff;
	// "store_manager" manages only kasir/ppic within their own store (see
	// handlers/users.go for the actual scoping logic); superadmin manages
	// everyone everywhere.
	api.Handle("/users", appMiddleware.RequireRole("superadmin", "store_manager")(http.HandlerFunc(h.ListUsers))).Methods(http.MethodGet)
	api.Handle("/users", appMiddleware.RequireRole("superadmin", "store_manager")(http.HandlerFunc(h.CreateUser))).Methods(http.MethodPost)
	api.Handle("/users/{id}", appMiddleware.RequireRole("superadmin", "store_manager")(http.HandlerFunc(h.UpdateUser))).Methods(http.MethodPut)
	api.Handle("/users/{id}/password", appMiddleware.RequireRole("superadmin", "store_manager")(http.HandlerFunc(h.ResetUserPassword))).Methods(http.MethodPatch)
	// Moving a user to a DIFFERENT merchant is superadmin-only.
	api.Handle("/users/{id}/merchant", appMiddleware.RequireSuperAdmin(http.HandlerFunc(h.ReassignUserMerchant))).Methods(http.MethodPatch)
	// Moving a user to a different STORE (same merchant) is admin-only -
	// store_manager can't transfer staff between stores (that would let
	// them reach outside their own store's boundary).
	api.Handle("/users/{id}/store", appMiddleware.RequireRole("admin")(http.HandlerFunc(h.ReassignUserStore))).Methods(http.MethodPatch)

	return r
}
