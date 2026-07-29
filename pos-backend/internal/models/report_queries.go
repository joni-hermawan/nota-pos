package models

import "database/sql"

// storeFilterSQL: a store filter used throughout this file so every report
// function supports BOTH "one store" (store_manager, or admin who picked a
// store in the UI) and "all stores aggregated" (admin's default view, or
// finance which is always merchant-wide) with the same query, just by
// passing storeID = "" for the aggregate case.

// SalesTrend returns the last N days of revenue from v_daily_sales, used by
// the dashboard's trend chart. storeID = "" aggregates every store in the
// merchant; a specific storeID narrows to just that branch.
func SalesTrend(db *sql.DB, merchantID, storeID string, days int) ([]DailySales, error) {
	rows, err := db.Query(
		`SELECT TOP (@p1) CONVERT(varchar, sale_date, 23), SUM(transaction_count), SUM(revenue)
		 FROM v_daily_sales WHERE merchant_id = @p2 AND (@p3 = '' OR store_id = TRY_CONVERT(uniqueidentifier, @p3))
		 GROUP BY sale_date ORDER BY sale_date DESC`,
		days, merchantID, storeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []DailySales{}
	for rows.Next() {
		var d DailySales
		if err := rows.Scan(&d.SaleDate, &d.TransactionCount, &d.Revenue); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// view returns newest-first; the trend chart wants oldest-first
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}
	return result, nil
}

// TodaySummary returns today's (WIB) transaction count and revenue
// explicitly - unlike SalesTrend, this is NEVER missing even if today has
// zero paid transactions so far (returns 0, 0 in that case). The dashboard
// used to infer "today" from the LAST entry of SalesTrend, which was
// WRONG whenever today had no sales yet - it would silently show
// yesterday's (or the last day WITH sales) numbers mislabeled as "today".
func TodaySummary(db *sql.DB, merchantID, storeID string) (trxCount int, revenue float64, err error) {
	err = db.QueryRow(
		`SELECT ISNULL(COUNT(*), 0), ISNULL(SUM(total), 0)
		 FROM transactions
		 WHERE status = 'paid' AND merchant_id = @p1 AND (@p2 = '' OR store_id = TRY_CONVERT(uniqueidentifier, @p2))
		   AND CAST(DATEADD(HOUR, 7, created_at) AS DATE) = CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE)`,
		merchantID, storeID,
	).Scan(&trxCount, &revenue)
	return
}

func PaymentMethodBreakdown(db *sql.DB, merchantID, storeID string) ([]PaymentMethodShare, error) {
	rows, err := db.Query(
		`SELECT method, SUM(payment_count), SUM(total_amount) FROM v_payment_method_breakdown
		 WHERE sale_date = CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE) AND merchant_id = @p1 AND (@p2 = '' OR store_id = TRY_CONVERT(uniqueidentifier, @p2))
		 GROUP BY method`,
		merchantID, storeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []PaymentMethodShare{}
	for rows.Next() {
		var p PaymentMethodShare
		if err := rows.Scan(&p.Method, &p.PaymentCount, &p.TotalAmount); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

func TopProducts(db *sql.DB, merchantID, storeID string, limit int) ([]ProductPerformance, error) {
	return productPerformance(db, merchantID, storeID, limit, "DESC")
}

// LeastProducts returns the worst-selling products among those with at
// least one recorded sale. Products with ZERO sales ever don't appear at
// all (v_product_performance is built from an inner join on
// transaction_items) - only "sold rarely", not "never sold".
func LeastProducts(db *sql.DB, merchantID, storeID string, limit int) ([]ProductPerformance, error) {
	return productPerformance(db, merchantID, storeID, limit, "ASC")
}

func productPerformance(db *sql.DB, merchantID, storeID string, limit int, order string) ([]ProductPerformance, error) {
	dir := "DESC"
	if order == "ASC" {
		dir = "ASC"
	}
	rows, err := db.Query(
		`SELECT TOP (@p1) CAST(product_id AS NVARCHAR(36)), name, SUM(qty_sold), SUM(revenue)
		 FROM v_product_performance WHERE merchant_id = @p2 AND (@p3 = '' OR store_id = TRY_CONVERT(uniqueidentifier, @p3))
		 GROUP BY product_id, name ORDER BY SUM(qty_sold) `+dir,
		limit, merchantID, storeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []ProductPerformance{}
	for rows.Next() {
		var p ProductPerformance
		if err := rows.Scan(&p.ProductID, &p.Name, &p.QtySold, &p.Revenue); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

// Reconciliation returns the system-recorded totals per day/method, used
// by the Finance reporting page (always merchant-wide - pass storeID="").
// NOTE: this only reflects OUR OWN database - there's no external
// bank/gateway settlement feed wired in to compare against yet.
func Reconciliation(db *sql.DB, merchantID, storeID string, days int) ([]ReconciliationRow, error) {
	rows, err := db.Query(
		`SELECT CONVERT(varchar, recon_date, 23), method, SUM(system_total), SUM(payment_count)
		 FROM v_reconciliation
		 WHERE merchant_id = @p1 AND (@p2 = '' OR store_id = TRY_CONVERT(uniqueidentifier, @p2))
		   AND recon_date IS NOT NULL
		   AND recon_date >= CAST(DATEADD(DAY, -@p3, DATEADD(HOUR, 7, SYSUTCDATETIME())) AS DATE)
		 GROUP BY recon_date, method
		 ORDER BY recon_date DESC, method`,
		merchantID, storeID, days,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []ReconciliationRow{}
	for rows.Next() {
		var r ReconciliationRow
		if err := rows.Scan(&r.ReconDate, &r.Method, &r.SystemTotal, &r.PaymentCount); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}
