import { lazy, Suspense, type ComponentType } from 'react';
import { Spinner } from '@/components/ui';

/** Carga una página del módulo bajo demanda (la web inicial pesa menos y abre antes en el móvil). */
export function page(loader: () => Promise<{ default: ComponentType<any> }>) {
  const C = lazy(loader);
  return (
    <Suspense fallback={<Spinner />}>
      <C />
    </Suspense>
  );
}

/** Igual que page() pero devuelve el componente (para pestañas de fichas). */
export function lazyComponent<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>) {
  const C = lazy(loader);
  return function LazyWrapped(props: P) {
    return (
      <Suspense fallback={<Spinner />}>
        <C {...(props as any)} />
      </Suspense>
    );
  };
}
