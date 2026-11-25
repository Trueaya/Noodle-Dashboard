import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  authenticate,
  clearSessionCookie,
  createUser,
  destroySession,
  findUserByEmail,
  issueSession,
  parseCookies,
  publicUser,
  resolveSession,
  sessionCookie,
} from "./src/auth.js";
import {
  ensureDemoUser,
  exportUserData,
  getDb,
  saveDb,
} from "./src/db.js";
import {
  CATEGORIES,
  CATEGORY_MAP,
  INCOME_CATEGORIES,
  INCOME_CATEGORY_MAP,
  SESSION_COOKIE,
} from "./src/constants.js";
import {
  buildDashboard,
  expenseGuard,
} from "./src/finance.js";
import {
  currentMonth,
  isMonth,
  isValidDate,
} from "./src/dates.js";

try {
  process.loadEnvFile?.();
} catch {
  /* arquivo .env é opcional */
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY = 1024 * 1024;
const SECURE_COOKIES = process.env.NOODLE_SECURE_COOKIES === "1";
const DEMO_ENABLED = process.env.NOODLE_DEMO !== "0";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI?.trim() ?? "";
const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
const GOOGLE_STATE_COOKIE = "noodle_google_state";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const loginAttempts = new Map();
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 12;

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self'",
      "manifest-src 'self'",
      "connect-src 'self'",
      "worker-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  };
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendError(res, status, message, field) {
  sendJson(res, status, { error: message, ...(field ? { field } : {}) });
}

function redirect(res, location, cookies = []) {
  const headers = {
    ...securityHeaders(),
    "Cache-Control": "no-store",
    Location: location,
  };
  if (cookies.length) headers["Set-Cookie"] = cookies;
  res.writeHead(302, headers);
  res.end();
}

function googleAuthError(res, code, cookies = []) {
  redirect(res, `/?authError=${encodeURIComponent(code)}`, cookies);
}

function googleStateCookie(state) {
  return `${GOOGLE_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${SECURE_COOKIES ? "; Secure" : ""}`;
}

function clearGoogleStateCookie() {
  return `${GOOGLE_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE_COOKIES ? "; Secure" : ""}`;
}

function googleRedirectUri(req) {
  if (GOOGLE_REDIRECT_URI) return GOOGLE_REDIRECT_URI;
  return `http${SECURE_COOKIES ? "s" : ""}://${req.headers.host ?? `${HOST}:${PORT}`}${GOOGLE_CALLBACK_PATH}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("Payload muito grande."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return reject(Object.assign(new Error("Envie um objeto JSON válido."), { status: 400 }));
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error("JSON inválido."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function requestUser(req) {
  const token = parseCookies(req.headers.cookie ?? "")[SESSION_COOKIE];
  return { token, user: resolveSession(getDb(), token) };
}

function requireUser(req, res) {
  const { user } = requestUser(req);
  if (!user) {
    sendError(res, 401, "Sua sessão expirou. Entre novamente.");
    return null;
  }
  return user;
}

function normalizeText(value, max = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return NaN;
}

function authRateLimit(req, res, success = false) {
  const key = req.socket.remoteAddress ?? "local";
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (success) {
    loginAttempts.delete(key);
    return true;
  }
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return true;
  }
  if (entry.count >= AUTH_MAX_ATTEMPTS) {
    sendError(res, 429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
    return false;
  }
  entry.count += 1;
  return true;
}

function validateCredentials(body) {
  const name = normalizeText(body.name, 80);
  const email = normalizeText(body.email, 160).toLowerCase();
  const password = String(body.password ?? "");

  if (name.length < 2) return { error: "Informe seu nome completo.", field: "name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Informe um e-mail válido.", field: "email" };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres.", field: "password" };
  if (password.length > 200) return { error: "A senha é muito longa.", field: "password" };
  return { name, email, password };
}

async function handleApi(req, res, url) {
  const method = req.method;
  const route = url.pathname;

  if (route === "/api/health" && method === "GET") {
    return sendJson(res, 200, { ok: true, app: "Noodle Finance", time: new Date().toISOString() });
  }

  if (route === "/api/meta" && method === "GET") {
    return sendJson(res, 200, {
      categories: CATEGORIES,
      incomeCategories: INCOME_CATEGORIES,
      currentMonth: currentMonth(),
      demoEnabled: DEMO_ENABLED,
    });
  }

  if (route === "/api/auth/google" && method === "GET") {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return googleAuthError(res, "google-config");
    }
    const state = randomBytes(24).toString("base64url");
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", googleRedirectUri(req));
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "select_account");
    return redirect(res, authUrl.toString(), [googleStateCookie(state)]);
  }

  if (route === GOOGLE_CALLBACK_PATH && method === "GET") {
    const state = url.searchParams.get("state") ?? "";
    const cookieState = parseCookies(req.headers.cookie ?? "")[GOOGLE_STATE_COOKIE] ?? "";
    const clearState = clearGoogleStateCookie();

    if (!state || !cookieState || state !== cookieState) {
      return googleAuthError(res, "google-state", [clearState]);
    }
    if (url.searchParams.get("error") || !url.searchParams.get("code")) {
      return googleAuthError(res, "google-denied", [clearState]);
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return googleAuthError(res, "google-config", [clearState]);
    }

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: url.searchParams.get("code"),
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: googleRedirectUri(req),
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        console.error("[noodle] Falha ao trocar o código do Google:", tokenResponse.status, await tokenResponse.text());
        return googleAuthError(res, "google-failed", [clearState]);
      }

      const tokens = await tokenResponse.json();
      if (!tokens.access_token) {
        return googleAuthError(res, "google-failed", [clearState]);
      }

      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!profileResponse.ok) {
        return googleAuthError(res, "google-failed", [clearState]);
      }

      const profile = await profileResponse.json();
      const email = normalizeText(profile.email, 160).toLowerCase();
      const emailVerified = profile.email_verified === true || profile.email_verified === "true";
      if (!email || !emailVerified) {
        return googleAuthError(res, "google-email", [clearState]);
      }

      const db = getDb();
      let user = findUserByEmail(db, email);
      if (!user) {
        user = createUser(db, {
          name: normalizeText(profile.name, 80) || email.split("@")[0],
          email,
          password: randomBytes(32).toString("base64url"),
        });
      }
      if (profile.sub) user.googleId = String(profile.sub).slice(0, 128);

      const token = issueSession(db, user.id);
      saveDb();

      return redirect(res, "/", [sessionCookie(token, SECURE_COOKIES), clearState]);
    } catch (error) {
      console.error("[noodle] Erro no login com Google:", error.message);
      return googleAuthError(res, "google-failed", [clearState]);
    }
  }

  if (route === "/api/auth/me" && method === "GET") {
    const { token, user } = requestUser(req);
    if (!user) {
      return sendJson(res, 200, { user: null }, token ? { "Set-Cookie": clearSessionCookie() } : {});
    }
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (route === "/api/auth/register" && method === "POST") {
    if (!authRateLimit(req, res)) return;
    const body = await readBody(req);
    const validated = validateCredentials(body);
    if (validated.error) return sendError(res, 422, validated.error, validated.field);
    const db = getDb();
    if (findUserByEmail(db, validated.email)) {
      return sendError(res, 409, "Já existe uma conta com este e-mail.", "email");
    }
    const user = createUser(db, {
      name: validated.name,
      email: validated.email,
      password: validated.password,
      salaryCents: Math.max(0, parseMoney(body.salaryCents) || 0),
      savingsGoalPercent: Number(body.savingsGoalPercent) || 20,
    });
    const token = issueSession(db, user.id);
    saveDb();
    authRateLimit(req, res, true);
    return sendJson(
      res,
      201,
      { user: publicUser(user) },
      { "Set-Cookie": sessionCookie(token, SECURE_COOKIES) },
    );
  }

  if (route === "/api/auth/login" && method === "POST") {
    if (!authRateLimit(req, res)) return;
    const body = await readBody(req);
    const email = normalizeText(body.email, 160);
    const password = String(body.password ?? "");
    if (!email || !password) return sendError(res, 422, "Preencha e-mail e senha.");
    const db = getDb();
    const user = authenticate(db, email, password);
    if (!user) return sendError(res, 401, "E-mail ou senha incorretos.");
    const token = issueSession(db, user.id);
    saveDb();
    authRateLimit(req, res, true);
    return sendJson(
      res,
      200,
      { user: publicUser(user) },
      { "Set-Cookie": sessionCookie(token, SECURE_COOKIES) },
    );
  }

  if (route === "/api/auth/demo" && method === "POST") {
    if (!DEMO_ENABLED) {
      return sendError(res, 403, "A conta de demonstração está desativada neste servidor.");
    }
    const db = getDb();
    const user = ensureDemoUser();
    const token = issueSession(db, user.id);
    saveDb();
    return sendJson(
      res,
      200,
      { user: publicUser(user) },
      { "Set-Cookie": sessionCookie(token, SECURE_COOKIES) },
    );
  }

  if (route === "/api/auth/logout" && method === "POST") {
    const db = getDb();
    const { token } = requestUser(req);
    destroySession(db, token);
    saveDb();
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
  }

  const user = requireUser(req, res);
  if (!user) return;

  if (route === "/api/profile" && method === "PUT") {
    const body = await readBody(req);
    const name = normalizeText(body.name, 80);
    if (name && name.length < 2) return sendError(res, 422, "Informe um nome válido.", "name");
    if (name) user.name = name;
    if (body.salaryCents !== undefined) {
      const salary = parseMoney(body.salaryCents);
      if (!Number.isFinite(salary) || salary < 0 || salary > 100_000_000_00) {
        return sendError(res, 422, "Informe um salário válido.", "salaryCents");
      }
      user.salaryCents = Math.round(salary);
    }
    if (body.savingsGoalPercent !== undefined) {
      const goal = Number(body.savingsGoalPercent);
      if (!Number.isFinite(goal) || goal < 0 || goal > 90) {
        return sendError(res, 422, "A meta deve ficar entre 0% e 90%.", "savingsGoalPercent");
      }
      user.savingsGoalPercent = Math.round(goal);
    }
    saveDb();
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (route === "/api/dashboard" && method === "GET") {
    const requestedMonth = url.searchParams.get("month") || currentMonth();
    if (!isMonth(requestedMonth)) return sendError(res, 422, "Mês inválido.");
    return sendJson(res, 200, buildDashboard(getDb(), user, requestedMonth));
  }

  if (route === "/api/transactions" && method === "POST") {
    const body = await readBody(req);
    const type = body.type === "income" ? "income" : "expense";
    const description = normalizeText(body.description, 120);
    const amountCents = parseMoney(body.amountCents);
    const category = normalizeText(body.category, 40);
    const date = normalizeText(body.date, 10);

    if (description.length < 2) return sendError(res, 422, "Descreva a transação.", "description");
    if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 100_000_000_00) {
      return sendError(res, 422, "Informe um valor válido.", "amountCents");
    }
    const categoryMap = type === "income" ? INCOME_CATEGORY_MAP : CATEGORY_MAP;
    if (!categoryMap.has(category)) return sendError(res, 422, "Escolha uma categoria válida.", "category");
    if (!isValidDate(date)) return sendError(res, 422, "Informe uma data válida.", "date");

    const db = getDb();
    const transaction = {
      id: randomUUID(),
      userId: user.id,
      type,
      description,
      amountCents: Math.round(amountCents),
      category,
      date,
      createdAt: new Date().toISOString(),
    };
    db.transactions.push(transaction);
    const guard = expenseGuard(db, user, type === "expense" ? amountCents : 0);
    saveDb();
    return sendJson(res, 201, { transaction, guard });
  }

  if (route.startsWith("/api/transactions/") && method === "DELETE") {
    const id = route.split("/").at(-1);
    const db = getDb();
    const before = db.transactions.length;
    db.transactions = db.transactions.filter((entry) => !(entry.id === id && entry.userId === user.id));
    if (db.transactions.length === before) return sendError(res, 404, "Transação não encontrada.");
    saveDb();
    return sendJson(res, 200, { ok: true });
  }

  if (route === "/api/subscriptions" && method === "POST") {
    const body = await readBody(req);
    const name = normalizeText(body.name, 80);
    const amountCents = parseMoney(body.amountCents);
    const billingDay = Number(body.billingDay);
    const category = normalizeText(body.category, 40) || "assinaturas";

    if (name.length < 2) return sendError(res, 422, "Dê um nome para a assinatura.", "name");
    if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 100_000_000_00) {
      return sendError(res, 422, "Informe um valor mensal válido.", "amountCents");
    }
    if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) {
      return sendError(res, 422, "O dia de cobrança deve ficar entre 1 e 31.", "billingDay");
    }
    if (!CATEGORY_MAP.has(category)) return sendError(res, 422, "Escolha uma categoria válida.", "category");

    const db = getDb();
    const subscription = {
      id: randomUUID(),
      userId: user.id,
      name,
      amountCents: Math.round(amountCents),
      billingDay,
      category,
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.subscriptions.push(subscription);
    const guard = expenseGuard(db, user, amountCents);
    saveDb();
    return sendJson(res, 201, { subscription, guard });
  }

  if (route.startsWith("/api/subscriptions/") && method === "PATCH") {
    const id = route.split("/").at(-1);
    const body = await readBody(req);
    const db = getDb();
    const subscription = db.subscriptions.find((entry) => entry.id === id && entry.userId === user.id);
    if (!subscription) return sendError(res, 404, "Assinatura não encontrada.");
    if (typeof body.active === "boolean") subscription.active = body.active;
    saveDb();
    return sendJson(res, 200, { subscription });
  }

  if (route.startsWith("/api/subscriptions/") && method === "DELETE") {
    const id = route.split("/").at(-1);
    const db = getDb();
    const before = db.subscriptions.length;
    db.subscriptions = db.subscriptions.filter((entry) => !(entry.id === id && entry.userId === user.id));
    if (db.subscriptions.length === before) return sendError(res, 404, "Assinatura não encontrada.");
    saveDb();
    return sendJson(res, 200, { ok: true });
  }

  if (route === "/api/export" && method === "GET") {
    const payload = JSON.stringify(exportUserData(user), null, 2);
    res.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="noodle-finance-dados.json"',
      "Content-Length": Buffer.byteLength(payload),
      "Cache-Control": "no-store",
    });
    return res.end(payload);
  }

  return sendError(res, 404, "Rota não encontrada.");
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendError(res, 400, "Endereço inválido.");
  }
  if (pathname === "/") pathname = "/index.html";
  const relative = path.normalize(pathname).replace(/^[/\\]+/, "");
  let filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    return sendError(res, 403, "Acesso negado.");
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (!path.extname(relative)) {
      filePath = path.join(PUBLIC_DIR, "index.html");
    } else {
      return sendError(res, 404, "Arquivo não encontrado.");
    }
  }
  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] ?? "application/octet-stream";
  const isAppShell =
    relative === "index.html" ||
    relative === "sw.js" ||
    relative === "manifest.webmanifest" ||
    extension === ".js" ||
    extension === ".css";
  res.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": contentType,
    "Cache-Control": isAppShell ? "no-cache" : "public, max-age=86400",
    "Content-Length": fs.statSync(filePath).size,
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendError(res, 405, "Método não permitido.");
    }
    if (req.method === "HEAD") {
      res.writeHead(200, securityHeaders());
      return res.end();
    }
    serveStatic(req, res, url);
  } catch (error) {
    console.error("[noodle] Erro na requisição:", error);
    if (!res.headersSent) {
      sendError(res, error.status ?? 500, error.status ? error.message : "Erro interno do servidor.");
    } else {
      res.end();
    }
  }
});

if (DEMO_ENABLED) {
  try {
    ensureDemoUser();
  } catch (error) {
    console.error("[noodle] Não foi possível preparar a conta demo:", error.message);
  }
}

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("  Noodle Finance");
  console.log(`  Aplicação disponível em http://${HOST}:${PORT}`);
  console.log("  Conta demo: demo@noodle.finance / demo1234");
  console.log("");
});

server.on("error", (error) => {
  console.error("[noodle] Não foi possível iniciar o servidor:", error.message);
  process.exitCode = 1;
});
