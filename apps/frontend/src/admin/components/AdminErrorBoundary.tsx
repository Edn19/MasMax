import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Component, ErrorInfo, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = { children: ReactNode; resetKey: string };
type State = { error: Error | null };

export class AdminErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Admin error boundary', error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) return <AdminErrorFallback onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

export function AdminErrorFallback({ onRetry }: { onRetry: () => void }) {
  return <section role="alert" className="mx-auto max-w-2xl rounded-2xl border border-coral/40 bg-coral/10 p-6 text-center sm:p-8">
    <AlertTriangle className="mx-auto text-coral" size={42} />
    <h1 className="mt-4 text-2xl font-black text-white">No se pudo actualizar el estado de publicación del episodio.</h1>
    <p className="mt-2 text-slate-300">Vuelve al listado e inténtalo nuevamente. Tu sesión y los datos guardados no se modificaron.</p>
    <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
      <button type="button" className="button-secondary" onClick={onRetry}><RefreshCw size={18} /> Reintentar</button>
      <Link to="/admin/episodes" className="button-primary"><ArrowLeft size={18} /> Volver al listado</Link>
    </div>
  </section>;
}
