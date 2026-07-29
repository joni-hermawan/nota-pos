package internal

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.bug.st/serial"
)

type SerialConfig struct {
	PortName string
	BaudRate int
	Timeout  time.Duration
}

type SerialEDCDevice struct {
	cfg SerialConfig
}

func NewSerialEDCDevice(cfg SerialConfig) *SerialEDCDevice {
	if cfg.BaudRate == 0 {
		cfg.BaudRate = 9600
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 60 * time.Second
	}
	return &SerialEDCDevice{cfg: cfg}
}

func (d *SerialEDCDevice) open() (serial.Port, error) {
	mode := &serial.Mode{BaudRate: d.cfg.BaudRate}
	port, err := serial.Open(d.cfg.PortName, mode)
	if err != nil {
		return nil, fmt.Errorf("failed to open EDC serial port %s: %w", d.cfg.PortName, err)
	}
	_ = port.SetReadTimeout(d.cfg.Timeout)
	return port, nil
}

// Charge performs a Regular Sale transaction (spec section 2).
func (d *SerialEDCDevice) Charge(ctx context.Context, amountRupiah float64) (*ChargeResult, error) {
	port, err := d.open()
	if err != nil {
		return nil, err
	}
	defer port.Close()

	data := append(EncodeAmount(amountRupiah), EncodeAmount(0)...)
	req := BuildFrame(CodeRegularSale, data)

	parsed, err := d.sendAndReceive(port, req)
	if err != nil {
		return nil, fmt.Errorf("regular sale failed: %w", err)
	}

	slip := ParseSaleSlip(parsed.Data)
	approved := parsed.RespCode == "00"
	cardType := strings.TrimSpace(strings.TrimSpace(slip.CardScheme) + " " + strings.TrimSpace(slip.CardType))

	return &ChargeResult{
		Approved: approved, ApprovalCode: slip.ApprovalCode, ReferenceNo: slip.ReferenceCode,
		CardType: cardType, RawResponse: fmt.Sprintf("respCode=%s data=%s", parsed.RespCode, string(parsed.Data)),
	}, nil
}

func (d *SerialEDCDevice) Void(ctx context.Context, traceNumber int) (*VoidSlip, bool, error) {
	port, err := d.open()
	if err != nil {
		return nil, false, err
	}
	defer port.Close()

	req := BuildFrame(CodeVoid, EncodeTraceNumber(traceNumber))
	parsed, err := d.sendAndReceive(port, req)
	if err != nil {
		return nil, false, fmt.Errorf("void failed: %w", err)
	}
	slip := ParseVoidSlip(parsed.Data)
	return &slip, parsed.RespCode == "00", nil
}

func (d *SerialEDCDevice) CheckConnection(ctx context.Context) (string, error) {
	port, err := d.open()
	if err != nil {
		return "", err
	}
	defer port.Close()

	req := BuildFrame(CodeCheckConnection, nil)
	parsed, err := d.sendAndReceive(port, req)
	if err != nil {
		return "", fmt.Errorf("check connection failed: %w", err)
	}
	return string(parsed.Data), nil
}

func (d *SerialEDCDevice) GetVersion(ctx context.Context) (string, error) {
	port, err := d.open()
	if err != nil {
		return "", err
	}
	defer port.Close()

	req := BuildFrame(CodeGetVersion, nil)
	parsed, err := d.sendAndReceive(port, req)
	if err != nil {
		return "", fmt.Errorf("get version failed: %w", err)
	}
	parts := SplitPipeFields(parsed.Data)
	if len(parts) < 2 {
		return "", fmt.Errorf("unexpected get-version response: %s", string(parsed.Data))
	}
	return parts[1], nil
}

func (d *SerialEDCDevice) EchoTest(ctx context.Context) error {
	port, err := d.open()
	if err != nil {
		return err
	}
	defer port.Close()

	req := BuildFrame(CodeEchoTest, nil)
	if _, err := port.Write(req); err != nil {
		return fmt.Errorf("write echo test: %w", err)
	}
	ack, err := readByte(port, d.cfg.Timeout)
	if err != nil {
		return fmt.Errorf("waiting for echo ACK: %w", err)
	}
	if ack != ACK {
		return fmt.Errorf("EDC did not ACK echo test (got 0x%02X)", ack)
	}
	return nil
}

// sendAndReceive implements the request/response half of the transaction
// flow from the spec's "Transaction Flow" section: write request, wait for
// ACK, read response frame, validate CRC, ACK it back.
//
// Sending NAK to make the EDC resend on a bad CRC, and the "Get Last ECR
// Transaction" fallback when no response arrives at all, are both called
// out as OPTIONAL in the spec. Not implemented here yet; a failed CRC
// currently just returns an error.
func (d *SerialEDCDevice) sendAndReceive(port serial.Port, req []byte) (*ParsedResponse, error) {
	if _, err := port.Write(req); err != nil {
		return nil, fmt.Errorf("write request: %w", err)
	}

	ack, err := readByte(port, d.cfg.Timeout)
	if err != nil {
		return nil, fmt.Errorf("waiting for ACK: %w", err)
	}
	if ack != ACK {
		return nil, fmt.Errorf("EDC did not acknowledge request (got 0x%02X)", ack)
	}

	respFrame, err := readFrame(port, d.cfg.Timeout)
	if err != nil {
		return nil, fmt.Errorf("reading response frame: %w", err)
	}

	parsed, err := ParseFrame(respFrame)
	if err != nil {
		return nil, err
	}
	if !parsed.CRCValid {
		return nil, fmt.Errorf("EDC response CRC mismatch")
	}

	_, _ = port.Write([]byte{ACK})
	return parsed, nil
}

func readByte(port serial.Port, timeout time.Duration) (byte, error) {
	buf := make([]byte, 1)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		n, err := port.Read(buf)
		if err != nil {
			return 0, err
		}
		if n > 0 {
			return buf[0], nil
		}
	}
	return 0, fmt.Errorf("timed out waiting for a byte")
}

func readFrame(port serial.Port, timeout time.Duration) ([]byte, error) {
	var frame []byte
	started := false
	buf := make([]byte, 1)
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		n, err := port.Read(buf)
		if err != nil {
			return nil, err
		}
		if n == 0 {
			continue
		}
		b := buf[0]

		if !started {
			if b == STX {
				started = true
				frame = append(frame, b)
			}
			continue
		}

		frame = append(frame, b)
		if b == ETX {
			crcByte, err := readByte(port, timeout)
			if err != nil {
				return nil, fmt.Errorf("reading CRC byte: %w", err)
			}
			frame = append(frame, crcByte)
			return frame, nil
		}
	}
	return nil, fmt.Errorf("timed out waiting for response frame")
}
