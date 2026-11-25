import {
  CATEGORIES,
  CATEGORY_MAP,
} from "./constants.js";
import {
  addMonths,
  currentMonth,
  formatShortDate,
  inMonth,
  lastMonths,
  monthLabel,
  nextChargeDate,
  shortMonth,
} from "./dates.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ratio = (part, whole) => (whole > 0 ? part / whole : 0);
const cents = (value) => Math.round(Number(value) || 0);

function sum(entries, pick) {
  return entries.reduce((total, entry) => total + cents(pick(entry)), 0);
}

export function transactionView(transaction) {
  const category = CATEGORY_MAP.get(transaction.category);
  return {
    ...transaction,
    categoryLabel: category?.label ?? "Outros",
    essential: Boolean(category?.essential),
    amountCents: cents(transaction.amountCents),
  };
}

export function subscriptionView(subscription) {
  const category = CATEGORY_MAP.get(subscription.category);
  return {
    ...subscription,
    categoryLabel: category?.label ?? "Assinaturas",
    amountCents: cents(subscription.amountCents),
  };
}

function getMonthTransactions(db, userId, month) {
  return db.transactions
    .filter((transaction) => transaction.userId === userId && inMonth(transaction.date, month))
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
}

function getActiveSubscriptions(db, userId) {
  return db.subscriptions
    .filter((subscription) => subscription.userId === userId && subscription.active !== false)
    .sort((a, b) => b.amountCents - a.amountCents);
}

function buildCategoryBreakdown(transactions, subscriptions) {
  const totals = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== "expense") continue;
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + cents(transaction.amountCents));
  }
  for (const subscription of subscriptions) {
    totals.set(subscription.category, (totals.get(subscription.category) ?? 0) + cents(subscription.amountCents));
  }

  const total = [...totals.values()].reduce((acc, value) => acc + value, 0);
  return [...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => {
      const meta = CATEGORY_MAP.get(category);
      return {
        category,
        label: meta?.label ?? "Outros",
        essential: Boolean(meta?.essential),
        amountCents: amount,
        percent: total > 0 ? (amount / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.amountCents - a.amountCents);
}

function calculateHealth({ incomeCents, committedCents, subscriptionCents, savingsRate }) {
  if (incomeCents <= 0) {
    return { score: 0, label: "Sem dados", status: "neutral", tone: "neutral" };
  }
  const committedRatio = ratio(committedCents, incomeCents);
  const subscriptionRatio = ratio(subscriptionCents, incomeCents);

  let score = 100;
  score -= Math.max(0, 1 - Math.max(0, savingsRate) / 30) * 45;
  score -= Math.max(0, committedRatio - 0.5) * 35;
  score -= Math.max(0, subscriptionRatio - 0.08) * 120;
  if (savingsRate < 0) score -= 20;
  if (committedRatio > 1) score = Math.min(score, 22);
  score = clamp(Math.round(score), 5, 98);

  if (score >= 80) return { score, label: "Saudável", status: "positive", tone: "positive" };
  if (score >= 55) return { score, label: "Atenção", status: "warning", tone: "warning" };
  return { score, label: "Crítico", status: "danger", tone: "danger" };
}

function monthlySnapshot(db, user, month) {
  const transactions = getMonthTransactions(db, user.id, month);
  const subscriptions = getActiveSubscriptions(db, user.id);
  const extraIncomeCents = sum(transactions.filter((entry) => entry.type === "income"), (entry) => entry.amountCents);
  const incomeCents = cents(user.salaryCents) + extraIncomeCents;
  const expenseCents = sum(transactions.filter((entry) => entry.type === "expense"), (entry) => entry.amountCents);
  const subscriptionCents = sum(subscriptions, (entry) => entry.amountCents);
  const committedCents = expenseCents + subscriptionCents;
  const remainingCents = incomeCents - committedCents;
  const savingsRate = incomeCents > 0 ? (remainingCents / incomeCents) * 100 : 0;

  return {
    transactions,
    subscriptions,
    incomeCents,
    extraIncomeCents,
    expenseCents,
    subscriptionCents,
    committedCents,
    remainingCents,
    savingsRate,
  };
}

function nextSubscription(subscriptions, today = new Date()) {
  if (!subscriptions.length) return null;
  const candidates = subscriptions.map((subscription) => ({
    subscription,
    date: nextChargeDate(subscription.billingDay, today),
  }));
  candidates.sort((a, b) => a.date.localeCompare(b.date));
  return candidates[0];
}

export function buildAlerts({ summary, user, subscriptions, today = new Date() }) {
  const alerts = [];
  const {
    incomeCents,
    committedCents,
    remainingCents,
    savingsRate,
    subscriptionCents,
  } = summary;
  const committedRatio = ratio(committedCents, incomeCents);
  const subscriptionRatio = ratio(subscriptionCents, incomeCents);
  const goal = Number(user.savingsGoalPercent) || 20;

  if (incomeCents <= 0) {
    alerts.push({
      id: "setup-income",
      severity: "info",
      icon: "wallet",
      title: "Configure sua renda",
      message: "Adicione seu salário nas configurações para liberar os alertas inteligentes do seu orçamento.",
    });
    return alerts;
  }

  if (remainingCents < 0) {
    alerts.push({
      id: "over-budget",
      severity: "danger",
      icon: "alert-triangle",
      title: "Orçamento estourado",
      message: `Seus gastos ultrapassaram o salário em ${formatBRL(-remainingCents)}. Não será possível manter todas as assinaturas no próximo mês.`,
      action: "subscriptions",
    });
  } else if (committedRatio >= 0.9) {
    alerts.push({
      id: "budget-critical",
      severity: "danger",
      icon: "alert-triangle",
      title: "Orçamento no limite",
      message: `Você já comprometeu ${Math.round(committedRatio * 100)}% do salário. Sobram ${formatBRL(remainingCents)} e uma assinatura pode não caber no próximo mês.`,
      action: "subscriptions",
    });
  } else if (committedRatio >= 0.8) {
    alerts.push({
      id: "budget-warning",
      severity: "warning",
      icon: "alert-circle",
      title: "Orçamento apertado",
      message: `${Math.round(committedRatio * 100)}% do salário já está comprometido. Restam ${formatBRL(remainingCents)} para o resto do mês — revise as assinaturas antes de assumir novas.`,
      action: "subscriptions",
    });
  } else if (committedRatio >= 0.65) {
    alerts.push({
      id: "budget-watch",
      severity: "info",
      icon: "info",
      title: "Fique de olho no orçamento",
      message: `${Math.round(committedRatio * 100)}% da sua renda já tem destino. Você ainda tem ${formatBRL(remainingCents)} de folga neste mês.`,
    });
  }

  if (savingsRate < goal && remainingCents >= 0) {
    alerts.push({
      id: "savings-goal",
      severity: remainingCents < incomeCents * 0.1 ? "warning" : "info",
      icon: "target",
      title: "Meta de poupança",
      message: `Sua sobra atual é de ${savingsRate.toFixed(1)}% do salário, abaixo da meta de ${goal}%. Faltam ${formatBRL((goal / 100) * incomeCents - Math.max(0, remainingCents))} para atingir o objetivo.`,
    });
  }

  if (subscriptionRatio >= 0.12) {
    alerts.push({
      id: "subscriptions-heavy",
      severity: "warning",
      icon: "repeat",
      title: "Assinaturas pesadas",
      message: `São ${formatBRL(subscriptionCents)} por mês em assinaturas (${(subscriptionRatio * 100).toFixed(1)}% da renda). Revise as que você usa menos.`,
      action: "subscriptions",
    });
  }

  const next = nextSubscription(subscriptions, today);
  if (next) {
    alerts.push({
      id: "next-charge",
      severity: "info",
      icon: "calendar",
      title: "Próxima cobrança",
      message: `${next.subscription.name} (${formatBRL(next.subscription.amountCents)}) será cobrada em ${formatShortDate(next.date)}.`,
      action: "subscriptions",
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "all-good",
      severity: "positive",
      icon: "check-circle",
      title: "Finanças em dia",
      message: "Seus gastos estão sob controle e sua meta de poupança está no caminho certo. Continue assim!",
    });
  }

  return alerts;
}

export function formatBRL(valueCents) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(valueCents) || 0) / 100);
}

export function buildDashboard(db, user, month, today = new Date()) {
  const summary = monthlySnapshot(db, user, month);
  const previous = monthlySnapshot(db, user, addMonths(month, -1));
  const categoryBreakdown = buildCategoryBreakdown(summary.transactions, summary.subscriptions);
  const health = calculateHealth({
    incomeCents: summary.incomeCents,
    committedCents: summary.committedCents,
    subscriptionCents: summary.subscriptionCents,
    savingsRate: summary.savingsRate,
  });

  const subscriptions = summary.subscriptions.map((subscription) => {
    const view = subscriptionView(subscription);
    let level = "positive";
    if (summary.remainingCents < 0) level = "danger";
    else if (view.amountCents > Math.max(10000, summary.remainingCents * 0.2)) level = "warning";
    return {
      ...view,
      risk: level,
      nextCharge: nextChargeDate(view.billingDay, today),
      percentOfIncome: ratio(view.amountCents, summary.incomeCents) * 100,
    };
  });

  const allSubscriptions = db.subscriptions
    .filter((subscription) => subscription.userId === user.id)
    .slice()
    .sort((a, b) => Number(b.active !== false) - Number(a.active !== false) || b.amountCents - a.amountCents)
    .map((subscription) => {
      const view = subscriptionView(subscription);
      const active = subscription.active !== false;
      let level = active ? "positive" : "neutral";
      if (active && summary.remainingCents < 0) level = "danger";
      else if (active && view.amountCents > Math.max(10000, summary.remainingCents * 0.2)) level = "warning";
      return {
        ...view,
        active,
        risk: level,
        nextCharge: nextChargeDate(view.billingDay, today),
        percentOfIncome: ratio(view.amountCents, summary.incomeCents) * 100,
      };
    });

  const notifications = buildAlerts({
    summary,
    user,
    subscriptions: summary.subscriptions,
    today,
  });

  const history = lastMonths(month, 6).map((historyMonth) => {
    const snapshot = monthlySnapshot(db, user, historyMonth);
    return {
      month: historyMonth,
      label: shortMonth(historyMonth),
      incomeCents: snapshot.incomeCents,
      expenseCents: snapshot.expenseCents,
      subscriptionCents: snapshot.subscriptionCents,
      committedCents: snapshot.committedCents,
      remainingCents: snapshot.remainingCents,
      savingsRate: snapshot.savingsRate,
    };
  });

  const monthsWithTransactions = new Set(
    db.transactions
      .filter((transaction) => transaction.userId === user.id)
      .map((transaction) => transaction.date.slice(0, 7)),
  );
  monthsWithTransactions.add(currentMonth());
  monthsWithTransactions.add(month);
  const availableMonths = [...monthsWithTransactions].sort((a, b) => b.localeCompare(a));

  return {
    month,
    monthLabel: monthLabel(month),
    today: today.toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      salaryCents: cents(user.salaryCents),
      savingsGoalPercent: Number(user.savingsGoalPercent) || 20,
      createdAt: user.createdAt,
    },
    summary: {
      incomeCents: summary.incomeCents,
      extraIncomeCents: summary.extraIncomeCents,
      expenseCents: summary.expenseCents,
      subscriptionCents: summary.subscriptionCents,
      committedCents: summary.committedCents,
      remainingCents: summary.remainingCents,
      savingsRate: summary.savingsRate,
      committedRatio: ratio(summary.committedCents, summary.incomeCents) * 100,
      subscriptionRatio: ratio(summary.subscriptionCents, summary.incomeCents) * 100,
      essentialCents: categoryBreakdown.filter((entry) => entry.essential).reduce((total, entry) => total + entry.amountCents, 0),
      lifestyleCents: categoryBreakdown.filter((entry) => !entry.essential).reduce((total, entry) => total + entry.amountCents, 0),
      health,
      goalPercent: Number(user.savingsGoalPercent) || 20,
    },
    previous: {
      incomeCents: previous.incomeCents,
      expenseCents: previous.expenseCents,
      committedCents: previous.committedCents,
      remainingCents: previous.remainingCents,
    },
    availableMonths,
    categoryBreakdown,
    transactions: summary.transactions.map(transactionView),
    subscriptions,
    allSubscriptions,
    history,
    notifications,
  };
}

export function expenseGuard(db, user, amountCents) {
  const summary = monthlySnapshot(db, user, currentMonth());
  const projectedCommitted = summary.committedCents + cents(amountCents);
  const projectedRemaining = summary.incomeCents - projectedCommitted;
  const projectedRatio = ratio(projectedCommitted, summary.incomeCents);

  return {
    projectedCommitted,
    projectedRemaining,
    projectedRatio: projectedRatio * 100,
    level:
      summary.incomeCents <= 0 || projectedRemaining < 0
        ? "danger"
        : projectedRatio >= 0.9
          ? "warning"
          : "positive",
  };
}

export const CATEGORY_OPTIONS = CATEGORIES;
