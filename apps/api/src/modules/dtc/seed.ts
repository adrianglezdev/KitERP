import { eq } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import { empresas } from '../../db/schema/core';
import { saveFile } from '../../core/files';
import type { SeedCtx } from '../../core/modules';
import { renderTextPdf } from '../../core/pdf';
import { dtcDistribucion, dtcDocumentos, dtcLecturas, dtcVersiones, dtcVinculos } from './schema';
import { hoyMadrid, sumarMeses } from './service';

const dias = (fecha: string, n: number) => new Date(Date.parse(fecha + 'T12:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
const momento = (fecha: string, hora = '10:00') => new Date(`${fecha}T${hora}:00+01:00`);

interface VersionSeed {
  numero: string;
  estado: 'borrador' | 'en_revision' | 'aprobada' | 'rechazada' | 'obsoleta';
  hace: number; // días
  autor: string;
  aprobador?: string;
  resumen: string;
  texto: string;
}

export async function seedDtc(tx: Tx, s: SeedCtx) {
  const { empresaId, personas: P, departamentos: D, articulos: A, terceros: T } = s;
  const hoy = hoyMadrid();
  const [emp] = await tx.select().from(empresas).where(eq(empresas.id, empresaId));
  const empresa = { nombre: emp?.nombre ?? 'Empresa', nif: emp?.nif, direccion: emp?.direccion, localidad: emp?.localidad };

  const documento = async (
    v: { codigo: string; titulo: string; tipo: string; confidencialidad: string; descripcion: string; departamento?: string; responsable: string; revisor?: string; revisionMeses?: number; etiquetas?: string[]; estado?: string },
    versiones: VersionSeed[],
    extra: { vinculos?: { entidad: string; id: string | undefined }[]; distribucion?: string[]; leidoPor?: string[]; proximaRevision?: string } = {},
  ) => {
    const [d] = await tx
      .insert(dtcDocumentos)
      .values({
        empresaId,
        codigo: v.codigo,
        titulo: v.titulo,
        tipo: v.tipo,
        confidencialidad: v.confidencialidad,
        descripcion: v.descripcion,
        departamentoId: v.departamento ? D[v.departamento] : null,
        responsableId: P[v.responsable],
        revisorId: v.revisor ? P[v.revisor] : null,
        revisionMeses: v.revisionMeses ?? 12,
        etiquetas: v.etiquetas ?? [],
        estado: 'borrador',
      })
      .returning();
    let vigente: { id: string; numero: string; aprobado: string } | null = null;
    let enRevision = false;
    for (const ver of versiones) {
      const pdf = await renderTextPdf(`${v.codigo} · ${v.titulo} (v${ver.numero})`, ver.texto, empresa);
      const f = await saveFile(tx, { empresaId, nombre: `${v.codigo} ${v.titulo} v${ver.numero}.pdf`, mime: 'application/pdf', data: pdf });
      const fecha = dias(hoy, -ver.hace);
      const aprobada = ver.estado === 'aprobada' || ver.estado === 'obsoleta';
      const [row] = await tx
        .insert(dtcVersiones)
        .values({
          documentoId: d!.id,
          numero: ver.numero,
          archivoId: f.id,
          resumenCambios: ver.resumen,
          estado: ver.estado,
          autorId: P[ver.autor],
          enviadoEn: ver.estado === 'borrador' ? null : momento(fecha, '09:00'),
          aprobadoPor: aprobada ? P[ver.aprobador ?? 'direccion'] : null,
          aprobadoEn: aprobada ? momento(fecha, '13:00') : null,
          rechazoMotivo: ver.estado === 'rechazada' ? 'Falta el apartado de equipos de protección individual.' : null,
          creadoEn: momento(fecha, '08:30'),
        })
        .returning();
      if (ver.estado === 'aprobada') vigente = { id: row!.id, numero: ver.numero, aprobado: fecha };
      if (ver.estado === 'en_revision') enRevision = true;
    }
    await tx
      .update(dtcDocumentos)
      .set({
        estado: v.estado ?? (enRevision ? 'en_revision' : vigente ? 'aprobado' : 'borrador'),
        versionVigenteId: vigente?.id ?? null,
        versionVigente: vigente?.numero ?? null,
        proximaRevision: extra.proximaRevision ?? (vigente ? sumarMeses(vigente.aprobado, v.revisionMeses ?? 12) : null),
      })
      .where(eq(dtcDocumentos.id, d!.id));
    for (const l of extra.vinculos ?? []) if (l.id) await tx.insert(dtcVinculos).values({ empresaId, documentoId: d!.id, entidad: l.entidad, entidadId: l.id }).onConflictDoNothing();
    for (const dep of extra.distribucion ?? []) if (D[dep]) await tx.insert(dtcDistribucion).values({ documentoId: d!.id, departamentoId: D[dep]! });
    if (vigente) for (const p of extra.leidoPor ?? []) if (P[p]) await tx.insert(dtcLecturas).values({ documentoId: d!.id, versionId: vigente.id, personaId: P[p]!, leidoEn: momento(dias(vigente.aprobado, 2), '18:00') });
    return d!;
  };

  // Manual de instalación con dos versiones: la 1.0 obsoleta (sigue en el historial) y la 1.1 vigente. Público: lo ven los clientes desde el QR.
  await documento(
    { codigo: 'MAN-001', titulo: 'Manual de instalación split Daikin TXF', tipo: 'manual', confidencialidad: 'publico', descripcion: 'Instalación, puesta en marcha y mantenimiento de usuario de los splits Daikin TXF35/TXF50.', departamento: 'sat', responsable: 'jefesat', revisor: 'direccion', revisionMeses: 24, etiquetas: ['daikin', 'split'] },
    [
      { numero: '1.0', estado: 'obsoleta', hace: 420, autor: 'jefesat', resumen: 'Primera edición.', texto: 'Manual de instalación del split Daikin TXF.\n\n1. Ubicación de la unidad interior.\n2. Ubicación de la unidad exterior.\n3. Conexiones frigoríficas.\n4. Puesta en marcha.' },
      { numero: '1.1', estado: 'aprobada', hace: 60, autor: 'jefesat', resumen: 'Añadida la limpieza de filtros por el usuario y la tabla de códigos de error.', texto: 'Manual de instalación del split Daikin TXF.\n\n1. Ubicación de la unidad interior.\n2. Ubicación de la unidad exterior.\n3. Conexiones frigoríficas.\n4. Puesta en marcha.\n5. Limpieza de filtros por el usuario (cada 2 semanas en uso intensivo).\n6. Códigos de error más habituales: U4 comunicación, A5 protección antihielo, E7 ventilador exterior.' },
    ],
    { vinculos: [{ entidad: 'articulo', id: A['AC-SPLIT-35'] }, { entidad: 'articulo', id: A['AC-SPLIT-50'] }] },
  );

  // Procedimiento distribuido al servicio técnico: Sergio lo ha leído, Lucía no
  await documento(
    { codigo: 'PRO-004', titulo: 'Recuperación de gas refrigerante', tipo: 'procedimiento', confidencialidad: 'interno', descripcion: 'Procedimiento para recuperar refrigerante de equipos fuera de servicio conforme al Reglamento (UE) 517/2014 de gases fluorados.', departamento: 'sat', responsable: 'jefesat', revisor: 'direccion', etiquetas: ['f-gas', 'seguridad'] },
    [{ numero: '2.0', estado: 'aprobada', hace: 30, autor: 'jefesat', resumen: 'Adaptado al nuevo Reglamento (UE) 2024/573.', texto: 'Objeto: recuperar el refrigerante sin emisiones a la atmósfera.\n\n1. Comprobar la botella de recuperación (tara y capacidad).\n2. Conectar el equipo de recuperación.\n3. Registrar los kilos recuperados en el parte de la orden.\n4. Entregar la botella al gestor autorizado.' }],
    { distribucion: ['sat'], leidoPor: ['tecnico1', 'jefesat'] },
  );

  await documento(
    { codigo: 'FT-012', titulo: 'Ficha técnica cassette Mitsubishi PLA-M71', tipo: 'ficha_tecnica', confidencialidad: 'publico', descripcion: 'Características técnicas, dimensiones y consumos.', departamento: 'sat', responsable: 'jefesat', revisionMeses: 36 },
    [{ numero: '1.0', estado: 'aprobada', hace: 200, autor: 'jefesat', aprobador: 'direccion', resumen: 'Ficha del fabricante.', texto: 'Capacidad frigorífica: 7,1 kW.\nCapacidad calorífica: 8,0 kW.\nAlimentación: 230 V / 50 Hz.\nRefrigerante: R32.\nNivel sonoro: 28-36 dB(A).' }],
    { vinculos: [{ entidad: 'articulo', id: A['AC-CASS-71'] }] },
  );

  // Instrucción de trabajo pendiente de aprobar por dirección (aparece en su bandeja)
  await documento(
    { codigo: 'IT-007', titulo: 'Mantenimiento preventivo de splits', tipo: 'instruccion_trabajo', confidencialidad: 'interno', descripcion: 'Pasos de la visita preventiva y valores de referencia.', departamento: 'sat', responsable: 'jefesat', revisor: 'direccion', etiquetas: ['preventivo'] },
    [
      { numero: '1.0', estado: 'rechazada', hace: 12, autor: 'jefesat', resumen: 'Primera propuesta.', texto: 'Borrador inicial.' },
      { numero: '1.1', estado: 'en_revision', hace: 2, autor: 'jefesat', resumen: 'Añadido el apartado de EPI y las presiones de referencia.', texto: '1. EPI: guantes, gafas y calzado de seguridad.\n2. Limpieza de filtros.\n3. Presiones de referencia R32: baja 8-10 bar, alta 26-30 bar.\n4. Limpieza de batería exterior.' },
    ],
    { distribucion: ['sat'] },
  );

  // Plano restringido del hotel: solo lo ven quienes tienen dtc.restringido
  await documento(
    { codigo: 'PL-031', titulo: 'Plano de instalación de climatización Hotel Mar Azul', tipo: 'plano', confidencialidad: 'restringido', descripcion: 'Trazado de líneas frigoríficas y cuadros eléctricos. Incluye accesos a zonas técnicas.', departamento: 'sat', responsable: 'jefesat', revisor: 'direccion', revisionMeses: 24 },
    [{ numero: '1.0', estado: 'aprobada', hace: 380, autor: 'jefesat', resumen: 'Plano final de obra.', texto: 'Plano de instalación (versión de texto de ejemplo).\n\nZona técnica: cubierta, acceso por escalera de servicio.\nCuadro de climatización: sótano, sala C-2.' }],
    { vinculos: [{ entidad: 'tercero', id: T.hotel }] },
  );

  // Certificado en borrador y normativa obsoleta (para ver todos los estados)
  await documento(
    { codigo: 'CER-002', titulo: 'Certificado de empresa habilitada en gases fluorados', tipo: 'certificado', confidencialidad: 'interno', descripcion: 'Certificado de la empresa y de los técnicos habilitados.', departamento: 'direccion', responsable: 'direccion' },
    [{ numero: '1.0', estado: 'borrador', hace: 1, autor: 'jefesat', resumen: 'Renovación pendiente de enviar.', texto: 'Certificado de empresa habilitada (borrador).' }],
  );
  await documento(
    { codigo: 'NOR-001', titulo: 'Resumen RITE para instaladores (edición 2021)', tipo: 'normativa', confidencialidad: 'interno', descripcion: 'Sustituido por la edición actualizada.', departamento: 'sat', responsable: 'jefesat', estado: 'obsoleto' },
    [{ numero: '1.0', estado: 'aprobada', hace: 900, autor: 'jefesat', resumen: 'Edición 2021.', texto: 'Resumen del Reglamento de Instalaciones Térmicas en los Edificios.' }],
    { proximaRevision: undefined },
  );

  // Revisión periódica vencida: el aviso diario le llegará a la responsable
  await documento(
    { codigo: 'PRO-001', titulo: 'Prevención de riesgos en trabajos en altura', tipo: 'procedimiento', confidencialidad: 'interno', descripcion: 'Uso de escaleras, andamios y líneas de vida en las instalaciones de clientes.', departamento: 'sat', responsable: 'jefesat', revisor: 'direccion', etiquetas: ['prl', 'seguridad'] },
    [{ numero: '3.0', estado: 'aprobada', hace: 380, autor: 'jefesat', resumen: 'Revisión anual.', texto: '1. Evaluar el acceso.\n2. Escaleras: nunca trabajar en los dos últimos peldaños.\n3. Más de 2 m: arnés anclado a línea de vida.' }],
    { distribucion: ['sat', 'almacen'], leidoPor: ['tecnico1', 'tecnico2', 'jefesat', 'almacen'] },
  );
}
