async function request(path, options = {}) {
  return fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
}

export const api = {
  me: () => request("/api/auth/me"),
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (email, password) =>
    request("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  getState: () => request("/api/state"),
  putSection: (section, payload) =>
    request(`/api/state/${section}`, { method: "PUT", body: JSON.stringify(payload) })
};

export const fmt = (n) => "Rs. " + (Number(n) || 0).toLocaleString("en-PK");
