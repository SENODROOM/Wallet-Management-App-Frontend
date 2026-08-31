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
  printable,
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
    (initialItems || []).map((r) => ({ day: canonicalDay(r.day || ""), name: r.name || "", price: Number(r.price) || 0 }))
  );
  const [budget, setBudget] = useState(Number(initialBudget) || 0);
  const [description, setDescription] = useState(initialDescription || "");
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
    if (!hasDay) return;
    const label = todayLabel();
    setRows((prev) => (prev.some((r) => r.day === label) ? prev : [...prev, { day: label, name: "", price: 0 }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = rows.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  const remaining = budget - total;

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
    setRows((prev) => [...prev, hasDay ? { day: todayLabel(), name: "", price: 0 } : { name: "", price: 0 }]);
  }

  function addRowToDay(day) {
    setRows((prev) => [...prev, { day, name: "", price: 0 }]);
  }

  function removeRow(idx) {
    if (onPriceDelta) onPriceDelta(-(Number(rows[idx].price) || 0));
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handlePrint() {
    const now = new Date();
    const monthYear = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    const groups = hasDay ? groupByDay(rows) : [{ day: "", indices: rows.map((_, i) => i) }];

    const groupsHtml = groups
      .map(({ day, indices }) => {
        const dayTotal = indices.reduce((sum, i) => sum + (Number(rows[i].price) || 0), 0);
        const itemsHtml = indices
          .map((i) => {
            const row = rows[i];
            return `<tr><td>${escapeHtml(row.name || "—")}</td><td class="amt">${escapeHtml(fmt(row.price))}</td></tr>`;
          })
          .join("");
        return `
          <table>
            ${day ? `<caption>${escapeHtml(displayDay(day))} <span class="amt">${escapeHtml(fmt(dayTotal))}</span></caption>` : ""}
            <tbody>${itemsHtml || `<tr><td colspan="2" class="empty">No entries</td></tr>`}</tbody>
          </table>`;
      })
      .join("");

    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) return;
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(title)} — ${escapeHtml(monthYear)}</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: Georgia, "Iowan Old Style", serif; color: #211f1a; max-width: 640px; margin: 40px auto; padding: 0 20px; }
            h1 { font-size: 22px; font-weight: 400; margin: 0 0 2px; }
            .subtitle { color: #6e6a5c; font-size: 13px; margin: 0 0 22px; }
            .summary { display: flex; justify-content: space-between; border-top: 1px solid #c7bea6; border-bottom: 1px solid #c7bea6; padding: 10px 0; margin-bottom: 18px; font-size: 14px; }
            .summary div { text-align: center; flex: 1; }
            .summary strong { display: block; font-size: 16px; margin-top: 2px; }
            .negative { color: #a24132; }
            .description { font-style: italic; color: #6e6a5c; font-size: 13px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            caption { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #6e6a5c; border-bottom: 1px solid #c7bea6; padding-bottom: 6px; margin-bottom: 4px; display: flex; justify-content: space-between; }
            caption .amt { text-transform: none; letter-spacing: 0; }
            td { padding: 5px 0; border-bottom: 1px solid #ddd6c4; font-size: 13.5px; }
            td.amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
            td.empty { color: #9a9482; font-style: italic; }
            .printed-at { color: #9a9482; font-size: 11px; margin-top: 24px; }
            @page { size: A4; margin: 12mm; }
            @media print {
              body { max-width: none; width: 100%; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              table { page-break-inside: auto; }
              tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <p class="subtitle">${escapeHtml(monthYear)}</p>
          ${hasBudget ? `
            <div class="summary">
              <div>Budget<strong>${escapeHtml(fmt(budget))}</strong></div>
              <div>Spent<strong>${escapeHtml(fmt(total))}</strong></div>
              <div>Remaining<strong class="${remaining < 0 ? "negative" : ""}">${escapeHtml(fmt(remaining))}</strong></div>
            </div>` : ""}
          ${description ? `<p class="description">${escapeHtml(description)}</p>` : ""}
          ${groupsHtml}
          <p class="printed-at">Printed ${escapeHtml(now.toLocaleString())}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <section className="ledger">
      <div className="ledger-head">
        <div className="ledger-title">
          <span className="ledger-index">{index}</span>
          <h2>
            {title}
            {note && <span className="ledger-note">{note}</span>}
          </h2>
        </div>
        <div className="ledger-head-right">
          <span className="ledger-total">{fmt(total)}</span>
          {printable && (
            <button type="button" className="ledger-print" aria-label="Print" onClick={handlePrint}>
              Print
            </button>
          )}
          {onRemove && (
            <button type="button" className="ledger-remove" aria-label="Remove notepad" onClick={onRemove}>
              ×
            </button>
          )}
        </div>
      </div>

      {hasBudget && (
        <div className="budget-strip">
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
          <span className={"remaining" + (remaining < 0 ? " negative" : "")}>Remaining {fmt(remaining)}</span>
        </div>
      )}

      {hasDescription && (
        <textarea
          className="description-field"
          placeholder={descriptionPlaceholder}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      )}

      {hasDay ? (
        <div className="rows grouped">
          {rows.length === 0 && <p className="empty-hint">No entries yet.</p>}
          {groupByDay(rows).map(({ day, indices }) => {
            const dayTotal = indices.reduce((sum, i) => sum + (Number(rows[i].price) || 0), 0);
            return (
              <div className="day-group" key={day || "undated"}>
                <div className="day-group-head">
                  <span className="day-label">{displayDay(day)}</span>
                  <span className="day-total">{fmt(dayTotal)}</span>
                </div>
                {indices.map((idx) => (
                  <div className="row" key={idx}>
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
                ))}
                <button type="button" className="add-row day-add" onClick={() => addRowToDay(day)}>
                  + Add to {displayDay(day)}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="rows">
            {rows.length === 0 && <p className="empty-hint">No entries yet — add one below.</p>}
            {rows.map((row, idx) => (
              <div className="row" key={idx}>
                <input
                  className="cell-name"
                  type="text"
                  placeholder={namePlaceholder}
                  value={row.name}
                  onChange={(e) => updateRow(idx, "name", e.target.value)}
                />
                <input
                  className="cell-price"
                  type="number"
                  placeholder="0"
                  step="1"
                  value={row.price}
                  onChange={(e) => updateRow(idx, "price", e.target.value)}
                />
                <button type="button" className="cell-del" aria-label="Remove row" onClick={() => removeRow(idx)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="add-row" onClick={addRow}>
            + {addLabel || "Add item"}
          </button>
        </>
      )}
    </section>
  );
}
