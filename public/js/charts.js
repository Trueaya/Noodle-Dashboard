import {
  brl,
  brlCompact,
  clamp,
  currentMonth,
  dateDay,
  daysInMonth,
  escapeHtml,
  formatDateShort,
  shortMonth,
} from "./utils.js";

let sequence = 0;
const nextId = () => `chart-${++sequence}`;

const VIEW_W = 780;
const VIEW_H = 300;
const MARGIN = { top: 22, right: 16, bottom: 34, left: 62 };
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom;

const CHART_COLORS = [
  "var(--primary)",
  "var(--secondary)",
  "var(--positive)",
  "var(--alert)",
  "var(--negative)",
  "#9A8FA6",
  "#7FA6A0",
  "#B9A48B",
  "var(--muted)",
];

export function sparkline(values, color = "var(--primary)", className = "") {
  const id = nextId();
  const data = Array.isArray(values) && values.length > 1 ? values : [0, 0];
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const width = 140;
  const height = 42;
  const pad = 3;
  const points = data.map((value, index) => ({
    x: (index / (data.length - 1)) * width,
    y: height - pad - ((value - min) / span) * (height - pad * 2),
  }));
  const line = smoothPath(points);
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return `<svg class="sparkline ${className}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="color:${color}" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="currentColor" stop-opacity=".28"/>
        <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function smoothPath(points) {
  if (points.length < 2) return "";
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index - 1] ?? points[index];
    const start = points[index];
    const end = points[index + 1];
    const after = points[index + 2] ?? end;
    const control1 = {
      x: start.x + (end.x - before.x) / 6,
      y: start.y + (end.y - before.y) / 6,
    };
    const control2 = {
      x: end.x - (after.x - start.x) / 6,
      y: end.y - (after.y - start.y) / 6,
    };
    path += ` C ${control1.x.toFixed(2)} ${control1.y.toFixed(2)}, ${control2.x.toFixed(2)} ${control2.y.toFixed(2)}, ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }
  return path;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function monthSeries(dashboard) {
  const totalDays = daysInMonth(dashboard.month);
  const expenses = new Map();
  const incomes = new Map();
  for (const transaction of dashboard.transactions) {
    const day = dateDay(transaction.date);
    const bucket = transaction.type === "income" ? incomes : expenses;
    bucket.set(day, (bucket.get(day) ?? 0) + transaction.amountCents);
  }
  const subscriptions = new Map();
  for (const subscription of dashboard.subscriptions) {
    if (subscription.active === false) continue;
    const day = clamp(subscription.billingDay, 1, totalDays);
    subscriptions.set(day, (subscriptions.get(day) ?? 0) + subscription.amountCents);
  }

  const points = [{ day: 0, value: dashboard.user.salaryCents, income: 0, expense: 0, subscription: 0 }];
  let balance = dashboard.user.salaryCents;
  for (let day = 1; day <= totalDays; day += 1) {
    const income = incomes.get(day) ?? 0;
    const expense = expenses.get(day) ?? 0;
    const subscription = subscriptions.get(day) ?? 0;
    balance += income - expense - subscription;
    points.push({ day, value: balance, income, expense, subscription });
  }
  return points;
}

function niceBounds(values) {
  let min = Math.min(0, ...values);
  let max = Math.max(...values, 1);
  if (max === min) max = min + 1;
  const span = max - min;
  min = min < 0 ? min - span * 0.08 : 0;
  max += span * 0.12;
  if (min === max) max += 100;
  return { min, max };
}

function axisTicks(min, max, count = 4) {
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, index) => min + step * index);
}

function chartTooltip(html, xPercent, yPercent) {
  return `<div class="chart-tooltip" style="left:${xPercent}%;top:${yPercent}%">${html}</div>`;
}

function attachMonthHover(container, points, xFor, bounds, month) {
  const svg = container.querySelector("svg.chart");
  const overlay = container.querySelector(".chart-hover-surface");
  const guide = container.querySelector(".chart-guide");
  const dot = container.querySelector(".chart-focus-dot");
  const tooltip = container.querySelector(".chart-tooltip");
  if (!svg || !overlay || !tooltip) return;

  const totalDays = points.length - 1;

  const show = (event) => {
    const rect = svg.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const xView = ratio * VIEW_W;
    const day = clamp(Math.round(((xView - MARGIN.left) / PLOT_W) * totalDays), 0, totalDays);
    const point = points[day];
    const x = xFor(day);
    const y = MARGIN.top + ((bounds.max - point.value) / (bounds.max - bounds.min)) * PLOT_H;
    if (guide) {
      guide.setAttribute("x1", x);
      guide.setAttribute("x2", x);
      guide.setAttribute("y1", MARGIN.top);
      guide.setAttribute("y2", MARGIN.top + PLOT_H);
      guide.style.opacity = "1";
    }
    if (dot) {
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.style.opacity = "1";
    }
    const dateLabel =
      day === 0 ? "Início do mês" : formatDateShort(`${month}-${pad(day)}`);
    tooltip.innerHTML = `
      <span class="chart-tooltip-label">${dateLabel}</span>
      <strong>${brl(point.value)}</strong>
      ${point.expense || point.subscription ? `<span class="chart-tooltip-sub">Saídas: ${brl(point.expense + point.subscription)}</span>` : ""}
      ${point.income ? `<span class="chart-tooltip-sub positive">Entradas: ${brl(point.income)}</span>` : ""}
    `;
    tooltip.style.left = `${(x / VIEW_W) * 100}%`;
    tooltip.style.top = `${(y / VIEW_H) * 100}%`;
    tooltip.classList.add("is-visible");
  };

  const hide = () => {
    tooltip.classList.remove("is-visible");
    if (guide) guide.style.opacity = "0";
    if (dot) dot.style.opacity = "0";
  };

  overlay.addEventListener("pointermove", show);
  overlay.addEventListener("pointerleave", hide);
}

export function renderCashflowChart(container, dashboard, mode = "month") {
  if (!container) return;
  container.innerHTML = "";
  container.classList.add("chart-canvas");
  if (mode === "history") {
    renderHistoryChart(container, dashboard);
  } else {
    renderMonthChart(container, dashboard);
  }
}

function renderMonthChart(container, dashboard) {
  const points = monthSeries(dashboard);
  const totalDays = points.length - 1;
  const values = points.map((point) => point.value);
  const bounds = niceBounds(values);
  const ticks = axisTicks(bounds.min, bounds.max, 4);
  const id = nextId();
  const gradientId = `${id}-area`;
  const glowId = `${id}-glow`;

  const xFor = (day) => MARGIN.left + (day / totalDays) * PLOT_W;
  const yFor = (value) => MARGIN.top + ((bounds.max - value) / (bounds.max - bounds.min)) * PLOT_H;
  const visiblePoints = points.map((point) => ({ x: xFor(point.day), y: yFor(point.value) }));
  const line = smoothPath(visiblePoints);
  const area = `${line} L ${MARGIN.left + PLOT_W} ${MARGIN.top + PLOT_H} L ${MARGIN.left} ${MARGIN.top + PLOT_H} Z`;

  const today = currentMonth() === dashboard.month ? new Date().getDate() : null;
  const todayIndex = today ? Math.min(today, totalDays) : null;
  const actualPoints = todayIndex ? visiblePoints.slice(0, todayIndex + 1) : visiblePoints;
  const projectedPoints = todayIndex ? visiblePoints.slice(todayIndex) : [];

  const grid = ticks
    .map((tick) => {
      const y = yFor(tick);
      return `
        <line class="chart-grid-line" x1="${MARGIN.left}" x2="${MARGIN.left + PLOT_W}" y1="${y}" y2="${y}"/>
        <text class="chart-axis-label" x="${MARGIN.left - 12}" y="${y + 4}" text-anchor="end">${escapeHtml(brlCompact(tick))}</text>
      `;
    })
    .join("");

  const xTickDays = [1, 8, 15, 22, totalDays];
  const xLabels = xTickDays
    .filter((day, index, list) => list.indexOf(day) === index)
    .map((day) => {
      const x = xFor(day);
      const anchor = x > VIEW_W - 50 ? "end" : "middle";
      return `<text class="chart-axis-label" x="${x}" y="${VIEW_H - 10}" text-anchor="${anchor}">${pad(day)}</text>`;
    })
    .join("");

  const salaryY = yFor(dashboard.user.salaryCents);
  const salaryLine =
    dashboard.user.salaryCents > 0
      ? `
      <line class="chart-salary-line" x1="${MARGIN.left}" x2="${MARGIN.left + PLOT_W}" y1="${salaryY}" y2="${salaryY}"/>
      <text class="chart-salary-label" x="${MARGIN.left + PLOT_W - 4}" y="${salaryY - 8}" text-anchor="end">salário</text>
    `
      : "";

  const todayLine =
    todayIndex && todayIndex > 0
      ? `
      <line class="chart-today-line" x1="${xFor(todayIndex)}" x2="${xFor(todayIndex)}" y1="${MARGIN.top}" y2="${MARGIN.top + PLOT_H}"/>
      <text class="chart-today-label" x="${xFor(todayIndex)}" y="${MARGIN.top - 7}" text-anchor="middle">hoje</text>
    `
      : "";

  const endPoint = points[points.length - 1];
  const endX = xFor(totalDays);
  const endY = yFor(endPoint.value);

  container.innerHTML = `
    <div class="chart-legend chart-legend--inline">
      <span><i class="legend-dot" style="background:var(--primary)"></i>Saldo disponível</span>
      <span><i class="legend-dot legend-dot--outline" style="border-color:var(--muted)"></i>Salário</span>
    </div>
    <div class="chart-inner">
      <svg class="chart" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Evolução do saldo ao longo do mês">
        <defs>
          <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity=".26"/>
            <stop offset="70%" stop-color="var(--primary)" stop-opacity=".06"/>
            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="${glowId}" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity=".7"/>
            <stop offset="100%" stop-color="var(--secondary)" stop-opacity=".85"/>
          </linearGradient>
        </defs>
        ${grid}
        ${salaryLine}
        ${todayLine}
        <path d="${area}" fill="url(#${gradientId})"/>
        <path d="${smoothPath(actualPoints)}" fill="none" stroke="var(--primary)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        ${
          projectedPoints.length > 1
            ? `<path d="${smoothPath(projectedPoints)}" fill="none" stroke="var(--primary)" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="5 6" opacity=".55"/>`
            : ""
        }
        <circle cx="${endX}" cy="${endY}" r="4.5" fill="var(--surface)" stroke="var(--primary)" stroke-width="2.5"/>
        <line class="chart-guide" x1="0" x2="0" y1="0" y2="0" style="opacity:0"/>
        <circle class="chart-focus-dot" cx="0" cy="0" r="5" style="opacity:0" fill="var(--surface)" stroke="var(--primary)" stroke-width="2.5"/>
        ${xLabels}
        <rect class="chart-hover-surface" x="${MARGIN.left}" y="${MARGIN.top}" width="${PLOT_W}" height="${PLOT_H}" fill="transparent"/>
      </svg>
      ${chartTooltip("", 0, 0)}
    </div>
    ${todayIndex ? '<p class="chart-footnote">A linha tracejada é a projeção até o fim do mês.</p>' : ""}
  `;

  attachMonthHover(container, points, xFor, bounds, dashboard.month);
}

function renderHistoryChart(container, dashboard) {
  const history = dashboard.history;
  const max = Math.max(...history.flatMap((entry) => [entry.incomeCents, entry.committedCents]), 1);
  const bounds = { min: 0, max: max * 1.16 };
  const ticks = axisTicks(0, bounds.max, 4);
  const groupWidth = PLOT_W / history.length;
  const barWidth = Math.min(26, groupWidth * 0.24);
  const yFor = (value) => MARGIN.top + ((bounds.max - value) / bounds.max) * PLOT_H;
  const id = nextId();

  const grid = ticks
    .map((tick) => {
      const y = yFor(tick);
      return `<line class="chart-grid-line" x1="${MARGIN.left}" x2="${MARGIN.left + PLOT_W}" y1="${y}" y2="${y}"/>
        <text class="chart-axis-label" x="${MARGIN.left - 12}" y="${y + 4}" text-anchor="end">${escapeHtml(brlCompact(tick))}</text>`;
    })
    .join("");

  const bars = history
    .map((entry, index) => {
      const center = MARGIN.left + groupWidth * index + groupWidth / 2;
      const incomeHeight = Math.max(2, MARGIN.top + PLOT_H - yFor(entry.incomeCents));
      const expenseHeight = Math.max(2, MARGIN.top + PLOT_H - yFor(entry.committedCents));
      const xIncome = center - barWidth - 3;
      const xExpense = center + 3;
      return `
        <g class="chart-bar-group" data-index="${index}">
          <rect class="chart-bar chart-bar--income" x="${xIncome}" y="${yFor(entry.incomeCents)}" width="${barWidth}" height="${incomeHeight}" rx="${Math.min(6, barWidth / 2)}"/>
          <rect class="chart-bar chart-bar--expense" x="${xExpense}" y="${yFor(entry.committedCents)}" width="${barWidth}" height="${expenseHeight}" rx="${Math.min(6, barWidth / 2)}"/>
          <rect class="chart-bar-hit" x="${center - groupWidth / 2}" y="${MARGIN.top}" width="${groupWidth}" height="${PLOT_H}" fill="transparent"/>
          <text class="chart-axis-label chart-axis-label--month" x="${center}" y="${VIEW_H - 10}" text-anchor="middle">${escapeHtml(entry.label)}</text>
        </g>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="chart-legend chart-legend--inline">
      <span><i class="legend-dot" style="background:var(--positive)"></i>Receitas</span>
      <span><i class="legend-dot" style="background:var(--primary)"></i>Gastos + assinaturas</span>
    </div>
    <div class="chart-inner">
      <svg class="chart" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Comparativo dos últimos seis meses">
        <defs></defs>
        ${grid}
        ${bars}
      </svg>
      ${chartTooltip("", 0, 0)}
    </div>
    <p class="chart-footnote">Comparativo dos seus últimos 6 meses de orçamento.</p>
  `;

  const svg = container.querySelector("svg.chart");
  const tooltip = container.querySelector(".chart-tooltip");
  const groups = container.querySelectorAll(".chart-bar-group");
  groups.forEach((group) => {
    group.addEventListener("pointermove", (event) => {
      const index = Number(group.dataset.index);
      const entry = history[index];
      const rect = svg.getBoundingClientRect();
      const center = MARGIN.left + groupWidth * index + groupWidth / 2;
      tooltip.innerHTML = `
        <span class="chart-tooltip-label">${escapeHtml(entry.label)} · ${entry.month.slice(0, 4)}</span>
        <strong class="${entry.remainingCents >= 0 ? "positive" : "negative"}">Saldo ${brl(entry.remainingCents)}</strong>
        <span class="chart-tooltip-sub">Receitas: ${brl(entry.incomeCents)}</span>
        <span class="chart-tooltip-sub">Gastos: ${brl(entry.committedCents)}</span>
      `;
      tooltip.style.left = `${(center / VIEW_W) * 100}%`;
      tooltip.style.top = `${(MARGIN.top / VIEW_H) * 100}%`;
      tooltip.classList.add("is-visible");
      groups.forEach((item) => item.classList.toggle("is-active", item === group));
      event.stopPropagation();
    });
    group.addEventListener("pointerleave", () => {
      tooltip.classList.remove("is-visible");
      group.classList.remove("is-active");
    });
  });
}

export function donutChart(categories, totalCents) {
  const radius = 82;
  const circumference = 2 * Math.PI * radius;
  const gap = categories.length > 1 ? 4 : 0;
  let offset = 0;
  const segments = categories
    .map((entry, index) => {
      const share = totalCents > 0 ? entry.amountCents / totalCents : 0;
      const length = Math.max(0, share * circumference - gap);
      const color = CHART_COLORS[index % CHART_COLORS.length];
      const segment = `
        <circle class="donut-segment" cx="110" cy="110" r="${radius}" fill="none"
          stroke="${color}" stroke-width="22"
          stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}"
          stroke-linecap="butt">
          <title>${escapeHtml(entry.label)} · ${brl(entry.amountCents)} (${entry.percent.toFixed(1)}%)</title>
        </circle>
      `;
      offset += share * circumference;
      return segment;
    })
    .join("");

  return `
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 220 220" role="img" aria-label="Gastos por categoria">
        <circle cx="110" cy="110" r="${radius}" fill="none" stroke="var(--surface-3)" stroke-width="22"/>
        <g transform="rotate(-90 110 110)">${segments}</g>
      </svg>
      <div class="donut-center">
        <span>Gastos no mês</span>
        <strong>${brl(totalCents)}</strong>
        <em>${categories.length ? `${categories.length} categorias` : "sem lançamentos"}</em>
      </div>
    </div>
  `;
}

export function donutLegend(categories) {
  if (!categories.length) {
    return `<p class="empty-inline">Nenhuma despesa lançada neste mês.</p>`;
  }
  return categories
    .map(
      (entry, index) => `
        <div class="legend-row">
          <i class="legend-swatch" style="background:${CHART_COLORS[index % CHART_COLORS.length]}"></i>
          <span class="legend-name">${escapeHtml(entry.label)}</span>
          <span class="legend-value">${entry.percent.toFixed(1).replace(".", ",")}%</span>
          <span class="legend-amount">${brl(entry.amountCents)}</span>
        </div>
      `,
    )
    .join("");
}

export function scoreRing(score, tone = "positive", size = 96, strokeWidth = 8) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = clamp(score, 0, 100) / 100;
  const dash = progress * circumference;
  return `
    <div class="score-ring" style="--score-color: var(--${tone}); --score-size:${size}px">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--surface-3)" stroke-width="${strokeWidth}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--score-color)" stroke-width="${strokeWidth}"
          stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"
          transform="rotate(-90 ${size / 2} ${size / 2})" class="score-ring-progress"/>
      </svg>
      <div class="score-ring-center">
        <strong>${score}</strong>
        <span>de 100</span>
      </div>
    </div>
  `;
}

export function savingsSparkline(history) {
  return sparkline(history.map((entry) => entry.savingsRate), "var(--secondary)");
}

export function historyExpenseSparkline(history) {
  return sparkline(history.map((entry) => entry.committedCents), "var(--primary)");
}
