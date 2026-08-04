import { AlertTriangle, Home, RefreshCw, SearchX, WifiOff } from 'lucide-react';
import { Component, ErrorInfo, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, isRouteErrorResponse, useLocation, useRouteError } from 'react-router-dom';
import { probeApi } from '../lib/api';

const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Frontend error boundary', error, info.componentStack); }
  render() { return this.state.error ? <GeneralErrorPage onRetry={() => this.setState({ error: null })} /> : this.props.children; }
}

export function BackendGate({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(() => navigator.onLine);
  const [checking, setChecking] = useState(false);
  const retry = useCallback(async () => {
    setChecking(true);
    const ok = await probeApi();
    setAvailable(ok);
    setChecking(false);
  }, []);

  useEffect(() => {
    const unavailable = () => setAvailable(false);
    const restored = () => setAvailable(true);
    const online = () => void retry();
    const offline = () => setAvailable(false);
    window.addEventListener('masmax:api-unavailable', unavailable);
    window.addEventListener('masmax:api-available', restored);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('masmax:api-unavailable', unavailable);
      window.removeEventListener('masmax:api-available', restored);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [retry]);

  return available ? children : <MaintenancePage checking={checking} onRetry={retry} />;
}

export function AppFrame() {
  const location = useLocation();
  const announcement = routeLabel(location.pathname);
  useSpatialNavigation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);
  return <><span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span><Outlet /></>;
}

export function RouteErrorPage() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = status === 404 ? 'La pagina que buscas no existe o cambio de direccion.' : 'No pudimos mostrar esta pagina. Intenta nuevamente.';
  return <ErrorShell icon={<AlertTriangle size={50} />} title={status === 404 ? 'Pagina no encontrada' : 'Algo salio mal'} description={message} />;
}

export function NotFoundPage() {
  return <ErrorShell icon={<SearchX size={50} />} title="Pagina no encontrada" description="El enlace no existe. Puedes volver al inicio y seguir explorando." />;
}

function GeneralErrorPage({ onRetry }: { onRetry: () => void }) {
  return <ErrorShell icon={<AlertTriangle size={50} />} title="Ocurrio un error inesperado" description="La interfaz encontro un problema. Tus datos y tu sesion no se modificaron." onRetry={onRetry} />;
}

function MaintenancePage({ checking, onRetry }: { checking: boolean; onRetry: () => Promise<void> }) {
  return <main id="main-content" className="grid min-h-screen place-items-center px-4" tabIndex={-1}><section role="status" className="w-full max-w-xl rounded-3xl border border-line bg-panel/95 p-8 text-center shadow-glow sm:p-12"><WifiOff className="mx-auto text-brand" size={56} /><p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-brand">Conexion temporalmente interrumpida</p><h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Estamos intentando volver</h1><p className="mx-auto mt-4 max-w-md leading-7 text-slate-400">El backend no esta disponible. Revisa tu conexion o espera unos segundos; no necesitas cerrar sesion.</p><button type="button" disabled={checking} onClick={() => void onRetry()} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-black text-ink disabled:opacity-60"><RefreshCw className={checking ? 'animate-spin' : ''} size={18} /> {checking ? 'Comprobando...' : 'Reintentar conexion'}</button></section></main>;
}

function ErrorShell({ icon, title, description, onRetry }: { icon: ReactNode; title: string; description: string; onRetry?: () => void }) {
  return <main id="main-content" className="grid min-h-screen place-items-center px-4" tabIndex={-1}><section role="alert" className="w-full max-w-lg rounded-3xl border border-line bg-panel/95 p-8 text-center shadow-glow"><span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-coral/10 text-coral">{icon}</span><h1 className="mt-6 text-3xl font-black text-white">{title}</h1><p className="mt-3 leading-7 text-slate-400">{description}</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">{onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-5 py-3 font-bold text-white"><RefreshCw size={18} /> Reintentar</button>}<Link to="/home" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 font-black text-ink"><Home size={18} /> Volver al inicio</Link></div></section></main>;
}

function useSpatialNavigation() {
  const lastKeyRef = useRef(0);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const target = event.target as HTMLElement;
      if (target.closest('[data-spatial-ignore]') || ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO'].includes(target.tagName) || target.isContentEditable) return;
      if (Date.now() - lastKeyRef.current < 70) return;
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => isVisible(element));
      if (!candidates.length) return;
      const current = document.activeElement instanceof HTMLElement && candidates.includes(document.activeElement) ? document.activeElement : null;
      if (!current) { candidates[0].focus(); event.preventDefault(); return; }
      const next = nearestInDirection(current, candidates, event.key);
      if (next) { lastKeyRef.current = Date.now(); next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); event.preventDefault(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}

function nearestInDirection(current: HTMLElement, candidates: HTMLElement[], key: string) {
  const origin = current.getBoundingClientRect();
  const ox = origin.left + origin.width / 2;
  const oy = origin.top + origin.height / 2;
  return candidates.filter((item) => item !== current).map((item) => {
    const rect = item.getBoundingClientRect(); const x = rect.left + rect.width / 2; const y = rect.top + rect.height / 2;
    const dx = x - ox; const dy = y - oy;
    const valid = key === 'ArrowRight' ? dx > 4 : key === 'ArrowLeft' ? dx < -4 : key === 'ArrowDown' ? dy > 4 : dy < -4;
    const primary = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dx) : Math.abs(dy);
    const secondary = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
    return { item, score: valid ? primary + secondary * 2.5 : Number.POSITIVE_INFINITY };
  }).sort((a, b) => a.score - b.score)[0]?.item;
}

function isVisible(element: HTMLElement) { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; }
function routeLabel(path: string) { if (path.startsWith('/admin')) return 'Panel administrativo cargado'; if (path.startsWith('/watch')) return 'Reproductor cargado'; if (path === '/home') return 'Inicio cargado'; return `Pagina ${path.replace(/^\//, '').replace(/\//g, ', ') || 'inicio'} cargada`; }
