// src/app/components/ui/StatCard.tsx
import { cn } from "../../utils/cn";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string; // e.g. "bg-register/10 text-register"
}

export function StatCard({ label, value, sub, icon, color }: StatCardProps) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-ink/10 bg-white p-5">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", color)}>{icon}</div>
      <div>
        <p className="text-xs font-medium text-ink-soft">{label}</p>
        <p className="font-mono text-2xl font-bold tabular text-ink">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>}
      </div>
    </div>
  );
}
