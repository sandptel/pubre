// Portraits for the cast: a little ink-stamp face for each character, drawn from their name (the same
// name always gets the same face). Features follow a light guess at gender from the name, and a hash
// for everything else: hair, glasses, beard or moustache, collar, a striped or plain top.

const FEM = new Set('elizabeth jane mary lydia kitty catherine charlotte anne emma harriet fanny marianne elinor lucy alice queen duchess margaret jo amy beth meg ophelia juliet desdemona cordelia portia rosalind viola olivia jessica hermia helena titania miranda cleopatra estella pip-sister bertha jane eyre adele blanche grace helen dorothea rosamond celia hester pearl isabel daisy jordan myrtle scarlett melanie anna kitty dolly natasha sonya marya lise katerina sonia dunya nastasya'.split(' '))
const MASC_END = /(us|o|er|on|an|en|in|ck|k|d|t|m|b|g|p|v|z|x|ge|ph|th|ff|ll|ah|h|s|j|q)$/i

export type Gender = 'f' | 'm' | 'n'
export function genderOf(name: string): Gender {
  const first = name.toLowerCase().replace(/^(mr|mrs|miss|ms|lady|sir|lord|captain|capt|dr)\.?\s+/, (m) => (/^(mrs|miss|ms|lady)/.test(m) ? 'F ' : 'M ')).split(/\s+/)
  if (first[0] === 'F') return 'f'
  if (first[0] === 'M') return 'm'
  const n = first[0]
  if (FEM.has(n)) return 'f'
  if (/(a|ie|ette|elle|ine|issa|ina|lyn|een)$/.test(n)) return 'f'
  if (/y$/.test(n)) return 'm'
  if (MASC_END.test(n)) return 'm'
  return 'n'
}

/** FNV-1a: a stable number from a name. */
export function hashOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export interface Features { hair: number; glasses: boolean; beard: 0 | 1 | 2; top: number; bun: boolean }
export function featuresOf(name: string): Features {
  const g = genderOf(name)
  const pick = (n: number, what: string) => hashOf(name + '#' + what) % n // each feature its own draw
  return {
    hair: g === 'f' ? [3, 4, 5][pick(3, 'hair')] : g === 'm' ? [0, 1, 2, 7, 6][pick(5, 'hair')] : [0, 2, 4, 5][pick(4, 'hair')],
    glasses: pick(5, 'glasses') === 0,
    beard: g === 'm' ? ([0, 0, 0, 1, 2] as const)[pick(5, 'beard')] : 0,
    top: pick(4, 'top'),
    bun: g === 'f' && pick(3, 'bun') === 0,
  }
}

const HAIR = [
  'M27 34c0-12 9-19 23-19s23 7 23 19c-6-6-14-8-23-8s-17 2-23 8z', // 0 short, neat
  'M26 36c-1-14 8-22 24-22 15 0 24 8 23 22l-5-4-3 3-4-5-4 4-4-5-3 5-4-5-4 5-4-4-3 4-4-3z', // 1 spiky
  'M27 33c2-11 10-17 23-17 15 0 22 7 23 17-10-1-18-5-23-11-5 6-13 10-23 11z', // 2 side parted
  'M25 70c-3-30 3-54 25-54s28 24 25 54c-3 0-6-2-7-6V40c-7-3-12-8-18-14-5 6-11 11-18 14v24c-1 4-4 6-7 6z', // 3 long straight
  'M23 68c-6-30 3-52 27-52s33 22 27 52c-5-3-8-9-9-24-9-2-14-6-18-12-5 6-10 10-19 12-1 15-3 21-8 24z', // 4 chin-length bob
  'M24 46c-6-14 2-30 14-32 4-6 20-6 24 0 12 2 20 18 14 32-3-4-5-9-6-13-10 2-18-1-20-6-2 5-10 8-20 6-1 4-3 9-6 13z', // 5 curls
  'M27 36c0-13 9-20 23-20s23 7 23 20c-8-8-17-10-23-10s-15 2-23 10z', // 6 pulled back
  'M28 30c4-8 12-12 22-12s18 4 22 12c-6-2-12-3-22-3s-16 1-22 3z', // 7 thin / receding
]

/** An SVG string for a character: an ink-stamp portrait on their colour. */
export function portraitSvg(name: string, hue: string, ink = '#1d1b19', paper = '#fbf8f2'): string {
  const f = featuresOf(name)
  const st = (w = 2.6) => `fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`
  const stroke = st()
  const top = [
    `<path d="M22 100c2-14 14-20 28-20s26 6 28 20z" fill="${paper}" stroke="${ink}" stroke-width="2.6"/><path d="M40 82l10 10 10-10" ${stroke}/>`, // collar
    `<path d="M22 100c2-14 14-20 28-20s26 6 28 20z" fill="${paper}" stroke="${ink}" stroke-width="2.6"/>` + [88, 94].map(y => `<path d="M${y === 88 ? 26 : 23} ${y}h${y === 88 ? 48 : 54}" ${st(3.4)}/>`).join(''), // stripes
    `<path d="M22 100c2-14 14-20 28-20s26 6 28 20z" fill="${ink}"/><path d="M44 82l6 7 6-7" fill="none" stroke="${paper}" stroke-width="2.2" stroke-linecap="round"/>`, // dark top
    `<path d="M22 100c2-14 14-20 28-20s26 6 28 20z" fill="${paper}" stroke="${ink}" stroke-width="2.6"/><path d="M50 84v16M46 84l4 4 4-4" ${stroke}/>`, // tie
  ][f.top]
  const glasses = f.glasses ? `<circle cx="41" cy="47" r="6" ${st(2.2)}/><circle cx="59" cy="47" r="6" ${st(2.2)}/><path d="M47 47h6" ${st(2)}/>` : ''
  const beard = f.beard === 2 ? `<path d="M33 54c2 14 9 21 17 21s15-7 17-21c-5 5-10 6-17 6s-12-1-17-6z" fill="${ink}"/>`
    : f.beard === 1 ? `<path d="M41 61c4-3 14-3 18 0-4 1-14 1-18 0z" fill="${ink}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>` : ''
  const bun = f.bun ? `<circle cx="50" cy="13" r="8" fill="${ink}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${hue}"/>${top}`
    + `<path d="M48 76v6h4v-6" fill="${paper}" stroke="${ink}" stroke-width="2.4"/>`
    + `<ellipse cx="50" cy="48" rx="21" ry="25" fill="${paper}" stroke="${ink}" stroke-width="2.6"/>`
    + `${bun}<path d="${HAIR[f.hair]}" fill="${ink}"/>`
    + `<circle cx="42" cy="48" r="2.3" fill="${ink}"/><circle cx="58" cy="48" r="2.3" fill="${ink}"/>`
    + `<path d="M43 61c4 4 10 4 14 0" ${st(2.2)}/>`
    + `<circle cx="36" cy="57" r="3.4" fill="${hue}" opacity=".55"/><circle cx="64" cy="57" r="3.4" fill="${hue}" opacity=".55"/>`
    + `${glasses}${beard}</svg>`
}

export const portraitUrl = (name: string, hue: string, ink?: string, paper?: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(portraitSvg(name, hue, ink, paper))
