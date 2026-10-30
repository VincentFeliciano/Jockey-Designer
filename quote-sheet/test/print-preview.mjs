/* Print preview — renders the printable document as the printer sees it.
   Run: node test/print-preview.mjs [outfile]   (server on 127.0.0.1:8788) */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9366;
const OUT = process.argv[2] || 'test/print-screen.png';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-print-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--window-size=1400,1800',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  'http://127.0.0.1:8788/'
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no page target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
await send('Page.enable');
await send('Runtime.enable');
await sleep(1400);

const seed = `(async () => {
  const set = (el, v) => { el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true })); };
  const cells = (c) => document.querySelectorAll('.card')[c].querySelectorAll('.grid > *');
  const ctl = (c, i, s) => cells(c)[i].querySelector(s || 'input,textarea,select');
  const f = (c, i, v) => set(ctl(c, i), v);

  f(0, 0, 'Vincent Feliciano');
  f(0, 1, 'Feliciano Racing Stable');
  f(0, 2, 'vincent@felicianoracing.com');
  f(0, 3, '(516) 555-0142');
  f(0, 4, '42 Rosewood Lane, Elmont, NY 11003');
  f(1, 0, 'Luis Saez');
  f(1, 1, 'M / 32 waist');
  f(1, 2, '2026-11-06');
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

  const rows = () => document.querySelectorAll('#itemRows tr');
  const fillRow = (tr, d, q, u) => { const i = tr.querySelectorAll('input');
    set(i[0], d); set(i[1], String(q)); set(i[2], String(u)); };
  fillRow(rows()[0], 'Jockey silks - full set', 3, 485);
  fillRow(rows()[1], 'Name & number applique', 3, 65);
  document.getElementById('btnAddItem').click();
  await new Promise(r => setTimeout(r, 150));
  if (rows()[2]) fillRow(rows()[2], 'Rush surcharge (2 weeks)', 1, 150);

  set(document.getElementById('discount'), '50');
  set(document.getElementById('taxRate'), '8.875');
  set(document.getElementById('deposit'), '500');
  set(document.getElementById('notes'),
    "Cut to Luis's measurements from last season. Yellow cap to match the stable colours.");
  set(document.getElementById('logInput'), 'Deposit received, $500.');
  document.getElementById('btnAddLog').click();

  const mk = (hue, label) => new Promise((res) => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 1200, 900);
    grad.addColorStop(0, 'hsl(' + hue + ',22%,26%)');
    grad.addColorStop(1, 'hsl(' + (hue + 30) + ',18%,12%)');
    g.fillStyle = grad; g.fillRect(0, 0, 1200, 900);
    g.fillStyle = '#ffd60a'; g.fillRect(80, 720, 340, 10);
    g.font = '600 44px Segoe UI, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.86)'; g.fillText(label, 80, 200);
    c.toBlob((b) => res(new File([b], label + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9);
  });
  const dt = new DataTransfer();
  dt.items.add(await mk(220, 'Front'));
  dt.items.add(await mk(48, 'Cap shade'));
  const fi = document.getElementById('photoFile');
  fi.files = dt.files;
  fi.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; i < 40; i++) {
    if (document.querySelectorAll('.photo').length >= 2) break;
    await new Promise(r => setTimeout(r, 150));
  }
  await new Promise(r => setTimeout(r, 400));

  // build the print document without opening a dialog
  window.print = function () {};
  document.getElementById('btnPrint').click();
  await new Promise(r => setTimeout(r, 400));
  return document.getElementById('printSheet').innerHTML.length;
})()`;

const res = await send('Runtime.evaluate', { expression: seed, awaitPromise: true, returnByValue: true });
if (res.exceptionDetails) console.log('SEED ERROR:', res.exceptionDetails.text);
else console.log('print doc bytes:', res.result.value);

await send('Emulation.setEmulatedMedia', { media: 'print' });
await sleep(600);

const metrics = await send('Page.getLayoutMetrics');
const cs = metrics.cssContentSize || metrics.contentSize;
const H = Math.min(Math.ceil(cs.height), 4200);
await send('Emulation.setDeviceMetricsOverride', {
  width: 1000, height: H, deviceScaleFactor: 1, mobile: false
});
await sleep(400);

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 0, y: 0, width: 1000, height: H, scale: 1 },
  captureBeyondViewport: true
});
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('wrote', OUT, 'height', H);

ws.close(); chrome.kill(); process.exit(0);
