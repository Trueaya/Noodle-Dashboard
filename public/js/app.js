import { api, ApiError } from "./api.js";
import { icon, logoMark } from "./icons.js";
import { renderCashflowChart, scoreRing } from "./charts.js";
import { severityMeta, transactionsResults } from "./components.js";
import { overviewView } from "./views-overview.js";
import { reportsView, settingsView, subscriptionsView, transactionsView } from "./views-pages.js";
import {
  brl,
  currentMonth,
  debounce,
  daysInMonth,
  escapeHtml,
  initials,
  monthLabel,
  parseMoneyInput,
  percent,
  shiftMonth,
  todayISO,
} from "./utils.js";

const VIEW_TITLES = {
  overview: "Visão geral",
  transactions: "Transações",
  subscriptions: "Assinaturas",
  reports: "Relatórios",
  settings: "Configurações",
};
const VIEWS = Object.keys(VIEW_TITLES);
const THEME_KEY = "noodle-finance-theme";
const AUTH_REDIRECT_ERROR = "Não foi possível carregar sua conta. Tente novamente.";
const GOOGLE_AUTH_ERRORS = {
  "google-config":
    "O login com Google ainda não está configurado neste servidor. Use seu e-mail e senha ou peça ao administrador para configurar as credenciais.",
  "google-state": "A sessão de login com Google expirou. Tente novamente.",
  "google-denied": "O acesso com Google foi cancelado.",
  "google-email": "Não foi possível confirmar seu e-mail na conta Google.",
  "google-failed": "Não foi possível concluir o login com Google. Tente novamente.",
};

const state = {
  user: null,
  meta: null,
  dashboard: null,
  month: currentMonth(),
  view: "overview",
  chartMode: "month",
  filters: { search: "", type: "all", category: "all" },
  theme: storedTheme(),
  deferredInstallPrompt: null,
  onboardingDismissed: false,
  authMode: "login",
};

const dom = {
  boot: document.getElementById("boot"),
  authView: document.getElementById("auth-view"),
  appView: document.getElementById("app-view"),
  viewRoot: document.getElementById("view-root"),
  sidebar: document.getElementById("sidebar"),
  sidebarOverlay: document.getElementById("sidebar-overlay"),
  sidebarClose: document.getElementById("sidebar-close"),
  mobileMenu: document.getElementById("mobile-menu"),
  modalRoot: document.getElementById("modal-root"),
  toastRoot: document.getElementById("toast-root"),
  loginPanel: document.getElementById("auth-login-panel"),
  registerPanel: document.getElementById("auth-register-panel"),
  loginForm: document.getElementById("login-form"),
  registerForm: document.getElementById("register-form"),
  demoButton: document.getElementById("demo-button"),
  globalSearch: document.getElementById("global-search"),
  notifButton: document.getElementById("notif-button"),
  notifPanel: document.getElementById("notif-panel"),
  notifBadge: document.getElementById("notif-badge"),
  notifList: document.getElementById("notif-list"),
  notifSubtitle: document.getElementById("notif-subtitle"),
  notifClose: document.getElementById("notif-close"),
  userButton: document.getElementById("user-button"),
  userMenu: document.getElementById("user-menu"),
};

/* Theme */
function storedTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return ["light", "dark", "system"].includes(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function resolvedTheme(theme = state.theme) {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme === "dark" ? "dark" : "light";
}

function updateThemeIcons(applied) {
  const nextAction = applied === "dark" ? "claro" : "escuro";
  document.querySelectorAll("[data-theme-icon]").forEach((element) => {
    element.innerHTML = icon(applied === "dark" ? "sun" : "moon", 18);
  });
  document.querySelectorAll(".theme-button").forEach((button) => {
    button.setAttribute("aria-label", `Ativar tema ${nextAction}`);
    button.title = `Ativar tema ${nextAction}`;
  });
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    const active = button.dataset.themeChoice === state.theme;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function applyTheme(theme, { persist = true } = {}) {
  state.theme = ["light", "dark", "system"].includes(theme) ? theme : "system";
  const applied = resolvedTheme();
  document.documentElement.dataset.theme = applied;
  updateThemeIcons(applied);
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, state.theme);
    } catch {
      /* armazenamento indisponível */
    }
  }
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", applied === "dark" ? "#1A1917" : "#F0EEE6");
  });
}

/* Static hydration */
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((element) => {
    if (element.dataset.hydrated) return;
    element.innerHTML = icon(element.dataset.icon, Number(element.dataset.size) || 18);
    element.dataset.hydrated = "1";
  });
}

function hydrateLogos(root = document) {
  root.querySelectorAll("[data-logo]").forEach((element) => {
    if (element.dataset.hydrated) return;
    element.innerHTML = logoMark(Number(element.dataset.logo) || 40);
    element.dataset.hydrated = "1";
  });
}

/* Screen transitions */
function hideBoot() {
  if (!dom.boot || dom.boot.dataset.hidden) return;
  dom.boot.dataset.hidden = "1";
  dom.boot.classList.add("is-leaving");
  window.setTimeout(() => dom.boot.classList.add("hidden"), 360);
}

function setAuthMode(mode) {
  state.authMode = mode === "register" ? "register" : "login";
  dom.loginPanel?.classList.toggle("hidden", state.authMode !== "login");
  dom.registerPanel?.classList.toggle("hidden", state.authMode !== "register");
  clearAuthErrors();
}

function showAuth() {
  dom.appView.classList.add("hidden");
  dom.authView.classList.remove("hidden");
  setAuthMode(state.authMode === "register" ? "register" : "login");
  hideBoot();
  document.title = "Noodle Finance — seu dinheiro, sem mistério";
}

function showApp() {
  dom.authView.classList.add("hidden");
  dom.appView.classList.remove("hidden");
  hideBoot();
}

/* Toasts */
function toast(type, title, message = "") {
  if (!dom.toastRoot) return;
  const meta = {
    positive: { icon: "check-circle", tone: "positive" },
    negative: { icon: "alert-triangle", tone: "negative" },
    warning: { icon: "alert-circle", tone: "warning" },
    info: { icon: "info", tone: "info" },
  }[type] ?? { icon: "info", tone: "info" };

  const element = document.createElement("div");
  element.className = `toast toast--${type}`;
  element.innerHTML = `
    <span class="toast-icon">${icon(meta.icon, 16)}</span>
    <div>
      <strong>${escapeHtml(title)}</strong>
      ${message ? `<span>${escapeHtml(message)}</span>` : ""}
    </div>
  `;
  dom.toastRoot.appendChild(element);
  window.setTimeout(() => {
    element.classList.add("is-leaving");
    window.setTimeout(() => element.remove(), 220);
  }, 4600);
}

/* Data */
async function fetchDashboard(month = state.month) {
  const dashboard = await api.dashboard(month);
  state.dashboard = dashboard;
  state.user = dashboard.user;
  state.month = dashboard.month;
  return dashboard;
}

async function enterApp(user) {
  state.user = user;
  state.view = "overview";
  state.chartMode = "month";
  state.filters = { search: "", type: "all", category: "all" };
  state.onboardingDismissed = false;
  state.month = currentMonth();
  if (dom.globalSearch) dom.globalSearch.value = "";
  if (!state.meta) state.meta = await api.meta();
  await fetchDashboard(state.month);
  showApp();
  updateUserChrome();
  renderAll();
  if (!state.user.salaryCents && !state.onboardingDismissed) {
    window.setTimeout(() => openOnboarding(), 450);
  }
}

async function reloadDashboard() {
  await fetchDashboard(state.month);
  updateUserChrome();
  renderAll();
}

function renderAll() {
  if (!state.dashboard) return;
  updateUserChrome();
  renderView();
}

function renderView() {
  if (!state.dashboard) return;
  const views = {
    overview: overviewView,
    transactions: transactionsView,
    subscriptions: subscriptionsView,
    reports: reportsView,
    settings: settingsView,
  };
  dom.viewRoot.classList.remove("is-loading");
  dom.viewRoot.innerHTML = (views[state.view] ?? overviewView)(state);
  updateNav();
  updateSidebar();
  updateNotifications();
  document.title = `${VIEW_TITLES[state.view]} · Noodle Finance`;
  bindViewSpecificEvents();
  mountCharts();
}

function mountCharts() {
  if (!state.dashboard) return;
  if (state.view === "overview") {
    renderCashflowChart(document.getElementById("overview-chart"), state.dashboard, state.chartMode);
  }
  if (state.view === "reports") {
    renderCashflowChart(document.getElementById("reports-chart"), state.dashboard, "history");
  }
}

function updateUserChrome() {
  if (!state.user) return;
  const avatarText = initials(state.user.name);
  const name = state.user.name;
  document.getElementById("user-name").textContent = name;
  document.getElementById("user-avatar").textContent = avatarText;
  document.getElementById("user-menu-name").textContent = name;
  document.getElementById("user-menu-email").textContent = state.user.email;
  document.getElementById("user-menu-avatar").textContent = avatarText;
  document.querySelectorAll(".settings-profile-avatar").forEach((element) => {
    element.textContent = avatarText;
  });
}

function updateNav() {
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });
  if (!state.dashboard) return;
  const txCount = state.dashboard.transactions.length;
  const subCount = (state.dashboard.allSubscriptions ?? state.dashboard.subscriptions).filter(
    (entry) => entry.active !== false,
  ).length;
  const txBadge = document.getElementById("nav-transactions-badge");
  const subBadge = document.getElementById("nav-subscriptions-badge");
  if (txBadge) {
    txBadge.textContent = String(txCount);
    txBadge.classList.toggle("hidden", txCount === 0);
  }
  if (subBadge) {
    subBadge.textContent = String(subCount);
    subBadge.classList.toggle("hidden", subCount === 0);
  }
}

function updateSidebar() {
  const host = document.getElementById("sidebar-health");
  if (!host) return;
  if (!state.dashboard) {
    host.innerHTML = "";
    return;
  }
  const { summary, user } = state.dashboard;
  if (!user.salaryCents) {
    host.innerHTML = `
      <div class="side-health">
        <div class="side-health-head">
          <span class="side-health-title">Saúde financeira</span>
          <span class="status-chip status-chip--neutral">Sem dados</span>
        </div>
        <p class="side-health-foot">Defina seu salário para o Noodle calcular seus limites e alertas.</p>
        <button class="btn btn-soft btn-sm" type="button" data-view="settings" style="width:100%;margin-top:10px">
          ${icon("wallet", 14)} Definir salário
        </button>
      </div>
    `;
    return;
  }
  const health = summary.health;
  const tone = health.status === "neutral" ? "muted" : health.status;
  const goalRatio = Math.max(0, Math.min(100, (summary.savingsRate / Math.max(1, summary.goalPercent)) * 100));
  const meterTone =
    summary.savingsRate >= summary.goalPercent
      ? "positive"
      : summary.savingsRate >= summary.goalPercent / 2
        ? "warning"
        : "danger";
  const messages = {
    positive: "Orçamento saudável. Continue de olho nas assinaturas.",
    warning: "Orçamento apertado. Revise os gastos variáveis.",
    danger: "Gastos acima do limite. Hora de cortar o que não é essencial.",
    neutral: "Adicione sua renda para calcular o score.",
  };
  const statusChip =
    health.status === "positive" ? "positive" : health.status === "warning" ? "warning" : health.status === "danger" ? "danger" : "neutral";

  host.innerHTML = `
    <div class="side-health">
      <div class="side-health-head">
        <span class="side-health-title">Saúde financeira</span>
        <span class="status-chip status-chip--${statusChip}">${escapeHtml(health.label)}</span>
      </div>
      <div class="side-health-body">
        ${scoreRing(health.score, tone, 80)}
        <div class="side-health-copy">
          <strong>${percent(summary.savingsRate)} de sobra</strong>
          <span>${escapeHtml(messages[health.status] ?? messages.neutral)}</span>
        </div>
      </div>
      <div class="side-health-meter">
        <div class="meter-label">
          <span>Meta de poupança</span>
          <strong>${percent(summary.savingsRate)} / ${summary.goalPercent}%</strong>
        </div>
        <div class="meter-track">
          <div class="meter-fill meter-fill--${meterTone}" style="width:${goalRatio}%"></div>
        </div>
      </div>
      <div class="side-health-foot">Saldo de ${brl(summary.remainingCents)} neste mês.</div>
    </div>
  `;
}

function updateNotifications() {
  if (!state.dashboard || !dom.notifList) return;
  const notifications = state.dashboard.notifications;
  const attention = notifications.filter((entry) => entry.severity === "danger" || entry.severity === "warning").length;
  if (dom.notifBadge) {
    dom.notifBadge.textContent = String(attention);
    dom.notifBadge.classList.toggle("hidden", attention === 0);
  }
  if (dom.notifSubtitle) {
    dom.notifSubtitle.textContent = attention
      ? `${attention} ${attention === 1 ? "aviso pede" : "avisos pedem"} atenção agora`
      : "Tudo em dia por aqui";
  }
  dom.notifList.innerHTML = notifications
    .map((notification) => {
      const meta = severityMeta(notification.severity);
      const content = `
        <span class="notif-item-icon tone-${meta.tone}">${icon(notification.icon ?? meta.icon, 15)}</span>
        <div class="notif-item-copy">
          <strong>${escapeHtml(notification.title)}</strong>
          <span>${escapeHtml(notification.message)}</span>
          ${notification.action ? `<span class="notif-item-link">Revisar agora ${icon("arrow-right", 12)}</span>` : ""}
        </div>
      `;
      return notification.action
        ? `<button class="notif-item notif-item--action" type="button" data-view="${escapeHtml(notification.action)}">${content}</button>`
        : `<div class="notif-item">${content}</div>`;
    })
    .join("");
}

/* Navigation */
function navigate(view) {
  if (!VIEWS.includes(view) || !state.dashboard) return;
  const sameView = state.view === view;
  state.view = view;
  closeSidebar();
  closePopovers();
  if (!sameView) {
    renderView();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function openSidebar() {
  dom.sidebar.classList.add("is-open");
  dom.sidebarOverlay.classList.remove("hidden");
  document.body.classList.add("no-scroll");
}

function closeSidebar() {
  dom.sidebar.classList.remove("is-open");
  dom.sidebarOverlay.classList.add("hidden");
  document.body.classList.remove("no-scroll");
}

function closePopovers() {
  dom.notifPanel?.classList.add("hidden");
  dom.userMenu?.classList.add("hidden");
  dom.notifButton?.setAttribute("aria-expanded", "false");
  dom.userButton?.setAttribute("aria-expanded", "false");
}

function toggleNotifications(force) {
  if (!dom.notifPanel) return;
  const willOpen = typeof force === "boolean" ? force : dom.notifPanel.classList.contains("hidden");
  closePopovers();
  dom.notifPanel.classList.toggle("hidden", !willOpen);
  dom.notifButton?.setAttribute("aria-expanded", String(willOpen));
}

function toggleUserMenu(force) {
  if (!dom.userMenu) return;
  const willOpen = typeof force === "boolean" ? force : dom.userMenu.classList.contains("hidden");
  closePopovers();
  dom.userMenu.classList.toggle("hidden", !willOpen);
  dom.userButton?.setAttribute("aria-expanded", String(willOpen));
}

/* Filters */
function hasActiveFilters() {
  return Boolean(state.filters.search) || state.filters.type !== "all" || state.filters.category !== "all";
}

function refreshTransactionResults() {
  const container = document.getElementById("transactions-results");
  if (container) container.innerHTML = transactionsResults(state);
  const clear = document.querySelector("[data-clear-filters]");
  clear?.classList.toggle("is-visible", hasActiveFilters());
}

function clearFilters() {
  state.filters = { search: "", type: "all", category: "all" };
  if (dom.globalSearch) dom.globalSearch.value = "";
  if (state.view === "transactions") renderView();
}

function bindViewSpecificEvents() {
  if (state.view === "transactions") {
    const search = document.getElementById("tx-search");
    const month = document.getElementById("tx-month-filter");
    const type = document.getElementById("tx-type-filter");
    const category = document.getElementById("tx-category-filter");
    if (month) {
      month.addEventListener("change", () => {
        if (month.value !== state.month) void setMonth(month.value);
      });
    }
    if (search) {
      search.addEventListener(
        "input",
        debounce(() => {
          state.filters.search = search.value;
          if (dom.globalSearch) dom.globalSearch.value = search.value;
          refreshTransactionResults();
        }, 120),
      );
    }
    if (type) {
      type.addEventListener("change", () => {
        state.filters.type = type.value;
        refreshTransactionResults();
      });
    }
    if (category) {
      category.addEventListener("change", () => {
        state.filters.category = category.value;
        refreshTransactionResults();
      });
    }
  }

  if (state.view === "settings") {
    const form = document.getElementById("settings-form");
    form?.addEventListener("submit", handleProfileSubmit);
  }
}

/* Auth */
function clearAuthErrors() {
  document.getElementById("login-error")?.classList.add("hidden");
  document.getElementById("register-error")?.classList.add("hidden");
  document.querySelectorAll("#auth-view .field.has-error").forEach((field) => field.classList.remove("has-error"));
}

function showAuthError(type, message, field) {
  const element = document.getElementById(type === "register" ? "register-error" : "login-error");
  if (element) {
    element.textContent = message;
    element.classList.remove("hidden");
  }
  if (field) {
    const form = type === "register" ? dom.registerForm : dom.loginForm;
    const input = form?.querySelector(`[name="${field}"]`);
    input?.closest(".field")?.classList.add("has-error");
    input?.focus();
  }
}

function setButtonLoading(button, loading, label = "Aguarde...") {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span><span>${escapeHtml(label)}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearAuthErrors();
  const form = dom.loginForm;
  const email = form.querySelector('[name="email"]').value.trim();
  const password = form.querySelector('[name="password"]').value;
  if (!email || !password) {
    showAuthError("login", "Preencha e-mail e senha para entrar.");
    return;
  }
  const button = document.getElementById("login-submit");
  setButtonLoading(button, true, "Entrando...");
  try {
    const { user } = await api.login(email, password);
    await enterApp(user);
    form.querySelector('[name="password"]').value = "";
  } catch (error) {
    showAuthError("login", error instanceof ApiError ? error.message : AUTH_REDIRECT_ERROR, error.field);
  } finally {
    setButtonLoading(button, false);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  clearAuthErrors();
  const form = dom.registerForm;
  const name = form.querySelector('[name="name"]').value.trim();
  const email = form.querySelector('[name="email"]').value.trim();
  const password = form.querySelector('[name="password"]').value;
  const terms = form.querySelector('[name="terms"]');
  if (name.length < 2) return showAuthError("register", "Informe seu nome completo.", "name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showAuthError("register", "Informe um e-mail válido.", "email");
  if (password.length < 8) return showAuthError("register", "A senha precisa ter pelo menos 8 caracteres.", "password");
  if (!terms?.checked) return showAuthError("register", "Confirme o aviso de privacidade para criar sua conta.", "terms");

  const button = document.getElementById("register-submit");
  setButtonLoading(button, true, "Criando conta...");
  try {
    const { user } = await api.register({ name, email, password });
    await enterApp(user);
    form.reset();
  } catch (error) {
    showAuthError("register", error instanceof ApiError ? error.message : AUTH_REDIRECT_ERROR, error.field);
  } finally {
    setButtonLoading(button, false);
  }
}

async function handleDemo() {
  setButtonLoading(dom.demoButton, true, "Preparando demonstração...");
  try {
    const { user } = await api.demo();
    await enterApp(user);
  } catch (error) {
    showAuthError("login", error instanceof ApiError ? error.message : "Não foi possível abrir a demonstração.");
  } finally {
    setButtonLoading(dom.demoButton, false);
  }
}

/* Month navigation */
async function setMonth(month) {
  if (!month || month === state.month || month > currentMonth()) return;
  state.month = month;
  dom.viewRoot.classList.add("is-loading");
  try {
    await reloadDashboard();
  } catch (error) {
    toast("negative", "Não foi possível carregar o mês", error.message);
    dom.viewRoot.classList.remove("is-loading");
  }
}

async function changeMonth(step) {
  await setMonth(shiftMonth(state.month, Number(step)));
}

/* Static events */
function setupAuth() {
  document.querySelectorAll("[data-auth-switch]").forEach((button) => {
    button.addEventListener("click", () => {
      setAuthMode(button.dataset.authSwitch);
      const target =
        state.authMode === "register"
          ? dom.registerForm?.querySelector('[name="name"]')
          : dom.loginForm?.querySelector('[name="email"]');
      target?.focus({ preventScroll: true });
    });
  });
  dom.loginForm?.addEventListener("submit", handleLogin);
  dom.registerForm?.addEventListener("submit", handleRegister);
  dom.demoButton?.addEventListener("click", handleDemo);
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.innerHTML = icon(showing ? "eye" : "eye-off", 17);
      button.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
    });
  });
  document.querySelectorAll("#auth-view .field input").forEach((input) => {
    input.addEventListener("input", () => input.closest(".field")?.classList.remove("has-error"));
  });
}

function bindStaticEvents() {
  document.querySelectorAll(".theme-button").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(resolvedTheme() === "dark" ? "light" : "dark");
    });
  });

  dom.mobileMenu?.addEventListener("click", openSidebar);
  dom.sidebarClose?.addEventListener("click", closeSidebar);
  dom.sidebarOverlay?.addEventListener("click", closeSidebar);

  dom.notifButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleNotifications();
  });
  dom.notifClose?.addEventListener("click", () => toggleNotifications(false));
  dom.userButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleUserMenu();
  });
  document.getElementById("logout-button")?.addEventListener("click", handleLogout);

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".popover-wrap")) closePopovers();
  });

  dom.globalSearch?.addEventListener(
    "input",
    debounce(() => {
      const value = dom.globalSearch.value;
      state.filters.search = value;
      if (state.view !== "transactions") {
        if (value.trim()) navigate("transactions");
      } else {
        refreshTransactionResults();
      }
    }, 220),
  );

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (dom.globalSearch && dom.globalSearch.offsetParent !== null) {
        dom.globalSearch.focus();
        dom.globalSearch.select();
      } else {
        navigate("transactions");
        window.setTimeout(() => document.getElementById("tx-search")?.focus(), 60);
      }
    }
    if (event.key === "Escape") {
      if (dom.modalRoot.children.length) return;
      closePopovers();
      closeSidebar();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1080) closeSidebar();
  });

  window.addEventListener("online", () => toast("info", "Você está online", "Seus dados voltaram a sincronizar com o servidor local."));
  window.addEventListener("offline", () => toast("warning", "Você está offline", "O painel continua disponível com os dados em cache."));

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    toast("positive", "Aplicativo instalado", "O Noodle Finance agora está na sua tela inicial.");
  });

  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  colorScheme.addEventListener?.("change", () => {
    if (state.theme === "system") applyTheme("system", { persist: false });
  });
}

async function handleLogout() {
  closeModal({ immediate: true });
  closePopovers();
  try {
    await api.logout();
  } catch {
    /* segue para a tela de login mesmo se a rede falhar */
  }
  state.user = null;
  state.dashboard = null;
  state.meta = null;
  state.view = "overview";
  state.month = currentMonth();
  state.filters = { search: "", type: "all", category: "all" };
  if (dom.globalSearch) dom.globalSearch.value = "";
  dom.viewRoot.innerHTML = "";
  showAuth();
  toast("info", "Sessão encerrada", "Você saiu da sua conta com segurança.");
}

/* Service worker */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[noodle] Service worker não registrado:", error.message);
    });
  });
}

/* Modal infrastructure */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let activeModal = null;
let lastModalFocus = null;

function openModal({ content, onMount }) {
  if (!dom.modalRoot) return null;
  if (activeModal) {
    activeModal.backdrop.remove();
    activeModal = null;
  }
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = content;
  const modal = backdrop.firstElementChild;
  if (!modal) return null;

  lastModalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dom.modalRoot.appendChild(backdrop);
  document.body.classList.add("no-scroll");
  activeModal = { backdrop, modal, closing: false };

  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) closeModal();
  });
  onMount?.(backdrop, modal);

  const focusTarget =
    backdrop.querySelector("[data-autofocus]") ??
    backdrop.querySelector("input, select, textarea") ??
    backdrop.querySelector("button");
  window.setTimeout(() => focusTarget?.focus({ preventScroll: true }), 40);
  return { backdrop, modal };
}

function closeModal({ immediate = false } = {}) {
  const current = activeModal;
  if (!current) return;
  activeModal = null;
  if (!dom.sidebar?.classList.contains("is-open")) {
    document.body.classList.remove("no-scroll");
  }

  const restoreFocus = () => {
    if (!activeModal && lastModalFocus?.isConnected) {
      lastModalFocus.focus({ preventScroll: true });
    }
  };

  if (immediate) {
    current.backdrop.remove();
    restoreFocus();
    return;
  }
  current.backdrop.classList.add("is-closing");
  window.setTimeout(() => {
    current.backdrop.remove();
    restoreFocus();
  }, 170);
}

function handleModalKeydown(event) {
  if (!activeModal) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...activeModal.modal.querySelectorAll(FOCUSABLE)].filter(
    (element) => element.getClientRects().length > 0 && !element.closest(".hidden"),
  );
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function modalShell({ title, subtitle = "", iconName = "sparkles", iconTone = "primary", body, footer = "", formId = "", wide = false }) {
  const head = `
    <div class="modal-head">
      <span class="card-title-icon tone-${iconTone}">${icon(iconName, 18)}</span>
      <div class="modal-head-copy">
        <h2 id="modal-title">${escapeHtml(title)}</h2>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      <button class="icon-button icon-button--sm modal-close" type="button" data-modal-close aria-label="Fechar">
        ${icon("x", 15)}
      </button>
    </div>
  `;
  const inner = `${head}<div class="modal-body">${body}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ""}`;
  return `
    <section class="modal ${wide ? "modal--wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      ${formId ? `<form id="${formId}" novalidate>${inner}</form>` : inner}
    </section>
  `;
}

function setModalError(container, message, fieldName = "") {
  const box = container.querySelector("[data-modal-error]");
  if (box) {
    box.textContent = message;
    box.classList.remove("hidden");
  } else {
    toast("negative", "Confira os dados", message);
  }
  container.querySelectorAll(".field.has-error").forEach((field) => field.classList.remove("has-error"));
  if (fieldName) {
    const input = container.querySelector(`[name="${fieldName}"]`);
    input?.closest(".field")?.classList.add("has-error");
    input?.focus();
  }
}

function clearModalError(container) {
  container.querySelector("[data-modal-error]")?.classList.add("hidden");
  container.querySelectorAll(".field.has-error").forEach((field) => field.classList.remove("has-error"));
}

function categoryOptions(categories, selected = "") {
  return `
    <option value="">Selecione...</option>
    ${categories
      .map(
        (category) =>
          `<option value="${escapeHtml(category.id)}" ${selected === category.id ? "selected" : ""}>${escapeHtml(category.label)}</option>`,
      )
      .join("")}
  `;
}

function transactionToast(result, type) {
  const guard = result?.guard;
  if (type === "expense" && guard?.level === "danger") {
    toast(
      "warning",
      "Despesa registrada com alerta",
      guard.projectedRemaining < 0
        ? `Com este gasto, o mês fica ${brl(-guard.projectedRemaining)} no vermelho. Revise as assinaturas e os gastos variáveis.`
        : "O orçamento chegou ao limite. Evite novos gastos até o próximo salário.",
    );
    return;
  }
  if (type === "expense" && guard?.level === "warning") {
    toast(
      "warning",
      "Despesa registrada",
      `${percent(guard.projectedRatio)} do salário já está comprometido. O Noodle vai avisar se o orçamento apertar.`,
    );
    return;
  }
  toast(
    "positive",
    type === "income" ? "Entrada adicionada" : "Despesa adicionada",
    "Seu painel já foi atualizado com o novo lançamento.",
  );
}

/* Transaction dialog */
function openTransactionModal(initialType = "expense") {
  if (!state.meta || !state.dashboard) return;
  let type = initialType === "income" ? "income" : "expense";
  const lastDay = daysInMonth(state.month);
  const defaultDate =
    state.month === currentMonth()
      ? todayISO()
      : `${state.month}-${String(Math.min(lastDay, new Date().getDate())).padStart(2, "0")}`;
  const categories = type === "income" ? state.meta.incomeCategories : state.meta.categories;

  const content = modalShell({
    title: "Nova transação",
    subtitle: "Registre uma despesa ou entrada para manter seu painel atualizado.",
    iconName: "arrow-left-right",
    formId: "transaction-form",
    body: `
      <div class="modal-form">
        <div class="form-alert hidden" data-modal-error role="alert"></div>
        <div class="type-toggle" role="group" aria-label="Tipo de transação">
          <button class="type-option is-active" type="button" data-tx-type="expense" aria-pressed="true">
            ${icon("arrow-down-right", 14)} Despesa
          </button>
          <button class="type-option" type="button" data-tx-type="income" aria-pressed="false">
            ${icon("arrow-up-right", 14)} Entrada
          </button>
        </div>

        <div class="modal-amount-preview"><span>Valor</span><strong data-amount-preview>R$ 0,00</strong></div>

        <div class="field">
          <label for="tx-description">Descrição</label>
          <div class="input-shell">
            <span class="input-icon">${icon("receipt", 16)}</span>
            <input id="tx-description" name="description" type="text" maxlength="120" placeholder="Ex.: Mercado, salário, aluguel..." autocomplete="off" data-autofocus />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="tx-amount">Valor</label>
            <div class="input-shell input-shell--money">
              <span class="input-icon">R$</span>
              <input id="tx-amount" name="amount" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off" />
            </div>
          </div>
          <div class="field">
            <label for="tx-date">Data</label>
            <div class="input-shell">
              <span class="input-icon">${icon("calendar", 16)}</span>
              <input id="tx-date" name="date" type="date" value="${defaultDate}" max="${todayISO()}" />
            </div>
          </div>
        </div>

        <div class="field">
          <label for="tx-category">Categoria</label>
          <div class="input-shell">
            <span class="input-icon">${icon("filter", 15)}</span>
            <select id="tx-category" name="category">${categoryOptions(categories)}</select>
          </div>
        </div>

        <div class="modal-note">
          ${icon("bell", 14)}
          <span>Se este gasto comprometer o orçamento, o Noodle mostra um alerta assim que você salvar.</span>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" type="button" data-modal-close>Cancelar</button>
      <button class="btn btn-primary" type="submit" form="transaction-form" id="transaction-submit">
        ${icon("plus", 15)} Adicionar despesa
      </button>
    `,
  });

  openModal({
    content,
    onMount(backdrop) {
      const form = backdrop.querySelector("#transaction-form");
      const amountInput = form.elements.amount;
      const preview = backdrop.querySelector("[data-amount-preview]");
      const categorySelect = form.elements.category;
      const submit = backdrop.querySelector("#transaction-submit");
      const typeButtons = [...backdrop.querySelectorAll("[data-tx-type]")];

      const updatePreview = () => {
        const cents = parseMoneyInput(amountInput.value);
        preview.textContent = Number.isFinite(cents) ? brl(cents) : "R$ 0,00";
      };

      const applyType = (nextType) => {
        type = nextType === "income" ? "income" : "expense";
        typeButtons.forEach((button) => {
          const active = button.dataset.txType === type;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        categorySelect.innerHTML = categoryOptions(
          type === "income" ? state.meta.incomeCategories : state.meta.categories,
        );
        submit.innerHTML = `${icon("plus", 15)} Adicionar ${type === "income" ? "entrada" : "despesa"}`;
      };

      typeButtons.forEach((button) => {
        button.addEventListener("click", () => applyType(button.dataset.txType));
      });
      amountInput.addEventListener("input", updatePreview);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearModalError(backdrop);
        const description = form.elements.description.value.trim();
        const amountCents = parseMoneyInput(form.elements.amount.value);
        const date = form.elements.date.value;
        const category = form.elements.category.value;

        if (description.length < 2) return setModalError(backdrop, "Descreva a transação com pelo menos 2 caracteres.", "description");
        if (!Number.isFinite(amountCents) || amountCents <= 0) return setModalError(backdrop, "Informe um valor maior que zero.", "amount");
        if (!date) return setModalError(backdrop, "Informe a data da transação.", "date");
        if (!category) return setModalError(backdrop, "Escolha uma categoria.", "category");

        setButtonLoading(submit, true, "Salvando...");
        try {
          const result = await api.addTransaction({ type, description, amountCents, category, date });
          closeModal();
          try {
            await reloadDashboard();
          } catch {
            /* o lançamento já foi salvo; o painel tenta atualizar no próximo acesso */
          }
          transactionToast(result, type);
        } catch (error) {
          setButtonLoading(submit, false);
          setModalError(backdrop, error instanceof ApiError ? error.message : "Não foi possível salvar a transação.", error.field);
        }
      });
      applyType(type);
    },
  });
}

/* Subscription dialog */
function openSubscriptionModal() {
  if (!state.meta || !state.dashboard) return;
  const today = new Date().getDate();
  const defaultDay = Math.min(today, daysInMonth(currentMonth()));

  const content = modalShell({
    title: "Nova assinatura",
    subtitle: "Simule o impacto no orçamento antes de assumir uma cobrança recorrente.",
    iconName: "repeat",
    iconTone: "secondary",
    formId: "subscription-form",
    body: `
      <div class="modal-form">
        <div class="form-alert hidden" data-modal-error role="alert"></div>

        <div class="field">
          <label for="sub-name">Nome do serviço</label>
          <div class="input-shell">
            <span class="input-icon">${icon("repeat", 16)}</span>
            <input id="sub-name" name="name" type="text" maxlength="80" placeholder="Ex.: Netflix, academia, internet..." autocomplete="off" data-autofocus />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="sub-amount">Valor mensal</label>
            <div class="input-shell input-shell--money">
              <span class="input-icon">R$</span>
              <input id="sub-amount" name="amount" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off" />
            </div>
          </div>
          <div class="field">
            <label for="sub-day">Dia da cobrança</label>
            <div class="input-shell">
              <span class="input-icon">${icon("calendar", 16)}</span>
              <input id="sub-day" name="billingDay" type="number" min="1" max="31" step="1" value="${defaultDay}" />
            </div>
          </div>
        </div>

        <div class="field">
          <label for="sub-category">Categoria</label>
          <div class="input-shell">
            <span class="input-icon">${icon("filter", 15)}</span>
            <select id="sub-category" name="category">
              ${categoryOptions(state.meta.categories, "assinaturas")}
            </select>
          </div>
        </div>

        <div class="impact-preview impact-preview--positive" data-subscription-impact></div>

        <div class="modal-note">
          ${icon("alert-circle", 14)}
          <span>O aviso considera o salário, os gastos do mês e todas as assinaturas ativas. Você pode pausar ou excluir depois.</span>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" type="button" data-modal-close>Cancelar</button>
      <button class="btn btn-primary" type="submit" form="subscription-form" id="subscription-submit">
        ${icon("plus", 15)} Adicionar assinatura
      </button>
    `,
  });

  openModal({
    content,
    onMount(backdrop) {
      const form = backdrop.querySelector("#subscription-form");
      const amountInput = form.elements.amount;
      const impact = backdrop.querySelector("[data-subscription-impact]");
      const submit = backdrop.querySelector("#subscription-submit");

      const renderImpact = () => {
        const amountCents = parseMoneyInput(amountInput.value);
        const amount = Number.isFinite(amountCents) ? amountCents : 0;
        const { summary } = state.dashboard;
        const income = summary.incomeCents;
        const projectedCommitted = summary.committedCents + amount;
        const projectedRemaining = income - projectedCommitted;
        const projectedRatio = income > 0 ? (projectedCommitted / income) * 100 : 0;

        let level = "positive";
        let title = "Cabe no orçamento";
        let message = `Depois desta cobrança, ainda sobram ${brl(projectedRemaining)} no mês.`;
        if (!income) {
          level = "warning";
          title = "Defina seu salário primeiro";
          message = "Sem a renda cadastrada, não é possível dizer se esta assinatura cabe no orçamento. Você ainda pode cadastrá-la.";
        } else if (projectedRemaining < 0) {
          level = "danger";
          title = "Não será possível manter esta assinatura com o salário atual";
          message = `Ela deixaria o mês ${brl(-projectedRemaining)} no vermelho. Cancele outra assinatura ou reduza gastos antes da próxima cobrança.`;
        } else if (projectedRatio >= 90) {
          level = "warning";
          title = "Orçamento no limite";
          message = `A assinatura levaria ${percent(projectedRatio)} do salário e sobrariam apenas ${brl(projectedRemaining)}. Qualquer gasto extra pode estourar o mês.`;
        } else if (projectedRatio >= 80) {
          level = "warning";
          title = "Assinatura pesada no orçamento";
          message = `Ela deixaria ${percent(projectedRatio)} do salário comprometido. Revise se realmente vale a pena antes de continuar.`;
        }

        impact.className = `impact-preview impact-preview--${level}`;
        impact.innerHTML = `
          <div class="impact-preview-head">
            <span>Impacto no orçamento</span>
            <strong>${income > 0 ? percent(projectedRatio) : "sem renda"}</strong>
          </div>
          <div class="impact-preview-values">
            <span>Total comprometido</span>
            <strong>${brl(projectedCommitted)}</strong>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${Math.min(100, Math.max(0, projectedRatio))}%"></div>
          </div>
          <div class="impact-preview-values">
            <span>Saldo projetado</span>
            <strong class="${projectedRemaining < 0 ? "negative" : ""}">${brl(projectedRemaining)}</strong>
          </div>
          <div class="impact-preview-message">
            <strong class="${level === "danger" ? "negative" : level === "warning" ? "warning" : "positive"}">${escapeHtml(title)}</strong><br />
            ${escapeHtml(message)}
          </div>
        `;
      };

      amountInput.addEventListener("input", renderImpact);
      renderImpact();

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearModalError(backdrop);
        const name = form.elements.name.value.trim();
        const amountCents = parseMoneyInput(form.elements.amount.value);
        const billingDay = Number(form.elements.billingDay.value);

        if (name.length < 2) return setModalError(backdrop, "Dê um nome para a assinatura.", "name");
        if (!Number.isFinite(amountCents) || amountCents <= 0) return setModalError(backdrop, "Informe um valor mensal maior que zero.", "amount");
        if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) {
          return setModalError(backdrop, "O dia de cobrança deve ficar entre 1 e 31.", "billingDay");
        }

        setButtonLoading(submit, true, "Adicionando...");
        try {
          const result = await api.addSubscription({
            name,
            amountCents,
            billingDay,
            category: form.elements.category.value || "assinaturas",
          });
          closeModal();
          try {
            await reloadDashboard();
          } catch {
            /* o painel será atualizado no próximo acesso */
          }
          const guard = result?.guard;
          if (guard?.level === "danger") {
            toast(
              "warning",
              "Assinatura adicionada com alerta",
              "Não será possível manter esta assinatura com o salário atual. Veja os alertas do painel e revise as recorrências.",
            );
          } else if (guard?.level === "warning") {
            toast(
              "warning",
              "Assinatura adicionada com atenção",
              `${percent(guard.projectedRatio)} do salário ficará comprometido. O Noodle vai acompanhar o impacto.`,
            );
          } else {
            toast("positive", "Assinatura adicionada", "Ela já aparece no seu total mensal e nos alertas inteligentes.");
          }
        } catch (error) {
          setButtonLoading(submit, false);
          setModalError(backdrop, error instanceof ApiError ? error.message : "Não foi possível salvar a assinatura.", error.field);
        }
      });
    },
  });
}

/* Confirmation dialog */
function openConfirm({ title, message, confirmLabel = "Excluir", iconName = "trash-2", onConfirm }) {
  const content = `
    <section class="modal modal--sm" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="confirm-content">
        <span class="confirm-icon">${icon(iconName, 22)}</span>
        <h2 id="modal-title">${escapeHtml(title)}</h2>
        <p>${message}</p>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" data-modal-close>Cancelar</button>
        <button class="btn btn-danger" type="button" id="confirm-action">${escapeHtml(confirmLabel)}</button>
      </div>
    </section>
  `;

  openModal({
    content,
    onMount(backdrop) {
      const button = backdrop.querySelector("#confirm-action");
      button.addEventListener("click", async () => {
        setButtonLoading(button, true, "Aguarde...");
        try {
          await onConfirm();
          closeModal();
        } catch (error) {
          setButtonLoading(button, false);
          toast("negative", "Não foi possível concluir", error instanceof ApiError ? error.message : "Tente novamente em instantes.");
        }
      });
    },
  });
}

function confirmDeleteTransaction(id, description) {
  openConfirm({
    title: "Excluir transação?",
    message: `A transação <strong>${escapeHtml(description)}</strong> será removida do seu histórico.`,
    confirmLabel: "Excluir transação",
    onConfirm: async () => {
      await api.deleteTransaction(id);
      await reloadDashboard();
      toast("positive", "Transação excluída", "O painel e os alertas já foram recalculados.");
    },
  });
}

function confirmDeleteSubscription(id, name) {
  openConfirm({
    title: "Excluir assinatura?",
    message: `A assinatura <strong>${escapeHtml(name)}</strong> deixará de contar no orçamento mensal e nas próximas cobranças.`,
    confirmLabel: "Excluir assinatura",
    onConfirm: async () => {
      await api.deleteSubscription(id);
      await reloadDashboard();
      toast("positive", "Assinatura excluída", "O total mensal e os alertas foram atualizados.");
    },
  });
}

async function toggleSubscription(button, id, active) {
  button.disabled = true;
  try {
    await api.updateSubscription(id, { active: !active });
    await reloadDashboard();
    toast(
      "positive",
      active ? "Assinatura pausada" : "Assinatura retomada",
      active ? "Ela não entra mais no total mensal." : "Ela voltou a contar no orçamento e nos alertas.",
    );
  } catch (error) {
    button.disabled = false;
    toast("negative", "Não foi possível atualizar", error instanceof ApiError ? error.message : "Tente novamente.");
  }
}

/* Settings and profile */
async function handleProfileSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  const salaryRaw = form.elements.salary.value;
  const salaryCents = salaryRaw.trim() ? parseMoneyInput(salaryRaw) : 0;
  const goal = Number(form.elements.goal.value);

  if (name.length < 2) {
    toast("negative", "Nome inválido", "Informe seu nome completo.");
    form.elements.name.focus();
    return;
  }
  if (!Number.isFinite(salaryCents) || salaryCents < 0) {
    toast("negative", "Salário inválido", "Informe um valor válido ou deixe o campo vazio.");
    form.elements.salary.focus();
    return;
  }
  if (!Number.isFinite(goal) || goal < 0 || goal > 90) {
    toast("negative", "Meta inválida", "A meta de poupança deve ficar entre 0% e 90%.");
    form.elements.goal.focus();
    return;
  }

  const button = form.querySelector("#settings-save");
  setButtonLoading(button, true, "Salvando...");
  try {
    const { user } = await api.updateProfile({ name, salaryCents, savingsGoalPercent: goal });
    state.user = user;
    await reloadDashboard();
    toast("positive", "Preferências salvas", "Seu salário e sua meta já estão valendo nos alertas.");
  } catch (error) {
    toast("negative", "Não foi possível salvar", error instanceof ApiError ? error.message : "Tente novamente em instantes.");
  } finally {
    setButtonLoading(button, false);
  }
}

/* Onboarding */
function openOnboarding() {
  if (!state.user || state.user.salaryCents || !state.dashboard) return;
  let step = 1;
  let salaryCents = Number(state.user.salaryCents) || 0;
  let goal = Number(state.user.savingsGoalPercent) || 20;

  const content = `
    <section class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="onboard-hero">
        <div class="onboard-brand">${logoMark(27)} <span>Noodle Finance</span></div>
        <div class="onboard-steps" aria-hidden="true">
          <span class="onboard-step is-active" data-onboard-step="1"></span>
          <span class="onboard-step" data-onboard-step="2"></span>
        </div>
        <h2 id="modal-title">Vamos calibrar seu orçamento</h2>
        <p data-onboard-copy>Informe quanto você recebe por mês. É a partir daqui que o Noodle calcula o que realmente cabe no seu bolso.</p>
      </div>
      <div class="onboard-body" data-onboard-body></div>
      <div class="onboard-actions">
        <button class="onboard-skip" type="button" data-onboard-skip>Configurar depois</button>
        <div class="onboard-buttons">
          <button class="btn btn-ghost hidden" type="button" data-onboard-back>Voltar</button>
          <button class="btn btn-primary" type="button" data-onboard-next>
            Continuar ${icon("arrow-right", 14)}
          </button>
        </div>
      </div>
    </section>
  `;

  openModal({
    content,
    onMount(backdrop) {
      const body = backdrop.querySelector("[data-onboard-body]");
      const title = backdrop.querySelector("#modal-title");
      const copy = backdrop.querySelector("[data-onboard-copy]");
      const nextButton = backdrop.querySelector("[data-onboard-next]");
      const backButton = backdrop.querySelector("[data-onboard-back]");
      const skipButton = backdrop.querySelector("[data-onboard-skip]");

      const renderStep = () => {
        backdrop.querySelectorAll("[data-onboard-step]").forEach((dot) => {
          dot.classList.toggle("is-active", Number(dot.dataset.onboardStep) === step);
        });

        if (step === 1) {
          title.textContent = "Vamos calibrar seu orçamento";
          copy.textContent =
            "Informe quanto você recebe por mês. É a partir daqui que o Noodle calcula o que realmente cabe no seu bolso.";
          nextButton.innerHTML = `Continuar ${icon("arrow-right", 14)}`;
          backButton.classList.add("hidden");
          body.innerHTML = `
            <div class="form-alert hidden" data-onboard-error role="alert"></div>
            <div class="field">
              <label for="onboard-salary">Quanto você recebe por mês?</label>
              <div class="input-shell input-shell--money">
                <span class="input-icon">R$</span>
                <input id="onboard-salary" data-onboard-salary type="text" inputmode="decimal" placeholder="0,00" value="${salaryCents ? escapeHtml(inputFromCents(salaryCents)) : ""}" autocomplete="off" data-autofocus />
              </div>
              <span class="field-hint">Use o valor líquido que cai na sua conta.</span>
            </div>
            <div class="field" style="margin-top:14px">
              <label for="onboard-goal">Quanto quer guardar por mês?</label>
              <div class="input-shell">
                <span class="input-icon">${icon("target", 15)}</span>
                <input id="onboard-goal" data-onboard-goal type="number" min="0" max="90" step="1" value="${goal}" />
              </div>
              <div class="quick-day-grid">
                ${[10, 20, 30, 40]
                  .map(
                    (value) =>
                      `<button class="quick-day ${goal === value ? "is-active" : ""}" type="button" data-goal-preset="${value}">${value}%</button>`,
                  )
                  .join("")}
              </div>
            </div>
          `;
          body.querySelectorAll("[data-goal-preset]").forEach((button) => {
            button.addEventListener("click", () => {
              const input = body.querySelector("[data-onboard-goal]");
              input.value = button.dataset.goalPreset;
              body.querySelectorAll("[data-goal-preset]").forEach((entry) => {
                entry.classList.toggle("is-active", entry === button);
              });
            });
          });
          window.setTimeout(() => body.querySelector("[data-onboard-salary]")?.focus(), 50);
        } else {
          title.textContent = "Agora o Noodle cuida do resto";
          copy.textContent =
            "Com a renda e a meta configuradas, os alertas mostram quando um gasto pesa e quando uma assinatura não cabe mais no mês.";
          nextButton.innerHTML = `${icon("check", 15)} Começar a usar`;
          backButton.classList.remove("hidden");
          body.innerHTML = `
            <div class="onboard-benefits">
              <div class="onboard-benefit">${icon("bell", 16)}<span>Avisos antes do orçamento estourar e quando uma assinatura fica pesada demais.</span></div>
              <div class="onboard-benefit">${icon("repeat", 16)}<span>Impacto de cada cobrança recorrente calculado sobre o seu salário.</span></div>
              <div class="onboard-benefit">${icon("piggy-bank", 16)}<span>Acompanhamento da sua meta de poupança, mês a mês.</span></div>
            </div>
            <div class="modal-note" style="margin-top:15px">
              ${icon("wallet", 15)}
              <span>Salário de <strong>${brl(salaryCents)}</strong> e meta de <strong>${goal}%</strong> de poupança. Você pode alterar isso quando quiser em Configurações.</span>
            </div>
          `;
        }
      };

      const readStepOne = () => {
        const salaryInput = body.querySelector("[data-onboard-salary]");
        const goalInput = body.querySelector("[data-onboard-goal]");
        const error = body.querySelector("[data-onboard-error]");
        error?.classList.add("hidden");
        body.querySelector(".field.has-error")?.classList.remove("has-error");
        const parsed = parseMoneyInput(salaryInput.value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          if (error) {
            error.textContent = "Informe seu salário mensal para o Noodle calcular seus limites.";
            error.classList.remove("hidden");
          }
          salaryInput.closest(".field")?.classList.add("has-error");
          salaryInput.focus();
          return false;
        }
        salaryCents = parsed;
        const parsedGoal = Number(goalInput.value);
        goal = Number.isFinite(parsedGoal) ? Math.min(90, Math.max(0, Math.round(parsedGoal))) : 20;
        return true;
      };

      nextButton.addEventListener("click", async () => {
        if (step === 1) {
          if (!readStepOne()) return;
          step = 2;
          renderStep();
          return;
        }

        nextButton.disabled = true;
        nextButton.innerHTML = `<span class="spinner"></span><span>Salvando...</span>`;
        try {
          const { user } = await api.updateProfile({ salaryCents, savingsGoalPercent: goal });
          state.user = user;
          state.onboardingDismissed = true;
          closeModal();
          try {
            await reloadDashboard();
          } catch {
            updateUserChrome();
          }
          toast("positive", "Tudo pronto", `Seu salário de ${brl(salaryCents)} já está protegido pelos alertas do Noodle.`);
        } catch (error) {
          nextButton.disabled = false;
          renderStep();
          toast("negative", "Não foi possível salvar", error instanceof ApiError ? error.message : "Tente novamente em instantes.");
        }
      });

      backButton.addEventListener("click", () => {
        step = 1;
        renderStep();
      });

      skipButton.addEventListener("click", () => {
        state.onboardingDismissed = true;
        closeModal();
        toast("info", "Você pode configurar depois", "Defina seu salário em Configurações para liberar os alertas inteligentes.");
      });

      renderStep();
    },
  });
}

/* Export and install */
function handleExport() {
  const link = document.createElement("a");
  link.href = "/api/export";
  link.download = "noodle-finance-dados.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast("info", "Exportação iniciada", "O download do seu arquivo JSON começou.");
}

async function handleInstall() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) {
    toast("info", "Aplicativo já instalado", "O Noodle Finance já está aberto em modo aplicativo.");
    return;
  }

  const prompt = state.deferredInstallPrompt;
  if (prompt) {
    state.deferredInstallPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        toast("positive", "Instalação iniciada", "Confirme a instalação na janela do navegador.");
      } else {
        toast("info", "Instalação cancelada", "Você pode instalar depois em Configurações.");
      }
    } catch {
      toast("warning", "Não foi possível instalar", "Use o menu do navegador para adicionar o Noodle à tela inicial.");
    }
    return;
  }

  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    toast("info", "Instalar no iPhone ou iPad", "Toque em Compartilhar e depois em “Adicionar à Tela de Início”.");
  } else {
    toast(
      "info",
      "Instale pelo navegador",
      "No Chrome ou Edge, use o ícone de instalação na barra de endereço ou o menu “Instalar Noodle Finance”.",
    );
  }
}

/* Delegated actions */
function bindGlobalActions() {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest("[data-modal-close]")) {
      event.preventDefault();
      closeModal();
      return;
    }

    const monthStep = target.closest("[data-month-step]");
    if (monthStep) {
      event.preventDefault();
      void changeMonth(monthStep.dataset.monthStep);
      return;
    }

    const themeChoice = target.closest("[data-theme-choice]");
    if (themeChoice) {
      event.preventDefault();
      applyTheme(themeChoice.dataset.themeChoice);
      return;
    }

    const chartMode = target.closest("[data-chart-mode]");
    if (chartMode) {
      event.preventDefault();
      state.chartMode = chartMode.dataset.chartMode === "history" ? "history" : "month";
      renderView();
      return;
    }

    if (target.closest("[data-add-transaction]")) {
      event.preventDefault();
      openTransactionModal();
      return;
    }

    if (target.closest("[data-add-subscription]") || target.closest("[data-open-subscription]")) {
      event.preventDefault();
      openSubscriptionModal();
      return;
    }

    if (target.closest("[data-open-notifications]")) {
      event.preventDefault();
      toggleNotifications(true);
      return;
    }

    if (target.closest("[data-clear-filters]")) {
      event.preventDefault();
      clearFilters();
      return;
    }

    const toggle = target.closest("[data-toggle-subscription]");
    if (toggle) {
      event.preventDefault();
      void toggleSubscription(toggle, toggle.dataset.toggleSubscription, toggle.dataset.active === "true");
      return;
    }

    const deleteSub = target.closest("[data-delete-subscription]");
    if (deleteSub) {
      event.preventDefault();
      confirmDeleteSubscription(deleteSub.dataset.deleteSubscription, deleteSub.dataset.name ?? "esta assinatura");
      return;
    }

    const deleteTx = target.closest("[data-delete-transaction]");
    if (deleteTx) {
      event.preventDefault();
      confirmDeleteTransaction(deleteTx.dataset.deleteTransaction, deleteTx.dataset.description ?? "esta transação");
      return;
    }

    if (target.closest("[data-export-data]")) {
      event.preventDefault();
      handleExport();
      return;
    }

    if (target.closest("[data-install-app]")) {
      event.preventDefault();
      void handleInstall();
      return;
    }

    if (target.closest("[data-logout]")) {
      event.preventDefault();
      openConfirm({
        title: "Encerrar sessão?",
        message: "Você precisará informar e-mail e senha para entrar novamente. Seus dados continuam salvos neste servidor.",
        confirmLabel: "Sair da conta",
        iconName: "log-out",
        onConfirm: async () => {
          await handleLogout();
        },
      });
      return;
    }

    const viewTarget = target.closest("[data-view]");
    if (viewTarget) {
      event.preventDefault();
      navigate(viewTarget.dataset.view);
    }
  });

  document.addEventListener("keydown", handleModalKeydown);
}

/* Boot */
async function loadPublicMeta() {
  try {
    const meta = await api.meta();
    state.meta = meta;
    if (meta.demoEnabled === false) {
      dom.demoButton?.closest(".auth-demo")?.classList.add("hidden");
    }
  } catch {
    /* metadados públicos são opcionais; o app tenta novamente ao entrar */
  }
}

function takeAuthRedirectError() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("authError");
  if (!code) return "";
  params.delete("authError");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  return GOOGLE_AUTH_ERRORS[code] ?? GOOGLE_AUTH_ERRORS["google-failed"];
}

async function init() {
  hydrateIcons();
  hydrateLogos();
  applyTheme(state.theme, { persist: false });
  setupAuth();
  bindStaticEvents();
  bindGlobalActions();
  registerServiceWorker();
  await loadPublicMeta();

  const authRedirectError = takeAuthRedirectError();

  try {
    const { user } = await api.me();
    if (user) {
      await enterApp(user);
    } else {
      showAuth();
      if (authRedirectError) showAuthError("login", authRedirectError);
    }
  } catch (error) {
    console.error("[noodle] Falha ao restaurar a sessão:", error);
    showAuth();
    if (!(error instanceof ApiError && error.status === 401)) {
      toast("warning", "Não foi possível carregar sua conta", "Verifique se o servidor está ativo e tente entrar novamente.");
    }
  }
}

init();
