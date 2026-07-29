package handlers

import (
	"net/http"

	"nota-pos-backend/internal/models"
	"nota-pos-backend/internal/utils"
)

// stuckPendingThresholdMinutes: a transaction still 'pending' longer than
// this is flagged as likely abandoned/stuck (EDC callback lost, customer
// walked away mid-QRIS-scan, etc). 10 minutes comfortably exceeds every
// normal payment flow.
const stuckPendingThresholdMinutes = 10

// PlatformDashboard powers the superadmin's platform-wide monitoring page:
// merchant/store counts, today's transaction volume, and - most
// importantly - visibility into errors: failed payments and stuck/pending
// transactions across EVERY merchant.
func (h *Handlers) PlatformDashboard(w http.ResponseWriter, r *http.Request) {
	merchantTotal, merchantActive, storeTotal, storeActive, err := models.PlatformMerchantCounts(h.DB)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	trxCount, revenue, failedCount, err := models.PlatformTodaySummary(h.DB)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	health, err := models.MerchantHealthBreakdown(h.DB)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	recentFailed, err := models.RecentFailedTransactions(h.DB, 20)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	stuckPending, err := models.StuckPendingTransactions(h.DB, stuckPendingThresholdMinutes, 20)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	utils.WriteJSON(w, http.StatusOK, models.PlatformDashboard{
		MerchantCount:         merchantTotal,
		ActiveMerchantCount:   merchantActive,
		StoreCount:            storeTotal,
		ActiveStoreCount:      storeActive,
		TodayTransactionCount: trxCount,
		TodayRevenue:          revenue,
		TodayFailedCount:      failedCount,
		MerchantHealth:        health,
		RecentFailed:          recentFailed,
		StuckPending:          stuckPending,
	})
}
