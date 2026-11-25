import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtHours, fmtMoney, fmtNumber, moduleInfo, type DashboardWidget, type Pillar } from '@kite/shared';
import { SERIES_COLORS } from '@/lib/theme';
import { cn, PILLAR_CLASSES, TONES, type Tone } from '@/lib/utils';
import { Card, ModuleIcon } from '@/components/ui';

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
      contentStyle={{ background: 'rgb(var(--surface))', border: 'none', borderRadius: 'calc(0.875rem * var(--radius, 1))', boxShadow: 'var(--shadow-pop)', fontSize: 12, fontWeight: 500, padding: '8px 12px' }}
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
            <Bar key={s.key} dataKey={s.key} fill={s.color ?? SERIES_COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

/**
 * Tarjeta de indicador del panel de inicio (stat, lista o gráfico), aportada por cualquier módulo.
 * Todas las cifras van en tarjetas tranquilas: el color queda para el punto del pilar y los gráficos.
 */
export function WidgetCard({ w }: { w: DashboardWidget }) {
  const d = w.data;
  const link = 'enlace' in d ? d.enlace : undefined;
  return (
    <Card className={cn('flex flex-col overflow-hidden', w.size === 'lg' && d.kind === 'chart' && 'md:col-span-2')}>
      <div className="flex items-center gap-2 px-5 pt-5">
        <ModuleIcon modulo={w.modulo} size="xs" />
        <h3 className="min-w-0 flex-1 truncate font-sans text-[13px] font-medium text-fg/70">{w.titulo}</h3>
        {link && (
          <Link to={link} className="-mr-1 flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-fg" aria-label={`Abrir ${w.titulo}`}>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1 px-5 pb-5 pt-2">
        {d.kind === 'stat' && (
          <div>
            <p className="tabular font-display text-[28px] font-medium leading-[1.1]">{fmtValue(d.value, d.format)}</p>
            {(d.hint || d.delta !== undefined) && (
              <p className="mt-1 text-[13px] text-muted">
                {d.delta !== undefined && d.delta !== null && <span className={cn('mr-1 font-medium', d.delta >= 0 ? 'text-ok' : 'text-bad')}>{d.delta >= 0 ? '▲' : '▼'} {fmtNumber(Math.abs(d.delta), 1)} %</span>}
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
                      <span className="block truncate text-[14px] font-medium">{it.titulo}</span>
                      {it.subtitulo && <span className="block truncate text-[12px] text-muted">{it.subtitulo}</span>}
                    </span>
                    {it.valor && <span className={cn('tabular inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[12px] font-medium', TONES[(it.tone as Tone) ?? 'gray'])}>{it.valor}</span>}
                  </>
                );
                return (
                  <li key={i}>
                    {it.enlace ? (
                      <Link to={it.enlace} className="flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-sunken/70">
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 px-2 py-2">{inner}</div>
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
