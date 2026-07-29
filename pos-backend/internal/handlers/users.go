package handlers

import (
	"net/http"

	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/models"
	"nota-pos-backend/internal/utils"
)

// scopeForCaller returns "" for superadmin (no merchant filter - can see/
// edit users across every merchant) or the caller's own merchant_id
// otherwise (per-merchant admin/store_manager, always scoped to their own
// merchant at minimum - store_manager gets an ADDITIONAL store-level check
// on top of this, see storeIsInScope below).
func scopeForCaller(claims *auth.Claims) string {
	if claims.Role == "superadmin" {
		return ""
	}
	return claims.MerchantID
}

// rolesCallerCanAssign: which roles a caller is allowed to create/set on
// someone else. store_manager is deliberately limited to kasir/ppic only -
// they can never create another store_manager or promote anyone to admin.
func rolesCallerCanAssign(callerRole string) map[string]bool {
	if callerRole == "store_manager" {
		return map[string]bool{"kasir": true, "ppic": true}
	}
	return map[string]bool{"kasir": true, "ppic": true, "finance": true, "admin": true, "store_manager": true}
}

// storeIsInScope checks a target user's store against the caller's own
// store when the caller is a store_manager - store_manager must never be
// able to view/edit a user outside their own store, even one in the same
// merchant.
func storeIsInScope(claims *auth.Claims, targetStoreID string) bool {
	if claims.Role != "store_manager" {
		return true
	}
	return targetStoreID == claims.StoreID
}

func (h *Handlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())

	var users []models.UserSummary
	var err error
	switch claims.Role {
	case "superadmin":
		users, err = models.ListAllUsers(h.DB)
	case "store_manager":
		users, err = models.ListUsersByStore(h.DB, claims.StoreID)
	default:
		users, err = models.ListUsersByMerchant(h.DB, claims.MerchantID)
	}
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, users)
}

type createUserRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	MerchantID string `json:"merchantId"` // only honored if the caller is superadmin
	StoreID    string `json:"storeId"`    // required for kasir/ppic/store_manager; ignored for admin/finance
}

// CreateUser adds a new staff account.
//   - store_manager can only create kasir/ppic, and ALWAYS for their own
//     store (storeId in the body is ignored - forced to their own).
//   - admin creates within their own merchant, choosing which store (for
//     kasir/ppic/store_manager) or leaving it store-less (admin/finance).
//   - superadmin can create a user for any merchant + any store within it.
func (h *Handlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())

	var req createUserRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Username == "" || req.Password == "" || req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "Username, password, dan nama wajib diisi")
		return
	}
	if !rolesCallerCanAssign(claims.Role)[req.Role] {
		utils.WriteError(w, http.StatusBadRequest, "Role tidak valid atau tidak diizinkan untuk akun Anda")
		return
	}

	merchantID := claims.MerchantID
	if claims.Role == "superadmin" {
		if req.MerchantID == "" {
			utils.WriteError(w, http.StatusBadRequest, "merchantId wajib diisi oleh superadmin")
			return
		}
		merchantID = req.MerchantID
	}

	storeID := req.StoreID
	if claims.Role == "store_manager" {
		storeID = claims.StoreID // locked - ignore whatever was sent
	}
	storeLockedRoles := map[string]bool{"kasir": true, "ppic": true, "store_manager": true}
	if storeLockedRoles[req.Role] && storeID == "" {
		utils.WriteError(w, http.StatusBadRequest, "storeId wajib diisi untuk role ini")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Gagal mengenkripsi password")
		return
	}

	userID, err := models.CreateUser(h.DB, merchantID, models.UserInput{
		Username: req.Username, PasswordHash: string(hash), Name: req.Name, Role: req.Role, StoreID: storeID,
	})
	if err != nil {
		utils.WriteDBError(w, err, "Username sudah dipakai - gunakan username lain")
		return
	}

	h.Log.LogBackend("USER_CREATED", map[string]interface{}{
		"userId": userID, "username": req.Username, "role": req.Role,
		"merchantId": merchantID, "storeId": storeID, "createdBy": claims.UserID,
	}, "info")

	user, err := models.GetUserSummaryByID(h.DB, userID, scopeForCaller(claims))
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusCreated, user)
}

type updateUserRequest struct {
	Name   string `json:"name"`
	Role   string `json:"role"`
	Active bool   `json:"active"`
}

func (h *Handlers) UpdateUser(w http.ResponseWriter, r *http.Request) {
	userID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	var req updateUserRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !rolesCallerCanAssign(claims.Role)[req.Role] {
		utils.WriteError(w, http.StatusBadRequest, "Role tidak valid atau tidak diizinkan untuk akun Anda")
		return
	}

	// store_manager gets an extra check: the target must already be in
	// THEIR store, not just their merchant.
	existing, err := models.GetUserSummaryByID(h.DB, userID, scopeForCaller(claims))
	if err != nil || !storeIsInScope(claims, existing.StoreID) {
		utils.WriteError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
		return
	}

	if err := models.UpdateUser(h.DB, userID, scopeForCaller(claims), models.UserUpdateInput{
		Name: req.Name, Role: req.Role, Active: req.Active,
	}); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	user, err := models.GetUserSummaryByID(h.DB, userID, scopeForCaller(claims))
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
		return
	}
	utils.WriteJSON(w, http.StatusOK, user)
}

type reassignMerchantRequest struct {
	MerchantID string `json:"merchantId"`
}

// ReassignUserMerchant moves a user to a different merchant - superadmin
// only (enforced via RequireSuperAdmin on the route, not just here, as
// defense in depth). Automatically clears store_id (see model layer).
func (h *Handlers) ReassignUserMerchant(w http.ResponseWriter, r *http.Request) {
	userID := mux.Vars(r)["id"]

	var req reassignMerchantRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.MerchantID == "" {
		utils.WriteError(w, http.StatusBadRequest, "merchantId wajib diisi")
		return
	}
	if err := models.ReassignUserMerchant(h.DB, userID, req.MerchantID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	user, err := models.GetUserSummaryByID(h.DB, userID, "")
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
		return
	}
	utils.WriteJSON(w, http.StatusOK, user)
}

type reassignStoreRequest struct {
	StoreID string `json:"storeId"`
}

// ReassignUserStore moves a kasir/ppic/store_manager to a different store
// WITHIN THE SAME merchant (e.g. admin transfers a kasir from one branch
// to another). Admin-only (RequireRole enforces "admin" - store_manager
// can't move staff between stores since that would let them reach outside
// their own store's boundary).
func (h *Handlers) ReassignUserStore(w http.ResponseWriter, r *http.Request) {
	userID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	var req reassignStoreRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.StoreID == "" {
		utils.WriteError(w, http.StatusBadRequest, "storeId wajib diisi")
		return
	}
	if err := models.ReassignUserStore(h.DB, userID, claims.MerchantID, req.StoreID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	user, err := models.GetUserSummaryByID(h.DB, userID, claims.MerchantID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
		return
	}
	utils.WriteJSON(w, http.StatusOK, user)
}

type resetPasswordRequest struct {
	NewPassword string `json:"newPassword"`
}

func (h *Handlers) ResetUserPassword(w http.ResponseWriter, r *http.Request) {
	userID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	var req resetPasswordRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.NewPassword) < 6 {
		utils.WriteError(w, http.StatusBadRequest, "Password baru minimal 6 karakter")
		return
	}

	existing, err := models.GetUserSummaryByID(h.DB, userID, scopeForCaller(claims))
	if err != nil || !storeIsInScope(claims, existing.StoreID) {
		utils.WriteError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Gagal mengenkripsi password")
		return
	}
	if err := models.ResetUserPassword(h.DB, userID, scopeForCaller(claims), string(hash)); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
