/* Work-board screenshot — three quotes (one pinned, one in production, one
   complete) so the working/previous split and the progress card are visible.
   Run:  node test/work-shot.mjs [outfile]     (server on 127.0.0.1:8788) */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9355;
const URL = 'http://127.0.0.1:8788/';
const OUT = process.argv[2] || 'test/work.png';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-work-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--window-size=1600,1400',
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
await sleep(1600);

const seed = `(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const set = (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const card = (i) => qa('#sections .card')[i];
  const cust = (i, v) => set(card(0).querySelectorAll('input,textarea')[i], v);
  const job = (i, v) => set(card(1).querySelectorAll('input')[i], v);
  const items = () => qa('#itemRows tr');
  const row = (i, desc, qty, unit) => {
    const inp = items()[i].querySelectorAll('input');
    set(inp[0], desc); set(inp[1], String(qty)); set(inp[2], String(unit));
  };
  const task = async (text) => {
    set(q('#taskInput'), text);
    q('#btnAddTask').click();
    await wait(80);
  };
  const stage = async (i) => { qa('#stageSteps .step')[i].click(); await wait(500); };

  /* ---- A: in production, with steps ---- */
  cust(0, 'Vincent Feliciano');
  cust(1, 'Feliciano Racing Stable');
  cust(3, '(516) 555-0142');
  cust(4, '42 Rosewood Lane, Elmont, NY 11003');
  job(0, 'Luis Saez');
  job(1, 'M / 32 waist');
  job(2, '2026-11-06');
  row(0, 'Jockey silks - full set', 3, 485);
  row(1, 'Name & number applique', 3, 65);
  set(q('#notes'), "Cut to Luis's measurements from last season. Yellow cap to match the stable colours - check the shade against the swatch before cutting.");
  await task('Cut fabric');
  await task('Embroidery - name & number');
  await task('Press and post out');
  qa('#taskList .task input')[0].click();
  await wait(400);
  await stage(2);

  /* ---- B: approved, pinned to the top ---- */
  q('#btnNew').click();
  await wait(700);
  cust(0, 'Crafters Gallery');
  cust(1, 'M. Ortiz Racing');
  job(0, 'Irad Ortiz Jr.');
  job(2, '2026-10-30');
  await wait(400);
  await stage(1);
  q('#btnPin').click();
  await wait(500);

  /* ---- C: finished, so it drops to Previous ---- */
  q('#btnNew').click();
  await wait(700);
  cust(0, 'R. Santana');
  job(0, 'Junior Alvarado');
  await wait(400);
  q('#btnComplete').click();
  await wait(600);

  /* ---- back to A for the shot ---- */
  const aRow = qa('#workList li.qrow').find(li => li.textContent.includes('Vincent'));
  if (aRow) aRow.click();
  await wait(900);
  q('.sheet').scrollTop = 0;
  await wait(300);

  return JSON.stringify({
    work: qa('#workList li.qrow').map(li => li.querySelector('.nm').textContent),
    prev: qa('#prevList li.qrow').map(li => li.querySelector('.nm').textContent),
    stage: (q('#stageSteps .step.on .slabel') || {}).textContent,
    prog: q('#progText').textContent,
    tasks: qa('#taskList .task').length,
    overflowRows: qa('.qrow').filter(li => li.scrollWidth > li.clientWidth + 1).length,
    overflowSteps: (() => { const e = q('#stageSteps'); return e.scrollWidth > e.clientWidth + 1; })(),
    rows: qa('.qrow').map(li => {
      const s = li.querySelector('.stage');
      const p = li.querySelector('.tool.pin');
      return {
        name: li.querySelector('.nm').textContent,
        stage: s.textContent,
        stageRight: Math.round(s.getBoundingClientRect().right),
        pinLeft: Math.round(p.getBoundingClientRect().left),
        gap: Math.round(p.getBoundingClientRect().left - s.getBoundingClientRect().right),
        tools: li.querySelectorAll('.tool').length,
        w: Math.round(li.getBoundingClientRect().width)
      };
    }),
    errors: window.__errs || []
  });
})()`;

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errs = [];
    addEventListener('error', e => window.__errs.push('error: ' + e.message));
    addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + e.reason));`
});

const res = await send('Runtime.evaluate', { expression: seed, awaitPromise: true, returnByValue: true });
if (res.exceptionDetails) console.log('SEED ERROR:', res.exceptionDetails.text, res.exceptionDetails.exception?.description);
else console.log('seed:', res.result.value);

const metrics = await send('Page.getLayoutMetrics');
const cs = metrics.cssContentSize || metrics.contentSize;
const H = Math.min(Math.ceil(cs.height), 3600);
await send('Emulation.setDeviceMetricsOverride', {
  width: 1600, height: H, deviceScaleFactor: 1, mobile: false
});
await sleep(600);

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
