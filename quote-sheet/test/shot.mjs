/* Design screenshot — fills the sheet with sample data and captures the whole page.
   Run:  node test/shot.mjs [outfile]
   Needs the server on 127.0.0.1:8788. Uses a throwaway Chrome profile, so it
   never touches the real quotes in your browser. */
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
await sleep(1200);

const seed = `(async () => {
  const set = (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const byK = (k) => document.querySelector('[data-k="' + k + '"]');

  set(byK('customer.name'), 'Vincent Feliciano');
  set(byK('customer.company'), 'Feliciano Racing Stable');
  set(byK('customer.email'), 'vincent@felicianoracing.com');
  set(byK('customer.phone'), '(516) 555-0142');
  set(byK('customer.address'), '42 Rosewood Lane\\nElmont, NY 11003');
  set(byK('job.jockey'), 'Luis Saez');
  set(byK('job.size'), 'M / 32 waist');
  set(byK('job.due'), '2026-11-06');
  const rush = byK('job.rush'); rush.checked = true;
  rush.dispatchEvent(new Event('change', { bubbles: true }));

  set(byK('silks.body'), '#1b2a6b');
  set(byK('silks.bodyName'), 'royal blue');
  set(byK('silks.sleeves'), '#f2f2f2');
  set(byK('silks.sleevesName'), 'white');
  set(byK('silks.cap'), '#ffd60a');
  set(byK('silks.capName'), 'yellow');
  set(byK('silks.pattern'), 'hoops, 6 white');
  set(byK('silks.collar'), 'stock, white');
  set(byK('silks.cuffs'), 'yellow band');
  const fabric = byK('silks.fabric');
  if (fabric) set(fabric, 'Lightweight nylon');
  set(byK('silks.qty'), '3');

  const meta = (id, v) => { const el = document.getElementById(id); if (el) set(el, v); };
  meta('metaPreparedBy', 'Crafters Gallery');

  // line items — rows already exist, fill and add one more
  const fillRow = (tr, desc, qty, unit) => {
    const inp = tr.querySelectorAll('input');
    set(inp[0], desc); set(inp[1], String(qty)); set(inp[2], String(unit));
  };
  const rows = () => document.querySelectorAll('#itemRows tr');
  fillRow(rows()[0], 'Jockey silks — full set', 3, 485);
  fillRow(rows()[1], 'Name & number applique', 3, 65);
  document.getElementById('btnAddItem').click();
  await new Promise(r => setTimeout(r, 120));
  const r3 = rows()[2];
  if (r3) fillRow(r3, 'Rush surcharge (2 weeks)', 1, 150);

  meta('discount', '50');
  meta('taxRate', '8.875');
  meta('deposit', '500');

  const notes = document.getElementById('notes');
  set(notes, 'Silks cut to Luis\\'s measurements from last season. Yellow cap to match the stable colours — please confirm the shade against the attached swatch before cutting.');

  const logAdd = async (text) => {
    const li = document.getElementById('logInput');
    set(li, text);
    document.getElementById('btnAddLog').click();
    await new Promise(r => setTimeout(r, 80));
  };
  await logAdd('Quote requested by phone — 3 sets, rush.');
  await logAdd('Deposit received, $500.');
  document.getElementById('status').value = 'sent';
  document.getElementById('status').dispatchEvent(new Event('change', { bubbles: true }));

  // three reference photos through the real pipeline
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
  files.forEach(f => dt.items.add(f));
  const fi = document.getElementById('photoFile');
  fi.files = dt.files;
  fi.dispatchEvent(new Event('change', { bubbles: true }));

  for (let i = 0; i < 40; i++) {
    if (document.querySelectorAll('.photo').length >= 3) break;
    await new Promise(r => setTimeout(r, 150));
  }
  await new Promise(r => setTimeout(r, 400));
  return {
    photos: document.querySelectorAll('.photo').length,
    rows: document.querySelectorAll('#itemRows tr').length,
    total: document.getElementById('tTotal').textContent,
  };
})()`;

const res = await send('Runtime.evaluate', { expression: seed, awaitPromise: true, returnByValue: true });
console.log('seed result:', JSON.stringify(res).slice(0, 900));

const metrics = await send('Page.getLayoutMetrics');
const cs = metrics.cssContentSize || metrics.contentSize;
await send('Emulation.setDeviceMetricsOverride', {
  width: 1600, height: Math.min(Math.ceil(cs.height), 4000),
  deviceScaleFactor: 1, mobile: false
});
await sleep(400);

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 0, y: 0, width: 1600, height: Math.min(Math.ceil(cs.height), 4000), scale: 1 },
  captureBeyondViewport: true
});
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('wrote', OUT);

ws.close();
chrome.kill();
process.exit(0);
