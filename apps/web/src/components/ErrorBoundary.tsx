import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Si una pantalla falla al dibujarse, se muestra un aviso en su lugar y el resto de la aplicación
 * (menú, cabecera, otras páginas) sigue funcionando. Se reinicia al cambiar de página (prop `resetKey`).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en la pantalla', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-10 max-w-md rounded-2xl bg-surface p-6 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-pill bg-bad-soft text-bad">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="font-display text-[17px] font-bold">Esta pantalla no se ha podido mostrar</p>
        <p className="mt-1 text-[13.5px] text-muted">Tus datos están a salvo. Prueba a recargar; si se repite, avisa al administrador indicando qué estabas haciendo.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex items-center gap-2 rounded-pill bg-primary px-4 py-2 text-[13.5px] font-bold text-primary-fg">
          <RotateCcw className="h-4 w-4" /> Recargar
        </button>
      </div>
    );
  }
}
