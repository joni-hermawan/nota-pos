package handlers

import (
	"net/http"

	"github.com/gorilla/mux"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/models"
	"nota-pos-backend/internal/utils"
)

func (h *Handlers) ListStores(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())
	stores, err := models.ListStoresByMerchant(h.DB, claims.MerchantID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, stores)
}

type storeFormRequest struct {
	Name    string `json:"name"`
	Address string `json:"address"`
}

func (h *Handlers) CreateStore(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())

	var req storeFormRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "Nama store wajib diisi")
		return
	}

	store, err := models.CreateStore(h.DB, claims.MerchantID, models.StoreInput{Name: req.Name, Address: req.Address})
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.Log.LogBackend("STORE_CREATED", map[string]interface{}{"storeId": store.ID, "name": store.Name, "merchantId": claims.MerchantID}, "info")
	utils.WriteJSON(w, http.StatusCreated, store)
}

func (h *Handlers) UpdateStore(w http.ResponseWriter, r *http.Request) {
	storeID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	var req storeFormRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	store, err := models.UpdateStore(h.DB, storeID, claims.MerchantID, models.StoreInput{Name: req.Name, Address: req.Address})
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, store)
}

type storeActiveRequest struct {
	Active bool `json:"active"`
}

func (h *Handlers) SetStoreActive(w http.ResponseWriter, r *http.Request) {
	storeID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	var req storeActiveRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := models.SetStoreActive(h.DB, storeID, claims.MerchantID, req.Active); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
