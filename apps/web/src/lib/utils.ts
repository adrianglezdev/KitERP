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
  Mail,
  Phone,
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
  Mail,
  Phone,
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
  gray: 'bg-sunken text-muted ring-transparent',
  violet: 'bg-primary-soft text-primary ring-transparent',
  purple: 'bg-deep/10 text-deep ring-transparent dark:text-fg',
  green: 'bg-ok-soft text-ok ring-transparent',
  yellow: 'bg-warn-soft text-warn ring-transparent',
  brown: 'bg-earth-soft text-bad ring-transparent',
  red: 'bg-bad-soft text-bad ring-transparent',
  blue: 'bg-info-soft text-info ring-transparent',
  orange: 'bg-bad-soft text-bad ring-transparent',
};

/** Clases de color de cada pilar. `solid` es la baldosa de color de las aplicaciones del lanzador. */
export const PILLAR_CLASSES: Record<string, { dot: string; soft: string; text: string; solid: string }> = {
  personas: { dot: 'bg-primary', soft: 'bg-primary-soft', text: 'text-primary', solid: 'bg-primary text-primary-fg' },
  comercial: { dot: 'bg-earth', soft: 'bg-earth-soft', text: 'text-bad', solid: 'bg-earth text-earth-fg' },
  operaciones: { dot: 'bg-leaf', soft: 'bg-leaf-soft', text: 'text-info', solid: 'bg-leaf text-leaf-fg' },
  finanzas: { dot: 'bg-sun', soft: 'bg-sun-soft', text: 'text-ok', solid: 'bg-sun text-sun-fg' },
  plataforma: { dot: 'bg-deep dark:bg-muted', soft: 'bg-deep/10 dark:bg-sunken', text: 'text-deep dark:text-fg', solid: 'bg-deep text-deep-fg dark:bg-line-strong dark:text-fg' },
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
