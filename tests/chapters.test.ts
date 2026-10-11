import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chapterFor, chapters, fingerprint, openerOf, profile, weatherOf } from '../src/insights/chapters.ts'

const html = `<html><body><p>Front matter.</p>
<h2>CHAPTER 1. Loomings.</h2><p>Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, I thought I would sail about a little.</p>
<h2>CHAPTER 36. The Quarter-Deck.</h2><p>“What do ye do when ye see a whale, men?” “Sing out for him!” “Good! and what do ye do next, men?” “Lower away, and after him!”</p>
</body></html>`

test('chapters: split at headings, titled, profiled', () => {
  const cs = chapters(3, html)
  assert.deepEqual(cs.map(c => c.title), ['CHAPTER 1. Loomings.', 'CHAPTER 36. The Quarter-Deck.'])
  assert.ok(cs.every(c => c.spine === 3 && c.lens.length && c.words))
  assert.ok(cs[1].talk > 0.6, 'the quarter-deck is mostly spoken')
  assert.ok(cs[0].talk < 0.1)
})

test('profile: mood leans dark or bright', () => {
  assert.ok(profile('The night was dark and cold; death and gloom and storm and shadow.').mood < -0.3)
  assert.ok(profile('A bright warm morning, sun and laughter, joy and delight and sweet summer.').mood > 0.3)
})

test('openers: the room each chapter opens into', () => {
  assert.equal(openerOf({ talk: 0.6, mood: 0, avg: 12, words: 500 }), 'stage')
  assert.equal(openerOf({ talk: 0.1, mood: -0.5, avg: 20, words: 500 }), 'nocturne')
  assert.equal(openerOf({ talk: 0.1, mood: 0.5, avg: 20, words: 500 }), 'daylight')
  assert.equal(openerOf({ talk: 0.1, mood: 0, avg: 40, words: 500 }), 'swell')
  assert.equal(openerOf({ talk: 0.1, mood: 0, avg: 20, words: 500 }), 'classic')
  assert.equal(openerOf({ talk: 0.9, mood: 0, avg: 5, words: 40 }), 'classic', 'too short to judge')
})

test('fingerprint: a path that turns right after each sentence, inside the box', () => {
  const d = fingerprint([10, 5, 10, 5], 24)
  assert.match(d, /^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+){4}$/)
  const nums = d.match(/[\d.]+/g)!.map(Number)
  assert.ok(nums.every(n => n >= 0 && n <= 24))
  assert.equal(fingerprint([]), '')
})

test('chapterFor matches TOC labels loosely, else by spine', () => {
  const cs = chapters(3, html)
  assert.equal(chapterFor(cs, 'Chapter 36. The Quarter-Deck')?.title, 'CHAPTER 36. The Quarter-Deck.')
  assert.equal(chapterFor(cs, 'Nope', 3)?.spine, 3)
})

test('weather: a chapter set in a storm, in fog, or none', () => {
  assert.equal(weatherOf('The storm broke; thunder, rain and gale, the squall again. Storm! Rain.', 100), 'storm')
  assert.equal(weatherOf('Fog, mist and haze; the fog lay thick in the mist, misty haze.', 100), 'fog')
  assert.equal(weatherOf('A quiet day at the inn.', 100), '')
})
