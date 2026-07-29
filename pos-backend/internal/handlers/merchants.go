package handlers

import (
	"net/http"

	"github.com/gorilla/mux"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/models"
	"nota-pos-backend/internal/utils"
)

// GetMerchantBranding is PUBLIC (no login required, see publicAPIPaths /
// router.go) - it's what powers the branded login screen at /t/{slug},
// which by definition runs before anyone is authenticated. Only exposes
// name + logo, never id/address/active (see MerchantBranding).
func (h *Handlers) GetMerchantBranding(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]
	branding, err := models.GetMerchantBranding(h.DB, slug)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Toko tidak ditemukan")
		return
	}
	utils.WriteJSON(w, http.StatusOK, branding)
}

func (h *Handlers) ListMerchants(w http.ResponseWriter, r *http.Request) {
	merchants, err := models.ListMerchants(h.DB)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, merchants)
}

type merchantFormRequest struct {
	Name    string `json:"name"`
	Address string `json:"address"`
}

func (h *Handlers) CreateMerchant(w http.ResponseWriter, r *http.Request) {
	var req merchantFormRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "Nama toko wajib diisi")
		return
	}

	merchant, err := models.CreateMerchant(h.DB, models.MerchantInput{Name: req.Name, Address: req.Address})
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.Log.LogBackend("MERCHANT_CREATED", map[string]interface{}{"merchantId": merchant.ID, "name": merchant.Name}, "info")
	utils.WriteJSON(w, http.StatusCreated, merchant)
}

func (h *Handlers) UpdateMerchant(w http.ResponseWriter, r *http.Request) {
	merchantID := mux.Vars(r)["id"]

	var req merchantFormRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	merchant, err := models.UpdateMerchant(h.DB, merchantID, models.MerchantInput{Name: req.Name, Address: req.Address})
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, merchant)
}

type merchantActiveRequest struct {
	Active bool `json:"active"`
}

func (h *Handlers) SetMerchantActive(w http.ResponseWriter, r *http.Request) {
	merchantID := mux.Vars(r)["id"]

	var req merchantActiveRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := models.SetMerchantActive(h.DB, merchantID, req.Active); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GetMyMerchant returns the caller's own merchant profile - used by the
// Branding page to show current name/address/logo without needing
// superadmin access.
func (h *Handlers) GetMyMerchant(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())
	merchant, err := models.GetMerchantByID(h.DB, claims.MerchantID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Merchant tidak ditemukan")
		return
	}
	utils.WriteJSON(w, http.StatusOK, merchant)
}

// UpdateMyMerchant lets an "admin" (owner) self-service edit their OWN
// merchant's name/address - this is the multi-tenant "branding" story:
// every merchant sees their OWN identity everywhere (Sidebar, receipts),
// not a hardcoded demo name. Deliberately separate from
// UpdateMerchant/CreateMerchant (superadmin-only, platform-level) - an
// admin can never touch another merchant's data through this route since
// it always targets claims.MerchantID, never an {id} from the URL.
func (h *Handlers) UpdateMyMerchant(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())

	var req merchantFormRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "Nama toko wajib diisi")
		return
	}

	merchant, err := models.UpdateMerchant(h.DB, claims.MerchantID, models.MerchantInput{Name: req.Name, Address: req.Address})
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, merchant)
}

type merchantLogoRequest struct {
	LogoURL string `json:"logoUrl"`
}

func (h *Handlers) UpdateMyMerchantLogo(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())

	var req merchantLogoRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	merchant, err := models.UpdateMerchantLogo(h.DB, claims.MerchantID, req.LogoURL)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, merchant)
}
