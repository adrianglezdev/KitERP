import { useState } from 'react';
import { appName, useBrand } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Logo de Kite: una cometa con cuatro caras, una por pilar (Personas, Comercial, Operaciones, Finanzas).
 * Toma los colores del tema, así que cambia con la apariencia de cada empresa.
 */
export function Logo({ className, stroke = 'rgb(var(--surface))' }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="-4 -2 108 104" className={className} aria-hidden>
      <g transform="rotate(-12 50 50)" stroke={stroke} strokeWidth="3.2" strokeLinejoin="round">
        <path d="M50 4 L15 37 L50 37 Z" fill="rgb(var(--primary))" />
        <path d="M50 4 L85 37 L50 37 Z" fill="rgb(var(--earth))" />
        <path d="M15 37 L50 96 L50 37 Z" fill="rgb(var(--leaf))" />
        <path d="M85 37 L50 96 L50 37 Z" fill="rgb(var(--sun))" />
      </g>
    </svg>
  );
}

/**
 * Símbolo de la marca: el logo de la empresa si lo ha subido; si no, la cometa.
 * El logo va sobre una baldosa blanca para que se lea también en barras oscuras.
 */
export function BrandMark({ className, stroke, size = 'md' }: { className?: string; stroke?: string; size?: 'sm' | 'md' | 'lg' }) {
  const brand = useBrand();
  const [roto, setRoto] = useState<string | null>(null);
  const box = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  if (brand?.logoUrl && roto !== brand.logoUrl) {
    return (
      <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1', box, className)}>
        <img src={brand.logoUrl} alt="" className="max-h-full max-w-full object-contain" onError={() => setRoto(brand.logoUrl)} />
      </span>
    );
  }
  return <Logo className={cn('shrink-0', box, className)} stroke={stroke} />;
}

/** Nombre de la aplicación tal como lo ha definido la empresa. Sin personalizar: «kite ERP». */
export function BrandName({ className, badgeClassName }: { className?: string; badgeClassName?: string }) {
  const brand = useBrand();
  const propio = brand?.apariencia.nombreApp || brand?.nombre;
  if (propio) return <span className={cn('truncate font-display font-bold tracking-[-0.03em]', className)}>{appName(brand)}</span>;
  return (
    <span className={cn('font-display font-bold tracking-[-0.03em]', className)}>
      kite
      <span className={cn('ml-1.5 rounded-pill bg-sun px-1.5 py-px align-middle font-sans text-[10px] font-bold tracking-normal text-sun-fg', badgeClassName)}>ERP</span>
    </span>
  );
}

export function LogoLockup({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark />
      <BrandName className="text-[24px]" />
    </span>
  );
}
