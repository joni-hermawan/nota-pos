package models

import (
	"database/sql"

	"github.com/google/uuid"
)

// CreatePayment inserts a new payment row. Cash payments are created
// already-'paid' (no gateway round-trip), so paid_at is stamped right here
// when that's the case - otherwise it's left NULL and set later by
// UpdatePaymentStatus once the QRIS/EDC gateway confirms.
func CreatePayment(db *sql.DB, p Payment) (string, error) {
	id := uuid.NewString()
	_, err := db.Exec(
		`INSERT INTO payments (id, transaction_id, method, amount, amount_received, status, reference_no, gateway_response, paid_at)
		 VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, CASE WHEN @p6 = 'paid' THEN SYSUTCDATETIME() ELSE NULL END)`,
		id, p.TransactionID, p.Method, p.Amount, p.AmountReceived, p.Status, p.ReferenceNo, p.GatewayResponse,
	)
	return id, err
}

func UpdatePaymentStatus(db *sql.DB, id string, status PaymentStatus, gatewayResponse string) error {
	_, err := db.Exec(
		`UPDATE payments SET status = @p1, gateway_response = @p2,
		 paid_at = CASE WHEN @p1 = 'paid' THEN SYSUTCDATETIME() ELSE paid_at END
		 WHERE id = @p3`,
		status, gatewayResponse, id,
	)
	return err
}

func GetPaymentByTransactionID(db *sql.DB, transactionID string) (*Payment, error) {
	var p Payment
	err := db.QueryRow(
		`SELECT TOP 1 CAST(id AS NVARCHAR(36)), CAST(transaction_id AS NVARCHAR(36)),
		        method, amount, amount_received, status, ISNULL(reference_no,''), ISNULL(gateway_response,''), paid_at
		 FROM payments WHERE transaction_id = @p1 ORDER BY paid_at DESC`, transactionID,
	).Scan(&p.ID, &p.TransactionID, &p.Method, &p.Amount, &p.AmountReceived, &p.Status, &p.ReferenceNo, &p.GatewayResponse, &p.PaidAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}
