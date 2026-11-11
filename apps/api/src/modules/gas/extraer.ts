import { isValidNif } from '@kite/shared';

/** Busca en el texto de un ticket o factura el total, la fecha, el NIF del comercio y el IVA. */
export function analizarTextoTicket(text: string) {
  const t = text.replace(/ /g, ' ');
  const num = (s: string) => Number(s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  // Total: la última cifra que acompaña a "TOTAL" (sin "SUBTOTAL"), o el mayor importe
  let total: number | null = null;
  const reTotal = /(?<!SUB)TOTAL(?:\s+(?:A\s+PAGAR|EUROS|EUR|IVA\s+INCL\.?|FACTURA))?\s*[:€]?\s*(-?\d{1,3}(?:[.\s]\d{3})*,\d{2}|-?\d+[.,]\d{2})/gi;
  for (const m of t.matchAll(reTotal)) total = num(m[1]!.replace(/\s/g, ''));
  if (total === null) {
    const all = [...t.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?/g)].map((m) => num(m[1]!));
    if (all.length) total = Math.max(...all);
  }
  // Fecha: dd/mm/aaaa, dd-mm-aa o aaaa-mm-dd
  let fecha: string | null = null;
  const f1 = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(t);
  const f2 = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (f2) fecha = `${f2[1]}-${f2[2]}-${f2[3]}`;
  else if (f1) {
    const y = f1[3]!.length === 2 ? `20${f1[3]}` : f1[3];
    const mm = Number(f1[2]);
    const dd = Number(f1[1]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) fecha = `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  // NIF/CIF del emisor
  let nif: string | null = null;
  for (const m of t.toUpperCase().matchAll(/\b([A-HJ-NP-SUVW][-\s]?\d{7}[-\s]?[0-9A-J]|\d{8}[-\s]?[A-Z]|[XYZ][-\s]?\d{7}[-\s]?[A-Z])\b/g)) {
    const v = m[1]!.replace(/[-\s]/g, '');
    if (isValidNif(v)) {
      nif = v;
      break;
    }
  }
  // Tipo de IVA más habitual mencionado
  let ivaTipo: number | null = null;
  const iva = /IVA\s*(?:\(|\s)?(21|10|4)\s*%/i.exec(t) ?? /(21|10|4)\s*%\s*IVA/i.exec(t);
  if (iva) ivaTipo = Number(iva[1]);
  // Comercio: primera línea con letras
  const comercio = t
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(l) && !/factura|ticket|simplificada/i.test(l))
    ?.slice(0, 80) ?? null;
  return { total, fecha, nif, ivaTipo, comercio };
}

export async function extraerTicketPdf(buf: Buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return { ...analizarTextoTicket(text), texto: text.slice(0, 2000) };
}
