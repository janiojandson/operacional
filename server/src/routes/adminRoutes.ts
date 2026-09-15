import { Router, Request, Response } from 'express';
import { requireAdmin } from '../auth/authMiddleware.js';
import { UserDB, ClientConfigDB, TradeHistoryDB, AnnouncementDB, query } from '../database/db.js';
import { BybitExecutionEngine } from '../engine/bybitExecutionEngine.js';


export const adminRouter = Router();
adminRouter.use(requireAdmin);

// GET /api/admin/clients — listar todos os clientes com status de sincronização e API
adminRouter.get('/clients', async (_req: Request, res: Response) => {
  const users = await UserDB.listClients();
  const configs = await ClientConfigDB.listAll();
  const configMap = new Map(configs.map(c => [c.client_id, c]));

  const clients = users.map(u => {
    const cfg = u.client_id ? configMap.get(u.client_id) : undefined;
    const now = Date.now();
    const expiresAt = cfg?.plan_expires_at ? Number(cfg.plan_expires_at) : null;
    const isExpired = expiresAt !== null && expiresAt < now;
    const isVitalicio = cfg?.plan_type === 'VITALICIO';
    const isVitrine = cfg?.plan_type === 'VITRINE' || Number(cfg?.plan_active) === 0;

    return {
      userId: u.id,
      email: u.email,
      name: u.name,
      whatsapp: u.whatsapp,
      whatsappValidado: Number(u.whatsapp_validado) === 1,
      clientId: u.client_id || cfg?.client_id || null,
      isActive: Number(u.is_active) === 1,
      planActive: Number(cfg?.plan_active ?? 1) === 1 && !isExpired,
      isExpired,
      isVitalicio,
      isVitrine,
      createdAt: u.created_at,
      config: cfg ? {
        riskPct: Number(cfg.risk_pct),
        leverage: Number(cfg.leverage),
        maxDailyLossUsd: Number(cfg.max_daily_loss_usd),
        maxDailyProfitUsd: Number(cfg.max_daily_profit_usd),
        maxOpenPositions: Number(cfg.max_open_positions),
        balance: Number(cfg.balance),
        isActive: Number(cfg.is_active) === 1,
        syncEnabled: Number(cfg.sync_enabled) === 1,
        apiConnected: Number(cfg.api_connected) === 1,
        bybitTestnet: Number(cfg.bybit_testnet) === 1,
        hasApiKeys: !!(cfg.bybit_api_key_enc),
        maskedApiKey: cfg.bybit_api_key_enc ? '****...****' : null,
        notificationPhone: cfg.notification_phone,
        planType: cfg.plan_type || 'ACTIVE',
        planExpiresAt: expiresAt,
        planActive: Number(cfg.plan_active) === 1
      } : null
    };
  });

  res.json(clients);
});

// GET /api/admin/overview — Métricas consolidadas do SaaS (Clientes Ativos vs Inativos, Bybit Health, Performance do Dia)
adminRouter.get('/overview', async (_req: Request, res: Response) => {
  const users = await UserDB.listClients();
  const configs = await ClientConfigDB.listAll();
  const now = Date.now();
  
  const totalClients = users.length;
  const activePlanClients = configs.filter(c => {
    const isExp = c.plan_expires_at ? Number(c.plan_expires_at) < now : false;
    return Number(c.is_active) === 1 && Number(c.plan_active) === 1 && !isExp;
  }).length;
  const inactivePlanClients = totalClients - activePlanClients;

  const connectedApis = configs.filter(c => Number(c.api_connected) === 1).length;
  const syncActiveCount = configs.filter(c => Number(c.sync_enabled) === 1 && Number(c.api_connected) === 1).length;

  // Performance Global do Dia
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const todayTimestamp = todayMidnight.getTime();

  const todayTrades = await TradeHistoryDB.findAll({
    from: todayTimestamp,
    limit: 5000
  });

  const closedToday = todayTrades.filter(t => t.status === 'CLOSED' && t.pnl_usd !== null);
  const totalPnlToday = closedToday.reduce((sum, t) => sum + Number(t.pnl_usd ?? 0), 0);
  const winsToday = closedToday.filter(t => Number(t.pnl_usd ?? 0) > 0).length;
  const winRateToday = closedToday.length > 0 ? (winsToday / closedToday.length * 100).toFixed(1) : '0';

  res.json({
    totalClients,
    activePlanClients,
    inactivePlanClients,
    connectedApis,
    syncActiveCount,
    bybitHealth: {
      status: 'OPERATIONAL',
      connectedClients: connectedApis,
      totalConfigs: configs.length
    },
    performanceToday: {
      totalTrades: todayTrades.length,
      closedTrades: closedToday.length,
      openTrades: todayTrades.filter(t => t.status === 'OPEN').length,
      totalPnlUsd: Number(totalPnlToday.toFixed(2)),
      winRate: Number(winRateToday),
      wins: winsToday,
      losses: closedToday.length - winsToday
    }
  });
});

// POST /api/admin/clients/:id/force-disconnect — Força desconexão e zera posições a mercado na Bybit (Pânico)
adminRouter.post('/clients/:id/force-disconnect', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  let clientId = id;
  
  let current = await ClientConfigDB.findByClientId(id);
  if (!current) {
    const user = await UserDB.findById(id);
    if (user?.client_id) {
      clientId = user.client_id;
      current = await ClientConfigDB.findByClientId(clientId);
    }
  }
  if (!current) return res.status(404).json({ error: 'Cliente não encontrado.' });

  // 1. Desliga sincronização imediatamente
  await ClientConfigDB.setSyncEnabled(clientId, false);

  // 2. Executa Pânico na Bybit
  const result = await BybitExecutionEngine.panicCloseAll(clientId);

  res.json({
    success: result.success,
    message: `Forçada a desconexão do cliente ${clientId}. ${result.closedCount} posições encerradas e ${result.cancelledCount} ordens canceladas.`,
    details: result
  });
});

// POST, PUT, PATCH /api/admin/clients/:id/plan — gerenciar plano, validade e modalidades (Vitalício, Vitrine, Ativo com dias)
const handlePlanUpdate = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { planType, daysToAdd, customExpiry, planActive, isVitalicio } = req.body;
    console.log(`[Admin] 📝 Recebida solicitação de plano para ID '${id}':`, JSON.stringify(req.body));

    let user = await UserDB.findById(id);
    if (!user) user = await UserDB.findByClientId(id);

    let clientId: string | null = null;
    let current: ClientConfigRow | undefined = undefined;

    if (user) {
      current = await ClientConfigDB.findByUserId(user.id);
      if (current) clientId = current.client_id;
    }

    if (!current) {
      current = await ClientConfigDB.findByClientId(id);
      if (current) clientId = current.client_id;
    }

    if (!clientId && user) {
      clientId = user.client_id || `cli-${user.id.slice(-8)}`;
      await query('UPDATE app_users SET client_id = $1 WHERE id = $2', [clientId, user.id]);
      await ClientConfigDB.create({ clientId, userId: user.id, planType: planType || 'ACTIVE', planActive: true });
      current = await ClientConfigDB.findByClientId(clientId);
    }

    if (!clientId || !current) {
      console.warn(`[Admin] ⚠️ Cliente não encontrado para ID '${id}'`);
      return res.status(404).json({ error: 'Configuração do cliente não encontrada.' });
    }

    let newPlanType = planType || current.plan_type || 'ACTIVE';
    let newPlanActive = planActive !== undefined ? Boolean(planActive) : Number(current.plan_active) === 1;
    let expiresAt: number | null = current.plan_expires_at ? Number(current.plan_expires_at) : null;

    if (isVitalicio || planType === 'VITALICIO') {
      newPlanType = 'VITALICIO';
      newPlanActive = true;
      expiresAt = null; // null = sem expiração
    } else if (planType === 'VITRINE') {
      newPlanType = 'VITRINE';
      newPlanActive = false;
      await ClientConfigDB.setSyncEnabled(clientId, false);
    } else if (planType === 'INACTIVE') {
      newPlanType = 'INACTIVE';
      newPlanActive = false;
      await ClientConfigDB.setSyncEnabled(clientId, false);
    } else if (planType === 'ACTIVE' || daysToAdd !== undefined || customExpiry !== undefined) {
      newPlanType = 'ACTIVE';
      newPlanActive = true;
      if (daysToAdd !== undefined && daysToAdd !== null && !isNaN(Number(daysToAdd))) {
        const now = Date.now();
        const base = (expiresAt && expiresAt > now) ? expiresAt : now;
        expiresAt = base + (Number(daysToAdd) * 24 * 60 * 60 * 1000);
      } else if (customExpiry) {
        expiresAt = Number(customExpiry);
      }
    }

    await ClientConfigDB.updatePlan(clientId, newPlanType, newPlanActive, expiresAt);
    
    if (user) {
      await UserDB.setPlanActive(user.id, newPlanActive);
    }

    console.log(`[Admin] ✅ Plano atualizado com sucesso para cliente ${clientId}:`, { newPlanType, newPlanActive, expiresAt });

    return res.json({
      success: true,
      clientId,
      planType: newPlanType,
      planActive: newPlanActive,
      planExpiresAt: expiresAt
    });
  } catch (err: any) {
    console.error('[Admin] ❌ Erro ao processar atualização de plano:', err);
    return res.status(500).json({ error: `Erro no servidor ao salvar plano: ${err.message}` });
  }
};

adminRouter.post('/clients/:id/plan', handlePlanUpdate);
adminRouter.put('/clients/:id/plan', handlePlanUpdate);
adminRouter.patch('/clients/:id/plan', handlePlanUpdate);

// POST /api/admin/clients/:id/kill-switch — ativar/bloquear cliente (atualiza is_active e plan_active)
adminRouter.post('/clients/:id/kill-switch', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { active } = req.body;
  const isActive = active !== false;

  let clientId = id;
  let user = await UserDB.findByClientId(id);
  if (!user) {
    user = await UserDB.findById(id);
    if (user?.client_id) clientId = user.client_id;
  }

  if (clientId) {
    await ClientConfigDB.setActive(clientId, isActive);
    if (!isActive) {
      await ClientConfigDB.setSyncEnabled(clientId, false);
    }
  }

  if (user) {
    await UserDB.setPlanActive(user.id, isActive);
    await query('UPDATE app_users SET is_active = $1 WHERE id = $2', [isActive ? 1 : 0, user.id]);
  }

  res.json({ success: true, clientId, active: isActive });
});


// GET /api/admin/announcements — listar anúncios do sistema
adminRouter.get('/announcements', async (_req: Request, res: Response) => {
  const list = await AnnouncementDB.listAll();
  res.json(list);
});

// POST /api/admin/announcements — criar aviso em tela / banner
adminRouter.post('/announcements', async (req: Request, res: Response) => {
  const { title, message, type = 'INFO', actionUrl, actionLabel } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
  }

  const id = `ann-${Date.now()}`;
  await AnnouncementDB.create({ id, title, message, type, actionUrl, actionLabel });
  res.status(201).json({ success: true, id, title, message, type });
});

// DELETE /api/admin/announcements/:id — excluir aviso
adminRouter.delete('/announcements/:id', async (req: Request, res: Response) => {
  await AnnouncementDB.delete(String(req.params.id));
  res.json({ success: true, id: req.params.id });
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

// GET /api/admin/reports/download — download Planilha Excel (.xls) ou CSV
adminRouter.get('/reports/download', async (req: Request, res: Response) => {
  const { clientId, from, to, format = 'excel' } = req.query;

  const trades = await TradeHistoryDB.findAll({
    clientId: clientId as string | undefined,
    from: from ? Number(from) : undefined,
    to: to ? Number(to) : undefined,
    limit: 10000
  });

  const formatDate = (ts: number | null) => ts ? new Date(ts).toLocaleString('pt-BR') : '';

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="marketflow-report-${Date.now()}.json"`);
    return res.json(trades);
  }

  if (format === 'excel' || format === 'xlsx') {
    const tableRows = trades.map(t => `
      <tr>
        <td style="text-align: left;">${t.client_id}</td>
        <td style="text-align: left; font-weight: bold;">${t.symbol}</td>
        <td style="text-align: center; color: ${t.side === 'BUY' ? '#10b981' : '#f43f5e'}; font-weight: bold;">${t.side}</td>
        <td style="text-align: right;">$${Number(t.entry_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${t.close_price ? '$' + Number(t.close_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
        <td style="text-align: right;">${t.qty}</td>
        <td style="text-align: right;">$${Number(t.notional_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-weight: bold; color: ${(t.pnl_usd ?? 0) >= 0 ? '#10b981' : '#f43f5e'};">${t.pnl_usd != null ? (t.pnl_usd >= 0 ? '+' : '') + '$' + Number(t.pnl_usd).toFixed(2) : '—'}</td>
        <td style="text-align: center;">${t.leverage ? t.leverage + 'x' : '—'}</td>
        <td style="text-align: center;">${t.status}</td>
        <td style="text-align: left;">${t.signal_reason || 'Manual / Quant AI'}</td>
        <td style="text-align: center;">${formatDate(t.entry_time)}</td>
        <td style="text-align: center;">${formatDate(t.close_time)}</td>
      </tr>
    `).join('');

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
        <style>
          th { background-color: #1e1b4b; color: #ffffff; font-family: Arial; font-size: 11pt; padding: 8px; }
          td { font-family: Arial; font-size: 10pt; padding: 6px; border: 0.5pt solid #cbd5e1; }
        </style>
      </head>
      <body>
        <h2 style="font-family: Arial; color: #312e81;">MarketFlow Pro — Relatório Geral Administrativo</h2>
        <p style="font-family: Arial; font-size: 10pt; color: #64748b;">Total de Operações: <b>${trades.length}</b> | Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
        <table border="1">
          <thead>
            <tr>
              <th>ID Cliente</th>
              <th>Par / Ativo</th>
              <th>Lado</th>
              <th>Preço Entrada</th>
              <th>Preço Saída</th>
              <th>Quantidade</th>
              <th>Volume USD</th>
              <th>Resultado P&L ($)</th>
              <th>Alavancagem</th>
              <th>Status</th>
              <th>Motivo do Sinal</th>
              <th>Data/Hora Entrada</th>
              <th>Data/Hora Fechamento</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="marketflow-admin-report-${Date.now()}.xls"`);
    return res.send(excelHtml);
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

// DELETE /api/admin/clients/:id — excluir cliente e seus dados permanentemente
adminRouter.delete('/clients/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  
  let user = await UserDB.findById(id);
  if (!user) {
    user = await UserDB.findByClientId(id);
  }

  if (!user) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  await UserDB.deleteClient(user.id, user.client_id);
  res.json({ success: true, message: `Cliente ${user.name || user.email} excluído com sucesso.` });
});


