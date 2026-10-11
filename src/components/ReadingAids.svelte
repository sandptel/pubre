<script lang="ts">
  import type { Settings } from '../lib/settings.ts'

  // Every reading aid, opt-in or out. Used for the global defaults and for one book's overrides.
  let { value = $bindable() }: { value: Settings } = $props()

  type Opt = [string, string]
  const hard = $derived(!value.hardWords ? 'off' : value.hardStyle)
  function setHard(v: string) {
    if (v === 'off') value.hardWords = false
    else { value.hardWords = true; value.hardStyle = v as Settings['hardStyle'] }
  }
</script>

{#snippet choice(label: string, key: keyof Settings, opts: Opt[], hint = '')}
  <div class="line">
    <span>{label}{#if hint}<small>{hint}</small>{/if}</span>
    <div class="segmented" role="radiogroup" aria-label={label}>
      {#each opts as [v, l]}
        <button role="radio" aria-checked={(value as any)[key] === v} class:on={(value as any)[key] === v} onclick={() => ((value as any)[key] = v)}>{l}</button>
      {/each}
    </div>
  </div>
{/snippet}
{#snippet toggle(label: string, key: keyof Settings, hint = '')}
  <label class="line"><span>{label}{#if hint}<small>{hint}</small>{/if}</span><input type="checkbox" role="switch" bind:checked={(value as any)[key]} /></label>
{/snippet}

<h3>Reading guide</h3>
<div class="group">
  {@render toggle('Reading guide', 'guide', 'The round pad, Space or G')}
  {#if value.guide}
    <label class="line"><span>Pace<small>{value.wpm} words a minute · the speed chip by the pad changes it while you read</small></span>
      <input class="pace" type="range" min="120" max="350" step="5" bind:value={value.wpm} aria-label="Words a minute" /></label>
    {@render toggle('Hold the page to read', 'holdToRead', 'Off: holding selects text. In the Stage, long-press a sentence to highlight it')}
    {@render choice('Style', 'guideStyle', [['stage', 'Stage'], ['pointer', 'Pointer']], value.guideStyle === 'stage' ? 'The pad (or Space) lifts the paragraph toward you' : 'A marker moves on the page')}
  {/if}
  {#if value.guide && value.guideStyle === 'stage'}
    {@render choice('Move by', 'stageStep', [['sentence', 'Sentence'], ['phrase', 'Phrase'], ['word', 'Word']], value.stageStep === 'sentence' ? 'A sentence lights up at a time' : 'Words ink in as you go')}
    {#if value.stageStep !== 'sentence'}
      {@render choice('Pointer', 'stagePointer', [['ink', 'Ink'], ['word', 'Word'], ['type', 'Type'], ['underline', 'Line'], ['dot', 'Dot'], ['outline', 'Ring']], value.stagePointer === 'type' ? 'Letters type themselves' : '')}
    {/if}
    {@render toggle('Lenses in Stage', 'stageLenses', 'Names, voices, rare words, your highlights')}
    {@render choice('Paragraph end', 'paraEnd', [['breathe', 'Breathe'], ['wait', 'Wait']], value.paraEnd === 'breathe' ? 'A pause, then the next rises' : 'Waits for a tap')}
    <p class="hint">Tap the round pad (or Space) to start and pause. Hold it to read only while you hold; let go and it goes back to the page. In the Stage, long-press a sentence to keep it as a highlight. While holding, slide right for faster, left for slower and then backwards, up to lock. ← → step, ↑ ↓ paragraph, [ ] pace ({value.wpm} wpm).</p>
  {/if}
  {#if value.guide && value.guideStyle === 'pointer'}
    {@render choice('Pointer', 'pointer', [['word', 'Word'], ['type', 'Type'], ['underline', 'Line'], ['dot', 'Dot'], ['outline', 'Ring']], value.pointer === 'type' ? 'Letters type themselves' : '')}
    {@render choice('Focus', 'focus', [['sentence', 'Sentence'], ['line', 'Line'], ['paragraph', 'Para']])}
    {@render choice('Step', 'step', [['word', 'Word'], ['phrase', 'Phrase']])}
    {@render toggle('Dim what you’ve read', 'dimRead')}
    <p class="hint">Tap the round pad (or Space) to start and pause; double-tap for the start of the sentence. Hold to glide only while held; slide while holding to change speed, up to lock. → steps (and teaches your pace, {value.wpm} wpm).</p>
  {/if}
</div>

<h3>Lenses</h3>
<div class="group">
  {@render choice('Intensity', 'intensity', [['quiet', 'Quiet'], ['guided', 'Guided'], ['rich', 'Rich']], 'How many marks a page may carry')}
  {#if value.intensity !== 'quiet'}
    {@render toggle('Names', 'names', 'Main characters in their colour')}
    <div class="line">
      <span>Hard words<small>{hard === 'story' ? 'Nothing shown until you rest on a word' : 'A few rare words, underlined'}</small></span>
      <div class="segmented" role="radiogroup" aria-label="Hard words">
        {#each [['shown', 'Shown'], ['story', 'Story'], ['off', 'Off']] as [v, l]}
          <button role="radio" aria-checked={hard === v} class:on={hard === v} onclick={() => setHard(v)}>{l}</button>
        {/each}
      </div>
    </div>
    {@render choice('Voices', 'voices', [['ink', 'Ink'], ['underline', 'Line'], ['marks', 'Marks'], ['off', 'Off']], 'Dialogue in the speaker’s colour')}
    {@render toggle('Chapter openers', 'openers', 'Each chapter opens into its own room')}
    {@render toggle('Chapter colour', 'chapterColour', 'A colourful chapter tints the accent as you enter it')}
    {@render toggle('Asides', 'asides', 'Parentheses and dashes, a step quieter')}
    {@render toggle('Foreign phrases', 'foreign')}
  {/if}
</div>

<h3>Comfort</h3>
<div class="group">
  {@render toggle('Keep controls on screen', 'pinControls', 'Or tap the pin at the top right')}
  {@render toggle('Chapter-end prompts', 'chapterPrompts', '“Three words”, and your open questions')}
  {@render choice('Motion', 'motion', [['full', 'Full'], ['calm', 'Calm']], 'Calm turns off glows and sparks')}
  <div class="line">
    <span>Letter spacing</span>
    <div class="segmented" role="radiogroup" aria-label="Letter spacing">
      {#each [[0, 'Normal'], [0.04, 'Wider'], [0.08, 'Wide']] as [v, l]}
        <button role="radio" aria-checked={value.letterSpacing === v} class:on={value.letterSpacing === v} onclick={() => (value.letterSpacing = v as number)}>{l}</button>
      {/each}
    </div>
  </div>
  <label class="line"><span>Short lines<small>About 40 characters per line</small></span>
    <input type="checkbox" role="switch" checked={value.measure === 'short'} onchange={e => (value.measure = e.currentTarget.checked ? 'short' : 'normal')} /></label>
</div>

<style>
  h3 { font: 600 11px var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin: var(--s5) 0 var(--s2); }
  h3:first-child { margin-top: var(--s1); }
  /* outlined panels, not filled: the glass shows through */
  .group { border-radius: var(--r4); background: color-mix(in srgb, var(--bg) 18%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 16%, transparent); padding: 0 var(--s4); }
  .line { display: flex; align-items: center; gap: var(--s3); min-height: 52px; font-size: 13.5px; text-transform: uppercase; letter-spacing: .02em; }
  .line small { text-transform: none; letter-spacing: 0; }
  .line + .line, .line + .hint { border-top: .5px solid var(--hairline); }
  .line > span:first-child { flex: 1; display: grid; }
  small { font-size: 12px; color: var(--muted); }
  .hint { font-size: 12px; color: var(--muted); margin: 0; padding: var(--s2) 0 var(--s3); line-height: 1.45; }
  .pace { width: 38%; flex: none; accent-color: var(--accent); }
  /* Phones: a choice sits under its label, full width, instead of squeezing the label into a column. */
  @media (max-width: 460px) {
    .line:has(.segmented), .line:has(.pace) { flex-wrap: wrap; row-gap: var(--s2); padding: var(--s3) 0; }
    .line:has(.segmented) > span:first-child, .line:has(.pace) > span:first-child { flex-basis: 100%; }
    .line .segmented { width: 100%; }
    .line .segmented button { flex: 1; }
    .line .pace { width: 100%; }
  }
  .segmented { display: flex; background: transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 18%, transparent); border-radius: 999px; padding: 3px; flex: none; }
  .segmented button { border: 0; background: transparent; border-radius: 7px; padding: 5px 9px; min-height: 36px; font-size: 13px; transition: background-color .25s var(--ease); }
  .segmented button { border-radius: 999px; font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .segmented .on { background: var(--ink); color: var(--on-ink); font-weight: 600; }
  input[role=switch] {
    appearance: none; flex: none; width: 64px; height: 30px; border-radius: 15px; margin: 0; position: relative; cursor: pointer;
    background: transparent; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--fg) 45%, transparent); transition: background-color .25s;
  }
  input[role=switch]::before {
    content: 'OFF'; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%;
    background: var(--fg); transition: transform .3s var(--spring); font: 600 9px/24px var(--mono); text-indent: 28px; color: var(--fg); letter-spacing: .06em;
  }
  input[role=switch]:checked { background: var(--ink); box-shadow: none; }
  input[role=switch]:checked::before { content: 'ON'; transform: translateX(34px); background: var(--on-ink); color: var(--on-ink); text-indent: -24px; }
</style>
