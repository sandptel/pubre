// What the reader has already learned. Each coach hint retires once its action has been done, or after it
// has shown enough times. Per device (localStorage): a hint here is about this device's keys and gestures.
const KEY = 'pubre:hints'
type Store = Record<string, number> // >= 0: times shown · -1: learned

function read(): Store { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
function write(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode: hints just show again */ } }

export const learned = (k: string) => read()[k] === -1
export function learn(k: string) { const s = read(); s[k] = -1; write(s) }
/** Count a showing: true while the hint should still show (not learned, shown fewer than `max` times). */
export function shown(k: string, max = Infinity): boolean {
  const s = read(), n = s[k] ?? 0
  if (n === -1 || n >= max) return false
  s[k] = n + 1; write(s)
  return true
}
