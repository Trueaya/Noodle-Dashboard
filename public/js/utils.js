const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompactFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const brl = (cents) => brlFormatter.format((Number(cents) || 0) / 100);
export const brlCompact = (cents) => brlCompactFormatter.format((Number(cents) || 0) / 100);

export const percent = (value, digits = 1) =>
  `${(Number(value) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;

export const signedPercent = (value, digits = 1) =>
  `${value > 0 ? "+" : ""}${percent(value, digits)}`;

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function parseMoneyInput(value) {
  let text = String(value ?? "").trim();
  if (!text) return NaN;
  text = text.replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  }
  const number = Number(text.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(number) || number < 0) return NaN;
  return Math.round(number * 100);
}

export function inputFromCents(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function initials(name) {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function firstName(name) {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function todayISO() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function currentMonth() {
  return todayISO().slice(0, 7);
}

export function monthLabel(month, style = "long") {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1, 1);
  const label = new Intl.DateTimeFormat("pt-BR", { month: style, year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shortMonth(month) {
  const [year, index] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(year, index - 1, 1))
    .replace(".", "")
    .toUpperCase();
}

export function shiftMonth(month, amount) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(month) {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index, 0).getDate();
}

export function dateDay(dateISO) {
  return Number(dateISO.slice(8, 10));
}

export function formatDateShort(dateISO) {
  if (!dateISO) return "";
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(year, month - 1, day))
    .replace(".", "");
}

export function formatDateLong(dateISO) {
  if (!dateISO) return "";
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(
    new Date(year, month - 1, day),
  );
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function todayLong(date = new Date()) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function categoryTone(category) {
  const map = {
    moradia: "primary",
    alimentacao: "secondary",
    transporte: "positive",
    contas: "alert",
    saude: "negative",
    educacao: "secondary",
    restaurantes: "alert",
    lazer: "negative",
    compras: "primary",
    assinaturas: "secondary",
    outros: "muted",
  };
  return map[category] ?? "muted";
}

export function debounce(callback, delay = 160) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
