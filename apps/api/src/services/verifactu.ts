import { createHash } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { config } from '../config';
import type { Tx } from '../db/client';
import { facVerifactu } from '../db/schema';

/**
 * Verifactu (RD 1007/2023 y Orden HAC/1177/2024).
 * Cada factura emitida genera un registro de alta encadenado con el anterior mediante una huella SHA-256.
 * Los registros son inalterables (disparador en base de datos). El envío a la AEAT requiere el certificado
 * electrónico de la empresa; sin él, los registros quedan en estado "sin_certificado" listos para enviarse.
 */

export const fmtFechaAeat = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const fmtImporte = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

function isoConZona(d: Date) {
  // AAAA-MM-DDThh:mm:ss+01:00 en hora de Madrid
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const local = fmt.format(d).replace(' ', 'T');
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  const mad = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const off = Math.round((mad.getTime() - utc.getTime()) / 60000);
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  return `${local}${sign}${hh}:${mm}`;
}

export function huellaAlta(r: { nif: string; numSerie: string; fecha: string; tipoFactura: string; cuotaTotal: number; importeTotal: number; huellaAnterior: string | null; fechaHoraGen: string }) {
  const cadena =
    `IDEmisorFactura=${r.nif}` +
    `&NumSerieFactura=${r.numSerie}` +
    `&FechaExpedicionFactura=${r.fecha}` +
    `&TipoFactura=${r.tipoFactura}` +
    `&CuotaTotal=${fmtImporte(r.cuotaTotal)}` +
    `&ImporteTotal=${fmtImporte(r.importeTotal)}` +
    `&Huella=${r.huellaAnterior ?? ''}` +
    `&FechaHoraHusoGenRegistro=${r.fechaHoraGen}`;
  return createHash('sha256').update(cadena, 'utf8').digest('hex').toUpperCase();
}

export function urlQr(nif: string, numSerie: string, fecha: string, importe: number) {
  const base =
    config.verifactuEntorno === 'produccion'
      ? 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
      : 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';
  const p = new URLSearchParams({ nif, numserie: numSerie, fecha, importe: fmtImporte(importe) });
  return `${base}?${p.toString()}`;
}

const xmlEsc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export interface VerifactuInput {
  empresaId: string;
  documentoId: string;
  nifEmisor: string;
  razonSocialEmisor: string;
  numSerie: string;
  fechaIso: string;
  tipoFactura: string; // F1, F2, R1…R5
  descripcion: string;
  destinatario: { nif: string | null; nombre: string } | null;
  desglose: { ivaTipo: number; base: number; cuota: number; recargoPct: number; cuotaRecargo: number }[];
  cuotaTotal: number;
  importeTotal: number;
  rectificada?: { numSerie: string; fechaIso: string } | null;
  tipoRectificativa?: 'S' | 'I' | null;
}

export async function registrarAlta(tx: Tx, input: VerifactuInput) {
  // Un único encadenamiento por empresa: cerrojo transaccional
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'verifactu:' + input.empresaId}))`);
  const [prev] = await tx
    .select({ huella: facVerifactu.huella, secuencia: facVerifactu.secuencia, numSerie: facVerifactu.numSerie, fecha: facVerifactu.fechaExpedicion })
    .from(facVerifactu)
    .where(eq(facVerifactu.empresaId, input.empresaId))
    .orderBy(desc(facVerifactu.secuencia))
    .limit(1);
  const fecha = fmtFechaAeat(input.fechaIso);
  const fechaHoraGen = isoConZona(new Date());
  const huella = huellaAlta({
    nif: input.nifEmisor,
    numSerie: input.numSerie,
    fecha,
    tipoFactura: input.tipoFactura,
    cuotaTotal: input.cuotaTotal,
    importeTotal: input.importeTotal,
    huellaAnterior: prev?.huella ?? null,
    fechaHoraGen,
  });
  const qr = urlQr(input.nifEmisor, input.numSerie, fecha, input.importeTotal);
  const desglose = input.desglose
    .map(
      (d) => `
        <sf:DetalleDesglose>
          <sf:ClaveRegimen>01</sf:ClaveRegimen>
          <sf:CalificacionOperacion>${d.ivaTipo > 0 ? 'S1' : 'N1'}</sf:CalificacionOperacion>
          <sf:TipoImpositivo>${fmtImporte(d.ivaTipo)}</sf:TipoImpositivo>
          <sf:BaseImponibleOimporteNoSujeto>${fmtImporte(d.base)}</sf:BaseImponibleOimporteNoSujeto>
          <sf:CuotaRepercutida>${fmtImporte(d.cuota)}</sf:CuotaRepercutida>${d.recargoPct ? `
          <sf:TipoRecargoEquivalencia>${fmtImporte(d.recargoPct)}</sf:TipoRecargoEquivalencia>
          <sf:CuotaRecargoEquivalencia>${fmtImporte(d.cuotaRecargo)}</sf:CuotaRecargoEquivalencia>` : ''}
        </sf:DetalleDesglose>`,
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sf:RegistroAlta xmlns:sf="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">
  <sf:IDVersion>1.0</sf:IDVersion>
  <sf:IDFactura>
    <sf:IDEmisorFactura>${xmlEsc(input.nifEmisor)}</sf:IDEmisorFactura>
    <sf:NumSerieFactura>${xmlEsc(input.numSerie)}</sf:NumSerieFactura>
    <sf:FechaExpedicionFactura>${fecha}</sf:FechaExpedicionFactura>
  </sf:IDFactura>
  <sf:NombreRazonEmisor>${xmlEsc(input.razonSocialEmisor)}</sf:NombreRazonEmisor>
  <sf:TipoFactura>${input.tipoFactura}</sf:TipoFactura>${input.tipoRectificativa ? `
  <sf:TipoRectificativa>${input.tipoRectificativa}</sf:TipoRectificativa>` : ''}${input.rectificada ? `
  <sf:FacturasRectificadas><sf:IDFacturaRectificada>
    <sf:IDEmisorFactura>${xmlEsc(input.nifEmisor)}</sf:IDEmisorFactura>
    <sf:NumSerieFactura>${xmlEsc(input.rectificada.numSerie)}</sf:NumSerieFactura>
    <sf:FechaExpedicionFactura>${fmtFechaAeat(input.rectificada.fechaIso)}</sf:FechaExpedicionFactura>
  </sf:IDFacturaRectificada></sf:FacturasRectificadas>` : ''}
  <sf:DescripcionOperacion>${xmlEsc(input.descripcion.slice(0, 500) || 'Venta')}</sf:DescripcionOperacion>${input.destinatario?.nif ? `
  <sf:Destinatarios><sf:IDDestinatario>
    <sf:NombreRazon>${xmlEsc(input.destinatario.nombre)}</sf:NombreRazon>
    <sf:NIF>${xmlEsc(input.destinatario.nif)}</sf:NIF>
  </sf:IDDestinatario></sf:Destinatarios>` : ''}
  <sf:Desglose>${desglose}
  </sf:Desglose>
  <sf:CuotaTotal>${fmtImporte(input.cuotaTotal)}</sf:CuotaTotal>
  <sf:ImporteTotal>${fmtImporte(input.importeTotal)}</sf:ImporteTotal>
  <sf:Encadenamiento>${prev ? `
    <sf:RegistroAnterior>
      <sf:IDEmisorFactura>${xmlEsc(input.nifEmisor)}</sf:IDEmisorFactura>
      <sf:NumSerieFactura>${xmlEsc(prev.numSerie)}</sf:NumSerieFactura>
      <sf:FechaExpedicionFactura>${prev.fecha}</sf:FechaExpedicionFactura>
      <sf:Huella>${prev.huella}</sf:Huella>
    </sf:RegistroAnterior>` : `
    <sf:PrimerRegistro>S</sf:PrimerRegistro>`}
  </sf:Encadenamiento>
  <sf:SistemaInformatico>
    <sf:NombreRazon>KiteERP</sf:NombreRazon>
    <sf:NombreSistemaInformatico>KiteERP</sf:NombreSistemaInformatico>
    <sf:IdSistemaInformatico>KE</sf:IdSistemaInformatico>
    <sf:Version>0.1.0</sf:Version>
    <sf:NumeroInstalacion>1</sf:NumeroInstalacion>
    <sf:TipoUsoPosibleSoloVerifactu>S</sf:TipoUsoPosibleSoloVerifactu>
    <sf:TipoUsoPosibleMultiOT>S</sf:TipoUsoPosibleMultiOT>
    <sf:IndicadorMultiplesOT>N</sf:IndicadorMultiplesOT>
  </sf:SistemaInformatico>
  <sf:FechaHoraHusoGenRegistro>${fechaHoraGen}</sf:FechaHoraHusoGenRegistro>
  <sf:TipoHuella>01</sf:TipoHuella>
  <sf:Huella>${huella}</sf:Huella>
</sf:RegistroAlta>`;

  const [row] = await tx
    .insert(facVerifactu)
    .values({
      empresaId: input.empresaId,
      secuencia: (prev?.secuencia ?? 0) + 1,
      documentoId: input.documentoId,
      tipoRegistro: 'alta',
      nifEmisor: input.nifEmisor,
      numSerie: input.numSerie,
      fechaExpedicion: fecha,
      tipoFactura: input.tipoFactura,
      cuotaTotal: input.cuotaTotal,
      importeTotal: input.importeTotal,
      huella,
      huellaAnterior: prev?.huella ?? null,
      fechaHoraGen,
      urlQr: qr,
      xml,
      estadoEnvio: 'sin_certificado',
    })
    .returning();
  return row!;
}

/** Comprueba que la cadena de huellas no se ha roto (ninguna factura se ha alterado ni falta ninguna). */
export async function verificarCadena(tx: Tx, empresaId: string) {
  const rows = await tx.select().from(facVerifactu).where(eq(facVerifactu.empresaId, empresaId)).orderBy(facVerifactu.secuencia);
  let anterior: string | null = null;
  const errores: string[] = [];
  for (const r of rows) {
    const h = huellaAlta({
      nif: r.nifEmisor,
      numSerie: r.numSerie,
      fecha: r.fechaExpedicion,
      tipoFactura: r.tipoFactura,
      cuotaTotal: r.cuotaTotal,
      importeTotal: r.importeTotal,
      huellaAnterior: anterior,
      fechaHoraGen: r.fechaHoraGen,
    });
    if (r.huellaAnterior !== anterior) errores.push(`Registro ${r.secuencia}: el encadenamiento no coincide`);
    if (h !== r.huella) errores.push(`Registro ${r.secuencia} (${r.numSerie}): la huella no coincide`);
    anterior = r.huella;
  }
  return { registros: rows.length, correcta: errores.length === 0, errores };
}
