import { useEffect, type ReactNode } from 'react';
import type { Apariencia } from '@kite/shared';
import { applyBrand } from '@/lib/theme';
import { BrandMark } from '@/layout/Logo';

export interface MarcaPublica {
  nombre: string | null;
  logoUrl: string | null;
  apariencia: Apariencia;
}

/**
 * Pinta la página con la marca que envía el servidor (la de la empresa dueña del enlace).
 * No la guarda: quien abre un enlace de otra empresa no cambia el tema de la suya.
 */
export function BrandFromServer({ marca }: { marca?: MarcaPublica | null }) {
  const clave = marca ? JSON.stringify(marca.apariencia) + (marca.logoUrl ?? '') : null;
  useEffect(() => {
    if (marca) applyBrand({ empresaId: null, nombre: marca.nombre, logoUrl: marca.logoUrl, apariencia: marca.apariencia }, { visitor: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return null;
}

/** Marco de las páginas públicas (clientes, firmantes, informantes): sencillo y con la marca de la empresa. */
export function PublicLayout({ empresa, logoUrl, marca, children }: { empresa?: string | null; logoUrl?: string | null; marca?: MarcaPublica | null; children: ReactNode }) {
  const logo = logoUrl ?? marca?.logoUrl;
  return (
    <div className="min-h-dvh bg-bg">
      <BrandFromServer marca={marca} />
      <header className="mx-auto max-w-3xl px-3 pt-3 sm:px-4">
        <div className="flex h-16 items-center gap-3 rounded-2xl bg-surface px-4 shadow-card">
          {logo ? <img src={logo} alt="" className="h-9 max-w-[160px] object-contain" /> : <BrandMark size="sm" />}
          <span className="min-w-0 truncate font-display text-[17px] font-semibold tracking-tight">{empresa ?? marca?.nombre}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-3 py-5 pb-16 sm:px-4">{children}</main>
      <footer className="pb-8 text-center text-[12px] font-medium text-muted">Gestionado con KiteERP</footer>
    </div>
  );
}
