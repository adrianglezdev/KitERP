import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileInput, FileUp, Info } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, fmtMoney, type cprShared } from '@kite/shared';
import { api, errorMessage } from '@/lib/api';
import { useMut } from '@/lib/hooks';
import { Alert, Button, Card, CardHeader, Checkbox, Field, Input, NumberInput, RefSelect } from '@/components/ui';
import { DocumentList } from '@/components/docs/DocumentList';

interface Analisis {
  archivoId: string;
  detectado: cprShared.FacturaDetectada | null;
  recepciones: { id: string; codigo: string; fecha: string; base: number; total: number; pendienteBase: number }[];
  sugeridas?: string[];
  aviso: string | null;
}

/** Facturas de proveedor: se sube el PDF, se leen sus datos y se cuadra con lo recibido. */
export default function Facturas() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState<Analisis | null>(null);
  const [f, setF] = useState({ terceroId: null as string | null, numero: '', fecha: '', base: null as number | null, ivaTipo: 21 as number | null, total: null as number | null });
  const [recs, setRecs] = useState<string[]>([]);
  const [manual, setManual] = useState(false);

  const subir = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const r = await api.post<Analisis>('/cpr/facturas/analizar', fd);
      setA(r);
      const d = r.detectado;
      setF({ terceroId: d?.proveedorId ?? null, numero: d?.numero ?? '', fecha: d?.fecha ?? new Date().toISOString().slice(0, 10), base: d?.base ?? null, ivaTipo: d?.ivaTipo ?? 21, total: d?.total ?? null });
      setRecs(r.sugeridas ?? []);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const crear = useMut(() => api.post<{ id: string; aviso: string | null }>('/cpr/facturas/crear', { ...f, archivoId: a?.archivoId, recepcionIds: recs }), {
    invalidate: ['/documentos', '/cpr'],
    onSuccess: (r) => {
      if (r.aviso) toast.warning(r.aviso, { duration: 9000 });
      else toast.success('Factura creada. Revísala y regístrala.');
      nav(`/documentos/${r.id}`);
    },
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Registrar una factura de proveedor" icon={FileInput} subtitle="Sube el PDF: se leen el NIF, el número, la fecha y los importes, y se busca la recepción que factura." />
        <div className="space-y-4 p-4">
          <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line px-4 py-6 text-[13.5px] text-muted hover:border-primary/50 hover:bg-sunken/50">
            <FileUp className="h-5 w-5" />
            {busy ? 'Leyendo la factura…' : a ? 'Subir otra factura' : 'Elige el PDF de la factura'}
            <input type="file" accept="application/pdf" hidden onChange={(e) => subir(e.target.files?.[0])} />
          </label>
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            <Info className="h-3.5 w-3.5" /> Solo se leen PDF con texto. Si es una foto o un escaneo, rellena los datos a mano.
          </p>
          {a?.aviso && <Alert tone="yellow">{a.aviso}</Alert>}
          {(a || manual) && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Proveedor" required>
                  <RefSelect target="proveedores" value={f.terceroId} onChange={(v) => setF({ ...f, terceroId: v })} label={a?.detectado?.proveedor ?? undefined} />
                </Field>
                <Field label="Número de factura" required>
                  <Input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
                </Field>
                <Field label="Base imponible">
                  <NumberInput value={f.base} onChange={(v) => setF({ ...f, base: v })} suffix="€" />
                </Field>
                <Field label="IVA %">
                  <NumberInput value={f.ivaTipo} onChange={(v) => setF({ ...f, ivaTipo: v })} suffix="%" />
                </Field>
                <Field label="Total">
                  <NumberInput value={f.total} onChange={(v) => setF({ ...f, total: v })} suffix="€" />
                </Field>
              </div>
              {!!a?.recepciones.length && (
                <div>
                  <p className="label">Recepciones de este proveedor sin facturar</p>
                  <div className="space-y-1.5">
                    {a.recepciones.map((r) => (
                      <Checkbox
                        key={r.id}
                        checked={recs.includes(r.id)}
                        onChange={(v) => setRecs(v ? [...recs, r.id] : recs.filter((x) => x !== r.id))}
                        label={`${r.codigo} del ${fmtDate(r.fecha)}`}
                        description={`Pendiente de facturar ${fmtMoney(r.pendienteBase)} de base`}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-[12px] text-muted">Si marcas recepciones, la factura tomará sus líneas y se comprobará que precios y cantidades cuadran.</p>
                </div>
              )}
              <Button variant="primary" icon={FileInput} disabled={!f.terceroId || !f.numero} loading={crear.isPending} onClick={() => crear.mutate(undefined)}>
                Crear la factura
              </Button>
            </>
          )}
          {!a && !manual && (
            <button type="button" className="text-[13px] font-medium text-primary hover:underline" onClick={() => { setManual(true); setF({ ...f, fecha: new Date().toISOString().slice(0, 10) }); }}>
              Introducir los datos a mano
            </button>
          )}
        </div>
      </Card>
      <DocumentList tipos={['factura_proveedor']} title="Facturas de proveedor" embedded showPago />
    </div>
  );
}
