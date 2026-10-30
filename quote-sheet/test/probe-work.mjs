/* One-off probe: where is the work card, and is it visible? */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9366;
const URL = 'http://127.0.0.1:8788/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-probe-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--window-size=1600,1200',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, URL
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
  throw new Error('no target');
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
await sleep(2000);

const { result } = await send('Runtime.evaluate', {
  expression: `(() => {
    const w = document.getElementById('workCard');
    if (!w) return 'NO ELEMENT';
    const r = w.getBoundingClientRect();
    const cs = getComputedStyle(w);
    const parent = w.parentElement;
    return JSON.stringify({
      rect: {x: r.x, y: r.y, w: r.width, h: r.height},
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      parent: parent && parent.className,
      parentChildren: parent ? [...parent.children].map(c => c.id || c.className) : null,
      innerLen: w.innerHTML.length,
      steps: document.querySelectorAll('#stageSteps .step').length,
      firstChildBox: w.firstElementChild ? w.firstElementChild.getBoundingClientRect().height : null,
      sheetScroll: document.querySelector('.sheet').scrollTop
    }, null, 1);
  })()`,
  returnByValue: true
});
console.log(result.value);

ws.close();
chrome.kill();
process.exit(0);
