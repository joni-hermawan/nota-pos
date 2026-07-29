package models

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
)

// ListProductsForStore returns the merchant's full catalog joined with
// stock/min_stock for ONE specific store - this is what the POS grid and
// Produk & Stok page actually display (they don't need to know the
// catalog/stock split exists at all).
func ListProductsForStore(db *sql.DB, merchantID, storeID string) ([]ProductCatalogWithStock, error) {
	rows, err := db.Query(
		`SELECT CAST(p.id AS NVARCHAR(36)), p.sku, p.name, p.category, p.price, p.image_url,
		        ISNULL(ps.stock, 0), ISNULL(ps.min_stock, 0)
		 FROM products p
		 LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.store_id = @p2
		 WHERE p.active = 1 AND p.merchant_id = @p1
		 ORDER BY p.name`,
		merchantID, storeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	products := []ProductCatalogWithStock{}
	for rows.Next() {
		var p ProductCatalogWithStock
		if err := rows.Scan(&p.ID, &p.SKU, &p.Name, &p.Category, &p.Price, &p.ImageURL, &p.Stock, &p.MinStock); err != nil {
			return nil, err
		}
		products = append(products, p)
	}
	return products, rows.Err()
}

// GetProductForStore fetches one catalog product + its stock at a
// specific store - used when validating a cart item during checkout.
func GetProductForStore(db *sql.DB, id, merchantID, storeID string) (*ProductCatalogWithStock, error) {
	var p ProductCatalogWithStock
	err := db.QueryRow(
		`SELECT CAST(p.id AS NVARCHAR(36)), p.sku, p.name, p.category, p.price, p.image_url,
		        ISNULL(ps.stock, 0), ISNULL(ps.min_stock, 0)
		 FROM products p
		 LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.store_id = @p3
		 WHERE p.id = @p1 AND p.merchant_id = @p2`,
		id, merchantID, storeID,
	).Scan(&p.ID, &p.SKU, &p.Name, &p.Category, &p.Price, &p.ImageURL, &p.Stock, &p.MinStock)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

type ProductInput struct {
	SKU      string
	Name     string
	Category string
	Price    float64
	Stock    int // initial stock, seeded into product_stock for the creating store only
	MinStock int
}

// CreateProduct adds a new catalog entry (merchant-wide) AND seeds its
// initial stock for the ONE store where it was created - other stores in
// the same merchant start at 0 stock until their own PPIC/store_manager
// restocks it locally.
func CreateProduct(db *sql.DB, merchantID, storeID string, in ProductInput) (*ProductCatalogWithStock, error) {
	id := uuid.NewString()
	_, err := db.Exec(
		`INSERT INTO products (id, merchant_id, sku, name, category, price, active, created_at, updated_at)
		 VALUES (@p1, @p2, @p3, @p4, @p5, @p6, 1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
		id, merchantID, in.SKU, in.Name, in.Category, in.Price,
	)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(
		`INSERT INTO product_stock (product_id, store_id, stock, min_stock) VALUES (@p1, @p2, @p3, @p4)`,
		id, storeID, in.Stock, in.MinStock,
	); err != nil {
		return nil, err
	}
	return GetProductForStore(db, id, merchantID, storeID)
}

// UpdateProduct edits catalog fields (name/sku/category/price) - applies
// merchant-wide since the catalog is shared. min_stock is per-store, so
// it's updated for the CALLING store only (each branch sets its own
// reorder threshold).
func UpdateProduct(db *sql.DB, id, merchantID, storeID string, in ProductInput) (*ProductCatalogWithStock, error) {
	_, err := db.Exec(
		`UPDATE products SET sku = @p1, name = @p2, category = @p3, price = @p4, updated_at = SYSUTCDATETIME()
		 WHERE id = @p5 AND merchant_id = @p6`,
		in.SKU, in.Name, in.Category, in.Price, id, merchantID,
	)
	if err != nil {
		return nil, err
	}

	// upsert min_stock for this store (product_stock row might not exist
	// yet if this store never had stock for this product before)
	if _, err := db.Exec(
		`MERGE product_stock AS target
		 USING (SELECT @p1 AS product_id, @p2 AS store_id) AS src
		 ON target.product_id = src.product_id AND target.store_id = src.store_id
		 WHEN MATCHED THEN UPDATE SET min_stock = @p3
		 WHEN NOT MATCHED THEN INSERT (product_id, store_id, stock, min_stock) VALUES (@p1, @p2, 0, @p3);`,
		id, storeID, in.MinStock,
	); err != nil {
		return nil, err
	}

	return GetProductForStore(db, id, merchantID, storeID)
}

func UpdateProductImage(db *sql.DB, productID, merchantID, imageURL string) error {
	_, err := db.Exec(
		`UPDATE products SET image_url = @p1, updated_at = SYSUTCDATETIME() WHERE id = @p2 AND merchant_id = @p3`,
		imageURL, productID, merchantID,
	)
	return err
}

// AdjustStock changes stock for ONE product at ONE store (upserting the
// product_stock row if it doesn't exist yet), and records a movement row
// for auditability, inside a DB transaction to avoid race conditions
// between concurrent cashiers/PPIC at the SAME store.
func AdjustStock(ctx context.Context, db *sql.DB, productID, storeID string, delta int, reason, createdBy string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`MERGE product_stock AS target
		 USING (SELECT @p1 AS product_id, @p2 AS store_id) AS src
		 ON target.product_id = src.product_id AND target.store_id = src.store_id
		 WHEN MATCHED THEN UPDATE SET stock = stock + @p3
		 WHEN NOT MATCHED THEN INSERT (product_id, store_id, stock, min_stock) VALUES (@p1, @p2, @p3, 0);`,
		productID, storeID, delta,
	); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO stock_movements (id, product_id, store_id, delta, reason, created_by, created_at)
		 VALUES (NEWID(), @p1, @p2, @p3, @p4, @p5, SYSUTCDATETIME())`,
		productID, storeID, delta, reason, createdBy,
	); err != nil {
		return err
	}
	return tx.Commit()
}
