package handlers

import (
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/models"
	"nota-pos-backend/internal/session"
	"nota-pos-backend/internal/utils"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Login verifies credentials, creates a revocable session row in the DB,
// signs a JWT carrying that session's ID as "jti", and sets it as an
// httpOnly cookie - the frontend never touches the token directly.
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Request tidak valid")
		return
	}

	h.Log.LogBackend("LOGIN_ATTEMPT", map[string]interface{}{"username": req.Username}, "info")

	user, err := models.GetUserByUsername(h.DB, req.Username)
	if err != nil {
		h.Log.LogBackend("LOGIN_FAILED", map[string]interface{}{"username": req.Username, "reason": "user not found"}, "warn")
		utils.WriteError(w, http.StatusUnauthorized, "Username atau password salah")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		h.Log.LogBackend("LOGIN_FAILED", map[string]interface{}{"username": req.Username, "reason": "password mismatch"}, "warn")
		utils.WriteError(w, http.StatusUnauthorized, "Username atau password salah")
		return
	}

	sessionID, err := session.Create(h.DB, user.ID, time.Now().Add(h.Auth.ExpiresIn()))
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Gagal membuat sesi")
		return
	}

	token, err := h.Auth.Sign(user.ID, user.MerchantID, user.StoreID, user.Username, user.Name, string(user.Role), sessionID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Gagal membuat token")
		return
	}

	h.Auth.SetCookie(w, token)
	h.Log.LogBackend("LOGIN_SUCCESS", map[string]interface{}{"username": req.Username, "role": user.Role, "merchantId": user.MerchantID, "storeId": user.StoreID}, "info")

	merchant, err := models.GetMerchantByID(h.DB, user.MerchantID)
	merchantName, merchantAddress, merchantLogoURL, merchantSlug := "", "", "", ""
	if err == nil {
		merchantName = merchant.Name
		merchantAddress = merchant.Address
		merchantSlug = merchant.Slug
		if merchant.LogoURL != nil {
			merchantLogoURL = *merchant.LogoURL
		}
	}

	storeName, storeAddress := "", ""
	if user.StoreID != "" {
		if store, err := models.GetStoreByID(h.DB, user.StoreID, user.MerchantID); err == nil {
			storeName = store.Name
			storeAddress = store.Address
		}
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"id": user.ID, "username": user.Username, "name": user.Name, "role": user.Role,
		"merchantId": user.MerchantID, "merchantName": merchantName, "merchantAddress": merchantAddress, "merchantLogoUrl": merchantLogoURL, "merchantSlug": merchantSlug,
		"storeId": user.StoreID, "storeName": storeName, "storeAddress": storeAddress,
	})
}

// Logout revokes the current session (so the token can never be reused
// even if someone captured it) and clears the cookie.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	if token, ok := auth.TokenFromRequest(r); ok {
		if claims, err := h.Auth.Verify(token); err == nil {
			_ = session.Revoke(h.DB, claims.SessionID())
		}
	}
	h.Auth.ClearCookie(w)
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Me returns the current logged-in user's profile, read from the verified
// JWT claims already attached to the request context by middleware.RequireAuth.
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.FromContext(r.Context())
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "Belum login")
		return
	}

	merchant, err := models.GetMerchantByID(h.DB, claims.MerchantID)
	merchantName, merchantAddress, merchantLogoURL, merchantSlug := "", "", "", ""
	if err == nil {
		merchantName = merchant.Name
		merchantAddress = merchant.Address
		merchantSlug = merchant.Slug
		if merchant.LogoURL != nil {
			merchantLogoURL = *merchant.LogoURL
		}
	}

	storeName, storeAddress := "", ""
	if claims.StoreID != "" {
		if store, err := models.GetStoreByID(h.DB, claims.StoreID, claims.MerchantID); err == nil {
			storeName = store.Name
			storeAddress = store.Address
		}
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"id": claims.UserID, "username": claims.Username, "name": claims.Name, "role": claims.Role,
		"merchantId": claims.MerchantID, "merchantName": merchantName, "merchantAddress": merchantAddress, "merchantLogoUrl": merchantLogoURL, "merchantSlug": merchantSlug,
		"storeId": claims.StoreID, "storeName": storeName, "storeAddress": storeAddress,
	})
}

type changeOwnPasswordRequest struct {
	OldPassword string `json:"oldPassword"`
	NewPassword string `json:"newPassword"`
}

// ChangeOwnPassword lets ANY logged-in user (any role) change their OWN
// password by proving they know the current one - distinct from
// ResetUserPassword, which is an admin/superadmin action on SOMEONE ELSE's
// account that doesn't require knowing the old password.
func (h *Handlers) ChangeOwnPassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.FromContext(r.Context())
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "Belum login")
		return
	}

	var req changeOwnPasswordRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.NewPassword) < 6 {
		utils.WriteError(w, http.StatusBadRequest, "Password baru minimal 6 karakter")
		return
	}

	user, err := models.GetUserByID(h.DB, claims.UserID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Gagal memuat akun")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword)); err != nil {
		utils.WriteError(w, http.StatusUnauthorized, "Password lama tidak cocok")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Gagal mengenkripsi password")
		return
	}
	if err := models.ResetUserPassword(h.DB, claims.UserID, "", string(hash)); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.Log.LogBackend("PASSWORD_CHANGED", map[string]interface{}{"userId": claims.UserID}, "info")
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
