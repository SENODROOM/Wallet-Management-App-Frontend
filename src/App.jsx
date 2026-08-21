import React, { useEffect, useState } from "react";
import { api } from "./api";
import Login from "./components/Login.jsx";
import Notepad from "./components/Notepad.jsx";
import NameModal from "./components/NameModal.jsx";

export default function App() {
  const [status, setStatus] = useState("loading");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    api
      .me()
      .then(async (res) => {
        if (!res.ok) return setStatus("anon");
        const data = await res.json();
        setEmail(data.email);
        setName(data.name || "");
        setStatus("authed");
      })
      .catch(() => setStatus("anon"));
  }, []);

  if (status === "loading") {
    return <div className="boot">Loading…</div>;
  }

  if (status === "anon") {
    return (
      <Login
        onAuthed={(userEmail, userName) => {
          setEmail(userEmail);
          setName(userName || "");
          setStatus("authed");
        }}
      />
    );
  }

  if (!name) {
    return <NameModal onSaved={(savedName) => setName(savedName)} />;
  }

  return (
    <Notepad
      email={email}
      name={name}
      onLoggedOut={() => {
        setEmail("");
        setName("");
        setStatus("anon");
      }}
    />
  );
}
