import React, { useEffect, useRef, useState } from "react";
import { api, fmt } from "../api";
import Ledger from "./Ledger.jsx";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// The month boundary is the user's, not the server's: the browser is the only
// side that knows the local date, so it names the period and the server follows.
function currentPeriod(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shortLabel(period) {
  if (!period) return "";
  return `${SHORT[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}

function fullLabel(period) {
  if (!period) return "";
  return `${FULL[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}

export default function MonthlyBudget({ index, initial, onStatus, onPriceDelta, onRemainingChange }) {
  const [period, setPeriod] = useState(initial.period || currentPeriod());
  const [live, setLive] = useState(initial);
  const [history, setHistory] = useState([]);
  const [archives, setArchives] = useState({});
  const [viewing, setViewing] = useState(null);
  const [archiveError, setArchiveError] = useState("");
  const [rolled, setRolled] = useState(null);
  // Entries loaded from an unfinished month can be about to be archived, so the
  // live ledger waits for the rollover instead of briefly showing last month's
  // list — and, more importantly, instead of autosaving it back afterwards.
  const [ready, setReady] = useState(initial.period === currentPeriod());
  const [ledgerKey, setLedgerKey] = useState(0);
  const [syncError, setSyncError] = useState("");
  const periodRef = useRef(period);
  const keyRef = useRef(ledgerKey);
  const chipsRef = useRef(null);

  periodRef.current = period;
  keyRef.current = ledgerKey;

  async function sync() {
    try {
      const res = await api.rolloverMonthly(currentPeriod());
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSyncError("");
      setPeriod(data.period);
      setLive(data.monthly);
      setHistory(data.history || []);
      if (data.archived) {
        setRolled(data.archived);
        // Remount the ledger so it picks up the cleared month.
        setLedgerKey((k) => k + 1);
        setViewing(null);
      }
    } catch (err) {
      // Offline, or the API does not have the route yet. Stay in the month the
      // section already carries rather than leaving the ledger stuck behind a
      // spinner — but say so, because the alternative is a budget that silently
      // never rolls over.
      setSyncError(err.message || "unreachable");
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    sync();
    // A tab left open across midnight on the 1st should roll over on its own
    // rather than filing tomorrow's spending under last month.
    const id = setInterval(() => {
      if (currentPeriod() !== periodRef.current) sync();
    }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the live month in view when the strip grows past the available width.
  useEffect(() => {
    if (viewing || !chipsRef.current) return;
    chipsRef.current.scrollLeft = chipsRef.current.scrollWidth;
  }, [history.length, viewing]);

  // A save is addressed to the month and the ledger it was typed in. If a
  // rollover has since archived that month, the write would put the archived
  // entries straight back into the live section, so it is dropped. The ledger
  // key moves even when the month does not — a section can be repaired into the
  // month it is already stamped with.
  function saveLive(payload, forPeriod, forKey) {
    if (forPeriod !== periodRef.current || forKey !== keyRef.current) {
      return Promise.resolve({ ok: true, status: 200 });
    }
    return api.putSection("monthly", { ...payload, period: forPeriod });
  }

  function openMonth(next) {
    setArchiveError("");
    if (next === period) {
      setViewing(null);
      return;
    }
    setViewing(next);
    if (archives[next]) return;
    api
      .getMonthlyArchive(next)
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        setArchives((prev) => ({ ...prev, [next]: data }));
      })
      .catch(() => setArchiveError(next));
  }

  const archive = viewing ? archives[viewing] : null;
  const livePeriod = period;

  return (
    <div className="monthly-block">
      <div className="month-strip">
        <span className="month-strip-label">Months</span>
        <div className="month-chips" ref={chipsRef}>
          {history.map((entry) => (
            <button
              type="button"
              key={entry.period}
              className={"month-chip" + (viewing === entry.period ? " active" : "")}
              aria-pressed={viewing === entry.period}
              onClick={() => openMonth(entry.period)}
            >
              <span className="month-chip-name">{shortLabel(entry.period)}</span>
              <span className="month-chip-amount">{fmt(entry.total)}</span>
            </button>
          ))}
          <button
            type="button"
            className={"month-chip current" + (viewing ? "" : " active")}
            aria-pressed={!viewing}
            onClick={() => openMonth(livePeriod)}
          >
            <span className="month-chip-name">{shortLabel(livePeriod)}</span>
            <span className="month-chip-tag">Current</span>
          </button>
        </div>
      </div>

      {syncError && !viewing && (
        <p className="month-sync-error">
          Could not open this month with the server ({syncError}) — the entries below may still belong to a
          month that has already finished.
        </p>
      )}

      {rolled && !viewing && (
        <p className="month-rolled">
          {fullLabel(rolled)} was saved to the months above — this budget starts fresh from 1 {shortLabel(livePeriod)}.
        </p>
      )}

      {viewing && (
        <>
          <div className="month-archive-note">
            <span>Saved record — {fullLabel(viewing)}. Read only.</span>
            <button type="button" className="month-back" onClick={() => setViewing(null)}>
              Back to {shortLabel(livePeriod)}
            </button>
          </div>
          {archiveError === viewing ? (
            <p className="empty-hint">Could not load {shortLabel(viewing)}.</p>
          ) : archive ? (
            <Ledger
              key={`archive-${viewing}`}
              index={index}
              title="Monthly Budget"
              note={shortLabel(viewing)}
              section="monthly"
              hasDay={true}
              hasBudget={true}
              printable={true}
              hasDescription={true}
              readOnly={true}
              periodLabel={shortLabel(viewing)}
              initialItems={archive.items}
              initialBudget={archive.budget}
              initialDescription={archive.description}
              onStatus={onStatus}
            />
          ) : (
            <p className="empty-hint">Loading {shortLabel(viewing)}…</p>
          )}
        </>
      )}

      {/* The live month stays mounted behind an open record: it holds edits
          that have not been debounced to the server yet, and unmounting it
          would drop the row currently being typed. */}
      <div className="monthly-live" hidden={!!viewing}>
        {ready ? (
          <Ledger
            key={`live-${livePeriod}-${ledgerKey}`}
            index={index}
            title="Monthly Budget"
            note="Amount Adjustable"
            section="monthly"
            hasDay={true}
            hasBudget={true}
            printable={true}
            hasDescription={true}
            descriptionPlaceholder="Add a note about this month's budget…"
            periodLabel={shortLabel(livePeriod)}
            initialItems={live.items}
            initialBudget={live.budget}
            initialDescription={live.description}
            onStatus={onStatus}
            onPriceDelta={onPriceDelta}
            onRemainingChange={onRemainingChange}
            onSave={(payload) => saveLive(payload, livePeriod, ledgerKey)}
          />
        ) : (
          <p className="empty-hint">Opening {shortLabel(currentPeriod())}…</p>
        )}
      </div>
    </div>
  );
}
