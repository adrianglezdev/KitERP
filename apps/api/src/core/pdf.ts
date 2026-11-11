import PDFDocument from 'pdfkit';
import { PDFDocument as PdfLibDoc, StandardFonts, rgb } from 'pdf-lib';

export const BRAND = {
  violeta: '#7D2CDD',
  morado: '#5E2A78',
  verde: '#35AE29',
  marron: '#B28574',
  amarillo: '#F1DE07',
  tinta: '#2A1838',
  gris: '#6E6178',
  linea: '#E4DCEB',
};

export function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export function newPdf(title: string) {
  return new PDFDocument({ size: 'A4', margin: 48, info: { Title: title, Producer: 'KiteERP' }, bufferPages: true });
}

/** Cabecera común: nombre de empresa a la izquierda, título del documento a la derecha. */
export function pdfHeader(doc: PDFKit.PDFDocument, empresa: { nombre: string; nif?: string | null; direccion?: string | null; localidad?: string | null; email?: string | null; telefono?: string | null }, titulo: string, logo?: Buffer | null) {
  const top = 40;
  if (logo) {
    try {
      doc.image(logo, 48, top, { fit: [120, 48] });
    } catch {
      /* logo no válido: se ignora */
    }
  } else {
    doc.fillColor(BRAND.morado).font('Helvetica-Bold').fontSize(16).text(empresa.nombre, 48, top, { width: 260 });
  }
  doc.fillColor(BRAND.gris).font('Helvetica').fontSize(8.5);
  const lines = [logo ? empresa.nombre : null, empresa.nif ? `NIF ${empresa.nif}` : null, empresa.direccion, empresa.localidad, [empresa.telefono, empresa.email].filter(Boolean).join(' · ') || null].filter(Boolean) as string[];
  doc.text(lines.join('\n'), 48, top + (logo ? 52 : 22), { width: 260 });
  doc.fillColor(BRAND.violeta).font('Helvetica-Bold').fontSize(20).text(titulo, 300, top, { width: 247, align: 'right' });
  doc.moveTo(48, 128).lineTo(547, 128).lineWidth(1).strokeColor(BRAND.linea).stroke();
  doc.y = 140;
}

export function pdfFooter(doc: PDFKit.PDFDocument, text: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor(BRAND.gris).font('Helvetica').fontSize(7.5);
    doc.text(text, 48, 800, { width: 400, lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, 447, 800, { width: 100, align: 'right', lineBreak: false });
  }
}

/** PDF sencillo a partir de un texto (plantillas, certificados…). */
export async function renderTextPdf(titulo: string, texto: string, empresa: Parameters<typeof pdfHeader>[1]) {
  const doc = newPdf(titulo);
  pdfHeader(doc, empresa, titulo);
  doc.fillColor(BRAND.tinta).font('Helvetica').fontSize(10.5).text(texto, 48, doc.y + 10, { width: 499, align: 'justify', lineGap: 3 });
  pdfFooter(doc, empresa.nombre);
  return pdfToBuffer(doc);
}

/** Añade una página de evidencias de firma (firma manuscrita, fecha, IP y huella del documento). */
export async function appendSignaturePage(
  pdf: Buffer,
  ev: { firmante: string; email?: string | null; fecha: Date; ip?: string | null; userAgent?: string | null; firmaPng?: Buffer | null; huella: string; titulo: string },
) {
  const doc = await PdfLibDoc.load(pdf);
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const violet = rgb(0x7d / 255, 0x2c / 255, 0xdd / 255);
  const ink = rgb(0x2a / 255, 0x18 / 255, 0x38 / 255);
  page.drawText('Evidencias de firma electrónica', { x: 48, y: 780, size: 18, font: bold, color: violet });
  const rows: [string, string][] = [
    ['Documento', ev.titulo],
    ['Firmante', ev.firmante],
    ['Email', ev.email ?? '—'],
    ['Fecha y hora', ev.fecha.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })],
    ['Dirección IP', ev.ip ?? '—'],
    ['Navegador', (ev.userAgent ?? '—').slice(0, 90)],
    ['Huella SHA-256 del original', ev.huella],
  ];
  let y = 740;
  for (const [k, v] of rows) {
    page.drawText(k, { x: 48, y, size: 9, font: bold, color: ink });
    page.drawText(v, { x: 200, y, size: 9, font, color: ink, maxWidth: 350 });
    y -= 22;
  }
  if (ev.firmaPng) {
    const img = await doc.embedPng(ev.firmaPng);
    const scale = Math.min(300 / img.width, 120 / img.height, 1);
    page.drawText('Firma', { x: 48, y: y - 20, size: 9, font: bold, color: ink });
    page.drawImage(img, { x: 48, y: y - 30 - img.height * scale, width: img.width * scale, height: img.height * scale });
  }
  page.drawText('Firma electrónica simple conforme al Reglamento (UE) 910/2014 (eIDAS). Generado por KiteERP.', { x: 48, y: 60, size: 8, font, color: ink });
  return Buffer.from(await doc.save());
}
