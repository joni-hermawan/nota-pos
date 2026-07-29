// Package handlers berisi seluruh HTTP handler aplikasi, dikelompokkan per
// file (auth.go, products.go, transactions.go, dst) tapi semuanya method
// dari satu struct Handlers yang sama - supaya semua handler otomatis
// punya akses ke db, logger, authManager, dan broker tanpa perlu
// constructor terpisah untuk tiap grup.
package handlers

import (
	"database/sql"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/logger"
	"nota-pos-backend/internal/paymentgw"
	"nota-pos-backend/internal/realtime"
)

type Handlers struct {
	DB     *sql.DB
	Log    *logger.Logger
	Auth   *auth.Manager
	QRIS   paymentgw.QRISGateway
	Broker *realtime.Broker
}

func New(db *sql.DB, log *logger.Logger, authManager *auth.Manager, qris paymentgw.QRISGateway, broker *realtime.Broker) *Handlers {
	return &Handlers{DB: db, Log: log, Auth: authManager, QRIS: qris, Broker: broker}
}
