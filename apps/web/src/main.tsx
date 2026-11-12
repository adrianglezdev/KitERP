import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { APARIENCIA_DEFECTO } from '@kite/shared';
import { ApiError } from './lib/api';
import { applyBrand, cachedBrand } from './lib/theme';
import { App } from './App';
import './index.css';

// La marca recordada (o la de serie) se aplica antes de pintar nada; la sesión la actualiza después
applyBrand(cachedBrand() ?? { empresaId: null, nombre: null, logoUrl: null, apariencia: APARIENCIA_DEFECTO }, { persist: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-sans), system-ui, sans-serif', borderRadius: 'calc(1rem * var(--radius, 1))' } }} />
    </QueryClientProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
