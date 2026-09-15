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
      whatsapp TEXT,
      whatsapp_validado INTEGER NOT NULL DEFAULT 0,
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
      sync_enabled INTEGER NOT NULL DEFAULT 0,
      plan_type TEXT NOT NULL DEFAULT 'INACTIVE',
      plan_active INTEGER NOT NULL DEFAULT 1,
      plan_expires_at BIGINT,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
      FOREIGN KEY(user_id) REFERENCES app_users(id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_otps (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
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
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'INFO' CHECK(type IN ('INFO', 'WARNING', 'PLAN_UPGRADE', 'URGENT')),
      action_url TEXT,
      action_label TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
    )
  `);

  // Migrações seguras (adicionar colunas se tabela já existia)
  await query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS whatsapp TEXT`).catch(() => {});
  await query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS whatsapp_validado INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS sync_enabled INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS plan_active INTEGER NOT NULL DEFAULT 1`).catch(() => {});
  await query(`ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'ACTIVE'`).catch(() => {});
  await query(`ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS plan_expires_at BIGINT`).catch(() => {});

  // Índices para performance
  await query(`CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_app_users_whatsapp ON app_users(whatsapp)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_password_reset_otps ON password_reset_otps(email, otp_code, expires_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_trade_history_client ON trade_history(client_id, entry_time DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, created_at DESC)`);

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

  // Seed anúncio de boas-vindas se não houver
  const existingAnnouncements = await queryOne('SELECT id FROM announcements LIMIT 1');
  if (!existingAnnouncements) {
    await query(
      `INSERT INTO announcements (id, title, message, type, is_active) VALUES ($1, $2, $3, $4, 1)`,
      ['ann-welcome', '🚀 Bem-vindo ao MarketFlow Pro!', 'Conecte sua API da Bybit e configure seu perfil de risco na aba "Gerenciar Risco" para começar a operar.', 'INFO']
    );
  }
  if (!existingAnnouncements) {
    await query(
      `INSERT INTO announcements (id, title, message, type, is_active) VALUES ($1, $2, $3, $4, 1)`,
      ['ann-welcome', '🚀 Bem-vindo ao MarketFlow Pro!', 'Conecte sua API da Bybit e configure seu perfil de risco na aba "Gerenciar Risco" para começar a operar.', 'INFO']
    );
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
  whatsapp: string | null;
  whatsapp_validado: number;
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
  sync_enabled: number;
  plan_type: string;
  plan_active: number;
  plan_expires_at: number | null;
  created_at: number;
}

export interface OtpRow {
  id: string;
  email: string;
  phone: string;
  otp_code: string;
  expires_at: number;
  used: number;
  created_at: number;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'PLAN_UPGRADE' | 'URGENT';
  action_url: string | null;
  action_label: string | null;
  is_active: number;
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

// ─── Funções de Acesso — UserDB ────────────────────────────────────────────

export const UserDB = {
  findByEmail: (email: string) =>
    queryOne<UserRow>('SELECT * FROM app_users WHERE email = $1 AND is_active = 1', [email]),

  findById: (id: string) =>
    queryOne<UserRow>('SELECT * FROM app_users WHERE id = $1', [id]),

  findByWhatsApp: (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    return queryOne<UserRow>(`SELECT * FROM app_users WHERE REPLACE(REPLACE(REPLACE(REPLACE(whatsapp, '+', ''), ' ', ''), '-', ''), '(', '') LIKE $1`, [`%${clean.slice(-8)}%`]);
  },

  create: async (data: { id: string; email: string; passwordHash: string; role: 'ADMIN' | 'CLIENT'; clientId?: string; name?: string; whatsapp?: string }) => {
    await query(
      `INSERT INTO app_users (id, email, password_hash, role, client_id, name, whatsapp, whatsapp_validado) VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
      [data.id, data.email, data.passwordHash, data.role, data.clientId || null, data.name || null, data.whatsapp || null]
    );
  },

  validateWhatsApp: async (userId: string) => {
    await query('UPDATE app_users SET whatsapp_validado = 1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $1', [userId]);
  },

  updatePassword: async (userId: string, passwordHash: string) => {
    await query('UPDATE app_users SET password_hash = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $2', [passwordHash, userId]);
  },

  findByClientId: (clientId: string) =>
    queryOne<UserRow>('SELECT * FROM app_users WHERE client_id = $1', [clientId]),

  setPlanActive: async (userId: string, active: boolean) => {
    await query('UPDATE app_users SET is_active = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $2', [active ? 1 : 0, userId]);
  },

  deleteClient: async (userId: string, clientId?: string | null) => {
    if (clientId) {
      await query('DELETE FROM trade_history WHERE client_id = $1', [clientId]);
      await query('DELETE FROM client_configs WHERE client_id = $1', [clientId]);
    }
    await query('DELETE FROM client_configs WHERE user_id = $1', [userId]);
    const user = await queryOne<UserRow>('SELECT email, whatsapp FROM app_users WHERE id = $1', [userId]);
    if (user) {
      if (user.email) await query('DELETE FROM password_reset_otps WHERE email = $1', [user.email]);
    }
    await query('DELETE FROM app_users WHERE id = $1', [userId]);
  },

  listClients: () =>
    query<UserRow>("SELECT * FROM app_users WHERE role = 'CLIENT' ORDER BY created_at DESC"),

  deactivate: (id: string) =>
    query('UPDATE app_users SET is_active = 0, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $1', [id])
};

// ─── Funções de Acesso — OtpDB ────────────────────────────────────────────

export const OtpDB = {
  create: async (data: { id: string; email: string; phone: string; otpCode: string; expiresAt: number }) => {
    await query(
      `INSERT INTO password_reset_otps (id, email, phone, otp_code, expires_at, used) VALUES ($1, $2, $3, $4, $5, 0)`,
      [data.id, data.email, data.phone, data.otpCode, data.expiresAt]
    );
  },

  findValid: (email: string, otpCode: string) =>
    queryOne<OtpRow>(
      `SELECT * FROM password_reset_otps WHERE email = $1 AND otp_code = $2 AND used = 0 AND expires_at > EXTRACT(EPOCH FROM NOW()) * 1000 ORDER BY created_at DESC LIMIT 1`,
      [email, otpCode]
    ),

  markUsed: (id: string) =>
    query(`UPDATE password_reset_otps SET used = 1 WHERE id = $1`, [id])
};

// ─── Funções de Acesso — ClientConfigDB ───────────────────────────────────

export const ClientConfigDB = {
  findByClientId: (clientId: string) =>
    queryOne<ClientConfigRow>('SELECT * FROM client_configs WHERE client_id = $1', [clientId]),

  findByUserId: (userId: string) =>
    queryOne<ClientConfigRow>('SELECT * FROM client_configs WHERE user_id = $1', [userId]),

  create: async (data: { clientId: string; userId: string; name?: string; phone?: string; planType?: string; planActive?: boolean; planExpiresAt?: number | null }) => {
    await query(
      `INSERT INTO client_configs (client_id, user_id, notification_phone, sync_enabled, plan_type, plan_active, plan_expires_at) 
       VALUES ($1, $2, $3, 0, $4, $5, $6) 
       ON CONFLICT (client_id) DO UPDATE SET 
         plan_type = EXCLUDED.plan_type, 
         plan_active = EXCLUDED.plan_active, 
         plan_expires_at = EXCLUDED.plan_expires_at, 
         updated_at = EXTRACT(EPOCH FROM NOW()) * 1000`,
      [data.clientId, data.userId, data.phone || null, data.planType || 'ACTIVE', data.planActive !== false ? 1 : 0, data.planExpiresAt || null]
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

  setSyncEnabled: async (clientId: string, syncEnabled: boolean) => {
    await query(
      'UPDATE client_configs SET sync_enabled = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE client_id = $2',
      [syncEnabled ? 1 : 0, clientId]
    );
  },

  updateBalance: async (clientId: string, balance: number) => {
    await query(
      'UPDATE client_configs SET balance = $1, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE client_id = $2',
      [balance, clientId]
    );
  },

  updatePlan: async (clientId: string, planType: string, planActive: boolean, planExpiresAt: number | null) => {
    const expiresVal = planExpiresAt !== null && planExpiresAt !== undefined && !isNaN(Number(planExpiresAt)) 
      ? Math.round(Number(planExpiresAt)) 
      : null;
    await query(
      'UPDATE client_configs SET plan_type = $1, plan_active = $2, plan_expires_at = $3, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE client_id = $4',
      [planType, planActive ? 1 : 0, expiresVal, clientId]
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

// ─── Funções de Acesso — AnnouncementDB ───────────────────────────────────

export const AnnouncementDB = {
  listActive: () =>
    query<AnnouncementRow>('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC'),

  listAll: () =>
    query<AnnouncementRow>('SELECT * FROM announcements ORDER BY created_at DESC'),

  create: async (data: { id: string; title: string; message: string; type?: string; actionUrl?: string; actionLabel?: string }) => {
    await query(
      `INSERT INTO announcements (id, title, message, type, action_url, action_label, is_active) VALUES ($1, $2, $3, $4, $5, $6, 1)`,
      [data.id, data.title, data.message, data.type || 'INFO', data.actionUrl || null, data.actionLabel || null]
    );
  },

  delete: (id: string) =>
    query('DELETE FROM announcements WHERE id = $1', [id]),

  toggleActive: (id: string, active: boolean) =>
    query('UPDATE announcements SET is_active = $1 WHERE id = $2', [active ? 1 : 0, id])
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

export default pool;


