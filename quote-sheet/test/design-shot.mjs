/* Design screenshot — fills the sheet with sample data and captures the whole page.
   Run:  node test/design-shot.mjs [outfile]
   Needs the server on 127.0.0.1:8788. Throwaway Chrome profile: never touches
   the real quotes in your browser. */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9344;
const URL = 'http://127.0.0.1:8788/';
const OUT = process.argv[2] || 'test/design.png';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-shot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--window-size=1600,1500',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, URL
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
      if (page) return page;
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('no page target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await sleep(1400);

/* Fields addressed by card then position: Customer 0, Job 1, Silks 2. */
const seed = `(async () => {
  const set = (el, v) => {
    if (!el) throw new Error('missing control');
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const cells = (card) => document.querySelectorAll('.card')[card].querySelectorAll('.grid > *');
  const ctl = (card, i, sel) => cells(card)[i].querySelector(sel || 'input,textarea,select');
  const f = (card, i, v) => set(ctl(card, i), v);

  f(0, 0, 'Vincent Feliciano');
  f(0, 1, 'Feliciano Racing Stable');
  f(0, 2, 'vincent@felicianoracing.com');
  f(0, 3, '(516) 555-0142');
  f(0, 4, '42 Rosewood Lane, Elmont, NY 11003');

  f(1, 0, 'Luis Saez');
  f(1, 1, 'M / 32 waist');
  f(1, 2, '2026-11-06');
  const rush = ctl(1, 3, 'input[type=checkbox]');
  rush.checked = true;
  rush.dispatchEvent(new Event('change', { bubbles: true }));

  const colour = (i, hex, name) => {
    const cell = cells(2)[i];
    set(cell.querySelector('input[type=color]'), hex);
    set(cell.querySelector('input[type=text]'), name);
  };
  colour(0, '#1b2a6b', 'royal blue');
  colour(1, '#f2f2f2', 'white');
  colour(2, '#ffd60a', 'yellow');
  f(2, 3, 'hoops, 6 white');
  f(2, 4, 'stock, white');
  f(2, 5, 'yellow band');
  f(2, 6, 'Lightweight nylon');
  f(2, 7, '3');

  const meta = (id, v) => { const el = document.getElementById(id); if (el) set(el, v); };
  meta('metaPreparedBy', 'Crafters Gallery');

  const fillRow = (tr, desc, qty, unit) => {
    const inp = tr.querySelectorAll('input');
    set(inp[0], desc); set(inp[1], String(qty)); set(inp[2], String(unit));
  };
  const rows = () => document.querySelectorAll('#itemRows tr');
  fillRow(rows()[0], 'Jockey silks - full set', 3, 485);
  fillRow(rows()[1], 'Name & number applique', 3, 65);
  document.getElementById('btnAddItem').click();
  await new Promise(r => setTimeout(r, 150));
  if (rows()[2]) fillRow(rows()[2], 'Rush surcharge (2 weeks)', 1, 150);

  meta('discount', '50');
  meta('taxRate', '8.875');
  meta('deposit', '500');

  set(document.getElementById('notes'),
    "Cut to Luis's measurements from last season. Yellow cap to match the stable colours - check the shade against the swatch before cutting.");

  const logAdd = async (text) => {
    set(document.getElementById('logInput'), text);
    document.getElementById('btnAddLog').click();
    await new Promise(r => setTimeout(r, 90));
  };
  await logAdd('Quote requested by phone - 3 sets, rush.');
  await logAdd('Deposit received, $500.');
  set(document.getElementById('status'), 'sent');

  const mk = (hue, label) => new Promise((res) => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 900;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 1200, 900);
    grad.addColorStop(0, 'hsl(' + hue + ',22%,26%)');
    grad.addColorStop(1, 'hsl(' + (hue + 30) + ',18%,12%)');
    g.fillStyle = grad; g.fillRect(0, 0, 1200, 900);
    g.fillStyle = 'rgba(255,255,255,.10)';
    for (let i = 0; i < 9; i++) g.fillRect(0, i * 100, 1200, 26);
    g.fillStyle = '#ffd60a';
    g.fillRect(80, 720, 340, 10);
    g.font = '600 44px Segoe UI, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.86)';
    g.fillText(label, 80, 200);
    c.toBlob((b) => res(new File([b], label + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9);
  });
  const files = [await mk(220, 'Front'), await mk(340, 'Sleeve detail'), await mk(48, 'Cap shade')];
  const dt = new DataTransfer();
  files.forEach(x => dt.items.add(x));
  const fi = document.getElementById('photoFile');
  fi.files = dt.files;
  fi.dispatchEvent(new Event('change', { bubbles: true }));

  for (let i = 0; i < 50; i++) {
    if (document.querySelectorAll('.photo').length >= 3) break;
    await new Promise(r => setTimeout(r, 150));
  }
  await new Promise(r => setTimeout(r, 500));

  return JSON.stringify({
    photos: document.querySelectorAll('.photo').length,
    photoLoaded: [...document.querySelectorAll('.photo img')].filter(i => i.naturalWidth > 0).length,
    rows: document.querySelectorAll('#itemRows tr').length,
    total: document.getElementById('tTotal').textContent,
    balance: document.getElementById('tBalance').textContent,
    name: ctl(0, 0).value,
    log: document.querySelectorAll('.log li').length,
    chips: document.querySelectorAll('.chip').length,
  });
})()`;

const res = await send('Runtime.evaluate', { expression: seed, awaitPromise: true, returnByValue: true });
if (res.exceptionDetails) console.log('SEED ERROR:', res.exceptionDetails.text, res.exceptionDetails.exception?.description);
else console.log('seed:', res.result.value);

const metrics = await send('Page.getLayoutMetrics');
const cs = metrics.cssContentSize || metrics.contentSize;
const H = Math.min(Math.ceil(cs.height), 4200);
await send('Emulation.setDeviceMetricsOverride', {
  width: 1600, height: H, deviceScaleFactor: 1, mobile: false
});
await sleep(500);

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 0, y: 0, width: 1600, height: H, scale: 1 },
  captureBeyondViewport: true
});
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('wrote', OUT, 'height', H);

ws.close();
chrome.kill();
process.exit(0);
