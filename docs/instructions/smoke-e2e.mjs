// Smoke test + screenshots for pubre. Run from ../pubre-samples (playwright + sample EPUBs live here):
//   node smoke-e2e.mjs <chromium|webkit> <WxH> [touch]      e.g. node smoke-e2e.mjs webkit 390x844 touch
// Needs the dev server on :5179. Screenshots land in ./shots/<tag>-*.png
import { chromium, webkit } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('shots', { recursive: true })
const [engName = 'chromium', size = '1440x900', touch] = process.argv.slice(2)
const [width, height] = size.split('x').map(Number)
const engine = engName === 'webkit' ? webkit : chromium
const browser = await engine.launch(engine === chromium ? { channel: 'chrome' } : {})
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, hasTouch: !!touch })
const page = await ctx.newPage()
const errs = []
page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/escape its sandboxing/.test(m.text()))) errs.push(m.type() + ': ' + m.text()) })
page.on('pageerror', e => errs.push('pageerror: ' + e.message))
const tag = `${engName}-${size}`
const shot = async (n) => { await page.waitForTimeout(650); await page.screenshot({ path: `shots/${tag}-${n}.png` }) }
const chrome = () => page.evaluate(() => document.querySelector('.reader').classList.add('chrome'))

await page.goto('http://localhost:5179/')
await shot('0-empty')
await page.setInputFiles('input[type=file]', ['Moby-Dick-Or-The-Whale.epub', 'Alices-Adventures-in-Wonderlan.epub', 'pride.epub', 'seatwork.epub'])
await page.waitForSelector('.grid li:nth-child(4)', { timeout: 30000 })
await shot('1-library')
await page.click('.grid .book:has-text("Moby")')
await page.waitForSelector('.running.foot', { timeout: 15000 })
await page.waitForTimeout(1500)
await shot('2-open')
for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(450) }
await chrome(); await shot('3-chrome')
await page.click('button[aria-label="Reading menu"]'); await shot('4-menu')
await page.click('.list button:has-text("Contents")'); await shot('5-contents')
await page.click('nav button:has-text("CHAPTER 3.")'); await page.waitForTimeout(800)
await chrome(); await shot('6-ch3')
await page.click('button[aria-label="Reading menu"]'); await page.waitForTimeout(500)
await page.click('.list button:has-text("Themes")'); await shot('7-themes')
await page.click('.palette:has-text("Gruvbox")'); await page.waitForTimeout(500)
await page.click('.mode:has-text("Focus")'); await page.waitForTimeout(500)
await page.click('.row:has-text("Customize")'); await shot('8-themes-custom')
await page.keyboard.press('Escape'); await page.waitForTimeout(500)
await shot('9-focus-gruvbox')
await page.click('button[aria-label="Close book"]', { force: true }).catch(async () => { await chrome(); await page.click('button[aria-label="Close book"]') })
await shot('10-library-after')
await page.click('.grid .book:has-text("Alice")', { button: 'right' }); await shot('11-context')
await page.click('.menu .danger'); await shot('12-undo')
console.log(tag, errs.join('\n') || 'no console errors')
await browser.close()
