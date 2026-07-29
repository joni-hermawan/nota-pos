package models

type DailySales struct {
	SaleDate         string  `json:"date"`
	TransactionCount int     `json:"transactionCount"`
	Revenue          float64 `json:"revenue"`
}

type PaymentMethodShare struct {
	Method       string  `json:"method"`
	PaymentCount int     `json:"paymentCount"`
	TotalAmount  float64 `json:"totalAmount"`
}

type ProductPerformance struct {
	ProductID string  `json:"productId"`
	Name      string  `json:"name"`
	QtySold   int     `json:"qtySold"`
	Revenue   float64 `json:"revenue"`
}

type ReconciliationRow struct {
	ReconDate    string  `json:"date"`
	Method       string  `json:"method"`
	SystemTotal  float64 `json:"systemTotal"`
	PaymentCount int     `json:"paymentCount"`
}

// --- Superadmin platform dashboard (lintas SEMUA merchant) ---

type MerchantTransactionHealth struct {
	MerchantID        string  `json:"merchantId"`
	MerchantName      string  `json:"merchantName"`
	Status            string  `json:"status"` // pending | paid | voided
	TrxCount          int     `json:"trxCount"`
	TotalAmount       float64 `json:"totalAmount"`
	LastTransactionAt string  `json:"lastTransactionAt"`
}

type FailedTransactionRow struct {
	TransactionID string  `json:"transactionId"`
	InvoiceNo     string  `json:"invoiceNo"`
	MerchantName  string  `json:"merchantName"`
	Method        string  `json:"method"`
	Amount        float64 `json:"amount"`
	Reason        string  `json:"reason"` // truncated gateway_response, for a quick clue without opening the DB
	CreatedAt     string  `json:"createdAt"`
}

// StuckTransactionRow is a transaction still 'pending' for longer than the
// configured threshold - likely abandoned mid-checkout or stuck due to a
// webhook/callback that never arrived (e.g. EDC agent crashed, QRIS
// notification lost).
type StuckTransactionRow struct {
	TransactionID string  `json:"transactionId"`
	InvoiceNo     string  `json:"invoiceNo"`
	MerchantName  string  `json:"merchantName"`
	Amount        float64 `json:"amount"`
	CreatedAt     string  `json:"createdAt"`
	MinutesStuck  int     `json:"minutesStuck"`
}

type PlatformDashboard struct {
	MerchantCount         int                         `json:"merchantCount"`
	ActiveMerchantCount   int                         `json:"activeMerchantCount"`
	StoreCount            int                         `json:"storeCount"`
	ActiveStoreCount      int                         `json:"activeStoreCount"`
	TodayTransactionCount int                         `json:"todayTransactionCount"`
	TodayRevenue          float64                     `json:"todayRevenue"`
	TodayFailedCount      int                         `json:"todayFailedCount"`
	MerchantHealth        []MerchantTransactionHealth `json:"merchantHealth"`
	RecentFailed          []FailedTransactionRow      `json:"recentFailed"`
	StuckPending          []StuckTransactionRow       `json:"stuckPending"`
}
