// Package utils berisi helper kecil yang dipakai berulang di seluruh
// handler (response JSON, error JSON) supaya formatnya konsisten.
package utils

import (
	"encoding/json"
	"net/http"
	"strings"
)

func WriteJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}

func DecodeJSON(r *http.Request, dst interface{}) error {
	return json.NewDecoder(r.Body).Decode(dst)
}

// IsDuplicateKeyError detects a SQL Server UNIQUE/PRIMARY KEY constraint
// violation from the raw driver error text (string-matched rather than
// type-asserted to a specific driver error type, so this keeps working
// regardless of which mssql driver version/wrapper is in use).
func IsDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique key constraint") || strings.Contains(msg, "duplicate key") || strings.Contains(msg, "violation of unique")
}

// WriteDBError responds with a friendly message for known error patterns
// (currently: duplicate key) instead of leaking raw SQL Server error text
// like "Violation of UNIQUE KEY constraint 'uq_products_merchant_sku'..."
// straight to the frontend.
func WriteDBError(w http.ResponseWriter, err error, duplicateMessage string) {
	if IsDuplicateKeyError(err) {
		WriteError(w, http.StatusConflict, duplicateMessage)
		return
	}
	WriteError(w, http.StatusInternalServerError, err.Error())
}
