package handlers

import (
	"fmt"
	"net/http"

	"github.com/gorilla/mux"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/models"
	"nota-pos-backend/internal/utils"
)

// effectiveStoreID resolves which store a request applies to:
//   - kasir/ppic/store_manager are LOCKED to their own claims.StoreID - any
//     "storeId" they send is ignored, so they can never act on another
//     store just by changing a request parameter.
//   - admin (whose claims.StoreID is empty - they aren't locked to one
//     store) must explicitly pick a store via `requested`.
func effectiveStoreID(claims *auth.Claims, requested string) (string, error) {
	if claims.StoreID != "" {
		return claims.StoreID, nil
	}
	if requested == "" {
		return "", fmt.Errorf("storeId wajib diisi")
	}
	return requested, nil
}

func (h *Handlers) ListProducts(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())
	storeID, err := effectiveStoreID(claims, r.URL.Query().Get("storeId"))
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	products, err := models.ListProductsForStore(h.DB, claims.MerchantID, storeID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, products)
}

type productFormRequest struct {
	SKU      string  `json:"sku"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	Price    float64 `json:"price"`
	Stock    int     `json:"stock"`
	MinStock int     `json:"minStock"`
	StoreID  string  `json:"storeId"` // only used when the caller isn't locked to one store (admin)
}

// CreateProduct handles "Produk baru" from the Produk & Stok page. Adds a
// merchant-wide catalog entry, with initial stock seeded for ONE store.
func (h *Handlers) CreateProduct(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())

	var req productFormRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.SKU == "" || req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "SKU dan nama produk wajib diisi")
		return
	}
	storeID, err := effectiveStoreID(claims, req.StoreID)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	product, err := models.CreateProduct(h.DB, claims.MerchantID, storeID, models.ProductInput{
		SKU: req.SKU, Name: req.Name, Category: req.Category, Price: req.Price, Stock: req.Stock, MinStock: req.MinStock,
	})
	if err != nil {
		utils.WriteDBError(w, err, "SKU sudah dipakai produk lain di merchant ini - gunakan SKU yang berbeda")
		return
	}
	utils.WriteJSON(w, http.StatusCreated, product)
}

// UpdateProduct edits catalog fields (merchant-wide) plus this store's
// min_stock threshold. Stock QTY itself is never edited here - that only
// changes via AdjustStock, so every change is always audited.
func (h *Handlers) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	productID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	var req productFormRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	storeID, err := effectiveStoreID(claims, req.StoreID)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	product, err := models.UpdateProduct(h.DB, productID, claims.MerchantID, storeID, models.ProductInput{
		SKU: req.SKU, Name: req.Name, Category: req.Category, Price: req.Price, MinStock: req.MinStock,
	})
	if err != nil {
		utils.WriteDBError(w, err, "SKU sudah dipakai produk lain di merchant ini - gunakan SKU yang berbeda")
		return
	}
	utils.WriteJSON(w, http.StatusOK, product)
}

type adjustStockRequest struct {
	Delta   int    `json:"delta"`
	Reason  string `json:"reason"`
	StoreID string `json:"storeId"`
}

func (h *Handlers) AdjustStock(w http.ResponseWriter, r *http.Request) {
	productID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	var req adjustStockRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Reason == "" {
		req.Reason = "adjustment"
	}
	storeID, err := effectiveStoreID(claims, req.StoreID)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Verify the product belongs to this merchant first - without this
	// check, adjusting a product ID from a DIFFERENT merchant would still
	// insert a stock_movement row referencing it (product_stock's MERGE
	// upserts regardless), corrupting that merchant's audit trail. Failing
	// loudly here instead keeps merchants fully isolated.
	if _, err := models.GetProductForStore(h.DB, productID, claims.MerchantID, storeID); err != nil {
		utils.WriteError(w, http.StatusNotFound, "Produk tidak ditemukan")
		return
	}

	if err := models.AdjustStock(r.Context(), h.DB, productID, storeID, req.Delta, req.Reason, claims.UserID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type updateImageRequest struct {
	ImageURL string `json:"imageUrl"`
}

// UpdateImage sets the product photo URL (catalog-level, merchant-wide -
// no store concept here). The frontend uploads the actual file to object
// storage (or a CDN) first and only sends the resulting URL here.
func (h *Handlers) UpdateProductImage(w http.ResponseWriter, r *http.Request) {
	productID := mux.Vars(r)["id"]
	claims, _ := auth.FromContext(r.Context())

	var req updateImageRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := models.UpdateProductImage(h.DB, productID, claims.MerchantID, req.ImageURL); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
