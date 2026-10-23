/**
 * Página pública: apresentação da psicóloga + fluxo de agendamento.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Award, BookOpen, CalendarHeart, Clock, GraduationCap, HeartHandshake, AtSign, Leaf, Lock,
  Mail, MapPin, Menu, MessageCircle, Monitor, Phone, ShieldCheck, Sparkles, User, Users, X,
} from 'lucide-react'
import { useStore } from '../context/AppStore'
import BookingWizard from '../components/booking/BookingWizard'
import { getBookableDays } from '../lib/availability'
import { formatLongDate } from '../lib/date'
import { formatBRL } from '../lib/format'
import { whatsappLink } from '../lib/whatsapp'

const SERVICE_ICONS = { Sparkles, User, Users }

const NAV = [
  { href: '#sobre', label: 'Sobre' },
  { href: '#abordagem', label: 'Abordagem' },
  { href: '#atendimento', label: 'Atendimento' },
  { href: '#servicos', label: 'Serviços' },
  { href: '#duvidas', label: 'Dúvidas' },
]

export default function BookingPage() {
  const { settings } = useStore()
  const { psychologist } = settings
  const [preselect, setPreselect] = useState(null)

  const chooseService = (id) => {
    setPreselect({ id, nonce: Date.now() })
    document.getElementById('agendar')?.scrollIntoView({ behavior: 'smooth' })
  }

  // Links internos (#sobre, #agendar…) rolam a página sem alterar a URL,
  // pois o hash da URL é usado pelo roteador (HashRouter).
  const onAnchorClick = (e) => {
    const a = e.target.closest('a[href^="#"]')
    const href = a?.getAttribute('href')
    if (!href || href.startsWith('#/')) return
    e.preventDefault()
    if (href === '#') window.scrollTo({ top: 0, behavior: 'smooth' })
    else document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen overflow-x-clip" onClick={onAnchorClick}>
      <DemoBanner />
      <SiteHeader name={psychologist.name} />
      <main>
        <Hero />
        <About psychologist={psychologist} />
        <Approach />
        <Modalities address={psychologist.address} />
        <Services services={settings.services} onChoose={chooseService} />

        <section id="agendar" className="scroll-mt-20 bg-gradient-to-b from-cream-50 via-sage-50/60 to-cream-50 py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <SectionTitle eyebrow="Agendamento online" title="Reserve seu horário em poucos passos" text="Escolha o atendimento, o melhor dia e horário e confirme pelo WhatsApp." center />
            <div className="mt-10">
              <BookingWizard preselectedServiceId={preselect} />
            </div>
          </div>
        </section>

        <FAQ />
      </main>
      <Footer psychologist={psychologist} />
      <FloatingWhatsApp phone={psychologist.phone} />
    </div>
  )
}

/* ================================ Seções ================================ */

function SiteHeader({ name }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-sage-100/70 bg-cream-50/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-sage-600 text-cream-50">
            <Leaf size={18} />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-lg text-ink-900">{name}</span>
            <span className="block text-[11px] font-medium uppercase tracking-widest text-ink-400">Psicologia Clínica</span>
          </span>
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-sage-50 hover:text-sage-800">
              {n.label}
            </a>
          ))}
          <a href="#agendar" className="btn-primary ml-2">Agendar consulta</a>
        </nav>

        <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Abrir menu" aria-expanded={open}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav className="animate-fade-in border-t border-sage-100 bg-cream-50 px-4 py-3 md:hidden" aria-label="Menu móvel">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 font-medium text-ink-700 hover:bg-sage-50">
              {n.label}
            </a>
          ))}
          <a href="#agendar" onClick={() => setOpen(false)} className="btn-primary mt-2 w-full">Agendar consulta</a>
        </nav>
      )}
    </header>
  )
}

function Hero() {
  const store = useStore()
  const { psychologist, services } = store.settings

  // Próximo horário disponível (prova social de disponibilidade real)
  const next = useMemo(() => {
    const days = getBookableDays(store.settings.bookingWindowDays, services[0].duration, store)
    const d = days.find((x) => x.slots.length)
    return d ? { date: d.date, time: d.slots[0] } : null
  }, [store, services])

  return (
    <section className="relative">
      {/* Formas orgânicas decorativas */}
      <div className="pointer-events-none absolute -top-24 -right-32 size-[520px] rounded-full bg-sage-100/70 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute top-40 -left-40 size-[420px] rounded-full bg-clay-100/60 blur-3xl" aria-hidden />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20 lg:pb-28">
        <div className="animate-fade-up">
          <span className="chip bg-white text-sage-700 ring-1 ring-sage-200">
            <span className="size-1.5 animate-pulse rounded-full bg-sage-500" /> Atendimento presencial e online
          </span>
          <h1 className="mt-6 text-4xl leading-[1.08] font-medium text-ink-900 sm:text-5xl lg:text-6xl">
            Um espaço seguro para <em className="text-sage-600 italic">cuidar de você</em>, no seu tempo.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-500">
            Psicoterapia para adolescentes, adultos e casais com escuta acolhedora, ética e embasamento científico. Vamos juntos
            construir caminhos para uma vida com mais leveza e sentido.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#agendar" className="btn-primary px-6 py-3.5 text-base">
              Agendar minha consulta <ArrowRight size={18} />
            </a>
            <a
              href={whatsappLink(psychologist.phone, 'Olá! Gostaria de tirar algumas dúvidas sobre o atendimento.')}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary px-6 py-3.5 text-base"
            >
              <MessageCircle size={18} className="text-[#1f9d55]" /> Tirar dúvidas
            </a>
          </div>
          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
            {[
              ['Presencial', 'e online'],
              ['50 min', 'sessão individual'],
              ['Sigilo', 'profissional garantido'],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className="font-display text-3xl text-ink-900">{v}</dd>
                <dd className="text-sm text-ink-500">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Composição visual */}
        <div className="relative mx-auto w-full max-w-md animate-fade-up [animation-delay:120ms]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-sage-300 via-sage-400 to-sage-600 shadow-lift">
            <PortraitArt />
          </div>

          <div className="absolute -bottom-6 -left-4 w-64 rounded-2xl bg-white p-4 shadow-lift ring-1 ring-sage-100 sm:-left-10">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              <CalendarHeart size={14} className="text-sage-600" /> Próximo horário livre
            </p>
            {next ? (
              <p className="mt-2 text-sm font-semibold text-ink-900 first-letter:uppercase">
                {formatLongDate(next.date)} <span className="text-sage-700">às {next.time}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-500">Agenda cheia no momento</p>
            )}
            <a href="#agendar" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sage-700 hover:text-sage-900">
              Reservar <ArrowRight size={14} />
            </a>
          </div>

          <div className="absolute -top-4 -right-2 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lift ring-1 ring-sage-100 sm:-right-8">
            <ShieldCheck size={20} className="text-sage-600" />
            <span className="text-sm leading-tight">
              <span className="block font-semibold">{psychologist.crp}</span>
              <span className="text-xs text-ink-500">Registro ativo</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Ilustração abstrata (substitua por uma foto profissional: <img src="/foto.jpg" />) */
function PortraitArt() {
  return (
    <svg viewBox="0 0 400 500" className="absolute inset-0 size-full" aria-hidden>
      <circle cx="320" cy="90" r="60" fill="#f6e4da" opacity="0.55" />
      <path d="M0 360 C 90 300, 170 380, 260 330 S 400 300, 400 300 V500 H0Z" fill="#3d503e" opacity="0.35" />
      <path d="M0 410 C 110 360, 200 440, 300 400 S 400 380, 400 380 V500 H0Z" fill="#28342a" opacity="0.35" />
      {/* Figura sentada, estilo minimalista */}
      <circle cx="200" cy="175" r="46" fill="#f0e6d5" />
      <path d="M200 128 c-34 0 -52 24 -50 52 c10 -22 30 -30 50 -30 s40 8 50 30 c2 -28 -16 -52 -50 -52z" fill="#324133" />
      <path d="M120 360 c0-70 36-120 80-120 s80 50 80 120z" fill="#f8f3ea" />
      <path d="M150 300 q50 30 100 0" stroke="#c9d7c6" strokeWidth="6" fill="none" strokeLinecap="round" />
      {/* Folhas */}
      <g fill="#e4ebe2" opacity="0.9">
        <path d="M60 250 q30 -60 70 -40 q-20 50 -70 40z" />
        <path d="M340 230 q-30 -60 -70 -40 q20 50 70 40z" />
      </g>
    </svg>
  )
}

function SectionTitle({ eyebrow, title, text, center }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="text-sm font-semibold uppercase tracking-widest text-sage-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-medium text-ink-900 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-lg leading-relaxed text-ink-500">{text}</p>}
    </div>
  )
}

/** Faixa que avisa que este é um site de demonstração, com dados fictícios */
function DemoBanner() {
  return (
    <div className="bg-ink-900 px-4 py-2 text-center text-xs text-cream-50 sm:text-sm">
      Site de demonstração com dados fictícios, criado por{' '}
      <a href="https://abiel-carreiro.pages.dev/" className="font-semibold underline underline-offset-2">Abiel Carreiro</a>.
      {' '}Os agendamentos feitos aqui não são atendidos.
    </div>
  )
}

function About({ psychologist }) {
  return (
    <section id="sobre" className="scroll-mt-20 py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionTitle eyebrow="Sobre mim" title={`Olá, eu sou ${psychologist.name.replace('Dra. ', '')}`} />
          <div className="mt-6 space-y-4 text-base leading-relaxed text-ink-700">
            <p>
              Sou psicóloga clínica formada pela Universidade Federal da Paraíba, com especialização em Terapia Cognitivo-Comportamental
              e formação em Terapia Focada nas Emoções para casais.
            </p>
            <p>
              Acompanho pessoas em momentos de ansiedade, tristeza, transições de vida, luto e conflitos nos
              relacionamentos. Acredito que a terapia é um encontro humano — um lugar onde você pode ser quem é, sem julgamentos.
            </p>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {[
            { icon: GraduationCap, title: 'Formação', text: 'Psicologia (UFPB) e Especialização em TCC' },
            { icon: Award, title: psychologist.crp, text: 'Registro ativo no Conselho Regional de Psicologia' },
            { icon: HeartHandshake, title: 'Casais', text: 'Formação em Terapia Focada nas Emoções (EFT)' },
            { icon: BookOpen, title: 'Atualização', text: 'Supervisão clínica e estudo contínuo' },
          ].map((c) => (
            <li key={c.title} className="card p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
              <span className="inline-flex rounded-xl bg-sage-50 p-2.5 text-sage-600">
                <c.icon size={20} />
              </span>
              <p className="mt-4 font-semibold text-ink-900">{c.title}</p>
              <p className="mt-1 text-sm text-ink-500">{c.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Approach() {
  const items = [
    { icon: HeartHandshake, title: 'Escuta acolhedora', text: 'Um vínculo de confiança é a base de todo processo terapêutico. Aqui você é ouvido(a) com respeito e cuidado.' },
    { icon: Sparkles, title: 'Baseada em evidências', text: 'Terapia Cognitivo-Comportamental: técnicas validadas cientificamente para resultados reais no seu dia a dia.' },
    { icon: Lock, title: 'Sigilo e ética', text: 'Tudo o que é dito em sessão é protegido pelo sigilo profissional, conforme o Código de Ética do Psicólogo.' },
  ]
  return (
    <section id="abordagem" className="scroll-mt-20 bg-sage-800 py-20 text-cream-50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-sage-300">Abordagem terapêutica</p>
          <h2 className="mt-3 text-3xl font-medium sm:text-4xl">Cuidado que une ciência e sensibilidade</h2>
          <p className="mt-4 text-lg leading-relaxed text-sage-200">
            Trabalho com a TCC de forma integrativa, adaptando o processo às suas necessidades, valores e ritmo.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {items.map((i) => (
            <div key={i.title} className="rounded-2xl bg-white/5 p-7 ring-1 ring-white/10 transition hover:bg-white/10">
              <i.icon size={26} className="text-sage-300" />
              <h3 className="mt-5 text-xl font-medium">{i.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sage-200">{i.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-2">
          {['Ansiedade', 'Depressão', 'Autoestima', 'Luto', 'Estresse e burnout', 'Relacionamentos', 'Transições de vida', 'Pânico'].map((t) => (
            <span key={t} className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-sage-100">{t}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

function Modalities({ address }) {
  return (
    <section id="atendimento" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle eyebrow="Como funciona" title="Presencial ou online: você escolhe" center />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="card overflow-hidden">
            <div className="bg-cream-100 p-7">
              <MapPin className="text-clay-500" size={28} />
              <h3 className="mt-4 text-2xl font-medium">Presencial</h3>
              <p className="mt-2 text-sm text-ink-500">Consultório confortável, silencioso e de fácil acesso.</p>
            </div>
            <ul className="space-y-3 p-7 text-sm text-ink-700">
              <li className="flex gap-3"><MapPin size={16} className="mt-0.5 shrink-0 text-sage-600" />{address}</li>
              <li className="flex gap-3"><Clock size={16} className="mt-0.5 shrink-0 text-sage-600" />Segunda a sexta, das 8h às 18h</li>
              <li className="flex gap-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-sage-600" />Ambiente com isolamento acústico</li>
            </ul>
          </div>
          <div className="card overflow-hidden">
            <div className="bg-sage-50 p-7">
              <Monitor className="text-sage-600" size={28} />
              <h3 className="mt-4 text-2xl font-medium">Online</h3>
              <p className="mt-2 text-sm text-ink-500">A mesma qualidade, de onde você estiver — inclusive no exterior.</p>
            </div>
            <ul className="space-y-3 p-7 text-sm text-ink-700">
              <li className="flex gap-3"><Lock size={16} className="mt-0.5 shrink-0 text-sage-600" />Plataforma de vídeo segura e criptografada</li>
              <li className="flex gap-3"><Clock size={16} className="mt-0.5 shrink-0 text-sage-600" />Link enviado antes de cada sessão</li>
              <li className="flex gap-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-sage-600" />Cadastro no e-Psi (CFP) para atendimento online</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function Services({ services, onChoose }) {
  return (
    <section id="servicos" className="scroll-mt-20 pb-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle eyebrow="Serviços" title="Atendimentos disponíveis" center />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {services.map((s, i) => {
            const Icon = SERVICE_ICONS[s.icon] || User
            const featured = i === 0
            return (
              <div key={s.id} className={`relative flex flex-col rounded-3xl p-7 transition hover:-translate-y-1 ${featured ? 'bg-sage-600 text-white shadow-lift' : 'card'}`}>
                {featured && <span className="absolute -top-3 left-7 chip bg-clay-500 text-white">Comece por aqui</span>}
                <Icon size={26} className={featured ? 'text-sage-200' : 'text-sage-600'} />
                <h3 className="mt-5 text-2xl font-medium">{s.name}</h3>
                <p className={`mt-2 flex-1 text-sm leading-relaxed ${featured ? 'text-sage-100' : 'text-ink-500'}`}>{s.description}</p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-3xl">{formatBRL(s.price)}</span>
                  <span className={`text-sm ${featured ? 'text-sage-200' : 'text-ink-400'}`}>/ {s.duration} min</span>
                </div>
                <button
                  onClick={() => onChoose(s.id)}
                  className={`btn mt-6 w-full ${featured ? 'bg-white text-sage-800 hover:bg-cream-100' : 'bg-sage-50 text-sage-800 hover:bg-sage-100'}`}
                >
                  Agendar {s.name.toLowerCase()} <ArrowRight size={16} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FAQ() {
  const faqs = [
    ['Como sei se preciso de terapia?', 'Se algo tem causado sofrimento, afetado seu sono, trabalho ou relações, a terapia pode ajudar. Você não precisa estar em crise para buscar cuidado.'],
    ['Quanto tempo dura o processo terapêutico?', 'Varia de pessoa para pessoa. Na primeira consulta conversamos sobre seus objetivos e definimos juntos a frequência e a duração estimada.'],
    ['A terapia online funciona?', 'Sim. Estudos mostram eficácia equivalente ao presencial para a maioria das demandas. É ideal para quem tem rotina corrida ou mora em outra cidade.'],
    ['Vocês aceitam plano de saúde?', 'O atendimento é particular, mas emito recibo para reembolso junto ao seu plano de saúde e para declaração no Imposto de Renda.'],
    ['E se eu precisar remarcar?', 'Sem problemas! Remarcações e cancelamentos com até 24h de antecedência não têm custo. Basta avisar pelo WhatsApp.'],
  ]
  return (
    <section id="duvidas" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionTitle eyebrow="Dúvidas frequentes" title="Perguntas comuns" center />
        <div className="mt-10 space-y-3">
          {faqs.map(([q, a]) => (
            <details key={q} className="group card p-0 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5 font-semibold text-ink-900">
                {q}
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sage-50 text-sage-700 transition group-open:rotate-45">+</span>
              </summary>
              <p className="px-6 pb-5 text-sm leading-relaxed text-ink-500">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer({ psychologist }) {
  return (
    <footer className="border-t border-sage-100 bg-cream-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-display text-xl">{psychologist.name}</p>
          <p className="mt-1 text-sm text-ink-500">{psychologist.title} · {psychologist.crp}</p>
          <p className="mt-4 text-sm text-ink-500">Em caso de emergência, ligue para o CVV (188) ou SAMU (192).</p>
        </div>
        <ul className="space-y-3 text-sm text-ink-700">
          <li className="flex gap-3"><Phone size={16} className="text-sage-600" />{psychologist.phone}</li>
          <li className="flex gap-3"><Mail size={16} className="text-sage-600" />{psychologist.email}</li>
          <li className="flex gap-3"><AtSign size={16} className="text-sage-600" />{psychologist.instagram}</li>
          <li className="flex gap-3"><MapPin size={16} className="shrink-0 text-sage-600" />{psychologist.address}</li>
        </ul>
        <div className="md:text-right">
          <a href="#agendar" className="btn-primary">Agendar consulta</a>
          <p className="mt-6 text-xs text-ink-400">
            © {new Date().getFullYear()} · Todos os direitos reservados ·{' '}
            <Link to="/admin" className="underline-offset-2 hover:text-sage-700 hover:underline">Área da psicóloga</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}

function FloatingWhatsApp({ phone }) {
  return (
    <a
      href={whatsappLink(phone, 'Olá! Vim pelo site e gostaria de mais informações.')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Conversar no WhatsApp"
      className="fixed right-5 bottom-5 z-30 flex size-14 items-center justify-center rounded-full bg-[#1f9d55] text-white shadow-lift transition hover:scale-105"
    >
      <MessageCircle size={26} />
    </a>
  )
}
