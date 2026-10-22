/**
 * Estrutura do painel administrativo: login (Supabase Auth) + navegação lateral.
 */
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, BellRing, CalendarDays, ExternalLink, LayoutDashboard, Leaf, LogOut, Menu, Settings, Users, Wallet, X } from 'lucide-react'
import { locallyCreatedAppointments, useStore } from '../../context/AppStore'
import { Avatar, useToast } from '../../components/ui'
import { formatLongDate } from '../../lib/date'
import Login from './Login'

const NAV = [
  { to: '/admin', end: true, icon: LayoutDashboard, label: 'Visão geral' },
  { to: '/admin/agenda', icon: CalendarDays, label: 'Agenda' },
  { to: '/admin/pacientes', icon: Users, label: 'Pacientes' },
  { to: '/admin/financeiro', icon: Wallet, label: 'Financeiro' },
  { to: '/admin/configuracoes', icon: Settings, label: 'Configurações' },
]

export default function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [denied, setDenied] = useState(false)
  const { settings, appointments, session, isAdmin, authLoading, loadFailed, reload, signOut } = useStore()
  const location = useLocation()
  const pendingCount = appointments.filter((a) => a.status === 'pendente').length
  const avisos = useNewBookingAlerts()

  // Conta sem permissão de acesso ao painel: sai e avisa
  useEffect(() => {
    if (session && !authLoading && !loadFailed && !isAdmin) {
      setDenied(true)
      signOut()
    }
  }, [session, authLoading, loadFailed, isAdmin, signOut])

  const logout = () => {
    setDenied(false)
    signOut()
  }

  if (session && loadFailed && !isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream-50 px-4 text-center" role="alert">
        <p className="text-ink-700">Não foi possível carregar o painel. Verifique sua conexão.</p>
        <div className="flex gap-3">
          <button className="btn-primary" onClick={reload}>Tentar de novo</button>
          <button className="btn-ghost" onClick={logout}>Sair</button>
        </div>
      </div>
    )
  }
  if (authLoading || (session && !isAdmin)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-50 text-sm text-ink-500" role="status">
        Carregando…
      </div>
    )
  }
  if (!session) return <Login notice={denied ? 'Esta conta não tem acesso ao painel.' : ''} />

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Painel">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              isActive ? 'bg-white text-sage-800 shadow-soft' : 'text-sage-100 hover:bg-white/10 hover:text-white'
            }`
          }
        >
          <n.icon size={18} />
          {n.label}
          {n.to === '/admin' && pendingCount > 0 && (
            <span className="ml-auto rounded-full bg-clay-500 px-2 py-0.5 text-xs text-white" aria-label={`${pendingCount} solicitações pendentes`}>
              {pendingCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )

  const sidebar = (
    <div className="flex h-full flex-col bg-sage-800 p-4">
      <div className="mb-8 flex items-center gap-2.5 px-2 pt-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-sage-600 text-cream-50 ring-1 ring-white/10">
          <Leaf size={18} />
        </span>
        <span className="leading-tight text-white">
          <span className="block font-display text-lg">Consultório</span>
          <span className="block text-[11px] font-medium uppercase tracking-widest text-sage-300">Painel clínico</span>
        </span>
      </div>
      {nav}
      <div className="mt-auto space-y-1 border-t border-white/10 pt-4">
        {avisos.supported && (
          <button
            onClick={avisos.enable}
            aria-pressed={avisos.enabled}
            title={avisos.enabled ? 'Você recebe uma notificação quando chega uma solicitação pelo site, mesmo com o painel em outra aba.' : 'Receber notificação quando chegar solicitação pelo site'}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-sage-100 hover:bg-white/10"
          >
            {avisos.enabled ? <BellRing size={18} /> : <Bell size={18} />} {avisos.enabled ? 'Avisos ativos' : 'Ativar avisos'}
          </button>
        )}
        <a href="#/" target="_blank" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-sage-100 hover:bg-white/10">
          <ExternalLink size={18} /> Ver página pública
        </a>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-sage-100 hover:bg-white/10">
          <LogOut size={18} /> Sair
        </button>
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <Avatar name={settings.psychologist.name.replace('Dra. ', '')} size="sm" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-white">{settings.psychologist.name}</p>
            <p className="truncate text-xs text-sage-300">{settings.psychologist.crp}</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-cream-50 lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>

      {/* Topo mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sage-100 bg-cream-50/90 px-4 backdrop-blur lg:hidden">
        <span className="flex items-center gap-2 font-display text-lg"><Leaf size={18} className="text-sage-600" /> Consultório</span>
        <button onClick={() => setMenuOpen(true)} className="rounded-lg p-2" aria-label="Abrir menu">
          <Menu size={22} />
        </button>
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-sage-900/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-in">
            {sidebar}
            <button onClick={() => setMenuOpen(false)} className="absolute top-5 right-4 rounded-lg p-1.5 text-white hover:bg-white/10" aria-label="Fechar menu">
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      <main key={location.pathname} className="min-w-0 animate-fade-up px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

/**
 * Avisa quando chega uma solicitação nova pelo site (o painel recarrega a cada minuto):
 * aviso na tela, som, contador no título da aba e notificação do navegador, se ativada.
 */
function useNewBookingAlerts() {
  const { appointments, patientsById, isAdmin } = useStore()
  const toast = useToast()
  const known = useRef(null)
  const audio = useRef(null)
  const unread = useRef(0)
  const baseTitle = useRef(document.title)
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [enabled, setEnabled] = useState(supported && Notification.permission === 'granted')

  // O navegador só libera som depois de um clique na página
  useEffect(() => {
    const unlock = () => {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!audio.current && Ctx) audio.current = new Ctx()
    }
    document.addEventListener('click', unlock, { once: true })
    const onVisible = () => {
      if (!document.hidden && unread.current) {
        unread.current = 0
        document.title = baseTitle.current
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      known.current = null
      return
    }
    const ids = new Set(appointments.map((a) => a.id))
    // Primeira carga: só memoriza o que já existe
    if (known.current === null) {
      known.current = ids
      return
    }
    const fresh = appointments.filter((a) => !known.current.has(a.id) && a.status === 'pendente' && !locallyCreatedAppointments.has(a.id))
    known.current = ids
    if (!fresh.length) return

    const last = fresh[fresh.length - 1]
    const name = patientsById[last.patientId]?.name || 'Paciente'
    const text = `${fresh.length > 1 ? `${fresh.length} novas solicitações. Última: ` : 'Nova solicitação: '}${name}, ${formatLongDate(last.date)} às ${last.time}`
    toast(text)
    beep(audio.current)
    if (document.hidden) {
      unread.current += fresh.length
      document.title = `(${unread.current}) ${baseTitle.current}`
      if (supported && Notification.permission === 'granted') {
        try {
          new Notification('Nova solicitação de agendamento', { body: text, tag: 'nova-solicitacao' })
        } catch {
          /* ignora */
        }
      }
    }
  }, [appointments, patientsById, isAdmin, toast, supported])

  const enable = async () => {
    if (!supported) return
    if (Notification.permission === 'denied') {
      toast('As notificações estão bloqueadas. Libere nas configurações do navegador (cadeado ao lado do endereço).', 'error')
      return
    }
    const result = await Notification.requestPermission()
    setEnabled(result === 'granted')
    if (result === 'granted') toast('Pronto! Você será avisada quando chegar uma solicitação pelo site.')
  }

  return { supported, enabled, enable }
}

/** Dois bipes curtos */
function beep(ctx) {
  if (!ctx) return
  try {
    ;[0, 0.18].forEach((t) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 880
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.15)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.16)
    })
  } catch {
    /* sem som */
  }
}
