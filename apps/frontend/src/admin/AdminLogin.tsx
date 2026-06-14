import { Eye, EyeOff, Film, LoaderCircle, LockKeyhole, Mail, Play, Sparkles } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useSiteSettings } from '../lib/site-settings';

export function AdminLogin() {
  const { login, user, loading: sessionLoading } = useAuth();
  const settings = useSiteSettings();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@site.local');
  const [password, setPassword] = useState('Admin123456');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!sessionLoading && user) return <Navigate to="/home" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      navigate('/home', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo iniciar sesion.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#05070d] px-4 py-8 text-slate-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 top-[-8rem] h-[28rem] w-[28rem] rounded-full bg-brand/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-[-8rem] h-[30rem] w-[30rem] rounded-full bg-coral/20 blur-[130px]" />
        <div className="login-grid absolute inset-0 opacity-35" />
        <div className="absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-black/70 to-transparent" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden lg:block">
            <Link to="/" className="inline-flex items-center gap-3 text-xl font-black tracking-wide text-white">
              {settings.logo ? (
                <img src={settings.logo} alt={settings.siteName} className="h-12 w-12 rounded-2xl object-contain shadow-glow" />
              ) : (
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-ink shadow-glow">
                  <Film size={25} />
                </span>
              )}
              {settings.siteName}
            </Link>

            <div className="mt-16 max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-brand backdrop-blur">
                <Sparkles size={15} /> Tu universo de historias
              </span>
              <h2 className="mt-7 text-5xl font-black leading-[1.05] text-white xl:text-6xl">
                Series animadas y peliculas, en un solo lugar.
              </h2>
              <p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">
                Retoma tus historias favoritas y administra una experiencia de streaming hecha para descubrir algo nuevo.
              </p>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-3" aria-hidden="true">
              {['from-cyan-500/45 to-blue-950', 'from-fuchsia-500/40 to-purple-950', 'from-rose-500/40 to-orange-950'].map((gradient, index) => (
                <div key={gradient} className={`relative aspect-[3/4] overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} border border-white/10 shadow-2xl`}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,.25),transparent_32%)]" />
                  <div className="absolute bottom-4 left-4 grid h-9 w-9 place-items-center rounded-full bg-white/15 backdrop-blur">
                    {index === 0 ? <Play size={16} fill="currentColor" /> : index === 1 ? <Sparkles size={16} /> : <Film size={16} />}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto w-full max-w-md">
            <div className="mb-8 flex justify-center lg:hidden">
              <Link to="/" className="flex items-center gap-3 text-xl font-black text-white">
                {settings.logo ? (
                  <img src={settings.logo} alt={settings.siteName} className="h-11 w-11 rounded-xl object-contain" />
                ) : (
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-ink"><Film size={23} /></span>
                )}
                {settings.siteName}
              </Link>
            </div>

            <form
              onSubmit={submit}
              className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6 shadow-[0_30px_100px_rgba(0,0,0,.55)] backdrop-blur-2xl sm:p-9"
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-brand/30 bg-brand/10 text-brand">
                <LockKeyhole size={23} />
              </div>
              <h1 className="mt-6 text-3xl font-black text-white">Bienvenido de nuevo</h1>
              <p className="mt-2 leading-6 text-slate-400">Continua viendo tus series y peliculas favoritas</p>

              {error && (
                <div role="alert" className="mt-6 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <label className="mt-7 block text-sm font-bold text-slate-200">
                Email o usuario
                <span className="relative mt-2 block">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/[0.055] py-3.5 pl-11 pr-4 text-white outline-none transition placeholder:text-slate-600 focus:border-brand/70 focus:bg-white/[0.08] focus:ring-4 focus:ring-brand/10"
                    placeholder="admin@site.local"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </span>
              </label>

              <label className="mt-5 block text-sm font-bold text-slate-200">
                Contrasena
                <span className="relative mt-2 block">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/[0.055] py-3.5 pl-11 pr-12 text-white outline-none transition placeholder:text-slate-600 focus:border-brand/70 focus:bg-white/[0.08] focus:ring-4 focus:ring-brand/10"
                    placeholder="Minimo 8 caracteres"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white"
                    aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>

              <button
                disabled={submitting || sessionLoading}
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 font-black text-ink shadow-[0_16px_40px_rgba(34,211,238,.18)] transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-wait disabled:translate-y-0 disabled:opacity-60"
              >
                {submitting || sessionLoading ? (
                  <>
                    <LoaderCircle className="animate-spin" size={19} /> Iniciando sesion...
                  </>
                ) : (
                  'Iniciar sesion'
                )}
              </button>

              <p className="mt-7 text-center text-xs leading-5 text-slate-500">
                Acceso protegido para usuarios de {settings.siteName}.
              </p>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
