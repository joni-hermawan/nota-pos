package middleware

import (
	"log"
	"net/http"
)

// CORS allows the configured frontend origin(s) to call this API with
// credentials (cookies) included - required since auth is httpOnly cookie
// based, not Authorization header based.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}
	log.Printf("[cors] configured allowed origins: %v", allowedOrigins)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				if allowed[origin] {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Access-Control-Allow-Credentials", "true")
					w.Header().Set("Vary", "Origin")
				} else {
					// This is exactly the situation that looks like "server
					// unreachable" / "CORS blocked" from the browser with no
					// obvious cause - logging it here turns a guessing game
					// into a one-line diagnosis.
					log.Printf("[cors] rejected origin %q (not in allowed list: %v)", origin, allowedOrigins)
				}
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
