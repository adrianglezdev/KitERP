import ExcelJS from 'exceljs';
import { fmtHours, horShared, nomShared, optionLabel } from '@kite/shared';
import { BRAND, newPdf, pdfFooter, pdfHeader, pdfToBuffer } from '../../core/pdf';
import { horaMadrid } from './tiempo';
import { totales } from './calculo';

type DiaJornada = horShared.DiaJornada;
const DIAS = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'];

export interface HojaRegistro {
  persona: { nombre: string; dni: string | null; nss: string | null; centro: string | null; puesto: string | null };
  dias: DiaJornada[];
  firma: { firmadoEn: Date; imagen: string | null; vigente: boolean } | null;
}

interface EmpresaDatos {
  nombre: string;
  razonSocial?: string | null;
  nif?: string | null;
  direccion?: string | null;
  localidad?: string | null;
}

function filaDia(d: DiaJornada) {
  const v = d.fichajes.filter((f) => !f.anulado);
  const entrada = v.find((f) => f.tipo === 'entrada');
  const salida = [...v].reverse().find((f) => f.tipo === 'salida');
  const tramos: string[] = [];
  let ini: string | null = null;
  for (const f of v) {
    if (f.tipo === 'entrada' || f.tipo === 'pausa_fin') ini = horaMadrid(f.momento);
    else if (ini) {
      tramos.push(`${ini}–${horaMadrid(f.momento)}`);
      ini = null;
    }
  }
  if (ini) tramos.push(`${ini}–…`);
  const obs = [
    d.festivo ? `Festivo: ${d.festivo}` : null,
    d.ausencia ? `${d.ausencia.tipo}${d.ausencia.medioDia ? ' (medio día)' : ''}` : null,
    v.some((f) => f.origen === 'correccion') ? 'Corregido' : null,
    ...d.incidencias.map((i) => optionLabel(horShared.INCIDENCIA_TIPOS, i.tipo)?.label ?? i.tipo),
  ].filter(Boolean);
  return {
    fecha: `${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)} ${DIAS[d.diaSemana]}`,
    entrada: entrada ? horaMadrid(entrada.momento) : '',
    salida: salida ? horaMadrid(salida.momento) : '',
    tramos: tramos.join(', '),
    pausas: d.pausas ? fmtHours(d.pausas) : '',
    trabajadas: d.trabajadas ? fmtHours(d.trabajadas) : '',
    extra: d.extra ? fmtHours(d.extra) : '',
    nocturnas: d.nocturnas ? fmtHours(d.nocturnas) : '',
    obs: obs.join(' · '),
  };
}

export async function registroExcel(empresa: EmpresaDatos, anio: number, mes: number, hojas: HojaRegistro[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KiteERP';
  const usados = new Set<string>();
  for (const h of hojas) {
    let name = h.persona.nombre.replace(/[\\/*?:[\]]/g, '').slice(0, 28) || 'Trabajador';
    while (usados.has(name)) name = name.slice(0, 26) + usados.size;
    usados.add(name);
    const ws = wb.addWorksheet(name);
    ws.columns = [{ width: 12 }, { width: 9 }, { width: 9 }, { width: 30 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 10 }, { width: 46 }];
    ws.addRow([`Registro diario de jornada · ${nomShared.nombrePeriodo(anio, mes)}`]).font = { bold: true, size: 14, color: { argb: 'FF7D2CDD' } };
    ws.addRow([`Empresa: ${empresa.razonSocial ?? empresa.nombre}`, '', '', `NIF: ${empresa.nif ?? '—'}`]);
    ws.addRow([`Centro: ${h.persona.centro ?? '—'}`]);
    ws.addRow([`Trabajador/a: ${h.persona.nombre}`, '', '', `DNI/NIE: ${h.persona.dni ?? '—'}`, '', '', `NAF: ${h.persona.nss ?? '—'}`]);
    ws.addRow([]);
    const head = ws.addRow(['Fecha', 'Entrada', 'Salida', 'Tramos de trabajo', 'Pausas', 'Trabajado', 'Extra', 'Nocturnas', 'Observaciones']);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5E2A78' } }));
    for (const d of h.dias) {
      const f = filaDia(d);
      const r = ws.addRow([f.fecha, f.entrada, f.salida, f.tramos, f.pausas, f.trabajadas, f.extra, f.nocturnas, f.obs]);
      if (d.festivo || d.diaSemana >= 6) r.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EEF7' } }));
    }
    const t = totales(h.dias);
    const tot = ws.addRow(['Total', '', '', `${t.diasTrabajados} días trabajados`, fmtHours(t.pausas), fmtHours(t.trabajadas), fmtHours(t.extra), fmtHours(t.nocturnas), `Jornada prevista: ${fmtHours(t.previstas)}`]);
    tot.font = { bold: true };
    ws.addRow([]);
    ws.addRow([h.firma ? `Firmado por la persona trabajadora el ${h.firma.firmadoEn.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}${h.firma.vigente ? '' : ' (hay correcciones posteriores a la firma)'}` : 'Pendiente de firma por la persona trabajadora']);
    ws.addRow([horShared.NOTA_LEGAL_REGISTRO]).font = { italic: true, size: 9 };
  }
  if (!hojas.length) wb.addWorksheet('Registro').addRow(['Sin datos']);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

export async function registroPdf(empresa: EmpresaDatos, anio: number, mes: number, hojas: HojaRegistro[]): Promise<Buffer> {
  const doc = newPdf(`Registro de jornada ${nomShared.nombrePeriodo(anio, mes)}`);
  const cols = [
    { k: 'fecha', w: 52, t: 'Fecha' },
    { k: 'entrada', w: 40, t: 'Entrada' },
    { k: 'salida', w: 40, t: 'Salida' },
    { k: 'tramos', w: 112, t: 'Tramos' },
    { k: 'pausas', w: 42, t: 'Pausas' },
    { k: 'trabajadas', w: 48, t: 'Trabajado' },
    { k: 'extra', w: 38, t: 'Extra' },
    { k: 'nocturnas', w: 40, t: 'Noct.' },
    { k: 'obs', w: 87, t: 'Observaciones' },
  ] as const;
  hojas.forEach((h, idx) => {
    if (idx > 0) doc.addPage();
    pdfHeader(doc, { nombre: empresa.nombre, nif: empresa.nif, direccion: empresa.direccion, localidad: empresa.localidad }, 'Registro de jornada');
    doc.fillColor(BRAND.tinta).font('Helvetica-Bold').fontSize(10).text(`${h.persona.nombre}`, 48, doc.y);
    doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.gris).text(`DNI/NIE ${h.persona.dni ?? '—'} · NAF ${h.persona.nss ?? '—'} · ${h.persona.centro ?? ''}${h.persona.puesto ? ' · ' + h.persona.puesto : ''} · ${nomShared.nombrePeriodo(anio, mes)}`);
    doc.moveDown(0.6);
    let y = doc.y;
    const drawRow = (vals: string[], bold = false, fill?: string) => {
      if (y > 760) {
        doc.addPage();
        y = 60;
      }
      if (fill) doc.rect(48, y - 2, 499, 13).fill(fill);
      let x = 48;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.2).fillColor(BRAND.tinta);
      vals.forEach((v, i) => {
        doc.text(v, x + 2, y, { width: cols[i]!.w - 4, height: 11, ellipsis: true, lineBreak: false });
        x += cols[i]!.w;
      });
      y += 13;
    };
    drawRow(cols.map((c) => c.t), true, '#ECE3F1');
    for (const d of h.dias) {
      const f = filaDia(d) as Record<string, string>;
      drawRow(cols.map((c) => f[c.k] ?? ''), false, d.festivo || d.diaSemana >= 6 ? '#F7F3FA' : undefined);
    }
    const t = totales(h.dias);
    drawRow(['Total', '', '', `${t.diasTrabajados} días`, fmtHours(t.pausas), fmtHours(t.trabajadas), fmtHours(t.extra), fmtHours(t.nocturnas), `Prevista ${fmtHours(t.previstas)}`], true, '#ECE3F1');
    y += 16;
    if (y > 700) {
      doc.addPage();
      y = 60;
    }
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.tinta).text('Firma de la empresa', 48, y);
    doc.text('Firma de la persona trabajadora', 300, y);
    doc.rect(48, y + 12, 220, 60).strokeColor(BRAND.linea).stroke();
    doc.rect(300, y + 12, 247, 60).strokeColor(BRAND.linea).stroke();
    if (h.firma?.imagen) {
      try {
        doc.image(Buffer.from(h.firma.imagen.split(',')[1]!, 'base64'), 305, y + 15, { fit: [237, 50] });
      } catch {
        /* firma no válida */
      }
      doc.font('Helvetica').fontSize(7).fillColor(BRAND.gris).text(`Firmado el ${h.firma.firmadoEn.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}${h.firma.vigente ? '' : ' · correcciones posteriores'}`, 300, y + 75, { width: 247 });
    }
    doc.font('Helvetica-Oblique').fontSize(7).fillColor(BRAND.gris).text(horShared.NOTA_LEGAL_REGISTRO, 48, y + 92, { width: 499 });
  });
  if (!hojas.length) doc.text('Sin datos');
  pdfFooter(doc, `${empresa.razonSocial ?? empresa.nombre} · Registro de jornada`);
  return pdfToBuffer(doc);
}
