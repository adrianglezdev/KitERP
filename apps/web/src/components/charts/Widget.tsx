import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtHours, fmtMoney, fmtNumber, moduleInfo, PILLARS, type DashboardWidget } from '@kite/shared';
import { cn, TONES, type Tone } from '@/lib/utils';
import { Card } from '@/components/ui';

export const SERIES_COLORS = ['#7D2CDD', '#35AE29', '#B28574', '#5E2A78', '#D4BE00', '#3466D6'];

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
      contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 10, fontSize: 12.5 }}
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

/** Tarjeta de indicador del panel de inicio (stat, lista o gráfico), aportada por cualquier módulo. */
export function WidgetCard({ w }: { w: DashboardWidget }) {
  const info = moduleInfo(w.modulo);
  const pillarColor = info ? PILLARS[info.pillar].color : '#7D2CDD';
  const d = w.data;
  const link = 'enlace' in d ? d.enlace : undefined;
  return (
    <Card className={cn('flex flex-col overflow-hidden', w.size === 'lg' && 'md:col-span-2', w.size === 'sm' ? '' : 'min-h-[180px]')}>
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <span className="h-2 w-2 rotate-45 rounded-[2px]" style={{ background: pillarColor }} />
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted">{w.titulo}</h3>
        {link && (
          <Link to={link} className="rounded p-0.5 text-muted hover:text-primary" aria-label={`Abrir ${w.titulo}`}>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1 px-4 pb-4 pt-2">
        {d.kind === 'stat' && (
          <div>
            <p className="tabular font-display text-[28px] font-extrabold leading-tight">{fmtValue(d.value, d.format)}</p>
            {(d.hint || d.delta !== undefined) && (
              <p className="mt-0.5 text-[12.5px] text-muted">
                {d.delta !== undefined && d.delta !== null && <span className={cn('mr-1 font-semibold', d.delta >= 0 ? 'text-ok' : 'text-bad')}>{d.delta >= 0 ? '▲' : '▼'} {fmtNumber(Math.abs(d.delta), 1)} %</span>}
                {d.hint}
              </p>
            )}
          </div>
        )}
        {d.kind === 'list' &&
          (d.items.length ? (
            <ul className="-mx-1 space-y-0.5">
              {d.items.map((it, i) => {
                const inner = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px]">{it.titulo}</span>
                      {it.subtitulo && <span className="block truncate text-[12px] text-muted">{it.subtitulo}</span>}
                    </span>
                    {it.valor && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset', TONES[(it.tone as Tone) ?? 'gray'])}>{it.valor}</span>}
                  </>
                );
                return (
                  <li key={i}>
                    {it.enlace ? (
                      <Link to={it.enlace} className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-sunken">
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 px-1 py-1.5">{inner}</div>
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
