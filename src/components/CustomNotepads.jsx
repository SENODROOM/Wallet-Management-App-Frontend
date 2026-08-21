import React, { useEffect, useState } from "react";
import { api } from "../api";
import Ledger from "./Ledger.jsx";

export default function CustomNotepads({ startIndex, onStatus, onPriceDelta, onCountChange }) {
  const [notepads, setNotepads] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHasBudget, setNewHasBudget] = useState(false);

  useEffect(() => {
    api
      .getNotepads()
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        setNotepads(await res.json());
      })
      .catch(() => setNotepads([]));
  }, []);

  useEffect(() => {
    if (notepads !== null) onCountChange?.(notepads.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notepads]);

  function startCreate() {
    setCreating(true);
    setNewName("");
    setNewHasBudget(false);
  }

  function cancelCreate() {
    setCreating(false);
    setNewName("");
    setNewHasBudget(false);
  }

  function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    onStatus("saving");
    api
      .createNotepad({ name, hasBudget: newHasBudget })
      .then(async (res) => {
        if (!res.ok) throw new Error("create failed");
        const doc = await res.json();
        setNotepads((prev) => [...(prev || []), doc]);
        onStatus("saved");
      })
      .catch(() => onStatus("error"));
    setCreating(false);
  }

  function handleNameKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitCreate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelCreate();
    }
  }

  function removeNotepad(id) {
    setNotepads((prev) => (prev || []).filter((n) => n._id !== id));
    onStatus("saving");
    api
      .deleteNotepad(id)
      .then((res) => {
        if (!res.ok) throw new Error("delete failed");
        onStatus("saved");
      })
      .catch(() => onStatus("error"));
  }

  if (notepads === null) return null;

  return (
    <>
      {notepads.map((n, i) => (
        <Ledger
          key={n._id}
          index={String(startIndex + i).padStart(2, "0")}
          title={n.name}
          hasDay={false}
          hasBudget={n.hasBudget}
          initialItems={n.items}
          initialBudget={n.budget}
          onStatus={onStatus}
          onPriceDelta={onPriceDelta}
          onSave={(payload) => api.putNotepad(n._id, payload)}
          onRemove={() => {
            if (window.confirm(`Delete "${n.name}" and all its entries?`)) removeNotepad(n._id);
          }}
        />
      ))}

      {creating ? (
        <div className="notepad-create-box">
          <input
            type="text"
            className="notepad-create-name"
            placeholder="Notepad name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            autoFocus
          />
          <label className="notepad-create-budget">
            <input type="checkbox" checked={newHasBudget} onChange={(e) => setNewHasBudget(e.target.checked)} />
            Track a budget
          </label>
          <button type="button" className="notepad-create-confirm" onClick={submitCreate} disabled={!newName.trim()}>
            Create
          </button>
          <button type="button" className="notepad-create-cancel" onClick={cancelCreate}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="notepad-add-btn" onClick={startCreate}>
          <span className="notepad-add-plus">+</span> Add Notepad
        </button>
      )}
    </>
  );
}
