import React, { useState } from "react";
import { api } from "../api";

export default function NameModal({ onSaved }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError("");
    setBusy(true);
    try {
      const res = await api.setName(trimmed);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Something went wrong.");
        return;
      }
      onSaved(body.name);
    } catch (err) {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h1 className="modal-title">Welcome</h1>
        <p className="modal-subtitle">What should we call you? This is used to personalize your notepad.</p>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={submit}>
          <label>
            Your name
            <input
              type="text"
              required
              autoFocus
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !name.trim()}>
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
