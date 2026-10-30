# Jockey Quote Sheet

A quote sheet you fill in on screen — customer, silks spec, priced line items,
photos and a follow-up log. Everything saves itself as you type, and the
**Print / PDF** button turns the quote into a clean document you can hand over.

No install, no account, no cloud. The data lives in your browser on this machine.

---

## Starting it

| | |
|---|---|
| **This PC** | double-click `start-quote-sheet.bat` |
| **This PC + your phone** | double-click `start-quote-sheet-phone.bat`, then open the address it prints on your phone (same wifi) |

The browser opens at `http://127.0.0.1:8788/`. A small black window runs the
server — leave it open while you work, close it when you are done.

> Opening `index.html` directly by double-clicking also works in a pinch, but
> some browsers refuse storage for `file://` pages, and then nothing is saved.
> Use the `.bat`.

---

## Filling in a quote

- **Left column** — split in two. **Working** holds every quote still on the
  bench; **Previous** holds the finished ones and folds away when you click its
  heading. Type in the search box to filter by name, stable or jockey.
- **Middle** — work and progress first (see below), then customer details, the
  job (jockey, size, due date, rush flag) and the silks specification: body,
  sleeves and cap each get a colour picker plus a plain-English name, then
  pattern, collar, cuffs, fabric and how many sets.
- **Line items** — description, quantity, unit price. Amount and totals calculate
  themselves. Add or remove rows as you like.
- **Right column** — discount, tax %, deposit, and the running total and balance.
- **Photos** — three ways in: drag files onto the drop zone, click *Choose files*,
  or just press **Ctrl+V** to paste a screenshot. On your phone, *Choose files*
  opens the camera. Big photos are automatically shrunk to 1600 px on the long
  edge so the sheet stays quick, and each one takes a caption.
- **Notes and follow-up log** — free text, plus a timestamped log for calls and
  reminders. Changing the status writes an entry in the log automatically.

## Working vs previous

The left column keeps the bench and the archive apart.

| | |
|---|---|
| **Working** | quotes you have not finished. Pinned ones sit at the top, then the ones nearest the finish, then the soonest due. |
| **Previous** | completed quotes, newest first. Click the *Previous* heading to fold the list away — it remembers. |

Each row carries two small buttons:

- **↑ pin** — hoists that quote to the top of the working list so its files are
  one click away. Click again to unpin.
- **✓ tick** — marks it complete and moves it to *Previous*. On a finished row
  the button becomes **↺** and brings it back.

## Work & progress

The first card in the sheet is the job's own tracker:

- **Stages** — Quoted → Approved → In production → Finishing → Complete. Click
  any stage to move the job; every move writes itself into the follow-up log.
- **Steps** — a checklist for the job itself (*cut fabric*, *embroidery*,
  *post out*). Tick them off as you go; the thin bar and the `1/3` on the
  sidebar row show how far along the job is.
- **Pin to top** and **Mark complete** do the same as the sidebar buttons.

Marking a quote complete is a work decision, not a billing one — the status
chip (`draft`, `sent`, `accepted`, …) is untouched, so you can finish the job
before the invoice goes out.

## Printing

**Print / PDF** opens the print dialog with a properly laid-out document: header
with the quote number and dates, the customer and job side by side, the silks
spec as a two-column sheet, the item table, totals, notes, and the reference
photos on their own page. Choose *Save as PDF* in the print dialog to get a file.

## Backing up

**Backup** downloads one `.json` file containing every quote and every photo.
**Restore** reads it back. Do this before clearing browser data or moving to
another machine — the sheet's storage belongs to the browser, so clearing site
data would otherwise take your quotes with it.

## Statuses

`draft` → `sent` → `accepted` / `declined` → `invoiced` → `paid`. Shown as a
coloured chip beside each quote in the left column.

## Quote numbers

Assigned automatically as `JQ-<year>-<number>` and never reused — a new quote
takes the next free number for that year.

---

## Under the hood

| File | What it does |
|---|---|
| `index.html` | the page shell |
| `css/style.css` | screen and print styling |
| `js/schema.js` | the fields, the record shape, the maths |
| `js/store.js` | IndexedDB persistence (memory fallback if storage is blocked) |
| `js/photos.js` | image intake, downscaling, storage |
| `js/ui.js` | DOM rendering |
| `js/print.js` | builds the printable document |
| `js/app.js` | wiring, autosave, shortcuts |

Plain scripts, no build step, no dependencies — edit and reload.

### Tests

All need the server running on port 8788.

```
node test/smoke.mjs          # 30 checks: rendering, maths, photo pipeline, persistence, print, backup, work board
node test/print.mjs          # renders test/quote.pdf
node test/design-shot.mjs    # fills the sheet with sample data, saves test/design.png
node test/work-shot.mjs      # three quotes on the board, saves test/work.png
node test/print-preview.mjs  # saves test/print-screen.png - the printable layout
node test/inspect.mjs        # dumps computed colours, contrast ratios and light-on-dark leaks
```

`test/smoke.mjs` drives real Chrome over the DevTools protocol: it types into the
form, pushes a genuine 2000×1400 JPEG through the photo pipeline, reloads from
IndexedDB and asserts the values survived, then builds the print document and
the backup payload.

### Keyboard

| Key | Action |
|---|---|
| `Ctrl+S` | save now |
| `Ctrl+P` | print / PDF |
| `Ctrl+V` | paste an image from the clipboard |
