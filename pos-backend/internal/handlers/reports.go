package handlers

import (
	"net/http"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/models"
	"nota-pos-backend/internal/utils"
)

// resolveReportStoreID: unlike effectiveStoreID (used for write operations,
// which REQUIRE a store to be picked), reports are allowed to aggregate
// across every store when no store is picked - so this just returns "" in
// that case instead of erroring. store_manager is still hard-locked to
// their own claims.StoreID regardless of what they pass.
func resolveReportStoreID(claims *auth.Claims, requested string) string {
	if claims.StoreID != "" {
		return claims.StoreID
	}
	return requested
}

// Dashboard powers the dashboard page: sales trend, payment method split,
// and top/least selling products - all read straight from the database
// views (scoped to the caller's merchant, and optionally one store), no
// hardcoded data.
func (h *Handlers) Dashboard(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())
	storeID := resolveReportStoreID(claims, r.URL.Query().Get("storeId"))

	trend, err := models.SalesTrend(h.DB, claims.MerchantID, storeID, 7)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	paymentBreakdown, err := models.PaymentMethodBreakdown(h.DB, claims.MerchantID, storeID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	topProducts, err := models.TopProducts(h.DB, claims.MerchantID, storeID, 5)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	leastProducts, err := models.LeastProducts(h.DB, claims.MerchantID, storeID, 5)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Explicit "today" numbers - NOT inferred from the last entry of
	// salesTrend, which would be WRONG (silently showing yesterday's, or
	// whichever day most recently had a sale) whenever today has zero
	// paid transactions so far.
	todayTrxCount, todayRevenue, err := models.TodaySummary(h.DB, claims.MerchantID, storeID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"salesTrend":            trend,
		"paymentBreakdown":      paymentBreakdown,
		"topProducts":           topProducts,
		"leastProducts":         leastProducts,
		"todayTransactionCount": todayTrxCount,
		"todayRevenue":          todayRevenue,
	})
}

// Reconciliation powers the Finance reporting page. Finance's claims.StoreID
// is always empty (finance is merchant-wide by design), so this defaults to
// aggregating every store unless a store_manager is calling it (locked).
func (h *Handlers) Reconciliation(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())
	storeID := resolveReportStoreID(claims, r.URL.Query().Get("storeId"))

	rows, err := models.Reconciliation(h.DB, claims.MerchantID, storeID, 14)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, rows)
}
