package internal

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type Config struct {
	SerialPort string `json:"serialPort"`
	BaudRate   int    `json:"baudRate"`
	ListenPort string `json:"listenPort"`
	// FrontendURL adalah SATU-SATUNYA alamat yang perlu diketahui agent ini
	// untuk melapor hasil transaksi - BUKAN alamat backend langsung. Ini
	// diisi OTOMATIS oleh halaman "Pengaturan EDC" (dari
	// window.location.origin di browser), bukan diketik manual oleh kasir -
	// PC kasir memang hanya perlu tahu satu URL: alamat frontend yang sudah
	// mereka buka di browser. Agent melapor ke {FrontendURL}/backend/... -
	// path "/backend/" itu proxy Next.js yang sudah ada (dibuat untuk
	// menghindari masalah CORS antara browser dan backend), dan proxy yang
	// sama ini ternyata bisa dipakai ulang di sini: siapa pun yang POST ke
	// path itu (baik browser maupun program Go biasa seperti agent ini)
	// diteruskan Next.js ke backend sesungguhnya.
	FrontendURL string `json:"frontendUrl"`
}

func (c Config) SerialConfig() SerialConfig {
	return SerialConfig{PortName: c.SerialPort, BaudRate: c.BaudRate}
}

func defaultConfig() Config {
	return Config{
		SerialPort:  "", // sengaja kosong - diisi lewat halaman Pengaturan EDC di frontend
		BaudRate:    9600,
		ListenPort:  "9100",
		FrontendURL: "", // diisi otomatis saat halaman Pengaturan EDC pertama kali menyimpan config
	}
}

// configFilePath returns config.json in the SAME FOLDER as the running
// executable - not the current working directory - supaya bisa
// double-click .exe dari folder mana saja dan tetap ketemu config-nya.
func configFilePath() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(exePath), "config.json"), nil
}

// Store menyimpan Config di memori (thread-safe) supaya bisa diubah lewat
// HTTP (dipanggil dari halaman "Pengaturan EDC" di frontend) TANPA perlu
// restart proses agent ini - port serial baru langsung dipakai di
// charge/check-connection BERIKUTNYA, karena SerialEDCDevice memang selalu
// buka-tutup koneksi per-operasi, bukan koneksi permanen.
type Store struct {
	mu  sync.RWMutex
	cfg Config
}

// LoadStore membaca config.json kalau ada; kalau tidak ada (instalasi
// baru), pakai default kosong - TIDAK menanyakan apa pun di console. Semua
// pengisian port/alamat backend dilakukan lewat halaman "Pengaturan EDC"
// di frontend Nota POS, yang bicara ke agent ini lewat endpoint
// GET/POST /edc/config di bawah.
func LoadStore() (*Store, error) {
	cfg := defaultConfig()
	path, err := configFilePath()
	if err != nil {
		return nil, err
	}
	if data, err := os.ReadFile(path); err == nil {
		var saved Config
		if err := json.Unmarshal(data, &saved); err == nil {
			cfg = saved
		}
	}
	return &Store{cfg: cfg}, nil
}

func (s *Store) Get() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg
}

// Set memperbarui config di memori DAN menyimpannya ke config.json, supaya
// tetap tersimpan setelah agent di-restart/komputer dinyalakan ulang.
func (s *Store) Set(cfg Config) error {
	s.mu.Lock()
	s.cfg = cfg
	s.mu.Unlock()

	path, err := configFilePath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
