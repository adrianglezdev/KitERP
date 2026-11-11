import { eq } from 'drizzle-orm';
import { OPTIONAL_MODULE_CODES, nomShared } from '@kite/shared';
import type { Tx } from '../../db/client';
import { empresas } from '../../db/schema/core';
import { saveFile } from '../../core/files';
import type { SeedCtx } from '../../core/modules';
import { newId } from '../../db/helpers';
import { horasMes } from '../hor/calculo';
import { addDays, hoyMadrid, limitesMes } from '../hor/tiempo';
import { FICHAS_DEMO, dniDemo } from '../fic/seed';
import { generarRecibo } from './pdf';
import { nomAnticipos, nomPeriodos, nomRecibos, nomVariables } from './schema';

const NOMBRES: Record<string, string> = {
  admin: 'Raúl Vidal Soler',
  direccion: 'Laura Martín Ortega',
  administracion: 'Carlos Ruiz Pastor',
  rrhh: 'Ana Fernández Gil',
  comercial1: 'Marta Gómez Ibáñez',
  comercial2: 'Javier López Marco',
  almacen: 'Pablo Sánchez Roig',
  operario: 'David Moreno Vila',
  jefesat: 'Elena Torres Calvo',
  tecnico1: 'Sergio Navarro Peris',
  tecnico2: 'Lucía Romero Bas',
};

export async function seedNom(tx: Tx, s: SeedCtx) {
  const empresaId = s.empresaId;
  const hoy = hoyMadrid();
  const [emp] = await tx.select().from(empresas).where(eq(empresas.id, empresaId));
  const mesActual = hoy.slice(0, 7);
  const anterior = (m: string) => addDays(m + '-01', -1).slice(0, 7);
  const meses = [anterior(anterior(mesActual)), anterior(mesActual)];

  for (const mes of meses) {
    const { anio, m } = limitesMes(mes);
    const periodoId = newId();
    let bruto = 0, ssE = 0, ssT = 0, irpf = 0, neto = 0;
    const recibos: (typeof nomRecibos.$inferInsert)[] = [];
    for (const [key, f] of Object.entries(FICHAS_DEMO)) {
      const personaId = s.personas[key];
      if (!personaId) continue;
      const alta = addDays(hoy, f.alta);
      if (alta > limitesMes(mes).hasta) continue;
      const base = Math.round((f.salario / 14) * 100) / 100;
      const devengos = [{ concepto: 'Salario base', importe: Math.round(base * 0.82 * 100) / 100 }, { concepto: 'Plus convenio', importe: Math.round(base * 0.18 * 100) / 100 }];
      if (key.startsWith('comercial')) devengos.push({ concepto: 'Comisiones', importe: key === 'comercial1' ? 640 : 410 });
      if (key.startsWith('tecnico')) devengos.push({ concepto: 'Horas extraordinarias', importe: key === 'tecnico1' ? 96.5 : 48.25 });
      const r = await generarRecibo({
        empresa: { nombre: emp!.razonSocial ?? emp!.nombre, nif: emp!.nif, direccion: [emp!.direccion, emp!.codigoPostal, emp!.localidad].filter(Boolean).join(', ') },
        trabajador: { nombre: NOMBRES[key]!, dni: dniDemo(f.dni), nss: null, categoria: f.cat, grupo: f.grupo, antiguedad: alta.split('-').reverse().join('/') },
        anio,
        mes: m,
        devengos,
        irpfPct: f.salario > 50000 ? 24 : f.salario > 30000 ? 17 : f.salario > 22000 ? 12 : 8,
      });
      const arch = await saveFile(tx, { empresaId, nombre: `Nómina ${nomShared.nombrePeriodo(anio, m)} - ${NOMBRES[key]}.pdf`, mime: 'application/pdf', data: r.pdf, subidoPor: s.adminUsuarioId });
      bruto += r.bruto;
      ssE += r.ssE;
      ssT += r.ssT;
      irpf += r.irpf;
      neto += r.neto;
      recibos.push({
        empresaId,
        periodoId,
        personaId,
        tipo: 'nomina',
        titulo: `Nómina de ${nomShared.nombrePeriodo(anio, m).toLowerCase()}`,
        anio,
        mes: m,
        archivoId: arch.id,
        dniDetectado: dniDemo(f.dni),
        bruto: r.bruto,
        neto: r.neto,
        publicadoPor: s.adminUsuarioId,
        publicadoEn: new Date(limitesMes(mes).hasta + 'T10:00:00Z'),
        leidoEn: mes === meses[0] || !['operario', 'tecnico2', 'comercial2'].includes(key) ? new Date(addDays(limitesMes(mes).hasta, 2) + 'T08:00:00Z') : null,
      });
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    await tx.insert(nomPeriodos).values({ id: periodoId, empresaId, anio, mes: m, estado: 'cerrado', totales: { bruto: r2(bruto), ssEmpresa: r2(ssE), ssTrabajador: r2(ssT), irpf: r2(irpf), neto: r2(neto) }, cerradoPor: s.adminUsuarioId, cerradoEn: new Date(limitesMes(mes).hasta + 'T12:00:00Z') });
    await tx.insert(nomRecibos).values(recibos);
    await tx.insert(nomVariables).values([
      { empresaId, periodoId, personaId: s.personas.comercial1!, concepto: 'comision', descripcion: 'Comisión por ventas del mes', importe: 640, origen: 'manual' },
      { empresaId, periodoId, personaId: s.personas.comercial2!, concepto: 'comision', descripcion: 'Comisión por ventas del mes', importe: 410, origen: 'manual' },
    ]);
  }

  // Periodo abierto del mes en curso con variables
  const { anio, m, desde } = limitesMes(mesActual);
  const [abierto] = await tx.insert(nomPeriodos).values({ empresaId, anio, mes: m, estado: 'abierto' }).returning();
  const ids = Object.keys(FICHAS_DEMO).map((k) => s.personas[k]!).filter(Boolean);
  const horas = await horasMes(tx, empresaId, ids, desde, hoy, new Set<string>(OPTIONAL_MODULE_CODES));
  const vars: (typeof nomVariables.$inferInsert)[] = [];
  for (const [key, f] of Object.entries(FICHAS_DEMO)) {
    const personaId = s.personas[key]!;
    const t = horas.get(personaId);
    const ph = Math.round((f.salario / (f.jornada * 52)) * 100) / 100;
    if (t && t.extra >= 0.25) vars.push({ empresaId, periodoId: abierto!.id, personaId, concepto: 'horas_extra', descripcion: `Horas por encima de la jornada prevista (${t.extra} h)`, cantidad: t.extra, importe: Math.round(t.extra * ph * 100) / 100, origen: 'hor' });
  }
  vars.push(
    { empresaId, periodoId: abierto!.id, personaId: s.personas.comercial1!, concepto: 'comision', descripcion: 'Comisión del mes (provisional)', importe: 520, origen: 'manual', creadoPor: s.adminUsuarioId },
    { empresaId, periodoId: abierto!.id, personaId: s.personas.tecnico1!, concepto: 'dietas', descripcion: 'Dietas de la obra de Alboraia', importe: 86.4, origen: 'gas', origenId: newId() },
    { empresaId, periodoId: abierto!.id, personaId: s.personas.tecnico1!, concepto: 'kilometraje', descripcion: '312 km con vehículo propio', cantidad: 312, importe: 81.12, origen: 'gas', origenId: newId() },
    { empresaId, periodoId: abierto!.id, personaId: s.personas.almacen!, concepto: 'embargo', descripcion: 'Embargo judicial (oficio del juzgado n.º 4)', importe: 150, origen: 'manual', creadoPor: s.adminUsuarioId },
  );
  const [anticipo] = await tx.insert(nomAnticipos).values({ empresaId, personaId: s.personas.tecnico2!, importe: 200, motivo: 'Reparación del coche', estado: 'aprobado', periodoId: abierto!.id, revisadoPor: s.adminUsuarioId, revisadoEn: new Date(), creadoEn: new Date(Date.now() - 6 * 86400000) }).returning();
  vars.push({ empresaId, periodoId: abierto!.id, personaId: s.personas.tecnico2!, concepto: 'anticipo', descripcion: 'Anticipo aprobado', importe: 200, origen: 'anticipo', origenId: anticipo!.id });
  await tx.insert(nomVariables).values(vars);
  await tx.insert(nomAnticipos).values({ empresaId, personaId: s.personas.operario!, importe: 300, motivo: 'Fianza del piso nuevo', fechaDeseada: addDays(hoy, 5), creadoEn: new Date(Date.now() - 86400000) });
}
