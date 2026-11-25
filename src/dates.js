const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function pad(value) {
  return String(value).padStart(2, "0");
}

export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function currentMonth() {
  return toISODate(new Date()).slice(0, 7);
}

export function isMonth(value) {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && toISODate(date) === value;
}

export function monthLabel(month) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1, 1);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shortMonth(month) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
}

export function addMonths(month, amount) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1 + amount, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function lastMonths(month, count) {
  return Array.from({ length: count }, (_, index) => addMonths(month, index - (count - 1)));
}

export function daysInMonth(month) {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index, 0).getDate();
}

export function inMonth(date, month) {
  return typeof date === "string" && date.slice(0, 7) === month;
}

export function nextChargeDate(billingDay, from = new Date()) {
  const year = from.getFullYear();
  const monthIndex = from.getMonth();
  const thisMonth = Math.min(Math.max(Number(billingDay) || 1, 1), daysInMonth(`${year}-${pad(monthIndex + 1)}`));
  if (from.getDate() <= thisMonth) {
    return `${year}-${pad(monthIndex + 1)}-${pad(thisMonth)}`;
  }
  const next = new Date(year, monthIndex + 1, 1);
  const nextMonth = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
  const day = Math.min(Math.max(Number(billingDay) || 1, 1), daysInMonth(nextMonth));
  return `${nextMonth}-${pad(day)}`;
}

export function formatShortDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(year, month - 1, day));
}
