<script lang="ts">
  // A picture looked at closely (P5): it grows out of the page from where it sat. Pinch or double-tap to
  // zoom, drag to look around; swipe down, tap or Escape to put it back where it came from.
  import { onMount } from 'svelte'

  let { src, from, onclose }: { src: string; from: { x: number; y: number; w: number; h: number }; onclose: () => void } = $props()
  let img = $state<HTMLImageElement>(), back = $state<HTMLDivElement>()
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  let s = 1, tx = 0, ty = 0, closing = false
  const apply = () => { if (img) img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})` }

  function flip(dir: 'normal' | 'reverse') {
    if (!img || !back) return Promise.resolve()
    const r = img.getBoundingClientRect(), k = from.w / Math.max(1, r.width)
    const dx = from.x + from.w / 2 - (r.left + r.width / 2), dy = from.y + from.h / 2 - (r.top + r.height / 2)
    const ms = reduce ? 0 : dir === 'normal' ? 420 : 320
    back.animate([{ backgroundColor: 'rgba(12,12,12,0)' }, { backgroundColor: 'rgba(12,12,12,.94)' }], { duration: ms, direction: dir, fill: 'both' })
    return img.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: `translate(${tx}px, ${ty}px) scale(${s})` }],
      { duration: ms, easing: 'cubic-bezier(.2,.8,.2,1)', direction: dir, fill: 'both' }).finished
  }
  onMount(() => {
    back?.focus() // keys come here, not to the book behind
    img?.decode().catch(() => {}).then(() => { flip('normal') })
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close() } }
    window.addEventListener('keydown', key, true) // before the reader's own keys
    return () => window.removeEventListener('keydown', key, true)
  })
  async function close() {
    if (closing) return
    closing = true; s = 1; tx = 0; ty = 0; apply()
    await flip('reverse'); onclose()
  }

  const pts = new Map<number, { x: number; y: number }>()
  let pinch: { d: number; s: number } | null = null, down = { x: 0, y: 0, t: 0 }, lastTap = 0, tapT = 0
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }
  function pdown(e: PointerEvent) {
    back?.setPointerCapture(e.pointerId)
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.size === 2) pinch = { d: dist(), s }
    if (pts.size === 1) down = { x: e.clientX, y: e.clientY, t: Date.now() }
  }
  function pmove(e: PointerEvent) {
    const p = pts.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    p.x = e.clientX; p.y = e.clientY
    if (pts.size === 2 && pinch) { s = Math.min(5, Math.max(1, pinch.s * dist() / pinch.d)); if (s === 1) { tx = 0; ty = 0 } }
    else if (s > 1) { tx += dx; ty += dy }
    else { ty += dy; if (back) back.style.backgroundColor = `rgba(12,12,12,${0.94 * Math.max(0.2, 1 - Math.abs(ty) / 360)})` } // swipe to put it back
    apply()
  }
  function pup(e: PointerEvent) {
    pts.delete(e.pointerId)
    if (pts.size) return
    pinch = null
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), quick = Date.now() - down.t < 260
    if (s === 1 && Math.abs(ty) > 90) { close(); return }
    if (s === 1) { ty = 0; if (back) back.style.backgroundColor = ''; apply() }
    if (moved < 8 && quick) {
      const now = Date.now()
      if (now - lastTap < 300) { clearTimeout(tapT); lastTap = 0; s = s > 1 ? 1 : 2.5; tx = 0; ty = 0; img?.animate([{ transform: img.style.transform }, { transform: `scale(${s})` }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }); apply() }
      else { lastTap = now; tapT = window.setTimeout(() => { if (s === 1) close() }, 300) }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="zoom" bind:this={back} role="dialog" aria-modal="true" aria-label="Picture" tabindex="-1"
  onpointerdown={pdown} onpointermove={pmove} onpointerup={pup} onpointercancel={pup}>
  <img bind:this={img} {src} alt="" draggable="false" />
  <button class="x" aria-label="Close" onpointerdown={e => e.stopPropagation()} onclick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></button>
</div>

<style>
  .zoom { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: rgba(12, 12, 12, .94); touch-action: none; overflow: hidden; }
  img { max-width: 100vw; max-height: 100dvh; object-fit: contain; transform-origin: center; user-select: none; -webkit-user-select: none; }
  .x { position: absolute; top: calc(env(safe-area-inset-top) + 12px); right: calc(env(safe-area-inset-right) + 12px); width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .12); color: #fff; display: grid; place-items: center; }
  .x svg { width: 20px; height: 20px; }
</style>
