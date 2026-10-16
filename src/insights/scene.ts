// The weather of the passage (E1): what the page you're on describes, so its margins can carry a little of it.
// Rules first (research/speaker-models.md §environment): literal words per scene, minus figurative uses
// ("a storm of applause", "dark thoughts", "a sea of faces") and negations ("not a cloud"), scored per
// 100 words. `SceneTrack` adds hysteresis so the effect never flickers from page to page.

export type Scene = '' | 'rain' | 'storm' | 'snow' | 'fog' | 'night' | 'sun' | 'sea' | 'wind'

const WORDS: [Exclude<Scene, ''>, RegExp, number][] = [
  ['storm', /\b(storm|storms|stormy|tempest|thunder|thunderclap|lightning|gale|gales|squall|squalls|hurricane|typhoon|downpour)\b/gi, 1.4],
  ['rain', /\b(rain|rains|rained|raining|rainy|drizzle|drizzling|drizzly|shower|showers|wet|puddles?|umbrella|raindrops?|dripping)\b/gi, 1],
  ['snow', /\b(snow|snows|snowed|snowing|snowy|snowflakes?|sleet|frost|frosty|frozen|icy|blizzard|drifts)\b/gi, 1.2],
  ['fog', /\b(fog|foggy|mist|misty|mists|haze|hazy|vapou?rs?)\b/gi, 1.3],
  ['night', /\b(night|nights|midnight|moon|moonlight|moonlit|stars|starlight|starry|dusk|darkness|candle|candlelight|lamplight)\b/gi, 0.8],
  ['sun', /\b(sun|sunny|sunshine|sunlight|sunlit|noon|blazing|glare|daylight|summer)\b/gi, 0.8],
  ['sea', /\b(sea|seas|ocean|waves|wave|surf|swell|tide|tides|spray|deck|harbour|harbor|shore)\b/gi, 0.7],
  ['wind', /\b(wind|winds|windy|gust|gusts|breeze|blew|blowing|howling)\b/gi, 0.8],
]
// figurative or idiomatic uses that aren't the weather
const FIGURATIVE = /\b(?:storm|sea|flood|rain|shower|hail|torrent)\s+of\s+\w+|\b(?:dark|black|cold|icy|stormy|sunny|frosty)\s+(?:thoughts?|looks?|mood|humou?r|heart|eyes|stare|glance|disposition|temper|welcome|smile|reception)|\bin the dark\b|\bsea[- ]?change\b|\bbrainstorm|\btook (?:the )?\w+ by storm\b|\bwind of\b|\bget wind\b|\bthe sun of\b/gi
const NEGATED = /\b(?:no|not a|without|never a)\s+(?:\w+\s+)?(?:rain|cloud|wind|breath of wind|snow|star|moon|sun)\b/gi

/** The scene a stretch of text describes, and how strongly (mentions per 100 words, weighted). */
export function sceneOf(text: string): { scene: Scene; score: number } {
  const clean = text.replace(FIGURATIVE, ' ').replace(NEGATED, ' ')
  const words = Math.max(40, (clean.match(/\S+/g) ?? []).length)
  let best: Scene = '', top = 0
  for (const [s, re, w] of WORDS) { const n = (clean.match(re)?.length ?? 0) * w * 100 / words; if (n > top) { top = n; best = s } }
  return { scene: top >= 0.6 ? best : '', score: top }
}

/** Hysteresis: a scene shows after it's held two pages (or once strongly), and leaves after two pages without it. */
export class SceneTrack {
  private cur: Scene = ''
  private cand: Scene = ''
  private seen = 0
  private miss = 0
  next(scene: Scene, score: number): Scene {
    if (scene && scene === this.cur) { this.miss = 0; return this.cur }
    if (scene && score >= 0.6) {
      this.seen = scene === this.cand ? this.seen + 1 : 1; this.cand = scene
      if (this.seen >= 2 || score >= 2.2) { this.cur = scene; this.seen = 0; this.miss = 0 }
    } else { this.cand = ''; this.seen = 0 }
    if (this.cur && scene !== this.cur && ++this.miss >= 2) { this.cur = ''; this.miss = 0 }
    return this.cur
  }
  reset() { this.cur = this.cand = ''; this.seen = this.miss = 0 }
}
