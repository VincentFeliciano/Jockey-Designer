/* Renders the printable quote to PDF so the print layout can be inspected.
   Run:  node test/print.mjs
   Writes test/quote.pdf and exits 0 on success. */
import { spawn } from 'node:child_process';
import { mkdtempSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9334;
const OUT = resolve('test/quote.pdf');
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-print-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, 'http://127.0.0.1:8788/'
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
      if (p) return p;
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
await sleep(2500);

/* fill a realistic quote, then build the print document */
const fill = `(async () => {
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const set = (sel, val) => { const n = document.querySelector(sel); if (n) { n.value = val; n.dispatchEvent(new Event('input', { bubbles: true })); } };

  const inputs = qa('#sections input[type=text]');
  inputs[0].value = 'Margaret Hollis'; inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
  inputs[1].value = 'Hollis Racing';    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  if (inputs[2]) { inputs[2].value = 'R. Ortiz'; inputs[2].dispatchEvent(new Event('input', { bubbles: true })); }
  if (inputs[3]) { inputs[3].value = 'M / 30 waist'; inputs[3].dispatchEvent(new Event('input', { bubbles: true })); }
  set('#metaPreparedBy', 'Vee');
  set('#notes', 'Cap to match the photograph. Sleeves one inch longer than last season.');

  // silks colours: body, sleeves, cap (picker + plain-English name)
  const cols = qa('#sections .colorfield');
  const paint = (i, hex, name) => {
    if (!cols[i]) return;
    const p = cols[i].querySelector('input[type=color]');
    const n = cols[i].querySelector('input[type=text]');
    p.value = hex; p.dispatchEvent(new Event('input', { bubbles: true }));
    n.value = name; n.dispatchEvent(new Event('input', { bubbles: true }));
  };
  paint(0, '#1b3a8f', 'royal blue');
  paint(1, '#c9a227', 'gold');
  paint(2, '#f2f2f2', 'white');

  // pattern / collar / cuffs — text inputs 7, 8, 9 (4-6 are the colour names)
  const txt = qa('#sections input[type=text]');
  if (txt[7]) { txt[7].value = 'Gold hoops, 6'; txt[7].dispatchEvent(new Event('input', { bubbles: true })); }
  if (txt[8]) { txt[8].value = 'Stock, white'; txt[8].dispatchEvent(new Event('input', { bubbles: true })); }
  if (txt[9]) { txt[9].value = 'Blue band'; txt[9].dispatchEvent(new Event('input', { bubbles: true })); }

  set('#taxRate', '8.875');

  const cells = qa('#itemRows tr:first-child input');
  cells[0].value = 'Jockey silks, custom set'; cells[0].dispatchEvent(new Event('input', { bubbles: true }));
  cells[1].value = '2'; cells[1].dispatchEvent(new Event('input', { bubbles: true }));
  cells[2].value = '485'; cells[2].dispatchEvent(new Event('input', { bubbles: true }));

  const second = qa('#itemRows tr:nth-child(2) input');
  second[0].value = 'Shipping'; second[0].dispatchEvent(new Event('input', { bubbles: true }));
  second[2].value = '35'; second[2].dispatchEvent(new Event('input', { bubbles: true }));

  // a photo so page two has content
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 800;
  const x = c.getContext('2d');
  x.fillStyle = '#1b3a8f'; x.fillRect(0, 0, 1200, 800);
  x.fillStyle = '#fff'; x.fillRect(0, 300, 1200, 200);
  x.fillStyle = '#c9a227'; x.font = 'bold 90px serif'; x.fillText('SILKS REF', 90, 460);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'ref.jpg', { type: 'image/jpeg' }));
  const picker = document.querySelector('#photoFile');
  picker.files = dt.files;
  picker.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1500));

  await new Promise(r => setTimeout(r, 1000));
  const quotes = await QS.store.listQuotes();
  const rec = quotes[0];
  const photos = await QS.store.photosFor(rec.id);
  document.querySelector('#printSheet').innerHTML = QS.printDoc.build(rec, photos);
  document.body.classList.add('printing');
  return { total: QS.money(QS.totals(rec).total), photos: photos.length, number: rec.number };
})()`;

const { result } = await send('Runtime.evaluate', {
  expression: fill, awaitPromise: true, returnByValue: true
});
console.log('filled:', JSON.stringify(result.value));

/* force the print stylesheet on for the PDF render AND for an honest preview */
await send('Emulation.setEmulatedMedia', { media: 'print' });
await sleep(600);

const pdf = await send('Page.printToPDF', {
  printBackground: true,
  paperWidth: 8.5,
  paperHeight: 11,
  marginTop: 0.55,
  marginBottom: 0.63,
  marginLeft: 0.55,
  marginRight: 0.55
});
const { writeFileSync } = await import('node:fs');
writeFileSync(OUT, Buffer.from(pdf.data, 'base64'));

/* also capture the on-screen print layout so it can be eyeballed */
await send('Emulation.setDeviceMetricsOverride', {
  width: 850, height: 1100, deviceScaleFactor: 1.5, mobile: false
});
await sleep(400);
const shot = await send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true
});
writeFileSync(resolve('test/print-preview.png'), Buffer.from(shot.data, 'base64'));

const kb = existsSync(OUT) ? Math.round(statSync(OUT).size / 1024) : 0;
console.log(`wrote ${OUT} (${kb} KB)`);
console.log(kb > 20 ? 'PASS  print PDF produced' : 'FAIL  print PDF empty or tiny');

ws.close();
chrome.kill();
process.exit(kb > 20 ? 0 : 1);
