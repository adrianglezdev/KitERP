import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Eraser, FileUp, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, uploadFiles } from '@/lib/api';
import { cn, fileSize } from '@/lib/utils';

/** Número con coma decimal (es-ES). Devuelve number o null. */
export function NumberInput({
  value,
  onChange,
  suffix,
  decimals = 2,
  min,
  className,
  invalid,
  id,
  placeholder,
  disabled,
  align = 'right',
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  suffix?: string;
  decimals?: number;
  min?: number;
  className?: string;
  invalid?: boolean;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
}) {
  const fmt = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '' : String(Math.round(v * 10 ** decimals) / 10 ** decimals).replace('.', ','));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        className={cn('field-input tabular', align === 'right' && 'text-right', suffix && 'pr-8', invalid && 'border-bad', className)}
        value={text}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          setText(fmt(value));
        }}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d,.-]/g, '');
          setText(t);
          if (t === '' || t === '-') return onChange(null);
          const n = Number(t.replace(/\./g, '').replace(',', '.'));
          if (!Number.isNaN(n)) onChange(min !== undefined ? Math.max(min, n) : n);
        }}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[12.5px] text-muted">{suffix}</span>}
    </div>
  );
}

export function TagsInput({ value, onChange, placeholder = 'Escribe y pulsa Intro', suggestions }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [t, setT] = useState('');
  const add = (s: string) => {
    const v = s.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setT('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(t);
    } else if (e.key === 'Backspace' && !t && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="field-input flex min-h-[38px] flex-wrap items-center gap-1.5 py-1.5">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[12.5px] text-primary">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Quitar ${v}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={t}
        onChange={(e) => setT(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => t && add(t)}
        placeholder={value.length ? '' : placeholder}
        list={suggestions ? 'tag-sugg' : undefined}
        className="min-w-[120px] flex-1 bg-transparent text-[14px] outline-none"
      />
      {suggestions && (
        <datalist id="tag-sugg">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

export interface UploadedFile {
  id: string;
  nombre: string;
  mime: string;
  tamano: number;
  url: string;
}

/** Zona para soltar o elegir archivos. Sube al momento y devuelve los ids. En móvil permite usar la cámara. */
export function FileDrop({ onUploaded, multiple = true, accept, capture, label = 'Arrastra archivos aquí o pulsa para elegir', compact }: { onUploaded: (files: UploadedFile[]) => void; multiple?: boolean; accept?: string; capture?: boolean; label?: string; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    const big = Array.from(files).find((f) => f.size > 50 * 1024 * 1024);
    if (big) return toast.error(`${big.name} supera 50 MB`);
    setBusy(true);
    try {
      onUploaded(await uploadFiles(files));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
      className={cn(
        'flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center text-[13px] text-muted transition',
        compact ? 'px-3 py-3' : 'flex-col px-4 py-6',
        over ? 'border-primary bg-primary-soft/50 text-primary' : 'border-line hover:border-primary/50 hover:bg-sunken/50',
      )}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}
      <span>{busy ? 'Subiendo…' : label}</span>
      <input ref={input} type="file" hidden multiple={multiple} accept={accept} capture={capture ? 'environment' : undefined} onChange={(e) => handle(e.target.files)} />
    </div>
  );
}

export function FileChip({ f, onRemove }: { f: { nombre: string; tamano?: number; url?: string | null }; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line-strong/70 bg-sunken px-2.5 py-1.5 text-[12.5px]">
      {f.url ? (
        <a href={f.url} target="_blank" rel="noreferrer" className="truncate hover:text-primary">
          {f.nombre}
        </a>
      ) : (
        <span className="truncate">{f.nombre}</span>
      )}
      {f.tamano !== undefined && <span className="shrink-0 text-muted">{fileSize(f.tamano)}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Quitar" className="text-muted hover:text-bad">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

/** Firma manuscrita con el dedo o el ratón. Devuelve un PNG en base64 (data URL) o null si está vacía. */
export function SignaturePad({ onChange, height = 180 }: { onChange: (dataUrl: string | null) => void; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    const resize = () => {
      const w = c.parentElement!.clientWidth;
      c.width = w * ratio;
      c.height = height * ratio;
      c.style.width = `${w}px`;
      c.style.height = `${height}px`;
      const ctx = c.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1E2635';
    };
    resize();
  }, [height]);
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  };
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-line-strong/70 bg-white">
        <canvas
          ref={canvas}
          className="block touch-none"
          onPointerDown={(e) => {
            drawing.current = true;
            const ctx = canvas.current!.getContext('2d')!;
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = canvas.current!.getContext('2d')!;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            dirty.current = true;
          }}
          onPointerUp={() => {
            drawing.current = false;
            if (dirty.current) onChange(canvas.current!.toDataURL('image/png'));
          }}
        />
        <span className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-gray-400">Firma aquí</span>
      </div>
      <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg">
        <Eraser className="h-3.5 w-3.5" /> Borrar firma
      </button>
    </div>
  );
}
