import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { empresas, tareasProgramadas } from '../db/schema';
import { systemCtx } from './context';
import { processOutbox } from './mail';
import { activeModules, type JobDef, type ModuleDef } from './modules';

/**
 * Planificador de tareas.
 * Cada minuto revisa las tareas; antes de ejecutar una, registra (tarea, periodo) en la base de datos.
 * Si otra instancia ya la registró, no se repite: es seguro con varios servidores.
 */
function madridNow() {
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

async function claim(tarea: string, clave: string) {
  const r = await db.insert(tareasProgramadas).values({ tarea, clave }).onConflictDoNothing().returning();
  return r.length > 0;
}

export function startJobs(defs: ModuleDef[], log: (msg: string) => void) {
  const coreJobs: JobDef[] = [{ id: 'core.emails', every: 1, run: async () => processOutbox() }];
  const moduleJobs = defs.flatMap((d) => (d.jobs ?? []).map((j) => ({ ...j, module: d.code })));

  const tick = async () => {
    const now = madridNow();
    const minuteKey = Math.floor(Date.now() / 60000);
    try {
      for (const j of coreJobs) {
        if (j.every && minuteKey % j.every === 0) await j.run('', systemCtx('', []));
      }
      const emps = await db.select({ id: empresas.id }).from(empresas);
      for (const emp of emps) {
        const mods = await activeModules(emp.id);
        for (const j of moduleJobs) {
          if (!mods.has(j.module)) continue;
          let clave: string | null = null;
          if (j.every) clave = String(Math.floor(minuteKey / j.every));
          else if (j.dailyAt && now.time >= j.dailyAt) clave = now.date;
          if (!clave) continue;
          if (!(await claim(`${j.id}:${emp.id}`, clave))) continue;
          try {
            const res = await j.run(emp.id, systemCtx(emp.id, mods));
            if (res) await db.update(tareasProgramadas).set({ resultado: String(res).slice(0, 500) }).where(eq(tareasProgramadas.clave, clave));
          } catch (e: any) {
            log(`Tarea ${j.id} falló: ${e?.message ?? e}`);
          }
        }
      }
    } catch (e: any) {
      log(`Planificador: ${e?.message ?? e}`);
    }
  };
  const timer = setInterval(tick, 60_000);
  setTimeout(tick, 5_000);
  return () => clearInterval(timer);
}
