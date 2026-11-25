import {
  CATEGORY_COLORS,
  emptyState,
  kpiCard,
  monthPicker,
  pageHeading,
  riskMeta,
  severityMeta,
  transactionsTable,
} from "./components.js";
import { donutChart, donutLegend } from "./charts.js";
import { categoryIcon, icon } from "./icons.js";
import {
  brl,
  categoryTone,
  currentMonth,
  escapeHtml,
  firstName,
  greeting,
  monthLabel,
  percent,
  todayLong,
} from "./utils.js";

function alertBanner(notifications) {
  const alert =
    notifications.find((entry) => entry.severity === "danger") ??
    notifications.find((entry) => entry.severity === "warning");
  if (!alert) return "";
  const meta = severityMeta(alert.severity);
  const actionButton = alert.action
    ? `<button class="btn btn-soft btn-sm" type="button" data-view="${escapeHtml(alert.action)}">
        ${alert.action === "subscriptions" ? "Revisar assinaturas" : alert.action === "settings" ? "Configurar" : "Ver detalhes"}
        ${icon("arrow-right", 14)}
      </button>`
    : "";
  return `
    <div class="alert-banner alert-banner--${alert.severity === "danger" ? "danger" : "warning"}">
      <span class="alert-banner-icon">${icon(alert.icon ?? meta.icon, 18)}</span>
      <div class="alert-banner-copy">
        <strong>${escapeHtml(alert.title)}</strong>
        <span>${escapeHtml(alert.message)}</span>
      </div>
      ${actionButton ? `<div class="alert-banner-action">${actionButton}</div>` : ""}
    </div>
  `;
}

function overviewSubtitle(dashboard) {
  const { summary, user } = dashboard;
  const month = monthLabel(dashboard.month).toLowerCase();
  if (!user.salaryCents) {
    return "Defina seu salário para o Noodle calcular o que realmente cabe no seu mês.";
  }
  if (summary.remainingCents < 0) {
    return `Em ${month}, seus gastos ultrapassaram o salário em ${brl(-summary.remainingCents)}. Veja onde cortar antes que as assinaturas pesem no próximo mês.`;
  }
  if (summary.committedRatio >= 85) {
    return `Atenção: ${percent(summary.committedRatio)} do salário já está comprometido em ${month}. Sobram ${brl(summary.remainingCents)} — dê uma olhada nas assinaturas.`;
  }
  if (summary.savingsRate < summary.goalPercent) {
    return `Em ${month}, você guardou ${percent(summary.savingsRate)} da renda. Dá para chegar à meta de ${summary.goalPercent}% ajustando pequenos gastos.`;
  }
  return `Em ${month}, ${percent(summary.savingsRate)} da sua renda virou folga. Continue assim para bater sua meta de ${summary.goalPercent}%.`;
}

function spendTrend(dashboard) {
  const { summary, previous } = dashboard;
  if (!previous.committedCents) {
    return { strong: "Primeiro mês", className: "", text: "sem comparação anterior" };
  }
  const delta = ((summary.committedCents - previous.committedCents) / previous.committedCents) * 100;
  return {
    strong: `${icon(delta > 0 ? "trending-up" : "trending-down", 12)} ${percent(Math.abs(delta))}`,
    className: delta > 0 ? "negative" : "positive",
    text: delta > 0 ? "a mais que no mês anterior" : "a menos que no mês anterior",
  };
}

function subscriptionsCard(dashboard) {
  const subscriptions = dashboard.subscriptions.slice(0, 4);
  if (!subscriptions.length) {
    return `
      <div class="card">
        <div class="card-head">
          <div class="card-title-row">
            <span class="card-title-icon tone-secondary">${icon("repeat", 16)}</span>
            <div>
              <div class="card-title">Assinaturas</div>
              <div class="card-subtitle">Cobranças recorrentes</div>
            </div>
          </div>
        </div>
        ${emptyState({
          iconName: "repeat",
          title: "Nenhuma assinatura ativa",
          text: "Cadastre streaming, academia ou qualquer cobrança mensal para saber o impacto real no orçamento.",
          action: `<button class="btn btn-soft btn-sm" type="button" data-add-subscription>${icon("plus", 15)} Adicionar assinatura</button>`,
        })}
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-head">
        <div class="card-title-row">
          <span class="card-title-icon tone-secondary">${icon("repeat", 16)}</span>
          <div>
            <div class="card-title">Assinaturas</div>
            <div class="card-subtitle">Cobranças recorrentes deste mês</div>
          </div>
        </div>
        <button class="card-link" type="button" data-view="subscriptions">Gerenciar ${icon("arrow-right", 13)}</button>
      </div>
      <div class="sub-list">
        ${subscriptions
          .map((subscription) => {
            const risk = riskMeta(subscription.risk);
            const tone = categoryTone(subscription.category);
            return `
              <div class="sub-row">
                <span class="sub-logo tone-${tone}">${escapeHtml(subscription.name.charAt(0).toUpperCase())}</span>
                <div class="sub-copy">
                  <strong>${escapeHtml(subscription.name)}</strong>
                  <span>${escapeHtml(subscription.categoryLabel)} · cobrança dia ${subscription.billingDay}</span>
                </div>
                <div class="sub-price"><strong>${brl(subscription.amountCents)}</strong><span>/mês</span></div>
                <span class="status-chip status-chip--${risk.chip}">${risk.label}</span>
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="card-foot">
        <div class="foot-total"><span>Total mensal</span><strong>${brl(dashboard.summary.subscriptionCents)}</strong></div>
        <button class="card-link" type="button" data-view="subscriptions">Ver todas ${icon("arrow-right", 13)}</button>
      </div>
    </div>
  `;
}

function alertsCard(dashboard) {
  const notifications = dashboard.notifications.slice(0, 4);
  return `
    <div class="card alerts-card">
      <div class="card-head">
        <div class="card-title-row">
          <span class="card-title-icon tone-alert">${icon("bell", 16)}</span>
          <div>
            <div class="card-title">Alertas inteligentes</div>
            <div class="card-subtitle">Antes do gasto virar problema</div>
          </div>
        </div>
        <span class="count-pill">${notifications.length}</span>
      </div>
      <div class="alerts-list">
        ${notifications
          .map((notification) => {
            const meta = severityMeta(notification.severity);
            const content = `
              <span class="alert-icon tone-${meta.tone}">${icon(notification.icon ?? meta.icon, 16)}</span>
              <div class="alert-copy">
                <strong>${escapeHtml(notification.title)}</strong>
                <p>${escapeHtml(notification.message)}</p>
              </div>
              ${notification.action ? `<span class="alert-arrow">${icon("chevron-right", 14)}</span>` : ""}
            `;
            return notification.action
              ? `<button class="alert-item" type="button" data-view="${escapeHtml(notification.action)}" data-action>${content}</button>`
              : `<div class="alert-item">${content}</div>`;
          })
          .join("")}
      </div>
      <div class="card-foot">
        <div class="foot-total">
          <span>${notifications.length === 1 ? "1 aviso" : `${notifications.length} avisos`}</span>
          <strong>${dashboard.summary.health.label}</strong>
        </div>
        <button class="card-link" type="button" data-open-notifications>Ver central ${icon("arrow-right", 13)}</button>
      </div>
    </div>
  `;
}

function recentTransactionsCard(dashboard) {
  const transactions = dashboard.transactions.slice(0, 6);
  return `
    <div class="card recent-card">
      <div class="card-head">
        <div class="card-title-row">
          <span class="card-title-icon tone-primary">${icon("arrow-left-right", 16)}</span>
          <div>
            <div class="card-title">Transações recentes</div>
            <div class="card-subtitle">Últimos lançamentos de ${escapeHtml(monthLabel(dashboard.month).toLowerCase())}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-view="transactions">
          Ver todas ${icon("arrow-right", 14)}
        </button>
      </div>
      ${
        transactions.length
          ? transactionsTable(transactions)
          : emptyState({
              iconName: "receipt",
              title: "Nenhum lançamento ainda",
              text: "Registre seus gastos e entradas para ver o retrato real do seu mês.",
              action: `<button class="btn btn-primary btn-sm" type="button" data-add-transaction>${icon("plus", 15)} Nova despesa</button>`,
            })
      }
    </div>
  `;
}

export function overviewView(state) {
  const dashboard = state.dashboard;
  const { summary, user, history } = dashboard;
  const chartMode = state.chartMode === "history" ? "history" : "month";
  const averageRemaining = Math.round(
    history.reduce((total, entry) => total + entry.remainingCents, 0) / Math.max(1, history.length),
  );
  const averageSavings = history.reduce((total, entry) => total + entry.savingsRate, 0) / Math.max(1, history.length);
  const isCurrent = dashboard.month === currentMonth();
  const trend = spendTrend(dashboard);
  const topCategories = dashboard.categoryBreakdown.slice(0, 5);
  const hasData = dashboard.transactions.length > 0 || dashboard.subscriptions.length > 0;

  return `
    <div class="view-stack">
      ${pageHeading({
        kicker: isCurrent ? todayLong() : `Visão de ${monthLabel(dashboard.month)}`,
        title: `${greeting()}, <span class="accent-word">${escapeHtml(firstName(user.name))}</span>.`,
        subtitle: escapeHtml(overviewSubtitle(dashboard)),
        actions: `
          ${monthPicker(state.month)}
          <button class="btn btn-primary" type="button" data-add-transaction>
            ${icon("plus", 16)} Nova despesa
          </button>
        `,
      })}

      ${alertBanner(dashboard.notifications)}

      <div class="kpi-grid">
        ${kpiCard({
          label: "Receita do mês",
          value: brl(summary.incomeCents),
          iconName: "wallet",
          iconTone: "primary",
          footStrong: summary.extraIncomeCents > 0 ? `+ ${brl(summary.extraIncomeCents)} em extras` : "Renda fixa",
          footText: summary.extraIncomeCents > 0 ? `salário de ${brl(user.salaryCents)}` : "salário cadastrado",
        })}
        ${kpiCard({
          label: "Gastos do mês",
          value: brl(summary.committedCents),
          iconName: "credit-card",
          iconTone: "negative",
          footStrong: `<span class="${trend.className}">${trend.strong}</span>`,
          footText: trend.text,
        })}
        ${kpiCard({
          label: "Assinaturas",
          value: brl(summary.subscriptionCents),
          iconName: "repeat",
          iconTone: "secondary",
          footStrong: `${percent(summary.subscriptionRatio)} da renda`,
          footText: `${dashboard.subscriptions.length} ${dashboard.subscriptions.length === 1 ? "serviço ativo" : "serviços ativos"}`,
        })}
        ${kpiCard({
          label: "Saldo do mês",
          value: brl(summary.remainingCents),
          iconName: "piggy-bank",
          iconTone: summary.remainingCents >= 0 ? "positive" : "negative",
          footStrong: `<span class="${summary.remainingCents >= 0 ? "positive" : "negative"}">${percent(summary.savingsRate)} de sobra</span>`,
          footText: `meta de ${summary.goalPercent}% de poupança`,
          valueClass: summary.remainingCents < 0 ? "negative" : "",
        })}
      </div>

      <div class="dashboard-grid">
        <section class="card chart-card">
          <div class="card-head">
            <div class="card-title-row">
              <span class="card-title-icon tone-primary">${icon("chart-no-axes", 16)}</span>
              <div>
                <div class="card-title">Fluxo do mês</div>
                <div class="card-subtitle">
                  ${chartMode === "history" ? "Receitas e gastos dos últimos 6 meses" : "Seu saldo ao longo de " + escapeHtml(monthLabel(dashboard.month).toLowerCase())}
                </div>
              </div>
            </div>
            <div class="segmented" role="group" aria-label="Período do gráfico">
              <button type="button" data-chart-mode="month" class="${chartMode === "month" ? "is-active" : ""}">Mês</button>
              <button type="button" data-chart-mode="history" class="${chartMode === "history" ? "is-active" : ""}">6 meses</button>
            </div>
          </div>
          <div class="chart-value-row">
            <span class="chart-value ${chartMode === "history" && averageRemaining < 0 ? "negative" : chartMode === "month" && summary.remainingCents < 0 ? "negative" : ""}">
              ${brl(chartMode === "history" ? averageRemaining : summary.remainingCents)}
            </span>
            <span class="chart-value-label">${chartMode === "history" ? "sobra média por mês" : "saldo disponível"}</span>
          </div>
          <div class="chart-meta">
            <span class="delta ${(chartMode === "history" ? averageSavings : summary.savingsRate) >= 0 ? "delta--positive" : "delta--negative"}">
              ${icon("trending-up", 12)}
              ${percent(chartMode === "history" ? averageSavings : summary.savingsRate)} da renda
            </span>
            <span>·</span>
            <span>meta de ${summary.goalPercent}% de poupança</span>
          </div>
          <div class="chart-canvas" id="overview-chart"></div>
        </section>

        <section class="card category-card">
          <div class="card-head">
            <div class="card-title-row">
              <span class="card-title-icon tone-secondary">${icon("chart-no-axes", 16)}</span>
              <div>
                <div class="card-title">Gastos por categoria</div>
                <div class="card-subtitle">Inclui assinaturas e contas fixas</div>
              </div>
            </div>
          </div>
          ${
            dashboard.categoryBreakdown.length
              ? donutChart(dashboard.categoryBreakdown, summary.committedCents)
              : `
                <div class="donut-wrap">
                  <svg class="donut" viewBox="0 0 220 220" aria-hidden="true">
                    <circle cx="110" cy="110" r="82" fill="none" stroke="var(--surface-3)" stroke-width="22"/>
                  </svg>
                  <div class="donut-center">
                    <span>Gastos no mês</span>
                    <strong>${brl(summary.committedCents)}</strong>
                    <em>sem lançamentos</em>
                  </div>
                </div>
              `
          }
          <div class="legend-list">
            ${
              dashboard.categoryBreakdown.length
                ? donutLegend(topCategories)
                : `<p class="empty-inline">Adicione despesas para ver a distribuição por categoria.</p>`
            }
          </div>
          ${
            dashboard.categoryBreakdown.length > topCategories.length
              ? `<button class="card-link" type="button" data-view="reports" style="margin-top:12px">Ver todas as categorias ${icon("arrow-right", 13)}</button>`
              : ""
          }
        </section>
      </div>

      <div class="dashboard-grid dashboard-grid--equal">
        ${subscriptionsCard(dashboard)}
        ${alertsCard(dashboard)}
      </div>

      ${recentTransactionsCard(dashboard)}

      ${
        !hasData
          ? `<div class="card">${emptyState({
              iconName: "sparkles",
              title: "Seu painel está pronto para começar",
              text: "Adicione uma despesa ou assinatura para o Noodle montar seus indicadores e alertas inteligentes.",
              action: `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn btn-primary btn-sm" type="button" data-add-transaction>${icon("plus", 15)} Nova transação</button><button class="btn btn-soft btn-sm" type="button" data-add-subscription>${icon("repeat", 15)} Assinatura</button></div>`,
            })}</div>`
          : ""
      }
    </div>
  `;
}
