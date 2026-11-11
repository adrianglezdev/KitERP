import { useMemo, type ReactNode } from 'react';
import { Activity, ListTodo, MessageSquare, Paperclip, type LucideIcon } from 'lucide-react';
import { useSession } from '@/lib/session';
import { Card, Tabs, useTab } from '@/components/ui';
import { moduleWebs } from '@/modules/registry';
import { Attachments, Comments, EntityTasks, Timeline } from './index';

export interface PageTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  content: ReactNode;
  hidden?: boolean;
  count?: number;
}

/**
 * Ficha con pestañas: las propias de la página, las que aportan los módulos activos
 * (p. ej. "Fichajes" en una persona o "Equipos" en un cliente) y las comunes:
 * documentos, comentarios, tareas y actividad.
 */
export function EntityTabsView({ entidad, id, record, tabs, canEdit = true, common = ['adjuntos', 'comentarios', 'tareas', 'actividad'] }: { entidad: 'persona' | 'tercero' | 'articulo' | string; id: string; record: any; tabs: PageTab[]; canEdit?: boolean; common?: string[] }) {
  const { has, can } = useSession();
  const moduleTabs = useMemo(
    () =>
      moduleWebs
        .filter((m) => has(m.code))
        .flatMap((m) => (m.entityTabs?.[entidad as 'persona'] ?? []).filter((t) => !t.perm || can(t.perm)).map((t) => ({ ...t, id: `${m.code}-${t.id}` }))),
    [has, can, entidad],
  );
  const all: PageTab[] = ([
    ...tabs,
    ...moduleTabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon, content: <t.component id={id} record={record} /> })),
    { id: 'adjuntos', label: 'Documentos', icon: Paperclip, content: <Attachments entidad={entidad} id={id} canEdit={canEdit} />, hidden: !common.includes('adjuntos') },
    { id: 'comentarios', label: 'Comentarios', icon: MessageSquare, content: <Comments entidad={entidad} id={id} />, hidden: !common.includes('comentarios') },
    { id: 'tareas', label: 'Tareas', icon: ListTodo, content: <EntityTasks entidad={entidad} id={id} />, hidden: !common.includes('tareas') },
    { id: 'actividad', label: 'Actividad', icon: Activity, content: <Timeline entidad={entidad} id={id} />, hidden: !common.includes('actividad') },
  ] as PageTab[]).filter((t) => !t.hidden);
  const current = useTab(all[0]?.id ?? '');
  const active = all.find((t) => t.id === current) ?? all[0];
  return (
    <>
      <Tabs tabs={all.map((t) => ({ id: t.id, label: t.label, icon: t.icon, count: t.count }))} />
      <Card className="p-4 sm:p-5">{active?.content}</Card>
    </>
  );
}

export { Tabs };
