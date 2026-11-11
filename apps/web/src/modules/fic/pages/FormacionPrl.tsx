import { useState } from 'react';
import { PenLine } from 'lucide-react';
import { ficShared, fmtDate } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Button, Dialog, SignaturePad } from '@/components/ui';
import { ResourceList } from '@/components/resource';

/** Pestaña "Formación y PRL": cursos, reconocimientos médicos, EPIs entregados y firmas pendientes. */
export default function FormacionPrl({ id }: { id: string }) {
  const { session, can } = useSession();
  const propia = session?.user.personaId === id;
  const firmas = useApi<any[]>(propia ? '/fic/mis-firmas' : null);
  const [firmar, setFirmar] = useState<any | null>(null);
  const [firma, setFirma] = useState<string | null>(null);
  const firmarMut = useMut(() => api.post(`/fic/prl/${firmar.id}/firmar`, { firma }), {
    ok: 'Firmado. Se ha guardado el justificante con la fecha y la hora.',
    invalidate: ['/fic'],
    onSuccess: () => {
      setFirmar(null);
      setFirma(null);
    },
  });
  const editor = can('fic.editar') ? 'fic.editar' : undefined;
  return (
    <div className="space-y-6">
      {!!firmas.data?.length && (
        <Alert tone="violet" icon={PenLine} title="Tienes entregas pendientes de firmar">
          <ul className="mt-1 space-y-1">
            {firmas.data.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2">
                <span>
                  {f.descripcion} · {fmtDate(f.fecha)}
                </span>
                <Button size="sm" variant="primary" onClick={() => setFirmar(f)}>
                  Firmar
                </Button>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <ResourceList def={ficShared.formacionResource} endpoint="/fic/formacion" createPerm={editor} editPerm={editor ?? []} fixed={{ personaId: id }} embedded pageSize={10} title={<h3 className="text-[15px] font-bold">Formación</h3>} emptyText="Sin cursos registrados." />
      <ResourceList def={ficShared.prlResource} endpoint="/fic/prl" createPerm={editor} editPerm={editor ?? []} fixed={{ personaId: id }} embedded pageSize={10} title={<h3 className="text-[15px] font-bold">Prevención de riesgos laborales</h3>} emptyText="Sin reconocimientos, cursos de PRL ni entregas de EPIs." />
      <Dialog
        open={!!firmar}
        onOpenChange={(o) => !o && setFirmar(null)}
        title={firmar?.descripcion ?? 'Firmar'}
        description="Firma con el dedo o el ratón para confirmar que lo has recibido."
        footer={
          <Button variant="primary" disabled={!firma} loading={firmarMut.isPending} onClick={() => firmarMut.mutate(undefined)}>
            Firmar
          </Button>
        }
      >
        {firmar?.epis?.length > 0 && (
          <ul className="mb-3 list-disc pl-5 text-[13.5px]">
            {firmar.epis.map((e: any, i: number) => (
              <li key={i}>
                {e.cantidad} × {e.nombre}
                {e.talla ? ` (talla ${e.talla})` : ''}
              </li>
            ))}
          </ul>
        )}
        <SignaturePad onChange={setFirma} />
      </Dialog>
    </div>
  );
}
