// Package realtime provides a tiny in-memory publish/subscribe broker so
// the backend can PUSH payment status changes to the frontend (via
// Server-Sent Events) instead of the frontend polling in a loop.
//
// Single-process, in-memory - enough for a POS backend running as one
// process. If ever scaled to multiple instances behind a load balancer,
// this would need to move to something shared (Redis pub/sub, etc).
package realtime

import "sync"

type Broker struct {
	mu   sync.Mutex
	subs map[string][]chan string
}

func NewBroker() *Broker {
	return &Broker{subs: make(map[string][]chan string)}
}

func (b *Broker) Subscribe(transactionID string) (<-chan string, func()) {
	ch := make(chan string, 4)

	b.mu.Lock()
	b.subs[transactionID] = append(b.subs[transactionID], ch)
	b.mu.Unlock()

	unsubscribe := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		list := b.subs[transactionID]
		for i, c := range list {
			if c == ch {
				b.subs[transactionID] = append(list[:i], list[i+1:]...)
				break
			}
		}
		if len(b.subs[transactionID]) == 0 {
			delete(b.subs, transactionID)
		}
		close(ch)
	}
	return ch, unsubscribe
}

func (b *Broker) Publish(transactionID, status string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, ch := range b.subs[transactionID] {
		select {
		case ch <- status:
		default:
		}
	}
}
