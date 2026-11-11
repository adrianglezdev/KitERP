/** Logo de Kite: una cometa con cuatro caras, una por pilar (Personas, Comercial, Operaciones, Finanzas). */
export function Logo({ className, stroke = 'rgb(var(--surface))' }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="-4 -2 108 104" className={className} aria-hidden>
      <g transform="rotate(-12 50 50)" stroke={stroke} strokeWidth="3.2" strokeLinejoin="round">
        <path d="M50 4 L15 37 L50 37 Z" fill="#F1DE07" />
        <path d="M50 4 L85 37 L50 37 Z" fill="#7D2CDD" />
        <path d="M15 37 L50 96 L50 37 Z" fill="#35AE29" />
        <path d="M85 37 L50 96 L50 37 Z" fill="#B28574" />
      </g>
    </svg>
  );
}

export function LogoLockup({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <Logo className="h-9 w-9" />
      <span className="font-display text-[26px] font-extrabold tracking-tight">
        kite<span className="ml-1 align-top font-mono text-[11px] font-medium tracking-widest text-muted">ERP</span>
      </span>
    </span>
  );
}
