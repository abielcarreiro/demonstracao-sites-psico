/**
 * Dados iniciais da demonstração: só as configurações do consultório.
 * Começa sem pacientes, sessões nem bloqueios, para testar do zero.
 */
import { createInitialData } from './seed'

/** Nomes usados pelo botão "Simular agendamento" */
export const SAMPLE_NAMES = ['Aline Batista', 'Bruno Queiroga', 'Carla Medeiros', 'Daniel Torres', 'Eduarda Lima', 'Felipe Araújo', 'Giovana Rocha', 'Igor Santana', 'Júlia Formiga', 'Marcelo Brito']
export const SAMPLE_REASONS = ['Ansiedade e insônia nas últimas semanas.', 'Quero entender melhor minhas emoções.', 'Momento difícil no trabalho.', 'Dificuldade nos relacionamentos.', 'Indicação do meu médico.']

export const createSeedData = createInitialData
