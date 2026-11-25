import { categoryIcon, icon } from "./icons.js";
import {
  brl,
  categoryTone,
  currentMonth,
  escapeHtml,
  formatDateShort,
  monthLabel,
  percent,
} from "./utils.js";

export const CATEGORY_COLORS = {
  moradia: "var(--primary)",
  alimentacao: "var(--secondary)",
  transporte: "var(--positive)",
  contas: "var(--alert)",
  saude: "var(--negative)",
  educacao: "#9a8fa6",
  restaurantes: "#b9a48b",
  lazer: "#7fa6a0",
  compras: "#c78b6e",
  assinaturas: "var(--secondary)",
  outros: "var(--muted)",
  salario: "var(--positive)",
  freelance: "var(--secondary)",
  investimentos: "var(--alert)",
  presente: "var(--primary)",
};

export function categoryColor(category) {
  return CATEGORY_COLORS[category] ?? "var(--muted)";
}

export function pageHeading({ kicker, title, subtitle, actions = "", eyebrowIcon = "calendar" }) {
  return `
    <div class="page-head">
      <div class="page-head-copy">
        <div class="page-kicker">${icon(eyebrowIcon, 13)}<span>${escapeHtml(kicker)}</span></div>
        <h1>${title}</h1>
        <p class="page-subtitle">${subtitle}</p>
      </div>
      <div class="head-actions">${actions}</div>
    </div>
  `;
}

export function monthPicker(month, { allowFuture = false } = {}) {
  const canGoNext = allowFuture || month < currentMonth();
  return `
    <div class="month-picker" aria-label="Selecionar mês">
      <button type="button" data-month-step="-1" aria-label="Mês anterior">${icon("chevron-left", 16)}</button>
      <span class="month-picker-label">${escapeHtml(monthLabel(month))}</span>
      <button type="button" data-month-step="1" aria-label="Próximo mês" ${canGoNext ? "" : "disabled"}>${icon("chevron-right", 16)}</button>
    </div>
  `;
}

export function emptyState({ iconName = "sparkles", title, text, action = "" }) {
  return `
    <div class="empty-state">
      <span class="empty-state-icon">${icon(iconName, 24)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      ${action}
    </div>
  `;
}

export function kpiCard({
  label,
  value,
  iconName,
  iconTone = "primary",
  footStrong = "",
  footText = "",
  valueClass = "",
}) {
  return `
    <article class="kpi-card">
      <div class="kpi-top">
        <span class="kpi-icon tone-${iconTone}">${icon(iconName, 19)}</span>
        <span class="kpi-label">${escapeHtml(label)}</span>
      </div>
      <div class="kpi-value ${valueClass}">${value}</div>
      <div class="kpi-foot">
        <div class="kpi-caption">
          <strong>${footStrong}</strong>
          <span>${footText}</span>
        </div>
      </div>
    </article>
  `;
}

export function severityMeta(severity) {
  const map = {
    danger: { tone: "negative", chip: "danger", label: "Crítico", icon: "alert-triangle" },
    warning: { tone: "alert", chip: "warning", label: "Atenção", icon: "alert-circle" },
    info: { tone: "secondary", chip: "secondary", label: "Info", icon: "info" },
    positive: { tone: "positive", chip: "positive", label: "Em dia", icon: "check-circle" },
  };
  return map[severity] ?? map.info;
}

export function riskMeta(risk, active = true) {
  if (!active) return { tone: "muted", chip: "neutral", label: "Pausada" };
  const map = {
    positive: { tone: "positive", chip: "positive", label: "Saudável" },
    warning: { tone: "alert", chip: "warning", label: "Atenção" },
    danger: { tone: "negative", chip: "danger", label: "Risco" },
    neutral: { tone: "muted", chip: "neutral", label: "Pausada" },
  };
  return map[risk] ?? map.positive;
}

export function notificationAction(notification, { small = true } = {}) {
  if (!notification.action) return "";
  const labels = {
    subscriptions: "Revisar assinaturas",
    settings: "Configurar agora",
    reports: "Ver relatório",
  };
  const label = labels[notification.action] ?? "Ver detalhes";
  return `<button class="btn ${small ? "btn-soft btn-sm" : "btn-soft"} btn-banner-action" type="button" data-view="${notification.action}">${label} ${icon("arrow-right", 14)}</button>`;
}

export function transactionRow(transaction) {
  const isIncome = transaction.type === "income";
  const tone = categoryTone(transaction.category);
  return `
    <tr>
      <td>
        <div class="tx-cell">
          <span class="tx-icon tone-${tone}">${categoryIcon(transaction.category, 16)}</span>
          <div class="tx-copy">
            <strong>${escapeHtml(transaction.description)}</strong>
            <span>${escapeHtml(transaction.categoryLabel)}${isIncome ? " · entrada" : ""}</span>
          </div>
        </div>
      </td>
      <td class="col-hide-sm"><span class="tx-date">${escapeHtml(formatDateShort(transaction.date))}</span></td>
      <td class="amount-col ${isIncome ? "positive" : ""}">${isIncome ? "+" : "−"} ${brl(transaction.amountCents)}</td>
      <td class="actions-col">
        <button class="icon-button icon-button--sm row-action" type="button"
          data-delete-transaction="${escapeHtml(transaction.id)}"
          data-description="${escapeHtml(transaction.description)}"
          aria-label="Excluir ${escapeHtml(transaction.description)}" title="Excluir transação">
          ${icon("trash-2", 14)}
        </button>
      </td>
    </tr>
  `;
}

export function transactionsTable(transactions) {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Transação</th>
            <th class="col-hide-sm">Data</th>
            <th class="amount-col">Valor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map(transactionRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function filterTransactions(transactions, filters) {
  const query = filters.search.trim().toLowerCase();
  return transactions.filter((transaction) => {
    if (filters.type && filters.type !== "all" && transaction.type !== filters.type) return false;
    if (filters.category && filters.category !== "all" && transaction.category !== filters.category) return false;
    if (!query) return true;
    const haystack = `${transaction.description} ${transaction.categoryLabel} ${transaction.amountCents}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function transactionsResults(state) {
  const { dashboard, filters } = state;
  const filtered = filterTransactions(dashboard.transactions, filters);
  const total = dashboard.transactions.length;
  const label = filtered.length === 1 ? "lançamento" : "lançamentos";

  if (!total) {
    return `
      <div class="table-head">
        <div><h2>Lançamentos do mês</h2><p class="table-sub">Nada por aqui ainda.</p></div>
      </div>
      ${emptyState({
        iconName: "receipt",
        title: "Nenhuma transação neste mês",
        text: "Adicione sua primeira despesa ou entrada para começar a acompanhar seu orçamento.",
        action: `<button class="btn btn-primary" type="button" data-add-transaction>${icon("plus", 16)} Nova transação</button>`,
      })}
    `;
  }

  if (!filtered.length) {
    return `
      <div class="table-head">
        <div><h2>Lançamentos do mês</h2><p class="table-sub">0 resultados para os filtros atuais.</p></div>
        <span class="count-pill">0 de ${total}</span>
      </div>
      ${emptyState({
        iconName: "search",
        title: "Nenhum resultado encontrado",
        text: "Tente buscar por outro nome, categoria ou ajuste os filtros.",
        action: `<button class="btn btn-ghost" type="button" data-clear-filters>Limpar filtros</button>`,
      })}
    `;
  }

  return `
    <div class="table-head">
      <div>
        <h2>Lançamentos do mês</h2>
        <p class="table-sub">${filtered.length} ${label} em ${escapeHtml(monthLabel(state.month).toLowerCase())}</p>
      </div>
      <span class="count-pill">${filtered.length} de ${total}</span>
    </div>
    ${transactionsTable(filtered)}
  `;
}

export function renderEmptyDonut(totalCents, categories = []) {
  return `
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 220 220" aria-hidden="true">
        <circle cx="110" cy="110" r="82" fill="none" stroke="var(--surface-3)" stroke-width="22"/>
      </svg>
      <div class="donut-center">
        <span>Gastos no mês</span>
        <strong>${brl(totalCents)}</strong>
        <em>sem lançamentos</em>
      </div>
    </div>
  `;
}

export function percentShare(value) {
  return `${Number(value || 0).toFixed(1).replace(".", ",")}%`;
}

export function signedMoney(amountCents, type) {
  return `${type === "income" ? "+" : "−"} ${brl(amountCents)}`;
}

export { percent };
