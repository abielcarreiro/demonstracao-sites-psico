import { OCCUPYING } from './constants'
import { addDays, fromISODate, minutesToTime, timeToMinutes, toDateTime, toISODate } from './date'

/** Verifica se [aStart, aEnd) e [bStart, bEnd) (em minutos) se sobrepõem */
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd

/**
 * Retorna os horários livres de um dia para um serviço de determinada duração.
 *
 * Regras:
 *  - respeita o expediente e o intervalo configurados para o dia da semana;
 *  - gera horários no passo `settings.slotStep` (minutos);
 *  - remove horários que colidem com sessões ativas (+ intervalo entre sessões) ou bloqueios;
 *  - remove horários no passado e respeita a antecedência mínima (`minNoticeHours`).
 *
 * @param {string} dateISO 'YYYY-MM-DD'
 * @param {number} duration duração do serviço em minutos
 * @param {{settings, appointments, blocks}} data estado da aplicação
 * @param {string} [ignoreAppointmentId] ignora esta sessão (útil ao reagendar)
 */
export function getAvailableSlots(dateISO, duration, { settings, appointments, blocks }, ignoreAppointmentId) {
  const day = settings.workingHours[fromISODate(dateISO).getDay()]
  if (!day?.enabled) return []

  const dayBlocks = blocks.filter((b) => b.date === dateISO)
  if (dayBlocks.some((b) => b.allDay)) return []

  // A pausa vale antes e depois de cada sessão: a nova não pode começar logo após
  // outra nem terminar colada na seguinte (mesma regra de create_public_booking)
  const buffer = settings.bufferMinutes || 0
  const busy = [
    ...appointments
      .filter((a) => a.date === dateISO && OCCUPYING.includes(a.status) && a.id !== ignoreAppointmentId)
      .map((a) => [timeToMinutes(a.time) - buffer, timeToMinutes(a.time) + a.duration + buffer]),
    ...dayBlocks.map((b) => [timeToMinutes(b.start), timeToMinutes(b.end)]),
  ]
  if (day.breakStart && day.breakEnd) busy.push([timeToMinutes(day.breakStart), timeToMinutes(day.breakEnd)])

  const earliest = Date.now() + (settings.minNoticeHours || 0) * 3600 * 1000
  const slots = []
  const end = timeToMinutes(day.end)

  for (let t = timeToMinutes(day.start); t + duration <= end; t += settings.slotStep) {
    const time = minutesToTime(t)
    if (toDateTime(dateISO, time).getTime() < earliest) continue
    if (busy.some(([bs, be]) => overlaps(t, t + duration, bs, be))) continue
    slots.push(time)
  }
  return slots
}

/** Próximas N datas (a partir de hoje) com os horários livres de cada uma */
export function getBookableDays(daysAhead, duration, data) {
  const today = new Date()
  return Array.from({ length: daysAhead }, (_, i) => {
    const iso = toISODate(addDays(today, i))
    return { date: iso, slots: getAvailableSlots(iso, duration, data) }
  })
}
