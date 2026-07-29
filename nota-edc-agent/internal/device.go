// Package internal implements the EDC device interface and connects to
// cashier's PC and bridges the browser (which cannot access USB/serial
// devices directly) to the physical EDC machine.
//
// Flow:
//  1. PaymentMethodSelector.tsx (frontend) calls
//     POST http://localhost:9100/edc/charge  { transactionId, amount }
//  2. This agent talks to the EDC machine over USB (as a virtual COM/serial
//     port) using ChargeResult := device.Charge(amount)
//  3. This agent reports the result to the main backend:
//     POST {BackendURL}/api/payments/edc/webhook
//  4. The main backend pushes the result to the frontend via SSE - no
//     polling anywhere in this chain.
package internal

import "context"

type ChargeResult struct {
	Approved     bool
	ApprovalCode string
	ReferenceNo  string
	CardType     string
	RawResponse  string
}

// Device is the contract the rest of the agent code depends on. Once a
// different EDC vendor/protocol needs support, only a new implementation
// of this interface is needed - main.go and the HTTP handler stay the same.
type Device interface {
	Charge(ctx context.Context, amountRupiah float64) (*ChargeResult, error)
}
