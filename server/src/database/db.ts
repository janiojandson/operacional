import pkg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// ─── Pool de Conexão PostgreSQL ───────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' && process.env.DATABASE_URL?.includes('railway.internal')
    ? false  // Conexão interna Railway não precisa de SSL
    : process.env.DATABASE_URL?.includes('railway.internal')
    ? false
    : { rejectUnauthorized: false } // Conexão externa (public URL) usa SSL
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool de conexão PostgreSQL:', err.message);
});

// Helper para executar queries
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

// ─── Inicialização das Tabelas ─────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  console.log('[DB] Conectando ao PostgreSQL Railway...');

  await query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'CLIENT')),
      client_id TEXT,
      name TEXT,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS client_configs (
      client_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bybit_api_key_enc TEXT,
      bybit_api_secret_enc TEXT,
      bybit_testnet INTEGER NOT NULL DEFAULT 1,
      risk_pct NUMERIC NOT NULL DEFAULT 1.0,
      leverage INTEGER NOT NULL DEFAULT 10,
      max_daily_loss_usd NUMERIC NOT NULL DEFAULT 50.0,
      max_daily_profit_usd NUMERIC NOT NULL DEFAULT 150.0,
      max_open_positions INTEGER NOT NULL DEFAULT 2,
      fixed_lot_usd NUMERIC NOT NULL DEFAULT 10.0,
      copy_ai_autonomy INTEGER NOT NULL DEFAULT 1,
      notification_phone TEXT,
      balance NUMERIC NOT NULL DEFAULT 0.0,
      is_active INTEGER NOT NULL DEFAULT 1,
      api_connected INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
      FOREIGN KEY(user_id) REFERENCES app_users(id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS trade_history (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
      entry_price NUMERIC NOT NULL,
      close_price NUMERIC,
      qty NUMERIC NOT NULL,
      notional_usd NUMERIC NOT NULL,
      pnl_usd NUMERIC,
      leverage INTEGER,
      status TEXT NOT NULL DEFAULT 'OPEN',
      signal_reason TEXT,
      bybit_order_id TEXT,
      entry_time BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
      close_time BIGINT,
      FOREIGN KEY(client_id) REFERENCES client_configs(client_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS balance_edits (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      admin_id TEXT NOT NULL,
      old_balance NUMERIC NOT NULL,
      new_balance NUMERIC NOT NULL,
      reason TEXT,
      action TEXT NOT NULL DEFAULT 'EDIT',
      timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
      FOREIGN KEY(client_id) REFERENCES client_configs(client_id)
    )
  `);

  // Índices para performance
  await query(`CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_trade_history_client ON trade_history(client_id, entry_time DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_balance_edits_client ON balance_edits(client_id, timestamp DESC)`);

  console.log('[DB] ✅ Tabelas PostgreSQL inicializadas com sucesso.');

  // Seed: criar admin padrão se não existir
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@marketflow.pro';
  const adminPassword = process.env.ADMIN_PASSWORD || 'MarketFlow@2026!';

  const existingAdmin = await queryOne('SELECT id FROM app_users WHERE role = $1 LIMIT 1', ['ADMIN']);
  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPassword, 12);
    const adminId = `admin-${Date.now()}`;
    await query(
      `INSERT INTO app_users (id, email, password_hash, role, name) VALUES ($1, $2, $3, 'ADMIN', 'Administrador Master')`,
      [adminId, adminEmail, hash]
    );
    console.log(`[DB] ✅ Admin padrão criado: ${adminEmail}`);
  }
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

// ─── Funções de Acesso — UserDB ────────────────────────────────────────────

export const UserDB = {
  findByEmail: (email: string) =>
    queryOne<UserRow>('SELECT * FROM app_users WHERE email = $1 AND is_active = 1', [email]),

  findById: (id: string) =>
    queryOne<UserRow>('SELECT * FROM app_users WHERE id = $1', [id]),

  create: async (data: { id: string; email: string; passwordHash: string; role: 'ADMIN' | 'CLIENT'; clientId?: string; name?: string }) => {
    await query(
      `INSERT INTO app_users (id, email, password_hash, role, client_id, name) VALUES ($1, $2, $3, $4, $5, $6)`,
      [data.id, data.email, data.passwordHash, data.role, data.clientId || null, data.name || null]
    );
  },

  listClients: () =>
    query<UserRow>("SELECT * FROM app_users WHERE role = 'CLIENT' ORDER BY created_at DESC"),

  deactivate: (id: string) =>
    query('UPDATE app_users SET is_active = 0, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $1', [id])
};

// ─── Funções de Acesso — ClientConfigDB ───────────────────────────────────

export const ClientConfigDB = {
  findByClientId: (clientId: string) =>
    queryOne<ClientConfigRow>('SELECT * FROM client_configs WHERE client_id = $1', [clientId]),

  findByUserId: (userId: string) =>
    queryOne<ClientConfigRow>('SELECT * FROM client_configs WHERE user_id = $1', [userId]),

  create: async (data: { clientId: string; userId: string; name?: string }) => {
    await query(
      `INSERT INTO client_configs (client_id, user_id) VALUES ($1, $2) ON CONFLICT (client_id) DO NOTHING`,
      [data.clientId, data.userId]
    );
  },

  updateApiKeys: async (clientId: string, encryptedApiKey: string, encryptedApiSecret: string, testnet: boolean) => {
    await query(
      `UPDATE client_configs SET bybit_api_key_enc = $1, bybit_api_secret_enc = $2, bybit_testnet = $3, api_connected = 0, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE client_id = $4`,
      [encryptedApiKey, encryptedApiSecret, testnet ? 1 : 0, clientId]
    );
  },

  setApiConnected: async (clientId: string, connected: boolean) => {
    await query(
      'UPDATE client_configs SET api_connected = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE client_id = $2',
      [connected ? 1 : 0, clientId]
    );
  },

  updateBalance: async (clientId: string, balance: number) => {
    await query(
      'UPDATE client_configs SET balance = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE client_id = $2',
      [balance, clientId]
    );
  },

  updateRiskConfig: async (clientId: string, config: { riskPct?: number; leverage?: number; maxDailyLossUsd?: number; maxDailyProfitUsd?: number; fixedLotUsd?: number }) => {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (config.riskPct !== undefined) { fields.push(`risk_pct = $${i++}`); values.push(config.riskPct); }
    if (config.leverage !== undefined) { fields.push(`leverage = $${i++}`); values.push(config.leverage); }
    if (config.maxDailyLossUsd !== undefined) { fields.push(`max_daily_loss_usd = $${i++}`); values.push(config.maxDailyLossUsd); }
    if (config.maxDailyProfitUsd !== undefined) { fields.push(`max_daily_profit_usd = $${i++}`); values.push(config.maxDailyProfitUsd); }
    if (config.fixedLotUsd !== undefined) { fields.push(`fixed_lot_usd = $${i++}`); values.push(config.fixedLotUsd); }
    if (fields.length === 0) return;
    values.push(clientId);
    await query(`UPDATE client_configs SET ${fields.join(', ')}, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE client_id = $${i}`, values);
  },

  setActive: async (clientId: string, active: boolean) => {
    await query(
      'UPDATE client_configs SET is_active = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE client_id = $2',
      [active ? 1 : 0, clientId]
    );
  },

  listAll: () =>
    query<ClientConfigRow>('SELECT * FROM client_configs ORDER BY created_at DESC')
};

// ─── Funções de Acesso — TradeHistoryDB ───────────────────────────────────

export const TradeHistoryDB = {
  insert: async (trade: Omit<TradeHistoryRow, 'close_price' | 'pnl_usd' | 'close_time'> & { bybitOrderId?: string }) => {
    await query(
      `INSERT INTO trade_history (id, client_id, symbol, side, entry_price, qty, notional_usd, leverage, status, signal_reason, bybit_order_id, entry_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [trade.id, trade.client_id, trade.symbol, trade.side, trade.entry_price, trade.qty, trade.notional_usd, trade.leverage || null, trade.status, trade.signal_reason || null, trade.bybitOrderId || null, trade.entry_time]
    );
  },

  close: async (id: string, closePrice: number, pnlUsd: number) => {
    await query(
      `UPDATE trade_history SET close_price = $1, pnl_usd = $2, status = 'CLOSED', close_time = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $3`,
      [closePrice, pnlUsd, id]
    );
  },

  findByClientId: (clientId: string, limit = 100) =>
    query<TradeHistoryRow>('SELECT * FROM trade_history WHERE client_id = $1 ORDER BY entry_time DESC LIMIT $2', [clientId, limit]),

  findAll: async (filters: { clientId?: string; from?: number; to?: number; limit?: number } = {}) => {
    const conditions: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (filters.clientId) { conditions.push(`client_id = $${i++}`); values.push(filters.clientId); }
    if (filters.from) { conditions.push(`entry_time >= $${i++}`); values.push(filters.from); }
    if (filters.to) { conditions.push(`entry_time <= $${i++}`); values.push(filters.to); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 500;
    values.push(limit);
    return query<TradeHistoryRow>(`SELECT * FROM trade_history ${where} ORDER BY entry_time DESC LIMIT $${i}`, values);
  }
};

// ─── Funções de Acesso — BalanceEditDB ────────────────────────────────────

export const BalanceEditDB = {
  insert: async (edit: Omit<BalanceEditRow, 'timestamp'>) => {
    await query(
      `INSERT INTO balance_edits (id, client_id, admin_id, old_balance, new_balance, reason, action) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [edit.id, edit.client_id, edit.admin_id, edit.old_balance, edit.new_balance, edit.reason || null, edit.action]
    );
  },

  findByClientId: (clientId: string) =>
    query<BalanceEditRow>('SELECT * FROM balance_edits WHERE client_id = $1 ORDER BY timestamp DESC', [clientId]),

  findAll: () =>
    query<BalanceEditRow>('SELECT * FROM balance_edits ORDER BY timestamp DESC LIMIT 200')
};

export default pool;
