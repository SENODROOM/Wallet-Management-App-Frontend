import React, { useEffect, useRef, useState } from "react";
import { api, fmt } from "../api";

export default function Ledger({
  index,
  title,
  note,
  section,
  hasDay,
  hasBudget,
  initialItems,
  initialBudget,
  onStatus
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
    setRows((prev) => [...prev, hasDay ? { day: "", name: "", price: 0 } : { name: "", price: 0 }]);
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

      <div className={"rows" + (hasDay ? " with-day" : "")}>
        {rows.length === 0 && <p className="empty-hint">No entries yet — add one below.</p>}
        {rows.map((row, idx) => (
          <div className="row" key={idx}>
            {hasDay && (
              <input
                className="cell-day"
                type="text"
                placeholder="Day"
                value={row.day}
                onChange={(e) => updateRow(idx, "day", e.target.value)}
              />
            )}
            <input
              className="cell-name"
              type="text"
              placeholder="Item name"
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
        + Add {hasDay ? "entry" : "item"}
      </button>
    </section>
  );
}
