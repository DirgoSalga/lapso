import { describe, expect, it } from 'vitest'
import { formatClockTime, formatDateTime, fromDatetimeLocalValue, toDatetimeLocalValue } from './time'

describe('formatClockTime()', () => {
  it('zero-pads hours and minutes', () => {
    const d = new Date(2026, 0, 1, 9, 5)
    expect(formatClockTime(d.getTime())).toBe('09:05')
  })

  it('uses 24-hour time', () => {
    const d = new Date(2026, 0, 1, 20, 14)
    expect(formatClockTime(d.getTime())).toBe('20:14')
  })
})

describe('datetime-local round trip', () => {
  it('recovers the same epoch millisecond (to the minute) after a round trip', () => {
    const original = new Date(2026, 5, 15, 14, 22).getTime()
    const value = toDatetimeLocalValue(original)
    expect(value).toBe('2026-06-15T14:22')
    expect(fromDatetimeLocalValue(value)).toBe(original)
  })

  it('pads single-digit month and day', () => {
    const original = new Date(2026, 0, 5, 8, 3).getTime()
    expect(toDatetimeLocalValue(original)).toBe('2026-01-05T08:03')
  })
})

describe('formatDateTime()', () => {
  it('formats as "Mon D, HH:MM" independent of locale', () => {
    const d = new Date(2026, 7, 20, 14, 2)
    expect(formatDateTime(d.getTime())).toBe('Aug 20, 14:02')
  })

  it('does not zero-pad the day', () => {
    const d = new Date(2026, 0, 5, 8, 3)
    expect(formatDateTime(d.getTime())).toBe('Jan 5, 08:03')
  })
})
