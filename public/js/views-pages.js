import {
  emptyState,
  monthPicker,
  pageHeading,
  riskMeta,
  severityMeta,
  transactionsResults,
  categoryColor,
} from "./components.js";
import { scoreRing } from "./charts.js";
import { icon, logoMark } from "./icons.js";
import {
  brl,
  currentMonth,
  escapeHtml,
  formatDateLong,
  formatDateShort,
  inputFromCents,
  monthLabel,
  percent,
  shiftMonth,
} from "./utils.js";

function comparisonBadge(currentCents, previousCents, previousMonth, { upIsGood = true } = {}) {
  if (previousCents <= 0) return "";
  const delta = ((currentCents - previousCents) / previousCents) * 100;
  const isUp = delta > 0;
  const isFlat = Math.abs(delta) < 0.05;
  const tone = isFlat ? "neutral" : isUp === upIsGood ? "positive" : "negative";
  const iconName = isFlat ? "minus" : isUp ? "trending-up" : "trending-down";
  const symbol = isUp ? "+" : "−";
  const label = isFlat ? "0,0%" : `${symbol}${percent(Math.abs(delta))}`;
  const title = `${label} em relação a ${monthLabel(previousMonth)} (${brl(previousCents)})`;
  return `<span class="mini-stat-delta mini-stat-delta--${tone}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${iconName === "minus" ? "" : icon(iconName, 11)}${label}</span>`;
}

function previousMonthName(month) {
  return monthLabel(shiftMonth(month, -1)).split(" de ")[0].toLowerCase();
}

export function transactionsView(state) {
  const dashboard = state.dashboard;
  const { summary } = dashboard;
  const previous = dashboard.previous ?? { incomeCents: 0, committedCents: 0, remainingCents: 0 };
  const comparisonMonth = shiftMonth(state.month, -1);
  const comparisonName = previousMonthName(state.month);
  const availableMonths = dashboard.availableMonths?.length ? dashboard.availableMonths : [state.month];
  const categories = [
    ...state.meta.categories,
    ...state.meta.incomeCategories.filter((category) => !state.meta.categories.some((entry) => entry.id === category.id)),
  ];
  const hasFilters =
    Boolean(state.filters.search) ||
    (state.filters.type && state.filters.type !== "all") ||
    (state.filters.category && state.filters.category !== "all");

  return `
    <div class="view-stack">
      ${pageHeading({
        kicker: `Movimentações de ${monthLabel(state.month).toLowerCase()}`,
        title: "Transações",
        subtitle: "Cada lançamento ajuda o Noodle a entender seu ritmo — e a avisar antes do orçamento apertar.",
        eyebrowIcon: "arrow-left-right",
        actions: `
          ${monthPicker(state.month)}
          <button class="btn btn-primary" type="button" data-add-transaction>
            ${icon("plus", 16)} Nova transação
          </button>
        `,
      })}

      <div class="stat-strip">
        <div class="mini-stat">
          <div class="mini-stat-head">
            <span class="mini-stat-icon tone-positive">${icon("trending-up", 13)}</span>
            Entradas do mês
          </div>
          <div class="mini-stat-value">
            <strong class="positive">${brl(summary.incomeCents)}</strong>
            ${comparisonBadge(summary.incomeCents, previous.incomeCents, comparisonMonth)}
          </div>
          <small>${previous.incomeCents > 0 ? `vs. ${comparisonName} · ` : ""}${summary.extraIncomeCents > 0 ? `inclui ${brl(summary.extraIncomeCents)} extras` : "salário e entradas extras"}</small>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-head">
            <span class="mini-stat-icon tone-negative">${icon("trending-down", 13)}</span>
            Saídas do mês
          </div>
          <div class="mini-stat-value">
            <strong>${brl(summary.committedCents)}</strong>
            ${comparisonBadge(summary.committedCents, previous.committedCents, comparisonMonth, { upIsGood: false })}
          </div>
          <small>${previous.committedCents > 0 ? `vs. ${comparisonName} · ` : ""}inclui ${brl(summary.subscriptionCents)} em assinaturas</small>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-head">
            <span class="mini-stat-icon tone-${summary.remainingCents >= 0 ? "positive" : "negative"}">${icon("piggy-bank", 13)}</span>
            Saldo livre
          </div>
          <div class="mini-stat-value">
            <strong class="${summary.remainingCents >= 0 ? "positive" : "negative"}">${brl(summary.remainingCents)}</strong>
            ${comparisonBadge(summary.remainingCents, previous.remainingCents, comparisonMonth)}
          </div>
          <small>${previous.remainingCents > 0 ? `vs. ${comparisonName} · ` : ""}${percent(summary.savingsRate)} da renda · meta ${summary.goalPercent}%</small>
        </div>
      </div>

      <div class="card filter-card">
        <div class="filter-bar">
          <div class="filter-search">
            <span>${icon("search", 15)}</span>
            <input id="tx-search" type="search" placeholder="Buscar por descrição, categoria..." value="${escapeHtml(state.filters.search)}" autocomplete="off" aria-label="Filtrar transações" />
          </div>
          <div class="filter-selects">
            <select id="tx-month-filter" aria-label="Filtrar por mês">
              ${availableMonths
                .map(
                  (month) =>
                    `<option value="${month}" ${month === state.month ? "selected" : ""}>${escapeHtml(monthLabel(month))}</option>`,
                )
                .join("")}
            </select>
            <select id="tx-type-filter" aria-label="Filtrar por tipo">
              <option value="all" ${state.filters.type === "all" ? "selected" : ""}>Todos os tipos</option>
              <option value="expense" ${state.filters.type === "expense" ? "selected" : ""}>Saídas</option>
              <option value="income" ${state.filters.type === "income" ? "selected" : ""}>Entradas</option>
            </select>
            <select id="tx-category-filter" aria-label="Filtrar por categoria">
              <option value="all" ${state.filters.category === "all" ? "selected" : ""}>Todas as categorias</option>
              ${categories
                .map(
                  (category) =>
                    `<option value="${escapeHtml(category.id)}" ${state.filters.category === category.id ? "selected" : ""}>${escapeHtml(category.label)}</option>`,
                )
                .join("")}
            </select>
          </div>
          <button class="text-button clear-filters ${hasFilters ? "is-visible" : ""}" type="button" data-clear-filters>
            ${icon("x", 13)} Limpar filtros
          </button>
        </div>
      </div>

      <div class="card card--flush table-card">
        <div id="transactions-results">
          ${transactionsResults(state)}
        </div>
      </div>
    </div>
  `;
}

function subscriptionsImpact(dashboard) {
  const { summary } = dashboard;
  if (!summary.incomeCents) {
    return {
      level: "positive",
      title: "Cadastre seu salário primeiro",
      text: "Com a renda cadastrada, o Noodle consegue calcular se suas assinaturas cabem no orçamento.",
      value: brl(summary.subscriptionCents),
    };
  }
  if (summary.remainingCents < 0) {
    return {
      level: "danger",
      title: "Não será possível manter todas as assinaturas",
      text: `Com os gastos atuais, faltam ${brl(-summary.remainingCents)} por mês para fechar a conta. Cancele ou reduza assinaturas antes da próxima cobrança.`,
      value: brl(summary.subscriptionCents),
    };
  }
  if (summary.committedRatio >= 85) {
    return {
      level: "warning",
      title: "Cuidado com novas assinaturas",
      text: `${percent(summary.committedRatio)} do salário já está comprometido. Uma nova assinatura pode não caber no orçamento sem cortar outros gastos.`,
      value: brl(summary.subscriptionCents),
    };
  }
  if (summary.subscriptionRatio >= 12) {
    return {
      level: "warning",
      title: "Assinaturas pesadas no orçamento",
      text: `São ${percent(summary.subscriptionRatio)} da sua renda em cobranças recorrentes. Revise os serviços que você usa menos.`,
      value: brl(summary.subscriptionCents),
    };
  }
  return {
    level: "positive",
    title: "Assinaturas sob controle",
    text: `Elas representam ${percent(summary.subscriptionRatio)} da sua renda e cabem no orçamento deste mês.`,
    value: brl(summary.subscriptionCents),
  };
}

export function subscriptionsView(state) {
  const dashboard = state.dashboard;
  const subscriptions = dashboard.allSubscriptions ?? dashboard.subscriptions;
  const active = subscriptions.filter((entry) => entry.active !== false);
  const paused = subscriptions.filter((entry) => entry.active === false);
  const impact = subscriptionsImpact(dashboard);
  const tone = impact.level === "danger" ? "negative" : impact.level === "warning" ? "alert" : "positive";

  return `
    <div class="view-stack">
      ${pageHeading({
        kicker: "Cobranças recorrentes",
        title: "Assinaturas",
        subtitle: "Veja o peso real de cada serviço no salário e simule o impacto antes de assumir uma nova cobrança.",
        eyebrowIcon: "repeat",
        actions: `
          <button class="btn btn-primary" type="button" data-add-subscription>
            ${icon("plus", 16)} Nova assinatura
          </button>
        `,
      })}

      <div class="impact-banner impact-banner--${impact.level === "positive" ? "" : impact.level}">
        <span class="impact-icon tone-${tone}">${icon(impact.level === "danger" ? "alert-triangle" : impact.level === "warning" ? "alert-circle" : "shield-check", 21)}</span>
        <div class="impact-copy">
          <strong>${escapeHtml(impact.title)}</strong>
          <p>${escapeHtml(impact.text)}</p>
        </div>
        <div class="impact-value">
          <span>Total por mês</span>
          <strong>${impact.value}</strong>
        </div>
      </div>

      <div class="stat-strip">
        <div class="mini-stat">
          <div class="mini-stat-head">
            <span class="mini-stat-icon tone-secondary">${icon("repeat", 13)}</span>
            Total mensal
          </div>
          <strong>${brl(dashboard.summary.subscriptionCents)}</strong>
          <small>${active.length} ${active.length === 1 ? "assinatura ativa" : "assinaturas ativas"}</small>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-head">
            <span class="mini-stat-icon tone-primary">${icon("percent", 13)}</span>
            Impacto na renda
          </div>
          <strong>${percent(dashboard.summary.subscriptionRatio)}</strong>
          <small>do salário comprometido com recorrências</small>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-head">
            <span class="mini-stat-icon tone-positive">${icon("wallet", 13)}</span>
            Saldo depois de tudo
          </div>
          <strong class="${dashboard.summary.remainingCents >= 0 ? "positive" : "negative"}">${brl(dashboard.summary.remainingCents)}</strong>
          <small>${paused.length ? `${paused.length} ${paused.length === 1 ? "assinatura pausada" : "assinaturas pausadas"}` : "nenhuma assinatura pausada"}</small>
        </div>
      </div>

      <div class="section-heading">
        <h2>Suas assinaturas</h2>
        <span>${subscriptions.length} ${subscriptions.length === 1 ? "serviço cadastrado" : "serviços cadastrados"}</span>
      </div>

      <div class="subs-grid">
        ${subscriptions
          .map((subscription) => {
            const risk = riskMeta(subscription.risk, subscription.active);
            const tone = risk.tone;
            const barWidth = Math.min(100, Math.max(4, subscription.percentOfIncome * 10));
            return `
              <article class="subscription-card ${subscription.active === false ? "is-paused" : ""}">
                <div class="subscription-card-head">
                  <span class="sub-logo tone-${tone}">${escapeHtml(subscription.name.charAt(0).toUpperCase())}</span>
                  <div class="subscription-card-title">
                    <strong>${escapeHtml(subscription.name)}</strong>
                    <span>${escapeHtml(subscription.categoryLabel)} · mensal</span>
                  </div>
                  <span class="status-chip status-chip--${risk.chip}">${risk.label}</span>
                </div>
                <div class="subscription-card-amount">
                  <strong>${brl(subscription.amountCents)}</strong><span>/mês</span>
                </div>
                <div class="risk-bar risk-bar--${subscription.risk}">
                  <span style="width:${barWidth}%"></span>
                </div>
                <div class="subscription-meta">
                  <div><span>Cobrança</span><strong>Dia ${subscription.billingDay}</strong></div>
                  <div><span>Peso na renda</span><strong>${percent(subscription.percentOfIncome)}</strong></div>
                </div>
                <div class="subscription-risk">
                  <span>${subscription.active === false ? "Pausada — não entra no total" : `Próxima cobrança em ${escapeHtml(formatDateShort(subscription.nextCharge))}`}</span>
                  ${subscription.active !== false && subscription.risk === "danger" ? `<span class="negative">${icon("alert-triangle", 12)}</span>` : ""}
                </div>
                <div class="subscription-actions">
                  <button class="btn btn-ghost btn-sm" type="button" data-toggle-subscription="${escapeHtml(subscription.id)}" data-active="${subscription.active !== false}">
                    ${icon(subscription.active === false ? "play" : "pause", 13)}
                    ${subscription.active === false ? "Retomar" : "Pausar"}
                  </button>
                  <button class="icon-button" type="button" data-delete-subscription="${escapeHtml(subscription.id)}" data-name="${escapeHtml(subscription.name)}" aria-label="Excluir ${escapeHtml(subscription.name)}" title="Excluir assinatura">
                    ${icon("trash-2", 14)}
                  </button>
                </div>
              </article>
            `;
          })
          .join("")}
        <button class="add-sub-card" type="button" data-add-subscription>
          <span class="add-sub-icon">${icon("plus", 19)}</span>
          Adicionar assinatura
          <small>Simulamos o impacto antes de confirmar</small>
        </button>
      </div>

      ${
        !subscriptions.length
          ? emptyState({
              iconName: "repeat",
              title: "Nenhuma assinatura cadastrada",
              text: "Comece pelas cobranças que você já tem: streaming, academia, armazenamento ou contas fixas.",
              action: `<button class="btn btn-primary btn-sm" type="button" data-add-subscription>${icon("plus", 15)} Cadastrar primeira assinatura</button>`,
            })
          : ""
      }
    </div>
  `;
}

function reportHeadline(dashboard) {
  const { summary } = dashboard;
  if (summary.remainingCents < 0) {
    return `Este mês fechou no vermelho. <em>Hora de ajustar.</em>`;
  }
  if (summary.savingsRate >= summary.goalPercent) {
    return `Sua poupança está <em>no caminho certo.</em>`;
  }
  return `Dá para guardar mais. <em>Sem apertar demais.</em>`;
}

function buildInsights(dashboard) {
  const { summary, categoryBreakdown, subscriptions, previous } = dashboard;
  const insights = [];
  const topCategory = categoryBreakdown[0];
  if (topCategory) {
    insights.push({
      icon: "chart-no-axes",
      tone: "primary",
      title: `${topCategory.label} lidera os gastos`,
      text: `${brl(topCategory.amountCents)} dos seus gastos — ${percent(topCategory.percent)} do total do mês.`,
    });
  }
  if (previous.committedCents > 0) {
    const delta = ((summary.committedCents - previous.committedCents) / previous.committedCents) * 100;
    insights.push({
      icon: delta > 0 ? "trending-up" : "trending-down",
      tone: delta > 0 ? "alert" : "positive",
      title: delta > 0 ? "Gastos acima do mês anterior" : "Gastos abaixo do mês anterior",
      text: `${percent(Math.abs(delta))} ${delta > 0 ? "a mais" : "a menos"} em relação ao mês passado.`,
    });
  }
  if (subscriptions.length) {
    insights.push({
      icon: "repeat",
      tone: "secondary",
      title: `${subscriptions.length} ${subscriptions.length === 1 ? "assinatura ativa" : "assinaturas ativas"}`,
      text: `Somam ${brl(summary.subscriptionCents)} por mês (${percent(summary.subscriptionRatio)} da renda). Revise as que você usa menos.`,
    });
  }
  if (summary.remainingCents >= 0) {
    const gap = Math.max(0, (summary.goalPercent / 100) * summary.incomeCents - summary.remainingCents);
    insights.push({
      icon: "target",
      tone: gap > 0 ? "alert" : "positive",
      title: gap > 0 ? `Faltam ${brl(gap)} para a meta` : "Meta de poupança batida",
      text:
        gap > 0
          ? `Sua sobra é ${percent(summary.savingsRate)} da renda; a meta é ${summary.goalPercent}%.`
          : `Você guardou ${percent(summary.savingsRate)} da renda, acima da meta de ${summary.goalPercent}%.`,
    });
  } else {
    insights.push({
      icon: "alert-triangle",
      tone: "negative",
      title: "Orçamento estourado",
      text: `Faltam ${brl(-summary.remainingCents)} para cobrir os gastos do mês. Reveja as assinaturas e as categorias mais pesadas.`,
    });
  }
  return insights;
}

export function reportsView(state) {
  const dashboard = state.dashboard;
  const { summary, history, categoryBreakdown } = dashboard;
  const goalGap = Math.max(0, (summary.goalPercent / 100) * summary.incomeCents - Math.max(0, summary.remainingCents));
  const goalPct = Math.min(100, Math.max(0, (summary.savingsRate / Math.max(1, summary.goalPercent)) * 100));
  const insights = buildInsights(dashboard);
  const goalTone = summary.savingsRate >= summary.goalPercent ? "positive" : summary.savingsRate >= summary.goalPercent / 2 ? "warning" : "danger";

  return `
    <div class="view-stack">
      ${pageHeading({
        kicker: `Relatório de ${monthLabel(state.month).toLowerCase()}`,
        title: "Relatórios",
        subtitle: "Uma leitura honesta do seu mês: para onde o dinheiro foi, o que pesou e o quanto sobrou para o futuro.",
        eyebrowIcon: "chart-no-axes",
        actions: monthPicker(state.month),
      })}

      <section class="report-hero">
        <div class="report-hero-copy">
          <span class="eyebrow eyebrow--accent">Seu mês em números</span>
          <h2>${reportHeadline(dashboard)}</h2>
          <p>
            Em ${escapeHtml(monthLabel(state.month).toLowerCase())}, você recebeu ${brl(summary.incomeCents)},
            comprometeu ${brl(summary.committedCents)} e ${summary.remainingCents >= 0 ? `guardou ${brl(summary.remainingCents)}` : `ficou ${brl(-summary.remainingCents)} no vermelho`}.
          </p>
          <div class="report-hero-tags">
            <span class="report-tag">${icon("credit-card", 12)} Gastos: ${brl(summary.committedCents)}</span>
            <span class="report-tag">${icon("repeat", 12)} Assinaturas: ${brl(summary.subscriptionCents)}</span>
            <span class="report-tag">${icon("target", 12)} Meta: ${summary.goalPercent}%</span>
            <span class="report-tag">${icon("piggy-bank", 12)} Sobra: ${percent(summary.savingsRate)}</span>
          </div>
        </div>
        <div class="report-hero-score">
          ${scoreRing(summary.health.score, summary.health.status === "neutral" ? "muted" : summary.health.status, 108)}
          <div class="report-hero-score-copy">
            <strong>Saúde financeira</strong>
            <span>${summary.health.score} de 100 pontos</span>
            <span class="status-chip status-chip--${summary.health.status === "positive" ? "positive" : summary.health.status === "warning" ? "warning" : summary.health.status === "danger" ? "danger" : "neutral"}">${summary.health.label}</span>
          </div>
        </div>
      </section>

      <div class="report-stat-row">
        <div class="report-stat">
          <span>Receita do mês</span>
          <strong>${brl(summary.incomeCents)}</strong>
          <small>salário + entradas extras</small>
        </div>
        <div class="report-stat">
          <span>Gastos + assinaturas</span>
          <strong>${brl(summary.committedCents)}</strong>
          <small>${percent(summary.committedRatio)} da renda</small>
        </div>
        <div class="report-stat">
          <span>Assinaturas</span>
          <strong>${brl(summary.subscriptionCents)}</strong>
          <small>${dashboard.subscriptions.length} ${dashboard.subscriptions.length === 1 ? "serviço ativo" : "serviços ativos"}</small>
        </div>
        <div class="report-stat">
          <span>Saldo livre</span>
          <strong class="${summary.remainingCents >= 0 ? "positive" : "negative"}">${brl(summary.remainingCents)}</strong>
          <small>${percent(summary.savingsRate)} de poupança</small>
        </div>
      </div>

      <div class="dashboard-grid report-grid">
        <section class="card chart-card report-chart-card">
          <div class="card-head">
            <div class="card-title-row">
              <span class="card-title-icon tone-secondary">${icon("chart-no-axes", 16)}</span>
              <div>
                <div class="card-title">Últimos 6 meses</div>
                <div class="card-subtitle">Receitas x gastos totais, mês a mês</div>
              </div>
            </div>
            <span class="report-month-badge">${icon("calendar", 13)} ${escapeHtml(monthLabel(state.month))}</span>
          </div>
          <div class="chart-canvas" id="reports-chart"></div>
        </section>

        <section class="card report-panel">
          <div class="card-head">
            <div class="card-title-row">
              <span class="card-title-icon tone-positive">${icon("target", 16)}</span>
              <div>
                <div class="card-title">Meta de poupança</div>
                <div class="card-subtitle">Sua reserva ideal para o mês</div>
              </div>
            </div>
            <span class="status-chip status-chip--${goalTone === "positive" ? "positive" : goalTone === "warning" ? "warning" : "danger"}">
              ${summary.savingsRate >= summary.goalPercent ? "Meta batida" : `Meta: ${summary.goalPercent}%`}
            </span>
          </div>
          <div class="goal-box">
            <div class="goal-copy">
              <span>Sobra atual</span>
              <strong class="${summary.remainingCents >= 0 ? "positive" : "negative"}">${percent(summary.savingsRate)}</strong>
              <small>${brl(Math.max(0, summary.remainingCents))} disponíveis</small>
            </div>
            ${scoreRing(Math.round(Math.min(100, Math.max(0, summary.savingsRate))), summary.savingsRate >= summary.goalPercent ? "positive" : summary.savingsRate > 0 ? "warning" : "negative", 92)}
          </div>
          <div class="goal-progress">
            <div class="progress-track">
              <div class="progress-fill progress-fill--${goalTone}" style="width:${goalPct}%"></div>
            </div>
            <div class="progress-labels">
              <span>R$ 0</span>
              <span><strong>${percent(Math.min(100, Math.max(0, summary.savingsRate)))}</strong> da meta de ${summary.goalPercent}%</span>
            </div>
          </div>
          <div class="goal-rows">
            <div class="goal-row"><span>Sobra do mês</span><strong>${brl(summary.remainingCents)}</strong></div>
            <div class="goal-row"><span>Meta em reais</span><strong>${brl((summary.goalPercent / 100) * summary.incomeCents)}</strong></div>
            <div class="goal-row"><span>${goalGap > 0 ? "Faltam para a meta" : "Acima da meta"}</span><strong class="${goalGap > 0 ? "warning" : "positive"}">${brl(goalGap > 0 ? goalGap : Math.max(0, summary.remainingCents - (summary.goalPercent / 100) * summary.incomeCents))}</strong></div>
          </div>
          <p class="report-note">
            ${goalGap > 0
              ? `Reduzir ${brl(goalGap)} em gastos variáveis faria você bater a meta de ${summary.goalPercent}% neste mês.`
              : `Você guardou ${percent(summary.savingsRate)} da renda, acima da meta de ${summary.goalPercent}%. Mantenha o ritmo.`}
          </p>
        </section>
      </div>

      <div class="dashboard-grid report-grid">
        <section class="card">
          <div class="card-head">
            <div class="card-title-row">
              <span class="card-title-icon tone-primary">${icon("chart-no-axes", 16)}</span>
              <div>
                <div class="card-title">Onde seu dinheiro foi</div>
                <div class="card-subtitle">Categorias de ${escapeHtml(monthLabel(state.month).toLowerCase())}</div>
              </div>
            </div>
          </div>
          ${
            categoryBreakdown.length
              ? `<div class="category-progress-list">
                  ${categoryBreakdown
                    .map(
                      (entry) => `
                        <div class="category-progress">
                          <div class="category-progress-head">
                            <i class="legend-swatch" style="background:${categoryColor(entry.category)}"></i>
                            <span>${escapeHtml(entry.label)}</span>
                            <strong>${percent(entry.percent)}</strong>
                            <em>${brl(entry.amountCents)}</em>
                          </div>
                          <div class="progress-track">
                            <div class="progress-fill" style="width:${Math.max(2, entry.percent)}%;background:${categoryColor(entry.category)}"></div>
                          </div>
                        </div>
                      `,
                    )
                    .join("")}
                </div>`
              : `<p class="empty-inline">Nenhuma despesa registrada em ${escapeHtml(monthLabel(state.month).toLowerCase())}.</p>`
          }
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-title-row">
              <span class="card-title-icon tone-alert">${icon("sparkles", 16)}</span>
              <div>
                <div class="card-title">Insights do Noodle</div>
                <div class="card-subtitle">Leituras rápidas do seu orçamento</div>
              </div>
            </div>
          </div>
          <div class="insight-list">
            ${insights
              .map(
                (insight) => `
                  <div class="insight-item">
                    <span class="insight-icon tone-${insight.tone}">${icon(insight.icon, 15)}</span>
                    <div class="insight-copy">
                      <strong>${escapeHtml(insight.title)}</strong>
                      <p>${escapeHtml(insight.text)}</p>
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        </section>
      </div>
    </div>
  `;
}

function themeOption(value, label, iconName, current) {
  return `
    <button class="theme-option ${current === value ? "is-active" : ""}" type="button" data-theme-choice="${value}" aria-pressed="${current === value}">
      <span class="theme-preview theme-preview--${value}"><i></i><i></i><i></i></span>
      <span class="theme-option-label">${icon(iconName, 13)} ${label}</span>
    </button>
  `;
}

export function settingsView(state) {
  const user = state.user;
  const dashboard = state.dashboard;
  const memberSince = user.createdAt ? formatDateLong(user.createdAt.slice(0, 10)) : "";
  const theme = state.theme;

  return `
    <div class="view-stack">
      ${pageHeading({
        kicker: "Seu espaço",
        title: "Configurações",
        subtitle: "Ajuste sua renda, meta de poupança e preferências. Tudo fica salvo na sua conta local.",
        eyebrowIcon: "settings",
        actions: "",
      })}

      <div class="settings-grid">
        <section class="card settings-card">
          <div class="settings-card-head">
            <span class="card-title-icon tone-primary">${icon("user", 16)}</span>
            <div>
              <h2>Perfil e orçamento</h2>
              <p>O salário é a base dos seus alertas de gasto.</p>
            </div>
          </div>
          <div class="profile-banner">
            <span class="avatar">${escapeHtml(user.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""))}</span>
            <div>
              <strong>${escapeHtml(user.name)}</strong>
              <span>${escapeHtml(user.email)}${memberSince ? ` · desde ${memberSince}` : ""}</span>
            </div>
          </div>
          <form class="settings-form" id="settings-form">
            <div class="field">
              <label for="settings-name">Nome</label>
              <div class="input-shell">
                <span class="input-icon">${icon("user", 16)}</span>
                <input id="settings-name" name="name" type="text" value="${escapeHtml(user.name)}" autocomplete="name" required />
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="settings-salary">Salário mensal</label>
                <div class="input-shell input-shell--money currency-field">
                  <span class="input-icon">R$</span>
                  <input id="settings-salary" name="salary" type="text" inputmode="decimal" value="${escapeHtml(inputFromCents(user.salaryCents))}" placeholder="0,00" />
                </div>
              </div>
              <div class="field">
                <label for="settings-goal">Meta de poupança</label>
                <div class="input-shell">
                  <span class="input-icon">${icon("target", 15)}</span>
                  <input id="settings-goal" name="goal" type="number" min="0" max="90" step="1" value="${Number(user.savingsGoalPercent) || 0}" />
                </div>
              </div>
            </div>
            <span class="field-hint">O salário não é compartilhado. Ele serve apenas para calcular seus limites e alertas.</span>
            <button class="btn btn-primary" type="submit" id="settings-save">
              ${icon("check", 15)} Salvar alterações
            </button>
          </form>
        </section>

        <section class="card settings-card">
          <div class="settings-card-head">
            <span class="card-title-icon tone-secondary">${icon("sun", 16)}</span>
            <div>
              <h2>Aparência</h2>
              <p>Escolha como o Noodle aparece no seu dia.</p>
            </div>
          </div>
          <div class="theme-options">
            ${themeOption("light", "Claro", "sun", theme)}
            ${themeOption("dark", "Escuro", "moon", theme)}
            ${themeOption("system", "Sistema", "monitor", theme)}
          </div>
          <p class="settings-about">O tema é aplicado na hora e fica salvo neste navegador. Se escolher “Sistema”, o Noodle acompanha a preferência do seu dispositivo.</p>
        </section>

        <section class="card settings-card">
          <div class="settings-card-head">
            <span class="card-title-icon tone-positive">${icon("smartphone", 16)}</span>
            <div>
              <h2>Aplicativo</h2>
              <p>Instale o Noodle Finance como PWA no seu dispositivo.</p>
            </div>
          </div>
          <div class="install-panel">
            <span class="install-app-icon">${logoMark(34)}</span>
            <div class="install-panel-copy">
              <strong>Noodle Finance no seu celular ou desktop</strong>
              <span>Funciona offline depois do primeiro acesso e abre em tela cheia, sem barra de navegador.</span>
            </div>
          </div>
          <button class="btn btn-soft" type="button" data-install-app>
            ${icon("download", 15)} Instalar aplicativo
          </button>
          <p class="settings-about">No Chrome/Edge, também é possível instalar pelo ícone de instalação na barra de endereço. No iPhone, use Compartilhar → “Adicionar à Tela de Início”.</p>
        </section>

        <section class="card settings-card">
          <div class="settings-card-head">
            <span class="card-title-icon tone-alert">${icon("shield-check", 16)}</span>
            <div>
              <h2>Dados e privacidade</h2>
              <p>Seus dados ficam neste servidor local, não em nuvens de terceiros.</p>
            </div>
          </div>
          <div class="data-actions">
            <button class="data-action" type="button" data-export-data>
              <span class="data-action-icon">${icon("download", 15)}</span>
              <span class="data-action-copy"><strong>Exportar meus dados</strong><span>Baixe um JSON com perfil, transações e assinaturas</span></span>
              <span class="data-action-chevron">${icon("chevron-right", 15)}</span>
            </button>
            <button class="data-action data-action--danger" type="button" data-logout>
              <span class="data-action-icon">${icon("log-out", 15)}</span>
              <span class="data-action-copy"><strong>Encerrar sessão</strong><span>Você poderá entrar novamente quando quiser</span></span>
              <span class="data-action-chevron">${icon("chevron-right", 15)}</span>
            </button>
          </div>
          <p class="settings-about">
            Noodle Finance v1.0 · ${dashboard.transactions.length} transações e ${(dashboard.allSubscriptions ?? []).length} assinaturas nesta conta.
          </p>
        </section>

        <div class="logout-card">
          <div class="logout-card-copy">
            <strong>Privacidade em primeiro lugar</strong>
            <span>Seus dados são armazenados localmente em <code>/.data/db.json</code> no servidor onde o Noodle está rodando.</span>
          </div>
          <button class="btn btn-ghost" type="button" data-export-data>${icon("download", 15)} Exportar dados</button>
        </div>
      </div>
    </div>
  `;
}
