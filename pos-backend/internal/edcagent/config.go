package edcagent

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	ListenPort string
	SerialPort string
	BaudRate   int
	BackendURL string
}

func LoadConfig() Config {
	baud, _ := strconv.Atoi(getEnv("EDC_BAUD_RATE", "9600"))
	return Config{
		ListenPort: getEnv("EDC_AGENT_PORT", "9100"),
		SerialPort: getEnv("EDC_SERIAL_PORT", "COM3"),
		BaudRate:   baud,
		BackendURL: getEnv("BACKEND_URL", "http://localhost:8080"),
	}
}

func (c Config) SerialConfig() SerialConfig {
	return SerialConfig{PortName: c.SerialPort, BaudRate: c.BaudRate, Timeout: 60 * time.Second}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
