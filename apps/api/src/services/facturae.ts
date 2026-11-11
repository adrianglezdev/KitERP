import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { documentoImpuestos, documentos, empresas, terceros } from '../db/schema';
import { lineasDe } from './documentos';

const esc = (s: unknown) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
const n2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const n6 = (n: number) => n.toFixed(6);

/**
 * Factura electrónica en formato Facturae 3.2.2 (FACe / administraciones públicas).
 * El XML se entrega sin firmar: debe firmarse con el certificado de la empresa (XAdES) antes de presentarse.
 */
export async function facturaeXml(id: string) {
  const [d] = await db.select().from(documentos).where(eq(documentos.id, id));
  if (!d) throw new Error('Documento no encontrado');
  const [e] = await db.select().from(empresas).where(eq(empresas.id, d.empresaId));
  const [tRaw] = await db.select().from(terceros).where(eq(terceros.id, d.terceroId));
  const t = { ...(tRaw ?? {}), ...((d.datosTercero as Record<string, any>) ?? {}) } as Record<string, any>;
  const lineas = (await lineasDe(db as any, id)).filter((l) => l.tipoLinea === 'articulo');
  const imps = await db.select().from(documentoImpuestos).where(eq(documentoImpuestos.documentoId, id));
  const partes = /^(\D+)(\d{2})-(\d+)$/.exec(d.codigo ?? '') ?? [];
  const serie = `${partes[1] ?? ''}${partes[2] ?? ''}`;
  const numero = partes[3] ?? d.codigo ?? '';
  const personType = (nif: string) => (/^[A-HJ-NP-SUVW]/.test(nif ?? '') ? 'J' : 'F');
  const party = (p: { nif: string; nombre: string; direccion?: string; cp?: string; localidad?: string; provincia?: string; pais?: string }) => `
      <TaxIdentification>
        <PersonTypeCode>${personType(p.nif)}</PersonTypeCode>
        <ResidenceTypeCode>${(p.pais ?? 'ES') === 'ES' ? 'R' : 'U'}</ResidenceTypeCode>
        <TaxIdentificationNumber>${esc(p.nif)}</TaxIdentificationNumber>
      </TaxIdentification>
      ${personType(p.nif) === 'J' ? `<LegalEntity>
        <CorporateName>${esc(p.nombre)}</CorporateName>` : `<Individual>
        <Name>${esc(p.nombre)}</Name><FirstSurname>-</FirstSurname>`}
        <AddressInSpain>
          <Address>${esc(p.direccion || '-')}</Address>
          <PostCode>${esc((p.cp || '00000').padStart(5, '0').slice(0, 5))}</PostCode>
          <Town>${esc(p.localidad || '-')}</Town>
          <Province>${esc(p.provincia || p.localidad || '-')}</Province>
          <CountryCode>ESP</CountryCode>
        </AddressInSpain>
      ${personType(p.nif) === 'J' ? '</LegalEntity>' : '</Individual>'}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <FileHeader>
    <SchemaVersion>3.2.2</SchemaVersion>
    <Modality>I</Modality>
    <InvoiceIssuerType>EM</InvoiceIssuerType>
    <Batch>
      <BatchIdentifier>${esc(e!.nif)}${esc(d.codigo)}</BatchIdentifier>
      <InvoicesCount>1</InvoicesCount>
      <TotalInvoicesAmount><TotalAmount>${n2(d.total)}</TotalAmount></TotalInvoicesAmount>
      <TotalOutstandingAmount><TotalAmount>${n2(d.total)}</TotalAmount></TotalOutstandingAmount>
      <TotalExecutableAmount><TotalAmount>${n2(d.total)}</TotalAmount></TotalExecutableAmount>
      <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
    </Batch>
  </FileHeader>
  <Parties>
    <SellerParty>${party({ nif: e!.nif ?? '', nombre: e!.razonSocial ?? e!.nombre, direccion: e!.direccion ?? '', cp: e!.codigoPostal ?? '', localidad: e!.localidad ?? '', provincia: e!.provincia ?? '', pais: e!.pais })}
    </SellerParty>
    <BuyerParty>${party({ nif: t.nif ?? '', nombre: t.razonSocial ?? t.nombre, direccion: t.direccion, cp: t.codigoPostal, localidad: t.localidad, provincia: t.provincia, pais: t.pais })}
    </BuyerParty>
  </Parties>
  <Invoices>
    <Invoice>
      <InvoiceHeader>
        <InvoiceNumber>${esc(numero)}</InvoiceNumber>
        <InvoiceSeriesCode>${esc(serie)}</InvoiceSeriesCode>
        <InvoiceDocumentType>${d.tipo === 'factura_simplificada' ? 'FA' : 'FC'}</InvoiceDocumentType>
        <InvoiceClass>${d.tipo === 'factura_rectificativa' ? 'OR' : 'OO'}</InvoiceClass>
      </InvoiceHeader>
      <InvoiceIssueData>
        <IssueDate>${d.fecha}</IssueDate>
        <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
        <TaxCurrencyCode>EUR</TaxCurrencyCode>
        <LanguageName>es</LanguageName>
      </InvoiceIssueData>
      <TaxesOutputs>${imps
        .map(
          (i) => `
        <Tax>
          <TaxTypeCode>01</TaxTypeCode>
          <TaxRate>${n2(i.ivaTipo)}</TaxRate>
          <TaxableBase><TotalAmount>${n2(i.base)}</TotalAmount></TaxableBase>
          <TaxAmount><TotalAmount>${n2(i.cuota)}</TotalAmount></TaxAmount>${i.recargoPct ? `
          <EquivalenceSurcharge>${n2(i.recargoPct)}</EquivalenceSurcharge>
          <EquivalenceSurchargeAmount><TotalAmount>${n2(i.cuotaRecargo)}</TotalAmount></EquivalenceSurchargeAmount>` : ''}
        </Tax>`,
        )
        .join('')}
      </TaxesOutputs>${d.totalRetencion ? `
      <TaxesWithheld><Tax><TaxTypeCode>04</TaxTypeCode><TaxRate>${n2(lineas[0]?.retencion ?? 0)}</TaxRate><TaxableBase><TotalAmount>${n2(d.baseImponible)}</TotalAmount></TaxableBase><TaxAmount><TotalAmount>${n2(d.totalRetencion)}</TotalAmount></TaxAmount></Tax></TaxesWithheld>` : ''}
      <InvoiceTotals>
        <TotalGrossAmount>${n2(d.sumaLineas)}</TotalGrossAmount>${d.descuentoGlobal ? `
        <GeneralDiscounts><Discount><DiscountReason>Descuento</DiscountReason><DiscountRate>${n2(d.descuentoGlobal)}</DiscountRate><DiscountAmount>${n2(d.sumaLineas - d.baseImponible)}</DiscountAmount></Discount></GeneralDiscounts>
        <TotalGeneralDiscounts>${n2(d.sumaLineas - d.baseImponible)}</TotalGeneralDiscounts>` : ''}
        <TotalGrossAmountBeforeTaxes>${n2(d.baseImponible)}</TotalGrossAmountBeforeTaxes>
        <TotalTaxOutputs>${n2(d.totalIva + d.totalRecargo)}</TotalTaxOutputs>
        <TotalTaxesWithheld>${n2(d.totalRetencion)}</TotalTaxesWithheld>
        <InvoiceTotal>${n2(d.total)}</InvoiceTotal>
        <TotalOutstandingAmount>${n2(d.total)}</TotalOutstandingAmount>
        <TotalExecutableAmount>${n2(d.total)}</TotalExecutableAmount>
      </InvoiceTotals>
      <Items>${lineas
        .map(
          (l) => `
        <InvoiceLine>
          <ItemDescription>${esc(l.descripcion)}</ItemDescription>
          <Quantity>${l.cantidad}</Quantity>
          <UnitOfMeasure>01</UnitOfMeasure>
          <UnitPriceWithoutTax>${n6(l.precio)}</UnitPriceWithoutTax>
          <TotalCost>${n6(l.cantidad * l.precio)}</TotalCost>${l.descuento ? `
          <DiscountsAndRebates><Discount><DiscountReason>Descuento</DiscountReason><DiscountRate>${n2(l.descuento)}</DiscountRate><DiscountAmount>${n6(l.cantidad * l.precio - l.subtotal)}</DiscountAmount></Discount></DiscountsAndRebates>` : ''}
          <GrossAmount>${n6(l.subtotal)}</GrossAmount>
          <TaxesOutputs><Tax><TaxTypeCode>01</TaxTypeCode><TaxRate>${n2(l.ivaTipo)}</TaxRate><TaxableBase><TotalAmount>${n2(l.subtotal)}</TotalAmount></TaxableBase></Tax></TaxesOutputs>
        </InvoiceLine>`,
        )
        .join('')}
      </Items>
    </Invoice>
  </Invoices>
</fe:Facturae>`;
}
