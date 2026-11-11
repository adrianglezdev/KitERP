import type { ReactNode } from 'react';
import { Logo } from '@/layout/Logo';

/** Marco de las páginas públicas (clientes, firmantes, informantes): sencillo y con la marca de la empresa. */
export function PublicLayout({ empresa, logoUrl, children }: { empresa?: string | null; logoUrl?: string | null; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          {logoUrl ? <img src={logoUrl} alt={empresa ?? ''} className="h-9 max-w-[160px] object-contain" /> : <Logo className="h-8 w-8" />}
          <span className="font-display text-[17px] font-bold">{empresa}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">{children}</main>
      <footer className="pb-8 text-center text-[12px] text-muted">Gestionado con KiteERP</footer>
    </div>
  );
}
