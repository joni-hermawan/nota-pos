// Command server adalah entrypoint aplikasi backend Nota POS, disusun
// dalam struktur folder (cmd/, internal/config, internal/db,
// internal/logger, internal/handlers, internal/router, dst) yang sama
// dengan pola project referensi.
package main

import (
	"log"
	"net/http"

	"github.com/joho/godotenv"

	"nota-pos-backend/internal/auth"
	"nota-pos-backend/internal/config"
	"nota-pos-backend/internal/db"
	"nota-pos-backend/internal/handlers"
	appLogger "nota-pos-backend/internal/logger"
	"nota-pos-backend/internal/paymentgw"
	"nota-pos-backend/internal/realtime"
	"nota-pos-backend/internal/router"
)

func main() {
	// .env bersifat opsional (mis. saat deploy, env var di-set langsung oleh
	// OS/orchestrator) - tapi kalau ADA, ini WAJIB dipanggil sebelum
	// config.Load(), kalau tidak semua nilai di .env (DB_SERVER, JWT_SECRET,
	// dst) akan diam-diam diabaikan dan config jatuh ke nilai default.
	if err := godotenv.Load(); err != nil {
		log.Println("info: tidak ada file .env ditemukan, memakai environment variable OS")
	}

	cfg := config.Load()

	appLog, err := appLogger.New(cfg.FrontendLogDir, cfg.BackendLogDir)
	if err != nil {
		log.Fatalf("gagal menyiapkan folder log: %v", err)
	}

	conn, err := db.Connect(cfg.DB)
	if err != nil {
		log.Fatalf("gagal konek ke SQL Server: %v", err)
	}
	defer conn.Close()
	log.Println("✅ Terhubung ke SQL Server")
	appLog.LogBackend("DB_CONNECTED", map[string]interface{}{"server": cfg.DB.Server, "database": cfg.DB.Database}, "info")

	authManager := auth.NewManager(cfg.Auth.JWTSecret, cfg.Auth.JWTExpiresIn, cfg.Auth.CookieMaxAge, cfg.Auth.CookieSecure)
	qrisGateway := paymentgw.NewMidtransQRIS(cfg.Payment.GatewayURL, cfg.Payment.GatewayKey)
	broker := realtime.NewBroker()

	h := handlers.New(conn, appLog, authManager, qrisGateway, broker)
	mux := router.New(h, authManager, conn, cfg.CORSAllowedOrigins)

	addr := cfg.Host + ":" + cfg.Port
	log.Printf("🚀 Nota POS backend berjalan di http://%s (akses lokal: http://localhost:%s)", addr, cfg.Port)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server berhenti: %v", err)
	}
}
