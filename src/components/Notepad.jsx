import React, { useEffect, useRef, useState } from "react";
import { api, fmt } from "../api";
import Ledger from "./Ledger.jsx";
import Wallets from "./Wallets.jsx";
import CustomNotepads from "./CustomNotepads.jsx";

const STATUS_LABEL = { saving: "Saving…", saved: "Synced", error: "Save failed" };
const ADMIN_EMAIL = "saadamin691@gmail.com";

export default function Notepad({ email, name, onLoggedOut }) {
  const isAdmin = email === ADMIN_EMAIL;
  const firstName = (name || "").trim().split(/\s+/)[0] || "Your";
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState("saved");
  const [walletsTotal, setWalletsTotal] = useState(0);
  const [monthlyRemaining, setMonthlyRemaining] = useState(0);
  const [notepadsCount, setNotepadsCount] = useState(isAdmin ? 2 : null);
  const walletsRef = useRef(null);
  const userIncome = walletsTotal - monthlyRemaining;
  const tailReady = isAdmin || notepadsCount !== null;
  const monthlyIndex = isAdmin ? "03" : String((notepadsCount || 0) + 1).padStart(2, "0");
  const walletsIndex = isAdmin ? "04" : String((notepadsCount || 0) + 2).padStart(2, "0");

  function handlePriceDelta(delta) {
    walletsRef.current?.adjustBalance(delta);
  }

  useEffect(() => {
    api
      .getState()
      .then(async (res) => {
        if (res.status === 401) return onLoggedOut();
        if (!res.ok) throw new Error("Request failed: " + res.status);
        setState(await res.json());
      })
      .catch(() => setLoadError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function warnIfUnsaved(e) {
      if (status === "saving" || status === "error") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warnIfUnsaved);
    return () => window.removeEventListener("beforeunload", warnIfUnsaved);
  }, [status]);

  async function logout() {
    await api.logout().catch(() => {});
    onLoggedOut();
  }

  return (
    <div className="page">
      <div className="utility-bar">
        <span className={"status-dot " + status} />
        <span className="status-label">{STATUS_LABEL[status] || status}</span>
        <span className="utility-spacer" />
        <span className="user-email">{email}</span>
        <button type="button" className="logout-link" onClick={logout}>
          Log out
        </button>
      </div>

      <header className="masthead">
        <h1>Wallet Notepad</h1>
        <p>
          {isAdmin
            ? "Quantum Logics Income, Poly Learning Initiative, an adjustable Monthly Budget, and your Wallets."
            : "Your own notepads, an adjustable Monthly Budget, and your Wallets."}
        </p>
      </header>

      {loadError && (
        <div className="load-error">
          Could not load data from the server. Make sure the backend is running and MongoDB is reachable.
        </div>
      )}

      {state && (
        <>
          {isAdmin ? (
            <>
              <Ledger
                index="01"
                title="Quantum Logics Income"
                section="income"
                hasDay={false}
                hasBudget={false}
                initialItems={state.income.items}
                initialBudget={0}
                onStatus={setStatus}
                onPriceDelta={handlePriceDelta}
              />
              <Ledger
                index="02"
                title="Poly Learning Initiative"
                section="poly"
                hasDay={false}
                hasBudget={true}
                initialItems={state.poly.items}
                initialBudget={state.poly.budget}
                onStatus={setStatus}
                onPriceDelta={handlePriceDelta}
              />
            </>
          ) : (
            <CustomNotepads
              startIndex={1}
              onStatus={setStatus}
              onPriceDelta={handlePriceDelta}
              onCountChange={setNotepadsCount}
            />
          )}

          {tailReady && (
            <>
              <Ledger
                index={monthlyIndex}
                title="Monthly Budget"
                note="Amount Adjustable"
                section="monthly"
                hasDay={true}
                hasBudget={true}
                hasDescription={true}
                descriptionPlaceholder="Add a note about this month's budget…"
                initialItems={state.monthly.items}
                initialBudget={state.monthly.budget}
                initialDescription={state.monthly.description}
                onStatus={setStatus}
                onPriceDelta={handlePriceDelta}
                onRemainingChange={setMonthlyRemaining}
              />
              <Wallets
                ref={walletsRef}
                index={walletsIndex}
                title="Wallets"
                section="wallets"
                initialItems={state.wallets.items}
                onStatus={setStatus}
                onTotalChange={setWalletsTotal}
              />
            </>
          )}
        </>
      )}

      {state && (
        <div className="income-stat">
          {firstName} Income: <strong>{fmt(userIncome)}</strong>
        </div>
      )}

      <footer>For customization contact us +92 3714467235 — © Muhammad Saad Amin @SENODROOM</footer>
    </div>
  );
}
