/**
 * Store da DEMONSTRAÇÃO: mesma interface do AppStore, sem Supabase.
 *
 * - Os dados ficam no localStorage do navegador de cada visitante e são
 *   sincronizados entre abas (agendar numa aba e ver o pedido chegar no painel na outra).
 * - Login com a conta de demonstração (lib/demo.js).
 * - A "criptografia" dos prontuários é simulada: bloquear e desbloquear funcionam
 *   com a senha da demo, mas os textos ficam guardados abertos no navegador.
 * - Visitantes não logados não recebem a lista de pacientes, como no banco real.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createSeedData, SAMPLE_NAMES, SAMPLE_REASONS } from '../data/demoSeed'
import { defaultSettings } from '../data/seed'
import { getAvailableSlots } from '../lib/availability'
import { addDays, todayISO, toISODate } from '../lib/date'
import { bookingCode, normalize, onlyDigits, uid } from '../lib/format'
import { DEMO_ACCOUNT, DEMO_VAULT } from '../lib/demo'
import { locallyCreatedAppointments, StoreContext } from './AppStore'

const KEY = 'psico-demo:v1'
const SESSION_KEY = 'psico-demo:sessao'
const VAULT_KEY = 'psico-demo:senha-prontuarios'
const DEMO_USER = { id: 'demo-psicologa', email: DEMO_ACCOUNT.email }

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return { ...data, settings: { ...defaultSettings, ...data.settings } }
    }
  } catch {
    /* sem armazenamento: segue só em memória */
  }
  return createSeedData()
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* cota cheia ou modo privado: a demo continua nesta aba */
  }
}

const read = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignora */
  }
}

const bookingError = (code, message) => Object.assign(new Error(message), { code })

export function DemoAppStoreProvider({ children }) {
  const [state, setState] = useState(load)
  const stateRef = useRef(state)
  stateRef.current = state
  const [session, setSession] = useState(() => (read(SESSION_KEY) ? { user: DEMO_USER } : null))
  const [vaultStatus, setVaultStatus] = useState(() => (read(SESSION_KEY) ? 'unlocked' : 'idle'))

  // Grava a cada mudança (valor igual não dispara evento nas outras abas)
  useEffect(() => save(state), [state])

  // Outra aba mudou os dados ou fez login/logout
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) setState(load())
      if (e.key === SESSION_KEY) {
        const logged = !!e.newValue
        setSession(logged ? { user: DEMO_USER } : null)
        setVaultStatus(logged ? 'unlocked' : 'idle')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const isAdmin = !!session
  const reload = useCallback(async () => setState(load()), [])

  /* ------------------------------ Pacientes ------------------------------ */
  const addPatient = useCallback((data) => {
    const patient = { id: uid('pat'), status: 'ativo', source: 'manual', generalNotes: '', createdAt: todayISO(), ...data }
    setState((s) => ({ ...s, patients: [...s.patients, patient] }))
    return patient
  }, [])

  const updatePatient = useCallback((id, patch) => {
    setState((s) => ({ ...s, patients: s.patients.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  }, [])

  const deletePatient = useCallback((id) => {
    setState((s) => ({ ...s, patients: s.patients.filter((p) => p.id !== id), appointments: s.appointments.filter((a) => a.patientId !== id) }))
  }, [])

  /* ------------------------------- Sessões ------------------------------- */
  const addAppointment = useCallback((data) => {
    const apt = { id: uid('apt'), code: bookingCode(), paid: false, paymentMethod: '', note: '', reason: '', createdAt: todayISO(), ...data }
    locallyCreatedAppointments.add(apt.id)
    setState((s) => ({ ...s, appointments: [...s.appointments, apt] }))
    return apt
  }, [])

  const updateAppointment = useCallback((id, patch) => {
    setState((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  }, [])

  const deleteAppointment = useCallback((id) => {
    setState((s) => ({ ...s, appointments: s.appointments.filter((a) => a.id !== id) }))
  }, [])

  /** Mesmas regras da função create_public_booking do banco */
  const bookFromSite = useCallback(({ service, date, time, modality, name, phone, email, reason }) => {
    const s = stateRef.current
    const srv = s.settings.services.find((x) => x.id === service.id)
    if (!srv) throw bookingError('servico_invalido', 'Este serviço não está mais disponível. Atualize a página.')
    const cleanName = (name || '').trim()
    const digits = onlyDigits(phone)
    if (cleanName.length < 2 || digits.length < 10) throw bookingError('dados_invalidos', 'Confira seus dados e tente novamente.')
    if (!getAvailableSlots(date, srv.duration, s).includes(time)) {
      throw bookingError('horario_indisponivel', 'Esse horário acabou de ser reservado ou não está mais disponível. Escolha outro, por favor.')
    }

    // Reaproveita o cadastro quando telefone e nome conferem
    let patient = s.patients.find((p) => onlyDigits(p.phone) === digits && normalize(p.name) === normalize(cleanName))
    const pending = patient ? s.appointments.filter((a) => a.patientId === patient.id && a.status === 'pendente').length : 0
    if (pending >= 2) throw bookingError('limite_agendamentos', 'Você já tem solicitações aguardando confirmação. Fale com a psicóloga pelo WhatsApp.')

    const newPatient = !patient
    if (newPatient) {
      patient = { id: uid('pat'), name: cleanName, phone, email: email || '', birthDate: '', reason: reason?.trim() || '', status: 'ativo', source: 'site', generalNotes: '', createdAt: todayISO() }
    }
    const apt = {
      id: uid('apt'), patientId: patient.id, serviceId: srv.id, serviceName: srv.name, date, time, duration: srv.duration, modality,
      status: 'pendente', price: srv.price, paid: false, paymentMethod: '', note: '', reason: reason?.trim() || '', code: bookingCode(), createdAt: todayISO(),
    }
    const next = { ...s, patients: newPatient ? [...s.patients, patient] : s.patients, appointments: [...s.appointments, apt] }
    stateRef.current = next
    setState(next)
    return { id: apt.id, code: apt.code, serviceId: srv.id, serviceName: srv.name, date, time, duration: srv.duration, modality, status: 'pendente', price: srv.price }
  }, [])

  const createPublicBooking = useCallback(async (data) => bookFromSite(data), [bookFromSite])

  /** Botão "Simular agendamento" da barra Demo: um pedido novo no próximo horário livre */
  const simulateBooking = useCallback(() => {
    const s = stateRef.current
    const service = s.settings.services.find((x) => x.id === 'srv_primeira') || s.settings.services[0]
    for (let i = 1; i <= 21; i++) {
      const date = toISODate(addDays(new Date(), i))
      const slots = getAvailableSlots(date, service.duration, s)
      if (!slots.length) continue
      const name = SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)]
      const r = bookFromSite({
        service, date, time: slots[Math.floor(Math.random() * Math.min(3, slots.length))], modality: Math.random() < 0.4 ? 'online' : 'presencial',
        name, phone: `(83) 9${Math.floor(8000 + Math.random() * 1999)}-${Math.floor(1000 + Math.random() * 8999)}`, email: '',
        reason: SAMPLE_REASONS[Math.floor(Math.random() * SAMPLE_REASONS.length)],
      })
      return { ...r, name }
    }
    throw new Error('Não há horários livres nas próximas semanas.')
  }, [bookFromSite])

  /* ------------------------------ Bloqueios ------------------------------ */
  const addBlock = useCallback((data) => setState((s) => ({ ...s, blocks: [...s.blocks, { id: uid('blk'), ...data }] })), [])
  const removeBlock = useCallback((id) => setState((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== id) })), [])

  /* ---------------------------- Configurações ---------------------------- */
  const updateSettings = useCallback((patch) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  }, [])

  /* -------------------------------- Login -------------------------------- */
  const signIn = useCallback(async (email, password) => {
    if (email.trim().toLowerCase() !== DEMO_ACCOUNT.email || password !== DEMO_ACCOUNT.password) return 'E-mail ou senha incorretos.'
    write(SESSION_KEY, '1')
    setSession({ user: DEMO_USER })
    setVaultStatus('unlocked')
    return null
  }, [])

  const signOut = useCallback(async () => {
    write(SESSION_KEY, null)
    setSession(null)
    setVaultStatus('idle')
  }, [])

  /* -------------------- Senha de criptografia (simulada) ------------------- */
  const passphrase = () => read(VAULT_KEY) || DEMO_VAULT.passphrase
  const wrong = () => Object.assign(new Error('Senha incorreta'), { code: 'senha_incorreta' })

  const unlockVault = useCallback(async (pass) => {
    if (pass !== passphrase()) throw wrong()
    setVaultStatus('unlocked')
  }, [])

  const recoverVault = useCallback(async (recoveryKey, newPass) => {
    if (recoveryKey.trim().toUpperCase() !== DEMO_VAULT.recoveryKey) throw wrong()
    write(VAULT_KEY, newPass)
    setVaultStatus('unlocked')
  }, [])

  const changeVaultPassphrase = useCallback(async (current, next) => {
    if (current !== passphrase()) throw wrong()
    write(VAULT_KEY, next)
  }, [])

  const lockVault = useCallback(() => setVaultStatus('locked'), [])
  const noop = useCallback(async () => {}, [])

  /** Exporta um backup JSON dos dados */
  const exportData = useCallback(() => {
    const blob = new Blob([JSON.stringify(stateRef.current, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `backup-agenda-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [])

  /** Volta aos dados de exemplo (barra Demo) */
  const resetDemo = useCallback(() => {
    write(VAULT_KEY, null)
    const fresh = createSeedData()
    stateRef.current = fresh
    setState(fresh)
  }, [])

  const value = useMemo(() => {
    const patients = isAdmin ? state.patients : []
    return {
      ...state,
      patients,
      patientsById: Object.fromEntries(patients.map((p) => [p.id, p])),
      configured: true,
      session,
      isAdmin,
      authLoading: false,
      loadFailed: false,
      reload,
      signIn,
      signOut,
      addPatient,
      updatePatient,
      deletePatient,
      addAppointment,
      updateAppointment,
      deleteAppointment,
      createPublicBooking,
      addBlock,
      removeBlock,
      updateSettings,
      exportData,
      vaultStatus,
      recoveryToShow: '',
      setupEncryption: noop,
      finishSetup: noop,
      unlockVault,
      recoverVault,
      changeVaultPassphrase,
      lockVault,
      // Só existem na demonstração
      demo: true,
      simulateBooking,
      resetDemo,
    }
  }, [state, session, isAdmin, vaultStatus, reload, signIn, signOut, addPatient, updatePatient, deletePatient, addAppointment, updateAppointment, deleteAppointment, createPublicBooking, addBlock, removeBlock, updateSettings, exportData, noop, unlockVault, recoverVault, changeVaultPassphrase, lockVault, simulateBooking, resetDemo])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
