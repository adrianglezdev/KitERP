import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { fmtDate, fmtMoney, fmtNumber, formatIban } from '@kite/shared';
import { db } from '../db/client';
import { documentoImpuestos, empresas, facVerifactu, formasPago, terceros } from '../db/schema';
import { fileBuffer, getFile } from '../core/files';
import { BRAND, newPdf, pdfFooter, pdfHeader, pdfToBuffer } from '../core/pdf';
import { lineasDe, tipoLabel } from './documentos';
import { documentos } from '../db/schema';

const TITULOS: Record<string, string> = {
  presupuesto: 'PRESUPUESTO',
  pedido: 'PEDIDO',
  albaran: 'ALBARÁN',
  factura: 'FACTURA',
  factura_rectificativa: 'FACTURA RECTIFICATIVA',
  factura_simplificada: 'FACTURA SIMPLIFICADA',
  proforma: 'FACTURA PROFORMA',
  pedido_compra: 'PEDIDO A PROVEEDOR',
  recepcion: 'RECEPCIÓN',
  factura_proveedor: 'FACTURA DE PROVEEDOR',
};

/** Genera el PDF de un documento comercial con la imagen de la empresa. */
export async function documentoPdf(id: string, opts: { mostrarCostes?: boolean } = {}) {
  const [d] = await db.select().from(documentos).where(eq(documentos.id, id));
  if (!d) throw new Error('Documento no encontrado');
  const [emp] = await db.select().from(empresas).where(eq(empresas.id, d.empresaId));
  const [ter] = await db.select().from(terceros).where(eq(terceros.id, d.terceroId));
  const t = (d.datosTercero as Record<string, any> | null) ?? ter!;
  const lineas = await lineasDe(db as any, id);
  const imps = await db.select().from(documentoImpuestos).where(eq(documentoImpuestos.documentoId, id));
  const fp = d.formaPagoId ? (await db.select().from(formasPago).where(eq(formasPago.id, d.formaPagoId)))[0] : null;
  const [vf] = await db.select().from(facVerifactu).where(eq(facVerifactu.documentoId, id));
  let logo: Buffer | null = null;
  if (emp!.logoArchivoId) {
    try {
      logo = await fileBuffer((await getFile(db, emp!.logoArchivoId)).ruta);
    } catch {
      logo = null;
    }
  }

  const titulo = TITULOS[d.tipo] ?? tipoLabel(d.tipo).toUpperCase();
  const doc = newPdf(`${titulo} ${d.codigo ?? ''}`);
  pdfHeader(
    doc,
    {
      nombre: emp!.razonSocial ?? emp!.nombre,
      nif: emp!.nif,
      direccion: emp!.direccion,
      localidad: [emp!.codigoPostal, emp!.localidad, emp!.provincia].filter(Boolean).join(' '),
      email: emp!.email,
      telefono: emp!.telefono,
    },
    titulo,
    logo,
  );

  // Datos del documento
  const y0 = 66;
  doc.font('Helvetica').fontSize(9).fillColor(BRAND.tinta);
  const meta: [string, string][] = [
    ['Número', d.codigo ?? 'BORRADOR'],
    ['Fecha', fmtDate(d.fecha)],
  ];
  if (d.fechaValidez && d.tipo === 'presupuesto') meta.push(['Válido hasta', fmtDate(d.fechaValidez)]);
  if (d.fechaEntrega) meta.push(['Entrega', fmtDate(d.fechaEntrega)]);
  if (d.referenciaExterna) meta.push([d.circuito === 'compra' ? 'Nº proveedor' : 'Su referencia', d.referenciaExterna]);
  if (d.version > 1) meta.push(['Versión', String(d.version)]);
  let my = y0;
  for (const [k, v] of meta) {
    doc.fillColor(BRAND.gris).text(k, 380, my, { width: 70, align: 'right' });
    doc.fillColor(BRAND.tinta).font('Helvetica-Bold').text(v, 455, my, { width: 92, align: 'right' });
    doc.font('Helvetica');
    my += 13;
  }

  // Cliente / proveedor
  const boxY = 140;
  doc.roundedRect(300, boxY, 247, 78, 6).fillColor('#F7F3FB').fill();
  doc.fillColor(BRAND.violeta).font('Helvetica-Bold').fontSize(8).text(d.circuito === 'compra' ? 'PROVEEDOR' : 'CLIENTE', 312, boxY + 8);
  doc.fillColor(BRAND.tinta).font('Helvetica-Bold').fontSize(10.5).text(t.razonSocial ?? t.nombre, 312, boxY + 20, { width: 225 });
  doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.tinta);
  doc.text([t.nif ? `NIF ${t.nif}` : null, t.direccion, [t.codigoPostal, t.localidad, t.provincia].filter(Boolean).join(' ')].filter(Boolean).join('\n'), 312, doc.y + 2, { width: 225 });
  if (d.titulo) {
    doc.fillColor(BRAND.tinta).font('Helvetica-Bold').fontSize(12).text(d.titulo, 48, boxY + 8, { width: 240 });
  }
  if (d.rectificaId && d.motivoRectificacion) doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.gris).text(`Motivo: ${d.motivoRectificacion}`, 48, boxY + 40, { width: 240 });

  // Tabla de líneas
  const cols = [
    { k: 'ref', x: 48, w: 62, t: 'Ref.', a: 'left' },
    { k: 'desc', x: 112, w: 200, t: 'Descripción', a: 'left' },
    { k: 'cant', x: 314, w: 42, t: 'Cant.', a: 'right' },
    { k: 'precio', x: 358, w: 58, t: 'Precio', a: 'right' },
    { k: 'dto', x: 418, w: 32, t: 'Dto.', a: 'right' },
    { k: 'iva', x: 452, w: 30, t: 'IVA', a: 'right' },
    { k: 'imp', x: 484, w: 63, t: 'Importe', a: 'right' },
  ] as const;
  let y = 236;
  const header = () => {
    doc.rect(48, y, 499, 18).fillColor(BRAND.morado).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    for (const c of cols) doc.text(c.t, c.x + 3, y + 5, { width: c.w - 6, align: c.a });
    y += 22;
  };
  header();
  doc.font('Helvetica').fontSize(8.5);
  for (const l of lineas) {
    const desc = l.descripcion || '';
    const h = Math.max(12, doc.heightOfString(desc, { width: cols[1].w - 6 }) + 4);
    if (y + h > 700) {
      doc.addPage();
      y = 60;
      header();
      doc.font('Helvetica').fontSize(8.5);
    }
    if (l.tipoLinea === 'capitulo') {
      doc.fillColor(BRAND.violeta).font('Helvetica-Bold').text(desc, 51, y, { width: 490 });
      doc.font('Helvetica');
      y += h + 2;
      continue;
    }
    if (l.tipoLinea === 'texto') {
      doc.fillColor(BRAND.gris).text(desc, cols[1].x + 3, y, { width: 360 });
      y += h + 2;
      continue;
    }
    doc.fillColor(BRAND.tinta);
    doc.text(l.referencia ?? '', cols[0].x + 3, y, { width: cols[0].w - 6 });
    doc.text(desc, cols[1].x + 3, y, { width: cols[1].w - 6 });
    doc.text(fmtNumber(l.cantidad, 3), cols[2].x + 3, y, { width: cols[2].w - 6, align: 'right' });
    doc.text(fmtNumber(l.precio, 4), cols[3].x + 3, y, { width: cols[3].w - 6, align: 'right' });
    doc.text(l.descuento ? `${fmtNumber(l.descuento)}%` : '', cols[4].x + 3, y, { width: cols[4].w - 6, align: 'right' });
    doc.text(`${fmtNumber(l.ivaTipo)}%`, cols[5].x + 3, y, { width: cols[5].w - 6, align: 'right' });
    doc.text(fmtMoney(l.subtotal), cols[6].x + 3, y, { width: cols[6].w - 6, align: 'right' });
    y += h;
    doc.moveTo(48, y).lineTo(547, y).lineWidth(0.4).strokeColor(BRAND.linea).stroke();
    y += 4;
  }

  // Totales
  if (y > 610) {
    doc.addPage();
    y = 60;
  }
  y += 8;
  const tx = 360;
  const row = (k: string, v: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(bold ? BRAND.morado : BRAND.tinta);
    doc.text(k, tx, y, { width: 110, align: 'right' });
    doc.text(v, tx + 115, y, { width: 72, align: 'right' });
    y += bold ? 18 : 14;
  };
  if (d.descuentoGlobal) {
    row('Suma', fmtMoney(d.sumaLineas));
    row(`Descuento ${fmtNumber(d.descuentoGlobal)}%`, `-${fmtMoney(d.sumaLineas - d.baseImponible)}`);
  }
  row('Base imponible', fmtMoney(d.baseImponible));
  for (const i of imps) {
    row(`IVA ${fmtNumber(i.ivaTipo)}% s/ ${fmtMoney(i.base)}`, fmtMoney(i.cuota));
    if (i.cuotaRecargo) row(`Rec. equiv. ${fmtNumber(i.recargoPct)}%`, fmtMoney(i.cuotaRecargo));
  }
  if (d.totalRetencion) row('Retención IRPF', `-${fmtMoney(d.totalRetencion)}`);
  doc.moveTo(tx + 20, y).lineTo(547, y).lineWidth(1).strokeColor(BRAND.violeta).stroke();
  y += 6;
  row('TOTAL', fmtMoney(d.total, d.moneda), true);

  // Pie: forma de pago, observaciones, condiciones, QR Verifactu
  let fy = Math.max(y - 70, doc.y) + 10;
  if (fy > 690) {
    doc.addPage();
    fy = 60;
  }
  doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.tinta);
  const notas: string[] = [];
  if (fp) notas.push(`Forma de pago: ${fp.nombre}${fp.tipo === 'transferencia' && emp!.iban ? ` · IBAN ${formatIban(emp!.iban)}` : ''}${fp.tipo === 'domiciliacion' && t.iban ? ` · Cargo en ${formatIban(String(t.iban)).replace(/.(?=.{4})/g, (c) => (c === ' ' ? ' ' : '*'))}` : ''}`);
  if (d.regimenIva === 'intracomunitario') notas.push('Operación exenta de IVA: entrega intracomunitaria (art. 25 Ley 37/1992).');
  if (d.regimenIva === 'exportacion') notas.push('Operación exenta de IVA: exportación (art. 21 Ley 37/1992).');
  if (d.regimenIva === 'isp') notas.push('Inversión del sujeto pasivo (art. 84.Uno.2º Ley 37/1992).');
  if (d.observaciones) notas.push(d.observaciones);
  if (d.condiciones && d.tipo === 'presupuesto') notas.push(`Condiciones: ${d.condiciones}`);
  const ajustes = (emp!.ajustes ?? {}) as Record<string, string>;
  if (ajustes.pieFactura && d.tipo.startsWith('factura')) notas.push(ajustes.pieFactura);
  doc.text(notas.join('\n\n'), 48, fy, { width: vf ? 360 : 300 });

  if (vf) {
    const qr = await QRCode.toBuffer(vf.urlQr, { margin: 0, width: 140, errorCorrectionLevel: 'M' });
    const qy = Math.min(Math.max(doc.y + 10, fy), 690);
    doc.image(qr, 48, qy, { width: 70 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.tinta).text('QR tributario:', 126, qy + 4);
    doc.font('Helvetica').fontSize(7.5).text('Factura verificable en la sede electrónica de la AEAT', 126, qy + 16, { width: 220 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.violeta).text('VERI*FACTU', 126, qy + 34);
  }

  // Firma de aceptación / entrega
  if (d.firmaImagen && (d.tipo === 'presupuesto' || d.tipo === 'albaran')) {
    try {
      const png = Buffer.from(d.firmaImagen.split(',')[1]!, 'base64');
      const sy = Math.min(doc.y + 20, 700);
      doc.font('Helvetica').fontSize(8).fillColor(BRAND.gris).text(`${d.tipo === 'presupuesto' ? 'Aceptado' : 'Recibido'} por ${d.aceptadoPor ?? ''} el ${fmtDate(d.aceptadoEn as unknown as string)}`, 360, sy);
      doc.image(png, 360, sy + 12, { fit: [180, 60] });
    } catch {
      /* firma ilegible */
    }
  }

  pdfFooter(doc, `${emp!.razonSocial ?? emp!.nombre}${emp!.nif ? ' · NIF ' + emp!.nif : ''} · ${titulo} ${d.codigo ?? 'borrador'}`);
  return { buffer: await pdfToBuffer(doc), nombre: `${titulo.toLowerCase().replace(/ /g, '-')}-${d.codigo ?? 'borrador'}.pdf` };
}
