// Package config memusatkan semua pembacaan environment variable di satu
// tempat, supaya kalau ada penambahan konfigurasi baru cukup diubah/
// ditambah di sini tanpa menyentuh package lain.
package config

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port string
	Host string

	BaseDir        string
	LogDir         string
	FrontendLogDir string
	BackendLogDir  string

	CORSAllowedOrigins []string

	DB      DBConfig
	Auth    AuthConfig
	Payment PaymentConfig
}

// AuthConfig menyimpan pengaturan JWT & cookie httpOnly.
type AuthConfig struct {
	JWTSecret    string
	JWTExpiresIn time.Duration
	CookieMaxAge time.Duration
	CookieSecure bool
}

// DBConfig menyimpan parameter koneksi SQL Server.
type DBConfig struct {
	Server                 string
	Port                   int
	Database               string
	User                   string
	Password               string
	Encrypt                bool
	TrustServerCertificate bool
	MaxOpenConns           int
	MaxIdleConns           int
}

type PaymentConfig struct {
	GatewayKey string
	GatewayURL string
}

func Load() Config {
	baseDir, err := os.Getwd()
	if err != nil {
		baseDir = "."
	}

	logDir := getEnv("LOG_DIR", filepath.Join(baseDir, "logs"))

	// WAJIB diset lewat env di production - fallback ini HANYA untuk
	// kemudahan development lokal, JANGAN dipakai di production.
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "dev-only-secret-jangan-dipakai-di-production"
		log.Println("⚠️  JWT_SECRET tidak diset - memakai secret default (HANYA aman untuk development). " +
			"WAJIB set JWT_SECRET sebelum deploy ke production!")
	}

	jwtExpiresIn, err := time.ParseDuration(getEnv("JWT_EXPIRES_IN", "8h"))
	if err != nil {
		jwtExpiresIn = 8 * time.Hour
	}
	cookieMaxAgeMs := getEnvInt("COOKIE_MAX_AGE_MS", int(8*time.Hour/time.Millisecond))

	return Config{
		Port:           getEnv("PORT", "8080"),
		Host:           getEnv("HOST", "0.0.0.0"),
		BaseDir:        baseDir,
		LogDir:         logDir,
		FrontendLogDir: filepath.Join(logDir, "frontend"),
		BackendLogDir:  filepath.Join(logDir, "backend"),

		// comma-separated list, e.g. "https://kasir.tokoanda.com,https://admin.tokoanda.com"
		// Each entry is trimmed - a stray trailing space or CRLF artifact in
		// the .env file (common when edited/saved on Windows) would
		// otherwise silently break the exact-match comparison in
		// middleware.CORS, making every request look like a CORS violation
		// with zero indication why.
		CORSAllowedOrigins: splitAndTrim(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000"), ","),

		DB: DBConfig{
			Server:                 getEnv("DB_SERVER", "localhost"),
			Port:                   getEnvInt("DB_PORT", 1433),
			Database:               getEnv("DB_NAME", "nota_pos"),
			User:                   getEnv("DB_USER", "sa"),
			Password:               getEnv("DB_PASSWORD", "YourPassword123!"),
			Encrypt:                getEnvBool("DB_ENCRYPT", false),
			TrustServerCertificate: getEnvBool("DB_TRUST_CERT", true),
			MaxOpenConns:           25,
			MaxIdleConns:           10,
		},
		Auth: AuthConfig{
			JWTSecret:    jwtSecret,
			JWTExpiresIn: jwtExpiresIn,
			CookieMaxAge: time.Duration(cookieMaxAgeMs) * time.Millisecond,
			CookieSecure: getEnvBool("COOKIE_SECURE", false),
		},
		Payment: PaymentConfig{
			GatewayKey: getEnv("PAYMENT_GATEWAY_KEY", ""),
			GatewayURL: getEnv("PAYMENT_GATEWAY_URL", "https://api.sandbox.midtrans.com"),
		},
	}
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

// splitAndTrim splits a comma-separated string and trims whitespace from
// each piece, dropping any empty entries (e.g. from a trailing comma).
func splitAndTrim(s, sep string) []string {
	parts := strings.Split(s, sep)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
