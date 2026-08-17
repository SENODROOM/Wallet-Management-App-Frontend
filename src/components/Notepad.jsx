import React, { useEffect, useState } from "react";
import { api } from "../api";
import Ledger from "./Ledger.jsx";

const STATUS_LABEL = { saving: "Saving…", saved: "Synced", error: "Save failed" };

export default function Notepad({ email, onLoggedOut }) {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState("saved");

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
        <p>Quantum Logics Income, Poly Learning Initiative, an adjustable Monthly Budget, and your Wallets.</p>
      </header>

      {loadError && (
        <div className="load-error">
          Could not load data from the server. Make sure the backend is running and MongoDB is reachable.
        </div>
      )}

      {state && (
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
          />
          <Ledger
            index="03"
            title="Monthly Budget"
            note="Amount Adjustable"
            section="monthly"
            hasDay={true}
            hasBudget={true}
            initialItems={state.monthly.items}
            initialBudget={state.monthly.budget}
            onStatus={setStatus}
          />
          <Ledger
            index="04"
            title="Wallets"
            section="wallets"
            hasDay={false}
            hasBudget={false}
            namePlaceholder="Wallet name"
            addLabel="Create Wallet"
            initialItems={state.wallets.items}
            initialBudget={0}
            onStatus={setStatus}
          />
        </>
      )}

      <footer>Data is stored in MongoDB via the Express API. Changes save automatically a moment after you stop typing.</footer>
    </div>
  );
}
