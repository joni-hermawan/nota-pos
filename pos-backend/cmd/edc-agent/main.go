// Command edc-agent runs on the cashier's PC (not the main server) and
// bridges the browser to the physical EDC machine over USB, since a web
// page cannot access serial/USB devices directly.
//
// Run it alongside the frontend on each cashier workstation:
//
//	set EDC_SERIAL_PORT=COM3
//	go run ./cmd/edc-agent
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/joho/godotenv"

	"nota-pos-backend/internal/edcagent"
	"nota-pos-backend/internal/paymentgw"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("info: tidak ada file .env ditemukan, memakai environment variable OS")
	}

	cfg := edcagent.LoadConfig()
	device := edcagent.NewSerialEDCDevice(cfg.SerialConfig())

	if ports, err := edcagent.ListPorts(); err == nil {
		log.Printf("[edc-agent] available serial ports: %v", ports)
	}
	log.Printf("[edc-agent] configured to use port=%s baud=%d", cfg.SerialPort, cfg.BaudRate)

	mux := http.NewServeMux()
	mux.HandleFunc("/edc/charge", corsWrap(handleCharge(cfg, device)))
	mux.HandleFunc("/edc/check-connection", corsWrap(handleCheckConnection(device)))
	mux.HandleFunc("/edc/version", corsWrap(handleGetVersion(device)))

	log.Printf("[edc-agent] listening on :%s (backend=%s)", cfg.ListenPort, cfg.BackendURL)
	if err := http.ListenAndServe(":"+cfg.ListenPort, mux); err != nil {
		log.Fatal(err)
	}
}

type chargeRequest struct {
	TransactionID string  `json:"transactionId"`
	Amount        float64 `json:"amount"`
}

func handleCharge(cfg edcagent.Config, device edcagent.Device) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req chargeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		log.Printf("[edc-agent] charge request: transactionId=%s amount=%.2f", req.TransactionID, req.Amount)

		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()

		result, err := device.Charge(ctx, req.Amount)
		if err != nil {
			log.Printf("[edc-agent] charge failed: %v", err)
			reportToBackend(cfg, paymentgw.EDCCallback{
				TransactionID: req.TransactionID, Approved: false, RawResponse: err.Error(),
			})
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}

		reportToBackend(cfg, paymentgw.EDCCallback{
			TransactionID: req.TransactionID, ApprovalCode: result.ApprovalCode, ReferenceNo: result.ReferenceNo,
			CardType: result.CardType, Approved: result.Approved, RawResponse: result.RawResponse,
		})

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"approved": result.Approved, "approvalCode": result.ApprovalCode,
		})
	}
}

func reportToBackend(cfg edcagent.Config, cb paymentgw.EDCCallback) {
	body, _ := json.Marshal(cb)
	resp, err := http.Post(cfg.BackendURL+"/api/payments/edc/webhook", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[edc-agent] failed to report result to backend: %v", err)
		return
	}
	defer resp.Body.Close()
	log.Printf("[edc-agent] reported result to backend, status=%d", resp.StatusCode)
}

func handleCheckConnection(device *edcagent.SerialEDCDevice) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		result, err := device.CheckConnection(r.Context())
		if err != nil {
			log.Printf("[edc-agent] check-connection failed: %v", err)
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"result": result})
	}
}

func handleGetVersion(device *edcagent.SerialEDCDevice) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		version, err := device.GetVersion(r.Context())
		if err != nil {
			log.Printf("[edc-agent] get-version failed: %v", err)
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"version": version})
	}
}

// corsWrap allows the Next.js dev server (a different origin/port) to call
// this local agent directly from the browser.
func corsWrap(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}
