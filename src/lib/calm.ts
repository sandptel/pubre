// Calm time estimates: a gentle range at your pace, never a countdown (time pressure makes screen
// reading shallow; see docs/research/cognitive-reading.md).

export function calmRange(minutes: number): string {
  if (!isFinite(minutes) || minutes <= 0) return ''
  if (minutes < 1.5) return 'about a minute'
  const lo = minutes * 0.8, hi = minutes * 1.25
  if (hi < 90) {
    const r = (n: number) => (n < 10 ? Math.max(1, Math.round(n)) : Math.round(n / 5) * 5)
    const a = r(lo), b = Math.max(r(hi), a + 1)
    return `~${a}–${b} min`
  }
  const h = (n: number) => (hi >= 240 ? Math.round(n / 60) : Math.round(n / 30) / 2) // whole hours once it's long
  const a = h(lo), b = Math.max(h(hi), a + 0.5)
  return `~${a}–${b} h`
}

/** Minutes left in the whole book, from per-chapter word counts and the reading position. */
export function bookMinutesLeft(words: number[] | undefined, index: number, fraction: number, wpm: number): number {
  if (!words?.length) return NaN
  const rest = words.slice(index + 1).reduce((a, n) => a + n, 0) + (words[index] ?? 0) * (1 - fraction)
  return rest / Math.max(60, wpm)
}
