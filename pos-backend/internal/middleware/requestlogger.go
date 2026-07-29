package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"nota-pos-backend/internal/logger"
)

// maxLoggedBodyBytes caps how much of a request/response body gets written
// to the log, so a large payload (e.g. a base64 image, or a long SSE
// stream) can't blow up the log file size. The full body is still passed
// through to the actual handler untouched - only the LOGGED copy is capped.
const maxLoggedBodyBytes = 10 * 1024

// RequestLogger logs every request's method, path, status, duration, AND
// the full request/response JSON body (redacted, size-capped) to the
// backend log file - separate from whatever console output gorilla/mux
// might already print, this one persists to disk.
func RequestLogger(log *logger.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			var reqBodyBytes []byte
			if r.Body != nil {
				reqBodyBytes, _ = io.ReadAll(r.Body)
				// Restore the body so the actual handler downstream can
				// still read it - io.ReadAll above drains it entirely.
				r.Body = io.NopCloser(bytes.NewReader(reqBodyBytes))
			}

			rec := &bodyCapturingRecorder{ResponseWriter: w, status: http.StatusOK, body: &bytes.Buffer{}}
			next.ServeHTTP(rec, r)

			log.LogBackend("HTTP_REQUEST", map[string]interface{}{
				"method":       r.Method,
				"path":         r.URL.Path,
				"status":       rec.status,
				"durationMs":   time.Since(start).Milliseconds(),
				"remoteAddr":   r.RemoteAddr,
				"requestBody":  redactedJSONPreview(reqBodyBytes),
				"responseBody": redactedJSONPreview(rec.body.Bytes()),
			}, "info")
		})
	}
}

// redactedJSONPreview tries to parse raw as JSON so sensitive fields
// (password, token, etc - see logger.Redact) get masked before being
// written to the log. Falls back to a truncated raw string if the body
// isn't valid JSON (e.g. empty body, or plain text error message).
func redactedJSONPreview(raw []byte) interface{} {
	if len(raw) == 0 {
		return nil
	}
	var parsed interface{}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		s := string(raw)
		if len(s) > maxLoggedBodyBytes {
			s = s[:maxLoggedBodyBytes] + "...(truncated)"
		}
		return s
	}
	return logger.Redact(parsed)
}

type bodyCapturingRecorder struct {
	http.ResponseWriter
	status int
	body   *bytes.Buffer
}

func (r *bodyCapturingRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// Write captures a size-capped copy of the response body for logging,
// while still writing the FULL response through to the real client
// untouched.
func (r *bodyCapturingRecorder) Write(b []byte) (int, error) {
	if r.body.Len() < maxLoggedBodyBytes {
		remaining := maxLoggedBodyBytes - r.body.Len()
		if remaining >= len(b) {
			r.body.Write(b)
		} else {
			r.body.Write(b[:remaining])
		}
	}
	return r.ResponseWriter.Write(b)
}

// Flush passthrough is required for SSE (internal/handlers/sse.go) to keep
// working - without this, wrapping the ResponseWriter here would hide the
// underlying http.Flusher and break streaming.
func (r *bodyCapturingRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
