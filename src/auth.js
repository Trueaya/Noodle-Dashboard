import { randomUUID } from "node:crypto";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
} from "./constants.js";
import {
  createSessionToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./security.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function createUser(db, { name, email, password, salaryCents = 0, savingsGoalPercent = 20 }) {
  const now = new Date().toISOString();
  const user = {
    id: randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    salaryCents: Math.max(0, Math.round(Number(salaryCents) || 0)),
    savingsGoalPercent: Math.min(90, Math.max(0, Number(savingsGoalPercent) || 20)),
    createdAt: now,
  };
  db.users.push(user);
  return user;
}

export function findUserByEmail(db, email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  return db.users.find((user) => user.email === normalized) ?? null;
}

export function authenticate(db, email, password) {
  const user = findUserByEmail(db, email);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export function cleanExpiredSessions(db) {
  const now = Date.now();
  db.sessions = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
}

export function issueSession(db, userId) {
  cleanExpiredSessions(db);
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS).toISOString();
  db.sessions.push({
    tokenHash: hashToken(token),
    userId,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  return token;
}

export function resolveSession(db, token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = db.sessions.find((entry) => entry.tokenHash === tokenHash);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return db.users.find((user) => user.id === session.userId) ?? null;
}

export function destroySession(db, token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  db.sessions = db.sessions.filter((entry) => entry.tokenHash !== tokenHash);
}

export function sessionCookie(token, secure = false) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }
  return cookies;
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    salaryCents: user.salaryCents,
    savingsGoalPercent: user.savingsGoalPercent,
    createdAt: user.createdAt,
  };
}
