// Package db bertanggung jawab membuka & membagikan satu connection pool
// SQL Server untuk seluruh aplikasi.
package db

import (
	"database/sql"
	"fmt"

	_ "github.com/microsoft/go-mssqldb"

	"nota-pos-backend/internal/config"
)

// Connect membuka koneksi ke SQL Server dan memvalidasinya dengan Ping.
func Connect(cfg config.DBConfig) (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"server=%s;port=%d;database=%s;user id=%s;password=%s;encrypt=%t;trustservercertificate=%t",
		cfg.Server, cfg.Port, cfg.Database, cfg.User, cfg.Password, cfg.Encrypt, cfg.TrustServerCertificate,
	)

	conn, err := sql.Open("sqlserver", dsn)
	if err != nil {
		return nil, err
	}

	conn.SetMaxOpenConns(cfg.MaxOpenConns)
	conn.SetMaxIdleConns(cfg.MaxIdleConns)

	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, err
	}

	return conn, nil
}
