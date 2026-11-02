const timeZone = "America/Sao_Paulo"

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const time = new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" })
const day = new Intl.DateTimeFormat("pt-BR", {
  timeZone,
  weekday: "long",
  day: "numeric",
  month: "long",
})
const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "numeric", month: "long" })
const calendarDay = new Intl.DateTimeFormat("en-CA", { timeZone })
const relativeDays: Record<number, string> = { 0: "Hoje", 1: "Amanhã" }

export function formatMoney(cents: number) {
  return money.format(cents / 100)
}

export function formatTime(date: Date) {
  return time.format(date)
}

export function formatDate(date: Date) {
  return shortDate.format(date)
}

export function formatDay(date: Date) {
  const daysFromToday = Math.round(
    (Date.parse(calendarDay.format(date)) - Date.parse(calendarDay.format(new Date()))) /
      86_400_000,
  )
  const relative = relativeDays[daysFromToday]
  return relative ? `${relative} · ${day.format(date)}` : day.format(date)
}
