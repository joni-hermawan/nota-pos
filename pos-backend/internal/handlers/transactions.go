package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/mux"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/models"
	"nota-pos-backend/internal/utils"
)

type cartItemInput struct {
	ProductID string `json:"productId"`
	Qty       int    `json:"qty"`
}

type createTransactionRequest struct {
	Items []cartItemInput `json:"items"`
}

// ListPendingTransactions powers the "Pembayaran" page - orders already
// created (via CreateTransaction, "Kasir" page) but not paid yet. This is
// what makes order-taking and payment-collection separate steps: any
// cashier/store_manager at this store can see the list and pick which one
// to collect payment for, instead of payment being forced immediately
// after building the cart.
func (h *Handlers) ListPendingTransactions(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())
	if claims.StoreID == "" {
		utils.WriteError(w, http.StatusBadRequest, "Akun ini tidak terikat ke satu store")
		return
	}
	pending, err := models.ListPendingTransactions(h.DB, claims.MerchantID, claims.StoreID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, pending)
}

// CreateTransaction is called by the kasir POS screen when "Bayar" is
// pressed, before a payment method has been chosen. Stock is reserved
// (decremented) immediately, AT THE CASHIER'S OWN STORE, so two cashiers
// at the same store can't oversell the same item.
func (h *Handlers) CreateTransaction(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())
	cashierID, merchantID, storeID := "", "", ""
	if claims != nil {
		cashierID = claims.UserID
		merchantID = claims.MerchantID
		storeID = claims.StoreID
	}
	if storeID == "" {
		utils.WriteError(w, http.StatusBadRequest, "Akun ini tidak terikat ke satu store - transaksi kasir wajib dari akun yang punya store")
		return
	}

	var req createTransactionRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.Items) == 0 {
		utils.WriteError(w, http.StatusBadRequest, "Keranjang kosong")
		return
	}

	productMap := make(map[string]models.ProductCatalogWithStock)
	items := make([]models.TrxItemInput, 0, len(req.Items))
	for _, item := range req.Items {
		p, err := models.GetProductForStore(h.DB, item.ProductID, merchantID, storeID)
		if err != nil {
			utils.WriteError(w, http.StatusBadRequest, fmt.Sprintf("Produk %s tidak ditemukan", item.ProductID))
			return
		}
		if p.Stock < item.Qty {
			utils.WriteError(w, http.StatusBadRequest, fmt.Sprintf("Stok %s tidak cukup (tersedia %d)", p.Name, p.Stock))
			return
		}
		productMap[item.ProductID] = *p
		items = append(items, models.TrxItemInput{ProductID: item.ProductID, Qty: item.Qty})
	}

	trx, err := models.CreateTransaction(r.Context(), h.DB, merchantID, storeID, cashierID, items, productMap)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.Log.LogBackend("TRANSACTION_CREATED", map[string]interface{}{
		"transactionId": trx.ID, "invoiceNo": trx.InvoiceNo, "total": trx.Total, "cashierId": cashierID,
		"merchantId": merchantID, "storeId": storeID,
	}, "info")

	utils.WriteJSON(w, http.StatusCreated, map[string]interface{}{"id": trx.ID, "total": trx.Total, "invoiceNo": trx.InvoiceNo})
}

type payRequest struct {
	Method         string  `json:"method"`
	AmountReceived float64 `json:"amountReceived"`
}

func (h *Handlers) Pay(w http.ResponseWriter, r *http.Request) {
	transactionID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	var req payRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	trx, err := models.GetTransactionByID(h.DB, transactionID, claims.MerchantID)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Transaksi tidak ditemukan")
		return
	}

	switch models.PaymentMethod(req.Method) {
	case models.PaymentCash:
		if req.AmountReceived < trx.Total {
			utils.WriteError(w, http.StatusBadRequest, "Uang diterima kurang dari total tagihan")
			return
		}
		amountReceived := req.AmountReceived
		paymentID, err := models.CreatePayment(h.DB, models.Payment{
			TransactionID: transactionID, Method: models.PaymentCash, Amount: trx.Total, AmountReceived: &amountReceived, Status: models.PaymentPaid,
		})
		if err != nil {
			utils.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := models.MarkTransactionPaid(h.DB, transactionID); err != nil {
			utils.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		h.Broker.Publish(transactionID, string(models.PaymentPaid))
		utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"paymentId": paymentID, "status": models.PaymentPaid})
		return

	case models.PaymentQRIS:
		charge, err := h.QRIS.CreateCharge(r.Context(), transactionID, trx.Total)
		if err != nil {
			utils.WriteError(w, http.StatusBadRequest, "Gagal membuat kode QRIS: "+err.Error())
			return
		}
		paymentID, err := models.CreatePayment(h.DB, models.Payment{
			TransactionID: transactionID, Method: models.PaymentQRIS, Amount: trx.Total,
			Status: models.PaymentPending, ReferenceNo: charge.ReferenceNo, GatewayResponse: charge.RawResponse,
		})
		if err != nil {
			utils.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		// Resolution comes from Midtrans calling QRISWebhook below - NOT
		// from the frontend polling us.
		utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
			"paymentId": paymentID, "status": models.PaymentPending, "qrImageUrl": charge.QRImageURL,
			"qrExpiresAt": charge.ExpiresAt.Format(time.RFC3339),
		})
		return

	case models.PaymentEDC:
		// The actual charge is initiated by the frontend calling the local
		// EDC agent directly. This just records a pending payment row,
		// which gets flipped to paid/failed - and pushed via SSE - by
		// EDCWebhook once the agent reports back.
		paymentID, err := models.CreatePayment(h.DB, models.Payment{
			TransactionID: transactionID, Method: models.PaymentEDC, Amount: trx.Total, Status: models.PaymentPending,
		})
		if err != nil {
			utils.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"paymentId": paymentID, "status": models.PaymentPending})
		return
	}

	utils.WriteError(w, http.StatusBadRequest, "Metode pembayaran tidak dikenal")
}

// VoidTransaction cancels a still-pending transaction (e.g. cashier hits
// "Kembali ke keranjang" on the payment screen) - restores the reserved
// stock and marks the transaction 'voided', so an abandoned checkout never
// leaves stock silently short.
func (h *Handlers) VoidTransaction(w http.ResponseWriter, r *http.Request) {
	transactionID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	if err := models.VoidTransaction(r.Context(), h.DB, transactionID, claims.MerchantID, claims.UserID); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Transaksi tidak ditemukan atau sudah tidak berstatus pending")
		return
	}

	h.Log.LogBackend("TRANSACTION_VOIDED", map[string]interface{}{
		"transactionId": transactionID, "voidedBy": claims.UserID, "merchantId": claims.MerchantID,
	}, "info")

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "voided"})
}
