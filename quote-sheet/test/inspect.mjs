/* Inspect the live sheet: computed colours, data presence, contrast.
   Run: node test/inspect.mjs   (server on 127.0.0.1:8788) */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9355;
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-insp-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--window-size=1600,1500',
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
await send('Runtime.enable');
await sleep(1500);

const expr = `(() => {
  const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : 'MISSING'; };
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => {
    const A = lum(a), B = lum(b);
    return ((Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05)).toFixed(2);
  };

  // any light background still hanging around on screen?
  const light = [];
  document.querySelectorAll('body *').forEach((el) => {
    const c = parse(getComputedStyle(el).backgroundColor);
    if (!c || c.a === 0) return;
    if (lum(c) > 0.45) light.push(el.tagName + '.' + (el.className || '').toString().slice(0, 30) + ' -> ' + getComputedStyle(el).backgroundColor);
  });

  const pairs = [
    ['body text', 'body', 'color', 'backgroundColor'],
    ['.card h2', '.card h2', 'color', '.card'],
    ['label', '.card label', 'color', '.card'],
    ['input', 'input[type=text]', 'color', 'backgroundColor'],
    ['grand total', '.trow.grand output', 'color', '.totals'],
    ['balance', '.trow.balance output', 'color', '.totals'],
    ['chip', '.chip', 'color', 'backgroundColor'],
  ];
  const out = [];
  pairs.forEach(([name, sel, fgProp, bgSel]) => {
    const el = document.querySelector(sel);
    if (!el) { out.push(name + ': MISSING'); return; }
    const fg = parse(getComputedStyle(el)[fgProp]);
    const bgEl = bgSel.startsWith('.') ? document.querySelector(bgSel) : el;
    let bg = parse(bgEl ? getComputedStyle(bgEl).backgroundColor : '');
    if (!bg || bg.a === 0) bg = parse(getComputedStyle(document.body).backgroundColor);
    out.push(name + ': ' + getComputedStyle(el)[fgProp] + ' on ' + (bgEl ? getComputedStyle(bgEl).backgroundColor : '?') + ' = ' + (fg && bg ? contrast(fg, bg) : '?'));
  });

  return {
    title: document.title,
    cssLoaded: [...document.styleSheets].map(s => s.href || 'inline'),
    bodyBg: cs('body', 'backgroundColor'),
    topbarBg: cs('.topbar', 'backgroundColor'),
    sheetBg: cs('.sheet', 'backgroundColor'),
    cardBg: cs('.card', 'backgroundColor'),
    yellowVar: getComputedStyle(document.documentElement).getPropertyValue('--yellow').trim(),
    accentHeading: cs('.card h2', 'color'),
    itemRows: document.querySelectorAll('#itemRows tr').length,
    itemAmounts: [...document.querySelectorAll('#itemRows .amt')].map(e => e.textContent),
    total: (document.getElementById('tTotal') || {}).textContent,
    balance: (document.getElementById('tBalance') || {}).textContent,
    photos: document.querySelectorAll('.photo').length,
    photoImgOk: [...document.querySelectorAll('.photo img')].map(i => i.naturalWidth > 0),
    logEntries: document.querySelectorAll('.log li').length,
    chips: document.querySelectorAll('.chip').length,
    lightBackgrounds: light.slice(0, 12),
    contrast: out,
  };
})()`;

const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(JSON.stringify(r.result.value, null, 2));
ws.close(); chrome.kill(); process.exit(0);
