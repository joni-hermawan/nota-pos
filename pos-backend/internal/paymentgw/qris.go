// Package paymentgw adapts external payment rails (QRIS gateway) behind a
// small interface so the switching provider can be swapped without
// touching handler/model logic.
package paymentgw

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type QRISCharge struct {
	QRImageURL  string // hotlinkable image URL from Midtrans's actions[].url (generate-qr-code)
	ReferenceNo string
	ExpiresAt   time.Time // when this QR code stops being payable - powers the frontend countdown
	RawResponse string
}

type QRISGateway interface {
	CreateCharge(ctx context.Context, orderID string, amount float64) (*QRISCharge, error)
	// CheckStatus actively asks Midtrans for the current status of a
	// transaction - used as a MANUAL fallback (a "Cek Status" button) for
	// when Midtrans's webhook notification can't reach us, e.g. during
	// local development where the backend runs on localhost and isn't
	// publicly reachable. The primary/normal path is still the webhook
	// (HandleQRISWebhook) - this is only a backup.
	CheckStatus(ctx context.Context, orderID string) (transactionStatus, rawResponse string, err error)
}

// MidtransQRIS is an example adapter; swap for Xendit/DOKU/etc as needed -
// only this file changes, handler/model logic stays the same.
type MidtransQRIS struct {
	BaseURL string
	APIKey  string
	Client  *http.Client
}

func NewMidtransQRIS(baseURL, apiKey string) *MidtransQRIS {
	return &MidtransQRIS{BaseURL: baseURL, APIKey: apiKey, Client: &http.Client{}}
}

// defaultQRISValidity: Midtrans's own default QRIS validity window, used
// as a fallback when the charge response doesn't include an explicit
// expiry_time (varies by account/acquirer config).
const defaultQRISValidity = 15 * time.Minute

// jakartaOffset: Midtrans's timestamp fields (transaction_time,
// expiry_time) are documented as WIB (UTC+7), with NO timezone suffix in
// the string itself - this fixed offset is what lets us parse them
// correctly instead of accidentally treating them as UTC.
var jakartaOffset = time.FixedZone("WIB", 7*60*60)

func (m *MidtransQRIS) CreateCharge(ctx context.Context, orderID string, amount float64) (*QRISCharge, error) {
	payload := map[string]interface{}{
		"payment_type": "qris",
		"transaction_details": map[string]interface{}{
			"order_id":     orderID,
			"gross_amount": amount,
		},
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.BaseURL+"/v2/charge", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(m.APIKey, "")

	resp, err := m.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var raw map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	rawJSON, _ := json.Marshal(raw)

	refNo, _ := raw["transaction_id"].(string)

	// Midtrans's response includes an "actions" array; the entry named
	// "generate-qr-code" holds a URL that serves the QR code AS AN ACTUAL
	// PNG IMAGE, meant to be hotlinked directly (e.g. <img src={url}>).
	// NOTE: the top-level "qr_string" field (if present) is NOT an image -
	// it's the raw QRIS payload TEXT that Midtrans itself renders into
	// that image; using it directly as image data (as an earlier version
	// of this code mistakenly did) produces a broken <img>.
	var qrImageURL string
	if actions, ok := raw["actions"].([]interface{}); ok {
		for _, a := range actions {
			action, ok := a.(map[string]interface{})
			if !ok {
				continue
			}
			if name, _ := action["name"].(string); name == "generate-qr-code" {
				qrImageURL, _ = action["url"].(string)
				break
			}
		}
	}
	if qrImageURL == "" {
		return nil, fmt.Errorf("qris gateway did not return a QR code URL (actions[].generate-qr-code): %s", string(rawJSON))
	}

	expiresAt := time.Now().Add(defaultQRISValidity)
	if expiryStr, ok := raw["expiry_time"].(string); ok && expiryStr != "" {
		if parsed, err := time.ParseInLocation("2006-01-02 15:04:05", expiryStr, jakartaOffset); err == nil {
			expiresAt = parsed
		}
		// parse gagal -> diamkan, tetap pakai fallback now+15menit di atas
		// daripada gagalkan seluruh charge cuma karena field tambahan ini
	}

	return &QRISCharge{QRImageURL: qrImageURL, ReferenceNo: refNo, ExpiresAt: expiresAt, RawResponse: string(rawJSON)}, nil
}

// CheckStatus calls Midtrans's Get Status API directly - a manual pull,
// unlike the usual push (webhook). Useful when the webhook genuinely
// cannot reach this backend (e.g. running on localhost during
// development, or the notification got lost in transit).
func (m *MidtransQRIS) CheckStatus(ctx context.Context, orderID string) (string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, m.BaseURL+"/v2/"+orderID+"/status", nil)
	if err != nil {
		return "", "", err
	}
	req.SetBasicAuth(m.APIKey, "")

	resp, err := m.Client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	var raw map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return "", "", err
	}
	rawJSON, _ := json.Marshal(raw)

	status, _ := raw["transaction_status"].(string)
	if status == "" {
		if msg, ok := raw["status_message"].(string); ok {
			return "", string(rawJSON), fmt.Errorf("gateway: %s", msg)
		}
	}
	return status, string(rawJSON), nil
}
