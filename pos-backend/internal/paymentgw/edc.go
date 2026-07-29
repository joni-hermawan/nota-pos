package paymentgw

// The backend never talks to the physical EDC device directly - that
// happens through a small local agent app running on the cashier's PC
// (see cmd/edc-agent). Once the agent gets an approved/declined/cancelled
// response from the EDC machine, it POSTs the result here so the backend
// can update the payment + push it to the frontend via SSE.
type EDCCallback struct {
	TransactionID string `json:"transactionId"`
	ApprovalCode  string `json:"approvalCode"`
	ReferenceNo   string `json:"referenceNo"`
	CardType      string `json:"cardType"`
	Approved      bool   `json:"approved"`
	RawResponse   string `json:"rawResponse"`
}

// MidtransNotification is the subset of Midtrans's webhook payload we care
// about. Configure the "Payment Notification URL" in the Midtrans
// dashboard to point at POST /api/payments/qris/webhook so THEY push to
// US, instead of our backend actively polling their API.
type MidtransNotification struct {
	OrderID           string
	TransactionStatus string
	RawBody           string
}
