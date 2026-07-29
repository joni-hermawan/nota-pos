package handlers

import (
	"net/http"
	"strconv"

	"github.com/gorilla/mux"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/models"
	"nota-pos-backend/internal/utils"
)

// ListTransactionHistory powers "Riwayat Transaksi" - kasir/store_manager
// are locked to their own store (via resolveReportStoreID, same helper
// reports.go uses); admin/finance can view aggregated across all stores or
// filter to one via ?storeId=.
func (h *Handlers) ListTransactionHistory(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())
	storeID := resolveReportStoreID(claims, r.URL.Query().Get("storeId"))

	days := 30
	if raw := r.URL.Query().Get("days"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			days = parsed
		}
	}

	rows, err := models.ListTransactionHistory(h.DB, claims.MerchantID, storeID, days)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, rows)
}

// GetTransactionDetail returns everything needed to show/reprint a
// receipt for one past transaction.
func (h *Handlers) GetTransactionDetail(w http.ResponseWriter, r *http.Request) {
	transactionID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	detail, err := models.GetTransactionDetail(h.DB, transactionID, claims.MerchantID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Transaksi tidak ditemukan")
		return
	}
	utils.WriteJSON(w, http.StatusOK, detail)
}
