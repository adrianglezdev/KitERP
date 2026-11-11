import PDFDocument from 'pdfkit';
import { fmtDate, fmtMoney, fmtNumber, type biShared } from '@kite/shared';
import { BRAND, pdfToBuffer } from '../../core/pdf';
import { xlsx } from '../cnt/excel';

type Resultado = { columnas: biShared.BiColumn[]; filas: Record<string, string | number | null>[]; totales: Record<string, string | number | null>; desde: string; hasta: string };

export async function informeXlsx(nombre: string, r: Resultado) {
  return xlsx([
    {
      nombre,
      titulo: `${nombre} · ${fmtDate(r.desde)} a ${fmtDate(r.hasta)}`,
      columnas: r.columnas.map((c) => ({ header: c.label, key: c.key, type: c.type === 'money' ? 'money' : c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text', width: c.type === 'text' ? 28 : 14 })),
      filas: r.filas,
      totales: Object.keys(r.totales).length ? { ...r.totales, [r.columnas[0]!.key]: 'Total' } : undefined,
    },
  ]);
}

/** PDF tabular con la cabecera de la marca (horizontal si hay muchas columnas). */
export async function informePdf(nombre: string, empresa: string, r: Resultado) {
  const horizontal = r.columnas.length > 5;
  const doc = new PDFDocument({ size: 'A4', layout: horizontal ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: nombre, Producer: 'KiteERP' } });
  const ancho = doc.page.width - 72;
  doc.fillColor(BRAND.morado).font('Helvetica-Bold').fontSize(15).text(nombre, 36, 36);
  doc.fillColor(BRAND.gris).font('Helvetica').fontSize(9).text(`${empresa} · ${fmtDate(r.desde)} a ${fmtDate(r.hasta)} · ${r.filas.length} filas`, 36, 56);
  const pesos = r.columnas.map((c) => (c.type === 'text' ? 2.2 : c.type === 'enum' ? 1.3 : 1));
  const total = pesos.reduce((a, b) => a + b, 0);
  const anchos = pesos.map((p) => (p / total) * ancho);
  const fmt = (c: biShared.BiColumn, v: unknown) => (v === null || v === undefined ? '' : c.type === 'money' ? fmtMoney(Number(v)) : c.type === 'number' ? fmtNumber(Number(v)) : c.type === 'date' ? fmtDate(String(v)) : String(v));
  let y = 80;
  const cabecera = () => {
    doc.rect(36, y, ancho, 18).fill(BRAND.violeta);
    let x = 36;
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    r.columnas.forEach((c, i) => {
      doc.text(c.label, x + 4, y + 5, { width: anchos[i]! - 8, align: c.type === 'money' || c.type === 'number' ? 'right' : 'left', lineBreak: false, ellipsis: true });
      x += anchos[i]!;
    });
    y += 20;
  };
  cabecera();
  const fila = (f: Record<string, unknown>, bold = false) => {
    if (y > doc.page.height - 50) {
      doc.addPage();
      y = 36;
      cabecera();
    }
    let x = 36;
    doc.fillColor(BRAND.tinta).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    r.columnas.forEach((c, i) => {
      doc.text(fmt(c, f[c.key]), x + 4, y + 3, { width: anchos[i]! - 8, align: c.type === 'money' || c.type === 'number' ? 'right' : 'left', lineBreak: false, ellipsis: true });
      x += anchos[i]!;
    });
    y += 15;
    doc.moveTo(36, y).lineTo(36 + ancho, y).lineWidth(0.4).strokeColor(BRAND.linea).stroke();
  };
  for (const f of r.filas.slice(0, 5000)) fila(f);
  if (Object.keys(r.totales).length) fila({ ...r.totales, [r.columnas[0]!.key]: 'Total' }, true);
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor(BRAND.gris).font('Helvetica').fontSize(7).text(`KiteERP · ${nombre}`, 36, doc.page.height - 28, { lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, doc.page.width - 136, doc.page.height - 28, { width: 100, align: 'right', lineBreak: false });
  }
  return pdfToBuffer(doc);
}
