async function request(path, options = {}) {
  return fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
}

export const api = {
  me: () => request("/api/auth/me"),
  login: (email, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signup: (email, password) =>
    request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  setName: (name) =>
    request("/api/auth/name", {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  getState: () => request("/api/state"),
  putSection: (section, payload) =>
    request(`/api/state/${section}`, {
      method: "PUT",
      body: JSON.stringify(payload),
      keepalive: true,
    }),
  rolloverMonthly: (period) =>
    request("/api/monthly/rollover", {
      method: "POST",
      body: JSON.stringify({ period }),
    }),
  getMonthlyHistory: () => request("/api/monthly/history"),
  getMonthlyArchive: (period) => request(`/api/monthly/history/${period}`),
  getNotepads: () => request("/api/notepads"),
  createNotepad: (payload) =>
    request("/api/notepads", { method: "POST", body: JSON.stringify(payload) }),
  putNotepad: (id, payload) =>
    request(`/api/notepads/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
      keepalive: true,
    }),
  deleteNotepad: (id) => request(`/api/notepads/${id}`, { method: "DELETE" }),
};

export const fmt = (n) => "Rs. " + (Number(n) || 0).toLocaleString("en-PK");
