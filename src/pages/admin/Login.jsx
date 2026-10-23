/**
 * Tela de acesso ao painel.
 * O e-mail e a senha são conferidos pelo Supabase Auth, no servidor.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Leaf, Lock, Mail } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { DEMO, DEMO_ACCOUNT } from '../../lib/demo'

export default function Login({ notice = '' }) {
  const { signIn, configured } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState(notice)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return setError('Informe e-mail e senha.')
    setLoading(true)
    const err = await signIn(email, password)
    setLoading(false)
    if (err) setError(err)
  }

  const clearError = () => setError('')

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream-50 px-4">
      <div className="pointer-events-none absolute -top-40 -left-40 size-[500px] rounded-full bg-sage-100 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-40 -bottom-40 size-[500px] rounded-full bg-clay-100/70 blur-3xl" aria-hidden />

      <div className="relative w-full max-w-sm animate-pop">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900">
          <ArrowLeft size={16} /> Voltar ao site
        </Link>
        <form onSubmit={submit} className="card p-8" noValidate>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-sage-600 text-cream-50">
            <Leaf size={22} />
          </span>
          <h1 className="mt-6 text-2xl font-medium">Área da psicóloga</h1>
          <p className="mt-1 text-sm text-ink-500">Acesse sua agenda, prontuários e financeiro.</p>

          <label className="label mt-6" htmlFor="email">E-mail</label>
          <div className="relative">
            <Mail size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-400" />
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="input pl-10"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clearError()
              }}
              autoFocus
              aria-invalid={!!error}
            />
          </div>

          <label className="label mt-4" htmlFor="pw">Senha</label>
          <div className="relative">
            <Lock size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-400" />
            <input
              id="pw"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              className="input pr-11 pl-10"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                clearError()
              }}
              aria-invalid={!!error}
            />
            <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 hover:text-ink-900" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && <p className="mt-2 text-xs font-medium text-rose-700" role="alert">{error}</p>}
          {!configured && <p className="mt-2 text-xs font-medium text-rose-700" role="alert">O banco de dados não está configurado.</p>}
          <button className="btn-primary mt-5 w-full py-3" disabled={loading || !configured}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>

          {DEMO && (
            <div className="mt-5 rounded-xl border border-dashed border-sage-300 bg-sage-50 p-4">
              <p className="text-[11px] font-bold tracking-wider text-sage-700 uppercase">Acesso de demonstração</p>
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setEmail(DEMO_ACCOUNT.email)
                  setPassword(DEMO_ACCOUNT.password)
                  setLoading(true)
                  const err = await signIn(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
                  setLoading(false)
                  if (err) setError(err)
                }}
                className="mt-2 w-full rounded-lg bg-white px-3 py-2.5 text-left text-sm ring-1 ring-sage-200 transition hover:ring-sage-400"
              >
                <span className="font-semibold text-ink-900">Entrar como psicóloga</span>
                <span className="mt-0.5 block font-mono text-xs text-ink-500">{DEMO_ACCOUNT.email} · {DEMO_ACCOUNT.password}</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
