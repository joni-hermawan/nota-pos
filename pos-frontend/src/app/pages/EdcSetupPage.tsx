// src/app/pages/EdcSetupPage.tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Wifi, WifiOff, CreditCard, AlertTriangle } from "lucide-react";
import { Btn } from "../components/ui/Btn";
import { useToast } from "../context/ToastContext";

const AGENT_URL = "http://localhost:9100";

interface AgentConfig {
  serialPort: string;
  frontendUrl: string;
  listenPort: string;
}

type AgentState = "checking" | "not-running" | "ready";

export function EdcSetupPage() {
  const { showToast } = useToast();

  const [agentState, setAgentState] = useState<AgentState>("checking");
  const [ports, setPorts] = useState<string[]>([]);
  const [serialPort, setSerialPort] = useState("");
  // frontendUrl SELALU diisi otomatis dari window.location.origin (alamat
  // Nota POS yang sedang dibuka kasir SEKARANG ini) - PC kasir memang
  // tidak perlu tahu/mengetik alamat apa pun selain yang sudah mereka buka
  // di browser.
  const [frontendUrl, setFrontendUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  function loadFromAgent() {
    setAgentState("checking");
    Promise.all([
      fetch(`${AGENT_URL}/edc/config`).then((r) => {
        if (!r.ok) throw new Error("agent tidak merespons");
        return r.json() as Promise<AgentConfig>;
      }),
      fetch(`${AGENT_URL}/edc/ports`).then((r) => r.json() as Promise<{ ports: string[] }>),
    ])
      .then(([cfg, portsRes]) => {
        setSerialPort(cfg.serialPort);
        setPorts(portsRes.ports ?? []);
        setAgentState("ready");
      })
      .catch(() => setAgentState("not-running"));
  }
  useEffect(loadFromAgent, []);

  // Selalu pakai origin browser SAAT INI - bukan nilai yang tersimpan di
  // agent - supaya kalau suatu saat alamat Nota POS berubah (ganti domain,
  // pindah server), cukup buka halaman ini lagi dari alamat yang baru dan
  // Simpan, tanpa perlu tahu/mengetik alamat apa pun secara manual.
  useEffect(() => {
    setFrontendUrl(window.location.origin);
  }, []);

  async function handleSave() {
    if (!serialPort) {
      showToast({ type: "error", message: "Pilih port USB dulu" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${AGENT_URL}/edc/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialPort, frontendUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast({ type: "success", message: "Pengaturan EDC disimpan", description: `Port: ${serialPort}` });
      setTestResult(null);
    } catch (err) {
      showToast({ type: "error", message: "Gagal menyimpan", description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${AGENT_URL}/edc/check-connection`);
      setTestResult(res.ok ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  }

  if (agentState === "checking") {
    return <div className="flex items-center gap-2 p-6 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Menghubungi agent EDC di komputer ini…</div>;
  }

  if (agentState === "not-running") {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-md rounded-xl border border-dashed border-alert/30 bg-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-alert/10">
            <WifiOff size={22} className="text-alert" />
          </div>
          <h3 className="font-display font-semibold text-ink">Agent EDC belum berjalan</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Jalankan dulu <code className="rounded bg-paper-dim px-1 py-0.5 font-mono text-xs">nota-edc-agent.exe</code> di komputer ini
            (double-click file-nya), lalu kembali ke halaman ini.
          </p>
          <Btn cls="mt-4" ch={<><RefreshCw size={14} /> Coba Lagi</>} onClick={loadFromAgent} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center gap-2 rounded-md bg-teal/10 px-3 py-2 text-xs text-teal">
          <Wifi size={14} /> Agent EDC terdeteksi di komputer ini
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Port USB mesin EDC</span>
            {ports.length === 0 ? (
              <p className="mb-2 flex items-center gap-1.5 text-xs text-alert">
                <AlertTriangle size={12} /> Tidak ada port terdeteksi - pastikan kabel USB mesin EDC tersambung
              </p>
            ) : null}
            <select value={serialPort} onChange={(e) => setSerialPort(e.target.value)} className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm">
              <option value="">Pilih port…</option>
              {ports.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              {serialPort && !ports.includes(serialPort) && <option value={serialPort}>{serialPort} (tersimpan sebelumnya)</option>}
            </select>
            <button onClick={loadFromAgent} className="mt-1.5 flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
              <RefreshCw size={11} /> Deteksi ulang port
            </button>
          </label>

          <div className="mb-4">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">Alamat pelaporan (otomatis)</span>
            <div className="rounded-md border border-ink/10 bg-paper-dim px-3 py-2 font-mono text-xs text-ink-soft">{frontendUrl}</div>
            <p className="mt-1 text-xs text-ink-soft">
              Diambil otomatis dari alamat Nota POS yang sedang Anda buka - tidak perlu diketik manual.
            </p>
          </div>

          <div className="flex gap-2">
            <Btn cls="flex-1 justify-center" disabled={saving} onClick={handleSave} ch={saving ? <><Loader2 size={14} className="animate-spin" /> Menyimpan…</> : "Simpan"} />
            <Btn v="secondary" disabled={testing || !serialPort} onClick={handleTest} ch={testing ? <><Loader2 size={14} className="animate-spin" /> Menguji…</> : <><CreditCard size={14} /> Tes Koneksi</>} />
          </div>

          {testResult === "ok" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-teal"><Wifi size={13} /> Berhasil terhubung ke mesin EDC</p>
          )}
          {testResult === "fail" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-alert"><WifiOff size={13} /> Tidak bisa terhubung - cek kabel USB & port yang dipilih</p>
          )}
        </div>

        <p className="mt-4 text-xs text-ink-soft">
          Pengaturan ini tersimpan di komputer ini saja (di agent EDC-nya) - kalau ganti komputer kasir, perlu diatur ulang di komputer yang baru.
        </p>
      </div>
    </div>
  );
}
