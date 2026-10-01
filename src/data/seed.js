/**
 * Dados iniciais da aplicação: configurações do consultório e listas vazias
 * de pacientes, sessões e bloqueios.
 */

export const defaultSettings = {
  psychologist: {
    name: 'Dra. Luanna Santos',
    title: 'Psicóloga Clínica',
    crp: 'CRP 13/9256',
    phone: '(83) 98721-6921', // WhatsApp que recebe as confirmações
    email: 'contato@vitoriafernandes.com.br',
    address: 'Av. Epitácio Pessoa, 1200 — Sala 804, Tambaú, João Pessoa/PB',
    instagram: '@vitoriafernandes.psi',
  },
  services: [
    {
      id: 'srv_primeira',
      name: 'Primeira Consulta',
      description: 'Um encontro para nos conhecermos, entender sua demanda e construir juntos o plano terapêutico.',
      duration: 60,
      price: 200,
      icon: 'Sparkles',
    },
    {
      id: 'srv_individual',
      name: 'Terapia Individual',
      description: 'Sessões semanais ou quinzenais para adolescentes (a partir de 15 anos) e adultos.',
      duration: 50,
      price: 180,
      icon: 'User',
    },
    {
      id: 'srv_casal',
      name: 'Terapia de Casal',
      description: 'Espaço seguro para melhorar a comunicação, resolver conflitos e fortalecer o vínculo.',
      duration: 80,
      price: 280,
      icon: 'Users',
    },
  ],
  /** Índice = dia da semana (0 = domingo) */
  workingHours: [
    { enabled: false, start: '08:00', end: '12:00', breakStart: '', breakEnd: '' },
    { enabled: true, start: '08:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    { enabled: true, start: '08:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    { enabled: true, start: '08:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    { enabled: true, start: '08:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    { enabled: true, start: '08:00', end: '16:00', breakStart: '12:00', breakEnd: '13:00' },
    { enabled: false, start: '08:00', end: '12:00', breakStart: '', breakEnd: '' },
  ],
  slotStep: 60, // intervalo entre inícios de horários ofertados (min)
  bufferMinutes: 10, // descanso entre sessões (min)
  minNoticeHours: 12, // antecedência mínima para agendar online
  bookingWindowDays: 30, // até quantos dias à frente o paciente pode agendar
}

/** Estado inicial: sem pacientes, sessões ou bloqueios cadastrados */
export function createInitialData() {
  return { settings: defaultSettings, patients: [], appointments: [], blocks: [] }
}
