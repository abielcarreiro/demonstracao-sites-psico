/**
 * Store global da aplicação, sincronizado com o Supabase.
 *
 * - Visitantes: carrega as configurações e os horários ocupados (sem dados de pacientes).
 * - Psicóloga logada (tabela "admins"): carrega pacientes, sessões e bloqueios completos.
 * - As alterações do painel aparecem na hora (otimistas) e são gravadas no banco em fila,
 *   na ordem em que foram feitas. Se uma gravação falhar, avisa e recarrega do banco.
 * - Os dados do painel são recarregados ao voltar para a aba e a cada minuto,
 *   para que agendamentos feitos pelo site apareçam sem precisar atualizar a página.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createInitialData, defaultSettings } from '../data/seed'
import { useToast } from '../components/ui'
import { bookingCode, uid } from '../lib/format'
import { todayISO } from '../lib/date'
import {
  appointmentFromRow, appointmentToRow, blockFromRow, blockToRow, fetchAll, patientFromRow, patientToRow, supabase,
} from '../lib/supabase'

const StoreContext = createContext(null)

/** Sessões criadas neste painel (não geram aviso de "nova solicitação") */
export const locallyCreatedAppointments = new Set()

// Versões antigas guardavam tudo no navegador; esses dados não são mais usados
try {
  localStorage.removeItem('psico-agenda:v2')
} catch {
  /* ignora */
}

const BOOKING_ERRORS = {
  horario_indisponivel: 'Esse horário acabou de ser reservado ou não está mais disponível. Escolha outro, por favor.',
  limite_agendamentos: 'Você já tem solicitações aguardando confirmação. Fale com a psicóloga pelo WhatsApp.',
  dados_invalidos: 'Confira seus dados e tente novamente.',
  servico_invalido: 'Este serviço não está mais disponível. Atualize a página.',
}

export function AppStoreProvider({ children }) {
  const toast = useToast()
  const [state, setState] = useState(createInitialData)
  const stateRef = useRef(state)
  stateRef.current = state

  /* -------------------------------- Login -------------------------------- */
  const [session, setSession] = useState(null)
  const [sessionKnown, setSessionKnown] = useState(!supabase)
  // Para qual usuário os dados atuais foram carregados (undefined = ainda não carregou)
  const [loaded, setLoaded] = useState({ user: supabase ? undefined : null, isAdmin: false, failed: false })
  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setSessionKnown(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  /* ---------------------------- Carregamento ----------------------------- */
  const writeQueue = useRef(Promise.resolve())
  const pendingWrites = useRef(0)
  const writeVersion = useRef(0)
  const loadRequest = useRef(0)

  const reload = useCallback(async () => {
    if (!supabase) return
    const request = ++loadRequest.current
    const version = writeVersion.current
    try {
      const [settingsRes, adminRes] = await Promise.all([
        supabase.from('settings').select('data').eq('id', 1).maybeSingle(),
        userId ? supabase.rpc('is_admin') : Promise.resolve({ data: false }),
      ])
      if (settingsRes.error) throw settingsRes.error
      if (adminRes.error) throw adminRes.error
      const settings = { ...defaultSettings, ...settingsRes.data?.data }
      const isAdmin = adminRes.data === true

      let next
      if (isAdmin) {
        const [patients, appointments, blocks] = await Promise.all([fetchAll('patients'), fetchAll('appointments'), fetchAll('blocks')])
        next = {
          settings,
          patients: patients.map(patientFromRow),
          appointments: appointments.map(appointmentFromRow),
          blocks: blocks.map(blockFromRow),
        }
      } else {
        const { data, error } = await supabase.rpc('public_availability')
        if (error) throw error
        next = {
          settings,
          patients: [],
          // Só o necessário para calcular horários livres
          appointments: (data?.appointments ?? []).map((a, i) => ({ id: `busy_${i}`, status: 'confirmada', ...a })),
          blocks: (data?.blocks ?? []).map((b, i) => ({ id: `busy_blk_${i}`, reason: '', ...b })),
        }
      }

      // Descarta respostas antigas ou que chegaram enquanto havia alterações sendo gravadas
      if (request !== loadRequest.current) return
      if (pendingWrites.current > 0 || version !== writeVersion.current) return
      setState(next)
      setLoaded({ user: userId, isAdmin, failed: false })
    } catch (err) {
      console.error(err)
      if (request !== loadRequest.current) return
      setLoaded((l) => ({ user: userId, isAdmin: l.user === userId && l.isAdmin, failed: true }))
      toast('Não foi possível carregar os dados. Verifique sua conexão.', 'error')
    }
  }, [userId, toast])

  // Ao entrar/sair: limpa dados clínicos da tela imediatamente e recarrega
  useEffect(() => {
    if (!sessionKnown) return
    if (!userId) setState((s) => ({ ...s, patients: [], appointments: [], blocks: [] }))
    reload()
  }, [sessionKnown, userId, reload])

  const isAdmin = loaded.user === userId && loaded.isAdmin

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    const timer = isAdmin ? setInterval(reload, 60_000) : null
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [reload, isAdmin])

  /** Grava no banco em fila (preserva a ordem, ex.: paciente antes da sessão dele) */
  const persist = useCallback(
    (run) => {
      if (!supabase) return
      pendingWrites.current++
      writeVersion.current++
      writeQueue.current = writeQueue.current.then(async () => {
        try {
          const { error } = await run()
          if (error) throw error
        } catch (err) {
          console.error(err)
          toast('Não foi possível salvar a alteração. Os dados foram recarregados.', 'error')
          writeVersion.current++
          pendingWrites.current--
          reload()
          return
        }
        pendingWrites.current--
      })
    },
    [toast, reload],
  )

  /* ------------------------------ Pacientes ------------------------------ */
  const addPatient = useCallback(
    (data) => {
      const patient = { id: uid('pat'), status: 'ativo', source: 'manual', generalNotes: '', createdAt: todayISO(), ...data }
      setState((s) => ({ ...s, patients: [...s.patients, patient] }))
      persist(() => supabase.from('patients').insert(patientToRow(patient)))
      return patient
    },
    [persist],
  )

  const updatePatient = useCallback(
    (id, patch) => {
      setState((s) => ({ ...s, patients: s.patients.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
      persist(() => supabase.from('patients').update(patientToRow(patch)).eq('id', id))
    },
    [persist],
  )

  const deletePatient = useCallback(
    (id) => {
      setState((s) => ({
        ...s,
        patients: s.patients.filter((p) => p.id !== id),
        appointments: s.appointments.filter((a) => a.patientId !== id),
      }))
      // As sessões do paciente são apagadas em cascata pelo banco
      persist(() => supabase.from('patients').delete().eq('id', id))
    },
    [persist],
  )

  /* ------------------------------- Sessões ------------------------------- */
  const addAppointment = useCallback(
    (data) => {
      const apt = { id: uid('apt'), code: bookingCode(), paid: false, paymentMethod: '', note: '', reason: '', createdAt: todayISO(), ...data }
      locallyCreatedAppointments.add(apt.id)
      setState((s) => ({ ...s, appointments: [...s.appointments, apt] }))
      persist(() => supabase.from('appointments').insert(appointmentToRow(apt)))
      return apt
    },
    [persist],
  )

  const updateAppointment = useCallback(
    (id, patch) => {
      setState((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
      persist(() => supabase.from('appointments').update(appointmentToRow(patch)).eq('id', id))
    },
    [persist],
  )

  const deleteAppointment = useCallback(
    (id) => {
      setState((s) => ({ ...s, appointments: s.appointments.filter((a) => a.id !== id) }))
      persist(() => supabase.from('appointments').delete().eq('id', id))
    },
    [persist],
  )

  /**
   * Agendamento feito pelo paciente na página pública.
   * Tudo é validado no servidor (função create_public_booking), que também
   * reaproveita o cadastro quando já existe paciente com o mesmo telefone e o mesmo nome.
   * Lança um erro com mensagem amigável e `code` quando não for possível agendar.
   */
  const createPublicBooking = useCallback(
    async ({ service, date, time, modality, name, phone, email, reason }) => {
      if (!supabase) throw Object.assign(new Error('Agendamento indisponível no momento. Tente pelo WhatsApp.'), { code: 'offline' })
      const { data, error } = await supabase.rpc('create_public_booking', {
        p_service_id: service.id,
        p_date: date,
        p_time: time,
        p_modality: modality,
        p_name: name,
        p_phone: phone,
        p_email: email,
        p_reason: reason,
      })
      if (error) {
        const code = Object.keys(BOOKING_ERRORS).find((k) => error.message?.includes(k))
        if (code === 'horario_indisponivel') reload()
        throw Object.assign(new Error(BOOKING_ERRORS[code] || 'Não foi possível concluir o agendamento. Tente novamente.'), { code })
      }
      reload()
      return { id: data.id, code: data.code, serviceId: service.id, serviceName: data.serviceName, date, time, duration: data.duration, modality, status: 'pendente', price: data.price }
    },
    [reload],
  )

  /* ------------------------------ Bloqueios ------------------------------ */
  const addBlock = useCallback(
    (data) => {
      const block = { id: uid('blk'), ...data }
      setState((s) => ({ ...s, blocks: [...s.blocks, block] }))
      persist(() => supabase.from('blocks').insert(blockToRow(block)))
    },
    [persist],
  )

  const removeBlock = useCallback(
    (id) => {
      setState((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== id) }))
      persist(() => supabase.from('blocks').delete().eq('id', id))
    },
    [persist],
  )

  /* ---------------------------- Configurações ---------------------------- */
  const updateSettings = useCallback(
    (patch) => {
      const settings = { ...stateRef.current.settings, ...patch }
      stateRef.current = { ...stateRef.current, settings }
      setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
      persist(() => supabase.from('settings').update({ data: settings, updated_at: new Date().toISOString() }).eq('id', 1))
    },
    [persist],
  )

  /* -------------------------------- Login -------------------------------- */
  /** Retorna uma mensagem de erro, ou null se entrou */
  const signIn = useCallback(async (email, password) => {
    if (!supabase) return 'O banco de dados não está configurado.'
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (!error) return null
    console.error(error)
    const msg = error.message || ''
    if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
    if (msg.includes('Email not confirmed')) return 'E-mail ainda não confirmado. Confirme o usuário no painel do Supabase.'
    if (error.status === 429 || msg.toLowerCase().includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
    if (msg.includes('Failed to fetch') || error.name === 'AuthRetryableFetchError') return 'Sem conexão com o servidor. Verifique sua internet.'
    return `Não foi possível entrar (${msg || 'erro desconhecido'}).`
  }, [])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  /** Exporta um backup JSON dos dados */
  const exportData = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `backup-agenda-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [state])

  const value = useMemo(
    () => ({
      ...state,
      patientsById: Object.fromEntries(state.patients.map((p) => [p.id, p])),
      configured: !!supabase,
      session,
      isAdmin,
      authLoading: !sessionKnown || loaded.user !== userId,
      loadFailed: loaded.failed,
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
    }),
    [state, session, isAdmin, sessionKnown, loaded.user, loaded.failed, userId, reload, signIn, signOut, addPatient, updatePatient, deletePatient, addAppointment, updateAppointment, deleteAppointment, createPublicBooking, addBlock, removeBlock, updateSettings, exportData],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore deve ser usado dentro de <AppStoreProvider>')
  return ctx
}
