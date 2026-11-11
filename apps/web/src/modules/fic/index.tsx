import { Navigate } from 'react-router-dom';
import { GraduationCap, IdCard, UserCheck, Users } from 'lucide-react';
import { useSession } from '@/lib/session';
import { defineModule } from '../types';
import { lazyComponent, page } from '../lazy';

const FichaLaboral = lazyComponent<{ id: string; record: any }>(() => import('./pages/FichaLaboral'));
const FormacionPrl = lazyComponent<{ id: string; record: any }>(() => import('./pages/FormacionPrl'));

/** Acceso directo a la propia ficha (para el portal y el móvil). */
function MiFicha() {
  const { session } = useSession();
  return <Navigate to={session?.user.personaId ? `/personas/${session.user.personaId}?tab=fic-ficha` : '/cuenta'} replace />;
}

export default defineModule({
  code: 'fic',
  nav: [
    { label: 'Plantilla', to: '/rrhh/plantilla', icon: Users, perm: 'fic.editar' },
    { label: 'Cambios por validar', to: '/rrhh/cambios', icon: UserCheck, perm: 'fic.editar' },
  ],
  routes: [
    { path: 'rrhh/plantilla', element: page(() => import('./pages/Plantilla')) },
    { path: 'rrhh/cambios', element: page(() => import('./pages/Cambios')) },
    { path: 'mi-ficha', element: <MiFicha /> },
  ],
  portal: [{ label: 'Mis datos', description: 'Datos personales y contrato', to: '/mi-ficha', icon: IdCard }],
  entityTabs: {
    persona: [
      { id: 'ficha', label: 'Ficha laboral', icon: IdCard, component: FichaLaboral },
      { id: 'formacion', label: 'Formación y PRL', icon: GraduationCap, component: FormacionPrl },
    ],
  },
});
