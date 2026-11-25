export class ApiError extends Error {
  constructor(message, status, field) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.field = field;
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? "Não foi possível concluir a solicitação.",
      response.status,
      payload?.field,
    );
  }
  return payload;
}

export const api = {
  me: () => request("/api/auth/me"),
  meta: () => request("/api/meta"),
  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password } }),
  register: (data) => request("/api/auth/register", { method: "POST", body: data }),
  demo: () => request("/api/auth/demo", { method: "POST" }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  dashboard: (month) => request(`/api/dashboard?month=${encodeURIComponent(month)}`),
  addTransaction: (data) => request("/api/transactions", { method: "POST", body: data }),
  deleteTransaction: (id) => request(`/api/transactions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  addSubscription: (data) => request("/api/subscriptions", { method: "POST", body: data }),
  updateSubscription: (id, data) =>
    request(`/api/subscriptions/${encodeURIComponent(id)}`, { method: "PATCH", body: data }),
  deleteSubscription: (id) => request(`/api/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  updateProfile: (data) => request("/api/profile", { method: "PUT", body: data }),
};
