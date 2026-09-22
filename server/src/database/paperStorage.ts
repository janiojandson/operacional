import { query, queryOne } from './db.js';
import { PaperAccount, SimulatedTrade } from '../../../shared/paperTypes';

interface SimulatedTradeWithTrailing extends SimulatedTrade {
  trailingActive?: boolean;
  trailingTriggerPrice?: number;
  trailingStopPrice?: number;
}

export interface MasterAccountRow {
  id: string;
  balance: number;
  equity: number;
  realized_pnl: number;
  win_rate: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  updated_at: number;
}

export interface MasterOrderRow {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  entry_price: number;
  current_price: number;
  take_profit: number;
  stop_loss: number;
  pnl_usd: number;
  pnl_pct: number;
  r_multiple: number;
  power_multiplier: number;
  temperature: string;
  session: string;
  day_of_week: string;
  market_regime: string;
  status: string;
  entry_time: number;
  close_time: number | null;
  signal_reason: string;
  trailing_active: number;
  trailing_trigger_price: number | null;
  trailing_stop_price: number | null;
}

// ─── Mirror Account Types ────────────────────────────────────────────────────
export interface MirrorAccountRow {
  id: string;
  balance: number;
  equity: number;
  realized_pnl: number;
  win_rate: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  updated_at: number;
}

export interface MirrorOrderRow {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  entry_price: number;
  current_price: number;
  take_profit: number;
  stop_loss: number;
  qty: number;
  fee: number;
  net_pnl: number;
  pnl_usd: number;
  pnl_pct: number;
  r_multiple: number;
  power_multiplier: number;
  temperature: string;
  session: string;
  day_of_week: string;
  market_regime: string;
  status: string;
  entry_time: number;
  close_time: number | null;
  signal_reason: string;
  trailing_active: number;
  trailing_trigger_price: number | null;
  trailing_stop_price: number | null;
}

const MASTER_ACCOUNT_ID = 'master-paper-account';
const MIRROR_ACCOUNT_ID = 'mirror-paper-account';

const MIN_LOTS: Record<string, number> = {
  'BTC/USDT': 0.001,
  'BTCUSDT': 0.001,
  'ETH/USDT': 0.01,
  'ETHUSDT': 0.01,
  'SOL/USDT': 0.1,
  'SOLUSDT': 0.1,
  'XRP/USDT': 10.0,
  'XRPUSDT': 10.0,
  'BNB/USDT': 0.01,
  'BNBUSDT': 0.01,
};

const BYBIT_FEES = { maker: 0.0002, taker: 0.00055 };

export function getMinLot(symbol: string): number {
  const clean = symbol.replace(':USDT', '');
  return MIN_LOTS[clean] || 0.001;
}

export function validateOrderMarginAndLot(
  symbol: string,
  price: number,
  qty: number,
  balance: number,
  leverage = 10,
  isMaker = false
): { valid: boolean; reason?: string; marginRequired: number; fee: number } {
  const minQty = getMinLot(symbol);
  if (qty < minQty) {
    return { valid: false, reason: `Quantidade ${qty} abaixo do lote mínimo (${minQty})`, marginRequired: 0, fee: 0 };
  }

  const notional = price * qty;
  const marginRequired = notional / leverage;
  const feeRate = isMaker ? BYBIT_FEES.maker : BYBIT_FEES.taker;
  const fee = notional * feeRate;

  if (marginRequired + fee > balance) {
    return { 
      valid: false, 
      reason: `Saldo insuficiente ($${balance.toFixed(2)}) para margem ($${marginRequired.toFixed(2)}) + taxa ($${fee.toFixed(2)})`, 
      marginRequired, 
      fee 
    };
  }

  return { valid: true, marginRequired, fee };
}

export async function initPaperTables(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS paper_master_account (
      id TEXT PRIMARY KEY,
      balance NUMERIC NOT NULL DEFAULT 10000,
      equity NUMERIC NOT NULL DEFAULT 10000,
      realized_pnl NUMERIC NOT NULL DEFAULT 0,
      win_rate NUMERIC NOT NULL DEFAULT 0,
      total_trades INTEGER NOT NULL DEFAULT 0,
      winning_trades INTEGER NOT NULL DEFAULT 0,
      losing_trades INTEGER NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS paper_master_orders (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL')),
      entry_price NUMERIC NOT NULL,
      current_price NUMERIC NOT NULL,
      take_profit NUMERIC NOT NULL,
      stop_loss NUMERIC NOT NULL,
      pnl_usd NUMERIC NOT NULL DEFAULT 0,
      pnl_pct NUMERIC NOT NULL DEFAULT 0,
      r_multiple NUMERIC NOT NULL DEFAULT 0,
      power_multiplier NUMERIC NOT NULL DEFAULT 1.5,
      temperature TEXT NOT NULL DEFAULT 'HOT_MAX_EXTRACT',
      session TEXT NOT NULL DEFAULT 'NY',
      day_of_week TEXT NOT NULL DEFAULT 'Seg',
      market_regime TEXT NOT NULL DEFAULT 'TREND',
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED_TP', 'CLOSED_SL')),
      entry_time BIGINT NOT NULL,
      close_time BIGINT,
      signal_reason TEXT,
      trailing_active INTEGER NOT NULL DEFAULT 0,
      trailing_trigger_price NUMERIC,
      trailing_stop_price NUMERIC
    )
  `);

  // ─── Non-destructive migrations for existing Railway tables ────────────────
  await query(`ALTER TABLE paper_master_orders ADD COLUMN IF NOT EXISTS updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000`);
  await query(`ALTER TABLE paper_master_orders ADD COLUMN IF NOT EXISTS fee NUMERIC NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE paper_master_orders ADD COLUMN IF NOT EXISTS net_pnl NUMERIC NOT NULL DEFAULT 0`);

  // ─── Mirror Account Tables ────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS paper_mirror_account (
      id TEXT PRIMARY KEY,
      balance NUMERIC NOT NULL DEFAULT 500,
      equity NUMERIC NOT NULL DEFAULT 500,
      realized_pnl NUMERIC NOT NULL DEFAULT 0,
      win_rate NUMERIC NOT NULL DEFAULT 0,
      total_trades INTEGER NOT NULL DEFAULT 0,
      winning_trades INTEGER NOT NULL DEFAULT 0,
      losing_trades INTEGER NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS paper_mirror_orders (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('BUY', 'SELL')),
      entry_price NUMERIC NOT NULL,
      current_price NUMERIC NOT NULL,
      take_profit NUMERIC NOT NULL,
      stop_loss NUMERIC NOT NULL,
      qty NUMERIC NOT NULL,
      fee NUMERIC NOT NULL DEFAULT 0,
      net_pnl NUMERIC NOT NULL DEFAULT 0,
      pnl_usd NUMERIC NOT NULL DEFAULT 0,
      pnl_pct NUMERIC NOT NULL DEFAULT 0,
      r_multiple NUMERIC NOT NULL DEFAULT 0,
      power_multiplier NUMERIC NOT NULL DEFAULT 1.5,
      temperature TEXT NOT NULL DEFAULT 'HOT_MAX_EXTRACT',
      session TEXT NOT NULL DEFAULT 'NY',
      day_of_week TEXT NOT NULL DEFAULT 'Seg',
      market_regime TEXT NOT NULL DEFAULT 'TREND',
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED_TP', 'CLOSED_SL')),
      entry_time BIGINT NOT NULL,
      close_time BIGINT,
      signal_reason TEXT,
      trailing_active INTEGER NOT NULL DEFAULT 0,
      trailing_trigger_price NUMERIC,
      trailing_stop_price NUMERIC
    )
  `);

  await query(`ALTER TABLE paper_mirror_orders ADD COLUMN IF NOT EXISTS updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000`);
  await query(`ALTER TABLE paper_mirror_orders ADD COLUMN IF NOT EXISTS fee NUMERIC NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE paper_mirror_orders ADD COLUMN IF NOT EXISTS net_pnl NUMERIC NOT NULL DEFAULT 0`);

  await query(`CREATE INDEX IF NOT EXISTS idx_paper_master_orders_symbol ON paper_master_orders(symbol)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_paper_master_orders_status ON paper_master_orders(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_paper_master_orders_entry_time ON paper_master_orders(entry_time DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_paper_mirror_orders_symbol ON paper_mirror_orders(symbol)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_paper_mirror_orders_status ON paper_mirror_orders(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_paper_mirror_orders_entry_time ON paper_mirror_orders(entry_time DESC)`);

  const existingMaster = await queryOne<MasterAccountRow>('SELECT * FROM paper_master_account WHERE id = $1', [MASTER_ACCOUNT_ID]);
  if (!existingMaster) {
    await query(
      `INSERT INTO paper_master_account (id, balance, equity, realized_pnl, win_rate, total_trades, winning_trades, losing_trades) 
       VALUES ($1, 10000, 10000, 0, 0, 0, 0, 0)`,
      [MASTER_ACCOUNT_ID]
    );
    console.log('[PaperStorage] ✅ Conta master simulada inicializada no PostgreSQL');
  }

  const existingMirror = await queryOne<MirrorAccountRow>('SELECT * FROM paper_mirror_account WHERE id = $1', [MIRROR_ACCOUNT_ID]);
  if (!existingMirror) {
    await query(
      `INSERT INTO paper_mirror_account (id, balance, equity, realized_pnl, win_rate, total_trades, winning_trades, losing_trades) 
       VALUES ($1, 500, 500, 0, 0, 0, 0, 0)`,
      [MIRROR_ACCOUNT_ID]
    );
    console.log('[PaperStorage] ✅ Conta espelho (mirror) inicializada no PostgreSQL');
  }
}

// Reset parametrizado para ambas as contas
export async function resetTradingAccounts(masterBal = 10000, mirrorBal = 500): Promise<{ masterBalance: number; mirrorBalance: number }> {
  await query('DELETE FROM paper_master_orders');
  await query('DELETE FROM paper_mirror_orders');
  
  await query(
    `INSERT INTO paper_master_account (id, balance, equity, realized_pnl, win_rate, total_trades, winning_trades, losing_trades) 
     VALUES ($1, $2, $2, 0, 0, 0, 0, 0)
     ON CONFLICT (id) DO UPDATE SET balance = $2, equity = $2, realized_pnl = 0, win_rate = 0, total_trades = 0, winning_trades = 0, losing_trades = 0, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000`,
    [MASTER_ACCOUNT_ID, masterBal]
  );

  await query(
    `INSERT INTO paper_mirror_account (id, balance, equity, realized_pnl, win_rate, total_trades, winning_trades, losing_trades) 
     VALUES ($1, $2, $2, 0, 0, 0, 0, 0)
     ON CONFLICT (id) DO UPDATE SET balance = $2, equity = $2, realized_pnl = 0, win_rate = 0, total_trades = 0, winning_trades = 0, losing_trades = 0, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000`,
    [MIRROR_ACCOUNT_ID, mirrorBal]
  );

  console.log(`[PaperStorage] ♻️ Reset parametrizado: Master=$${masterBal} | Mirror=$${mirrorBal}`);
  return { masterBalance: masterBal, mirrorBalance: mirrorBal };
}

export async function hydrateMasterAccount(): Promise<PaperAccount> {
  const account = await queryOne<MasterAccountRow>('SELECT * FROM paper_master_account WHERE id = $1', [MASTER_ACCOUNT_ID]);
  const openOrders = await query<MasterOrderRow>("SELECT * FROM paper_master_orders WHERE status = 'OPEN' ORDER BY entry_time DESC");
  const historyOrders = await query<MasterOrderRow>("SELECT * FROM paper_master_orders WHERE status != 'OPEN' ORDER BY entry_time DESC LIMIT 100");

  const mapRowToTrade = (row: MasterOrderRow): SimulatedTradeWithTrailing => ({
    id: row.id,
    symbol: row.symbol,
    type: row.type,
    entryPrice: Number(row.entry_price),
    currentPrice: Number(row.current_price),
    takeProfit: Number(row.take_profit),
    stopLoss: Number(row.stop_loss),
    pnlUsd: Number(row.pnl_usd),
    pnlPct: Number(row.pnl_pct),
    rMultiple: Number(row.r_multiple),
    powerMultiplier: Number(row.power_multiplier),
    temperature: row.temperature as any,
    session: row.session as any,
    dayOfWeek: row.day_of_week,
    marketRegime: row.market_regime as any,
    status: row.status as any,
    entryTime: row.entry_time,
    closeTime: row.close_time || undefined,
    signalReason: row.signal_reason,
    trailingActive: Boolean(row.trailing_active),
    trailingTriggerPrice: row.trailing_trigger_price !== null ? Number(row.trailing_trigger_price) : undefined,
    trailingStopPrice: row.trailing_stop_price !== null ? Number(row.trailing_stop_price) : undefined
  });

  return {
    balance: account ? Number(account.balance) : 10000,
    equity: account ? Number(account.equity) : 10000,
    winRate: account ? Number(account.win_rate) : 0,
    totalTrades: account ? account.total_trades : 0,
    winningTrades: account ? account.winning_trades : 0,
    losingTrades: account ? account.losing_trades : 0,
    realizedPnl: account ? Number(account.realized_pnl) : 0,
    openPositions: openOrders.map(mapRowToTrade),
    history: historyOrders.map(mapRowToTrade)
  };
}

export async function persistMasterBalance(account: PaperAccount): Promise<void> {
  await query(
    `UPDATE paper_master_account SET 
       balance = $1, equity = $2, realized_pnl = $3, win_rate = $4, 
       total_trades = $5, winning_trades = $6, losing_trades = $7,
       updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
     WHERE id = $8`,
    [
      account.balance,
      account.equity,
      account.realizedPnl,
      account.winRate,
      account.totalTrades,
      account.winningTrades,
      account.losingTrades,
      MASTER_ACCOUNT_ID
    ]
  );
}

export async function upsertMasterOrder(trade: SimulatedTradeWithTrailing): Promise<void> {
  await query(
    `INSERT INTO paper_master_orders (
       id, symbol, type, entry_price, current_price, take_profit, stop_loss,
       pnl_usd, pnl_pct, r_multiple, power_multiplier, temperature, session,
       day_of_week, market_regime, status, entry_time, close_time, signal_reason,
       trailing_active, trailing_trigger_price, trailing_stop_price,
       fee, net_pnl, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     ON CONFLICT (id) DO UPDATE SET
       current_price = EXCLUDED.current_price,
       pnl_usd = EXCLUDED.pnl_usd,
       pnl_pct = EXCLUDED.pnl_pct,
       r_multiple = EXCLUDED.r_multiple,
       status = EXCLUDED.status,
       close_time = EXCLUDED.close_time,
       trailing_active = EXCLUDED.trailing_active,
       trailing_stop_price = EXCLUDED.trailing_stop_price,
       fee = EXCLUDED.fee,
       net_pnl = EXCLUDED.net_pnl,
       updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
   `,
    [
      trade.id,
      trade.symbol,
      trade.type,
      trade.entryPrice,
      trade.currentPrice,
      trade.takeProfit,
      trade.stopLoss,
      trade.pnlUsd,
      trade.pnlPct,
      trade.rMultiple,
      trade.powerMultiplier,
      trade.temperature,
      trade.session,
      trade.dayOfWeek,
      trade.marketRegime,
      trade.status,
      trade.entryTime,
      trade.closeTime || null,
      trade.signalReason,
      trade.trailingActive ? 1 : 0,
      trade.trailingTriggerPrice || null,
      trade.trailingStopPrice || null,
      trade.fee || 0,
      trade.netPnl || trade.pnlUsd || 0,
      Date.now()
    ]
  );
}

// ─── Mirror Account Functions ────────────────────────────────────────────────
export async function hydrateMirrorAccount(): Promise<PaperAccount> {
  const account = await queryOne<MirrorAccountRow>('SELECT * FROM paper_mirror_account WHERE id = $1', [MIRROR_ACCOUNT_ID]);
  const openOrders = await query<MirrorOrderRow>("SELECT * FROM paper_mirror_orders WHERE status = 'OPEN' ORDER BY entry_time DESC");
  const historyOrders = await query<MirrorOrderRow>("SELECT * FROM paper_mirror_orders WHERE status != 'OPEN' ORDER BY entry_time DESC LIMIT 100");

  const mapRowToTrade = (row: MirrorOrderRow): SimulatedTradeWithTrailing => ({
    id: row.id,
    symbol: row.symbol,
    type: row.type,
    entryPrice: Number(row.entry_price),
    currentPrice: Number(row.current_price),
    takeProfit: Number(row.take_profit),
    stopLoss: Number(row.stop_loss),
    pnlUsd: Number(row.pnl_usd),
    pnlPct: Number(row.pnl_pct),
    rMultiple: Number(row.r_multiple),
    powerMultiplier: Number(row.power_multiplier),
    temperature: row.temperature as any,
    session: row.session as any,
    dayOfWeek: row.day_of_week,
    marketRegime: row.market_regime as any,
    status: row.status as any,
    entryTime: row.entry_time,
    closeTime: row.close_time || undefined,
    signalReason: row.signal_reason,
    trailingActive: Boolean(row.trailing_active),
    trailingTriggerPrice: row.trailing_trigger_price !== null ? Number(row.trailing_trigger_price) : undefined,
    trailingStopPrice: row.trailing_stop_price !== null ? Number(row.trailing_stop_price) : undefined
  });

  return {
    balance: account ? Number(account.balance) : 500,
    equity: account ? Number(account.equity) : 500,
    winRate: account ? Number(account.win_rate) : 0,
    totalTrades: account ? account.total_trades : 0,
    winningTrades: account ? account.winning_trades : 0,
    losingTrades: account ? account.losing_trades : 0,
    realizedPnl: account ? Number(account.realized_pnl) : 0,
    openPositions: openOrders.map(mapRowToTrade),
    history: historyOrders.map(mapRowToTrade)
  };
}

export async function persistMirrorBalance(account: PaperAccount): Promise<void> {
  await query(
    `UPDATE paper_mirror_account SET 
       balance = $1, equity = $2, realized_pnl = $3, win_rate = $4, 
       total_trades = $5, winning_trades = $6, losing_trades = $7,
       updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
     WHERE id = $8`,
    [
      account.balance,
      account.equity,
      account.realizedPnl,
      account.winRate,
      account.totalTrades,
      account.winningTrades,
      account.losingTrades,
      MIRROR_ACCOUNT_ID
    ]
  );
}

export async function upsertMirrorOrder(trade: SimulatedTradeWithTrailing & { qty: number; fee: number; netPnl: number }): Promise<void> {
  await query(
    `INSERT INTO paper_mirror_orders (
       id, symbol, type, entry_price, current_price, take_profit, stop_loss,
       qty, fee, net_pnl, pnl_usd, pnl_pct, r_multiple, power_multiplier, temperature, session,
       day_of_week, market_regime, status, entry_time, close_time, signal_reason,
       trailing_active, trailing_trigger_price, trailing_stop_price
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     ON CONFLICT (id) DO UPDATE SET
       current_price = EXCLUDED.current_price,
       pnl_usd = EXCLUDED.pnl_usd,
       pnl_pct = EXCLUDED.pnl_pct,
       net_pnl = EXCLUDED.net_pnl,
       r_multiple = EXCLUDED.r_multiple,
       status = EXCLUDED.status,
       close_time = EXCLUDED.close_time,
       trailing_active = EXCLUDED.trailing_active,
        trailing_stop_price = EXCLUDED.trailing_stop_price,
        fee = EXCLUDED.fee,
        updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
    `,
    [
      trade.id,
      trade.symbol,
      trade.type,
      trade.entryPrice,
      trade.currentPrice,
      trade.takeProfit,
      trade.stopLoss,
      trade.qty,
      trade.fee,
      trade.netPnl,
      trade.pnlUsd,
      trade.pnlPct,
      trade.rMultiple,
      trade.powerMultiplier,
      trade.temperature,
      trade.session,
      trade.dayOfWeek,
      trade.marketRegime,
      trade.status,
      trade.entryTime,
      trade.closeTime || null,
      trade.signalReason,
      trade.trailingActive ? 1 : 0,
      trade.trailingTriggerPrice || null,
      trade.trailingStopPrice || null
    ]
  );
}