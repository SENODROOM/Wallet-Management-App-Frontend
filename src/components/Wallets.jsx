import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api, fmt } from "../api";

const Wallets = forwardRef(function Wallets({ index, title, section, initialItems, onStatus, onTotalChange }, ref) {
  const [wallets, setWallets] = useState(() =>
    (initialItems || []).map((w) => ({
      name: w.name || "",
      price: Number(w.price) || 0,
      items: (w.items || []).map((i) => ({ name: i.name || "", price: Number(i.price) || 0 }))
    }))
  );
  const [activeIndex, setActiveIndex] = useState(null);
  const [adjust, setAdjust] = useState(null); // { idx, mode: "add" | "sub" } | null
  const [adjustValue, setAdjustValue] = useState("");
  const [transferTarget, setTransferTarget] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const mounted = useRef(false);
  const timer = useRef(null);
  const latestPayload = useRef(null);
  const adjustInputRef = useRef(null);
  const skipNextSchedule = useRef(false);

  useImperativeHandle(ref, () => ({
    // Called when an item's price changes elsewhere (Income/Poly/Monthly) so
    // the currently selected wallet's balance tracks it automatically.
    adjustBalance(delta) {
      setWallets((prev) => {
        if (activeIndex === null || !prev[activeIndex]) return prev;
        const next = [...prev];
        next[activeIndex] = { ...next[activeIndex], price: (Number(next[activeIndex].price) || 0) - delta };
        return next;
      });
    }
  }));

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
    if (skipNextSchedule.current) {
      skipNextSchedule.current = false;
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

  // Explicit confirm actions (adjust OK, transfer) save right away instead of
  // waiting on the keystroke debounce, so a quick refresh right after can't lose them.
  function saveNow(nextWallets) {
    const payload = { items: nextWallets };
    latestPayload.current = payload;
    clearTimeout(timer.current);
    timer.current = null;
    skipNextSchedule.current = true;
    onStatus("saving");
    save(payload);
  }

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

  useEffect(() => {
    if (adjust && adjustInputRef.current) adjustInputRef.current.focus();
  }, [adjust]);

  function toggleActive(idx) {
    setActiveIndex((prev) => (prev === idx ? null : idx));
    setTransferTarget("");
    setTransferAmount("");
  }

  function doTransfer() {
    if (activeIndex === null || transferTarget === "") return;
    const targetIdx = Number(transferTarget);
    const amount = Number(transferAmount);
    if (!transferAmount || Number.isNaN(amount) || amount <= 0) return;
    setWallets((prev) => {
      if (!prev[activeIndex] || !prev[targetIdx]) return prev;
      const next = [...prev];
      next[activeIndex] = { ...next[activeIndex], price: (Number(next[activeIndex].price) || 0) - amount };
      next[targetIdx] = { ...next[targetIdx], price: (Number(next[targetIdx].price) || 0) + amount };
      saveNow(next);
      return next;
    });
    setTransferAmount("");
    setTransferTarget("");
  }

  function handleTransferKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      doTransfer();
    }
  }

  function openAdjust(idx, mode) {
    setAdjust((prev) => (prev && prev.idx === idx && prev.mode === mode ? null : { idx, mode }));
    setAdjustValue("");
  }

  function closeAdjust() {
    setAdjust(null);
    setAdjustValue("");
  }

  function applyAdjust() {
    if (!adjust) return;
    const amount = Number(adjustValue);
    if (!adjustValue || Number.isNaN(amount)) {
      closeAdjust();
      return;
    }
    const delta = adjust.mode === "add" ? amount : -amount;
    const idx = adjust.idx;
    setWallets((prev) => {
      if (!prev[idx]) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], price: (Number(next[idx].price) || 0) + delta };
      saveNow(next);
      return next;
    });
    closeAdjust();
  }

  function handleAdjustKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      applyAdjust();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAdjust();
    }
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
      setActiveIndex(prev.length);
      return [...prev, { name: "", price: 0, items: [] }];
    });
  }

  function removeWallet(idx) {
    setWallets((prev) => prev.filter((_, i) => i !== idx));
    setActiveIndex((prev) => {
      if (prev === idx) return null;
      if (prev !== null && prev > idx) return prev - 1;
      return prev;
    });
  }

  const walletTotal = (w) => (Number(w.price) || 0) + w.items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  const grandTotal = wallets.reduce((sum, w) => sum + walletTotal(w), 0);

  useEffect(() => {
    onTotalChange?.(grandTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotal]);

  return (
    <section className="ledger">
      <div className="ledger-head">
        <div className="ledger-title">
          <span className="ledger-index">{index}</span>
          <h2>{title}</h2>
        </div>
        <span className="ledger-total">{fmt(grandTotal)}</span>
      </div>

      {activeIndex !== null && wallets[activeIndex] && (
        <>
          <p className="wallet-active-hint">
            Items added in Income, Poly Learning Initiative, and Monthly Budget will deduct from{" "}
            <strong>{wallets[activeIndex].name || "this wallet"}</strong>.
          </p>

          <div className="wallet-transfer">
            <span className="wallet-transfer-label">
              Transfer from <strong>{wallets[activeIndex].name || "this wallet"}</strong> to
            </span>
            <select
              className="wallet-transfer-select"
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
            >
              <option value="">Select wallet</option>
              {wallets.map((w, i) =>
                i === activeIndex ? null : (
                  <option key={i} value={i}>
                    {w.name || `Wallet ${i + 1}`}
                  </option>
                )
              )}
            </select>
            <input
              type="number"
              className="wallet-transfer-amount"
              placeholder="Amount"
              step="1"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              onKeyDown={handleTransferKeyDown}
            />
            <button
              type="button"
              className="wallet-transfer-btn"
              disabled={transferTarget === "" || !transferAmount}
              onClick={doTransfer}
            >
              Transfer
            </button>
          </div>
        </>
      )}

      <div className="wallet-list">
        {wallets.length === 0 && <p className="empty-hint">No wallets yet — create one below.</p>}
        {wallets.map((wallet, widx) => {
          const isActive = widx === activeIndex;
          return (
            <div className="wallet-group" key={widx}>
              <div className="wallet-head">
                <button
                  type="button"
                  className={"wallet-toggle" + (isActive ? " active" : "")}
                  aria-label={isActive ? "Deselect wallet" : "Select wallet"}
                  aria-pressed={isActive}
                  onClick={() => toggleActive(widx)}
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
                <div className="wallet-adjust-btns">
                  <button
                    type="button"
                    className={"wallet-adjust-btn" + (adjust && adjust.idx === widx && adjust.mode === "add" ? " active" : "")}
                    aria-label="Add amount"
                    onClick={() => openAdjust(widx, "add")}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className={"wallet-adjust-btn" + (adjust && adjust.idx === widx && adjust.mode === "sub" ? " active" : "")}
                    aria-label="Subtract amount"
                    onClick={() => openAdjust(widx, "sub")}
                  >
                    −
                  </button>
                </div>
                <button
                  type="button"
                  className="cell-del"
                  aria-label="Remove wallet"
                  onClick={() => removeWallet(widx)}
                >
                  ×
                </button>
              </div>

              {adjust && adjust.idx === widx && (
                <div className="wallet-adjust-box">
                  <span className="wallet-adjust-label">{adjust.mode === "add" ? "Add to" : "Subtract from"} {wallet.name || "wallet"}</span>
                  <input
                    ref={adjustInputRef}
                    type="number"
                    className="wallet-adjust-input"
                    placeholder="0"
                    step="1"
                    value={adjustValue}
                    onChange={(e) => setAdjustValue(e.target.value)}
                    onKeyDown={handleAdjustKeyDown}
                  />
                  <button type="button" className="wallet-adjust-confirm" onClick={applyAdjust}>
                    OK
                  </button>
                  <button type="button" className="wallet-adjust-cancel" onClick={closeAdjust}>
                    Cancel
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
});

export default Wallets;
