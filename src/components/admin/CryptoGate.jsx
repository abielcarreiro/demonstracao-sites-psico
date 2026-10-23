/**
 * Telas da criptografia dos prontuários, mostradas antes do painel:
 * - primeira vez: criar a senha de criptografia e guardar a chave de recuperação;
 * - a cada acesso: digitar a senha para abrir os prontuários;
 * - esqueceu a senha: usar a chave de recuperação e definir uma nova.
 */
import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { useStore } from '../../context/AppStore'

const MIN_LENGTH = 10

function Shell({ children }) {
  const { signOut } = useStore()
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream-50 px-4 py-10">
      <div className="pointer-events-none absolute -top-40 -left-40 size-[500px] rounded-full bg-sage-100 blur-3xl" aria-hidden />
      <div className="relative w-full max-w-md animate-pop">
        <div className="card p-8">{children}</div>
        <button onClick={signOut} className="mx-auto mt-4 flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900">
          <LogOut size={15} /> Sair
        </button>
      </div>
    </div>
  )
}

function Header({ icon: Icon = ShieldCheck, title, children }) {
  return (
    <>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-sage-600 text-cream-50">
        <Icon size={22} />
      </span>
      <h1 className="mt-6 text-2xl font-medium">{title}</h1>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-500">{children}</div>
    </>
  )
}

function SecretInput({ id, label, value, onChange, autoFocus, autoComplete = 'off' }) {
  const [show, setShow] = useState(false)
  return (
    <>
      <label className="label mt-4" htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} className="input pr-11" value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} autoComplete={autoComplete} />
        <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 hover:text-ink-900" aria-label={show ? 'Ocultar' : 'Mostrar'}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </>
  )
}

/** Valida senha nova + confirmação; devolve a mensagem de erro ou '' */
export function checkNewPassphrase(pass, confirm) {
  if (pass.length < MIN_LENGTH) return `Use pelo menos ${MIN_LENGTH} caracteres. Uma frase curta fácil de lembrar funciona bem.`
  if (pass !== confirm) return 'As duas senhas não são iguais.'
  return ''
}

function Setup() {
  const { setupEncryption } = useStore()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const msg = checkNewPassphrase(pass, confirm)
    if (msg) return setError(msg)
    setBusy(true)
    try {
      await setupEncryption(pass)
    } catch (err) {
      console.error(err)
      setError('Não foi possível criar a proteção. Atualize a página e tente de novo.')
      setBusy(false)
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} noValidate>
        <Header title="Proteja os prontuários">
          <p>Crie uma <strong>senha de criptografia</strong>. Motivos, observações e anotações das sessões passam a ser guardados embaralhados e só abrem com ela, no seu navegador.</p>
          <p>Ela é diferente da senha de login. Nem o Supabase nem quem mantém o site conseguem ler esses textos.</p>
        </Header>
        <SecretInput id="vk-new" label="Senha de criptografia" value={pass} onChange={(v) => { setPass(v); setError('') }} autoFocus autoComplete="new-password" />
        <SecretInput id="vk-confirm" label="Repita a senha" value={confirm} onChange={(v) => { setConfirm(v); setError('') }} autoComplete="new-password" />
        {error && <p className="mt-2 text-xs font-medium text-rose-700" role="alert">{error}</p>}
        <button className="btn-primary mt-6 w-full py-3" disabled={busy}>{busy ? 'Criando as chaves…' : 'Criar proteção'}</button>
      </form>
    </Shell>
  )
}

function ShowRecovery() {
  const { recoveryToShow, finishSetup } = useStore()
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryToShow)
      setCopied(true)
    } catch {
      /* o texto continua visível para copiar à mão */
    }
  }

  return (
    <Shell>
      <Header icon={KeyRound} title="Guarde sua chave de recuperação">
        <p>Se você esquecer a senha de criptografia, <strong>só esta chave</strong> recupera os prontuários. Sem as duas, os textos ficam ilegíveis para sempre.</p>
        <p>Anote no papel ou guarde num gerenciador de senhas. Ela não será mostrada de novo.</p>
      </Header>
      <div className="mt-5 rounded-2xl border border-sage-200 bg-sage-50 p-4 text-center">
        <p className="font-mono text-lg font-semibold tracking-wider break-all text-ink-900 select-all">{recoveryToShow}</p>
        <button type="button" onClick={copy} className="btn-ghost mt-3 text-sm">
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiada' : 'Copiar'}
        </button>
      </div>
      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-ink-700">
        <input type="checkbox" className="mt-0.5 size-4 accent-sage-600" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Guardei a chave de recuperação em um lugar seguro.
      </label>
      <button className="btn-primary mt-5 w-full py-3" disabled={!saved} onClick={finishSetup}>Abrir o painel</button>
    </Shell>
  )
}

function Unlock() {
  const { unlockVault, recoverVault } = useStore()
  const [mode, setMode] = useState('senha')
  const [pass, setPass] = useState('')
  const [recovery, setRecovery] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const fail = (err, wrongMsg) => {
    if (err?.code !== 'senha_incorreta') console.error(err)
    setError(err?.code === 'senha_incorreta' ? wrongMsg : 'Não foi possível abrir. Verifique sua conexão e tente de novo.')
    setBusy(false)
  }

  const submitPass = async (e) => {
    e.preventDefault()
    if (!pass) return setError('Digite a senha de criptografia.')
    setBusy(true)
    try {
      await unlockVault(pass)
    } catch (err) {
      fail(err, 'Senha de criptografia incorreta.')
    }
  }

  const submitRecovery = async (e) => {
    e.preventDefault()
    if (!recovery.trim()) return setError('Digite a chave de recuperação.')
    const msg = checkNewPassphrase(newPass, confirm)
    if (msg) return setError(msg)
    setBusy(true)
    try {
      await recoverVault(recovery, newPass)
    } catch (err) {
      fail(err, 'Chave de recuperação incorreta. Confira as letras e números.')
    }
  }

  const switchMode = (m) => {
    setMode(m)
    setError('')
  }

  if (mode === 'recuperar') {
    return (
      <Shell>
        <form onSubmit={submitRecovery} noValidate>
          <Header icon={KeyRound} title="Recuperar acesso">
            <p>Digite a chave de recuperação que você guardou ao criar a proteção e escolha uma nova senha de criptografia.</p>
          </Header>
          <label className="label mt-4" htmlFor="vk-rec">Chave de recuperação</label>
          <input id="vk-rec" className="input font-mono uppercase" placeholder="XXXX-XXXX-XXXX-…" value={recovery} onChange={(e) => { setRecovery(e.target.value); setError('') }} autoFocus autoComplete="off" spellCheck={false} />
          <SecretInput id="vk-np" label="Nova senha de criptografia" value={newPass} onChange={(v) => { setNewPass(v); setError('') }} autoComplete="new-password" />
          <SecretInput id="vk-nc" label="Repita a nova senha" value={confirm} onChange={(v) => { setConfirm(v); setError('') }} autoComplete="new-password" />
          {error && <p className="mt-2 text-xs font-medium text-rose-700" role="alert">{error}</p>}
          <button className="btn-primary mt-6 w-full py-3" disabled={busy}>{busy ? 'Abrindo…' : 'Recuperar e abrir'}</button>
          <button type="button" onClick={() => switchMode('senha')} className="mt-3 w-full text-sm font-medium text-ink-500 hover:text-ink-900">Voltar</button>
        </form>
      </Shell>
    )
  }

  return (
    <Shell>
      <form onSubmit={submitPass} noValidate>
        <Header title="Abrir prontuários">
          <p>Digite sua senha de criptografia. Os textos clínicos só são abertos aqui, no seu navegador.</p>
        </Header>
        <SecretInput id="vk-pass" label="Senha de criptografia" value={pass} onChange={(v) => { setPass(v); setError('') }} autoFocus autoComplete="off" />
        {error && <p className="mt-2 text-xs font-medium text-rose-700" role="alert">{error}</p>}
        <button className="btn-primary mt-6 w-full py-3" disabled={busy}>{busy ? 'Abrindo…' : 'Abrir'}</button>
        <button type="button" onClick={() => switchMode('recuperar')} className="mt-3 w-full text-sm font-medium text-ink-500 hover:text-ink-900">Esqueci a senha de criptografia</button>
      </form>
    </Shell>
  )
}

function MissingTable({ onSkip }) {
  const { reload } = useStore()
  return (
    <Shell>
      <Header icon={RefreshCw} title="Falta atualizar o banco">
        <p>Para proteger os prontuários, rode o arquivo <code className="rounded bg-sage-50 px-1">supabase/criptografia.sql</code> no <strong>SQL Editor</strong> do Supabase e depois clique em “Tentar de novo”.</p>
      </Header>
      <button className="btn-primary mt-6 w-full py-3" onClick={reload}>Tentar de novo</button>
      <button className="mt-3 w-full text-sm font-medium text-ink-500 hover:text-ink-900" onClick={onSkip}>Continuar sem criptografia por enquanto</button>
    </Shell>
  )
}

/** Devolve a tela a mostrar no lugar do painel, ou null quando os prontuários estão abertos */
export default function CryptoGate({ onSkipMissing }) {
  const { vaultStatus, recoveryToShow } = useStore()
  if (recoveryToShow) return <ShowRecovery />
  if (vaultStatus === 'setup') return <Setup />
  if (vaultStatus === 'locked') return <Unlock />
  if (vaultStatus === 'missing') return <MissingTable onSkip={onSkipMissing} />
  return null
}
