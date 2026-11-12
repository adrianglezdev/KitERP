import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtHours, fmtMoney, fmtNumber, moduleInfo, type DashboardWidget, type Pillar } from '@kite/shared';
import { SERIES_COLORS } from '@/lib/theme';
import { cn, PILLAR_CLASSES, TONES, type Tone } from '@/lib/utils';
import { Card } from '@/components/ui';

export { CHART, SERIES_COLORS } from '@/lib/theme';

export function fmtValue(v: number | string, format?: string) {
  if (typeof v === 'string') return v;
  if (format === 'money') return fmtMoney(v);
  if (format === 'percent') return `${fmtNumber(v, 1)} %`;
  if (format === 'hours') return fmtHours(v);
  return fmtNumber(v, 0);
}

function compactMoney(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} M€`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)} k€`;
  return `${Math.round(v)} €`;
}

/** Gráfico reutilizable (barras, líneas, área, tarta) con los colores de la marca. */
export function Chart({ chart, data, xKey, series, format, height = 220 }: { chart: 'bar' | 'line' | 'area' | 'pie'; data: Record<string, any>[]; xKey: string; series: { key: string; label: string; color?: string }[]; format?: string; height?: number }) {
  const tick = { fill: 'rgb(var(--muted))', fontSize: 11 };
  const yfmt = (v: number) => (format === 'money' ? compactMoney(v) : format === 'hours' ? `${v} h` : fmtNumber(v, 0));
  const tooltip = (
    <Tooltip
      cursor={{ fill: 'rgb(var(--sunken))' }}
      contentStyle={{ background: 'rgb(var(--surface))', border: 'none', borderRadius: 'calc(0.875rem * var(--radius, 1))', boxShadow: 'var(--shadow-pop)', fontSize: 12.5, fontWeight: 600, padding: '8px 12px' }}
      formatter={(v: number, n: string) => [fmtValue(v, format), series.find((s) => s.key === n)?.label ?? n]}
    />
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      {chart === 'pie' ? (
        <PieChart>
          {tooltip}
          <Pie data={data} dataKey={series[0]!.key} nameKey={xKey} innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      ) : chart === 'line' ? (
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey={xKey} tick={tick} axisLine={false} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={52} tickFormatter={yfmt} />
          {tooltip}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color ?? SERIES_COLORS[i]} strokeWidth={2.2} dot={false} />
          ))}
        </LineChart>
      ) : chart === 'area' ? (
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey={xKey} tick={tick} axisLine={false} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={52} tickFormatter={yfmt} />
          {tooltip}
          {series.map((s, i) => (
            <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color ?? SERIES_COLORS[i]} fill={s.color ?? SERIES_COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
          ))}
        </AreaChart>
      ) : (
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey={xKey} tick={tick} axisLine={false} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={52} tickFormatter={yfmt} />
          {tooltip}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color ?? SERIES_COLORS[i]} radius={[8, 8, 3, 3]} maxBarSize={36} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

// La cifra destacada de cada pilar va sobre un bloque de color (como en el panel de dirección)
const DESTACADO: Record<Pillar, string> = {
  personas: 'bg-primary text-primary-fg',
  comercial: 'bg-primary text-primary-fg',
  operaciones: 'bg-sun text-sun-fg',
  finanzas: 'bg-deep text-deep-fg dark:bg-sunken dark:text-fg',
  plataforma: 'bg-deep text-deep-fg dark:bg-sunken dark:text-fg',
};

/** Tarjeta de indicador del panel de inicio (stat, lista o gráfico), aportada por cualquier módulo. */
export function WidgetCard({ w, destacado }: { w: DashboardWidget; destacado?: boolean }) {
  const pillar: Pillar = moduleInfo(w.modulo)?.pillar ?? 'plataforma';
  const d = w.data;
  const link = 'enlace' in d ? d.enlace : undefined;
  const fill = destacado && d.kind === 'stat';
  return (
    <Card className={cn('flex flex-col overflow-hidden', fill && DESTACADO[pillar], fill && '!shadow-none', w.size === 'lg' && d.kind === 'chart' && 'md:col-span-2', d.kind === 'stat' ? '' : 'min-h-[180px]')}>
      <div className="flex items-center gap-2 px-5 pt-[18px]">
        {!fill && <span className={cn('h-2 w-2 shrink-0 rounded-full', PILLAR_CLASSES[pillar]!.dot)} />}
        <h3 className={cn('min-w-0 flex-1 truncate font-sans text-[12.5px] font-bold tracking-normal', fill ? 'opacity-80' : 'text-fg/65')}>{w.titulo}</h3>
        {link && (
          <Link to={link} className={cn('-mr-1 flex h-6 w-6 items-center justify-center rounded-pill transition', fill ? 'opacity-80 hover:opacity-100' : 'text-muted hover:bg-sunken hover:text-primary')} aria-label={`Abrir ${w.titulo}`}>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1 px-5 pb-5 pt-2">
        {d.kind === 'stat' && (
          <div>
            <p className="tabular font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.03em]">{fmtValue(d.value, d.format)}</p>
            {(d.hint || d.delta !== undefined) && (
              <p className={cn('mt-1 text-[12.5px]', fill ? 'opacity-80' : 'text-muted')}>
                {d.delta !== undefined && d.delta !== null && <span className={cn('mr-1 font-bold', fill ? '' : d.delta >= 0 ? 'text-ok' : 'text-bad')}>{d.delta >= 0 ? '▲' : '▼'} {fmtNumber(Math.abs(d.delta), 1)} %</span>}
                {d.hint}
              </p>
            )}
          </div>
        )}
        {d.kind === 'list' &&
          (d.items.length ? (
            <ul className="-mx-2 space-y-0.5">
              {d.items.map((it, i) => {
                const inner = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">{it.titulo}</span>
                      {it.subtitulo && <span className="block truncate text-[12px] text-muted">{it.subtitulo}</span>}
                    </span>
                    {it.valor && <span className={cn('tabular inline-flex h-6 shrink-0 items-center rounded-pill px-2.5 text-[11.5px] font-bold', TONES[(it.tone as Tone) ?? 'gray'])}>{it.valor}</span>}
                  </>
                );
                return (
                  <li key={i}>
                    {it.enlace ? (
                      <Link to={it.enlace} className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-sunken/70">
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 px-2 py-1.5">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-4 text-center text-[13px] text-muted">{d.vacio ?? 'Nada pendiente'}</p>
          ))}
        {d.kind === 'chart' && <Chart chart={d.chart} data={d.data} xKey={d.xKey} series={d.series} format={d.format} height={w.size === 'lg' ? 240 : 190} />}
      </div>
    </Card>
  );
}
