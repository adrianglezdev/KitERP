import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as P from '@radix-ui/react-popover';
import type { Pillar } from '@kite/shared';
import { useIsMobile } from '@/lib/hooks';
import { cn, PILLAR_CLASSES } from '@/lib/utils';
import { Sheet } from '@/components/ui';
import type { AppInfo, Departamento } from './apps';

/** Baldosa de color con el icono de una aplicación. El color es el de su pilar. */
export function AppIcon({ app, size = 'md', className }: { app: AppInfo; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return <PillarIcon pillar={app.pillar} icon={app.icon} size={size} className={className} />;
}

function PillarIcon({ pillar, icon: Icon, size = 'md', className }: { pillar: Pillar; icon: AppInfo['icon']; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-12 w-12 rounded-2xl';
  const ic = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : 'h-6 w-6';
  return (
    <span className={cn('flex shrink-0 items-center justify-center', box, PILLAR_CLASSES[pillar]!.solid, className)}>
      <Icon className={ic} />
    </span>
  );
}

/**
 * Cuadrícula de departamentos, al estilo del lanzador de Google: una tarjeta con un icono grande
 * por departamento y su nombre debajo. Al pasar por encima se ven sus aplicaciones.
 */
function LauncherBody({ deps, currentId, onPick, heading = true }: { deps: Departamento[]; currentId?: Pillar; onPick: () => void; heading?: boolean }) {
  return (
    <nav aria-label="Departamentos" className="rounded-[20px] bg-surface p-2">
      {heading && <h2 className="px-3 pb-1 pt-2 font-display text-[18px] font-medium">Departamentos</h2>}
      <ul className="grid grid-cols-3 gap-0.5">
        {deps.map((d) => {
          const activo = d.id === currentId;
          return (
            <li key={d.id}>
              <Link
                to={d.home}
                onClick={onPick}
                title={d.apps.map((a) => a.label).join(' · ')}
                aria-current={activo ? 'true' : undefined}
                className={cn('flex w-full flex-col items-center gap-2 rounded-2xl px-1 pb-3 pt-3 outline-none transition-colors hover:bg-sunken focus-visible:bg-sunken', activo && 'bg-sunken')}
              >
                <PillarIcon pillar={d.id} icon={d.icon} />
                <span className="w-full truncate text-center text-[13px] font-medium leading-tight">{d.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Lanzador de la cabecera: se elige el departamento y la barra lateral pasa a mostrar sus
 * aplicaciones. En el móvil se abre como panel inferior.
 */
export function AppLauncher({
  deps,
  currentId,
  open,
  onOpenChange,
  children,
  side = 'bottom',
  align = 'end',
}: {
  deps: Departamento[];
  currentId?: Pillar;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Botón que lo abre. */
  children: ReactNode;
  side?: 'bottom' | 'right';
  align?: 'start' | 'end';
}) {
  const mobile = useIsMobile();
  const body = <LauncherBody deps={deps} currentId={currentId} onPick={() => onOpenChange(false)} heading={!mobile} />;
  if (mobile) {
    return (
      <>
        <span onClick={() => onOpenChange(true)} className="contents">
          {children}
        </span>
        <Sheet open={open} onOpenChange={onOpenChange} side="bottom" title="Departamentos">
          <div className="px-2 pb-4">{body}</div>
        </Sheet>
      </>
    );
  }
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{children}</P.Trigger>
      <P.Portal>
        <P.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[340px] rounded-[28px] bg-sunken p-2 shadow-pop outline-none ring-1 ring-line-strong/50 data-[state=open]:animate-pop-in"
          aria-label="Departamentos"
        >
          {body}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
