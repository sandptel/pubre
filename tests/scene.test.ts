import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sceneOf, SceneTrack } from '../src/insights/scene.ts'

test('a passage’s scene: literal weather counts, figures of speech and negations do not', () => {
  assert.equal(sceneOf('The rain came down all night on the roof; the gutters ran and the street was wet and grey.').scene, 'rain')
  assert.equal(sceneOf('Snow had fallen in the night, and the yard lay white and frozen under the drifts.').scene, 'snow')
  assert.equal(sceneOf('He was greeted with a storm of applause and a sea of faces; she gave him a dark look.').scene, '')
  assert.equal(sceneOf('There was not a cloud and no wind at all as they talked in the parlour about the letter.').scene, '')
  assert.equal(sceneOf('The ship rose on the long swell; spray broke over the deck and the waves ran white to the shore.').scene, 'sea')
})

test('the scene holds two pages before it shows, and leaves after two pages without it', () => {
  const t = new SceneTrack()
  assert.equal(t.next('rain', 1), '')
  assert.equal(t.next('rain', 1), 'rain')
  assert.equal(t.next('', 0), 'rain')
  assert.equal(t.next('', 0), '')
  assert.equal(t.next('storm', 3), 'storm', 'a strong scene shows at once')
})
