<script lang="ts">
  // A live preview of reading with your settings: the pointer, how far each step goes, your three
  // contrast levels and (optionally) the lenses — playing on a sample line, so every choice is visible.
  import { onMount, untrack } from 'svelte'
  import { pointerBox, type PointerType } from '../lib/pointers.ts'

  let { step = 'word', pointer = 'outline', read = 22, now = 100, ahead = 46, lenses = false, mini = false, wpm = 240 }: {
    step?: 'sentence' | 'phrase' | 'word'; pointer?: PointerType | 'ink'; read?: number; now?: number; ahead?: number
    lenses?: boolean; mini?: boolean; wpm?: number
  } = $props()

  // [word, sentence, kind]  kind: n = a name, h = a rare word
  const FULL: [string, number, string][] = [['Call', 0, ''], ['me', 0, ''], ['Ishmael.', 0, 'n'], ['Some', 1, ''], ['years', 1, ''], ['ago,', 1, ''], ['never', 1, ''], ['mind', 1, ''], ['how', 1, ''], ['long,', 1, ''], ['Ahab', 1, 'n'], ['paced', 1, ''], ['the', 1, ''], ['binnacle.', 1, 'h'], ['The', 2, ''], ['sea', 2, ''], ['was', 2, ''], ['calm.', 2, '']]
  const WORDS = $derived(mini ? FULL.slice(0, 3) : FULL)
  let k = $state(0), box = $state<HTMLDivElement>(), els = $state<HTMLSpanElement[]>([])
  let ptr = $state<[number, number, number, number] | null>(null), typeKey = $state(0)
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

  /** The unit [a, b] starting at k for the step. */
  function unit(i: number): [number, number] {
    if (step === 'word') return [i, i]
    if (step === 'sentence') { const s = WORDS[i][1]; let a = i, b = i; while (a > 0 && WORDS[a - 1][1] === s) a--; while (b + 1 < WORDS.length && WORDS[b + 1][1] === s) b++; return [a, b] }
    let b = i
    while (b + 1 < WORDS.length && b - i < 2 && !/[.,;]$/.test(WORDS[b][0]) && WORDS[b + 1][1] === WORDS[i][1]) b++
    return [i, b]
  }
  const u = $derived(unit(Math.min(k, WORDS.length - 1)))
  function stateAt(i: number) {
    const [a, b] = u, s = WORDS[i][1], cs = WORDS[a][1]
    if (i >= a && i <= b) return 'now'
    if (step === 'sentence') return s < cs ? 'read' : s === cs + 1 ? 'next' : 'later'
    if (s === cs) return i < a ? 'done' : i <= b + 2 ? 'near' : i <= b + 6 ? 'ahead' : 'far'
    return s < cs ? 'read' : 'later'
  }
  const level = (st: string) => ({ now, near: ahead + (now - ahead) * 0.35, ahead, far: ahead * 0.72, next: ahead, later: ahead * 0.6, done: read * 1.35, read }[st] ?? ahead)

  $effect(() => {
    void u; void pointer; void els.length
    if (!box || pointer === 'ink' || step === 'sentence') { ptr = null; return }
    const r0 = els[u[0]]?.getBoundingClientRect(), r1 = els[u[1]]?.getBoundingClientRect(), b0 = box.getBoundingClientRect()
    if (!r0 || !r1) return
    const sameLine = Math.abs(r1.top - r0.top) < 4
    ptr = pointerBox(pointer, r0.left - b0.left, r0.top - b0.top, (sameLine ? r1.right : r0.right) - r0.left, r0.height)
    untrack(() => typeKey++) // restart the Type animation without depending on it
  })
  onMount(() => {
    if (reduce) return
    const tick = () => { const [, b] = unit(k); k = b + 1 >= WORDS.length ? 0 : b + 1; t = window.setTimeout(tick, (step === 'sentence' ? 2200 : 60000 / wpm * (u[1] - u[0] + 1)) + (k === 0 ? 700 : 0)) }
    let t = window.setTimeout(tick, 600)
    return () => clearTimeout(t)
  })
</script>

<div class="rp" class:mini bind:this={box} aria-hidden="true">
  {#if ptr}
    {#key pointer === 'type' ? typeKey : 0}
      <i class="ptr" data-p={pointer} class:typing={pointer === 'type'} style:transform="translate({ptr[0]}px, {ptr[1]}px)" style:width="{ptr[2]}px" style:height="{ptr[3]}px"></i>
    {/key}
  {/if}
  {#each WORDS as [w, , kind], i}<span bind:this={els[i]} class:now={stateAt(i) === 'now'} class:nm={lenses && kind === 'n'} class:hw={lenses && kind === 'h'}
    style:color="color-mix(in srgb, var(--fg) {level(stateAt(i))}%, transparent)">{w}</span>{' '}{/each}
</div>

<style>
  .rp { position: relative; isolation: isolate; font: 18px/1.65 var(--serif); padding: 12px 14px; border-radius: var(--r3); background: var(--bg); box-shadow: inset 0 0 0 1px var(--hairline); text-wrap: pretty; }
  .rp.mini { font-size: 14px; line-height: 1.5; padding: 8px 10px; min-height: 52px; }
  span { transition: color .25s ease; }
  span.now { -webkit-text-stroke: .018em currentColor; }
  span.nm { background: color-mix(in srgb, var(--base0D, var(--accent)) 16%, transparent); border-radius: 3px; color: var(--base0D) !important; }
  span.hw { text-decoration: underline wavy color-mix(in srgb, var(--accent) 80%, transparent) 1.5px; text-underline-offset: 4px; }
  .ptr { position: absolute; left: 0; top: 0; z-index: -1; pointer-events: none; transition: transform .28s cubic-bezier(.22,1,.36,1), width .24s ease, height .24s ease; }
  .ptr.typing { animation: type .42s steps(6, end) both; transform-origin: left; }
  @keyframes type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
</style>
