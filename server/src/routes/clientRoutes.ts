import { Router, Request, Response } from 'express';
import { requireClient } from '../auth/authMiddleware.js';
import { UserDB, ClientConfigDB, TradeHistoryDB } from '../database/db.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { BybitExecutionEngine } from '../engine/bybitExecutionEngine.js';
import { sanitizeCsvField, escapeHtml } from '../utils/sanitizer.js';

export const clientRouter = Router();
clientRouter.use(requireClient);

async function resolveClientId(req: Request): Promise<string | null> {
  if (req.user?.role === 'ADMIN') {
    return (req.params.clientId || req.query.clientId) as string || null;
  }
  if (req.user?.clientId) return req.user.clientId;
  if (req.user?.userId) {
    const user = await UserDB.findById(req.user.userId);
    if (user?.client_id) return user.client_id;
    const cfg = await ClientConfigDB.findByUserId(req.user.userId);
    if (cfg?.client_id) return cfg.client_id;
  }
  return null;
}

// POST /api/client/api-keys
clientRouter.post('/api-keys', async (req: Request, res: Response) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado no token.' });

  const { apiKey, apiSecret, testnet = true } = req.body;
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'apiKey e apiSecret são obrigatórios.' });
  }
  if (apiKey.length < 10 || apiSecret.length < 10) {
    return res.status(400).json({ error: 'Chaves inválidas — verifique se copiou corretamente da Bybit.' });
  }

  try {
    // Garantir que a linha em client_configs exista para este clientId
    let config = await ClientConfigDB.findByClientId(clientId);
    if (!config) {
      const user = req.user?.userId ? await UserDB.findById(req.user.userId) : null;
      const userId = user?.id || req.user?.userId || clientId;
      await ClientConfigDB.create({
        clientId,
        userId,
        name: user?.name || req.user?.name || 'Cliente',
        notificationPhone: user?.whatsapp || undefined,
        planType: 'VITRINE',
        planActive: true,
        syncEnabled: false
      });
    }

    const encKey = encrypt(apiKey.trim());
    const encSecret = encrypt(apiSecret.trim());
    await ClientConfigDB.updateApiKeys(clientId, encKey, encSecret, testnet);
    
    // Tenta validar a conexão imediatamente
    const result = await BybitExecutionEngine.connectAndValidate(clientId);
    
    res.json({
      success: true,
      validated: result.success,
      message: result.success 
        ? 'Chaves da Bybit salvas e validadas com sucesso!' 
        : 'Chaves salvas com criptografia AES-256. ' + (result.error || 'Aguardando validação com a Bybit.'),
      testnet,
      maskedKey: result.maskedKey || `${apiKey.trim().substring(0, 5)}...`,
      warning: result.success ? null : result.error
    });
  } catch (err: any) {
    console.error('[API-Keys] Erro ao salvar chaves:', err);
    res.status(500).json({ error: `Erro interno ao salvar chaves: ${err.message}` });
  }
});

// DELETE /api/client/api-keys — Excluir chaves cadastradas (Geral, REAL ou TESTNET)
clientRouter.delete('/api-keys', async (req: Request, res: Response) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado no token.' });

  const env = (req.query.env || req.body?.env) as 'REAL' | 'TESTNET' | undefined;

  try {
    await ClientConfigDB.deleteApiKeys(clientId, env);
    res.json({ success: true, message: `Chaves da Bybit ${env ? `(${env})` : ''} removidas com sucesso.` });
  } catch (err: any) {
    res.status(500).json({ error: `Erro ao remover chaves: ${err.message}` });
  }
});

// POST /api/client/api-keys/test — Testar conexão sob demanda por ambiente
clientRouter.post('/api-keys/test', async (req: Request, res: Response) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const env = (req.body?.env || req.query.env) as 'REAL' | 'TESTNET' | undefined;

  const result = await BybitExecutionEngine.connectAndValidate(clientId, env);
  if (result.success) {
    res.json({
      success: true,
      message: `✅ Conexão com Bybit ${env ? `(${env})` : ''} estabelecida com sucesso!`,
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
  const clientId = await resolveClientId(req);
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

  const now = Date.now();
  const expiresAt = config.plan_expires_at ? Number(config.plan_expires_at) : null;
  const isExpired = expiresAt !== null && expiresAt < now;
  const isVitalicio = config.plan_type === 'VITALICIO';
  const isVitrine = config.plan_type === 'VITRINE';
  const isPlanActive = Number(config.plan_active) === 1 && Number(config.is_active) === 1 && !isExpired && !isVitrine;
  const realKeyEnc = (config as any).bybit_real_api_key_enc || (!config.bybit_testnet ? config.bybit_api_key_enc : null);
  const testKeyEnc = (config as any).bybit_test_api_key_enc || (config.bybit_testnet ? config.bybit_api_key_enc : null);

  const realConnected = (config as any).bybit_real_connected !== undefined 
    ? Number((config as any).bybit_real_connected) === 1 
    : (!config.bybit_testnet && Number(config.api_connected) === 1);

  const testConnected = (config as any).bybit_test_connected !== undefined 
    ? Number((config as any).bybit_test_connected) === 1 
    : (!!config.bybit_testnet && Number(config.api_connected) === 1);

  res.json({
    clientId,
    balance: bybitAccount?.walletBalance ?? Number(config.balance),
    availableBalance: bybitAccount?.availableBalance ?? Number(config.balance),
    equity: bybitAccount?.equity ?? Number(config.balance),
    unrealisedPnl: bybitAccount?.unrealisedPnl ?? 0,
    fundingUsdt: bybitAccount?.fundingUsdt ?? 0,
    fundingBrl: bybitAccount?.fundingBrl ?? 0,
    riskPct: Number(config.risk_pct),
    leverage: Number(config.leverage),
    maxDailyLossUsd: Number(config.max_daily_loss_usd),
    maxDailyProfitUsd: Number(config.max_daily_profit_usd),
    maxOpenPositions: Number(config.max_open_positions),
    isActive: Number(config.is_active) === 1,
    planActive: isPlanActive,
    isVitalicio,
    isVitrine,
    isExpired,
    syncEnabled: Number(config.sync_enabled) === 1,
    apiConnected: Number(config.api_connected) === 1,
    bybitTestnet: Number(config.bybit_testnet) === 1,
    hasApiKeys: !!(config.bybit_api_key_enc || realKeyEnc || testKeyEnc),
    maskedKey: config.bybit_api_key_enc ? `${decrypt(config.bybit_api_key_enc).substring(0, 5)}...` : null,
    hasRealKeys: !!realKeyEnc,
    realMaskedKey: realKeyEnc ? `${decrypt(realKeyEnc).substring(0, 5)}...` : null,
    realConnected,
    hasTestKeys: !!testKeyEnc,
    testMaskedKey: testKeyEnc ? `${decrypt(testKeyEnc).substring(0, 5)}...` : null,
    testConnected,
    autoConfigEnabled: (config as any).auto_config_enabled !== undefined ? Number((config as any).auto_config_enabled) === 1 : true,
    notificationPhone: config.notification_phone,
    planType: config.plan_type || 'ACTIVE',
    planExpiresAt: expiresAt
  });
});

// POST /api/client/account/refresh — Força sincronização imediata do saldo com a Bybit
clientRouter.post('/account/refresh', async (req: Request, res: Response) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const config = await ClientConfigDB.findByClientId(clientId);
  if (!config) return res.status(404).json({ error: 'Configuração não encontrada.' });

  try {
    const bybitAccount = await BybitExecutionEngine.getAccountBalance(clientId);
    if (bybitAccount) {
      await ClientConfigDB.updateBalance(clientId, bybitAccount.walletBalance);

      // Se configuração automática estiver ligada, calibra conforme o padrão institucional do projeto (execução contínua 30 dias)
      const isAuto = (config as any).auto_config_enabled !== undefined ? Number((config as any).auto_config_enabled) === 1 : true;
      if (isAuto) {
        // Padrão Institucional: Risco técnico de 1.0% por trade, Alavancagem isolada 10x, e 0 em stops diários arbitrários (robô ativo 30 dias)
        await ClientConfigDB.updateRiskConfig(clientId, {
          riskPct: 1.0,
          leverage: 10,
          maxDailyLossUsd: 0,
          maxDailyProfitUsd: 0,
          autoConfigEnabled: true
        });
      }

      return res.json({
        success: true,
        message: '✅ Saldo e proteções atualizados com sucesso da Bybit!',
        balance: bybitAccount.walletBalance,
        availableBalance: bybitAccount.availableBalance,
        equity: bybitAccount.equity,
        fundingUsdt: bybitAccount.fundingUsdt ?? 0,
        fundingBrl: bybitAccount.fundingBrl ?? 0
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Não foi possível buscar o saldo da Bybit. Verifique a chave ou o status da conexão.'
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao sincronizar saldo: ${err.message}` });
  }
});

// POST /api/client/account/transfer-funding — Move fundos de Financiamento para Conta Unificada
clientRouter.post('/account/transfer-funding', async (req: Request, res: Response) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const { coin = 'USDT' } = req.body;
  try {
    const result = await BybitExecutionEngine.transferFundingToUnified(clientId, coin);
    if (result.success) {
      const bybitAccount = await BybitExecutionEngine.getAccountBalance(clientId);
      return res.json({
        success: true,
        message: result.message,
        transferredAmount: result.transferredAmount,
        account: bybitAccount
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao realizar transferência interna: ${err.message}` });
  }
});


// POST /api/client/sync-toggle — Ligar ou Desligar Sincronização (com Pânico ao Desligar)
clientRouter.post('/sync-toggle', async (req: Request, res: Response) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Campo enabled (boolean) é obrigatório.' });
  }

  const config = await ClientConfigDB.findByClientId(clientId);
  if (!config) return res.status(404).json({ error: 'Configuração do cliente não encontrada.' });

  if (enabled) {
    const isVitrine = config.plan_type === 'VITRINE' || Number(config.plan_active) === 0;
    const now = Date.now();
    const isExpired = config.plan_expires_at ? Number(config.plan_expires_at) < now : false;
    if (isVitrine || isExpired || Number(config.is_active) === 0) {
      return res.status(403).json({ 
        error: 'Sua conta está em Modo Vitrine ou com plano inativo. Entre em contato com o administrador para ativar seu plano e liberar a sincronização de ordens.' 
      });
    }
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
  const clientId = await resolveClientId(req);
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
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });
  const positions = await BybitExecutionEngine.getOpenPositions(clientId);
  res.json(positions);
});

// GET /api/client/history
clientRouter.get('/history', async (req: Request, res: Response) => {
  const clientId = await resolveClientId(req);
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
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const { format = 'excel' } = req.query;
  const trades = await TradeHistoryDB.findByClientId(clientId, 10000);
  const formatDate = (ts: number | null) => ts ? new Date(ts).toLocaleString('pt-BR') : '';

  if (format === 'excel' || format === 'xlsx') {
    const tableRows = trades.map(t => `
      <tr>
        <td style="text-align: left; font-weight: bold;">${escapeHtml(t.symbol)}</td>
        <td style="text-align: center; color: ${t.side === 'BUY' ? '#10b981' : '#f43f5e'}; font-weight: bold;">${escapeHtml(t.side)}</td>
        <td style="text-align: right;">$${Number(t.entry_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${t.close_price ? '$' + Number(t.close_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
        <td style="text-align: right;">${t.qty}</td>
        <td style="text-align: right;">$${Number(t.notional_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-weight: bold; color: ${(t.pnl_usd ?? 0) >= 0 ? '#10b981' : '#f43f5e'};">${t.pnl_usd != null ? (t.pnl_usd >= 0 ? '+' : '') + '$' + Number(t.pnl_usd).toFixed(2) : '—'}</td>
        <td style="text-align: center;">${t.leverage ? t.leverage + 'x' : '—'}</td>
        <td style="text-align: center;">${escapeHtml(t.status)}</td>
        <td style="text-align: left;">${escapeHtml(t.signal_reason || 'Manual / Estratégia Quant')}</td>
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
        <p style="font-family: Arial; font-size: 10pt; color: #64748b;">Cliente: <b>${escapeHtml(clientId)}</b> | Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
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

  // Fallback CSV com sanitização contra CSV Injection
  const headers = ['id', 'symbol', 'side', 'entry_price', 'close_price', 'qty', 'notional_usd', 'pnl_usd', 'leverage', 'status', 'signal_reason', 'entry_time', 'close_time'];
  const csvRows = [
    headers.join(','),
    ...trades.map(t => [
      sanitizeCsvField(t.id),
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
  res.setHeader('Content-Disposition', `attachment; filename="meu-historico-${clientId}-${Date.now()}.csv"`);
  res.send('\uFEFF' + csvRows.join('\n'));
});

// POST /api/client/risk
clientRouter.post('/risk', async (req: Request, res: Response) => {
  const clientId = await resolveClientId(req);
  if (!clientId) return res.status(400).json({ error: 'clientId não encontrado.' });

  const { riskPct, leverage, maxDailyLossUsd, maxDailyProfitUsd, fixedLotUsd, autoConfigEnabled } = req.body;

  if (riskPct !== undefined && (riskPct < 0.1 || riskPct > 5)) {
    return res.status(400).json({ error: 'Risk% deve ser entre 0.1% e 5%.' });
  }
  if (leverage !== undefined && (leverage < 1 || leverage > 50)) {
    return res.status(400).json({ error: 'Alavancagem deve ser entre 1x e 50x.' });
  }

  await ClientConfigDB.updateRiskConfig(clientId, { riskPct, leverage, maxDailyLossUsd, maxDailyProfitUsd, fixedLotUsd, autoConfigEnabled });

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

