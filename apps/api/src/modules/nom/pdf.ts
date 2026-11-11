import { PDFDocument } from 'pdf-lib';
import { extractText } from 'unpdf';
import { fmtMoney, isValidNif, nomShared } from '@kite/shared';
import { BRAND, newPdf, pdfToBuffer } from '../../core/pdf';

/** Texto de cada página de un PDF. */
export async function textoPorPagina(pdf: Buffer): Promise<string[]> {
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: false });
  return text;
}

/** DNI/NIE que aparecen en un texto (normalizados y válidos). */
export function dnisEn(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.toUpperCase().matchAll(nomShared.DNI_REGEX)) {
    const v = m[1]!.replace(/[\s-]/g, '');
    if (isValidNif(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

export interface Trozo {
  dni: string | null;
  paginas: number[];
}

/**
 * Agrupa las páginas por trabajador: cada página con un DNI conocido abre (o continúa) su grupo;
 * las páginas sin DNI se unen a la anterior (segunda hoja del mismo recibo).
 */
export function agruparPaginas(textos: string[], conocidos: Set<string>): Trozo[] {
  const out: Trozo[] = [];
  textos.forEach((t, i) => {
    const dni = dnisEn(t).find((d) => conocidos.has(d)) ?? null;
    const last = out[out.length - 1];
    if (!dni && last) last.paginas.push(i);
    else if (last && last.dni === dni) last.paginas.push(i);
    else out.push({ dni, paginas: [i] });
  });
  return out;
}

export async function extraerPaginas(pdf: Buffer, paginas: number[]): Promise<Buffer> {
  const src = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const dst = await PDFDocument.create();
  const pages = await dst.copyPages(src, paginas);
  pages.forEach((p) => dst.addPage(p));
  return Buffer.from(await dst.save());
}

export interface DatosRecibo {
  empresa: { nombre: string; nif: string | null; direccion?: string | null; ccc?: string | null };
  trabajador: { nombre: string; dni: string | null; nss: string | null; categoria: string | null; grupo: string | null; antiguedad: string | null };
  anio: number;
  mes: number;
  devengos: { concepto: string; importe: number }[];
  irpfPct: number;
}

/** Recibo de salarios de ejemplo (formato oficial simplificado). Devuelve el PDF y los totales. */
export async function generarRecibo(d: DatosRecibo) {
  const bruto = Math.round(d.devengos.reduce((a, x) => a + x.importe, 0) * 100) / 100;
  const ssT = Math.round(bruto * 0.0648 * 100) / 100;
  const irpf = Math.round(bruto * (d.irpfPct / 100) * 100) / 100;
  const neto = Math.round((bruto - ssT - irpf) * 100) / 100;
  const ssE = Math.round(bruto * 0.3165 * 100) / 100;
  const doc = newPdf(`Recibo de salarios ${nomShared.nombrePeriodo(d.anio, d.mes)}`);
  const L = 48;
  doc.fillColor(BRAND.morado).font('Helvetica-Bold').fontSize(14).text('RECIBO INDIVIDUAL JUSTIFICATIVO DEL PAGO DE SALARIOS', L, 48);
  doc.moveDown(0.5).fillColor(BRAND.tinta).font('Helvetica').fontSize(9);
  doc.text(`Empresa: ${d.empresa.nombre}    CIF: ${d.empresa.nif ?? ''}    CCC: ${d.empresa.ccc ?? '46/1234567/89'}`);
  doc.text(`Domicilio: ${d.empresa.direccion ?? ''}`);
  doc.moveDown(0.5);
  doc.text(`Trabajador: ${d.trabajador.nombre}`);
  doc.text(`NIF: ${d.trabajador.dni ?? ''}    Nº afiliación SS: ${d.trabajador.nss ?? ''}`);
  doc.text(`Categoría: ${d.trabajador.categoria ?? ''}    Grupo de cotización: ${d.trabajador.grupo ?? ''}    Antigüedad: ${d.trabajador.antiguedad ?? ''}`);
  doc.text(`Periodo de liquidación: ${nomShared.nombrePeriodo(d.anio, d.mes)} (30 días)`);
  doc.moveDown(1);
  doc.font('Helvetica-Bold').text('I. DEVENGOS');
  doc.font('Helvetica');
  for (const x of d.devengos) doc.text(`${x.concepto.padEnd(48, ' ')} ${fmtMoney(x.importe)}`);
  doc.font('Helvetica-Bold').text(`A. TOTAL DEVENGADO: ${fmtMoney(bruto)}`);
  doc.moveDown(0.6).text('II. DEDUCCIONES');
  doc.font('Helvetica');
  doc.text(`Contingencias comunes, desempleo, FP y MEI (6,48 %): ${fmtMoney(ssT)}`);
  doc.text(`Retención IRPF (${d.irpfPct.toFixed(2).replace('.', ',')} %): ${fmtMoney(irpf)}`);
  doc.font('Helvetica-Bold').text(`B. TOTAL A DEDUCIR: ${fmtMoney(ssT + irpf)}`);
  doc.moveDown(0.6).fontSize(11).text(`LÍQUIDO TOTAL A PERCIBIR (A - B): ${fmtMoney(neto)}`);
  doc.moveDown(1).font('Helvetica').fontSize(8).fillColor(BRAND.gris);
  doc.text(`Base de cotización por contingencias comunes: ${fmtMoney(bruto)} · Aportación de la empresa: ${fmtMoney(ssE)}`);
  doc.text('Documento de ejemplo generado por KiteERP para la demostración.');
  return { pdf: await pdfToBuffer(doc), bruto, neto, ssT, ssE, irpf };
}
