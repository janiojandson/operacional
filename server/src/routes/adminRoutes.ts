import { Router, Request, Response } from 'express';
import { requireAdmin } from '../auth/authMiddleware.js';
import { UserDB, ClientConfigDB, TradeHistoryDB, BalanceEditDB } from '../database/db.js';
import { maskApiKey } from '../utils/crypto.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// GET /api/admin/clients — listar todos os clientes com status
adminRouter.get('/clients', (_req: Request, res: Response) => {
  const users = UserDB.listClients();
  const configs = ClientConfigDB.listAll();
  const configMap = new Map(configs.map(c => [c.client_id, c]));

  const clients = users.map(u => {
    const cfg = u.client_id ? configMap.get(u.client_id) : undefined;
    return {
      userId: u.id,
      email: u.email,
      name: u.name,
      clientId: u.client_id,
      isActive: u.is_active === 1,
      createdAt: u.created_at,
      config: cfg ? {
        riskPct: cfg.risk_pct,
        leverage: cfg.leverage,
        maxDailyLossUsd: cfg.max_daily_loss_usd,
        maxDailyProfitUsd: cfg.max_daily_profit_usd,
        maxOpenPositions: cfg.max_open_positions,
        balance: cfg.balance,
        isActive: cfg.is_active === 1,
        apiConnected: cfg.api_connected === 1,
        bybitTestnet: cfg.bybit_testnet === 1,
        hasApiKeys: !!(cfg.bybit_api_key_enc),
        maskedApiKey: cfg.bybit_api_key_enc ? '****...****' : null,
        notificationPhone: cfg.notification_phone,
      } : null
    };
  });

  res.json(clients);
});

// POST /api/admin/clients/:clientId/balance — editar saldo
adminRouter.post('/clients/:clientId/balance', (req: Request, res: Response) => {
  const { clientId } = req.params;
  const { balance, reason } = req.body;

  if (typeof balance !== 'number' || balance < 0) {
    return res.status(400).json({ error: 'Saldo inválido.' });
  }

  const config = ClientConfigDB.findByClientId(clientId);
  if (!config) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const oldBalance = config.balance;
  ClientConfigDB.updateBalance(clientId, balance);

  // Registrar auditoria
  const editId = `edit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  BalanceEditDB.insert({
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
adminRouter.post('/clients/:clientId/reset-balance', (req: Request, res: Response) => {
  const { clientId } = req.params;
  const { reason } = req.body;

  const config = ClientConfigDB.findByClientId(clientId);
  if (!config) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const oldBalance = config.balance;
  ClientConfigDB.updateBalance(clientId, 0);

  const editId = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  BalanceEditDB.insert({
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

// POST /api/admin/clients/:clientId/kill-switch — desativar/ativar cliente
adminRouter.post('/clients/:clientId/kill-switch', (req: Request, res: Response) => {
  const { clientId } = req.params;
  const { active } = req.body;
  ClientConfigDB.setActive(clientId, active !== false);
  res.json({ success: true, clientId, active: active !== false });
});

// GET /api/admin/balance-edits — histórico completo de edições de banca
adminRouter.get('/balance-edits', (_req: Request, res: Response) => {
  const edits = BalanceEditDB.findAll();
  res.json(edits);
});

// GET /api/admin/balance-edits/:clientId — histórico de edições de um cliente específico
adminRouter.get('/balance-edits/:clientId', (req: Request, res: Response) => {
  const edits = BalanceEditDB.findByClientId(req.params.clientId);
  res.json(edits);
});

// GET /api/admin/reports — relatório de trades com filtros
adminRouter.get('/reports', (req: Request, res: Response) => {
  const { clientId, from, to, limit } = req.query;

  const trades = TradeHistoryDB.findAll({
    clientId: clientId as string | undefined,
    from: from ? Number(from) : undefined,
    to: to ? Number(to) : undefined,
    limit: limit ? Number(limit) : 500
  });

  // Calcular métricas agregadas
  const closed = trades.filter(t => t.status === 'CLOSED' && t.pnl_usd !== null);
  const totalPnl = closed.reduce((sum, t) => sum + (t.pnl_usd ?? 0), 0);
  const wins = closed.filter(t => (t.pnl_usd ?? 0) > 0).length;
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
adminRouter.get('/reports/download', (req: Request, res: Response) => {
  const { clientId, from, to, format = 'csv' } = req.query;

  const trades = TradeHistoryDB.findAll({
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

  // CSV
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
  res.send('\uFEFF' + csvRows.join('\n')); // BOM para Excel reconhecer UTF-8
});

// DELETE /api/admin/clients/:userId — desativar usuário (soft delete)
adminRouter.delete('/clients/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  UserDB.deactivate(userId);
  res.json({ success: true, userId });
});
