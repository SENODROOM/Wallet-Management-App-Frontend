import React, { useEffect, useRef, useState } from "react";
import { api, fmt } from "../api";

export default function Wallets({ index, title, section, initialItems, onStatus }) {
  const [wallets, setWallets] = useState(() =>
    (initialItems || []).map((w) => ({
      name: w.name || "",
      price: Number(w.price) || 0,
      items: (w.items || []).map((i) => ({ name: i.name || "", price: Number(i.price) || 0 }))
    }))
  );
  const [expanded, setExpanded] = useState(() => new Set());
  const mounted = useRef(false);
  const timer = useRef(null);
  const latestPayload = useRef(null);

  function save(payload, attempt = 0) {
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
    const payload = { items: wallets };
    latestPayload.current = payload;

    onStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      save(payload);
    }, 500);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  useEffect(() => {
    function flush() {
      if (timer.current && latestPayload.current) {
        clearTimeout(timer.current);
        timer.current = null;
        api.putSection(section, latestPayload.current).catch(() => {});
      }
    }
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleExpanded(idx) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function updateWallet(idx, field, value) {
    setWallets((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === "price" ? (value === "" ? 0 : Number(value)) : value };
      return next;
    });
  }

  function addWallet() {
    setWallets((prev) => {
      setExpanded((exp) => new Set(exp).add(prev.length));
      return [...prev, { name: "", price: 0, items: [] }];
    });
  }

  function removeWallet(idx) {
    setWallets((prev) => prev.filter((_, i) => i !== idx));
    setExpanded((prev) => {
      const next = new Set();
      prev.forEach((i) => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
  }

  function updateItem(walletIdx, itemIdx, field, value) {
    setWallets((prev) => {
      const next = [...prev];
      const items = [...next[walletIdx].items];
      items[itemIdx] = { ...items[itemIdx], [field]: field === "price" ? (value === "" ? 0 : Number(value)) : value };
      next[walletIdx] = { ...next[walletIdx], items };
      return next;
    });
  }

  function addItem(walletIdx) {
    setWallets((prev) => {
      const next = [...prev];
      next[walletIdx] = { ...next[walletIdx], items: [...next[walletIdx].items, { name: "", price: 0 }] };
      return next;
    });
  }

  function removeItem(walletIdx, itemIdx) {
    setWallets((prev) => {
      const next = [...prev];
      next[walletIdx] = { ...next[walletIdx], items: next[walletIdx].items.filter((_, i) => i !== itemIdx) };
      return next;
    });
  }

  const walletTotal = (w) => (Number(w.price) || 0) + w.items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  const grandTotal = wallets.reduce((sum, w) => sum + walletTotal(w), 0);

  return (
    <section className="ledger">
      <div className="ledger-head">
        <div className="ledger-title">
          <span className="ledger-index">{index}</span>
          <h2>{title}</h2>
        </div>
        <span className="ledger-total">{fmt(grandTotal)}</span>
      </div>

      <div className="wallet-list">
        {wallets.length === 0 && <p className="empty-hint">No wallets yet — create one below.</p>}
        {wallets.map((wallet, widx) => {
          const isOpen = expanded.has(widx);
          return (
            <div className="wallet-group" key={widx}>
              <div className="wallet-head">
                <button
                  type="button"
                  className={"wallet-toggle" + (isOpen ? " active" : "")}
                  aria-label={isOpen ? "Collapse wallet" : "Select wallet"}
                  aria-pressed={isOpen}
                  onClick={() => toggleExpanded(widx)}
                />
                <input
                  className="wallet-name"
                  type="text"
                  placeholder="Wallet name"
                  value={wallet.name}
                  onChange={(e) => updateWallet(widx, "name", e.target.value)}
                />
                <input
                  className="wallet-balance"
                  type="number"
                  placeholder="0"
                  step="1"
                  value={wallet.price}
                  onChange={(e) => updateWallet(widx, "price", e.target.value)}
                />
                <span className="wallet-total">{fmt(walletTotal(wallet))}</span>
                <button
                  type="button"
                  className="cell-del"
                  aria-label="Remove wallet"
                  onClick={() => removeWallet(widx)}
                >
                  ×
                </button>
              </div>

              {isOpen && (
                <div className="wallet-items">
                  {wallet.items.map((item, iidx) => (
                    <div className="row" key={iidx}>
                      <input
                        className="cell-name"
                        type="text"
                        placeholder="Item name"
                        value={item.name}
                        onChange={(e) => updateItem(widx, iidx, "name", e.target.value)}
                      />
                      <input
                        className="cell-price"
                        type="number"
                        placeholder="0"
                        step="1"
                        value={item.price}
                        onChange={(e) => updateItem(widx, iidx, "price", e.target.value)}
                      />
                      <button
                        type="button"
                        className="cell-del"
                        aria-label="Remove item"
                        onClick={() => removeItem(widx, iidx)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button type="button" className="add-row" onClick={() => addItem(widx)}>
                    + Add item
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="add-row" onClick={addWallet}>
        + Create Wallet
      </button>
    </section>
  );
}
