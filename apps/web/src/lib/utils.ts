import { clsx, type ClassValue } from 'clsx';
import {
  AlarmClock,
  AlertTriangle,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Boxes,
  Building2,
  Calendar,
  CalendarDays,
  CalendarHeart,
  CheckCircle2,
  Circle,
  Clock,
  Contact,
  CreditCard,
  FileSignature,
  FileText,
  FolderOpen,
  FolderTree,
  Hammer,
  History,
  IdCard,
  KanbanSquare,
  Landmark,
  MapPin,
  Megaphone,
  MessageSquare,
  Network,
  Package,
  PackageCheck,
  Plug,
  Receipt,
  ReceiptEuro,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Tags,
  Target,
  Truck,
  User,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export function cn(...c: ClassValue[]) {
  return clsx(c);
}

/** Iconos referenciados por nombre desde el servidor o el catálogo de módulos. */
const ICONS: Record<string, LucideIcon> = {
  AlarmClock,
  AlertTriangle,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Boxes,
  Building2,
  Calendar,
  CalendarDays,
  CalendarHeart,
  CheckCircle2,
  Clock,
  Contact,
  CreditCard,
  FileSignature,
  FileText,
  FolderOpen,
  FolderTree,
  Hammer,
  History,
  IdCard,
  KanbanSquare,
  Landmark,
  MapPin,
  Megaphone,
  MessageSquare,
  Network,
  Package,
  PackageCheck,
  Plug,
  Receipt,
  ReceiptEuro,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Tags,
  Target,
  Truck,
  User,
  UserPlus,
  Users,
  Wallet,
  Wrench,
};

export function iconByName(name?: string | null): LucideIcon {
  return (name && ICONS[name]) || Circle;
}

export function registerIcons(map: Record<string, LucideIcon>) {
  Object.assign(ICONS, map);
}

export type Tone = 'gray' | 'violet' | 'purple' | 'green' | 'yellow' | 'brown' | 'red' | 'blue' | 'orange';

export const TONES: Record<Tone, string> = {
  gray: 'bg-sunken text-muted ring-line',
  violet: 'bg-primary-soft text-primary ring-primary/20',
  purple: 'bg-deep/10 text-deep ring-deep/20 dark:text-fg',
  green: 'bg-ok-soft text-ok ring-ok/20',
  yellow: 'bg-sun-soft text-warn ring-warn/20',
  brown: 'bg-earth-soft text-earth ring-earth/25 dark:text-fg',
  red: 'bg-bad-soft text-bad ring-bad/20',
  blue: 'bg-info-soft text-info ring-info/20',
  orange: 'bg-warn-soft text-warn ring-warn/25',
};

export const PILLAR_CLASSES: Record<string, { dot: string; soft: string; text: string }> = {
  personas: { dot: 'bg-sun', soft: 'bg-sun-soft', text: 'text-warn' },
  comercial: { dot: 'bg-primary', soft: 'bg-primary-soft', text: 'text-primary' },
  operaciones: { dot: 'bg-leaf', soft: 'bg-leaf-soft', text: 'text-ok' },
  finanzas: { dot: 'bg-earth', soft: 'bg-earth-soft', text: 'text-earth' },
  plataforma: { dot: 'bg-deep', soft: 'bg-deep/10', text: 'text-deep dark:text-fg' },
};

export function fileSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function relTime(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
