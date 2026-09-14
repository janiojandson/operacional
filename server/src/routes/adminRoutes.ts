import { Router, Request, Response } from 'express';
import { requireAdmin } from '../auth/authMiddleware.js';
import { UserDB, ClientConfigDB, TradeHistoryDB, BalanceEditDB } from '../database/db.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// GET /api/admin/clients — listar todos os clientes com status
adminRouter.get('/clients', async (_req: Request, res: Response) => {
  const users = await UserDB.listClients();
  const configs = await ClientConfigDB.listAll();
  const configMap = new Map(configs.map(c => [c.client_id, c]));

  const clients = users.map(u => {
    const cfg = u.client_id ? configMap.get(u.client_id) : undefined;
    return {
      userId: u.id,
      email: u.email,
      name: u.name,
      clientId: u.client_id,
      isActive: Number(u.is_active) === 1,
      createdAt: u.created_at,
      config: cfg ? {
        riskPct: Number(cfg.risk_pct),
        leverage: Number(cfg.leverage),
        maxDailyLossUsd: Number(cfg.max_daily_loss_usd),
        maxDailyProfitUsd: Number(cfg.max_daily_profit_usd),
        maxOpenPositions: Number(cfg.max_open_positions),
        balance: Number(cfg.balance),
        isActive: Number(cfg.is_active) === 1,
        apiConnected: Number(cfg.api_connected) === 1,
        bybitTestnet: Number(cfg.bybit_testnet) === 1,
        hasApiKeys: !!(cfg.bybit_api_key_enc),
        maskedApiKey: cfg.bybit_api_key_enc ? '****...****' : null,
        notificationPhone: cfg.notification_phone,
      } : null
    };
  });

  res.json(clients);
});

// POST /api/admin/clients/:clientId/balance — editar saldo
adminRouter.post('/clients/:clientId/balance', async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const { balance, reason } = req.body;

  if (typeof balance !== 'number' || balance < 0) {
    return res.status(400).json({ error: 'Saldo inválido.' });
  }

  const config = await ClientConfigDB.findByClientId(clientId);
  if (!config) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const oldBalance = Number(config.balance);
  await ClientConfigDB.updateBalance(clientId, balance);

  const editId = `edit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  await BalanceEditDB.insert({
    id: editId,
    client_id: clientId,
    admin_id: req.user!.userId,
    old_balance: oldBalance,
    new_balance: balance,
    reason: reason || 'Edição manual pelo admin',
    action: 'EDIT'
  });

  res.json({ success: true, clientId, oldBalance, newBalance: balance });
});

// POST /api/admin/clients/:clientId/reset-balance — zerar banca
adminRouter.post('/clients/:clientId/reset-balance', async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const { reason } = req.body;

  const config = await ClientConfigDB.findByClientId(clientId);
  if (!config) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const oldBalance = Number(config.balance);
  await ClientConfigDB.updateBalance(clientId, 0);

  const editId = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  await BalanceEditDB.insert({
    id: editId,
    client_id: clientId,
    admin_id: req.user!.userId,
    old_balance: oldBalance,
    new_balance: 0,
    reason: reason || 'Reset de banca pelo admin',
    action: 'RESET'
  });

  res.json({ success: true, clientId, oldBalance, newBalance: 0 });
});

// POST /api/admin/clients/:clientId/kill-switch
adminRouter.post('/clients/:clientId/kill-switch', async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const { active } = req.body;
  await ClientConfigDB.setActive(clientId, active !== false);
  res.json({ success: true, clientId, active: active !== false });
});

// GET /api/admin/balance-edits
adminRouter.get('/balance-edits', async (_req: Request, res: Response) => {
  const edits = await BalanceEditDB.findAll();
  res.json(edits);
});

// GET /api/admin/balance-edits/:clientId
adminRouter.get('/balance-edits/:clientId', async (req: Request, res: Response) => {
  const edits = await BalanceEditDB.findByClientId(req.params.clientId);
  res.json(edits);
});

// GET /api/admin/reports
adminRouter.get('/reports', async (req: Request, res: Response) => {
  const { clientId, from, to, limit } = req.query;

  const trades = await TradeHistoryDB.findAll({
    clientId: clientId as string | undefined,
    from: from ? Number(from) : undefined,
    to: to ? Number(to) : undefined,
    limit: limit ? Number(limit) : 500
  });

  const closed = trades.filter(t => t.status === 'CLOSED' && t.pnl_usd !== null);
  const totalPnl = closed.reduce((sum, t) => sum + Number(t.pnl_usd ?? 0), 0);
  const wins = closed.filter(t => Number(t.pnl_usd ?? 0) > 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length * 100).toFixed(1) : '0';

  res.json({
    trades,
    summary: {
      totalTrades: trades.length,
      closedTrades: closed.length,
      openTrades: trades.filter(t => t.status === 'OPEN').length,
      totalPnlUsd: Number(totalPnl.toFixed(2)),
      winRate: Number(winRate),
      wins,
      losses: closed.length - wins
    }
  });
});

// GET /api/admin/reports/download — download CSV
adminRouter.get('/reports/download', async (req: Request, res: Response) => {
  const { clientId, from, to, format = 'csv' } = req.query;

  const trades = await TradeHistoryDB.findAll({
    clientId: clientId as string | undefined,
    from: from ? Number(from) : undefined,
    to: to ? Number(to) : undefined,
    limit: 10000
  });

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="marketflow-report-${Date.now()}.json"`);
    return res.json(trades);
  }

  const headers = ['id', 'client_id', 'symbol', 'side', 'entry_price', 'close_price', 'qty', 'notional_usd', 'pnl_usd', 'leverage', 'status', 'signal_reason', 'entry_time', 'close_time'];
  const csvRows = [
    headers.join(','),
    ...trades.map(t => headers.map(h => {
      const val = (t as any)[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      return val;
    }).join(','))
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="marketflow-report-${Date.now()}.csv"`);
  res.send('\uFEFF' + csvRows.join('\n'));
});

// DELETE /api/admin/clients/:userId
adminRouter.delete('/clients/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  await UserDB.deactivate(userId);
  res.json({ success: true, userId });
});
