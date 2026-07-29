package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gorilla/mux"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/models"
	"nota-pos-backend/internal/paymentgw"
	"nota-pos-backend/internal/utils"
)

// EDCWebhook receives the result from the local EDC agent after it talks
// to the physical machine (approved, declined, or cancelled). Not exposed
// to the cashier's browser directly - called server-to-server by the agent.
func (h *Handlers) EDCWebhook(w http.ResponseWriter, r *http.Request) {
	var cb paymentgw.EDCCallback
	if err := utils.DecodeJSON(r, &cb); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	payment, err := models.GetPaymentByTransactionID(h.DB, cb.TransactionID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Payment not found")
		return
	}

	status := models.PaymentFailed
	if cb.Approved {
		status = models.PaymentPaid
	}

	if err := models.UpdatePaymentStatus(h.DB, payment.ID, status, cb.RawResponse); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if status == models.PaymentPaid {
		if err := models.MarkTransactionPaid(h.DB, cb.TransactionID); err != nil {
			utils.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	h.Log.LogBackend("EDC_CALLBACK", map[string]interface{}{
		"transactionId": cb.TransactionID, "approved": cb.Approved, "approvalCode": cb.ApprovalCode,
	}, "info")

	// Push immediately - whether approved, declined by the bank, or
	// cancelled on the terminal, the frontend needs to know right away.
	h.Broker.Publish(cb.TransactionID, string(status))
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// QRISWebhook receives Midtrans's (or equivalent gateway's) payment
// notification callback. Configure this URL as the "Payment Notification
// URL" in the gateway dashboard so THEY push to US the moment a QRIS
// payment settles/fails, instead of us polling their API.
//
// IMPORTANT for local development: Midtrans can only call this URL if it's
// PUBLICLY reachable from the internet - "http://localhost:8080/..." is
// NOT reachable by Midtrans's servers at all, so this webhook will simply
// never fire while developing locally without a tunnel (ngrok, Cloudflare
// Tunnel, etc). See CheckQRISStatus below for the manual fallback used in
// that situation (the "Cek Status" button on the QRIS screen).
func (h *Handlers) QRISWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var payload struct {
		OrderID           string `json:"order_id"`
		TransactionStatus string `json:"transaction_status"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.applyQRISStatus(payload.OrderID, payload.TransactionStatus, string(body)); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// CheckQRISStatus is the MANUAL fallback for QRISWebhook - it actively
// calls Midtrans's Get Status API instead of waiting for their webhook.
// This is what the frontend's "Cek Status" button calls, primarily useful
// when running locally (webhook can't reach localhost) or if a
// notification genuinely got lost.
func (h *Handlers) CheckQRISStatus(w http.ResponseWriter, r *http.Request) {
	transactionID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	// Confirm the transaction belongs to this caller's merchant before
	// reaching out to the gateway - same isolation guarantee as every
	// other transaction endpoint.
	if _, err := models.GetTransactionByID(h.DB, transactionID, claims.MerchantID); err != nil {
		utils.WriteError(w, http.StatusNotFound, "Transaksi tidak ditemukan")
		return
	}

	gatewayStatus, raw, err := h.QRIS.CheckStatus(r.Context(), transactionID)
	if err != nil {
		utils.WriteError(w, http.StatusBadGateway, "Gagal menghubungi payment gateway: "+err.Error())
		return
	}

	if err := h.applyQRISStatus(transactionID, gatewayStatus, raw); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	payment, err := models.GetPaymentByTransactionID(h.DB, transactionID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Pembayaran tidak ditemukan")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": string(payment.Status), "gatewayStatus": gatewayStatus})
}

// applyQRISStatus maps a raw Midtrans transaction_status to our own
// PaymentStatus, persists it, marks the transaction paid if settled, and
// pushes the result via SSE - shared by both the webhook and the manual
// "Cek Status" check so the two paths can never drift out of sync.
func (h *Handlers) applyQRISStatus(transactionID, gatewayStatus, rawResponse string) error {
	paid := gatewayStatus == "settlement" || gatewayStatus == "capture"
	failed := gatewayStatus == "deny" || gatewayStatus == "cancel" ||
		gatewayStatus == "expire" || gatewayStatus == "failure"

	if !paid && !failed {
		return nil // still "pending" (or an unrecognized status) from the gateway - nothing resolved yet
	}

	payment, err := models.GetPaymentByTransactionID(h.DB, transactionID)
	if err != nil {
		return err
	}

	status := models.PaymentFailed
	if paid {
		status = models.PaymentPaid
	}

	// Don't redo work (or re-publish) if this status was already applied -
	// e.g. the webhook already resolved it before the manual check ran.
	if payment.Status == status {
		return nil
	}

	if err := models.UpdatePaymentStatus(h.DB, payment.ID, status, rawResponse); err != nil {
		return err
	}
	if status == models.PaymentPaid {
		if err := models.MarkTransactionPaid(h.DB, transactionID); err != nil {
			return err
		}
	}

	h.Broker.Publish(transactionID, string(status))
	return nil
}
