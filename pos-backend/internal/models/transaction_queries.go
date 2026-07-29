package models

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
)

type TrxItemInput struct {
	ProductID string
	Qty       int
}

// CreateTransaction builds a pending transaction AT ONE STORE with its line
// items, and decrements that store's stock immediately (reserved), so two
// cashiers at the SAME store can't oversell the same item. Stock at OTHER
// stores of the same merchant is completely untouched.
//
// IMPORTANT: the parent "transactions" row is inserted BEFORE any
// "transaction_items" rows, since transaction_items.transaction_id has a
// foreign key to transactions.id - SQL Server checks FK constraints
// per-statement, not deferred until COMMIT, so inserting items first (even
// inside the same DB transaction) fails with a FK violation.
func CreateTransaction(ctx context.Context, db *sql.DB, merchantID, storeID, cashierID string, items []TrxItemInput, products map[string]ProductCatalogWithStock) (*Transaction, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	id := uuid.NewString()
	invoiceNo := "INV-" + uuid.NewString()[:8]

	var total float64
	for _, item := range items {
		total += products[item.ProductID].Price * float64(item.Qty)
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO transactions (id, merchant_id, store_id, invoice_no, cashier_id, total, status, created_at)
		 VALUES (@p1, @p2, @p3, @p4, @p5, @p6, 'pending', SYSUTCDATETIME())`,
		id, merchantID, storeID, invoiceNo, cashierID, total,
	); err != nil {
		return nil, err
	}

	for _, item := range items {
		p := products[item.ProductID]
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO transaction_items (id, transaction_id, product_id, qty, unit_price)
			 VALUES (NEWID(), @p1, @p2, @p3, @p4)`,
			id, item.ProductID, item.Qty, p.Price,
		); err != nil {
			return nil, err
		}
		// Stock lives in product_stock, keyed by (product_id, store_id) -
		// decrement only the row for THIS store.
		if _, err := tx.ExecContext(ctx,
			`UPDATE product_stock SET stock = stock - @p1 WHERE product_id = @p2 AND store_id = @p3`,
			item.Qty, item.ProductID, storeID,
		); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &Transaction{ID: id, StoreID: storeID, InvoiceNo: invoiceNo, CashierID: cashierID, Total: total, Status: TrxPending}, nil
}

func MarkTransactionPaid(db *sql.DB, transactionID string) error {
	_, err := db.Exec(`UPDATE transactions SET status = 'paid' WHERE id = @p1`, transactionID)
	return err
}

// VoidTransaction cancels a still-pending transaction: restores the stock
// that was reserved AT THAT TRANSACTION'S STORE when it was created (one
// stock_movement row per line item, reason='void', for audit), and marks
// the transaction 'voided'. Scoped by merchantID - a cashier can only void
// their own merchant's transactions (their own store's, in practice, since
// a cashier's session only ever creates transactions at their own store).
func VoidTransaction(ctx context.Context, db *sql.DB, transactionID, merchantID, voidedBy string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var status, storeID string
	err = tx.QueryRowContext(ctx,
		`SELECT status, CAST(store_id AS NVARCHAR(36)) FROM transactions WHERE id = @p1 AND merchant_id = @p2`,
		transactionID, merchantID,
	).Scan(&status, &storeID)
	if err != nil {
		return err
	}
	if status != string(TrxPending) {
		return sql.ErrNoRows // treat "already paid/voided" the same as "not found" for the caller
	}

	rows, err := tx.QueryContext(ctx,
		`SELECT CAST(product_id AS NVARCHAR(36)), qty FROM transaction_items WHERE transaction_id = @p1`, transactionID,
	)
	if err != nil {
		return err
	}
	type item struct {
		productID string
		qty       int
	}
	var items []item
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.productID, &it.qty); err != nil {
			rows.Close()
			return err
		}
		items = append(items, it)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, it := range items {
		if _, err := tx.ExecContext(ctx,
			`UPDATE product_stock SET stock = stock + @p1 WHERE product_id = @p2 AND store_id = @p3`,
			it.qty, it.productID, storeID,
		); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO stock_movements (id, product_id, store_id, delta, reason, created_by, created_at)
			 VALUES (NEWID(), @p1, @p2, @p3, 'void', @p4, SYSUTCDATETIME())`,
			it.productID, storeID, it.qty, voidedBy,
		); err != nil {
			return err
		}
	}

	if _, err := tx.ExecContext(ctx, `UPDATE transactions SET status = 'voided' WHERE id = @p1`, transactionID); err != nil {
		return err
	}

	return tx.Commit()
}

// GetTransactionByID scopes by merchantID so a transaction ID from one
// merchant can never be looked up/paid by a different merchant's session.
func GetTransactionByID(db *sql.DB, id, merchantID string) (*Transaction, error) {
	var t Transaction
	err := db.QueryRow(
		`SELECT CAST(id AS NVARCHAR(36)), CAST(store_id AS NVARCHAR(36)), invoice_no, CAST(cashier_id AS NVARCHAR(36)), total, status, created_at
		 FROM transactions WHERE id = @p1 AND merchant_id = @p2`, id, merchantID,
	).Scan(&t.ID, &t.StoreID, &t.InvoiceNo, &t.CashierID, &t.Total, &t.Status, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// PendingTransaction is one row in the "Pembayaran" page's list - an order
// that's been created (stock already reserved) but not paid yet.
type PendingTransaction struct {
	ID          string  `json:"id"`
	InvoiceNo   string  `json:"invoiceNo"`
	Total       float64 `json:"total"`
	ItemCount   int     `json:"itemCount"`
	CashierName string  `json:"cashierName"`
	CreatedAt   string  `json:"createdAt"`
	MinutesOpen int     `json:"minutesOpen"`
}

// ListPendingTransactions returns every order still awaiting payment at
// this store - this is the whole point of separating "Order" (Kasir page)
// from "Payment" (Pembayaran page): a cashier builds the cart and creates
// the order, then EITHER THE SAME OR A DIFFERENT cashier picks it from
// this list to actually collect payment.
func ListPendingTransactions(db *sql.DB, merchantID, storeID string) ([]PendingTransaction, error) {
	rows, err := db.Query(
		`SELECT CAST(t.id AS NVARCHAR(36)), t.invoice_no, t.total,
		        ISNULL((SELECT SUM(qty) FROM transaction_items WHERE transaction_id = t.id), 0),
		        ISNULL(u.name, '-'), CONVERT(varchar, t.created_at, 120), DATEDIFF(MINUTE, t.created_at, SYSUTCDATETIME())
		 FROM transactions t
		 LEFT JOIN users u ON u.id = t.cashier_id
		 WHERE t.status = 'pending' AND t.merchant_id = @p1 AND t.store_id = @p2
		 ORDER BY t.created_at ASC`,
		merchantID, storeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []PendingTransaction{}
	for rows.Next() {
		var p PendingTransaction
		if err := rows.Scan(&p.ID, &p.InvoiceNo, &p.Total, &p.ItemCount, &p.CashierName, &p.CreatedAt, &p.MinutesOpen); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}
