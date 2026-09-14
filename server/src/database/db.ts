import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Banco de dados fica na raiz do projeto (persistido no Railway com volume)
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../../marketflow.db');

const db = new Database(DB_PATH);

// Habilitar WAL mode para performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Inicialização das Tabelas ─────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'CLIENT')),
    client_id TEXT,
    name TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS client_configs (
    client_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bybit_api_key_enc TEXT,
    bybit_api_secret_enc TEXT,
    bybit_testnet INTEGER NOT NULL DEFAULT 1,
    risk_pct REAL NOT NULL DEFAULT 1.0,
    leverage INTEGER NOT NULL DEFAULT 10,
    max_daily_loss_usd REAL NOT NULL DEFAULT 50.0,
    max_daily_profit_usd REAL NOT NULL DEFAULT 150.0,
    max_open_positions INTEGER NOT NULL DEFAULT 2,
    fixed_lot_usd REAL NOT NULL DEFAULT 10.0,
    copy_ai_autonomy INTEGER NOT NULL DEFAULT 1,
    notification_phone TEXT,
    balance REAL NOT NULL DEFAULT 0.0,
    is_active INTEGER NOT NULL DEFAULT 1,
    api_connected INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS trade_history (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
    entry_price REAL NOT NULL,
    close_price REAL,
    qty REAL NOT NULL,
    notional_usd REAL NOT NULL,
    pnl_usd REAL,
    leverage INTEGER,
    status TEXT NOT NULL DEFAULT 'OPEN',
    signal_reason TEXT,
    bybit_order_id TEXT,
    entry_time INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    close_time INTEGER,
    FOREIGN KEY(client_id) REFERENCES client_configs(client_id)
  );

  CREATE TABLE IF NOT EXISTS balance_edits (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    admin_id TEXT NOT NULL,
    old_balance REAL NOT NULL,
    new_balance REAL NOT NULL,
    reason TEXT,
    action TEXT NOT NULL DEFAULT 'EDIT',
    timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    FOREIGN KEY(client_id) REFERENCES client_configs(client_id)
  );
`);

// ─── Seed: Criar Admin padrão se não existir ───────────────────────────────

const adminEmail = process.env.ADMIN_EMAIL || 'admin@marketflow.pro';
const adminPassword = process.env.ADMIN_PASSWORD || 'MarketFlow@2026!';

const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('ADMIN');
if (!existingAdmin) {
  const hash = bcrypt.hashSync(adminPassword, 12);
  const adminId = `admin-${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, name)
    VALUES (?, ?, ?, 'ADMIN', 'Administrador Master')
  `).run(adminId, adminEmail, hash);
  console.log(`✅ Admin padrão criado: ${adminEmail}`);
}

// ─── Tipos e Interfaces ────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: 'ADMIN' | 'CLIENT';
  client_id: string | null;
  name: string | null;
  created_at: number;
  is_active: number;
}

export interface ClientConfigRow {
  client_id: string;
  user_id: string;
  bybit_api_key_enc: string | null;
  bybit_api_secret_enc: string | null;
  bybit_testnet: number;
  risk_pct: number;
  leverage: number;
  max_daily_loss_usd: number;
  max_daily_profit_usd: number;
  max_open_positions: number;
  fixed_lot_usd: number;
  copy_ai_autonomy: number;
  notification_phone: string | null;
  balance: number;
  is_active: number;
  api_connected: number;
  created_at: number;
}

export interface TradeHistoryRow {
  id: string;
  client_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entry_price: number;
  close_price: number | null;
  qty: number;
  notional_usd: number;
  pnl_usd: number | null;
  leverage: number | null;
  status: string;
  signal_reason: string | null;
  bybit_order_id: string | null;
  entry_time: number;
  close_time: number | null;
}

export interface BalanceEditRow {
  id: string;
  client_id: string;
  admin_id: string;
  old_balance: number;
  new_balance: number;
  reason: string | null;
  action: string;
  timestamp: number;
}

// ─── Funções de Acesso ────────────────────────────────────────────────────

export const UserDB = {
  findByEmail: (email: string): UserRow | undefined =>
    db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email) as UserRow | undefined,

  findById: (id: string): UserRow | undefined =>
    db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined,

  create: (data: { id: string; email: string; passwordHash: string; role: 'ADMIN' | 'CLIENT'; clientId?: string; name?: string }): void => {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, client_id, name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.id, data.email, data.passwordHash, data.role, data.clientId || null, data.name || null);
  },

  listClients: (): UserRow[] =>
    db.prepare("SELECT * FROM users WHERE role = 'CLIENT' ORDER BY created_at DESC").all() as UserRow[],

  deactivate: (id: string): void => {
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
  }
};

export const ClientConfigDB = {
  findByClientId: (clientId: string): ClientConfigRow | undefined =>
    db.prepare('SELECT * FROM client_configs WHERE client_id = ?').get(clientId) as ClientConfigRow | undefined,

  findByUserId: (userId: string): ClientConfigRow | undefined =>
    db.prepare('SELECT * FROM client_configs WHERE user_id = ?').get(userId) as ClientConfigRow | undefined,

  create: (data: { clientId: string; userId: string; name?: string }): void => {
    db.prepare(`
      INSERT INTO client_configs (client_id, user_id)
      VALUES (?, ?)
    `).run(data.clientId, data.userId);
  },

  updateApiKeys: (clientId: string, encryptedApiKey: string, encryptedApiSecret: string, testnet: boolean): void => {
    db.prepare(`
      UPDATE client_configs
      SET bybit_api_key_enc = ?, bybit_api_secret_enc = ?, bybit_testnet = ?, api_connected = 0, updated_at = unixepoch() * 1000
      WHERE client_id = ?
    `).run(encryptedApiKey, encryptedApiSecret, testnet ? 1 : 0, clientId);
  },

  setApiConnected: (clientId: string, connected: boolean): void => {
    db.prepare('UPDATE client_configs SET api_connected = ?, updated_at = unixepoch() * 1000 WHERE client_id = ?')
      .run(connected ? 1 : 0, clientId);
  },

  updateBalance: (clientId: string, balance: number): void => {
    db.prepare('UPDATE client_configs SET balance = ?, updated_at = unixepoch() * 1000 WHERE client_id = ?')
      .run(balance, clientId);
  },

  updateRiskConfig: (clientId: string, config: { riskPct?: number; leverage?: number; maxDailyLossUsd?: number; maxDailyProfitUsd?: number; fixedLotUsd?: number }): void => {
    const fields: string[] = [];
    const values: any[] = [];
    if (config.riskPct !== undefined) { fields.push('risk_pct = ?'); values.push(config.riskPct); }
    if (config.leverage !== undefined) { fields.push('leverage = ?'); values.push(config.leverage); }
    if (config.maxDailyLossUsd !== undefined) { fields.push('max_daily_loss_usd = ?'); values.push(config.maxDailyLossUsd); }
    if (config.maxDailyProfitUsd !== undefined) { fields.push('max_daily_profit_usd = ?'); values.push(config.maxDailyProfitUsd); }
    if (config.fixedLotUsd !== undefined) { fields.push('fixed_lot_usd = ?'); values.push(config.fixedLotUsd); }
    if (fields.length === 0) return;
    values.push(clientId);
    db.prepare(`UPDATE client_configs SET ${fields.join(', ')}, updated_at = unixepoch() * 1000 WHERE client_id = ?`).run(...values);
  },

  setActive: (clientId: string, active: boolean): void => {
    db.prepare('UPDATE client_configs SET is_active = ?, updated_at = unixepoch() * 1000 WHERE client_id = ?')
      .run(active ? 1 : 0, clientId);
  },

  listAll: (): ClientConfigRow[] =>
    db.prepare('SELECT * FROM client_configs ORDER BY created_at DESC').all() as ClientConfigRow[]
};

export const TradeHistoryDB = {
  insert: (trade: Omit<TradeHistoryRow, 'close_price' | 'pnl_usd' | 'close_time' | 'bybit_order_id'> & { bybitOrderId?: string }): void => {
    db.prepare(`
      INSERT INTO trade_history (id, client_id, symbol, side, entry_price, qty, notional_usd, leverage, status, signal_reason, bybit_order_id, entry_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(trade.id, trade.client_id, trade.symbol, trade.side, trade.entry_price, trade.qty, trade.notional_usd, trade.leverage || null, trade.status, trade.signal_reason || null, trade.bybitOrderId || null, trade.entry_time);
  },

  close: (id: string, closePrice: number, pnlUsd: number): void => {
    db.prepare(`
      UPDATE trade_history SET close_price = ?, pnl_usd = ?, status = 'CLOSED', close_time = unixepoch() * 1000 WHERE id = ?
    `).run(closePrice, pnlUsd, id);
  },

  findByClientId: (clientId: string, limit = 100): TradeHistoryRow[] =>
    db.prepare('SELECT * FROM trade_history WHERE client_id = ? ORDER BY entry_time DESC LIMIT ?').all(clientId, limit) as TradeHistoryRow[],

  findAll: (filters: { clientId?: string; from?: number; to?: number; limit?: number } = {}): TradeHistoryRow[] => {
    const conditions: string[] = [];
    const values: any[] = [];
    if (filters.clientId) { conditions.push('client_id = ?'); values.push(filters.clientId); }
    if (filters.from) { conditions.push('entry_time >= ?'); values.push(filters.from); }
    if (filters.to) { conditions.push('entry_time <= ?'); values.push(filters.to); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 500;
    return db.prepare(`SELECT * FROM trade_history ${where} ORDER BY entry_time DESC LIMIT ?`).all(...values, limit) as TradeHistoryRow[];
  }
};

export const BalanceEditDB = {
  insert: (edit: Omit<BalanceEditRow, 'timestamp'>): void => {
    db.prepare(`
      INSERT INTO balance_edits (id, client_id, admin_id, old_balance, new_balance, reason, action)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(edit.id, edit.client_id, edit.admin_id, edit.old_balance, edit.new_balance, edit.reason || null, edit.action);
  },

  findByClientId: (clientId: string): BalanceEditRow[] =>
    db.prepare('SELECT * FROM balance_edits WHERE client_id = ? ORDER BY timestamp DESC').all(clientId) as BalanceEditRow[],

  findAll: (): BalanceEditRow[] =>
    db.prepare('SELECT * FROM balance_edits ORDER BY timestamp DESC LIMIT 200').all() as BalanceEditRow[]
};

export default db;
