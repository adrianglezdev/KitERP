import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import * as D from '@radix-ui/react-dialog';
import * as M from '@radix-ui/react-dropdown-menu';
import * as T from '@radix-ui/react-tooltip';
import { AlertTriangle, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/* ── Diálogo centrado (en móvil ocupa casi toda la pantalla) ── */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-fg/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in dark:bg-black/55" />
        <D.Content
          className={cn(
            'fixed z-50 flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-pop focus:outline-none',
            'bottom-0 left-0 rounded-t-3xl data-[state=open]:animate-slide-up sm:bottom-auto sm:left-1/2 sm:top-[8vh] sm:max-h-[84dvh] sm:-translate-x-1/2 sm:rounded-3xl sm:data-[state=open]:animate-fade-in',
            size === 'sm' && 'sm:max-w-md',
            size === 'md' && 'sm:max-w-xl',
            size === 'lg' && 'sm:max-w-3xl',
            size === 'xl' && 'sm:max-w-5xl',
          )}
        >
          <div className="flex items-start gap-3 px-5 pb-2 pt-5">
            <div className="min-w-0 flex-1">
              <D.Title className="font-display text-[18px] font-semibold tracking-tight">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-[13px] text-muted">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
            </div>
            <D.Close className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-sunken hover:text-fg" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </D.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2">{children}</div>
          {footer && <div className="safe-bottom flex flex-wrap items-center justify-end gap-2 bg-sunken/60 px-5 py-3.5">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/* ── Panel lateral (detalle rápido, filtros, menú móvil) ── */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  side = 'right',
  footer,
  width = 'max-w-md',
  tone = 'surface',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: ReactNode;
  children: ReactNode;
  side?: 'right' | 'left' | 'bottom';
  footer?: ReactNode;
  width?: string;
  /** Fondo del panel: `sunken` para contenidos hechos de tarjetas; `none` si el contenido trae el suyo. */
  tone?: 'surface' | 'sunken' | 'none';
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-fg/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in dark:bg-black/55" />
        <D.Content
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden shadow-pop focus:outline-none',
            tone === 'surface' && 'bg-surface',
            tone === 'sunken' && 'bg-sunken',
            // En pantallas anchas el panel flota separado del borde, como el resto de bloques
            side === 'right' && `inset-y-0 right-0 w-full ${width} data-[state=open]:animate-slide-left sm:inset-y-3 sm:right-3 sm:w-[calc(100%-24px)] sm:rounded-3xl`,
            side === 'left' && 'inset-y-0 left-0 w-[86%] max-w-[300px] rounded-r-3xl data-[state=open]:animate-slide-right',
            side === 'bottom' && 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl data-[state=open]:animate-slide-up',
          )}
        >
          {title ? (
            <div className="safe-top flex items-center gap-3 px-5 pb-2 pt-4">
              <D.Title className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold tracking-tight">{title}</D.Title>
              <D.Close className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-muted hover:bg-sunken hover:text-fg" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </D.Close>
            </div>
          ) : (
            <D.Title className="sr-only">Panel</D.Title>
          )}
          <D.Description className="sr-only">Panel</D.Description>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="safe-bottom bg-sunken/60 px-5 py-3.5">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/* ── Confirmación (sustituye a window.confirm) ── */
interface ConfirmOpts {
  title: string;
  message?: ReactNode;
  confirm?: string;
  danger?: boolean;
  input?: { label: string; placeholder?: string; required?: boolean };
}
type ConfirmFn = (o: ConfirmOpts) => Promise<false | string | true>;
const ConfirmCtx = createContext<ConfirmFn>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: false | string | true) => void }) | null>(null);
  const [text, setText] = useState('');
  const confirm = useCallback<ConfirmFn>(
    (o) =>
      new Promise((resolve) => {
        setText('');
        setState({ ...o, resolve });
      }),
    [],
  );
  const close = (v: false | string | true) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onOpenChange={(o) => !o && close(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            {state?.danger && <AlertTriangle className="h-5 w-5 text-bad" />}
            {state?.title}
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button
              variant={state?.danger ? 'danger' : 'primary'}
              disabled={!!state?.input?.required && !text.trim()}
              onClick={() => close(state?.input ? text.trim() : true)}
            >
              {state?.confirm ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        {state?.message && <div className="text-[14px] text-fg/85">{state.message}</div>}
        {state?.input && (
          <div className="mt-3">
            <label className="label" htmlFor="confirm-input">
              {state.input.label}
            </label>
            <textarea id="confirm-input" className="field-input min-h-[80px]" value={text} placeholder={state.input.placeholder} onChange={(e) => setText(e.target.value)} autoFocus />
          </div>
        )}
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

/* ── Menú desplegable ── */
export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  hidden?: boolean;
}
export function Menu({ trigger, items, align = 'end' }: { trigger: ReactNode; items: MenuItem[]; align?: 'start' | 'end' }) {
  const visible = items.filter((i) => !i.hidden);
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content align={align} sideOffset={8} collisionPadding={8} className="scroll-thin z-50 max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] min-w-[220px] overflow-y-auto rounded-2xl bg-surface p-2 shadow-pop ring-1 ring-line data-[state=open]:animate-pop-in">
          {visible.map((it, i) =>
            it.separator ? (
              <M.Separator key={i} className="my-1 h-px bg-line" />
            ) : (
              <M.Item
                key={i}
                disabled={it.disabled}
                onSelect={it.onSelect}
                className={cn(
                  'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-sunken data-[disabled]:opacity-40',
                  it.danger && 'text-bad',
                )}
              >
                {it.icon && <it.icon className="h-4 w-4 opacity-70" />}
                {it.label}
              </M.Item>
            ),
          )}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function Tooltip({ content, children, side }: { content: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-lg bg-fg px-2.5 py-1.5 text-[12px] font-semibold text-bg shadow-pop">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
export const TooltipProvider = T.Provider;
