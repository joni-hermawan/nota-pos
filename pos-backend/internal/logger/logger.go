// Package logger menangani penulisan log aktivitas ke file, terpisah antara
// aktivitas FRONTEND (dikirim dari browser lewat POST /api/logs) dan
// aktivitas BACKEND (request masuk & event server sendiri).
package logger

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Logger struct {
	frontendDir string
	backendDir  string
	mu          sync.Mutex
}

// sensitiveKeys: field yang TIDAK PERNAH ditulis apa adanya ke file log.
var sensitiveKeys = map[string]bool{
	"password":        true,
	"oldpassword":     true,
	"newpassword":     true,
	"oldpasswordhash": true,
	"newpasswordhash": true,
	"token":           true,
	"authorization":   true,
}

// New membuat Logger baru sekaligus memastikan folder logs/frontend dan
// logs/backend sudah ada di disk.
func New(frontendDir, backendDir string) (*Logger, error) {
	for _, dir := range []string{frontendDir, backendDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, err
		}
	}
	return &Logger{frontendDir: frontendDir, backendDir: backendDir}, nil
}

func todayStr() string {
	return time.Now().Format("2006-01-02")
}

// Redact melakukan deep-copy pada sebuah map/slice dan mengganti value dari
// key sensitif dengan "[REDACTED]".
func Redact(value interface{}) interface{} {
	switch v := value.(type) {
	case map[string]interface{}:
		out := make(map[string]interface{}, len(v))
		for k, val := range v {
			if sensitiveKeys[strings.ToLower(k)] {
				out[k] = "[REDACTED]"
			} else {
				out[k] = Redact(val)
			}
		}
		return out
	case []interface{}:
		out := make([]interface{}, len(v))
		for i, item := range v {
			out[i] = Redact(item)
		}
		return out
	default:
		return v
	}
}

func (l *Logger) writeLog(dir, prefix string, entry map[string]interface{}) {
	l.mu.Lock()
	defer l.mu.Unlock()

	filePath := filepath.Join(dir, prefix+"-"+todayStr()+".log")
	f, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		log.Printf("[logger] gagal membuka file %s log: %v", prefix, err)
		return
	}
	defer f.Close()

	b, err := json.Marshal(entry)
	if err != nil {
		log.Printf("[logger] gagal marshal %s log: %v", prefix, err)
		return
	}
	if _, err := f.Write(append(b, '\n')); err != nil {
		log.Printf("[logger] gagal menulis %s log: %v", prefix, err)
	}
}

// LogBackend menulis satu event aktivitas backend (koneksi DB, request
// masuk, error server, dsb).
func (l *Logger) LogBackend(event string, context map[string]interface{}, level string) {
	l.writeLog(l.backendDir, "backend", map[string]interface{}{
		"timestamp": time.Now().Format(time.RFC3339),
		"level":     level,
		"event":     event,
		"context":   Redact(context),
	})
}

// LogFrontend menulis satu event aktivitas yang dikirim dari browser lewat
// POST /api/logs (lihat handlers.Logs).
func (l *Logger) LogFrontend(event string, context map[string]interface{}, level string) {
	l.writeLog(l.frontendDir, "frontend", map[string]interface{}{
		"timestamp": time.Now().Format(time.RFC3339),
		"level":     level,
		"event":     event,
		"context":   Redact(context),
	})
}
