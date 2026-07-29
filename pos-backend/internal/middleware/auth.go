package middleware

import (
	"database/sql"
	"net/http"
	"strings"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/session"
	"nota-pos-backend/internal/utils"
)

// publicAPIPaths: endpoint /api/* yang boleh diakses TANPA login.
var publicAPIPaths = map[string]bool{
	"/api/auth/login":            true,
	"/api/auth/logout":           true,
	"/api/logs":                  true, // penerima log aktivitas frontend, termasuk sebelum user login
	"/api/payments/edc/webhook":  true, // dipanggil agent EDC lokal
	"/api/payments/qris/webhook": true, // dipanggil gateway pembayaran
}

// RequireAuth mewajibkan cookie JWT yang valid untuk semua request /api/*,
// kecuali yang masuk publicAPIPaths. DITAMBAH pengecekan sesi ke database
// supaya token yang tanda tangannya masih valid tapi sesinya sudah
// di-revoke (logout / dicabut paksa admin) tetap ditolak.
//
// Endpoint SSE (/api/transactions/{id}/events) sengaja TIDAK lewat sini -
// EventSource browser tidak bisa kirim cookie cross-context dengan mudah
// dan tidak bisa kirim header custom sama sekali, jadi endpoint itu
// memverifikasi token secara manual lewat query param (lihat handlers).
func RequireAuth(m *auth.Manager, db *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasPrefix(r.URL.Path, "/api/") {
				next.ServeHTTP(w, r)
				return
			}
			if publicAPIPaths[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}
			// /api/public/* - carve-out for endpoints with a dynamic path
			// segment (e.g. /api/public/merchants/branding/{slug}) that
			// can't be listed in publicAPIPaths as an exact string match.
			if strings.HasPrefix(r.URL.Path, "/api/public/") {
				next.ServeHTTP(w, r)
				return
			}

			token, ok := auth.TokenFromRequest(r)
			if !ok {
				utils.WriteError(w, http.StatusUnauthorized, "Anda belum login, silakan login kembali")
				return
			}

			claims, err := m.Verify(token)
			if err != nil {
				m.ClearCookie(w)
				utils.WriteError(w, http.StatusUnauthorized, "Sesi telah berakhir, silakan login kembali")
				return
			}

			valid, err := session.IsValid(db, claims.SessionID())
			if err != nil {
				utils.WriteError(w, http.StatusInternalServerError, "Gagal memeriksa status sesi")
				return
			}
			if !valid {
				m.ClearCookie(w)
				utils.WriteError(w, http.StatusUnauthorized, "Sesi telah berakhir atau telah dicabut, silakan login kembali")
				return
			}

			next.ServeHTTP(w, auth.WithClaims(r, claims))
		})
	}
}

// RequireRole membatasi endpoint tertentu hanya untuk role yang disebutkan.
// Admin selalu diizinkan di semua endpoint.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := map[string]bool{"admin": true}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := auth.FromContext(r.Context())
			if !ok || !allowed[claims.Role] {
				utils.WriteError(w, http.StatusForbidden, "Anda tidak memiliki akses ke fitur ini")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireSuperAdmin membatasi endpoint HANYA untuk role "superadmin" - beda
// dengan RequireRole, di sini "admin" (admin per-merchant biasa) TIDAK
// otomatis diizinkan. Dipakai khusus untuk manajemen merchant, yang
// merupakan kapabilitas level platform, di atas admin per-toko.
func RequireSuperAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := auth.FromContext(r.Context())
		if !ok || claims.Role != "superadmin" {
			utils.WriteError(w, http.StatusForbidden, "Fitur ini khusus superadmin")
			return
		}
		next.ServeHTTP(w, r)
	})
}
