// src/app/components/ui/Toast.tsx
"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "../../utils/cn";

export type ToastType = "success" | "error";
export interface ToastData {
  type: ToastType;
  message: string;
  description?: string;
}

export function Toast({ toast, onClose, duration = 4000 }: { toast: ToastData | null; onClose: () => void; duration?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    const hideTimer = setTimeout(() => setVisible(false), duration);
    const closeTimer = setTimeout(onClose, duration + 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hideTimer);
      clearTimeout(closeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, duration]);

  if (!toast) return null;
  const isSuccess = toast.type === "success";

  return (
    <div
      className={cn(
        "fixed top-5 right-5 z-[100] w-full max-w-sm transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"
      )}
      role="status"
    >
      <div className={cn("flex items-start gap-3 rounded-xl border bg-white p-4 shadow-lg", isSuccess ? "border-teal/30" : "border-alert/30")}>
        {isSuccess ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-teal" /> : <AlertCircle size={18} className="mt-0.5 shrink-0 text-alert" />}
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold", isSuccess ? "text-teal" : "text-alert")}>{toast.message}</p>
          {toast.description && <p className="mt-0.5 text-xs text-ink-soft">{toast.description}</p>}
        </div>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onClose, 200);
          }}
          className="shrink-0 rounded-md p-0.5 text-ink-soft hover:bg-ink/5"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
