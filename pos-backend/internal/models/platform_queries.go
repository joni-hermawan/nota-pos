package models

import "database/sql"

// PlatformMerchantCounts returns total/active merchant and store counts
// across the whole platform - superadmin only.
func PlatformMerchantCounts(db *sql.DB) (merchantTotal, merchantActive, storeTotal, storeActive int, err error) {
	err = db.QueryRow(`SELECT COUNT(*), SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) FROM merchants`).
		Scan(&merchantTotal, &merchantActive)
	if err != nil {
		return
	}
	err = db.QueryRow(`SELECT COUNT(*), SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) FROM stores`).
		Scan(&storeTotal, &storeActive)
	return
}

// PlatformTodaySummary returns today's (WIB) transaction count/revenue and
// failed-payment count, across ALL merchants.
func PlatformTodaySummary(db *sql.DB) (trxCount int, revenue float64, failedCount int, err error) {
	err = db.QueryRow(
		`SELECT ISNULL(COUNT(*), 0), ISNULL(SUM(total), 0)
		 FROM transactions WHERE status = 'paid'
		   AND CAST(DATEADD(HOUR, 7, created_at) AS DATE) = CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE)`,
	).Scan(&trxCount, &revenue)
	if err != nil {
		return
	}
	err = db.QueryRow(
		`SELECT ISNULL(COUNT(*), 0) FROM payments
		 WHERE status = 'failed'
		   AND CAST(DATEADD(HOUR, 7, created_at) AS DATE) = CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE)`,
	).Scan(&failedCount)
	return
}

// MerchantHealthBreakdown reads v_platform_transaction_health - per
// merchant, per status (pending/paid/voided) counts - so a superadmin can
// spot a merchant with an unusually high failure/void rate at a glance.
func MerchantHealthBreakdown(db *sql.DB) ([]MerchantTransactionHealth, error) {
	rows, err := db.Query(
		`SELECT CAST(merchant_id AS NVARCHAR(36)), merchant_name, status, trx_count, total_amount,
		        CONVERT(varchar, last_transaction_at, 120)
		 FROM v_platform_transaction_health ORDER BY merchant_name, status`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []MerchantTransactionHealth{}
	for rows.Next() {
		var m MerchantTransactionHealth
		if err := rows.Scan(&m.MerchantID, &m.MerchantName, &m.Status, &m.TrxCount, &m.TotalAmount, &m.LastTransactionAt); err != nil {
			return nil, err
		}
		result = append(result, m)
	}
	return result, rows.Err()
}

// RecentFailedTransactions lists the most recent failed/voided payments
// across ALL merchants, with a short reason clue from gateway_response -
// lets a superadmin investigate without opening the database manually.
func RecentFailedTransactions(db *sql.DB, limit int) ([]FailedTransactionRow, error) {
	rows, err := db.Query(
		`SELECT TOP (@p1) CAST(t.id AS NVARCHAR(36)), t.invoice_no, m.name, p.method, p.amount,
		        ISNULL(LEFT(p.gateway_response, 200), ''), CONVERT(varchar, p.created_at, 120)
		 FROM payments p
		 JOIN transactions t ON t.id = p.transaction_id
		 JOIN merchants m ON m.id = t.merchant_id
		 WHERE p.status = 'failed'
		 ORDER BY p.created_at DESC`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []FailedTransactionRow{}
	for rows.Next() {
		var f FailedTransactionRow
		if err := rows.Scan(&f.TransactionID, &f.InvoiceNo, &f.MerchantName, &f.Method, &f.Amount, &f.Reason, &f.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, f)
	}
	return result, rows.Err()
}

// StuckPendingTransactions finds transactions still 'pending' longer than
// thresholdMinutes - likely abandoned mid-checkout, or stuck because a
// webhook/EDC callback never arrived.
func StuckPendingTransactions(db *sql.DB, thresholdMinutes, limit int) ([]StuckTransactionRow, error) {
	rows, err := db.Query(
		`SELECT TOP (@p1) CAST(t.id AS NVARCHAR(36)), t.invoice_no, m.name, t.total,
		        CONVERT(varchar, t.created_at, 120), DATEDIFF(MINUTE, t.created_at, SYSUTCDATETIME())
		 FROM transactions t
		 JOIN merchants m ON m.id = t.merchant_id
		 WHERE t.status = 'pending' AND DATEDIFF(MINUTE, t.created_at, SYSUTCDATETIME()) > @p2
		 ORDER BY t.created_at ASC`,
		limit, thresholdMinutes,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []StuckTransactionRow{}
	for rows.Next() {
		var s StuckTransactionRow
		if err := rows.Scan(&s.TransactionID, &s.InvoiceNo, &s.MerchantName, &s.Amount, &s.CreatedAt, &s.MinutesStuck); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}
