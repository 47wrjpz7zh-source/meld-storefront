// Verify a DEPLOYED MELD site (preview or prod) in a real browser on the real
// edge, so the strict CSP in vercel.json is actually enforced during the run.
// Usage: node verify-deploy.mjs https://base-url
//
// Two things that are easy to get wrong and silently produce fake results:
//  1. The CTAs are NOT anchors. They are buttons with fixed IDs that navigate
//     via JS, so an `a[href*="/cart/"]` selector matches zero of them and every
//     assertion built on it passes vacuously at 0 of 0.
//  2. The checkout navigation must be cancelled with a 204. Fulfilling it with a
//     200 and a body navigates the document away, so clicks 2-5 land on a blank
//     page. And connect.facebook.net must be stubbed empty, or the real
//     fbevents.js drains window.fbq.queue and every event count reads 0.
import { chromium } from '/Users/danielcalderon-lameda/.claude/mcp-servers/playwright-mcp/node_modules/playwright/index.mjs';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const BASE = process.argv[2].replace(/\/$/, '');
const SUBPAGES = ['/meld-vs-hairo', '/toppik-alternative', '/hairo-alternative',
  '/hair-density-filler-for-men', '/hairline-powder-for-men'];
const CTA_IDS = ['railCta', 'stickyCta', 'inlineCta1', 'inlineCta2', 'finalCta'];

const shellRoot = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const shellDir = fs.readdirSync(shellRoot).filter(d => d.startsWith('chromium_headless_shell-')).sort().pop();
const browser = await chromium.launch({
  executablePath: path.join(shellRoot, shellDir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell') });

const results = [];
const assert = (n, c, d = '') => results.push({ n, pass: !!c, d: String(d).slice(0, 170) });

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  const errs = [], csp = [], shopUrls = [], pixelStatus = [];
  page.on('console', m => {
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) csp.push(t);
    else if (m.type() === 'error') errs.push(t);
  });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.url().includes('meta-pixel.js')) pixelStatus.push(r.status()); });
  await page.route('**connect.facebook.net/**', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('**shop.meldhair.com/**', r => {
    shopUrls.push(r.request().url());
    r.fulfill({ status: 204, body: '' });          // cancels nav, keeps the document alive
  });
  return { ctx, page, errs, csp, shopUrls, pixelStatus };
}
const queued = page => page.evaluate(() =>
  (window.fbq && window.fbq.queue ? Array.from(window.fbq.queue) : []).map(a => a[1]));

const idlePopupCheck = page => page.evaluate(() => {
  const ov = document.querySelector('.meld-eip-overlay');
  if (!ov) return { overlay: false, blocked: [] };
  return { overlay: true, pe: getComputedStyle(ov).pointerEvents,
    blocked: [...document.querySelectorAll('[data-meld-checkout], button, a')].map(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.top < 0 || r.top > window.innerHeight - 5) return null;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return (hit && hit.closest('.meld-eip-overlay') && hit !== el && !el.contains(hit))
        ? (el.textContent || el.id || '?').trim().slice(0, 25) : null;
    }).filter(Boolean) };
});

// ---------- Sub-pages: 5 fixed CTA IDs each ----------
for (const p of SUBPAGES) {
  const { ctx, page, errs, csp, shopUrls, pixelStatus } = await newPage();
  const resp = await page.goto(BASE + p, { waitUntil: 'load' });
  assert(`${p} loads 200`, resp && resp.status() === 200, resp ? resp.status() : 'no response');
  await page.waitForTimeout(700);

  assert(`${p} meta-pixel.js served`, pixelStatus[0] === 200, `HTTP ${pixelStatus[0]}`);
  const onLoad = await queued(page);
  assert(`${p} PageView + ViewContent on load`,
    onLoad.includes('PageView') && onLoad.includes('ViewContent'), onLoad.join(', '));
  const hooked = await page.evaluate(() => document.querySelectorAll('[data-meld-checkout]').length);
  assert(`${p} 5 CTAs hooked`, hooked === 5, `${hooked}/5`);

  const idle = await idlePopupCheck(page);
  assert(`${p} idle popup blocks no CTA`, idle.blocked.length === 0,
    idle.overlay ? `pe=${idle.pe} blocked=[${idle.blocked.join(', ')}]` : 'popup not on this page');

  for (const id of CTA_IDS) {
    await page.evaluate(i => { const e = document.getElementById(i); if (e) e.click(); }, id);
    await page.waitForTimeout(150);
  }
  const ic = (await queued(page)).filter(e => e === 'InitiateCheckout').length;
  assert(`${p} InitiateCheckout on all 5 CTAs`, ic === 5, `${ic}/5`);
  const withParam = shopUrls.filter(u => u.includes('skip_shop_pay=true')).length;
  assert(`${p} all 5 checkout URLs skip Shop Pay`, shopUrls.length === 5 && withParam === 5,
    `${withParam}/${shopUrls.length}; sample ${shopUrls[0] || 'none'}`);

  assert(`${p} no CSP violations`, csp.length === 0, csp.slice(0, 2).join(' | '));
  assert(`${p} no JS errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------- Homepage: cart drawer, plus the popup ----------
{
  const { ctx, page, errs, csp, shopUrls, pixelStatus } = await newPage();
  const resp = await page.goto(BASE + '/', { waitUntil: 'load' });
  assert('/ loads 200', resp && resp.status() === 200, resp ? resp.status() : 'no response');
  await page.waitForTimeout(900);

  assert('/ meta-pixel.js served', pixelStatus[0] === 200, `HTTP ${pixelStatus[0]}`);
  const onLoad = await queued(page);
  assert('/ PageView + ViewContent on load',
    onLoad.includes('PageView') && onLoad.includes('ViewContent'), onLoad.join(', '));

  // THE regression that matters: the idle popup must not eat clicks on the buy buttons.
  const idle = await idlePopupCheck(page);
  assert('/ popup present but click-through when idle',
    idle.overlay && idle.pe === 'none' && idle.blocked.length === 0,
    `overlay=${idle.overlay} pe=${idle.pe} blocked=[${idle.blocked.join(', ')}]`);

  // The buy path still works. The homepage does NOT use the sub-page CTA IDs:
  // #ctaBtn opens the .meld-cart drawer, and .meld-cart-go is the checkout button.
  await page.evaluate(() => document.getElementById('ctaBtn')?.click());
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => !!document.querySelector('.meld-cart.open'));
  assert('/ cart drawer opens', opened, `drawerOpen=${opened}`);
  await page.evaluate(() => document.querySelector('.meld-cart-go')?.click());
  await page.waitForTimeout(500);
  const ic = (await queued(page)).filter(e => e === 'InitiateCheckout').length;
  assert('/ InitiateCheckout fires from the buy path', ic >= 1, `${ic} event(s), drawerOpen=${opened}`);
  assert('/ checkout URL skips Shop Pay',
    shopUrls.length >= 1 && shopUrls.every(u => u.includes('skip_shop_pay=true')),
    shopUrls[0] || 'none captured');

  assert('/ no CSP violations', csp.length === 0, csp.slice(0, 2).join(' | '));
  assert('/ no JS errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------- Homepage popup actually hands out MELD10 ----------
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.dispatchEvent(
    new MouseEvent('mouseout', { clientY: 0, bubbles: true, relatedTarget: null })));
  await page.waitForTimeout(600);
  assert('popup opens on exit intent', await page.evaluate(
    () => !!document.querySelector('.meld-eip-overlay.open')));
  assert('open popup does receive clicks', await page.evaluate(
    () => getComputedStyle(document.querySelector('.meld-eip-overlay')).pointerEvents === 'auto'));
  await page.fill('.meld-eip-input', 'deploy-check@example.com');
  await page.click('.meld-eip-btn');
  await page.waitForTimeout(600);
  const code = await page.evaluate(() => {
    const e = document.querySelector('.meld-eip-code'); return e ? e.textContent.trim() : null; });
  assert('popup reveals MELD10', code === 'MELD10', `got ${code}`);
  await ctx.close();
}

await browser.close();
let failed = 0;
for (const r of results) { if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.n}${r.d ? '  [' + r.d + ']' : ''}`); }
console.log(`\n${results.length - failed}/${results.length} passed  (${BASE})`);
process.exit(failed ? 1 : 0);
