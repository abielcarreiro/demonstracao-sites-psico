/**
 * Store global da aplicação, sincronizado com o Supabase.
 *
 * - Visitantes: carrega as configurações e os horários ocupados (sem dados de pacientes).
 * - Psicóloga logada (tabela "admins"): carrega pacientes, sessões e bloqueios completos.
 * - As alterações do painel aparecem na hora (otimistas) e são gravadas no banco em fila,
 *   na ordem em que foram feitas. Se uma gravação falhar, avisa e recarrega do banco.
 * - Os dados do painel são recarregados ao voltar para a aba e a cada minuto,
 *   para que agendamentos feitos pelo site apareçam sem precisar atualizar a página.
 * - Os textos clínicos (motivo, observações, anotações) são gravados criptografados
 *   (ver lib/crypto.js) e só são abertos aqui, depois que a psicóloga digita a senha
 *   de criptografia. Textos antigos sem criptografia são convertidos automaticamente.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createInitialData, defaultSettings } from '../data/seed'
import { useToast } from '../components/ui'
import { bookingCode, uid } from '../lib/format'
import { todayISO } from '../lib/date'
import {
  appointmentFromRow, appointmentToRow, blockFromRow, blockToRow, fetchAll, patientFromRow, patientToRow, supabase,
} from '../lib/supabase'
import * as vaultCrypto from '../lib/crypto'

const StoreContext = createContext(null)

/** Colunas guardadas criptografadas no banco */
const SEALED = { patients: ['reason', 'general_notes'], appointments: ['reason', 'note'] }

/** Abre os campos criptografados de uma linha; sem a chave, eles ficam vazios */
async function openRow(table, row, unlocked) {
  const out = { ...row }
  for (const col of SEALED[table]) {
    if (!vaultCrypto.isEncrypted(out[col])) continue
    try {
      out[col] = unlocked ? await vaultCrypto.decryptText(out[col]) : ''
    } catch (err) {
      console.error(err)
      out[col] = ''
    }
  }
  return out
}

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

  /* ---------------------------- Criptografia ----------------------------- */
  // status: idle (visitante) | missing (tabela não criada) | setup | locked | unlocked
  const [vault, setVault] = useState({ status: 'idle' })
  const [recoveryToShow, setRecoveryToShow] = useState('')
  const keyRow = useRef(null)
  const afterLoad = useRef(null)

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
      let raw = null
      let vaultStatus = 'idle'
      if (isAdmin) {
        const [patients, appointments, blocks, keyRes] = await Promise.all([
          fetchAll('patients'),
          fetchAll('appointments'),
          fetchAll('blocks'),
          supabase.from('crypto_keys').select('*').eq('id', 1).maybeSingle(),
        ])
        if (keyRes.error) console.error(keyRes.error)
        keyRow.current = keyRes.error ? null : keyRes.data
        vaultStatus = keyRes.error ? 'missing' : !keyRes.data ? 'setup' : vaultCrypto.isUnlocked() ? 'unlocked' : 'locked'
        const unlocked = vaultStatus === 'unlocked'
        next = {
          settings,
          patients: (await Promise.all(patients.map((r) => openRow('patients', r, unlocked)))).map(patientFromRow),
          appointments: (await Promise.all(appointments.map((r) => openRow('appointments', r, unlocked)))).map(appointmentFromRow),
          blocks: blocks.map(blockFromRow),
        }
        if (unlocked) raw = { patients, appointments }
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
      setVault({ status: vaultStatus })
      setLoaded({ user: userId, isAdmin, failed: false })
      if (raw) afterLoad.current?.(raw)
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

  /** Criptografa os campos clínicos antes de gravar (basta a chave pública) */
  const sealRow = useCallback(async (table, row) => {
    const key = keyRow.current?.public_jwk
    if (!key) return row
    const out = { ...row }
    for (const col of SEALED[table]) {
      if (typeof out[col] === 'string' && out[col] && !vaultCrypto.isEncrypted(out[col])) out[col] = await vaultCrypto.encryptText(out[col], key)
    }
    return out
  }, [])

  // Converte textos antigos, gravados antes da criptografia, assim que os prontuários são abertos
  const migrating = useRef(false)
  afterLoad.current = (raw) => {
    if (migrating.current || !keyRow.current) return
    const todo = []
    for (const table of ['patients', 'appointments']) {
      for (const row of raw[table]) {
        const plain = SEALED[table].filter((c) => typeof row[c] === 'string' && row[c] && !vaultCrypto.isEncrypted(row[c]))
        if (plain.length) todo.push([table, row.id, Object.fromEntries(plain.map((c) => [c, row[c]]))])
      }
    }
    if (!todo.length) return
    migrating.current = true
    for (const [table, id, patch] of todo) persist(async () => supabase.from(table).update(await sealRow(table, patch)).eq('id', id))
    persist(async () => {
      migrating.current = false
      return {}
    })
  }

  /* ------------------------------ Pacientes ------------------------------ */
  const addPatient = useCallback(
    (data) => {
      const patient = { id: uid('pat'), status: 'ativo', source: 'manual', generalNotes: '', createdAt: todayISO(), ...data }
      setState((s) => ({ ...s, patients: [...s.patients, patient] }))
      persist(async () => supabase.from('patients').insert(await sealRow('patients', patientToRow(patient))))
      return patient
    },
    [persist, sealRow],
  )

  const updatePatient = useCallback(
    (id, patch) => {
      setState((s) => ({ ...s, patients: s.patients.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
      persist(async () => supabase.from('patients').update(await sealRow('patients', patientToRow(patch))).eq('id', id))
    },
    [persist, sealRow],
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
      persist(async () => supabase.from('appointments').insert(await sealRow('appointments', appointmentToRow(apt))))
      return apt
    },
    [persist, sealRow],
  )

  const updateAppointment = useCallback(
    (id, patch) => {
      setState((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
      persist(async () => supabase.from('appointments').update(await sealRow('appointments', appointmentToRow(patch))).eq('id', id))
    },
    [persist, sealRow],
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
      // O motivo sai daqui já criptografado: só a psicóloga consegue ler
      const publicKey = stateRef.current.settings.encryptionPublicKey
      let sealedReason = reason?.trim() || ''
      if (sealedReason && publicKey && vaultCrypto.cryptoSupported()) {
        try {
          sealedReason = await vaultCrypto.encryptText(sealedReason, publicKey)
        } catch (err) {
          // Sem criptografia aqui, o texto é convertido quando a psicóloga abrir o painel
          console.error(err)
        }
      }
      const { data, error } = await supabase.rpc('create_public_booking', {
        p_service_id: service.id,
        p_date: date,
        p_time: time,
        p_modality: modality,
        p_name: name,
        p_phone: phone,
        p_email: email,
        p_reason: sealedReason,
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
    vaultCrypto.lock()
    await supabase?.auth.signOut()
  }, [])

  /* ----------------------- Senha de criptografia ------------------------- */
  /** Primeira vez: cria as chaves e devolve a chave de recuperação (mostrada uma vez) */
  const setupEncryption = useCallback(
    async (passphrase) => {
      const k = await vaultCrypto.createKeys(passphrase)
      const row = { id: 1, public_jwk: k.publicJwk, wrapped_password: k.wrappedPassword, wrapped_recovery: k.wrappedRecovery }
      const { error } = await supabase.from('crypto_keys').insert(row)
      if (error) {
        vaultCrypto.lock()
        throw error
      }
      keyRow.current = row
      setRecoveryToShow(k.recoveryKey)
      updateSettings({ encryptionPublicKey: k.publicJwk })
      return k.recoveryKey
    },
    [updateSettings],
  )

  const finishSetup = useCallback(() => {
    setRecoveryToShow('')
    reload()
  }, [reload])

  /** Lança erro com code "senha_incorreta" quando a senha não confere */
  const unlockVault = useCallback(
    async (passphrase) => {
      await vaultCrypto.unlockWithPassphrase(keyRow.current, passphrase)
      await reload()
    },
    [reload],
  )

  /** Esqueceu a senha: abre com a chave de recuperação e define uma senha nova */
  const recoverVault = useCallback(
    async (recoveryKey, newPassphrase) => {
      const wrapped = await vaultCrypto.unlockWithRecovery(keyRow.current, recoveryKey, newPassphrase)
      const { error } = await supabase.from('crypto_keys').update({ wrapped_password: wrapped, updated_at: new Date().toISOString() }).eq('id', 1)
      if (error) throw error
      keyRow.current = { ...keyRow.current, wrapped_password: wrapped }
      await reload()
    },
    [reload],
  )

  const changeVaultPassphrase = useCallback(async (current, next) => {
    const wrapped = await vaultCrypto.rewrapWithNewPassphrase(keyRow.current, current, next)
    const { error } = await supabase.from('crypto_keys').update({ wrapped_password: wrapped, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) throw error
    keyRow.current = { ...keyRow.current, wrapped_password: wrapped }
  }, [])

  const lockVault = useCallback(() => {
    vaultCrypto.lock()
    setVault({ status: 'locked' })
    reload()
  }, [reload])

  // Garante que a página pública use a chave certa para criptografar o motivo
  const publicKeyX = state.settings.encryptionPublicKey?.x
  useEffect(() => {
    const key = keyRow.current?.public_jwk
    if (vault.status === 'unlocked' && key && publicKeyX !== key.x) updateSettings({ encryptionPublicKey: key })
  }, [vault.status, publicKeyX, updateSettings])

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
      vaultStatus: vault.status,
      recoveryToShow,
      setupEncryption,
      finishSetup,
      unlockVault,
      recoverVault,
      changeVaultPassphrase,
      lockVault,
    }),
    [state, session, isAdmin, sessionKnown, loaded.user, loaded.failed, userId, reload, signIn, signOut, addPatient, updatePatient, deletePatient, addAppointment, updateAppointment, deleteAppointment, createPublicBooking, addBlock, removeBlock, updateSettings, exportData, vault.status, recoveryToShow, setupEncryption, finishSetup, unlockVault, recoverVault, changeVaultPassphrase, lockVault],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore deve ser usado dentro de <AppStoreProvider>')
  return ctx
}
