import React, { useEffect, useRef, useState } from "react";
import { api, fmt } from "../api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function todayLabel() {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} (${DAYS[d.getDay()]})`;
}

// Render a stored day label as "16 Aug (Saturday)" — moves an existing
// weekday to the end, or derives one (assuming the current year) for
// older labels that were saved without it.
function displayDay(day) {
  if (!day) return "Undated";
  const tagged = day.match(/\(([^)]+)\)/);
  const bare = day.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  let weekday = tagged ? tagged[1] : null;
  if (!weekday) {
    const m = bare.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
    const monthIdx = m ? MONTHS.findIndex((mo) => mo.toLowerCase() === m[2].toLowerCase()) : -1;
    if (monthIdx >= 0) {
      weekday = DAYS[new Date(new Date().getFullYear(), monthIdx, Number(m[1])).getDay()];
    }
  }
  return weekday ? `${bare} (${weekday})` : bare;
}

// Canonical stored form of a day key, so labels saved in older formats
// ("(Monday) 31 Aug", "31 Aug") collapse into a single group.
function canonicalDay(day) {
  if (!day) return "";
  const label = displayDay(day);
  return label === "Undated" ? "" : label;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function groupByDay(rows) {
  const order = [];
  const map = new Map();
  rows.forEach((row, idx) => {
    const key = row.day || "";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(idx);
  });
  return order.map((day) => ({ day, indices: map.get(day) }));
}

export default function Ledger({
  index,
  title,
  note,
  section,
  hasDay,
  hasBudget,
  hasPetrol,
  printable,
  readOnly = false,
  periodLabel,
  initialItems,
  initialBudget,
  onStatus,
  namePlaceholder = "Item name",
  addLabel,
  hasDescription,
  descriptionPlaceholder = "Add a note…",
  initialDescription,
  onPriceDelta,
  onRemainingChange,
  onSave,
  onRemove
}) {
  const [rows, setRows] = useState(() =>
    (initialItems || []).map((r) => ({
      day: canonicalDay(r.day || ""),
      name: r.name || "",
      price: Number(r.price) || 0,
      petrol: !!r.petrol
    }))
  );
  const [budget, setBudget] = useState(Number(initialBudget) || 0);
  const [description, setDescription] = useState(initialDescription || "");
  const [duplex, setDuplex] = useState(false);
  // Petrol lines are picked out of the ordinary entries rather than kept in a
  // section of their own: the money is still monthly spending, so it has to go
  // on counting towards the budget while also totalling on its own.
  const [picking, setPicking] = useState(false);
  // Petrol view: the section narrows to the marked entries, and the budget and
  // the note step out — they describe the whole month, not the fuel. Print
  // follows whatever is on screen, so it prints this list while the view is on.
  const [petrolView, setPetrolView] = useState(false);
  const mounted = useRef(false);
  const timer = useRef(null);
  const latestPayload = useRef(null);

  function save(payload, attempt = 0) {
    const request = onSave ? onSave(payload) : api.putSection(section, payload);
    request
      .then((res) => {
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        if (!res.ok) throw new Error("save failed");
        onStatus("saved");
      })
      .catch(() => {
        if (attempt < 2) {
          setTimeout(() => save(payload, attempt + 1), 1500 * (attempt + 1));
        } else {
          onStatus("error");
        }
      });
  }

  useEffect(() => {
    if (readOnly) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const payload = { items: rows };
    if (hasBudget) payload.budget = budget;
    if (hasDescription) payload.description = description;
    latestPayload.current = payload;

    onStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      save(payload);
    }, 500);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, budget, description]);

  // Safety net: if a debounced save is still pending when the tab closes or
  // this section unmounts, send it immediately instead of silently dropping it.
  useEffect(() => {
    function flush() {
      if (readOnly) return;
      if (timer.current && latestPayload.current) {
        clearTimeout(timer.current);
        timer.current = null;
        const request = onSave ? onSave(latestPayload.current) : api.putSection(section, latestPayload.current);
        request.catch(() => {});
      }
    }
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasDay || readOnly) return;
    const label = todayLabel();
    setRows((prev) =>
      prev.some((r) => r.day === label) ? prev : [...prev, { day: label, name: "", price: 0, petrol: false }]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = rows.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  const remaining = budget - total;
  const petrolRows = rows.filter((r) => r.petrol);
  const petrolTotal = petrolRows.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  // Indices into `rows`, never a copy: editing and removing a row still address
  // the entry itself, whichever list it is being shown in.
  const visible = rows.map((_, i) => i).filter((i) => !petrolView || rows[i].petrol);

  useEffect(() => {
    if (hasBudget) onRemainingChange?.(remaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, hasBudget]);

  function updateRow(idx, field, value) {
    const nextValue = field === "price" ? (value === "" ? 0 : Number(value)) : value;
    if (field === "price" && onPriceDelta) {
      onPriceDelta(nextValue - (Number(rows[idx].price) || 0));
    }
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: nextValue };
      return next;
    });
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      hasDay ? { day: todayLabel(), name: "", price: 0, petrol: false } : { name: "", price: 0, petrol: false }
    ]);
  }

  function addRowToDay(day) {
    setRows((prev) => [...prev, { day, name: "", price: 0, petrol: false }]);
  }

  function togglePetrol(idx) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], petrol: !next[idx].petrol };
      return next;
    });
  }

  function removeRow(idx) {
    if (onPriceDelta) onPriceDelta(-(Number(rows[idx].price) || 0));
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  // A petrol entry is marked by shading the row rather than by a badge in a
  // column of its own — nothing is added beside the names, so the ledger keeps
  // its ruling. While picking, the row is the button: the fields go inert (see
  // .picking-rows in the stylesheet) so a click lands on the row, not in a
  // text box.
  // groupByDay() groups a list of rows; on screen the list is a set of indices
  // into `rows`, so the grouping has to follow the indices instead.
  function groupVisibleByDay() {
    const order = [];
    const map = new Map();
    visible.forEach((idx) => {
      const key = rows[idx].day || "";
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key).push(idx);
    });
    return order.map((day) => ({ day, indices: map.get(day) }));
  }

  function rowProps(idx) {
    const row = rows[idx];
    const marked = !!(row && row.petrol);
    const className = "row" + (marked ? " is-petrol" : "");
    if (!hasPetrol || readOnly || !picking) return { className };
    return {
      className,
      role: "button",
      tabIndex: 0,
      "aria-pressed": marked,
      title: marked ? "Remove from petrol" : "Count in petrol",
      onClick: () => togglePetrol(idx),
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          togglePetrol(idx);
        }
      }
    };
  }

  // Opens a print-setup window holding the report plus a screen-only toolbar:
  // paper, margin and row density are live controls (persisted to localStorage)
  // rather than baked-in numbers, and "Pages" does manual two-sided by emitting
  // only the odd or only the even sheets for printers with no duplexer.
  // `mode` ("all" | "odd" | "even") just seeds the Pages control. `petrolOnly`
  // prints the marked fuel lines by themselves — no budget summary and no note,
  // because that sheet is about what the petrol cost, not about the month.
  function handlePrint(mode = "all", petrolOnly = false) {
    const now = new Date();
    const monthYear = periodLabel || `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    const source = petrolOnly ? petrolRows : rows;
    const heading = petrolOnly ? `${title} — Petrol` : title;
    const groups = hasDay ? groupByDay(source) : [{ day: "", indices: source.map((_, i) => i) }];
    // Nothing marked yet: still print the sheet, saying so, rather than a page
    // with only a heading on it.
    if (!groups.length) groups.push({ day: "", indices: [] });

    const headBlock = `
      <div class="blk head-block">
        <h1>${escapeHtml(heading)}</h1>
        <p class="subtitle">${escapeHtml(monthYear)}</p>
        ${petrolOnly ? `
          <div class="summary">
            <div>Petrol<strong>${escapeHtml(fmt(petrolTotal))}</strong></div>
            <div>Entries<strong>${source.length}</strong></div>
          </div>` : hasBudget ? `
          <div class="summary">
            <div>Budget<strong>${escapeHtml(fmt(budget))}</strong></div>
            <div>Spent<strong>${escapeHtml(fmt(total))}</strong></div>
            <div>Remaining<strong class="${remaining < 0 ? "negative" : ""}">${escapeHtml(fmt(remaining))}</strong></div>
          </div>` : ""}
        ${!petrolOnly && description ? `<p class="description">${escapeHtml(description)}</p>` : ""}
      </div>`;

    const groupBlocks = groups
      .map(({ day, indices }) => {
        const dayTotal = indices.reduce((sum, i) => sum + (Number(source[i].price) || 0), 0);
        const head = day
          ? `<div class="blk day-head"><span>${escapeHtml(displayDay(day))}</span><span class="amt">${escapeHtml(fmt(dayTotal))}</span></div>`
          : "";
        const lines = indices.length
          ? indices
              .map((i) => {
                const row = source[i];
                return `<div class="blk line"><span class="nm">${escapeHtml(row.name || "—")}</span><span class="amt">${escapeHtml(fmt(row.price))}</span></div>`;
              })
              .join("")
          : `<div class="blk line empty">${petrolOnly ? "No petrol entries" : "No entries"}</div>`;
        return head + lines;
      })
      .join("");

    const footBlock = `<div class="blk printed-at">Printed ${escapeHtml(now.toLocaleString())}</div>`;

    const win = window.open("", "_blank", "width=900,height=1040");
    if (!win) return;
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(heading)} — ${escapeHtml(monthYear)}</title>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; }
            body { font-family: Georgia, "Iowan Old Style", serif; color: #1a1a1a; background: #d8d3c7; }
            h1 { font-size: 22px; font-weight: 400; margin: 0 0 2px; }
            .subtitle { color: #555; font-size: 13px; margin: 0 0 16px; }
            .summary { display: flex; justify-content: space-between; border-top: 1px solid #999; border-bottom: 1px solid #999; padding: 10px 0; font-size: 14px; }
            .summary div { text-align: center; flex: 1; }
            .summary strong { display: block; font-size: 16px; margin-top: 2px; }
            .negative { color: #a24132; }
            .description { font-style: italic; color: #555; font-size: 13px; margin: 12px 0 0; }
            /* Row density lives in these variables so the auto-fit pass can
               scale the whole vertical rhythm with --squeeze (never the type
               size) to pull a barely-used final page back onto the one before
               it. */
            :root { --line-pad: 5px; --head-gap: 16px; --foot-gap: 24px; --squeeze: 1; }
            .blk { break-inside: avoid; page-break-inside: avoid; }
            /* flow-root keeps the inner margins from collapsing out of the
               block, so its measured height is the height it will occupy. */
            .head-block { display: flow-root; }
            .day-head { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #555; border-bottom: 1px solid #999; padding-bottom: 6px; margin: calc(var(--head-gap) * var(--squeeze)) 0 4px; }
            .line { display: flex; justify-content: space-between; gap: 16px; padding: calc(var(--line-pad) * var(--squeeze)) 0; border-bottom: 1px solid #ccc; font-size: 13.5px; }
            .line .amt { white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; }
            .line.empty { color: #888; font-style: italic; }
            .printed-at { color: #888; font-size: 11px; margin-top: calc(var(--foot-gap) * var(--squeeze)); }

            #flow { position: absolute; left: -10000px; top: 0; }
            .sheet { background: #fff; margin: 16px auto; padding: 18px; box-shadow: 0 1px 8px rgba(0, 0, 0, 0.25); }

            .toolbar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
              font-family: "Segoe UI", system-ui, sans-serif; font-size: 13px;
              background: #f4f1ea; border-bottom: 1px solid #c7bea6; padding: 10px 16px; }
            .toolbar b.tb-brand { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6e6a5c; }
            .toolbar label { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
            .toolbar select, .toolbar input { font: inherit; padding: 3px 6px; border: 1px solid #b7ae95; background: #fff; border-radius: 3px; }
            .toolbar input[type="number"] { width: 58px; }
            .toolbar .spacer { flex: 1; }
            .toolbar button { font: inherit; font-weight: 600; padding: 6px 18px; border: 1px solid #3c6e47; background: #3c6e47; color: #fff; border-radius: 3px; cursor: pointer; }
            .toolbar button:disabled { background: #b9b4a6; border-color: #b9b4a6; cursor: not-allowed; }
            .tb-help { font-family: "Segoe UI", system-ui, sans-serif; font-size: 12.5px; line-height: 1.55;
              color: #5b4a24; background: #fff6df; border-bottom: 1px solid #e7c98a; padding: 8px 16px; }

            @media print {
              .toolbar, .tb-help, #flow { display: none !important; }
              body { background: #fff; }
              .negative { color: #000; font-weight: 700; }
              .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; }
              .sheet.brk { break-before: page; page-break-before: always; }
              body.mode-odd .sheet:nth-child(even) { display: none; }
              body.mode-even .sheet:nth-child(odd) { display: none; }
            }
          </style>
          <style id="page-style"></style>
        </head>
        <body>
          <div class="toolbar">
            <b class="tb-brand">Print setup</b>
            <label>Paper
              <select id="tb-paper">
                <option value="auto">Printer default</option>
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
            <label>Margin <input id="tb-margin" type="number" min="0" max="25" step="1" /> mm</label>
            <label>Rows
              <select id="tb-density">
                <option value="normal">Normal</option>
                <option value="compact">Compact</option>
                <option value="tight">Tight</option>
              </select>
            </label>
            <label>Pages
              <select id="tb-mode">
                <option value="all">All</option>
                <option value="odd">Odd only</option>
                <option value="even">Even only</option>
              </select>
            </label>
            <span class="spacer"></span>
            <button id="tb-print" type="button">Print…</button>
          </div>
          <div class="tb-help" id="tb-help"></div>
          <div id="pages"></div>
          <div id="flow">
            ${headBlock}
            ${groupBlocks}
            ${footBlock}
          </div>
          <script>
            (function () {
              var PAPER = { A4: [210, 297], Letter: [215.9, 279.4] };
              var DENSITY = {
                normal: "",
                compact: ":root{--line-pad:3px;--head-gap:11px;--foot-gap:16px}.line{font-size:12.5px}.day-head{margin-bottom:3px}",
                tight: ":root{--line-pad:1px;--head-gap:8px;--foot-gap:12px}.line{font-size:11.5px}.day-head{margin-bottom:2px;font-size:10px;padding-bottom:4px}h1{font-size:19px}"
              };
              var SQUEEZE = [1, 0.75, 0.5, 0.3];
              var KEY = "wm_print_prefs";
              var prefs = { paper: "auto", marginMm: 8, density: "normal" };
              try {
                var saved = JSON.parse(localStorage.getItem(KEY) || "{}");
                if (saved.paper) prefs.paper = saved.paper;
                if (typeof saved.marginMm === "number") prefs.marginMm = saved.marginMm;
                if (saved.density) prefs.density = saved.density;
              } catch (e) {}

              var mode = "${mode}";
              var fitSqueeze = 1;
              var srcHTML = document.getElementById("flow").innerHTML;
              var pxPerMm = (function () {
                var d = document.createElement("div");
                d.style.cssText = "position:absolute;visibility:hidden;height:100mm";
                document.body.appendChild(d);
                var r = d.offsetHeight / 100;
                document.body.removeChild(d);
                return r || 3.7795;
              })();

              // getBoundingClientRect() stops at the border box, so a day
              // heading's top margin would go unbudgeted and every sheet would
              // silently run over the page it was measured for.
              function blockHeight(el) {
                var cs = getComputedStyle(el);
                return el.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
              }

              function savePrefs() {
                try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {}
              }

              // "Printer default" has to survive either tray, so pack to the
              // narrower width and the shorter height of A4 / Letter.
              function geom() {
                var w, h;
                if (prefs.paper === "auto") { w = 210; h = 279.4; }
                else { var d = PAPER[prefs.paper] || PAPER.A4; w = d[0]; h = d[1]; }
                return { w: w - prefs.marginMm * 2, h: h - prefs.marginMm * 2 - 9 };
              }

              function applyPageStyle(g, squeeze) {
                var css = prefs.paper === "auto"
                  ? "@page{margin:" + prefs.marginMm + "mm}"
                  : "@page{size:" + prefs.paper + ";margin:" + prefs.marginMm + "mm}";
                css += "@media screen{#flow{width:" + g.w + "mm}.sheet{width:" + g.w + "mm}}";
                css += DENSITY[prefs.density] || "";
                css += ":root{--squeeze:" + squeeze + "}";
                document.getElementById("page-style").textContent = css;
              }

              // One pagination pass at a given squeeze. Reports the sheet count
              // and how full the final sheet came out, so the caller can judge
              // whether a tighter pass is worth taking.
              function layout(squeeze) {
                var g = geom();
                applyPageStyle(g, squeeze);

                var flow = document.getElementById("flow");
                var pages = document.getElementById("pages");
                flow.innerHTML = srcHTML;
                pages.innerHTML = "";

                var usable = pxPerMm * g.h;
                var blocks = Array.prototype.slice.call(flow.children);
                var sheet = null, h = 0;
                function addSheet() {
                  sheet = document.createElement("div");
                  sheet.className = "sheet";
                  pages.appendChild(sheet);
                  h = 0;
                }
                addSheet();
                for (var i = 0; i < blocks.length; i++) {
                  var b = blocks[i];
                  var bh = blockHeight(b);
                  var next = blocks[i + 1];
                  // A day heading drags its first entry across with it, so it
                  // never sits stranded on its own at the foot of a sheet.
                  var need = bh;
                  if (b.classList.contains("day-head") && next && next.classList.contains("line")) {
                    need += blockHeight(next);
                  }
                  // The footer stays on the last sheet even when it only fits
                  // inside the bottom safety margin: a page carrying nothing
                  // but "Printed ..." is precisely the blank sheet to avoid.
                  if (h > 0 && h + need > usable && !b.classList.contains("printed-at")) {
                    var head = null;
                    for (var j = i - 1; j >= 0; j--) {
                      if (blocks[j].classList.contains("head-block")) break;
                      if (blocks[j].classList.contains("day-head")) { head = blocks[j]; break; }
                    }
                    addSheet();
                    if (head && b.classList.contains("line")) {
                      sheet.appendChild(head.cloneNode(true));
                      h += blockHeight(sheet.lastChild);
                    }
                  }
                  sheet.appendChild(b);
                  h += bh;
                }
                return { sheets: pages.children.length, fill: usable > 0 ? h / usable : 1 };
              }

              // A final sheet holding a line or two is mostly blank paper, so
              // re-run tighter and keep the first pass that actually drops it.
              function paginate() {
                var r = layout(1);
                fitSqueeze = 1;
                if (r.sheets > 1 && r.fill < 0.35) {
                  for (var s = 1; s < SQUEEZE.length; s++) {
                    var t = layout(SQUEEZE[s]);
                    if (t.sheets < r.sheets) { fitSqueeze = SQUEEZE[s]; break; }
                    if (s === SQUEEZE.length - 1) layout(1);
                  }
                }
                document.body.className = "mode-" + mode;
                applyBreaks();
                refreshHelp();
              }

              // Breaks go before each sheet that will actually print, so a
              // hidden sheet at the tail of an odd/even pass cannot push a
              // trailing blank page out of the printer.
              function applyBreaks() {
                var sheets = document.getElementById("pages").children;
                var first = true;
                for (var i = 0; i < sheets.length; i++) {
                  var hidden = (mode === "odd" && i % 2 === 1) || (mode === "even" && i % 2 === 0);
                  if (!hidden && !first) sheets[i].classList.add("brk");
                  else sheets[i].classList.remove("brk");
                  if (!hidden) first = false;
                }
              }

              function sheetCount() { return document.getElementById("pages").children.length; }
              function willPrint() {
                var t = sheetCount();
                if (mode === "odd") return Math.ceil(t / 2);
                if (mode === "even") return Math.floor(t / 2);
                return t;
              }

              function refreshHelp() {
                var total = sheetCount();
                var n = willPrint();
                var fix = " If the printer reports <b>Error</b>: set the dialog's <b>Margins</b> to <b>Default</b> (never <b>None</b> — this printer cannot print edge to edge), turn <b>Headers &amp; footers</b> off, and make <b>Paper</b> above match what is actually in the tray. If it still fails, print to <b>Microsoft Print to PDF</b> and print that file from a PDF viewer.";
                var msg;
                if (mode === "all") {
                  msg = "Report is <b>" + total + "</b> page" + (total === 1 ? "" : "s") + ".";
                } else if (n === 0) {
                  msg = "Nothing to print on the <b>" + mode + "</b> pass — the report is only " + total + " page.";
                } else {
                  var other = mode === "odd" ? "Even" : "Odd";
                  msg = "Manual two-sided: this pass prints <b>" + n + "</b> sheet" + (n === 1 ? "" : "s") +
                    " (the " + mode + " pages of " + total + "). When it finishes, flip the stack, switch <b>Pages</b> to <b>" +
                    other + " only</b>, and print again.";
                }
                if (fitSqueeze < 1) msg += " Spacing was tightened to save a near-empty last page.";
                document.getElementById("tb-help").innerHTML = msg + fix;
                document.getElementById("tb-print").disabled = n === 0;
              }

              var elPaper = document.getElementById("tb-paper");
              var elMargin = document.getElementById("tb-margin");
              var elDensity = document.getElementById("tb-density");
              var elMode = document.getElementById("tb-mode");
              elPaper.value = prefs.paper;
              elMargin.value = prefs.marginMm;
              elDensity.value = prefs.density;
              elMode.value = mode;

              elPaper.onchange = function () { prefs.paper = elPaper.value; savePrefs(); paginate(); };
              elDensity.onchange = function () { prefs.density = elDensity.value; savePrefs(); paginate(); };
              elMode.onchange = function () { mode = elMode.value; paginate(); };
              elMargin.onchange = function () {
                var v = parseInt(elMargin.value, 10);
                if (isNaN(v)) v = 8;
                v = Math.max(0, Math.min(25, v));
                prefs.marginMm = v;
                elMargin.value = v;
                savePrefs();
                paginate();
              };
              document.getElementById("tb-print").onclick = function () {
                if (willPrint() === 0) return;
                window.print();
              };

              paginate();
              setTimeout(function () {
                window.focus();
                if (willPrint() > 0) window.print();
              }, 500);
            })();
          </script>
        </body>
      </html>
    `);
    win.document.close();
  }

  return (
    <section className={"ledger" + (readOnly ? " readonly" : "")}>
      <div className="ledger-head">
        <div className="ledger-title">
          <span className="ledger-index">{index}</span>
          <h2>
            {title}
            {note && <span className="ledger-note">{note}</span>}
          </h2>
        </div>
        <div className="ledger-head-right">
          <span className="ledger-total">{fmt(petrolView ? petrolTotal : total)}</span>
          {printable && (
            <div className="print-controls">
              <label
                className="duplex-toggle"
                title="Two-sided (manual): print the odd sheets, flip the paper, then print the even sheets"
              >
                <input
                  type="checkbox"
                  checked={duplex}
                  onChange={(e) => setDuplex(e.target.checked)}
                />
                <span className="duplex-track">
                  <span className="duplex-thumb" />
                </span>
                <span className="duplex-label">2-sided</span>
              </label>
              {duplex ? (
                <>
                  <button type="button" className="ledger-print" onClick={() => handlePrint("odd", petrolView)}>
                    Odd
                  </button>
                  <button type="button" className="ledger-print" onClick={() => handlePrint("even", petrolView)}>
                    Even
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="ledger-print"
                  aria-label={petrolView ? "Print the petrol entries" : "Print"}
                  onClick={() => handlePrint("all", petrolView)}
                >
                  Print
                </button>
              )}
              {hasPetrol && (
                <button
                  type="button"
                  className={"ledger-print petrol-print" + (petrolView ? " on" : "")}
                  aria-pressed={petrolView}
                  title={
                    petrolView
                      ? "Back to the whole month"
                      : "Show only the entries marked as petrol — Print then prints just those"
                  }
                  onClick={() => {
                    setPetrolView((v) => {
                      // Picking needs every entry in front of you, so it cannot
                      // stay on behind a filtered list.
                      if (!v) setPicking(false);
                      return !v;
                    });
                  }}
                >
                  Petrol
                </button>
              )}
            </div>
          )}
          {onRemove && (
            <button type="button" className="ledger-remove" aria-label="Remove notepad" onClick={onRemove}>
              ×
            </button>
          )}
        </div>
      </div>

      {hasBudget && !petrolView && (
        <div className="budget-strip">
          {readOnly ? (
            <span className="budget-static">
              Budget <strong>{fmt(budget)}</strong>
            </span>
          ) : (
            <label>
              <span>Budget</span>
              <input
                type="number"
                min="0"
                step="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </label>
          )}
          <span className={"remaining" + (remaining < 0 ? " negative" : "")}>Remaining {fmt(remaining)}</span>
        </div>
      )}

      {hasDescription && !petrolView &&
        (readOnly ? (
          description ? <p className="description-static">{description}</p> : null
        ) : (
          <textarea
            className="description-field"
            placeholder={descriptionPlaceholder}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        ))}

      {hasPetrol && (petrolRows.length > 0 || !readOnly) && (
        <div className={"petrol-bar" + (picking ? " picking" : "")}>
          {!readOnly && !petrolView && (
            <button
              type="button"
              className={"add-row petrol-pick" + (picking ? " on" : "")}
              aria-pressed={picking}
              onClick={() => setPicking((p) => !p)}
            >
              {picking ? "Done selecting petrol" : "Select petrol entries"}
            </button>
          )}
          <span className="petrol-summary">
            Petrol <strong>{fmt(petrolTotal)}</strong>
            <span className="petrol-count">{petrolRows.length === 1 ? "1 entry" : `${petrolRows.length} entries`}</span>
          </span>
        </div>
      )}

      {hasPetrol && picking && !petrolView && (
        <p className="petrol-hint">
          Click an entry to shade it into petrol. Shaded entries still count towards the budget — the Petrol
          button at the top then shows them on their own.
        </p>
      )}

      {hasPetrol && petrolView && (
        <p className="petrol-hint">
          Petrol only — the budget and the note are hidden because they belong to the whole month. Print now
          prints just this list.
        </p>
      )}

      {hasDay ? (
        <div className={"rows grouped" + (picking ? " picking-rows" : "")}>
          {visible.length === 0 && (
            <p className="empty-hint">
              {petrolView
                ? "No entries are marked as petrol yet."
                : readOnly
                ? "No entries were recorded this month."
                : "No entries yet."}
            </p>
          )}
          {groupVisibleByDay().map(({ day, indices }) => {
            const dayTotal = indices.reduce((sum, i) => sum + (Number(rows[i].price) || 0), 0);
            return (
              <div className="day-group" key={day || "undated"}>
                <div className="day-group-head">
                  <span className="day-label">{displayDay(day)}</span>
                  <span className="day-total">{fmt(dayTotal)}</span>
                </div>
                {indices.map((idx) =>
                  readOnly ? (
                    <div key={idx} {...rowProps(idx)}>
                      <span className="cell-name-static">{rows[idx].name || "—"}</span>
                      <span className="cell-price-static">{fmt(rows[idx].price)}</span>
                    </div>
                  ) : (
                    <div key={idx} {...rowProps(idx)}>
                      <input
                        className="cell-name"
                        type="text"
                        placeholder={namePlaceholder}
                        value={rows[idx].name}
                        onChange={(e) => updateRow(idx, "name", e.target.value)}
                      />
                      <input
                        className="cell-price"
                        type="number"
                        placeholder="0"
                        step="1"
                        value={rows[idx].price}
                        onChange={(e) => updateRow(idx, "price", e.target.value)}
                      />
                      <button type="button" className="cell-del" aria-label="Remove row" onClick={() => removeRow(idx)}>
                        ×
                      </button>
                    </div>
                  )
                )}
                {!readOnly && !petrolView && (
                  <button type="button" className="add-row day-add" onClick={() => addRowToDay(day)}>
                    + Add to {displayDay(day)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className={"rows" + (picking ? " picking-rows" : "")}>
            {visible.length === 0 && (
              <p className="empty-hint">
                {petrolView
                  ? "No entries are marked as petrol yet."
                  : readOnly
                  ? "No entries were recorded this month."
                  : "No entries yet — add one below."}
              </p>
            )}
            {visible.map((idx) =>
              readOnly ? (
                <div key={idx} {...rowProps(idx)}>
                  <span className="cell-name-static">{rows[idx].name || "—"}</span>
                  <span className="cell-price-static">{fmt(rows[idx].price)}</span>
                </div>
              ) : (
                <div key={idx} {...rowProps(idx)}>
                  <input
                    className="cell-name"
                    type="text"
                    placeholder={namePlaceholder}
                    value={rows[idx].name}
                    onChange={(e) => updateRow(idx, "name", e.target.value)}
                  />
                  <input
                    className="cell-price"
                    type="number"
                    placeholder="0"
                    step="1"
                    value={rows[idx].price}
                    onChange={(e) => updateRow(idx, "price", e.target.value)}
                  />
                  <button type="button" className="cell-del" aria-label="Remove row" onClick={() => removeRow(idx)}>
                    ×
                  </button>
                </div>
              )
            )}
          </div>
          {!readOnly && !petrolView && (
            <button type="button" className="add-row" onClick={addRow}>
              + {addLabel || "Add item"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
