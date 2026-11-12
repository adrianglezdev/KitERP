import { and, asc, eq, inArray, lt } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { config } from '../config';
import { db, type DbOrTx } from '../db/client';
import { emailsSalida } from '../db/schema';
import { fileBuffer, getFile } from './files';
import { BRAND, marcaDe } from './marca';

export interface EmailInput {
  empresaId?: string | null;
  para: string;
  asunto: string;
  html: string;
  adjuntos?: { archivoId: string; nombre: string }[];
}

/** Encola un email. Se envía en segundo plano y se reintenta si falla; nunca se pierde. */
export async function queueEmail(tx: DbOrTx, e: EmailInput) {
  const [row] = await tx
    .insert(emailsSalida)
    .values({ empresaId: e.empresaId ?? null, para: e.para, asunto: e.asunto, html: e.html, adjuntos: e.adjuntos ?? [] })
    .returning({ id: emailsSalida.id });
  return row!.id;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Plantilla de los correos. Con `ajustes` (los de la empresa) la cabecera y el botón llevan sus colores. */
export function emailLayout(opts: { empresa: string; titulo: string; cuerpo: string; boton?: { texto: string; url: string }; ajustes?: unknown }) {
  const m = opts.ajustes ? marcaDe(opts.ajustes) : BRAND;
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F2F3F8;font-family:Segoe UI,Arial,sans-serif;color:#1E2635">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #E3E6EE">
<tr><td style="background:${m.morado};padding:18px 24px;color:#fff;font-size:18px;font-weight:700">${esc(opts.empresa)}</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 12px">${esc(opts.titulo)}</h1>
<div style="font-size:15px;line-height:1.6">${opts.cuerpo}</div>
${opts.boton ? `<p style="margin:24px 0 8px"><a href="${opts.boton.url}" style="background:${m.violeta};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block;font-weight:700">${esc(opts.boton.texto)}</a></p><p style="font-size:12px;color:#707A8E">Si el botón no funciona, copia esta dirección: ${opts.boton.url}</p>` : ''}
</td></tr>
<tr><td style="padding:14px 24px;background:#F7F8FB;font-size:12px;color:#707A8E">Enviado con KiteERP</td></tr>
</table></td></tr></table></body></html>`;
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (!config.smtp.host) return null;
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
  });
  return transporter;
}

/** Procesa la bandeja de salida. Sin SMTP configurado, los emails quedan en estado "sin_smtp" y se ven en Configuración. */
export async function processOutbox(): Promise<string> {
  const t = getTransporter();
  const pending = await db
    .select()
    .from(emailsSalida)
    .where(and(inArray(emailsSalida.estado, t ? ['pendiente', 'error', 'sin_smtp'] : ['pendiente']), lt(emailsSalida.intentos, 6)))
    .orderBy(asc(emailsSalida.creadoEn))
    .limit(25);
  let sent = 0;
  for (const e of pending) {
    if (!t) {
      await db.update(emailsSalida).set({ estado: 'sin_smtp' }).where(eq(emailsSalida.id, e.id));
      continue;
    }
    try {
      const attachments = [];
      for (const a of e.adjuntos) {
        const f = await getFile(db, a.archivoId);
        attachments.push({ filename: a.nombre, content: await fileBuffer(f.ruta), contentType: f.mime });
      }
      await t.sendMail({ from: config.smtp.from, to: e.para, subject: e.asunto, html: e.html, attachments });
      await db.update(emailsSalida).set({ estado: 'enviado', enviadoEn: new Date(), error: null }).where(eq(emailsSalida.id, e.id));
      sent++;
    } catch (err: any) {
      await db
        .update(emailsSalida)
        .set({ estado: 'error', intentos: e.intentos + 1, error: String(err?.message ?? err).slice(0, 500) })
        .where(eq(emailsSalida.id, e.id));
    }
  }
  return `${sent} enviados de ${pending.length}`;
}
