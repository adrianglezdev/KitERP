/**
 * Ficheros SEPA (ISO 20022):
 *  - Adeudos directos SEPA esquema CORE: pain.008.001.02
 *  - Transferencias SEPA: pain.001.001.03
 * Los textos se limitan al juego de caracteres SEPA (latino básico) y a las longitudes máximas del esquema.
 */

export interface SepaParte {
  nombre: string;
  iban: string;
  bic?: string | null;
}

export interface SepaAdeudo {
  endToEndId: string;
  importe: number;
  mandatoId: string;
  mandatoFecha: string; // AAAA-MM-DD
  deudor: SepaParte;
  concepto: string;
}

export interface SepaTransferencia {
  endToEndId: string;
  importe: number;
  beneficiario: SepaParte;
  concepto: string;
}

/** Quita acentos y caracteres no admitidos por SEPA, y recorta a la longitud máxima. */
export function sepaText(s: string, max: number) {
  const clean = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, max);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const amt = (n: number) => n.toFixed(2);
const iban = (s: string) => s.replace(/\s/g, '').toUpperCase();
const sum = (xs: { importe: number }[]) => Math.round(xs.reduce((a, x) => a + Math.round(x.importe * 100), 0)) / 100;

function agente(bic?: string | null) {
  return bic ? `<FinInstnId><BIC>${esc(bic.toUpperCase())}</BIC></FinInstnId>` : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
}

/** Fichero de recibos (adeudos directos SEPA CORE). */
export function painAdeudos(opts: {
  msgId: string;
  creado: Date;
  fechaCobro: string;
  acreedor: SepaParte & { id: string };
  recibos: SepaAdeudo[];
  secuencia?: 'RCUR' | 'FRST' | 'OOFF';
}) {
  const n = opts.recibos.length;
  const total = amt(sum(opts.recibos));
  const tx = opts.recibos
    .map(
      (r) => `      <DrctDbtTxInf>
        <PmtId><EndToEndId>${esc(sepaText(r.endToEndId, 35))}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${amt(r.importe)}</InstdAmt>
        <DrctDbtTx><MndtRltdInf><MndtId>${esc(sepaText(r.mandatoId, 35))}</MndtId><DtOfSgntr>${r.mandatoFecha}</DtOfSgntr></MndtRltdInf></DrctDbtTx>
        <DbtrAgt>${agente(r.deudor.bic)}</DbtrAgt>
        <Dbtr><Nm>${esc(sepaText(r.deudor.nombre, 70))}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${iban(r.deudor.iban)}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${esc(sepaText(r.concepto, 140))}</Ustrd></RmtInf>
      </DrctDbtTxInf>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${esc(sepaText(opts.msgId, 35))}</MsgId>
      <CreDtTm>${opts.creado.toISOString().slice(0, 19)}</CreDtTm>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <InitgPty><Nm>${esc(sepaText(opts.acreedor.nombre, 70))}</Nm><Id><OrgId><Othr><Id>${esc(opts.acreedor.id)}</Id></Othr></OrgId></Id></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(sepaText(opts.msgId + '-1', 35))}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>${opts.secuencia ?? 'RCUR'}</SeqTp></PmtTpInf>
      <ReqdColltnDt>${opts.fechaCobro}</ReqdColltnDt>
      <Cdtr><Nm>${esc(sepaText(opts.acreedor.nombre, 70))}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${iban(opts.acreedor.iban)}</IBAN></Id></CdtrAcct>
      <CdtrAgt>${agente(opts.acreedor.bic)}</CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>${esc(opts.acreedor.id)}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
${tx}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>
`;
}

/** Fichero de transferencias SEPA a proveedores. */
export function painTransferencias(opts: { msgId: string; creado: Date; fechaEjecucion: string; ordenante: SepaParte & { id: string }; pagos: SepaTransferencia[] }) {
  const n = opts.pagos.length;
  const total = amt(sum(opts.pagos));
  const tx = opts.pagos
    .map(
      (p) => `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(sepaText(p.endToEndId, 35))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${amt(p.importe)}</InstdAmt></Amt>
        ${p.beneficiario.bic ? `<CdtrAgt><FinInstnId><BIC>${esc(p.beneficiario.bic.toUpperCase())}</BIC></FinInstnId></CdtrAgt>` : ''}
        <Cdtr><Nm>${esc(sepaText(p.beneficiario.nombre, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${iban(p.beneficiario.iban)}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${esc(sepaText(p.concepto, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(sepaText(opts.msgId, 35))}</MsgId>
      <CreDtTm>${opts.creado.toISOString().slice(0, 19)}</CreDtTm>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <InitgPty><Nm>${esc(sepaText(opts.ordenante.nombre, 70))}</Nm><Id><OrgId><Othr><Id>${esc(opts.ordenante.id)}</Id></Othr></OrgId></Id></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(sepaText(opts.msgId + '-1', 35))}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${opts.fechaEjecucion}</ReqdExctnDt>
      <Dbtr><Nm>${esc(sepaText(opts.ordenante.nombre, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${iban(opts.ordenante.iban)}</IBAN></Id></DbtrAcct>
      <DbtrAgt>${agente(opts.ordenante.bic)}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${tx}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
