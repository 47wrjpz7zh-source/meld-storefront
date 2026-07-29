/* Browser test for exit-intent-popup.js -- run: node exit-intent-popup.test.mjs
   Serves this directory over http (Playwright blocks file://) and drives the
   real popup in headless Chromium.

   The two assertions that matter most are the click-through pair. The overlay
   is built on DOMContentLoaded and sits full-viewport at z-index 9998; opacity:0
   hides it but does NOT stop it receiving clicks. Before the 2026-07-29 fix it
   swallowed every click on the homepage, both buy buttons included. Those two
   assertions were confirmed to FAIL against the pre-fix stylesheet (10/12) and
   pass after it (12/12), so they test the bug and not just the happy path.
   Exits non-zero on any failure. */
import { chromium } from '/Users/danielcalderon-lameda/.claude/mcp-servers/playwright-mcp/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = '/Users/danielcalderon-lameda/Projects/hair-product/site/vercel';
const PORT = 8912;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('nf');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const results = [];
const assert = (name, cond, detail = '') =>
  results.push({ name, pass: !!cond, detail: String(detail).slice(0, 160) });

const shellRoot = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const shellDir = fs.readdirSync(shellRoot).filter(d => d.startsWith('chromium_headless_shell-')).sort().pop();
const executablePath = path.join(shellRoot, shellDir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
const browser = await chromium.launch({ executablePath });
try {
  // --- Desktop: exit-intent trigger (mouse leaves via the top edge) ---
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  assert('popup script loaded', await page.evaluate(
    () => !!document.querySelector('script[src*="exit-intent-popup"]')));
  assert('popup not open before trigger', await page.evaluate(
    () => !document.querySelector('.meld-eip-overlay.open')));

  // REGRESSION GUARD (2026-07-29). The overlay is built on DOMContentLoaded and
  // sits full-viewport at z-index 9998. opacity:0 hides it but does not stop it
  // receiving clicks, so before the pointer-events fix it swallowed every click
  // on the page including both buy buttons. These two assertions fail against
  // the pre-fix stylesheet.
  const preTrigger = await page.evaluate(() => {
    const ov = document.querySelector('.meld-eip-overlay');
    const blocked = [...document.querySelectorAll('a[href*="/cart/"], [data-meld-checkout], button')]
      .map(el => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.top < 0 || r.top > window.innerHeight - 5) return null;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return (hit !== el && !el.contains(hit) && hit && hit.closest('.meld-eip-overlay'))
          ? (el.textContent || el.className || '?').trim().slice(0, 30) : null;
      })
      .filter(Boolean);
    return {
      pointerEvents: ov ? getComputedStyle(ov).pointerEvents : 'no-overlay',
      blocked,
    };
  });
  assert('overlay is click-through before trigger',
    preTrigger.pointerEvents === 'none' || preTrigger.pointerEvents === 'no-overlay',
    `pointer-events: ${preTrigger.pointerEvents}`);
  assert('no page CTA is blocked by the idle overlay',
    preTrigger.blocked.length === 0,
    preTrigger.blocked.join(' | '));

  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mouseout', {
      clientY: 0, bubbles: true, relatedTarget: null }));
  });
  await page.waitForTimeout(500);

  assert('overlay appears on exit intent', await page.evaluate(
    () => !!document.querySelector('.meld-eip-overlay.open')));
  // The click-through fix must not make the open modal itself unclickable.
  assert('open overlay does receive clicks', await page.evaluate(
    () => getComputedStyle(document.querySelector('.meld-eip-overlay')).pointerEvents === 'auto'));
  assert('step 1 (email capture) shown first', await page.evaluate(() => {
    const s1 = document.querySelector('.meld-eip-step1');
    const s2 = document.querySelector('.meld-eip-step2');
    return s1 && s2 && getComputedStyle(s2).display === 'none';
  }));

  // Reveal path: submit a valid email, confirm the code shown is MELD10.
  await page.fill('.meld-eip-input', 'harness-check@example.com');
  await page.click('.meld-eip-btn');
  await page.waitForTimeout(400);

  const code = await page.evaluate(() => {
    const el = document.querySelector('.meld-eip-code');
    return el ? el.textContent.trim() : null;
  });
  assert('revealed code is exactly MELD10', code === 'MELD10', `got: ${code}`);
  assert('step 2 visible after submit', await page.evaluate(
    () => getComputedStyle(document.querySelector('.meld-eip-step2')).display !== 'none'));

  // Bad email must be rejected without revealing the code.
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseout', {
    clientY: 0, bubbles: true, relatedTarget: null })));
  await page.waitForTimeout(400);
  await page.fill('.meld-eip-input', 'not-an-email');
  await page.click('.meld-eip-btn');
  await page.waitForTimeout(300);
  assert('invalid email does not reveal the code', await page.evaluate(
    () => getComputedStyle(document.querySelector('.meld-eip-step2')).display === 'none'));

  // Frequency cap: after converting, it must not show again.
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('meld_exit_popup_converted', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseout', {
    clientY: 0, bubbles: true, relatedTarget: null })));
  await page.waitForTimeout(400);
  assert('suppressed for a converted visitor', await page.evaluate(
    () => !document.querySelector('.meld-eip-overlay')));

  assert('no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
