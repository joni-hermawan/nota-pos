// src/app/context/ToastContext.tsx
"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Toast, ToastData } from "../components/ui/Toast";

const ToastCtx = createContext<{ showToast: (t: ToastData) => void }>({ showToast: () => undefined });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const showToast = useCallback((t: ToastData) => setToast(t), []);

  return (
    <ToastCtx.Provider value={{ showToast }}>
      {children}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
