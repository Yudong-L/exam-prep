const { chromium } = require('/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.js')
const fs = require('fs')
const BASE = 'http://localhost:55221/#'
const dir = '/workspace/frontend/shots'
fs.mkdirSync(dir, { recursive: true })
const routes = ['/', '/daily-plan', '/weekly-plan', '/review', '/mistakes', '/settings', '/ai-grading']
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } })
  for (const r of routes) {
    await page.goto(BASE + r, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${dir}/${r.replace(/\//g, '_') || '_home'}.png`, fullPage: true })
    console.log('shot', r)
  }
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
