/**
 * Dados fictícios da demonstração: 12 pacientes com sessões semanais ou
 * quinzenais nos últimos meses, anotações de evolução, pagamentos,
 * algumas solicitações novas vindas do site e um bloqueio de agenda.
 * Usa um gerador com semente para os dados serem sempre os mesmos.
 */
import { defaultSettings } from './seed'
import { addDays, startOfWeek, toDateTime, toISODate } from '../lib/date'
import { getAvailableSlots } from '../lib/availability'

/* ---------- Gerador pseudoaleatório determinístico (mesmo seed = mesmos dados) ---------- */
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const NOTES = [
  'Paciente relatou melhora na qualidade do sono após aplicar técnicas de higiene do sono. Trabalhamos reestruturação cognitiva sobre pensamentos catastróficos no trabalho.',
  'Sessão focada em limites nas relações familiares. Demonstrou boa elaboração sobre o padrão de evitação. Tarefa: registro de pensamentos automáticos.',
  'Relato de episódio de ansiedade intensa durante a semana. Praticamos respiração diafragmática e grounding 5-4-3-2-1. Retomar na próxima sessão.',
  'Boa adesão às tarefas. Exploramos crenças centrais de desamparo. Paciente emocionou-se ao falar da relação com o pai.',
  'Sessão de acompanhamento. Humor estável, mais engajado(a) em atividades prazerosas. Planejamos exposição gradual a situações sociais.',
  'Discutimos estratégias de comunicação não violenta. Casal conseguiu nomear necessidades sem acusações. Evolução perceptível.',
  'Revisão dos objetivos terapêuticos. Paciente reconhece avanços na autorregulação emocional. Manter frequência semanal.',
  'Tema principal: luto pela perda recente. Acolhimento e validação. Avaliar necessidade de encaminhamento psiquiátrico se sintomas persistirem.',
]

/** [nome, telefone, e-mail, nascimento, serviço, dia da semana, horário, frequência (1 = semanal, 2 = quinzenal), motivo] */
const PATIENTS = [
  ['Mariana Albuquerque', '(83) 98812-4455', 'mariana.alb@email.com', '1992-03-14', 'srv_individual', 1, '08:00', 1, 'Ansiedade no trabalho e dificuldade para dormir.'],
  ['Rafael Nogueira', '(83) 99621-1830', 'rafael.nog@email.com', '1988-11-02', 'srv_individual', 1, '10:00', 1, 'Sintomas depressivos após término de relacionamento.'],
  ['Juliana e Pedro Cavalcanti', '(83) 98745-0921', 'ju.cavalcanti@email.com', '1990-07-21', 'srv_casal', 1, '16:00', 2, 'Conflitos frequentes e dificuldade de comunicação.'],
  ['Beatriz Lemos', '(83) 99133-7788', 'bia.lemos@email.com', '2003-01-30', 'srv_individual', 2, '09:00', 1, 'Pressão acadêmica e autocobrança.'],
  ['Thiago Monteiro', '(81) 98877-6655', 'thiago.m@email.com', '1985-05-09', 'srv_individual', 2, '14:00', 1, 'Burnout e desmotivação profissional.'],
  ['Camila Freitas', '(83) 99210-3344', 'camila.freitas@email.com', '1996-09-17', 'srv_individual', 3, '08:00', 1, 'Ataques de pânico recorrentes.'],
  ['Lucas Andrade', '(83) 98654-2211', 'lucas.andrade@email.com', '1999-12-05', 'srv_individual', 3, '15:00', 2, 'Ansiedade social.'],
  ['Fernanda Rocha', '(83) 99876-5432', 'fe.rocha@email.com', '1979-04-23', 'srv_individual', 4, '10:00', 1, 'Luto pela perda da mãe.'],
  ['Gustavo Pereira', '(83) 98123-9087', 'gustavo.p@email.com', '1994-08-11', 'srv_individual', 4, '17:00', 1, 'Autoestima e relacionamentos.'],
  ['Larissa e Diego Martins', '(83) 99345-6712', 'larissa.martins@email.com', '1987-02-28', 'srv_casal', 5, '09:00', 2, 'Reconstrução de confiança após crise conjugal.'],
  ['Ana Clara Sousa', '(83) 98456-1290', 'anaclara.s@email.com', '2001-06-19', 'srv_individual', 5, '14:00', 1, 'Transtorno alimentar em acompanhamento multiprofissional.'],
  ['Roberto Farias', '(83) 99567-3401', 'roberto.farias@email.com', '1972-10-08', 'srv_individual', 2, '16:00', 2, 'Estresse e irritabilidade.'],
]

/** Pessoas que pediram horário pelo site e aguardam confirmação */
const REQUESTS = [
  ['Patrícia Lacerda', '(83) 99702-1188', 'patricia.l@email.com', 'Crises de ansiedade antes de reuniões.', 'presencial'],
  ['Henrique Diniz', '(83) 98841-5520', '', 'Dificuldade de lidar com a mudança de cidade.', 'online'],
]

const PAYMENT_METHODS = ['pix', 'pix', 'pix', 'cartao', 'dinheiro']

/** Nomes usados pelo botão "Simular agendamento" */
export const SAMPLE_NAMES = ['Aline Batista', 'Bruno Queiroga', 'Carla Medeiros', 'Daniel Torres', 'Eduarda Lima', 'Felipe Araújo', 'Giovana Rocha', 'Igor Santana', 'Júlia Formiga', 'Marcelo Brito']
export const SAMPLE_REASONS = ['Ansiedade e insônia nas últimas semanas.', 'Quero entender melhor minhas emoções.', 'Momento difícil no trabalho.', 'Dificuldade nos relacionamentos.', 'Indicação do meu médico.']

export function createSeedData() {
  const rand = rng(20261023)
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const now = new Date()
  const thisWeek = startOfWeek(now)
  const services = Object.fromEntries(defaultSettings.services.map((s) => [s.id, s]))

  const patients = []
  let appointments = []

  PATIENTS.forEach(([name, phone, email, birthDate, serviceId, weekday, time, freq, reason], i) => {
    const patientId = `pat_seed_${i + 1}`
    const weeksBack = 10 + Math.floor(rand() * 16) // início do acompanhamento
    const firstDay = addDays(thisWeek, -weeksBack * 7 + weekday)

    patients.push({
      id: patientId,
      name,
      phone,
      email,
      birthDate,
      reason,
      status: i === 11 ? 'inativo' : 'ativo',
      source: i % 3 === 0 ? 'site' : 'manual',
      createdAt: toISODate(addDays(firstDay, -3)),
      generalNotes: i === 0 ? 'Prefere sessões no início da manhã. Faz acompanhamento psiquiátrico em paralelo.' : '',
    })

    // Primeira consulta (avaliação) e depois sessões recorrentes
    for (let w = 0; w <= weeksBack + 3; w += freq) {
      const date = toISODate(addDays(firstDay, w * 7))
      const isFirst = w === 0
      const service = isFirst ? services.srv_primeira : services[serviceId]
      const start = toDateTime(date, time)
      const past = start < now
      if (i === 11 && w > weeksBack - 3) break // paciente que encerrou o acompanhamento

      let status = 'confirmada'
      if (past) {
        const r = rand()
        status = r < 0.08 ? 'cancelada' : r < 0.13 ? 'reagendada' : 'realizada'
      }

      const recent = now - start < 35 * 864e5 // pendências de pagamento só nas últimas ~5 semanas
      const paid = status === 'realizada' ? !recent || rand() > 0.15 : status === 'confirmada' && rand() < 0.25

      appointments.push({
        id: `apt_seed_${i + 1}_${w}`,
        patientId,
        serviceId: service.id,
        serviceName: service.name,
        date,
        time,
        duration: isFirst ? services.srv_primeira.duration : service.duration,
        modality: rand() < 0.35 ? 'online' : 'presencial',
        status,
        price: service.price,
        paid,
        paymentMethod: paid ? pick(PAYMENT_METHODS) : '',
        note: status === 'realizada' ? pick(NOTES) : '',
        reason: isFirst ? reason : '',
        code: `AG-${(1000 + i * 37 + w).toString(36).toUpperCase()}`,
        createdAt: toISODate(addDays(start, -7)),
      })
    }
  })

  // Um bloqueio de exemplo (congresso) daqui a ~2 semanas
  const blocks = [
    { id: 'blk_seed_1', date: toISODate(addDays(thisWeek, 14 + 5)), allDay: true, start: '00:00', end: '23:59', reason: 'Congresso de Psicologia' },
  ]
  const blocked = new Set(blocks.map((b) => b.date))
  appointments = appointments.filter((a) => !blocked.has(a.date))

  // Solicitações do site aguardando confirmação, em horários realmente livres
  const data = { settings: defaultSettings, appointments, blocks }
  const first = services.srv_primeira
  let day = 1
  REQUESTS.forEach(([name, phone, email, reason, modality], i) => {
    let date
    let slots = []
    for (; day < 21 && !slots.length; day++) {
      date = toISODate(addDays(now, day))
      slots = getAvailableSlots(date, first.duration, data)
    }
    if (!slots.length) return
    const patientId = `pat_req_${i + 1}`
    patients.push({ id: patientId, name, phone, email, birthDate: '', reason, status: 'ativo', source: 'site', createdAt: toISODate(now), generalNotes: '' })
    appointments.push({
      id: `apt_req_${i + 1}`, patientId, serviceId: first.id, serviceName: first.name, date, time: slots[Math.floor(slots.length / 2)],
      duration: first.duration, modality, status: 'pendente', price: first.price, paid: false, paymentMethod: '', note: '', reason,
      code: `AG-R${i + 1}${(now.getDate() * 7).toString(36).toUpperCase()}`, createdAt: toISODate(now),
    })
  })

  return { settings: defaultSettings, patients, appointments, blocks }
}
