// src/app/pages/EdcSetupPage.tsx
//
// ============================================================================
// DEMO MODE — versi asli halaman ini menghubungi agent EDC lokal
// (http://localhost:9100) yang jalan di PC kasir sungguhan dan bicara ke
// mesin EDC fisik lewat USB/serial. Prototype ini tidak punya agent/hardware
// sungguhan, jadi diganti alur pilih-mesin yang disimulasikan sepenuhnya di
// browser: pilih salah satu dari 2 mesin dummy, "terhubung" setelah jeda
// singkat, lengkap dengan info port palsu supaya tetap terasa nyata.
// ============================================================================
"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Wifi, CreditCard, Check } from "lucide-react";
import { Btn } from "../components/ui/Btn";
import { useToast } from "../context/ToastContext";

type DeviceId = "biru" | "putih";

interface DeviceOption {
  id: DeviceId;
  name: string;
  model: string;
  swatchClass: string;
  port: string;
}

const DEVICES: DeviceOption[] = [
  { id: "biru", name: "EDC BIRU", model: "PAX A920 Pro", swatchClass: "bg-[#2563EB]", port: "COM3" },
  { id: "putih", name: "EDC PUTIH", model: "Verifone V240m", swatchClass: "bg-white border border-ink/20", port: "COM5" },
];

type Step = "select" | "connecting" | "connected";

export function EdcSetupPage() {
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>("select");
  const [device, setDevice] = useState<DeviceOption | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | null>(null);
  const frontendUrl = typeof window !== "undefined" ? window.location.origin : "";

  function handleConnect(d: DeviceOption) {
    setDevice(d);
    setStep("connecting");
    setTimeout(() => {
      setStep("connected");
      showToast({ type: "success", message: "Berhasil terhubung", description: `${d.name} (${d.port})` });
    }, 1100);
  }

  function handleDisconnect() {
    setStep("select");
    setDevice(null);
    setTestResult(null);
  }

  function handleTest() {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      setTestResult("ok");
    }, 700);
  }

  if (step === "select" || step === "connecting") {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-md">
          <div className="mb-5">
            <h1 className="font-display text-xl font-semibold">Pengaturan EDC</h1>
            <p className="text-sm text-ink-soft">Pilih mesin EDC yang tersambung ke komputer ini.</p>
          </div>

          <div className="space-y-3">
            {DEVICES.map((d) => {
              const isConnectingThis = step === "connecting" && device?.id === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => step === "select" && handleConnect(d)}
                  disabled={step === "connecting"}
                  className="flex w-full items-center gap-4 rounded-xl border border-ink/10 bg-white p-4 text-left shadow-sm transition-colors hover:border-brass hover:bg-brass/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className={`h-10 w-10 flex-shrink-0 rounded-full ${d.swatchClass}`} />
                  <span className="flex-1">
                    <span className="block font-display font-semibold text-ink">{d.name}</span>
                    <span className="block text-xs text-ink-soft">{d.model}</span>
                  </span>
                  {isConnectingThis ? (
                    <Loader2 size={18} className="animate-spin text-brass" />
                  ) : (
                    <CreditCard size={18} className="text-ink-soft/50" />
                  )}
                </button>
              );
            })}
          </div>

          {step === "connecting" && (
            <p className="mt-4 flex items-center gap-2 text-xs text-ink-soft">
              <Loader2 size={13} className="animate-spin" /> Menghubungkan ke {device?.name}…
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center gap-2 rounded-md bg-teal/10 px-3 py-2 text-xs text-teal">
          <Wifi size={14} /> Terhubung ke {device?.name}
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3 rounded-md bg-paper-dim px-3 py-3">
            <span className={`h-9 w-9 flex-shrink-0 rounded-full ${device?.swatchClass}`} />
            <div>
              <p className="font-display text-sm font-semibold text-ink">{device?.name}</p>
              <p className="text-xs text-ink-soft">{device?.model} · Port {device?.port}</p>
            </div>
          </div>

          <div className="mb-4">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Alamat pelaporan (otomatis)</span>
            <div className="rounded-md border border-ink/10 bg-paper-dim px-3 py-2 font-mono text-xs text-ink-soft">{frontendUrl}</div>
            <p className="mt-1 text-xs text-ink-soft">
              Diambil otomatis dari alamat Nota POS yang sedang Anda buka - tidak perlu diketik manual.
            </p>
          </div>

          <div className="flex gap-2">
            <Btn v="secondary" disabled={testing} onClick={handleTest} ch={testing ? <><Loader2 size={14} className="animate-spin" /> Menguji…</> : <><CreditCard size={14} /> Tes Koneksi</>} />
            <Btn v="secondary" onClick={handleDisconnect} ch={<><RefreshCw size={14} /> Ganti Mesin</>} />
          </div>

          {testResult === "ok" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-teal"><Check size={13} /> Berhasil terhubung ke {device?.name}</p>
          )}
        </div>

        <p className="mt-4 text-xs text-ink-soft">
          Pengaturan ini tersimpan di komputer ini saja - kalau ganti komputer kasir, perlu dipilih ulang di komputer yang baru.
        </p>
      </div>
    </div>
  );
}
