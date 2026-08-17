import React, { useEffect, useState } from "react";
import { api } from "./api";
import Login from "./components/Login.jsx";
import Notepad from "./components/Notepad.jsx";

export default function App() {
  const [status, setStatus] = useState("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    api
      .me()
      .then(async (res) => {
        if (!res.ok) return setStatus("anon");
        const data = await res.json();
        setEmail(data.email);
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
        onAuthed={(userEmail) => {
          setEmail(userEmail);
          setStatus("authed");
        }}
      />
    );
  }

  return (
    <Notepad
      email={email}
      onLoggedOut={() => {
        setEmail("");
        setStatus("anon");
      }}
    />
  );
}
