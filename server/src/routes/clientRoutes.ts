import { Router, Request, Response } from 'express';
import { requireClient } from '../auth/authMiddleware.js';
import { ClientConfigDB, TradeHistoryDB } from '../database/db.js';
import { encrypt } from '../utils/crypto.js';
import { BybitExecutionEngine } from '../engine/bybitExecutionEngine.js';

export const clientRouter = Router();
clientRouter.use(requireClient);

// Helper: pega clientId do token OU do param se admin
function getClientId(req: Request): string | null {
  if (req.user?.role === 'ADMIN') {
    return (req.params.clientId || req.query.clientId) as string || null;
  }
  return req.user?.clientId || null;
}

// POST /api/client/api-keys — registrar/atualizar API Keys Bybit
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
    ClientConfigDB.updateApiKeys(clientId, encKey, encSecret, testnet);

    res.json({
      success: true,
      message: 'API Keys salvas com criptografia AES-256. Clique em "Testar Conexão" para validar.',
      testnet
    });
  } catch (err: any) {
    res.status(500).json({ error: `Erro ao salvar chaves: ${err.message}` });
  }
});

// POST /api/client/api-keys/test — testar conectividade com a Bybit
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

// GET /api/client/account — saldo e info da conta real Bybit
clientRouter.get('/account', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const config = ClientConfigDB.findByClientId(clientId);
  if (!config) return res.status(404).json({ error: 'Configuração de cliente não encontrada.' });

  // Buscar dados reais da Bybit se API estiver conectada
  let bybitAccount = null;
  if (config.api_connected === 1 && config.bybit_api_key_enc) {
    bybitAccount = await BybitExecutionEngine.getAccountBalance(clientId);
    if (bybitAccount) {
      ClientConfigDB.updateBalance(clientId, bybitAccount.walletBalance);
    }
  }

  res.json({
    clientId,
    balance: bybitAccount?.walletBalance ?? config.balance,
    availableBalance: bybitAccount?.availableBalance ?? config.balance,
    equity: bybitAccount?.equity ?? config.balance,
    unrealisedPnl: bybitAccount?.unrealisedPnl ?? 0,
    riskPct: config.risk_pct,
    leverage: config.leverage,
    maxDailyLossUsd: config.max_daily_loss_usd,
    maxDailyProfitUsd: config.max_daily_profit_usd,
    maxOpenPositions: config.max_open_positions,
    isActive: config.is_active === 1,
    apiConnected: config.api_connected === 1,
    bybitTestnet: config.bybit_testnet === 1,
    hasApiKeys: !!(config.bybit_api_key_enc),
    notificationPhone: config.notification_phone
  });
});

// GET /api/client/positions — posições abertas reais na Bybit
clientRouter.get('/positions', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const positions = await BybitExecutionEngine.getOpenPositions(clientId);
  res.json(positions);
});

// GET /api/client/history — histórico de trades (local + Bybit)
clientRouter.get('/history', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const { limit = 100, source = 'local' } = req.query;

  if (source === 'bybit') {
    // Buscar diretamente da Bybit
    const trades = await BybitExecutionEngine.getBybitTradeHistory(clientId);
    return res.json(trades);
  }

  // Histórico local (banco SQLite)
  const trades = TradeHistoryDB.findByClientId(clientId, Number(limit));
  res.json(trades);
});

// GET /api/client/history/download — exportar histórico como CSV
clientRouter.get('/history/download', async (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const trades = TradeHistoryDB.findByClientId(clientId, 10000);

  const headers = ['id', 'symbol', 'side', 'entry_price', 'close_price', 'qty', 'notional_usd', 'pnl_usd', 'leverage', 'status', 'signal_reason', 'entry_time', 'close_time'];
  const formatDate = (ts: number | null) => ts ? new Date(ts).toISOString() : '';

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

// POST /api/client/risk — atualizar configuração de risco
clientRouter.post('/risk', (req: Request, res: Response) => {
  const clientId = getClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const { riskPct, leverage, maxDailyLossUsd, maxDailyProfitUsd, fixedLotUsd } = req.body;

  // Validações de segurança
  if (riskPct !== undefined && (riskPct < 0.1 || riskPct > 5)) {
    return res.status(400).json({ error: 'Risk% deve ser entre 0.1% e 5%.' });
  }
  if (leverage !== undefined && (leverage < 1 || leverage > 50)) {
    return res.status(400).json({ error: 'Alavancagem deve ser entre 1x e 50x.' });
  }

  ClientConfigDB.updateRiskConfig(clientId, { riskPct, leverage, maxDailyLossUsd, maxDailyProfitUsd, fixedLotUsd });

  const updated = ClientConfigDB.findByClientId(clientId);
  res.json({
    success: true,
    config: {
      riskPct: updated?.risk_pct,
      leverage: updated?.leverage,
      maxDailyLossUsd: updated?.max_daily_loss_usd,
      maxDailyProfitUsd: updated?.max_daily_profit_usd
    }
  });
});
