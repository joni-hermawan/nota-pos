package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/mux"

	"nota-pos-backend/internal/models"
)

// TransactionEvents streams payment status updates via Server-Sent Events
// (SSE) - the backend PUSHES "paid"/"failed" the instant it knows, instead
// of the frontend polling in a loop. The connection auto-closes once a
// terminal status (paid/failed) is sent.
//
// Auth: same httpOnly cookie as every other endpoint - the frontend opens
// this with `new EventSource(url, { withCredentials: true })` so the
// browser attaches the cookie automatically. This handler sits behind the
// normal RequireAuth + RequireRole("kasir") middleware chain like any
// other transaction route (see internal/router/router.go).
func (h *Handlers) TransactionEvents(w http.ResponseWriter, r *http.Request) {
	transactionID := mux.Vars(r)["id"]

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	writeEvent := func(status string) {
		b, _ := json.Marshal(map[string]string{"status": status})
		fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
	}

	// Send the current status immediately in case it already resolved
	// before this SSE connection was even opened (e.g. cash, which
	// resolves synchronously in the same request that created it).
	if payment, err := models.GetPaymentByTransactionID(h.DB, transactionID); err == nil {
		writeEvent(string(payment.Status))
		if payment.Status == models.PaymentPaid || payment.Status == models.PaymentFailed {
			return
		}
	}

	updates, unsubscribe := h.Broker.Subscribe(transactionID)
	defer unsubscribe()

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case status, ok := <-updates:
			if !ok {
				return
			}
			writeEvent(status)
			if status == string(models.PaymentPaid) || status == string(models.PaymentFailed) {
				return
			}
		case <-heartbeat.C:
			fmt.Fprint(w, ": keep-alive\n\n")
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}
