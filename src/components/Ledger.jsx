import React, { useEffect, useRef, useState } from "react";
import { api, fmt } from "../api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function todayLabel() {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
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
  initialItems,
  initialBudget,
  onStatus,
  namePlaceholder = "Item name",
  addLabel
}) {
  const [rows, setRows] = useState(() =>
    (initialItems || []).map((r) => ({ day: r.day || "", name: r.name || "", price: Number(r.price) || 0 }))
  );
  const [budget, setBudget] = useState(Number(initialBudget) || 0);
  const mounted = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const payload = { items: rows };
      if (hasBudget) payload.budget = budget;
      api
        .putSection(section, payload)
        .then((res) => {
          if (res.status === 401) {
            window.location.reload();
            return;
          }
          if (!res.ok) throw new Error("save failed");
          onStatus("saved");
        })
        .catch(() => onStatus("error"));
    }, 500);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, budget]);

  useEffect(() => {
    if (!hasDay) return;
    const label = todayLabel();
    setRows((prev) => (prev.some((r) => r.day === label) ? prev : [...prev, { day: label, name: "", price: 0 }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = rows.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  const remaining = budget - total;

  function updateRow(idx, field, value) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === "price" ? (value === "" ? 0 : Number(value)) : value };
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
    setRows((prev) => prev.filter((_, i) => i !== idx));
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
        <span className="ledger-total">{fmt(total)}</span>
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

      {hasDay ? (
        <div className="rows grouped">
          {rows.length === 0 && <p className="empty-hint">No entries yet.</p>}
          {groupByDay(rows).map(({ day, indices }) => {
            const dayTotal = indices.reduce((sum, i) => sum + (Number(rows[i].price) || 0), 0);
            return (
              <div className="day-group" key={day || "undated"}>
                <div className="day-group-head">
                  <span className="day-label">{day || "Undated"}</span>
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
                  + Add to {day || "Undated"}
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
