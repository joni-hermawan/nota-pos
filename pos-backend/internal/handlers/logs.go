package handlers

import (
	"net/http"

	"nota-pos-backend/internal/utils"
)

type frontendLogRequest struct {
	Level   string                 `json:"level"`
	Message string                 `json:"message"`
	Context map[string]interface{} `json:"context"`
}

// Logs receives activity/error logs sent from the browser (see the
// frontend's lib/logger.ts) and persists them via internal/logger - the
// browser itself cannot write files to disk, so this endpoint is what
// makes frontend logs actually end up on disk as logs/frontend-*.log.
func (h *Handlers) Logs(w http.ResponseWriter, r *http.Request) {
	var req frontendLogRequest
	if err := utils.DecodeJSON(r, &req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Level == "" {
		req.Level = "info"
	}
	h.Log.LogFrontend(req.Message, req.Context, req.Level)
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
