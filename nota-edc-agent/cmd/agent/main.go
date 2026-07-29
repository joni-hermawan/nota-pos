// Command nota-edc-agent adalah aplikasi TERPISAH dari backend utama Nota
// POS - didesain untuk di-install di TIAP komputer kasir yang punya mesin
// EDC tersambung lewat USB. Browser tidak bisa akses port USB/serial
// langsung, jadi aplikasi kecil ini yang jadi "jembatan": browser (frontend
// Nota POS) memanggil aplikasi ini di localhost, aplikasi ini yang bicara
// ke mesin EDC lewat kabel USB.
//
// PENTING - satu-satunya alamat yang perlu diketahui PC kasir adalah URL
// FRONTEND (yang memang sudah mereka buka di browser untuk pakai POS-nya).
// Agent ini TIDAK PERNAH perlu tahu alamat backend secara langsung -
// begitu hasil transaksi EDC didapat, agent melapor ke
// {FrontendURL}/backend/payments/edc/webhook, dan proxy Next.js di
// frontend (yang sudah ada, awalnya dibuat untuk menghindari masalah CORS
// browser<->backend) yang meneruskannya ke backend sesungguhnya. FrontendURL
// ini pun diisi OTOMATIS oleh halaman "Pengaturan EDC" (dari
// window.location.origin di browser) - kasir tidak pernah mengetik alamat
// apa pun secara manual.
//
// Cara pakai:
//  1. Copy nota-edc-agent.exe ke komputer kasir (folder mana saja)
//  2. Double-click - jendela ini akan langsung menampilkan status siap
//  3. Buka Nota POS di browser (URL yang sama seperti biasa), masuk ke
//     menu "Pengaturan EDC", pilih port USB - alamat frontend otomatis
//     tersimpan ke agent ini, tidak perlu diketik manual
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"nota-edc-agent/internal"
)

func main() {
	printBanner()

	store, err := internal.LoadStore()
	if err != nil {
		fatal("Gagal memuat konfigurasi: %v", err)
	}
	cfg := store.Get()

	fmt.Println("Status:")
	fmt.Printf("  • Port EDC       : %s\n", displayOrEmpty(cfg.SerialPort))
	fmt.Printf("  • Frontend Nota  : %s\n", displayOrEmpty(cfg.FrontendURL))
	fmt.Printf("  • Agent ini      : http://localhost:%s\n", cfg.ListenPort)
	fmt.Println()
	if cfg.SerialPort == "" || cfg.FrontendURL == "" {
		fmt.Println("⚠️  Belum lengkap diatur. Buka Nota POS di browser -> menu")
		fmt.Println("   \"Pengaturan EDC\" untuk memilih port USB-nya.")
	} else {
		fmt.Println("✅ Agent siap.")
	}
	fmt.Println("   JANGAN TUTUP jendela ini selama kasir masih memakai POS (boleh diminimize).")
	fmt.Println()

	mux := http.NewServeMux()
	mux.HandleFunc("/edc/charge", corsWrap(handleCharge(store)))
	mux.HandleFunc("/edc/check-connection", corsWrap(handleCheckConnection(store)))
	mux.HandleFunc("/edc/version", corsWrap(handleGetVersion(store)))
	mux.HandleFunc("/edc/ports", corsWrap(handleListPorts()))
	mux.HandleFunc("/edc/config", corsWrap(handleConfig(store)))

	if err := http.ListenAndServe(":"+cfg.ListenPort, mux); err != nil {
		fatal("Agent berhenti karena error: %v\n\n(Kemungkinan port %s sudah dipakai aplikasi lain di komputer ini)", err, cfg.ListenPort)
	}
}

func displayOrEmpty(s string) string {
	if s == "" {
		return "(belum diatur)"
	}
	return s
}

func printBanner() {
	fmt.Println("=========================================")
	fmt.Println("   Nota EDC Agent")
	fmt.Println("   Jembatan POS <-> Mesin EDC (USB)")
	fmt.Println("=========================================")
	fmt.Println()
}

// fatal mencetak pesan error lalu MENUNGGU user tekan Enter sebelum
// program benar-benar keluar.
func fatal(format string, args ...interface{}) {
	fmt.Println()
	fmt.Printf("❌ "+format+"\n", args...)
	fmt.Println()
	fmt.Print("Tekan Enter untuk keluar...")
	bufio.NewReader(os.Stdin).ReadString('\n')
	os.Exit(1)
}

type chargeRequest struct {
	TransactionID string  `json:"transactionId"`
	Amount        float64 `json:"amount"`
}

type edcCallback struct {
	TransactionID string `json:"transactionId"`
	ApprovalCode  string `json:"approvalCode"`
	ReferenceNo   string `json:"referenceNo"`
	CardType      string `json:"cardType"`
	Approved      bool   `json:"approved"`
	RawResponse   string `json:"rawResponse"`
}

// deviceFromStore membuat SerialEDCDevice baru dari config TERKINI setiap
// kali dipanggil - supaya perubahan port lewat halaman "Pengaturan EDC"
// langsung berlaku di request berikutnya tanpa restart agent.
func deviceFromStore(store *internal.Store) *internal.SerialEDCDevice {
	return internal.NewSerialEDCDevice(store.Get().SerialConfig())
}

func handleCharge(store *internal.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cfg := store.Get()
		if cfg.SerialPort == "" {
			http.Error(w, "Port USB EDC belum diatur - buka menu Pengaturan EDC di Nota POS", http.StatusPreconditionFailed)
			return
		}
		if cfg.FrontendURL == "" {
			http.Error(w, "Agent belum pernah tersambung ke Nota POS - buka menu Pengaturan EDC dan klik Simpan sekali dulu", http.StatusPreconditionFailed)
			return
		}

		var req chargeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		log.Printf("[charge] transaksi %s - Rp %.0f", req.TransactionID, req.Amount)

		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()

		result, err := deviceFromStore(store).Charge(ctx, req.Amount)
		if err != nil {
			log.Printf("[charge] GAGAL: %v", err)
			reportViaFrontend(cfg, edcCallback{TransactionID: req.TransactionID, Approved: false, RawResponse: err.Error()})
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}

		if result.Approved {
			log.Printf("[charge] BERHASIL - approval code %s, kartu %s", result.ApprovalCode, result.CardType)
		} else {
			log.Printf("[charge] DITOLAK bank - %s", result.RawResponse)
		}

		reportViaFrontend(cfg, edcCallback{
			TransactionID: req.TransactionID, ApprovalCode: result.ApprovalCode, ReferenceNo: result.ReferenceNo,
			CardType: result.CardType, Approved: result.Approved, RawResponse: result.RawResponse,
		})

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"approved": result.Approved, "approvalCode": result.ApprovalCode})
	}
}

// reportViaFrontend melaporkan hasil transaksi lewat proxy "/backend/..."
// milik FRONTEND - BUKAN memanggil backend secara langsung. Ini yang bikin
// agent ini tidak pernah perlu tahu alamat backend sama sekali: dia cuma
// tahu satu URL yang sama dengan yang diketik kasir di browser, dan proxy
// Next.js di frontend itulah yang meneruskannya ke backend sesungguhnya -
// server-to-server, jadi tidak masalah CORS sama sekali di titik ini.
func reportViaFrontend(cfg internal.Config, cb edcCallback) {
	url := strings.TrimRight(cfg.FrontendURL, "/") + "/backend/payments/edc/webhook"
	body, _ := json.Marshal(cb)

	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[lapor lewat frontend] GAGAL terhubung ke %s: %v", url, err)
		return
	}
	defer resp.Body.Close()
	log.Printf("[lapor lewat frontend] terkirim ke %s, status %d", url, resp.StatusCode)
}

func handleCheckConnection(store *internal.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cfg := store.Get()
		if cfg.SerialPort == "" {
			http.Error(w, "Port USB EDC belum diatur", http.StatusPreconditionFailed)
			return
		}
		result, err := deviceFromStore(store).CheckConnection(r.Context())
		if err != nil {
			log.Printf("[cek koneksi] GAGAL: %v", err)
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"result": result})
	}
}

func handleGetVersion(store *internal.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		version, err := deviceFromStore(store).GetVersion(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"version": version})
	}
}

// handleListPorts - dipanggil halaman "Pengaturan EDC" untuk mengisi
// dropdown pilihan port.
func handleListPorts() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ports, err := internal.ListPorts()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ports": ports})
	}
}

type configUpdateRequest struct {
	SerialPort  string `json:"serialPort"`
	FrontendURL string `json:"frontendUrl"`
}

// handleConfig: GET mengembalikan config saat ini, POST menyimpan
// perubahan.
//
// frontendUrl SENGAJA tidak pernah diketik manual oleh kasir - halaman
// Pengaturan EDC selalu mengirim window.location.origin miliknya sendiri
// setiap kali Simpan diklik.
//
// listenPort (port agent ini sendiri) TIDAK bisa diubah lewat sini, karena
// frontend selalu memanggil agent di port yang sudah di-hardcode (9100).
func handleConfig(store *internal.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(store.Get())
			return
		}

		if r.Method == http.MethodPost {
			var req configUpdateRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			if req.SerialPort == "" {
				http.Error(w, "serialPort wajib diisi", http.StatusBadRequest)
				return
			}

			cfg := store.Get()
			cfg.SerialPort = req.SerialPort
			if req.FrontendURL != "" {
				cfg.FrontendURL = req.FrontendURL
			}
			if err := store.Set(cfg); err != nil {
				http.Error(w, "gagal menyimpan konfigurasi: "+err.Error(), http.StatusInternalServerError)
				return
			}
			log.Printf("[config] diperbarui lewat UI - port=%s frontend=%s", cfg.SerialPort, cfg.FrontendURL)

			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(cfg)
			return
		}

		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// corsWrap mengizinkan frontend Nota POS (browser, origin berbeda) memanggil
// agent lokal ini langsung dari JavaScript.
func corsWrap(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}
