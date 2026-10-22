/** Formatação e validação de valores para pt-BR */

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatBRL = (v) => currency.format(v || 0)

/** Mantém apenas dígitos */
export const onlyDigits = (s = '') => s.replace(/\D/g, '')

/** Máscara de telefone brasileiro: (83) 99999-9999 */
export const maskPhone = (value = '') => {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())
export const isValidPhone = (s) => onlyDigits(s).length >= 10

/** Iniciais para avatares: "Ana Clara Souza" -> "AS" */
export const initials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Gerador simples de IDs únicos */
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/** Código curto e legível para o paciente, ex.: "AG-7K2Q" */
export const bookingCode = () => `AG-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

/** Normaliza texto para busca (sem acentos, minúsculo) */
export const normalize = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
