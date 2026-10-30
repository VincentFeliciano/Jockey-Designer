/* Headless smoke test for the quote sheet — drives Chrome over CDP.
   Run:  node test/smoke.mjs            (server must be on 127.0.0.1:8788)
   Exits 0 on pass, 1 on any failure. */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const URL = process.env.QS_URL || 'http://127.0.0.1:8788/';
const PROFILE = mkdtempSync(join(tmpdir(), 'qs-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--window-size=1600,1200',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, URL
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome never exposed a page target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};
function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable');
await send('Runtime.enable');

/* catch anything thrown after this point */
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errs = [];
    addEventListener('error', e => window.__errs.push('error: ' + e.message));
    addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + e.reason));`
});
await send('Page.reload');
await sleep(3000);

const script = `(async () => {
  const R = {};
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));

  R.sections = qa('#sections .card').length;
  R.sectionTitles = qa('#sections .card h2').map(h => h.firstChild.textContent.trim());
  R.boundFields = qa('#sections input, #sections textarea, #sections select').length;
  R.colorFields = qa('#sections .colorfield').length;
  R.quoteNumber = q('#quoteNo').textContent;
  R.itemRows = qa('#itemRows tr').length;
  R.photoInputs = qa('#photoFile').length;
  R.savedNote = q('#savedNote').textContent;

  // type into the customer name field and let autosave run
  const nameIn = qa('#sections input').find(i => i.type === 'text');
  nameIn.value = 'Test Owner';
  nameIn.dispatchEvent(new Event('input', { bubbles: true }));

  // line item maths
  const cells = qa('#itemRows tr:first-child input');
  cells[1].value = '3'; cells[1].dispatchEvent(new Event('input', { bubbles: true }));
  cells[2].value = '125.50'; cells[2].dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 900));
  R.subtotal = q('#tSub').textContent;
  R.total = q('#tTotal').textContent;

  // photo intake: make a real 2000px JPEG and run it through the pipeline
  const c = document.createElement('canvas');
  c.width = 2000; c.height = 1400;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b5'; ctx.fillRect(0, 0, 2000, 1400);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 180px sans-serif'; ctx.fillText('SILKS', 80, 800);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  const file = new File([blob], 'test-silks.jpg', { type: 'image/jpeg' });
  const before = blob.size;
  const quoteId = (await QS.store.listQuotes())[0].id;

  // go through the real UI path: hand the file to the input, fire change
  const dt = new DataTransfer();
  dt.items.add(file);
  const picker = q('#photoFile');
  picker.files = dt.files;
  picker.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1200));

  const stored = await QS.store.photosFor(quoteId);
  R.photoAdded = stored.length;
  R.photoBytesIn = before;
  R.photoBytesOut = stored.length ? Math.round(stored[0].dataUrl.length * 0.75) : 0;
  R.photoScaled = stored.length ? stored[0].w + 'x' + stored[0].h : '';
  R.photoTiles = qa('#photoGrid .photo').length;

  // reload from the store and confirm the edits survived
  await new Promise(r => setTimeout(r, 900));
  const all = await QS.store.listQuotes();
  const rec = all[0];
  R.persistedName = rec.customer.name;
  R.persistedQty = rec.items[0].qty;
  R.persistedUnit = rec.items[0].unit;
  R.persistedPhotos = (await QS.store.photosFor(rec.id)).length;

  // print document
  const photos = await QS.store.photosFor(rec.id);
  const html = QS.printDoc.build(rec, photos);
  R.printLength = html.length;
  R.printHasNumber = html.includes(rec.number);
  R.printHasPhoto = html.includes('Reference photos');
  R.printHasTotal = html.includes('Total');

  // backup payload round-trips as JSON
  const payload = JSON.stringify({ app: 'jockey-quote-sheet', quotes: all, photos });
  R.backupKB = Math.round(payload.length / 1024);
  R.backupParses = (() => { try { JSON.parse(payload); return true; } catch { return false; } })();

  // ---- work & progress ----
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  R.workCard = !!q('#workCard');
  R.stageSteps = qa('#stageSteps .step').length;
  R.workRows = qa('#workList li.qrow').length;
  R.prevRows = qa('#prevList li.qrow').length;

  const taskIn = q('#taskInput');
  taskIn.value = 'Cut fabric'; q('#btnAddTask').click();
  taskIn.value = 'Post out'; q('#btnAddTask').click();
  await sleep(900);
  R.taskRows = qa('#taskList .task').length;

  qa('#taskList .task input')[0].click();
  await sleep(900);
  R.progText = q('#progText').textContent;
  R.progFill = q('#progFill').style.width;

  qa('#stageSteps .step')[2].click();
  await sleep(900);
  R.stageOn = (q('#stageSteps .step.on .slabel') || {}).textContent;

  q('#btnPin').click();
  await sleep(900);
  R.pinned = qa('#workList li.qrow')[0].classList.contains('pinned');
  R.pinLabel = q('#btnPin').textContent;

  q('#btnComplete').click();
  await sleep(900);
  R.workAfter = qa('#workList li.qrow').length;
  R.prevAfter = qa('#prevList li.qrow').length;
  R.doneBanner = !q('#doneBanner').hidden;
  R.completeBtn = q('#btnComplete').textContent;

  const rec2 = (await QS.store.listQuotes())[0];
  R.persistedStage = rec2.stage;
  R.persistedPinned = rec2.pinned;
  R.persistedTasks = (rec2.tasks || []).length;
  R.persistedDoneTask = (rec2.tasks || [])[0] && rec2.tasks[0].done;

  R.errors = window.__errs || [];
  return R;
})()`;

const { result } = await send('Runtime.evaluate', {
  expression: script, awaitPromise: true, returnByValue: true
});
const R = result.value || {};

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(process.cwd(), 'test', 'screenshot.png'), Buffer.from(shot.data, 'base64'));

const checks = [
  ['three spec sections rendered', R.sections === 3],
  ['all fields rendered', R.boundFields >= 19],
  ['colour pickers rendered', R.colorFields === 3],
  ['quote number assigned', /^JQ-\d{4}-\d{3}$/.test(R.quoteNumber || '')],
  ['line items present', R.itemRows === 2],
  ['subtotal calculated', R.subtotal === '$376.50'],
  ['total calculated', R.total === '$376.50'],
  ['photo ingested', R.photoAdded === 1],
  ['photo downscaled to 1600 edge', R.photoScaled === '1600x1120'],
  ['photo shrunk on disk', R.photoBytesOut > 0 && R.photoBytesOut < R.photoBytesIn],
  ['photo tile rendered', R.photoTiles === 1],
  ['customer name persisted', R.persistedName === 'Test Owner'],
  ['line item persisted', R.persistedQty === 3 && R.persistedUnit === 125.5],
  ['photo persisted', R.persistedPhotos === 1],
  ['print doc built', R.printLength > 800],
  ['print doc has number', R.printHasNumber === true],
  ['print doc has photos page', R.printHasPhoto === true],
  ['backup parses', R.backupParses === true],
  ['work card rendered', R.workCard === true],
  ['five stage steps', R.stageSteps === 5],
  ['working list holds the quote', R.workRows === 1 && R.prevRows === 0],
  ['steps added', R.taskRows === 2],
  ['progress tracked', R.progText === '1 of 2 steps' && R.progFill === '50%'],
  ['stage advanced', R.stageOn === 'In production'],
  ['pin marks and labels', R.pinned === true && R.pinLabel === 'Unpin'],
  ['complete moves to previous', R.workAfter === 0 && R.prevAfter === 1],
  ['complete banner shown', R.doneBanner === true],
  ['complete button offers reopen', R.completeBtn === 'Reopen'],
  ['work state persisted', R.persistedStage === 'done' && R.persistedPinned === true &&
    R.persistedTasks === 2 && R.persistedDoneTask === true],
  ['no console errors', (R.errors || []).length === 0]
];

let failed = 0;
console.log('\n  Jockey quote sheet - smoke test\n');
for (const [label, ok] of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}
console.log('\n  details:', JSON.stringify({
  sections: R.sectionTitles, quoteNumber: R.quoteNumber, subtotal: R.subtotal,
  photo: `${R.photoScaled} ${R.photoBytesIn}->${R.photoBytesOut} B`,
  printKB: R.printLength && Math.round(R.printLength / 1024), backupKB: R.backupKB,
  errors: R.errors
}, null, 2));
console.log(`\n  ${checks.length - failed}/${checks.length} passed\n`);

ws.close();
chrome.kill();
process.exit(failed ? 1 : 0);
