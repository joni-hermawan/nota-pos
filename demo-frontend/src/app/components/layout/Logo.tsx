// src/app/components/layout/Logo.tsx
export function Logo({ variant = "dark", size = 32, src = null }: { variant?: "light" | "dark"; size?: number; src?: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="Logo" style={{ height: size }} className="object-contain" />;
  }
  const stroke = variant === "light" ? "#FAF8F3" : "#0B3D2E";
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <rect x="4" y="8" width="32" height="26" rx="2" stroke={stroke} strokeWidth="2.5" />
        <path d="M10 8V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3" stroke={stroke} strokeWidth="2.5" />
        <circle cx="20" cy="21" r="5" fill="#C7973B" />
      </svg>
      <span className={`font-display font-semibold tracking-tight ${variant === "light" ? "text-paper" : "text-register"}`} style={{ fontSize: size * 0.5 }}>
        Nota
      </span>
    </div>
  );
}
