import ExcelJS from 'exceljs';

/** Columnas de una hoja exportada. */
export interface ColXlsx {
  header: string;
  key: string;
  width?: number;
  type?: 'text' | 'money' | 'number' | 'date';
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Hoja Excel con cabecera, formato de importes en euros y fechas como fecha real. */
export async function xlsx(hojas: { nombre: string; titulo?: string; columnas: ColXlsx[]; filas: Record<string, unknown>[]; totales?: Record<string, unknown> }[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KiteERP';
  for (const h of hojas) {
    const ws = wb.addWorksheet(h.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 30));
    let start = 1;
    if (h.titulo) {
      ws.getCell(1, 1).value = h.titulo;
      ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FF5E2A78' } };
      start = 3;
    }
    const head = ws.getRow(start);
    h.columnas.forEach((c, i) => {
      head.getCell(i + 1).value = c.header;
      ws.getColumn(i + 1).width = c.width ?? Math.min(48, Math.max(12, c.header.length + 4));
      if (c.type === 'money') ws.getColumn(i + 1).numFmt = '#,##0.00 [$€-es-ES];[Red]-#,##0.00 [$€-es-ES]';
      if (c.type === 'date') ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy';
    });
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7D2CDD' } };
    const val = (c: ColXlsx, v: unknown) => {
      if (v === null || v === undefined || v === '') return null;
      if (c.type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v.slice(0, 10) + 'T12:00:00Z');
      if ((c.type === 'money' || c.type === 'number') && typeof v !== 'number') return Number(v);
      return v as ExcelJS.CellValue;
    };
    for (const f of h.filas) ws.addRow(h.columnas.map((c) => val(c, f[c.key])));
    if (h.totales) {
      const r = ws.addRow(h.columnas.map((c) => val(c, h.totales![c.key])));
      r.font = { bold: true };
    }
    ws.views = [{ state: 'frozen', ySplit: start }];
  }
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** CSV con separador ; y coma decimal (lo que esperan A3, Contasol y Excel en español). */
export function csv(columnas: ColXlsx[], filas: Record<string, unknown>[]) {
  const fmt = (c: ColXlsx, v: unknown) => {
    if (v === null || v === undefined) return '';
    if (c.type === 'money' || c.type === 'number') return Number(v).toFixed(c.type === 'money' ? 2 : Number.isInteger(Number(v)) ? 0 : 2).replace('.', ',');
    if (c.type === 'date' && typeof v === 'string') return v.slice(0, 10).split('-').reverse().join('/');
    const s = String(v).replace(/[\r\n]+/g, ' ');
    return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columnas.map((c) => c.header).join(';'), ...filas.map((f) => columnas.map((c) => fmt(c, f[c.key])).join(';'))];
  return Buffer.concat([Buffer.from('﻿'), Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')]);
}

export const fileOut = (buffer: Buffer, name: string, mime = XLSX_MIME) => ({ __file: true, buffer, mime, name });
