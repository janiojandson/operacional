import { Router, Request, Response } from 'express';
import { requireClient } from '../auth/authMiddleware.js';
import { ClientConfigDB, TradeHistoryDB } from '../database/db.js';
import { encrypt } from '../utils/crypto.js';
import { BybitExecutionEngine } from '../engine/bybitExecutionEngine.js';

export const clientRouter = Router();
clientRouter.use(requireClient);

function getClientId(req: Request): string | null {
  if (req.user?.role === 'ADMIN') {
    return (req.params.clientId || req.query.clientId) as string || null;
  }
  return req.user?.clientId || null;
}

// POST /api/client/api-keys
clientRouter.post('/api-keys', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado no token.' });

  const { apiKey, apiSecret, testnet = true } = req.body;
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'apiKey e apiSecret são obrigatórios.' });
  }
  if (apiKey.length < 10 || apiSecret.length < 10) {
    return res.status(400).json({ error: 'Chaves inválidas — verifique se copiou corretamente da Bybit.' });
  }

  try {
    const encKey = encrypt(apiKey);
    const encSecret = encrypt(apiSecret);
    await ClientConfigDB.updateApiKeys(clientId, encKey, encSecret, testnet);
    res.json({
      success: true,
      message: 'API Keys salvas com criptografia AES-256. Clique em "Testar Conexão" para validar.',
      testnet
    });
  } catch (err: any) {
    res.status(500).json({ error: `Erro ao salvar chaves: ${err.message}` });
  }
});

// POST /api/client/api-keys/test
clientRouter.post('/api-keys/test', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const result = await BybitExecutionEngine.connectAndValidate(clientId);
  if (result.success) {
    res.json({
      success: true,
      message: '✅ Conexão com Bybit estabelecida com sucesso!',
      maskedKey: result.maskedKey,
      accountInfo: result.accountInfo
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error,
      hint: 'Verifique se as chaves estão corretas e se a permissão "Contract - Order" está ativada na Bybit.'
    });
  }
});

// GET /api/client/account
clientRouter.get('/account', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const config = await ClientConfigDB.findByClientId(clientId);
  if (!config) return res.status(404).json({ error: 'Configuração de cliente não encontrada.' });

  let bybitAccount = null;
  if (Number(config.api_connected) === 1 && config.bybit_api_key_enc) {
    bybitAccount = await BybitExecutionEngine.getAccountBalance(clientId);
    if (bybitAccount) {
      await ClientConfigDB.updateBalance(clientId, bybitAccount.walletBalance);
    }
  }

  let userPlanActive = true;
  if (config.user_id) {
    const u = await UserDB.findById(config.user_id);
    if (u) userPlanActive = Number(u.plan_active) === 1 && Number(u.is_active) === 1;
  }

  res.json({
    clientId,
    balance: bybitAccount?.walletBalance ?? Number(config.balance),
    availableBalance: bybitAccount?.availableBalance ?? Number(config.balance),
    equity: bybitAccount?.equity ?? Number(config.balance),
    unrealisedPnl: bybitAccount?.unrealisedPnl ?? 0,
    riskPct: Number(config.risk_pct),
    leverage: Number(config.leverage),
    maxDailyLossUsd: Number(config.max_daily_loss_usd),
    maxDailyProfitUsd: Number(config.max_daily_profit_usd),
    maxOpenPositions: Number(config.max_open_positions),
    isActive: Number(config.is_active) === 1,
    planActive: userPlanActive,
    syncEnabled: Number(config.sync_enabled) === 1,
    apiConnected: Number(config.api_connected) === 1,
    bybitTestnet: Number(config.bybit_testnet) === 1,
    hasApiKeys: !!(config.bybit_api_key_enc),
    notificationPhone: config.notification_phone,
    planType: config.plan_type || 'STANDARD',
    planExpiresAt: config.plan_expires_at ? Number(config.plan_expires_at) : null
  });
});


// POST /api/client/sync-toggle — Ligar ou Desligar Sincronização (com Pânico ao Desligar)
clientRouter.post('/sync-toggle', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Campo enabled (boolean) é obrigatório.' });
  }

  // Atualizar estado de sincronização no banco
  await ClientConfigDB.setSyncEnabled(clientId, enabled);

  // Se estiver DESLIGANDO, aciona automaticamente o Pânico Bybit (cancela ordens e encerra posições)
  let panicResult = null;
  if (!enabled) {
    panicResult = await BybitExecutionEngine.panicCloseAll(clientId);
  }

  res.json({
    success: true,
    syncEnabled: enabled,
    message: enabled 
      ? '✅ Sincronização com o Copy Trading ativada com sucesso!' 
      : '🛑 Sincronização desativada. Protocolo de segurança acionado na Bybit.',
    panicResult
  });
});

// POST /api/client/panic — Botão de Pânico explícito
clientRouter.post('/panic', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  // Desliga sincronização
  await ClientConfigDB.setSyncEnabled(clientId, false);

  // Encerra posições e ordens
  const result = await BybitExecutionEngine.panicCloseAll(clientId);

  res.json({
    success: result.success,
    message: `Protocolo de pânico executado: ${result.closedCount} posições encerradas e ${result.cancelledCount} ordens canceladas.`,
    details: result
  });
});

// GET /api/client/positions
clientRouter.get('/positions', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });
  const positions = await BybitExecutionEngine.getOpenPositions(clientId);
  res.json(positions);
});

// GET /api/client/history
clientRouter.get('/history', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const { limit = 100, source = 'local' } = req.query;

  if (source === 'bybit') {
    const trades = await BybitExecutionEngine.getBybitTradeHistory(clientId);
    return res.json(trades);
  }

  const trades = await TradeHistoryDB.findByClientId(clientId, Number(limit));
  res.json(trades);
});

// GET /api/client/history/download — Planilha Excel (.xls) ou CSV
clientRouter.get('/history/download', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const { format = 'excel' } = req.query;
  const trades = await TradeHistoryDB.findByClientId(clientId, 10000);
  const formatDate = (ts: number | null) => ts ? new Date(ts).toLocaleString('pt-BR') : '';

  if (format === 'excel' || format === 'xlsx') {
    const tableRows = trades.map(t => `
      <tr>
        <td style="text-align: left; font-weight: bold;">${t.symbol}</td>
        <td style="text-align: center; color: ${t.side === 'BUY' ? '#10b981' : '#f43f5e'}; font-weight: bold;">${t.side}</td>
        <td style="text-align: right;">$${Number(t.entry_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${t.close_price ? '$' + Number(t.close_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
        <td style="text-align: right;">${t.qty}</td>
        <td style="text-align: right;">$${Number(t.notional_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-weight: bold; color: ${(t.pnl_usd ?? 0) >= 0 ? '#10b981' : '#f43f5e'};">${t.pnl_usd != null ? (t.pnl_usd >= 0 ? '+' : '') + '$' + Number(t.pnl_usd).toFixed(2) : '—'}</td>
        <td style="text-align: center;">${t.leverage ? t.leverage + 'x' : '—'}</td>
        <td style="text-align: center;">${t.status}</td>
        <td style="text-align: left;">${t.signal_reason || 'Manual / Estratégia Quant'}</td>
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
        <h2 style="font-family: Arial; color: #312e81;">MarketFlow Pro — Relatório de Operações</h2>
        <p style="font-family: Arial; font-size: 10pt; color: #64748b;">Cliente: <b>${clientId}</b> | Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
        <table border="1">
          <thead>
            <tr>
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
    res.setHeader('Content-Disposition', `attachment; filename="historico-trades-${clientId}-${Date.now()}.xls"`);
    return res.send(excelHtml);
  }

  // Fallback CSV
  const headers = ['id', 'symbol', 'side', 'entry_price', 'close_price', 'qty', 'notional_usd', 'pnl_usd', 'leverage', 'status', 'signal_reason', 'entry_time', 'close_time'];
  const csvRows = [
    headers.join(','),
    ...trades.map(t => [
      t.id, t.symbol, t.side, t.entry_price, t.close_price ?? '', t.qty,
      t.notional_usd, t.pnl_usd ?? '', t.leverage ?? '', t.status,
      `"${t.signal_reason ?? ''}"`, formatDate(t.entry_time), formatDate(t.close_time)
    ].join(','))
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="meu-historico-${clientId}-${Date.now()}.csv"`);
  res.send('\uFEFF' + csvRows.join('\n'));
});

// POST /api/client/risk
clientRouter.post('/risk', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const { riskPct, leverage, maxDailyLossUsd, maxDailyProfitUsd, fixedLotUsd } = req.body;

  if (riskPct !== undefined && (riskPct < 0.1 || riskPct > 5)) {
    return res.status(400).json({ error: 'Risk% deve ser entre 0.1% e 5%.' });
  }
  if (leverage !== undefined && (leverage < 1 || leverage > 50)) {
    return res.status(400).json({ error: 'Alavancagem deve ser entre 1x e 50x.' });
  }

  await ClientConfigDB.updateRiskConfig(clientId, { riskPct, leverage, maxDailyLossUsd, maxDailyProfitUsd, fixedLotUsd });

  const updated = await ClientConfigDB.findByClientId(clientId);
  res.json({
    success: true,
    config: {
      riskPct: Number(updated?.risk_pct),
      leverage: Number(updated?.leverage),
      maxDailyLossUsd: Number(updated?.max_daily_loss_usd),
      maxDailyProfitUsd: Number(updated?.max_daily_profit_usd)
    }
  });
});

