// Package auth memusatkan seluruh logika JWT: menerbitkan token, verifikasi,
// dan baca/tulis/hapus cookie httpOnly tempat token disimpan. Cookie
// httpOnly dipilih (bukan Authorization header) supaya token tidak bisa
// dibaca lewat JavaScript di browser sama sekali - mengurangi risiko XSS
// mencuri sesi kasir.
package auth

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// CookieName nama cookie tempat token disimpan.
const CookieName = "nota_pos_token"

type ctxKey struct{}

// Claims adalah isi payload JWT. Field "jti" (RegisteredClaims.ID) dipakai
// sebagai ID sesi di tabel user_sessions (lihat internal/session), supaya
// satu JWT bisa ditautkan ke satu baris sesi yang bisa di-revoke.
//
// StoreID kosong ("") untuk role yang lingkupnya bukan 1 store (admin,
// finance, superadmin) - WAJIB diisi untuk kasir/ppic/store_manager.
type Claims struct {
	UserID     string `json:"id"`
	MerchantID string `json:"merchantId"`
	StoreID    string `json:"storeId"`
	Username   string `json:"username"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	jwt.RegisteredClaims
}

func (c *Claims) SessionID() string {
	return c.RegisteredClaims.ID
}

type Manager struct {
	secret       []byte
	expiresIn    time.Duration
	cookieMaxAge time.Duration
	cookieSecure bool
}

func NewManager(secret string, expiresIn, cookieMaxAge time.Duration, cookieSecure bool) *Manager {
	return &Manager{secret: []byte(secret), expiresIn: expiresIn, cookieMaxAge: cookieMaxAge, cookieSecure: cookieSecure}
}

// Sign menerbitkan JWT baru untuk user yang berhasil login, ditambah klaim
// "jti" (sessionID) yang harus sama persis dengan ID yang dicatat lewat
// session.Create() - ini yang menautkan satu JWT ke satu baris sesi.
func (m *Manager) Sign(userID, merchantID, storeID, username, name, role, sessionID string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID, MerchantID: merchantID, StoreID: storeID, Username: username, Name: name, Role: role,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        sessionID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.expiresIn)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

func (m *Manager) ExpiresIn() time.Duration { return m.expiresIn }

func (m *Manager) Verify(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("metode signing token tidak dikenal")
		}
		return m.secret, nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("token tidak valid atau sudah kadaluarsa")
	}
	return claims, nil
}

func (m *Manager) SetCookie(w http.ResponseWriter, tokenStr string) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: tokenStr, Path: "/",
		HttpOnly: true, Secure: m.cookieSecure, SameSite: http.SameSiteLaxMode,
		MaxAge: int(m.cookieMaxAge.Seconds()),
	})
}

func (m *Manager) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: "", Path: "/",
		HttpOnly: true, Secure: m.cookieSecure, SameSite: http.SameSiteLaxMode,
		MaxAge: -1,
	})
}

func TokenFromRequest(r *http.Request) (string, bool) {
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return "", false
	}
	return c.Value, true
}

func WithClaims(r *http.Request, c *Claims) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), ctxKey{}, c))
}

func FromContext(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(ctxKey{}).(*Claims)
	return c, ok
}
