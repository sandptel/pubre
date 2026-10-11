(() => {
const $ = id => document.getElementById(id)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const D = ms => (reduce ? 1 : ms)
// Highlight meanings: base16 slot → W3C annotation colour → default name.
const MEAN = window.PUBRE_MEANINGS = [['0A', 'Key', 'yellow'], ['0B', 'Beautiful', 'green'], ['0D', 'Idea', 'blue'], ['08', 'Feeling', 'pink'], ['09', 'Question', 'orange'], ['0E', 'Revisit', 'purple']]
$('washes').innerHTML = MEAN.map(([c, n]) => `<span class="wash" style="background:color-mix(in srgb,var(--b${c}) 28%,transparent)">${n}</span>`).join('')
$('legend6').innerHTML = MEAN.map(([c, n, w]) => `<span><i style="background:color-mix(in srgb,var(--b${c}) 40%,transparent)"></i>${n} <small style="color:var(--muted)">${w}</small></span>`).join('')

// Shared motion verbs (also used by the guide demo).
const spark = window.PUBRE_SPARK = (fromRect, toRect, color) => {
  if (reduce) return Promise.resolve()
  const s = document.createElement('i'); s.className = 'spark'; s.style.position = 'fixed'; s.style.background = color; s.style.boxShadow = `0 0 10px ${color}`
  s.style.left = '0'; s.style.top = '0'; document.body.append(s)
  const fx = fromRect.left + fromRect.width / 2, fy = fromRect.top, tx = toRect.left + toRect.width / 2, ty = toRect.top + toRect.height / 2
  return s.animate([{ transform: `translate(${fx}px,${fy}px) scale(.5)` }, { transform: `translate(${(fx + tx) / 2}px,${Math.min(fy, ty) - 40}px) scale(1.3)` }, { transform: `translate(${tx}px,${ty}px) scale(.6)`, opacity: .3 }], { duration: 720, easing: 'cubic-bezier(.3,.6,.3,1)' }).finished.then(() => s.remove())
}
const play = {
  bloom(row) {
    const sp = [...row.querySelectorAll('.sp')]
    sp.forEach((el, k) => el.animate([{ textShadow: '0 0 0 transparent' }, { textShadow: `0 0 12px ${getComputedStyle(el).color}` }, { textShadow: '0 0 0 transparent' }], { duration: D(800), delay: k * 220, easing: 'ease-out' }))
    spark(sp[0].getBoundingClientRect(), row.querySelector('.verb').getBoundingClientRect(), getComputedStyle(sp[0]).color)
  },
  draw(row) {
    row.querySelectorAll('.sp').forEach((el, k) => { const c = getComputedStyle(el).textDecorationColor; el.animate([{ textDecorationColor: 'transparent' }, { textDecorationColor: c }], { duration: D(500), delay: k * 260, easing: 'ease-out', fill: 'backwards' }) })
    const first = row.querySelector('.sp'), r = first.getBoundingClientRect(), card = document.createElement('div')
    card.className = 'tip glassy peek'; card.style.position = 'fixed'; card.innerHTML = '<b>spleen</b>: bad temper or low spirits'
    document.body.append(card); card.style.left = r.left + 'px'; card.style.top = r.top - card.offsetHeight - 8 + 'px'
    setTimeout(() => card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).finished.then(() => card.remove()), D(1600))
  },
  breathe(row) { row.querySelectorAll('.wash').forEach((el, k) => el.animate([{ transform: 'none', filter: 'none' }, { transform: 'scale(1.06)', filter: 'saturate(1.8) brightness(1.04)' }, { transform: 'none', filter: 'none' }], { duration: D(700), delay: k * 120, easing: 'ease-in-out' })) },
  glide(row) { // "hop": a whole-word block springs from word to word
    const grp = row.querySelector('.sp-glide'), words = [...grp.children], base = grp.getBoundingClientRect()
    grp.style.position = 'relative'; grp.style.isolation = 'isolate'
    const blk = document.createElement('i'); blk.style.cssText = 'position:absolute;left:0;top:-1px;z-index:-1;border-radius:6px;background:color-mix(in srgb,var(--accent) 22%,transparent)'
    grp.append(blk)
    const at = w => { const r = w.getBoundingClientRect(); return { transform: `translateX(${r.left - base.left - 3}px)`, width: r.width + 6 + 'px', height: r.height + 2 + 'px' } }
    Object.assign(blk.style, at(words[0]))
    let k = 0
    const hop = () => { k++; if (k >= words.length) return setTimeout(() => blk.remove(), 700)
      const [f, t] = [at(words[k - 1]), at(words[k])] // position: gentle settle; size: monotonic ease, no overshoot
      blk.animate([{ transform: f.transform }, { transform: t.transform }], { duration: D(300), easing: 'cubic-bezier(.22,1.12,.36,1)', fill: 'forwards' })
      blk.animate([{ width: f.width, height: f.height }, { width: t.width, height: t.height }], { duration: D(255), easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'forwards' })
      setTimeout(hop, D(520)) }
    setTimeout(hop, D(300))
  },
  settle(row) { [...row.querySelectorAll('.lv')].forEach((el, k) => el.animate([{ color: 'var(--fg)' }, { color: getComputedStyle(el).color }], { duration: D(500), delay: k * 160, easing: 'ease-out', fill: 'backwards' })) },
  spark(row) { const t = row.querySelector('.sp-margin span'), d = row.querySelector('.mdot'); d.style.opacity = 0; spark(t.getBoundingClientRect(), d.getBoundingClientRect(), getComputedStyle(d).backgroundColor).then(() => { d.style.opacity = 1; d.animate([{ transform: 'scale(2.2)' }, { transform: 'scale(1)' }], { duration: D(450), easing: 'cubic-bezier(.3,1.6,.5,1)' }) }) },
}
$('gram').addEventListener('click', e => { const b = e.target.closest('button.verb'); if (!b) return; const row = b.closest('.gr'); play[row.dataset.verb]?.(row) })
})()
