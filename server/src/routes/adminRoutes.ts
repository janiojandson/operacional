import { Router, Request, Response } from 'express';
import { requireAdmin } from '../auth/authMiddleware.js';
import { UserDB, ClientConfigDB, TradeHistoryDB, AnnouncementDB, query, queryOne, UserRow, ClientConfigRow } from '../database/db.js';
import { BybitExecutionEngine } from '../engine/bybitExecutionEngine.js';
import { sanitizeCsvField, escapeHtml } from '../utils/sanitizer.js';
import { layaGovernanceService } from '../services/layaGovernanceService.js';
import type { LayaMode } from '../../../shared/layaGovernanceTypes.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

let masterControlHandler: {
  setTrailingStopEnabled: (enabled: boolean) => void;
  setShadowFilterActive: (active: boolean) => void;
} | null = null;

export function bindMasterControlHandler(handler: typeof masterControlHandler): void {
  masterControlHandler = handler;
}

// GET /api/admin/clients — listar todos os clientes com status de sincronização e API
adminRouter.get('/clients', async (_req: Request, res: Response) => {
  const users = await UserDB.listClients();
  const configs = await ClientConfigDB.listAll();
  const configByClientId = new Map(configs.map(c => [c.client_id, c]));
  const configByUserId = new Map(configs.map(c => [c.user_id, c]));

  const clients = users.map(u => {
    const cfg = (u.client_id ? configByClientId.get(u.client_id) : undefined) || configByUserId.get(u.id);
    const now = Date.now();
    const expiresAt = cfg?.plan_expires_at ? Number(cfg.plan_expires_at) : null;
    const isExpired = expiresAt !== null && expiresAt < now;
    const isVitalicio = cfg?.plan_type === 'VITALICIO';
    const isVitrine = (cfg?.plan_type === 'VITRINE') || Number(cfg?.plan_active) === 0;

    return {
      userId: u.id,
      email: u.email,
      name: u.name,
      whatsapp: u.whatsapp,
      whatsappValidado: Number(u.whatsapp_validado) === 1,
      clientId: u.client_id || cfg?.client_id || null,
      isActive: Number(u.is_active) === 1,
      planActive: Number(cfg?.plan_active ?? 0) === 1 && !isExpired && !isVitrine,
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
        planType: cfg.plan_type || 'VITRINE',
        planExpiresAt: expiresAt,
        planActive: Number(cfg.plan_active) === 1
      } : null
    };
  });

  res.json(clients);
});

// ─── ROTAS DOS NOVOS BOTÕES (HEADER STATUS) ────────────────────────────────

// GET para carregar o status atual dos botões ao abrir o painel
adminRouter.get('/config/toggles', async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.clientId as string) || 'master-client';
    const config = await ClientConfigDB.findByClientId(clientId);
    return res.json({
      success: true,
      trailingStopEnabled: Number(config?.trailing_stop_enabled ?? 1) === 1,
      shadowFilterActive: Number(config?.shadow_filter_active ?? 0) === 1
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 1. Rota para alternar o Trailing Stop (Ativo / Inativo)
adminRouter.post('/config/trailing-stop', async (req: Request, res: Response) => {
  try {
    const { clientId, enabled } = req.body;
    const targetClient = clientId || 'master-client';

    await ClientConfigDB.setTrailingStop(targetClient, Boolean(enabled));
    if (targetClient === 'master-client') masterControlHandler?.setTrailingStopEnabled(Boolean(enabled));

    return res.json({
      success: true,
      trailingStopEnabled: Boolean(enabled),
      message: `Trailing Stop ${enabled ? 'ATIVADO (Runner Mode 100% / Piso 2.3R)' : 'DESATIVADO (Alvo Fixo 100% / 2.5R)'}`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Rota para alternar o Shadow Mode (Executor Real / Auditor Fantasma)
adminRouter.post('/config/shadow-filter', async (req: Request, res: Response) => {
  try {
    const { clientId, active } = req.body;
    const targetClient = clientId || 'master-client';

    await ClientConfigDB.setShadowFilter(targetClient, Boolean(active));
    if (targetClient === 'master-client') masterControlHandler?.setShadowFilterActive(Boolean(active));
return res.json({
      success: true,
      shadowFilterActive: Boolean(active),
      message: `Shadow Mode alterado para: ${active ? 'EXECUTOR REAL (Bloqueia ordens ruins)' : 'MODO FANTASMA (Apenas auditoria)'}`
    });

  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── SYNC ADMIN COM VARIÁVEIS DE AMBIENTE ──────────────────────────────────
// Se alterou ADMIN_EMAIL ou ADMIN_PASSWORD no .env/Railway, chama isso para atualizar
adminRouter.post('/sync-admin', async (_req: Request, res: Response) => {
  try {
    const result = await UserDB.syncAdminWithEnv();
    return res.json({ success: true, ...result, message: 'Admin sincronizado com variáveis de ambiente atuais' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET para verificar email atual do admin
adminRouter.get('/admin-info', async (_req: Request, res: Response) => {
  try {
    const admin = await queryOne<UserRow>('SELECT id, email, name, created_at FROM app_users WHERE role = $1 LIMIT 1', ['ADMIN']);
    return res.json({ success: true, admin });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/overview — Métricas consolidadas do SaaS
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

// POST /api/admin/clients/:id/force-disconnect — Força desconexão e zera posições
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

  await ClientConfigDB.setSyncEnabled(clientId, false);
  const result = await BybitExecutionEngine.panicCloseAll(clientId);

  res.json({
    success: result.success,
    message: `Forçada a desconexão do cliente ${clientId}. ${result.closedCount} posições encerradas e ${result.cancelledCount} ordens canceladas.`,
    details: result
  });
});

// POST, PUT, PATCH /api/admin/clients/:id/plan — gerenciar plano
const handlePlanUpdate = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id).trim();
    const { planType, daysToAdd, customExpiry, planActive, isVitalicio } = req.body;

    let user = await queryOne<UserRow>(
      'SELECT * FROM app_users WHERE id = $1 OR client_id = $1 OR email = $1 LIMIT 1',
      [id]
    );

    let current = await queryOne<ClientConfigRow>(
      'SELECT * FROM client_configs WHERE client_id = $1 OR user_id = $1 LIMIT 1',
      [id]
    );

    if (!user && current?.user_id) {
      user = await queryOne<UserRow>('SELECT * FROM app_users WHERE id = $1 LIMIT 1', [current.user_id]);
    }

    if (!user) {
      return res.status(404).json({ error: `Cliente não encontrado no sistema (ID: ${id}).` });
    }

    let clientId = user.client_id || current?.client_id || `cli-${user.id.replace(/^usr-/, '')}`;
    if (user.client_id !== clientId) {
      await query('UPDATE app_users SET client_id = $1 WHERE id = $2', [clientId, user.id]);
      user.client_id = clientId;
    }

    if (!current) {
      current = await ClientConfigDB.findByClientId(clientId);
      if (!current) {
        await ClientConfigDB.create({
          clientId,
          userId: user.id,
          name: user.name || undefined,
          phone: user.whatsapp || undefined,
          planType: planType || 'VITRINE',
          planActive: false,
          syncEnabled: false
        });
        current = await ClientConfigDB.findByClientId(clientId);
      }
    }

    let newPlanType = planType || current?.plan_type || 'VITRINE';
    let newPlanActive = planActive !== undefined ? Boolean(planActive) : Number(current?.plan_active) === 1;
    let expiresAt: number | null = current?.plan_expires_at ? Number(current.plan_expires_at) : null;

    if (isVitalicio || planType === 'VITALICIO') {
      newPlanType = 'VITALICIO';
      newPlanActive = true;
      expiresAt = null;
    } else if (planType === 'VITRINE') {
      newPlanType = 'VITRINE';
      newPlanActive = false;
      expiresAt = null;
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
    await ClientConfigDB.setActive(clientId, newPlanType !== 'INACTIVE');
    await UserDB.setPlanActive(user.id, newPlanType !== 'INACTIVE');

    return res.json({
      success: true,
      clientId,
      userId: user.id,
      planType: newPlanType,
      planActive: newPlanActive,
      planExpiresAt: expiresAt
    });
  } catch (error: any) {
    console.error("ERRO AO SALVAR CLIENTE:", error);
    return res.status(500).json({ error: error.message || 'Erro interno ao salvar configurações.' });
  }
};

adminRouter.post('/clients/:id/plan', handlePlanUpdate);
adminRouter.put('/clients/:id/plan', handlePlanUpdate);
adminRouter.patch('/clients/:id/plan', handlePlanUpdate);

// POST /api/admin/clients/:id/kill-switch
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

// GET /api/admin/announcements
adminRouter.get('/announcements', async (_req: Request, res: Response) => {
  const list = await AnnouncementDB.listAll();
  res.json(list);
});

// POST /api/admin/announcements
adminRouter.post('/announcements', async (req: Request, res: Response) => {
  const { title, message, type = 'INFO', actionUrl, actionLabel } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
  }

  const id = `ann-${Date.now()}`;
  await AnnouncementDB.create({ id, title, message, type, actionUrl, actionLabel });
  res.status(201).json({ success: true, id, title, message, type });
});

// DELETE /api/admin/announcements/:id
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

// GET /api/admin/reports/download
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
        <td style="text-align: left;">${escapeHtml(t.client_id)}</td>
        <td style="text-align: left; font-weight: bold;">${escapeHtml(t.symbol)}</td>
        <td style="text-align: center; color: ${t.side === 'BUY' ? '#10b981' : '#f43f5e'}; font-weight: bold;">${escapeHtml(t.side)}</td>
        <td style="text-align: right;">$${Number(t.entry_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${t.close_price ? '$' + Number(t.close_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
        <td style="text-align: right;">${t.qty}</td>
        <td style="text-align: right;">$${Number(t.notional_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-weight: bold; color: ${(t.pnl_usd ?? 0) >= 0 ? '#10b981' : '#f43f5e'};">${t.pnl_usd != null ? (t.pnl_usd >= 0 ? '+' : '') + '$' + Number(t.pnl_usd).toFixed(2) : '—'}</td>
        <td style="text-align: center;">${t.leverage ? t.leverage + 'x' : '—'}</td>
        <td style="text-align: center;">${escapeHtml(t.status)}</td>
        <td style="text-align: left;">${escapeHtml(t.signal_reason || 'Manual / Quant AI')}</td>
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
    ...trades.map(t => [
      sanitizeCsvField(t.id),
      sanitizeCsvField(t.client_id),
      sanitizeCsvField(t.symbol),
      sanitizeCsvField(t.side),
      sanitizeCsvField(t.entry_price),
      sanitizeCsvField(t.close_price ?? ''),
      sanitizeCsvField(t.qty),
      sanitizeCsvField(t.notional_usd),
      sanitizeCsvField(t.pnl_usd ?? ''),
      sanitizeCsvField(t.leverage ?? ''),
      sanitizeCsvField(t.status),
      sanitizeCsvField(t.signal_reason ?? ''),
      sanitizeCsvField(formatDate(t.entry_time)),
      sanitizeCsvField(formatDate(t.close_time))
    ].join(','))
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="marketflow-report-${Date.now()}.csv"`);
  res.send('\uFEFF' + csvRows.join('\n'));
});

// DELETE /api/admin/clients/:id
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

// GET /api/admin/laya/status — Métricas e decisões recentes da governança Laya
adminRouter.get('/laya/status', (_req: Request, res: Response) => {
  const mode = layaGovernanceService.getMode();
  const metrics = layaGovernanceService.getMetrics();
  res.json({
    mode,
    metrics: {
      latencyP50: metrics.p50LatencyMs,
      latencyP95: metrics.p95LatencyMs,
      sessionPardonsUsed: metrics.overridesUsedSession,
      maxSessionPardons: metrics.maxOverridesPerSession,
      totalDecisions: metrics.recentDecisions.length,
      counterfactualPnL: metrics.pnlAttributedOverrides
    },
    recentDecisions: metrics.recentDecisions
  });
});

// POST /api/admin/laya/mode — Alternar modo operacional (OFF, SHADOW, ACTIVE)
adminRouter.post('/laya/mode', (req: Request, res: Response) => {
  const { mode } = req.body || {};
  const validModes: LayaMode[] = ['OFF', 'SHADOW', 'ACTIVE'];
  if (!mode || !validModes.includes(mode)) {
    return res.status(400).json({ error: 'Modo inválido. Valores permitidos: OFF, SHADOW, ACTIVE' });
  }
  layaGovernanceService.setMode(mode);
  console.log(`[LAYA ADMIN] Modo operacional alterado para: ${mode}`);
  res.json({ success: true, mode: layaGovernanceService.getMode() });
});

