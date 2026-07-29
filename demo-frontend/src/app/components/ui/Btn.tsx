// src/app/components/ui/Btn.tsx
import { cn } from "../../utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "xs" | "sm" | "md";

const sizes: Record<Size, string> = {
  xs: "px-2.5 py-1 text-xs gap-1",
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-1.5",
};

// Palet Nota POS (register-green/brass), bukan slate/blue - identitas
// visual produk kita, tapi API komponennya sama seperti referensi.
const variants: Record<Variant, string> = {
  primary: "bg-register text-paper hover:bg-register-light shadow-sm",
  secondary: "bg-white text-ink hover:bg-paper-dim border border-ink/15 shadow-sm",
  ghost: "text-ink-soft hover:text-ink hover:bg-ink/5",
  danger: "bg-alert/10 text-alert hover:bg-alert/20 border border-alert/20",
  outline: "text-brass hover:bg-brass/10 border border-brass/40",
};

interface BtnProps {
  ch: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  v?: Variant;
  sz?: Size;
  disabled?: boolean;
  cls?: string;
  type?: "button" | "submit";
}

export function Btn({ ch, onClick, v = "primary", sz = "md", disabled, cls, type = "button" }: BtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center font-medium rounded-lg transition-all cursor-pointer select-none",
        sizes[sz],
        variants[v],
        disabled && "opacity-50 cursor-not-allowed",
        cls
      )}
    >
      {ch}
    </button>
  );
}
