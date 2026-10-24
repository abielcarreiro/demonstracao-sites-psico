/**
 * Barra flutuante e tutorial da demonstração (portfólio).
 * Leva do site ao painel, simula pedidos de agendamento e apaga tudo para começar do zero.
 */
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CalendarPlus, CircleHelp, ClipboardList, Home, LayoutDashboard, Leaf, Lock, RotateCcw, X } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { Modal, useToast } from '../ui'
import { formatShortDate } from '../../lib/date'

const TUTORIAL_KEY = 'psico-demo:tutorial-visto'
const seen = () => {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1'
  } catch {
    return false
  }
}

const STEPS = [
  { icon: CalendarPlus, title: 'Agende como paciente', text: 'Em Agendar, escolha o serviço, presencial ou online, um horário livre e preencha seus dados. No fim aparece a mensagem pronta para o WhatsApp.' },
  { icon: LayoutDashboard, title: 'Abra o painel', text: 'Clique em Painel e entre com um clique. A sua solicitação aparece na visão geral, esperando confirmação.' },
  { icon: ClipboardList, title: 'Explore a rotina da psicóloga', text: 'Confirme o pedido, veja a agenda por dia, semana ou mês, abra o prontuário do paciente, anote a sessão e registre o pagamento no financeiro.' },
  { icon: Lock, title: 'Prontuários protegidos', text: 'Os textos clínicos ficam criptografados. Clique em "Bloquear prontuários" no menu e desbloqueie com a senha mostrada na tela.' },
]

export function DemoTutorial({ open, onClose }) {
  const navigate = useNavigate()
  const close = () => {
    try {
      localStorage.setItem(TUTORIAL_KEY, '1')
    } catch {
      /* sem armazenamento */
    }
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title="Como usar esta demonstração"
      description="Site de psicologia com agendamento online e painel clínico completo."
      size="md"
      footer={
        <>
          <button className="btn-ghost" onClick={close}>Fechar</button>
          <button
            className="btn-primary"
            onClick={() => {
              close()
              navigate('/')
              setTimeout(() => document.getElementById('agendar')?.scrollIntoView({ behavior: 'smooth' }), 50)
            }}
          >
            Começar agendando
          </button>
        </>
      }
    >
      <ol className="space-y-4">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex gap-4">
            <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-sage-50 text-sage-700">
              <Icon size={19} />
              <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-sage-700 text-[11px] font-bold text-white">{i + 1}</span>
            </span>
            <div>
              <p className="font-semibold text-ink-900">{title}</p>
              <p className="text-sm leading-relaxed text-ink-500">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 rounded-xl bg-sage-50 p-4 text-sm leading-relaxed text-ink-700">
        <b>Acesso restrito:</b> o painel é só da psicóloga, com login e senha próprios. No sistema real, o paciente vê apenas o site e o agendamento; a barra Demo existe só para você conhecer tudo.
      </p>
      <p className="mt-3 rounded-xl bg-cream-100 p-4 text-sm leading-relaxed text-ink-700">
        <b>Simular agendamento</b> cria um pedido de um paciente fictício, como se alguém tivesse agendado pelo site agora. A demonstração começa vazia, e o botão ↺ apaga tudo para começar do zero. Tudo fica só no seu navegador: ninguém vê o seu teste.
      </p>
    </Modal>
  )
}

export default function DemoBar() {
  const { simulateBooking, resetDemo } = useStore()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [visible, setVisible] = useState(true)
  const [help, setHelp] = useState(() => !seen())
  const inAdmin = location.pathname.startsWith('/admin')

  const item = 'flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition sm:px-3'
  const idle = 'text-sage-100 hover:bg-white/10 hover:text-white'
  const active = 'bg-cream-50 text-sage-800'

  return (
    <>
      <DemoTutorial open={help} onClose={() => setHelp(false)} />
      {/* Espaço no fim da página para a barra não cobrir o rodapé */}
      {visible && <div className="h-20 print:hidden" aria-hidden />}
      {visible ? (
        <div className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 print:hidden">
          <nav className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl bg-sage-900/95 p-1.5 shadow-lift ring-1 ring-white/10 backdrop-blur [scrollbar-width:none] sm:gap-1" aria-label="Telas da demonstração">
            <span className="hidden px-2 text-[11px] font-bold tracking-wider text-clay-300 uppercase md:inline">Demo</span>
            <Link to="/" className={`${item} ${!inAdmin ? active : idle}`}><Home size={16} />Site</Link>
            <button
              className={`${item} ${idle}`}
              onClick={() => {
                if (inAdmin) navigate('/')
                setTimeout(() => document.getElementById('agendar')?.scrollIntoView({ behavior: 'smooth' }), 60)
              }}
            >
              <CalendarPlus size={16} />Agendar
            </button>
            <Link to="/admin" className={`${item} ${inAdmin ? active : idle}`}><LayoutDashboard size={16} />Painel</Link>
            <span className="mx-1 h-6 w-px shrink-0 bg-white/15" aria-hidden />
            <button
              className={`${item} text-clay-300 hover:bg-white/10`}
              title="Cria um pedido de agendamento de um paciente fictício"
              onClick={() => {
                try {
                  const r = simulateBooking()
                  toast(`Novo pedido: ${r.name.split(' ')[0]}, ${r.serviceName} em ${formatShortDate(r.date)} às ${r.time}.`)
                } catch (err) {
                  toast(err.message, 'error')
                }
              }}
            >
              <Leaf size={16} />
              <span className="hidden sm:inline">Simular agendamento</span>
            </button>
            <button
              className="grid size-9 shrink-0 place-items-center rounded-xl text-sage-100 transition hover:bg-white/10 hover:text-white"
              title="Apagar tudo e começar do zero"
              aria-label="Apagar tudo e começar do zero"
              onClick={() => {
                if (!confirm('Apagar todos os pacientes, sessões e bloqueios e começar do zero?')) return
                resetDemo()
                toast('Tudo apagado: começando do zero.')
              }}
            >
              <RotateCcw size={16} />
            </button>
            <button className="grid size-9 shrink-0 place-items-center rounded-xl text-sage-100 transition hover:bg-white/10 hover:text-white" title="Como usar a demonstração" aria-label="Como usar a demonstração" onClick={() => setHelp(true)}>
              <CircleHelp size={16} />
            </button>
            <button className="grid size-9 shrink-0 place-items-center rounded-xl text-sage-100 transition hover:bg-white/10 hover:text-white" aria-label="Esconder barra da demonstração" onClick={() => setVisible(false)}>
              <X size={16} />
            </button>
          </nav>
        </div>
      ) : (
        <button onClick={() => setVisible(true)} className="fixed bottom-4 left-4 z-40 grid size-11 place-items-center rounded-full bg-sage-900 text-clay-300 shadow-lift transition hover:scale-105 print:hidden" aria-label="Mostrar barra da demonstração">
          <Leaf size={18} />
        </button>
      )}
    </>
  )
}
