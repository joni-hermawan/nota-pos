// Package edcagent implements the WIDE EDC Whitelabel serial protocol
// ("Format Message POS - EDC Whitelabel", Technical Document). This file
// covers the generic frame structure shared by every transaction type in
// that spec (section 1, "Format Data POS <-> EDC").
package edcagent

import (
	"fmt"
	"strings"
)

const (
	STX         byte = 0x02 // frame start
	ETX         byte = 0x03 // frame end / "closing tag"
	ACK         byte = 0x06
	NAK         byte = 0x15 // not explicitly given a hex value in the spec; 0x15 is the standard ASCII NAK used for this class of protocol
	VersionByte byte = 0x01 // "Header & Version" is always 02 01
)

// TransactionCode is the 2-byte (Type, SubType) pair from spec section 1
// that identifies which transaction a message is for.
type TransactionCode struct {
	Type    byte
	SubType byte
}

// Every transaction type/subtype pair from the spec's table (section 1).
// Only Regular Sale is fully wired into Charge() for now, since that's the
// one our POS currently needs. The rest are defined here so adding
// Void/prepaid/cash-withdrawal/QR support later is just a new
// request-builder + response-parser using the same BuildFrame/ParseFrame
// primitives below - no protocol-level guesswork needed.
var (
	CodeRegularSale = TransactionCode{0x31, 0x30}
	CodeVoid        = TransactionCode{0x32, 0x30}
	CodeSettlement  = TransactionCode{0x33, 0x30}

	CodeEchoTest        = TransactionCode{0x3B, 0x30}
	CodeCheckConnection = TransactionCode{0x3B, 0x33}
	CodeGetVersion      = TransactionCode{0x3B, 0x34}
	CodeGetLastECR      = TransactionCode{0x3B, 0x35}

	// Prepaid - Bank Mandiri
	CodePrepaidMandiriPurchase  = TransactionCode{0x37, 0x30}
	CodePrepaidMandiriTopUp     = TransactionCode{0x37, 0x31}
	CodePrepaidMandiriTopUpATMB = TransactionCode{0x37, 0x32}
	CodePrepaidMandiriGetNumber = TransactionCode{0x37, 0x33}
	CodePrepaidMandiriUpdateBal = TransactionCode{0x37, 0x34}

	// Prepaid - Bank BNI
	CodePrepaidBNIPurchase  = TransactionCode{0x39, 0x30}
	CodePrepaidBNITopUp     = TransactionCode{0x39, 0x31}
	CodePrepaidBNIGetNumber = TransactionCode{0x39, 0x34}
	CodePrepaidBNIUpdateBal = TransactionCode{0x39, 0x37}

	// Prepaid - Bank BRI
	CodePrepaidBRIPurchase  = TransactionCode{0x39, 0x32}
	CodePrepaidBRITopUp     = TransactionCode{0x39, 0x33}
	CodePrepaidBRIGetNumber = TransactionCode{0x39, 0x36}
	CodePrepaidBRIUpdateBal = TransactionCode{0x39, 0x38}

	// Cash Withdrawal
	CodeCashWithdrawalMandiri = TransactionCode{0x31, 0x39}
	CodeCashWithdrawalBRI     = TransactionCode{0x31, 0x3C}
	CodeCashWithdrawalBNI     = TransactionCode{0x31, 0x3D}
	CodeCashWithdrawalBTN     = TransactionCode{0x31, 0x3E}
	CodeCashWithdrawalPermata = TransactionCode{0x31, 0x3F}

	// QR Sale
	CodeQRAtome    = TransactionCode{0x65, 0x34}
	CodeQRKredivo  = TransactionCode{0x65, 0x35}
	CodeQRIndodana = TransactionCode{0x65, 0x36}
	CodeQRISBNI    = TransactionCode{0x65, 0x37}
	CodeQRISBRI    = TransactionCode{0x65, 0x38}
	CodeQRISCIMB   = TransactionCode{0x65, 0x39}
	CodeQRISGAJA   = TransactionCode{0x65, 0x3A}
	CodeQRISPVS    = TransactionCode{0x65, 0x3B}
	CodeQRISOVO    = TransactionCode{0x65, 0x3C}
)

// BuildFrame assembles a full request frame:
//
//	STX | VER | TYPE | SUBTYPE | DATA... | ETX | CRC
func BuildFrame(code TransactionCode, data []byte) []byte {
	body := make([]byte, 0, 3+len(data)+1)
	body = append(body, VersionByte, code.Type, code.SubType)
	body = append(body, data...)
	body = append(body, ETX)

	frame := make([]byte, 0, len(body)+2)
	frame = append(frame, STX)
	frame = append(frame, body...)
	frame = append(frame, crc(body))
	return frame
}

// crc XORs every byte from the version byte through ETX inclusive - this
// matches the spec's definition exactly: "CRC calculated by XoR from byte-2
// until closing tag" (byte-2 being the version byte, since STX is byte-1).
//
// Verified against the spec's own worked example:
// frame 02 01 31 30 30 30 30 30 30 30 30 30 30 35 30 30 30 03 -> CRC 06h.
func crc(body []byte) byte {
	var c byte
	for _, b := range body {
		c ^= b
	}
	return c
}

// EncodeAmount encodes a whole-rupiah amount as a 12-digit zero-padded
// ASCII string (no decimal point) - the format used throughout the spec
// for Regular Sale, prepaid, cash withdrawal, and QR sale amounts.
func EncodeAmount(amountRupiah float64) []byte {
	return []byte(fmt.Sprintf("%012.0f", amountRupiah))
}

// EncodeCardNumber builds the optional Data3 field for a Regular Sale
// request: "CN" header + card number, space-padded to 19 characters.
func EncodeCardNumber(cardNumber string) []byte {
	padded := cardNumber
	if len(padded) < 19 {
		padded += strings.Repeat(" ", 19-len(padded))
	} else if len(padded) > 19 {
		padded = padded[:19]
	}
	return append([]byte("CN"), []byte(padded)...)
}

// EncodeTraceNumber encodes a 6-digit zero-padded trace number, used by Void.
func EncodeTraceNumber(trace int) []byte {
	return []byte(fmt.Sprintf("%06d", trace))
}

// ParsedResponse is the generic shape of every framed EDC response:
//
//	STX | VER | TYPE | SUBTYPE | RESP_CODE(2 bytes) | DATA... | ETX | CRC
//
// (Settlement and Echo Test are the only two commands that reply with a
// bare ACK byte instead of a full frame like this - handled separately.)
type ParsedResponse struct {
	Type     byte
	SubType  byte
	RespCode string // "00" = success; anything else = failed transaction (spec section 2)
	Data     []byte
	CRCValid bool
}

func ParseFrame(frame []byte) (*ParsedResponse, error) {
	if len(frame) < 8 {
		return nil, fmt.Errorf("frame too short: %d bytes", len(frame))
	}
	if frame[0] != STX {
		return nil, fmt.Errorf("missing STX header, got 0x%02X", frame[0])
	}

	etxIdx := len(frame) - 2 // last byte is CRC
	if frame[etxIdx] != ETX {
		return nil, fmt.Errorf("missing ETX terminator at expected position")
	}

	body := frame[1 : etxIdx+1]
	gotCRC := frame[len(frame)-1]
	wantCRC := crc(body)

	return &ParsedResponse{
		Type: frame[2], SubType: frame[3], RespCode: string(frame[4:6]),
		Data: frame[6:etxIdx], CRCValid: gotCRC == wantCRC,
	}, nil
}

// SplitPipeFields splits a response Data payload on "|" and trims the
// surrounding spaces the spec's examples consistently include.
func SplitPipeFields(data []byte) []string {
	parts := strings.Split(string(data), "|")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}

func field(parts []string, i int) string {
	if i < len(parts) {
		return parts[i]
	}
	return ""
}

// SaleSlip is the parsed printing-slip data from a Regular Sale response
// (spec section 2) and Get Last ECR Transaction response (section 34).
type SaleSlip struct {
	BankMember      string
	TerminalID      string
	MerchantID      string
	CardScheme      string
	CardPAN         string
	EntryMode       string
	TransactionType string
	BatchNumber     string
	TraceNumber     string
	Date            string
	Time            string
	ReferenceCode   string
	ApprovalCode    string
	TotalAmount     string
	CardType        string
	IssuerType      string
	ExpiredDate     string
	CustomerName    string
	ApplID          string
	AppName         string
	TC              string
	TVRValue        string
	Signature       string
}

func ParseSaleSlip(data []byte) SaleSlip {
	p := SplitPipeFields(data)
	return SaleSlip{
		BankMember: field(p, 0), TerminalID: field(p, 1), MerchantID: field(p, 2),
		CardScheme: field(p, 3), CardPAN: field(p, 4), EntryMode: field(p, 5),
		TransactionType: field(p, 6), BatchNumber: field(p, 7), TraceNumber: field(p, 8),
		Date: field(p, 9), Time: field(p, 10), ReferenceCode: field(p, 11),
		ApprovalCode: field(p, 12), TotalAmount: field(p, 13), CardType: field(p, 14),
		IssuerType: field(p, 15), ExpiredDate: field(p, 16), CustomerName: field(p, 17),
		ApplID: field(p, 18), AppName: field(p, 19), TC: field(p, 20),
		TVRValue: field(p, 21), Signature: field(p, 22),
	}
}

// VoidSlip is the parsed response data from a Void request (spec section 3).
type VoidSlip struct {
	TerminalID      string
	MerchantID      string
	CardScheme      string
	CardPAN         string
	EntryMode       string
	TransactionType string
	BatchNumber     string
	TraceNumber     string
	Date            string
	Time            string
	ReferenceCode   string
	ApprovalCode    string
	TotalAmount     string
}

func ParseVoidSlip(data []byte) VoidSlip {
	p := SplitPipeFields(data)
	return VoidSlip{
		TerminalID: field(p, 0), MerchantID: field(p, 1), CardScheme: field(p, 2),
		CardPAN: field(p, 3), EntryMode: field(p, 4), TransactionType: field(p, 5),
		BatchNumber: field(p, 6), TraceNumber: field(p, 7), Date: field(p, 8),
		Time: field(p, 9), ReferenceCode: field(p, 10), ApprovalCode: field(p, 11),
		TotalAmount: field(p, 12),
	}
}
