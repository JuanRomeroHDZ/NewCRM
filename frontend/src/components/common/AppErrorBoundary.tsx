import React, { Component, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-obsidian-bg px-4 py-8 text-center text-obsidian-text">
        <section role="alert" aria-live="assertive" className="flex w-full max-w-lg flex-col items-center gap-4">
          <h1 className="font-heading text-xl font-semibold">LESSSO no pudo abrir esta vista</h1>
          <p className="text-sm leading-6 text-obsidian-muted">
            Recarga LESSSO para volver a intentarlo. Si el problema continúa, guarda cualquier cambio pendiente antes de cerrar la pestaña.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="ui-action-secondary">
            <RotateCw size={16} aria-hidden="true" />
            Volver a cargar
            {/* [Acción secundaria] Recupera la interfaz después de un error de renderizado. */}
          </button>
        </section>
      </main>
    );
  }
}
