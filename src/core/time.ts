function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function formatClockTime(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// For <input type="datetime-local">, which reads/writes local time with no
// timezone offset in the string.
export function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms)
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  return `${year}-${month}-${day}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string): number {
  return new Date(value).getTime()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// History's mono timestamps (spec §8). Hand-rolled rather than
// Intl.DateTimeFormat so the format is locale-independent and testable.
export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  const month = MONTHS[d.getMonth()] ?? ''
  return `${month} ${d.getDate()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
