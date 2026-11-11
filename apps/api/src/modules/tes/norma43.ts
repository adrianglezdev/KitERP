/**
 * Lector de extractos bancarios AEB Norma 43 (cuaderno 43), registros de 80 posiciones:
 *  11 cabecera de cuenta · 22 movimiento · 23 conceptos complementarios · 24 equivalencia de divisa
 *  33 final de cuenta (totales de control) · 88 fin de fichero.
 * Y un lector de CSV sencillo (fecha; concepto; importe [; referencia]).
 */

export interface N43Movimiento {
  fecha: string; // AAAA-MM-DD (fecha de operación)
  fechaValor: string;
  importe: number; // positivo = abono (entra dinero), negativo = cargo
  conceptoComun: string;
  conceptoPropio: string;
  documento: string;
  referencia1: string;
  referencia2: string;
  concepto: string; // conceptos complementarios unidos
}

export interface N43Cuenta {
  entidad: string;
  oficina: string;
  cuenta: string;
  fechaInicial: string;
  fechaFinal: string;
  saldoInicial: number;
  saldoFinal: number | null;
  divisa: string;
  nombre: string;
  movimientos: N43Movimiento[];
  totalDebe: number;
  totalHaber: number;
  /** Avisos de validación (totales de control que no cuadran…). */
  avisos: string[];
}

const fecha = (aammdd: string) => {
  const yy = Number(aammdd.slice(0, 2));
  return `${yy < 70 ? 2000 + yy : 1900 + yy}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`;
};
const importe = (s: string) => Number(s) / 100;
const cents = (n: number) => Math.round(n * 100);

export function parseNorma43(text: string): N43Cuenta[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.length >= 2);
  if (!lines.length || !/^(11|22|23|33|88)/.test(lines[0]!)) throw new Error('El archivo no parece un extracto Norma 43');
  const out: N43Cuenta[] = [];
  let cur: N43Cuenta | null = null;
  let last: N43Movimiento | null = null;
  for (const raw of lines) {
    const l = raw.padEnd(80, ' ');
    const code = l.slice(0, 2);
    switch (code) {
      case '11': {
        const signo = l[32] === '1' ? -1 : 1;
        cur = {
          entidad: l.slice(2, 6),
          oficina: l.slice(6, 10),
          cuenta: l.slice(10, 20),
          fechaInicial: fecha(l.slice(20, 26)),
          fechaFinal: fecha(l.slice(26, 32)),
          saldoInicial: signo * importe(l.slice(33, 47)),
          saldoFinal: null,
          divisa: l.slice(47, 50),
          nombre: l.slice(51, 77).trim(),
          movimientos: [],
          totalDebe: 0,
          totalHaber: 0,
          avisos: [],
        };
        out.push(cur);
        last = null;
        break;
      }
      case '22': {
        if (!cur) throw new Error('Movimiento sin cabecera de cuenta (registro 11)');
        const signo = l[27] === '1' ? -1 : 1;
        last = {
          fecha: fecha(l.slice(10, 16)),
          fechaValor: fecha(l.slice(16, 22)),
          conceptoComun: l.slice(22, 24),
          conceptoPropio: l.slice(24, 27),
          importe: signo * importe(l.slice(28, 42)),
          documento: l.slice(42, 52).trim(),
          referencia1: l.slice(52, 64).trim(),
          referencia2: l.slice(64, 80).trim(),
          concepto: '',
        };
        cur.movimientos.push(last);
        break;
      }
      case '23': {
        if (!last) break;
        const extra = [l.slice(4, 42).trim(), l.slice(42, 80).trim()].filter(Boolean).join(' ');
        last.concepto = [last.concepto, extra].filter(Boolean).join(' ');
        break;
      }
      case '33': {
        if (!cur) break;
        const nDebe = Number(l.slice(20, 25));
        cur.totalDebe = importe(l.slice(25, 39));
        const nHaber = Number(l.slice(39, 44));
        cur.totalHaber = importe(l.slice(44, 58));
        const signo = l[58] === '1' ? -1 : 1;
        cur.saldoFinal = signo * importe(l.slice(59, 73));
        const cargos = cur.movimientos.filter((m) => m.importe < 0);
        const abonos = cur.movimientos.filter((m) => m.importe > 0);
        if (cargos.length !== nDebe || abonos.length !== nHaber) cur.avisos.push(`El número de apuntes no coincide con el registro de control (${cargos.length}/${nDebe} cargos, ${abonos.length}/${nHaber} abonos)`);
        if (cents(cargos.reduce((a, m) => a - m.importe, 0)) !== cents(cur.totalDebe) || cents(abonos.reduce((a, m) => a + m.importe, 0)) !== cents(cur.totalHaber))
          cur.avisos.push('Los totales de cargos y abonos no coinciden con el registro de control');
        if (cents(cur.saldoInicial - cur.totalDebe + cur.totalHaber) !== cents(cur.saldoFinal)) cur.avisos.push('El saldo final no cuadra con el saldo inicial y los movimientos');
        last = null;
        break;
      }
      default:
        break; // 24 (divisa) y 88 (fin) no aportan datos
    }
  }
  for (const c of out) for (const m of c.movimientos) if (!m.concepto) m.concepto = [m.referencia2, m.referencia1].filter(Boolean).join(' ');
  return out;
}

/** Genera un extracto Norma 43 (útil para pruebas y para exportar movimientos). */
export function buildNorma43(c: { entidad: string; oficina: string; cuenta: string; nombre: string; saldoInicial: number; movimientos: { fecha: string; importe: number; concepto: string; referencia?: string; conceptoComun?: string }[] }) {
  const d = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
  const n = (v: number, len = 14) => String(Math.round(Math.abs(v) * 100)).padStart(len, '0');
  const fechas = c.movimientos.map((m) => m.fecha).sort();
  const ini = fechas[0] ?? new Date().toISOString().slice(0, 10);
  const fin = fechas[fechas.length - 1] ?? ini;
  const rows: string[] = [];
  rows.push(`11${c.entidad.padStart(4, '0')}${c.oficina.padStart(4, '0')}${c.cuenta.padStart(10, '0')}${d(ini)}${d(fin)}${c.saldoInicial < 0 ? '1' : '2'}${n(c.saldoInicial)}978${'3'}${c.nombre.padEnd(26, ' ').slice(0, 26)}   `);
  let debe = 0;
  let haber = 0;
  for (const m of c.movimientos) {
    if (m.importe < 0) debe += -m.importe;
    else haber += m.importe;
    rows.push(`22    ${c.oficina.padStart(4, '0')}${d(m.fecha)}${d(m.fecha)}${(m.conceptoComun ?? '99').padStart(2, '0')}000${m.importe < 0 ? '1' : '2'}${n(m.importe)}${'0'.repeat(10)}${(m.referencia ?? '').padEnd(12, ' ').slice(0, 12)}${''.padEnd(16, ' ')}`);
    rows.push(`2301${m.concepto.padEnd(38, ' ').slice(0, 38)}${m.concepto.slice(38).padEnd(38, ' ').slice(0, 38)}`);
  }
  const saldoFinal = c.saldoInicial - debe + haber;
  const nd = c.movimientos.filter((m) => m.importe < 0).length;
  const nh = c.movimientos.length - nd;
  rows.push(`33${c.entidad.padStart(4, '0')}${c.oficina.padStart(4, '0')}${c.cuenta.padStart(10, '0')}${String(nd).padStart(5, '0')}${n(debe)}${String(nh).padStart(5, '0')}${n(haber)}${saldoFinal < 0 ? '1' : '2'}${n(saldoFinal)}978    `);
  rows.push(`88${'9'.repeat(18)}${String(rows.length + 1).padStart(6, '0')}`.padEnd(80, ' '));
  return rows.map((r) => r.padEnd(80, ' ').slice(0, 80)).join('\r\n') + '\r\n';
}

/* ───────────── CSV ───────────── */

export interface CsvMovimiento {
  fecha: string;
  concepto: string;
  importe: number;
  referencia: string;
}

const numES = (s: string) => {
  const t = s.trim().replace(/[€\s]/g, '');
  if (!t) return NaN;
  // 1.234,56 · 1234,56 · 1234.56 · -12,3
  if (/,\d{1,2}$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  return Number(t.replace(/,/g, ''));
};
const fechaCsv = (s: string) => {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return null;
};

function splitCsv(line: string, sep: string) {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * CSV de movimientos. Detecta el separador (; , o tabulador) y la cabecera.
 * Columnas reconocidas: fecha, concepto/descripción, importe (o cargo + abono), referencia.
 */
export function parseCsvMovimientos(text: string): CsvMovimiento[] {
  const lines = text.replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = [';', '\t', ','].map((s) => [s, lines[0]!.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const head = splitCsv(lines[0]!, sep).map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const hasHeader = head.some((h) => /fecha|concepto|importe|descripcion/.test(h));
  const idx = (re: RegExp, def: number) => {
    const i = head.findIndex((h) => re.test(h));
    return hasHeader ? i : def;
  };
  const iFechaOp = hasHeader ? head.findIndex((h) => /fecha/.test(h) && !/valor/.test(h)) : 0;
  const iFecha = iFechaOp >= 0 ? iFechaOp : Math.max(0, head.findIndex((h) => /fecha/.test(h)));
  const iConcepto = idx(/concepto|descripcion|detalle/, 1);
  const iImporte = idx(/^importe|cantidad|monto/, 2);
  const iCargo = hasHeader ? head.findIndex((h) => /cargo|debe/.test(h)) : -1;
  const iAbono = hasHeader ? head.findIndex((h) => /abono|haber/.test(h)) : -1;
  const iRef = hasHeader ? head.findIndex((h) => /referencia|ref/.test(h)) : 3;
  const out: CsvMovimiento[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const c = splitCsv(line, sep);
    const f = fechaCsv(c[iFecha] ?? '');
    if (!f) continue;
    let imp = iImporte >= 0 ? numES(c[iImporte] ?? '') : NaN;
    if (Number.isNaN(imp) && (iCargo >= 0 || iAbono >= 0)) {
      const cargo = iCargo >= 0 ? numES(c[iCargo] ?? '') : NaN;
      const abono = iAbono >= 0 ? numES(c[iAbono] ?? '') : NaN;
      imp = (Number.isNaN(abono) ? 0 : Math.abs(abono)) - (Number.isNaN(cargo) ? 0 : Math.abs(cargo));
    }
    if (Number.isNaN(imp) || imp === 0) continue;
    out.push({ fecha: f, concepto: (c[iConcepto] ?? '').slice(0, 500), importe: Math.round(imp * 100) / 100, referencia: iRef >= 0 ? (c[iRef] ?? '') : '' });
  }
  return out;
}
