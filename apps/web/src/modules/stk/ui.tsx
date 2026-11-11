import { useEffect, useRef, useState } from 'react';
import { Camera, Minus, Plus, ScanBarcode, X } from 'lucide-react';
import { fmtNumber } from '@kite/shared';
import { cn } from '@/lib/utils';
import { Button, Dialog, IconButton, NumberInput } from '@/components/ui';

/** Cantidad con hasta 3 decimales y unidad. */
export function fmtQty(v: number | null | undefined, unidad?: string | null) {
  if (v === null || v === undefined) return '—';
  const n = fmtNumber(v, 3);
  return unidad && unidad !== 'ud' ? `${n} ${unidad}` : n;
}

export function QtyCell({ value, unidad, tone }: { value: number; unidad?: string | null; tone?: 'auto' | 'none' }) {
  return <span className={cn('tabular', tone !== 'none' && value < 0 && 'font-semibold text-bad', tone !== 'none' && value === 0 && 'text-muted')}>{fmtQty(value, unidad)}</span>;
}

/** Cantidad con signo para movimientos (+ verde, − normal). */
export function SignedQty({ value, unidad }: { value: number; unidad?: string | null }) {
  return <span className={cn('tabular font-medium', value > 0 ? 'text-ok' : 'text-fg')}>{value > 0 ? '+' : ''}{fmtQty(value, unidad)}</span>;
}

/** Selector numérico grande para el móvil (botones − y +). */
export function Stepper({ value, onChange, step = 1, min = 0, decimals = 3 }: { value: number | null; onChange: (v: number) => void; step?: number; min?: number; decimals?: number }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-1.5">
      <IconButton icon={Minus} label="Restar" variant="secondary" onClick={() => onChange(Math.max(min, Math.round((v - step) * 1000) / 1000))} />
      <div className="w-24">
        <NumberInput value={value} onChange={(n) => onChange(n ?? 0)} decimals={decimals} align="right" className="text-center text-[16px] font-semibold" />
      </div>
      <IconButton icon={Plus} label="Sumar" variant="secondary" onClick={() => onChange(Math.round((v + step) * 1000) / 1000)} />
    </div>
  );
}

/* ── Lectura de códigos de barras ── */

declare global {
  interface Window {
    BarcodeDetector?: new (o?: { formats?: string[] }) => { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
  }
}

/**
 * Campo para leer códigos de barras: funciona con lectores de mano (que escriben y pulsan Intro)
 * y, si el navegador lo permite, con la cámara del móvil.
 */
export function ScanInput({ onCode, placeholder = 'Escanea o escribe el código o la referencia', autoFocus = true, busy }: { onCode: (code: string) => void; placeholder?: string; autoFocus?: boolean; busy?: boolean }) {
  const [v, setV] = useState('');
  const [cam, setCam] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const submit = () => {
    const c = v.trim();
    if (!c) return;
    onCode(c);
    setV('');
    ref.current?.focus();
  };
  const hasCamera = typeof window !== 'undefined' && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia;
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          ref={ref}
          value={v}
          autoFocus={autoFocus}
          inputMode="search"
          enterKeyHint="search"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="field-input h-12 pl-10 text-[16px]"
          aria-label="Código de barras o referencia"
        />
      </div>
      {hasCamera && <IconButton icon={Camera} label="Leer con la cámara" variant="secondary" className="h-12 w-12" onClick={() => setCam(true)} />}
      <Button variant="primary" size="lg" onClick={submit} loading={busy} className="h-12">
        Buscar
      </Button>
      {cam && (
        <CameraScanner
          onClose={() => setCam(false)}
          onCode={(c) => {
            setCam(false);
            onCode(c);
          }}
        />
      )}
    </div>
  );
}

function CameraScanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onCode);
  cb.current = onCode;
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const det = new window.BarcodeDetector!({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'qr_code'] });
        const loop = async () => {
          if (stop || !video.current) return;
          try {
            const r = await det.detect(video.current);
            if (r[0]?.rawValue) return cb.current(r[0].rawValue);
          } catch {
            /* fotograma no válido */
          }
          setTimeout(loop, 250);
        };
        loop();
      } catch {
        setError('No se puede usar la cámara. Revisa los permisos del navegador o escribe el código.');
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Leer código de barras" description="Apunta la cámara al código" size="sm" footer={<Button icon={X} onClick={onClose}>Cerrar</Button>}>
      {error ? <p className="text-[13.5px] text-bad">{error}</p> : <video ref={video} className="aspect-[4/3] w-full rounded-xl bg-black object-cover" playsInline muted />}
    </Dialog>
  );
}
