package models

import "database/sql"

type TransactionHistoryRow struct {
	ID          string  `json:"id"`
	InvoiceNo   string  `json:"invoiceNo"`
	Total       float64 `json:"total"`
	Status      string  `json:"status"`
	Method      string  `json:"method"`
	CashierName string  `json:"cashierName"`
	CreatedAt   string  `json:"createdAt"`
	ItemCount   int     `json:"itemCount"`
}

// ListTransactionHistory returns paid/voided transactions from the last N
// days - this is what powers "Riwayat Transaksi", including reprinting a
// receipt for a transaction whose original print was lost (printer jam,
// browser closed, etc). Pending orders don't belong here - those live on
// the "Pembayaran" page until they're resolved one way or another.
func ListTransactionHistory(db *sql.DB, merchantID, storeID string, days int) ([]TransactionHistoryRow, error) {
	rows, err := db.Query(
		`SELECT TOP 200 CAST(t.id AS NVARCHAR(36)), t.invoice_no, t.total, t.status,
		        ISNULL(p.method, ''), ISNULL(u.name, '-'), CONVERT(varchar, t.created_at, 120),
		        ISNULL((SELECT SUM(qty) FROM transaction_items WHERE transaction_id = t.id), 0)
		 FROM transactions t
		 LEFT JOIN users u ON u.id = t.cashier_id
		 OUTER APPLY (
		   SELECT TOP 1 method FROM payments WHERE transaction_id = t.id AND status = 'paid' ORDER BY paid_at DESC
		 ) p
		 WHERE t.merchant_id = @p1 AND (@p2 = '' OR t.store_id = TRY_CONVERT(uniqueidentifier, @p2))
		   AND t.status IN ('paid', 'voided')
		   AND t.created_at >= DATEADD(DAY, -@p3, SYSUTCDATETIME())
		 ORDER BY t.created_at DESC`,
		merchantID, storeID, days,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []TransactionHistoryRow{}
	for rows.Next() {
		var r TransactionHistoryRow
		if err := rows.Scan(&r.ID, &r.InvoiceNo, &r.Total, &r.Status, &r.Method, &r.CashierName, &r.CreatedAt, &r.ItemCount); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

type TransactionDetailItem struct {
	Name      string  `json:"name"`
	Qty       int     `json:"qty"`
	UnitPrice float64 `json:"unitPrice"`
}

type TransactionDetail struct {
	ID             string                  `json:"id"`
	InvoiceNo      string                  `json:"invoiceNo"`
	Total          float64                 `json:"total"`
	Status         string                  `json:"status"`
	CreatedAt      string                  `json:"createdAt"`
	CashierName    string                  `json:"cashierName"`
	StoreName      string                  `json:"storeName"`
	StoreAddress   string                  `json:"storeAddress"`
	Method         string                  `json:"method"`
	AmountReceived *float64                `json:"amountReceived"`
	Items          []TransactionDetailItem `json:"items"`
}

// GetTransactionDetail returns everything needed to reprint a receipt:
// header info, the ACTUAL store identity it happened at (not the current
// viewer's own store - relevant for admin/finance browsing across
// stores), payment method + amount tendered (for cash), and every line
// item. Scoped by merchantID so one merchant can never look up another's
// transaction just by knowing/guessing its ID.
func GetTransactionDetail(db *sql.DB, id, merchantID string) (*TransactionDetail, error) {
	var d TransactionDetail
	err := db.QueryRow(
		`SELECT CAST(t.id AS NVARCHAR(36)), t.invoice_no, t.total, t.status, CONVERT(varchar, t.created_at, 120),
		        ISNULL(u.name, '-'), ISNULL(s.name, '-'), ISNULL(s.address, '')
		 FROM transactions t
		 LEFT JOIN users u ON u.id = t.cashier_id
		 LEFT JOIN stores s ON s.id = t.store_id
		 WHERE t.id = @p1 AND t.merchant_id = @p2`,
		id, merchantID,
	).Scan(&d.ID, &d.InvoiceNo, &d.Total, &d.Status, &d.CreatedAt, &d.CashierName, &d.StoreName, &d.StoreAddress)
	if err != nil {
		return nil, err
	}

	// Payment info (method + amount tendered for cash) - a voided
	// transaction never had a successful payment, so this simply stays
	// empty in that case rather than erroring.
	_ = db.QueryRow(
		`SELECT TOP 1 method, amount_received FROM payments WHERE transaction_id = @p1 AND status = 'paid' ORDER BY paid_at DESC`,
		id,
	).Scan(&d.Method, &d.AmountReceived)

	rows, err := db.Query(
		`SELECT pr.name, ti.qty, ti.unit_price
		 FROM transaction_items ti JOIN products pr ON pr.id = ti.product_id
		 WHERE ti.transaction_id = @p1`,
		id,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	d.Items = []TransactionDetailItem{}
	for rows.Next() {
		var item TransactionDetailItem
		if err := rows.Scan(&item.Name, &item.Qty, &item.UnitPrice); err != nil {
			return nil, err
		}
		d.Items = append(d.Items, item)
	}
	return &d, rows.Err()
}
