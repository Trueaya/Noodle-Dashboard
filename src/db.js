import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createUser, findUserByEmail } from "./auth.js";
import { currentMonth, toISODate } from "./dates.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.NOODLE_DATA_DIR
  ? path.resolve(process.env.NOODLE_DATA_DIR)
  : path.join(ROOT, ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const emptyDb = () => ({
  version: 1,
  users: [],
  sessions: [],
  transactions: [],
  subscriptions: [],
});

function normalizeDb(value) {
  const db = value && typeof value === "object" ? value : emptyDb();
  db.users = Array.isArray(db.users) ? db.users : [];
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.transactions = Array.isArray(db.transactions) ? db.transactions : [];
  db.subscriptions = Array.isArray(db.subscriptions) ? db.subscriptions : [];
  return db;
}

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) return emptyDb();
  try {
    return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
  } catch (error) {
    console.error("[noodle] Não foi possível ler o banco de dados:", error.message);
    return emptyDb();
  }
}

let db = loadDb();

export function getDb() {
  return db;
}

export function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${DB_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(temporary, DB_FILE);
}

export function resetDatabase(next = emptyDb()) {
  db = normalizeDb(next);
  saveDb();
}

export function findUserById(id) {
  return db.users.find((user) => user.id === id) ?? null;
}

function addTransaction(entry) {
  const transaction = {
    id: randomUUID(),
    userId: entry.userId,
    type: entry.type ?? "expense",
    description: entry.description.trim(),
    amountCents: Math.round(Number(entry.amountCents) || 0),
    category: entry.category,
    date: entry.date,
    createdAt: `${entry.date}T12:00:00.000Z`,
  };
  db.transactions.push(transaction);
  return transaction;
}

function addSubscription(entry) {
  const subscription = {
    id: randomUUID(),
    userId: entry.userId,
    name: entry.name.trim(),
    amountCents: Math.round(Number(entry.amountCents) || 0),
    billingDay: Math.min(31, Math.max(1, Number(entry.billingDay) || 1)),
    category: entry.category ?? "assinaturas",
    active: entry.active !== false,
    createdAt: new Date().toISOString(),
  };
  db.subscriptions.push(subscription);
  return subscription;
}

function demoDate(offset, day, today) {
  const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
  let targetDay = day;
  if (offset === 0) {
    const elapsed = today.getDate();
    targetDay = Math.max(1, Math.min(elapsed, Math.round((day * elapsed) / 28)));
  }
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  targetDay = Math.min(targetDay, lastDay);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

const PROFILES = {
  0: {
    energy: 18740,
    markets: [
      ["Mercado do bairro", 51230, 3],
      ["Compra da semana", 31875, 7],
      ["Feira e hortifruti", 26420, 12],
    ],
    transport: [
      ["Combustível", 11000, 4],
      ["Uber e ônibus", 9560, 9],
      ["Estacionamento", 14000, 12],
    ],
    restaurants: [
      ["Almoço no trabalho", 8640, 6],
      ["Jantar com amigos", 13280, 11],
      ["Delivery", 9450, 13],
    ],
    leisure: [
      ["Cinema e pipoca", 17800, 9],
      ["Ingressos de show", 24000, 11],
    ],
    health: [["Farmácia", 8990, 12]],
    shopping: [["Tênis de corrida", 43990, 7]],
    courses: [],
    extras: [],
    income: [],
  },
  1: {
    energy: 16230,
    markets: [
      ["Supermercado", 54020, 4],
      ["Mercado do bairro", 36210, 9],
      ["Feira da semana", 29840, 14],
    ],
    transport: [
      ["Combustível", 12000, 5],
      ["Aplicativos de transporte", 8900, 16],
      ["Revisão do carro", 16500, 22],
    ],
    restaurants: [
      ["Almoço no trabalho", 9450, 8],
      ["Jantar de aniversário", 18900, 21],
    ],
    leisure: [["Streaming e cinema", 15600, 11]],
    health: [["Farmácia", 7800, 17]],
    shopping: [["Curso de inglês", 24900, 6]],
    courses: [],
    extras: [],
    income: [["Freelance de design", 60000, "freelance", 22]],
  },
  2: {
    energy: 19890,
    markets: [
      ["Supermercado", 47860, 4],
      ["Compra da semana", 33540, 10],
      ["Feira e hortifruti", 24110, 18],
    ],
    transport: [
      ["Combustível", 11500, 3],
      ["Passagem aérea", 89000, 15],
      ["Uber e ônibus", 9200, 20],
    ],
    restaurants: [
      ["Almoço no trabalho", 8900, 7],
      ["Jantar fora", 14200, 19],
    ],
    leisure: [
      ["Viagem para o litoral", 145000, 18],
      ["Cinema", 9800, 25],
    ],
    health: [["Farmácia", 9200, 12]],
    shopping: [],
    courses: [],
    extras: [],
    income: [["Projeto freelance", 85000, "freelance", 16]],
  },
  3: {
    energy: 17640,
    markets: [
      ["Supermercado", 51590, 5],
      ["Mercado do bairro", 34870, 11],
      ["Feira da semana", 27930, 19],
    ],
    transport: [["Combustível", 11800, 6], ["Aplicativos", 8700, 14]],
    restaurants: [["Almoço no trabalho", 8760, 8], ["Jantar com amigos", 15800, 21]],
    leisure: [["Cinema e jantar", 18900, 12]],
    health: [["Consulta dentista", 38000, 24]],
    shopping: [],
    courses: [],
    extras: [],
    income: [],
  },
  4: {
    energy: 20120,
    markets: [
      ["Supermercado", 48920, 3],
      ["Compra da semana", 31260, 10],
      ["Feira e hortifruti", 25640, 17],
    ],
    transport: [["Combustível", 10900, 4], ["Estacionamento", 7600, 15]],
    restaurants: [["Almoço no trabalho", 9200, 9], ["Jantar fora", 16400, 22]],
    leisure: [["Cinema", 8900, 13], ["Show", 24000, 26]],
    health: [["Farmácia", 8600, 18]],
    shopping: [["Móveis para o home office", 129000, 20]],
    courses: [],
    extras: [],
    income: [["Freelance de consultoria", 120000, "freelance", 17]],
  },
  5: {
    energy: 17980,
    markets: [
      ["Supermercado", 52780, 4],
      ["Mercado do bairro", 33910, 9],
      ["Feira da semana", 28450, 20],
    ],
    transport: [["Combustível", 12500, 5], ["Uber e ônibus", 8400, 16]],
    restaurants: [["Almoço no trabalho", 9450, 8], ["Jantar com amigos", 12800, 19]],
    leisure: [["Cinema e pipoca", 15600, 11]],
    health: [["Farmácia", 7800, 17]],
    shopping: [["Fone de ouvido", 32900, 21]],
    courses: [],
    extras: [],
    income: [],
  },
};

function seedDemoData(userId, today = new Date()) {
  db.transactions = db.transactions.filter((entry) => entry.userId !== userId);
  db.subscriptions = db.subscriptions.filter((entry) => entry.userId !== userId);

  const subscriptions = [
    ["Internet Fibra 600MB", 11990, 12, "contas"],
    ["Studio Pilates", 21990, 10, "saude"],
    ["Adobe Creative Cloud", 11990, 28, "assinaturas"],
    ["Netflix Premium", 5990, 15, "assinaturas"],
    ["Spotify Duo", 3490, 20, "assinaturas"],
    ["iCloud+ 200GB", 1290, 24, "assinaturas"],
  ];
  for (const [name, amountCents, billingDay, category] of subscriptions) {
    addSubscription({ userId, name, amountCents, billingDay, category });
  }

  for (let offset = 5; offset >= 0; offset -= 1) {
    const profile = PROFILES[offset];
    addTransaction({
      userId,
      description: "Aluguel",
      amountCents: 230000,
      category: "moradia",
      date: demoDate(offset, 5, today),
    });
    addTransaction({
      userId,
      description: "Condomínio",
      amountCents: 42000,
      category: "moradia",
      date: demoDate(offset, 10, today),
    });
    addTransaction({
      userId,
      description: "Conta de luz",
      amountCents: profile.energy,
      category: "contas",
      date: demoDate(offset, 8, today),
    });

    for (const [description, amountCents, day] of profile.markets) {
      addTransaction({
        userId,
        description,
        amountCents,
        category: "alimentacao",
        date: demoDate(offset, day, today),
      });
    }
    for (const [description, amountCents, day] of profile.transport) {
      addTransaction({
        userId,
        description,
        amountCents,
        category: "transporte",
        date: demoDate(offset, day, today),
      });
    }
    for (const [description, amountCents, day] of profile.restaurants) {
      addTransaction({
        userId,
        description,
        amountCents,
        category: "restaurantes",
        date: demoDate(offset, day, today),
      });
    }
    for (const [description, amountCents, day] of profile.leisure) {
      addTransaction({
        userId,
        description,
        amountCents,
        category: "lazer",
        date: demoDate(offset, day, today),
      });
    }
    for (const [description, amountCents, day] of profile.health) {
      addTransaction({
        userId,
        description,
        amountCents,
        category: "saude",
        date: demoDate(offset, day, today),
      });
    }
    for (const [description, amountCents, day] of profile.shopping) {
      addTransaction({
        userId,
        description,
        amountCents,
        category: "compras",
        date: demoDate(offset, day, today),
      });
    }
    for (const [description, amountCents, category, day] of profile.income) {
      addTransaction({
        userId,
        type: "income",
        description,
        amountCents,
        category,
        date: demoDate(offset, day, today),
      });
    }
  }
}

export function ensureDemoUser() {
  const demoEmail = "demo@noodle.finance";
  let user = findUserByEmail(db, demoEmail);
  if (!user) {
    user = createUser(db, {
      name: "Marina Alves",
      email: demoEmail,
      password: "demo1234",
      salaryCents: 720000,
      savingsGoalPercent: 20,
    });
  }
  user.name = "Marina Alves";
  user.salaryCents = 720000;
  user.savingsGoalPercent = 20;

  const demoTransactions = db.transactions.filter((entry) => entry.userId === user.id);
  const latestMonth = demoTransactions
    .map((entry) => entry.date.slice(0, 7))
    .sort()
    .at(-1);
  if (demoTransactions.length === 0 || latestMonth !== currentMonth()) {
    seedDemoData(user.id);
  }
  saveDb();
  return user;
}

export function exportUserData(user) {
  return {
    exportedAt: new Date().toISOString(),
    app: "Noodle Finance",
    profile: {
      name: user.name,
      email: user.email,
      salaryCents: user.salaryCents,
      savingsGoalPercent: user.savingsGoalPercent,
      createdAt: user.createdAt,
    },
    transactions: db.transactions.filter((entry) => entry.userId === user.id),
    subscriptions: db.subscriptions.filter((entry) => entry.userId === user.id),
  };
}

export function todayISO() {
  return toISODate(new Date());
}
