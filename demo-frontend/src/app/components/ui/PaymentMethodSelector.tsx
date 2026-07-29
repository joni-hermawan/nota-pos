"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, QrCode, CreditCard, Loader2, CheckCircle2, XCircle, ArrowLeft, RefreshCw, Wifi, WifiOff, Clock } from "lucide-react";
import { cn } from "../../utils/cn";
import { transactionApi } from "../../api";
import type { PaymentMethod } from "../../types";

type Props = {
  transactionId: string;
  total: number;
  itemCount?: number;
  onPaid: (info: { method: PaymentMethod; amountReceived?: number }) => void;
  onBack?: () => void;
};
type Step = "select" | "cash" | "qris" | "edc" | "success" | "failed";
type EdcConnectionState = "checking" | "connected" | "disconnected" | null;

export function PaymentMethodSelector({ transactionId, total, itemCount, onPaid, onBack }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [chosenMethod, setChosenMethod] = useState<PaymentMethod | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null); // epoch ms
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number | null>(null);
  const [edcConnection, setEdcConnection] = useState<EdcConnectionState>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // true begitu SSE timeout habis TANPA pernah dapat status paid/failed -
  // di titik ini kita tawarkan tombol "Cek Status Sekarang" (manual pull ke
  // gateway), bukan cuma teks yang menjanjikan sesuatu yang tidak ada.
  const [timedOut, setTimedOut] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopWaiting() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setPolling(false);
  }

  useEffect(() => stopWaiting, []);

  // Hitung mundur waktu QR - dari qrExpiresAt (dikirim backend, ambil dari
  // Midtrans kalau ada, atau fallback now+15menit) sampai 0. Dihitung ulang
  // tiap detik dari epoch, bukan cuma decrement lokal, supaya tetap akurat
  // walau tab sempat di-background (setInterval bisa di-throttle browser).
  useEffect(() => {
    if (!qrExpiresAt) {
      setQrSecondsLeft(null);
      return;
    }
    const tick = () => setQrSecondsLeft(Math.max(0, Math.round((qrExpiresAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [qrExpiresAt]);

  const change = Math.max(0, amountReceived - total);

  async function chooseMethod(m: PaymentMethod) {
    setError(null);
    setTimedOut(false);
    setChosenMethod(m);

    if (m === "cash") {
      setStep("cash");
      return;
    }
    if (m === "qris") {
      setStep("qris");
      try {
        const res = await transactionApi.pay(transactionId, "qris");
        setQrImage(res.qrImageUrl ?? null);
        setQrExpiresAt(res.qrExpiresAt ? new Date(res.qrExpiresAt).getTime() : null);
        waitForStatus();
      } catch {
        setError("Gagal membuat kode QRIS. Coba lagi.");
        setStep("select");
      }
      return;
    }
    if (m === "edc") {
      setStep("edc");
      await chargeViaEdc();
    }
  }

  // ── DEMO MODE ─────────────────────────────────────────────────────────
  // Versi asli mengecek koneksi ke agent EDC lokal (aplikasi kecil yang
  // jalan di PC kasir, bicara ke mesin EDC fisik via USB/serial) sebelum
  // charge. Prototype ini tidak punya backend/hardware sungguhan, jadi
  // langkah itu disimulasikan: "terhubung" setelah jeda singkat, lalu
  // pembayaran otomatis berhasil - supaya alurnya tetap terasa hidup tanpa
  // bergantung pada apa pun di luar browser.
  async function chargeViaEdc() {
    setEdcConnection("checking");
    await new Promise((r) => setTimeout(r, 900));
    setEdcConnection("connected");
    waitForStatus();
  }

  // Simulasi notifikasi real-time (aslinya lewat Server-Sent Events dari
  // backend) - di demo ini cukup timer singkat lalu tandai transaksi lunas
  // lewat mock transactionApi.pay(), supaya data di halaman lain (Riwayat,
  // Dashboard) ikut konsisten ter-update.
  function waitForStatus() {
    stopWaiting();
    setTimedOut(false);
    setPolling(true);

    timeoutRef.current = setTimeout(async () => {
      try {
        await transactionApi.pay(transactionId, chosenMethod ?? "qris");
        stopWaiting();
        setStep("success");
        onPaid({ method: chosenMethod ?? "qris" });
      } catch {
        stopWaiting();
        setStep("failed");
      }
    }, 1800);
  }

  // Manual, SEKALI-KLIK check ke gateway (bukan polling berulang) - dipakai
  // saat push (webhook) tidak pernah sampai, misal karena backend masih di
  // localhost yang tidak bisa dihubungi Midtrans dari internet.
  async function handleCheckStatusNow() {
    setCheckingStatus(true);
    setError(null);
    try {
      const res = await transactionApi.checkQrisStatus(transactionId);
      if (res.status === "paid") {
        setStep("success");
        onPaid({ method: "qris" });
      } else if (res.status === "failed") {
        setStep("failed");
      } else {
        setError(`Masih ${res.gatewayStatus || "pending"} di sisi gateway - coba cek lagi beberapa saat lagi.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memeriksa status ke gateway.");
    } finally {
      setCheckingStatus(false);
    }
  }

  function handleCancel() {
    stopWaiting();
    setTimedOut(false);
    setEdcConnection(null);
    setQrExpiresAt(null);
    setStep("select");
  }

  async function confirmCash() {
    if (amountReceived < total) return;
    await transactionApi.pay(transactionId, "cash", amountReceived);
    setStep("success");
    onPaid({ method: "cash", amountReceived });
  }

  if (step === "select") {
    return (
      <div>
        {onBack && (
          <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink">
            <ArrowLeft size={14} /> Kembali ke keranjang
          </button>
        )}

        <div className="mb-4 rounded-md bg-paper-dim px-3 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-ink-soft">
              {itemCount !== undefined ? `${itemCount} item` : "Total tagihan"}
            </span>
            <span className="font-mono text-lg font-semibold tabular text-ink">Rp {total.toLocaleString("id-ID")}</span>
          </div>
        </div>

        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft">Pilih metode pembayaran</p>
        {error && <p className="mb-3 text-sm text-alert">{error}</p>}
        <div className="grid grid-cols-3 gap-3">
          <MethodButton icon={Banknote} label="Cash" onClick={() => chooseMethod("cash")} />
          <MethodButton icon={QrCode} label="QRIS" onClick={() => chooseMethod("qris")} />
          <MethodButton icon={CreditCard} label="EDC" onClick={() => chooseMethod("edc")} />
        </div>
      </div>
    );
  }

  if (step === "cash") {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Uang diterima</p>
        <input
          type="number"
          autoFocus
          value={amountReceived || ""}
          onChange={(e) => setAmountReceived(Number(e.target.value))}
          className="w-full rounded-md border border-ink/15 px-3 py-2 font-mono text-lg tabular"
          placeholder="0"
        />
        <div className="flex justify-between font-mono text-sm">
          <span className="text-ink-soft">Total tagihan</span>
          <span className="tabular">Rp {total.toLocaleString("id-ID")}</span>
        </div>
        <div className="flex justify-between font-mono text-sm font-semibold">
          <span>Kembalian</span>
          <span className="tabular text-teal">Rp {change.toLocaleString("id-ID")}</span>
        </div>
        <button
          onClick={confirmCash}
          disabled={amountReceived < total}
          className="w-full rounded-md bg-register py-2.5 text-sm font-medium text-paper disabled:opacity-40"
        >
          Konfirmasi pembayaran
        </button>
        <button onClick={() => setStep("select")} className="w-full text-xs text-ink-soft">
          Batal, pilih metode lain
        </button>
      </div>
    );
  }

  if (step === "qris") {
    const isExpired = qrSecondsLeft === 0;
    const minutes = qrSecondsLeft !== null ? Math.floor(qrSecondsLeft / 60) : null;
    const seconds = qrSecondsLeft !== null ? qrSecondsLeft % 60 : null;

    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Scan QRIS untuk membayar</p>
        <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-ink/20 bg-white">
          {isExpired ? (
            <div className="flex flex-col items-center gap-1 px-3 text-alert">
              <Clock size={22} />
              <span className="text-xs font-medium">QR kadaluarsa</span>
            </div>
          ) : qrImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImage} alt="QRIS" className="h-full w-full object-contain p-2" />
          ) : (
            <Loader2 className="animate-spin text-ink-soft" />
          )}
        </div>
        <p className="font-mono text-lg tabular">Rp {total.toLocaleString("id-ID")}</p>

        {qrSecondsLeft !== null && !isExpired && (
          <p className={cn("flex items-center gap-1.5 font-mono text-xs tabular", qrSecondsLeft <= 30 ? "text-alert" : "text-ink-soft")}>
            <Clock size={13} />
            Berlaku {minutes}:{String(seconds).padStart(2, "0")} lagi
          </p>
        )}

        {isExpired ? (
          <button
            onClick={() => void chooseMethod("qris")}
            className="flex items-center gap-2 rounded-md bg-register px-4 py-2 text-sm font-medium text-paper"
          >
            <RefreshCw size={14} /> Buat kode baru
          </button>
        ) : (
          <>
            {polling && !timedOut && (
              <p className="flex items-center gap-2 text-xs text-ink-soft">
                <Loader2 size={14} className="animate-spin" /> Menunggu pembayaran…
              </p>
            )}

            {timedOut && (
              <div className="w-full space-y-2 rounded-md bg-brass/10 px-3 py-3 text-left">
                <p className="text-xs text-ink-soft">
                  Belum ada konfirmasi otomatis. Kalau Anda sudah bayar/simulasikan di sandbox, klik ini untuk cek langsung ke gateway:
                </p>
                <button
                  onClick={handleCheckStatusNow}
                  disabled={checkingStatus}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-register py-2 text-sm font-medium text-paper disabled:opacity-50"
                >
                  {checkingStatus ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Cek Status Sekarang
                </button>
              </div>
            )}
          </>
        )}

        {error && <p className="text-xs text-alert">{error}</p>}
        <button onClick={handleCancel} className="text-xs text-ink-soft">Batalkan</button>
      </div>
    );
  }

  if (step === "edc") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Ikuti instruksi di mesin EDC</p>
        <CreditCard size={48} className="text-brass" />
        <p className="font-mono text-lg tabular">Rp {total.toLocaleString("id-ID")}</p>

        {edcConnection === "checking" && (
          <p className="flex items-center gap-2 text-xs text-ink-soft">
            <Loader2 size={14} className="animate-spin" /> Mengecek koneksi ke mesin EDC…
          </p>
        )}
        {edcConnection === "connected" && !timedOut && (
          <p className="flex items-center gap-2 text-xs text-teal">
            <Wifi size={14} /> Terhubung ke mesin EDC - menunggu kartu / approval bank…
          </p>
        )}
        {edcConnection === "disconnected" && (
          <div className="w-full space-y-2 rounded-md bg-alert/10 px-3 py-3 text-left">
            <p className="flex items-center gap-2 text-xs font-medium text-alert">
              <WifiOff size={14} /> Tidak terhubung ke mesin EDC
            </p>
            <p className="text-xs text-ink-soft">Pastikan aplikasi agent EDC menyala di PC ini dan kabel USB mesin EDC tersambung.</p>
            <button
              onClick={() => void chargeViaEdc()}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-register py-2 text-sm font-medium text-paper"
            >
              <RefreshCw size={14} /> Coba Lagi
            </button>
          </div>
        )}
        {edcConnection === "connected" && timedOut && (
          <p className="text-xs text-alert">
            Sudah terhubung, tapi belum ada konfirmasi transaksi. Cek layar mesin EDC, atau batalkan dan coba lagi.
          </p>
        )}

        {error && edcConnection !== "disconnected" && <p className="text-xs text-alert">{error}</p>}
        <button onClick={handleCancel} className="text-xs text-ink-soft">Batalkan</button>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 size={40} className="text-teal" />
        <p className="font-display font-semibold">Pembayaran berhasil</p>
        <p className="text-xs text-ink-soft">Struk sedang dicetak…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <XCircle size={40} className="text-alert" />
      <p className="font-display font-semibold">Pembayaran gagal</p>
      <button onClick={() => setStep("select")} className="text-xs text-ink-soft underline">Coba metode lain</button>
    </div>
  );
}

function MethodButton({ icon: Icon, label, onClick }: { icon: typeof Banknote; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-ink/10 bg-white py-5 text-sm font-medium",
        "hover:border-brass hover:bg-brass/5 transition-colors"
      )}
    >
      <Icon size={22} className="text-register" />
      {label}
    </button>
  );
}
