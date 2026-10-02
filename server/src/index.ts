import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { FlowEngine } from './engine/flowEngine.js';
import { MarketDataManager } from './engine/marketDataManager.js';
import { PaperTradingEngine, MirrorTradingEngine, validateOrderExecution } from './engine/paperTradingEngine.js';
import { PairPerformanceTracker } from './engine/pairPerformanceTracker.js';
import { AutoPairSelectorEngine, DynamicPairStatus } from './engine/autoPairSelectorEngine.js';
import { AIAdvisorEngine } from './engine/aiAdvisorEngine.js';
import { QuantStrategyEngine } from './engine/quantStrategyEngine.js';
import { ClientCopyTraderEngine } from './engine/clientCopyTraderEngine.js';
import { AutonomousPairScanner } from './engine/autonomousPairScanner.js';
import { ClientProtectionEngine } from './engine/clientProtectionEngine.js';
import { FlowSignal, OrderBookData, CandleData } from '../../shared/types.js';
import { ClientAccountConfig } from '../../shared/clientTypes.js';
import { GoogleSheetsService } from './services/googleSheetsService.js';
import { runShadowAudit, recordShadowOutcome, clearShadowAudits, getShadowOpportunities, recordShadowOpportunity, hydrateShadowOpportunities, registerPendingAuditsFromPositions } from './engine/shadowAuditor.js';
import { RISK_CONFIG } from './config/riskConfig.js';
import { calculateProfileStopLoss, evaluateCryptoOpportunity } from './engine/cryptoStrategyDecision.js';
import { calculateAdaptiveRisk } from './engine/adaptiveRisk.js';
import { getCryptoStrategyProfile } from './engine/cryptoStrategyProfile.js';
import { marketGovernanceService } from './services/marketGovernanceService.js';
import { macroSentinelClient } from './services/macroSentinelService.js';
// SaaS: Autenticação e Rotas
import { authRouter } from './auth/authRoutes.js';
import { adminRouter, bindMasterControlHandler } from './routes/adminRoutes.js';
import { clientRouter } from './routes/clientRoutes.js';
import { dashboardRouter } from './routes/dashboardRoutes.js';
import { requireAuth, requireAdmin, verifyToken } from './auth/authMiddleware.js';
import { initDatabase, UserDB, ClientConfigDB, query } from './database/db.js';
import { initPaperTables, hydrateMasterAccount, persistMasterBalance, upsertMasterOrder, hydrateMirrorAccount, persistMirrorBalance, upsertMirrorOrder, resetTradingAccounts, getMinLot } from './database/paperStorage.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const PORT = Number(process.env.PORT) || 4000;
const app = express();

// --- CONFIGURAÇÃO MANDATÓRIA PARA PROXY REVERSO RAILWAY ---
// Permite que express-rate-limit leia X-Forwarded-For do proxy de borda com segurança
app.set('trust proxy', 1);

// ─── Segurança Enterprise ──────────────────────────────────────────────────

// Helmet: headers de segurança HTTP
app.use(helmet({
  contentSecurityPolicy: false, // Desabilitado para permitir o SPA React + charts
  crossOriginEmbedderPolicy: false
}));

// CORS: restringir origem em produção
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:4000', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir sem origin (Postman, Railway internal, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    callback(new Error(`Origem não autorizada: ${origin}`));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Rate Limiting Global: limite estendido e bypass para telemetria/admin
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Isenta polling de governança, saúde operacional e telemetria interna
    return req.path.startsWith('/api/admin/laya') ||
           req.path.startsWith('/api/dashboard') ||
           req.path.startsWith('/api/health');
  },
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' }
});
app.use(globalLimiter);

// Rate Limiting específico para login: max 10 tentativas/15min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' }
});
app.use('/api/auth/login', authLimiter);

// ─── Servir Frontend ───────────────────────────────────────────────────────
const distPath = path.join(rootDir, 'web/dist');

// ─── Servidor HTTP + WebSocket ────────────────────────────────────────────
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.NODE_ENV !== 'production' ? '*' : allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// ─── Montar Rotas SaaS & Dashboard v3.0 ──────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/client', clientRouter);
app.use('/api/dashboard', dashboardRouter);

// Diagnóstico da Laya permanece exclusivamente em /api/admin/laya/*, protegido por requireAdmin.


// --- SERVIÇO DE ARQUIVOS ESTÁTICOS (VITE BUILD) ---
app.use(express.static(distPath));

// Fallback para SPA React (posicionado estritamente após todas as rotas de API)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Interface Web em compilação ou arquivo index.html não localizado.');
    }
  });
});

// ─── Broadcast Helper ─────────────────────────────────────────────────────
const broadcast = (event: string, data: any) => {
  io.emit(event, data);
};


// ─── Engines de Trading ───────────────────────────────────────────────────

const clientCopyTrader = new ClientCopyTraderEngine((log) => {
  io.to('admin_room').emit('client_trade_log', log);
  if (log.clientId) {
    io.to(`client_${log.clientId}`).emit('client_trade_log', log);
  }
});

let lastMasterTickEmit = 0;
let masterShadowFilterActive = false;
const paperTrading = new PaperTradingEngine(async (account, tradeEvent) => {
  if (!tradeEvent) {
    const nowTs = Date.now();
    if (nowTs - lastMasterTickEmit >= 1000) {
      lastMasterTickEmit = nowTs;
      io.emit('paper_account_update', account);
    }
    return;
  }

  io.emit('paper_account_update', account);
  await persistMasterBalance(account);

  // Callback protegido para nunca derrubar o processo em caso de falha de I/O
  const safeUpsert = async (trade: any) => {
    try {
      await upsertMasterOrder(trade);
      console.log('[PaperEngine][PERSIST_OK]', {
        symbol: trade?.symbol,
        status: trade?.status,
        tradeId: trade?.id
      });
    } catch (err) {
      console.error('[PaperTradingEngine] Falha não-fatal ao persistir ordem no PostgreSQL:', err);
      console.error('[PaperEngine][PERSISTENCE_ERROR]', {
        symbol: trade?.symbol,
        status: trade?.status,
        tradeId: trade?.id,
        errorStack: (err as any)?.stack ?? String(err)
      });
    }
  };

  await safeUpsert(tradeEvent);
  if (tradeEvent) {
    io.emit('simulated_trade_event', tradeEvent);
    const pairConfig = AutoPairSelectorEngine.getPairConfig(tradeEvent.symbol);
    const power = tradeEvent.powerMultiplier || pairConfig?.powerMultiplier || 1.5;
    clientCopyTrader.replicateTrade(tradeEvent, power).catch((err) => {
      console.error('[PaperTradingEngine] Erro ao replicar trade nos clientes:', err.message);
    });

    // 📊 Registra as operações do Master Quant na Planilha Google em tempo real
    try {
      let statusStr = 'MASTER_ABERTO';
      let outcomeLabel = 'EM ANDAMENTO ⏳';
      let details = tradeEvent.signalReason || 'Sinal Institucional Identificado';
      let pnlUsd = 0;
      let pnlPct = 0;
      let rMultiple = 0;

      if (tradeEvent.status === 'CLOSED_TP' || tradeEvent.status === 'CLOSED_PARTIAL_TP') {
        const isRunnerExit = tradeEvent.closeReason === 'RUNNER_TRAILING_EXIT';
        const isTrailingExit = tradeEvent.closeReason === 'TRAILING' || isRunnerExit;
        statusStr = isRunnerExit ? 'MASTER_RUNNER_TRAILING' : (isTrailingExit ? 'MASTER_TRAILING' : 'MASTER_WIN (+2.5R)');
        outcomeLabel = 'GREEN 🟢';
        pnlUsd = Number(tradeEvent.pnlUsd ?? 0);
        pnlPct = Number(tradeEvent.pnlPct ?? 0);
        rMultiple = Number(tradeEvent.rMultiple ?? 0);
        details = isRunnerExit
          ? `Runner Mode Trailing executado. P&L: +$${pnlUsd.toFixed(2)} (+${pnlPct.toFixed(2)}%) | R realizado: ${rMultiple.toFixed(1)}R (Alvo estendido)`
          : (isTrailingExit
            ? `Trailing Stop executado. P&L: +$${pnlUsd.toFixed(2)} (+${pnlPct.toFixed(2)}%) | R realizado: ${rMultiple.toFixed(1)}R`
            : `Take Profit fixo atingido. P&L: +$${pnlUsd.toFixed(2)} (+${pnlPct.toFixed(2)}%) | Retorno: +${rMultiple.toFixed(1)}R`);
      } else if (tradeEvent.status === 'CLOSED_SL') {
        const isFlowInvalidation = tradeEvent.closeReason === 'ACTIVE_FLOW_INVALIDATION';
        statusStr = isFlowInvalidation ? 'MASTER_FLOW_INVALIDATION' : 'MASTER_LOSS (-1.0R)';
        outcomeLabel = isFlowInvalidation ? 'FLOW_EXIT 🟡' : 'RED 🔴';
        pnlUsd = Number(tradeEvent.pnlUsd ?? 0);
        pnlPct = Number(tradeEvent.pnlPct ?? 0);
        rMultiple = Number(tradeEvent.rMultiple ?? 0);
        details = isFlowInvalidation
          ? `Invalidação ativa por Order Flow. P&L: -$${Math.abs(pnlUsd).toFixed(2)} (${pnlPct.toFixed(2)}%) | R protegido: ${rMultiple.toFixed(2)}R`
          : `Stop Loss institucional. P&L: -$${Math.abs(pnlUsd).toFixed(2)} (${pnlPct.toFixed(2)}%) | Retorno: ${rMultiple.toFixed(1)}R`;
      }

      const qty = Number(tradeEvent.qty ?? 0);

      GoogleSheetsService.logTradeExecution({
        clientName: '👑 Master Quant (Estratégia)',
        symbol: tradeEvent.symbol,
        side: tradeEvent.type,
        entryPrice: tradeEvent.entryPrice,
        qty,
        stopLoss: tradeEvent.stopLoss,
        takeProfit: tradeEvent.takeProfit,
        status: statusStr,
        outcome: outcomeLabel,
        pnlUsd,
        pnlPct,
        rMultiple,
        orderType: (tradeEvent as any).orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
        trailingStopAtivo: (tradeEvent as any).trailingActive ? 'SIM' : 'NÃO',
        feePaid: Number((tradeEvent as any).fee ?? 0),
        tradeId: tradeEvent.id,
        eventKind: tradeEvent.status === 'OPEN' ? 'OPEN' : 'CLOSE',
        masterBalanceAtEntry: Number((tradeEvent as any).masterBalanceAtEntry ?? account.balance),
        masterNotionalUsd: Number((tradeEvent as any).notionalUsd ?? (tradeEvent.entryPrice * qty)),
        masterExposureRatio: Number((tradeEvent as any).masterExposureRatio ?? 0),
        masterMarginUsd: Number((tradeEvent as any).marginUsd ?? 0),
        powerMultiplier: Number(tradeEvent.powerMultiplier ?? 1.5),
        leverage: 10,
        exchangeMinQty: getMinLot(tradeEvent.symbol),
        qtyStep: getMinLot(tradeEvent.symbol),
        shadowFilterActive: masterShadowFilterActive,
        grossR: Number((tradeEvent as any).grossR ?? 0),
        netR: Number((tradeEvent as any).netR ?? 0),
        riskUsd: Number((tradeEvent as any).riskUsd ?? 0),
        riskReasons: (tradeEvent as any).decisionFactors ?? [],
        timestamp: new Date().toISOString(),
        errorMsg: details
      });
    } catch (sheetErr: any) {
      console.error('[GoogleSheets] Erro ao enviar trade do Master:', sheetErr.message);
    }

    // 🛡️ SHADOW AUDIT (MODO FANTASMA): Avaliação silenciosa em segundo plano no Master
    if (tradeEvent.status === 'OPEN') {
      const bookState = marketManager.getSymbolState(tradeEvent.symbol)?.book;
      runShadowAudit(
        null,
        tradeEvent.symbol,
        tradeEvent.type,
        1.0,
        account.openPositions.filter(p => p.symbol !== tradeEvent.symbol),
        bookState ? {
          bids: bookState.bids.map(b => [b.price, b.amount]),
          asks: bookState.asks.map(a => [a.price, a.amount]),
          spread: bookState.spread
        } : undefined
      ).then(auditResult => {
        if (auditResult) {
          io.emit('shadow_audit_event', auditResult);
        }
      }).catch(auditErr => {
        console.error('[ShadowAuditor] Erro no shadow mode do Master:', auditErr.message);
      });
} else if (tradeEvent.status === 'CLOSED_TP' || tradeEvent.status === 'CLOSED_SL' || tradeEvent.status === 'CLOSED_PARTIAL_TP') {
      try {
        const outcome = recordShadowOutcome(
          tradeEvent.symbol,
          tradeEvent.status,
          Number(tradeEvent.pnlUsd ?? 0),
          Number(tradeEvent.realizedR ?? tradeEvent.rMultiple ?? 0),
          Number(tradeEvent.pnlPct ?? Number.NaN)
        );
        if (outcome) {
          io.emit('shadow_audit_outcome', outcome);
        }

        // Persistência imutável no Event Store v2.0 (PostgreSQL)
        const rawCloseReason = tradeEvent.closeReason;
        const exitReason = rawCloseReason === 'LAYA_CLOSE_NOW'
          ? 'LAYA_CLOSE_NOW'
          : rawCloseReason === 'LAYA_EARLY_HARVEST'
            ? 'LAYA_EARLY_HARVEST'
            : rawCloseReason === 'ACTIVE_FLOW_INVALIDATION'
              ? 'ACTIVE_INVALIDATION'
              : rawCloseReason === 'CIRCUIT_BREAKER_EMERGENCY'
                ? 'CIRCUIT_BREAKER_EMERGENCY'
                : tradeEvent.status === 'CLOSED_SL'
                  ? 'STOP_LOSS_FULL'
                  : rawCloseReason === 'RUNNER_TRAILING_EXIT'
                    ? 'RUNNER_TRAILING'
                    : 'WAVE_HARVEST_BREAKEVEN';
        const rGross = Number(tradeEvent.rMultiple ?? 0);
        const isPostHarvest = Boolean((tradeEvent as any).waveHarvestReached || tradeEvent.partialTaken);
        const branchClassification = exitReason === 'LAYA_CLOSE_NOW'
          ? 'B7_LAYA_DEFENSE_EXIT'
          : exitReason === 'LAYA_EARLY_HARVEST'
            ? 'B8_LAYA_EARLY_HARVEST'
            : isPostHarvest
              ? (rGross >= 2.05 ? 'B5_RUNNER_EXTREME' : (rGross >= 1.30 ? 'B4_TARGET_RUNNER' : 'B3_BE_POST_HARVEST'))
              : (exitReason === 'ACTIVE_INVALIDATION' ? 'B2_INVALIDATION' :
                 exitReason === 'CIRCUIT_BREAKER_EMERGENCY' ? 'B6_MACRO_EMERGENCY' :
                 'B1_STOP_FULL');
        const deltaStopBps = tradeEvent.entryPrice && tradeEvent.stopLoss
          ? Math.round((Math.abs(tradeEvent.entryPrice - tradeEvent.stopLoss) / tradeEvent.entryPrice) * 10000)
          : 55;
        const entryEpoch = Number(tradeEvent.entryTime || 0);
        const exitEpoch = Number(tradeEvent.closeTime || 0);
        const entryTs = entryEpoch > 0
          ? new Date(entryEpoch < 1e12 ? entryEpoch * 1000 : entryEpoch)
          : new Date(Date.now() - 60000);
        const exitTs = exitEpoch > 0
          ? new Date(exitEpoch < 1e12 ? exitEpoch * 1000 : exitEpoch)
          : new Date();

        import('./services/eventStoreService.js').then(({ EventStoreService }) => {
          EventStoreService.recordTradeEvent({
            tradeId: tradeEvent.id,
            symbol: tradeEvent.symbol,
            direction: (tradeEvent.type === 'BUY' || (tradeEvent.type as any) === 'LONG') ? 'LONG' : 'SHORT',
            entryDecisionId: tradeEvent.entryDecisionId,
            exitDecisionId: tradeEvent.exitDecisionId,
            entryTs,
            exitTs,
            exitType: exitReason === 'STOP_LOSS_FULL'
              ? 'STOP_FULL'
              : (exitReason === 'ACTIVE_INVALIDATION' || exitReason === 'LAYA_CLOSE_NOW')
                ? 'STOP_EARLY'
                : exitReason === 'LAYA_EARLY_HARVEST'
                  ? 'EARLY_HARVEST'
                  : 'RUNNER',
            riskPlannedR: 1.0,
            rGross,
            rNet: rGross,
            entryPrice: tradeEvent.entryPrice,
            initialStopPrice: tradeEvent.stopLoss,
            initialTargetPrice: tradeEvent.takeProfit,
            deltaStopBps,
            entryType: (tradeEvent as any).orderType === 'LIMIT' ? 'MAKER_POST_ONLY' : 'TAKER_IOC',
            entryFillStatus: (tradeEvent as any).orderType === 'LIMIT' ? 'FILLED_MAKER' : 'FILLED_TAKER_AGGRESSIVE',
            runMode: 'PAPER_MASTER',
            waveHarvestReached: Boolean((tradeEvent as any).waveHarvestReached),
            waveHarvestPrice: (tradeEvent as any).waveHarvestPrice,
            whFillType: Boolean((tradeEvent as any).waveHarvestReached) ? 'MAKER_LIMIT' : 'NOT_APPLICABLE',
            exitPrice: (tradeEvent as any).closePrice ?? tradeEvent.currentPrice,
            exitReason,
            branchClassification,
            accountBalanceUsd: (tradeEvent as any).masterBalanceAtEntry ?? (tradeEvent as any).balanceAtEntry ?? null,
            positionSizeUsd: tradeEvent.notionalUsd ?? 250,
            grossPnlUsd: Number(tradeEvent.pnlUsd ?? 0),
            netPnlUsd: Number(tradeEvent.pnlUsd ?? 0),
            venue: (tradeEvent as any).venue ?? 'BingX',
            governanceMode: marketGovernanceService.getMode()
          });
          setTimeout(() => {
            EventStoreService.isLockoutActive().then((locked) => {
              paperTrading.setDailyLockoutActive(locked);
              if (locked) console.warn('[SystemState] ⛔ Lockout Diário ATIVO (-3.0R UTC). Novas entradas bloqueadas no motor.');
            }).catch((err: any) => {
              console.error('[EventStore][PERSISTENCE_ERROR] isLockoutActive falhou:', err?.message ?? String(err));
            });
          }, 1500);
        }).catch((err: any) => {
          console.error('[EventStore][IMPORT_ERROR] Falha ao carregar eventStoreService:', err?.stack ?? String(err));
        });
      } catch (err: any) {
        console.error('[ShadowAuditor] Erro ao registrar desfecho do trade:', err.message);
      }
    }

    // ─── Replicar no Espelho (Mirror) ────────────────────────────────────────
    if (tradeEvent.status === 'OPEN') {
      const isMaker = (tradeEvent as any).orderType === 'LIMIT' || false;
      const result = mirrorTrading.replicateMasterTrade(tradeEvent, isMaker);
      if (!result.success) {
        console.warn(`[Mirror] Falha ao replicar ${tradeEvent.symbol}: ${result.error}`);
      } else {
        console.log(`[Mirror] ✅ Replicado ${tradeEvent.type} ${tradeEvent.symbol} @ ${tradeEvent.entryPrice}`);
      }
    } else if (tradeEvent.status === 'CLOSED_TP' || tradeEvent.status === 'CLOSED_SL' || tradeEvent.status === 'CLOSED_PARTIAL_TP') {
      const result = mirrorTrading.closePosition(tradeEvent.symbol, tradeEvent.currentPrice, false);
      if (result.success) {
        console.log(`[Mirror] ✅ Fechado ${tradeEvent.symbol} PnL líquido: $${result.pnl?.toFixed(2)}`);
      }
    }
  }
  recalculateAllPairs();
  });

// ─── Mirror Trading Engine (Conta Espelho) ──────────────────────────────────
let lastMirrorTickEmit = 0;
const mirrorTrading = new MirrorTradingEngine(async (account, tradeEvent) => {
  if (!tradeEvent) {
    const nowTs = Date.now();
    if (nowTs - lastMirrorTickEmit >= 1000) {
      lastMirrorTickEmit = nowTs;
      io.emit('mirror_account_update', account);
    }
    return;
  }

  io.emit('mirror_account_update', account);
  await persistMirrorBalance(account);

  // Callback protegido para nunca derrubar o processo em caso de falha de I/O
  const safeUpsertMirror = async (trade: any) => {
    try {
      await upsertMirrorOrder(trade);
    } catch (err) {
      console.error('[MirrorTradingEngine] Falha não-fatal ao persistir ordem espelho no PostgreSQL:', err);
    }
  };

  await safeUpsertMirror(tradeEvent);
});

bindMasterControlHandler({
  setTrailingStopEnabled: (enabled) => {
    paperTrading.setTrailingStopEnabled(enabled);
    mirrorTrading.setTrailingStopEnabled(enabled);
  },
  setShadowFilterActive: (active) => { masterShadowFilterActive = active; }
});

let masterResetCooldownUntil = 0;

const flowEngine = new FlowEngine((signal: FlowSignal) => {
  console.log('[Flow] sinal emitido:', signal.type, signal.symbol);
  io.emit('flow_signal', signal);
  if (Date.now() < masterResetCooldownUntil) {
    const remainingSec = Math.ceil((masterResetCooldownUntil - Date.now()) / 1000);
    console.log(`[Flow] ⏳ Reset recente: aguardando sincronização (${remainingSec}s restantes)...`);
    return;
  }
  const asset = marketManager.getSymbolState(signal.symbol);
  if (!asset) {
    console.warn('[IndexFlow][DROP][467_SYMBOL_STATE_NOT_FOUND]', {
      symbol: signal.symbol,
      type: signal.type
    });
    return;
  }
  void (async () => {
    // CORREÇÃO P0: Parse de WHALE_AGGRESSION side (linha ~469-478)
    let side: 'BUY' | 'SELL' | null = null;
    
    if (signal.type === 'ABSORPTION_BUY') {
      side = 'SELL';
    } else if (signal.type === 'ABSORPTION_SELL') {
      side = 'BUY';
    } else if (signal.type === 'WHALE_AGGRESSION') {
      // Parse baleia: '🐋 Ordem Baleia Executada: BUY de $1426.4k'
      if (signal.message?.includes('BUY')) side = 'BUY';
      else if (signal.message?.includes('SELL')) side = 'SELL';
    } else if (signal.message.includes('Vendedores com')) {
      side = 'SELL';
    } else if (signal.message.includes('Compradores com')) {
      side = 'BUY';
    }
    if (!side) {
      console.warn('[IndexFlow][DROP][478_NO_SIDE_DERIVED]', {
        symbol: signal.symbol,
        type: signal.type,
        message: signal.message
      });
      return;
    }

    const pairConfig = AutoPairSelectorEngine.getPairConfig(signal.symbol);
    const book = asset.book;
    let cooldownActive = paperTrading.isCooldownActive(signal.symbol);
    if (cooldownActive) {
      const sweepEvidence = flowEngine.getRecentLiquiditySweepEvidence(signal.symbol, side);
      const rejectionConfirmed = signal.type === 'ABSORPTION_BUY' || signal.type === 'ABSORPTION_SELL';
      const pardonResult = await marketGovernanceService.requestGovernance({
        stateVersion: 1,
        symbol: signal.symbol,
        intentGroup: 'COOLDOWN_AUDIT',
        intentSubgroup: 'LIQUIDITY_SWEEP_REENTRY',
        side,
        currentPrice: asset.lastPrice,
        requestedAction: 'OVERRIDE_COOLDOWN',
        lastExitMsAgo: Date.now() - (paperTrading.getLastExitTimestamp(signal.symbol) || 0),
        regime: pairConfig?.regime ?? 'TREND',
        signalSource: signal.type,
        evidence: {
          liquiditySweepConfirmed: Boolean(sweepEvidence),
          rejectionConfirmed,
          sweepDirection: sweepEvidence?.direction,
          sweepReferencePrice: sweepEvidence?.referencePrice,
          sweepExtremePrice: sweepEvidence?.extremePrice,
          sweepReclaimPrice: sweepEvidence?.reclaimPrice,
          sweepBreachBps: sweepEvidence?.breachBps,
          sweepConfirmedAt: sweepEvidence?.confirmedAt
        },
        trace: {
          l2DepthTop20: book?.bids?.reduce((s, b) => s + b.amount, 0) || 0,
          imbalanceRatio: book?.imbalanceRatio || 1.0,
          cvdDelta60s: flowEngine.getRecentAggression(signal.symbol)?.whaleCount || 0,
          spoofScore: 0.0,
          betaDivergence: false
        }
      });
      if (pardonResult.executed && (pardonResult.decision.action === 'OVERRIDE_COOLDOWN' || pardonResult.decision.governance?.cooldownOverride)) {
        console.log(`[LAYA OVERRIDE] Cooldown perdoado para ${signal.symbol} | Razão: ${pardonResult.decision.rationaleCode}`);
        cooldownActive = false;
      } else {
        console.log(`[COOLDOWN ATIVO] Aguardando respiro estrutural para ${signal.symbol}`);
      }
    }

    const decision = evaluateCryptoOpportunity({
      symbol: signal.symbol,
      price: asset.lastPrice,
      signalType: signal.type,
      signalSide: side,
      bookTimestamp: book?.timestamp ?? 0,
      now: Date.now(),
      spreadPct: book && asset.lastPrice > 0 ? book.spread / asset.lastPrice : Number.NaN,
      bidAskRatio: book?.imbalanceRatio ?? Number.NaN,
      flowConfirmed: signal.type === 'ABSORPTION_BUY' || signal.type === 'ABSORPTION_SELL',
      regime: pairConfig?.regime ?? 'TREND',
      hasOpenPosition: paperTrading.getAccountState().openPositions.some(position => position.symbol === signal.symbol),
      cooldownActive,
      orderExecutable: true,
      source: book?.source ?? 'LOCAL_FALLBACK'
    });
    const publishOpportunity = () => {
      const shadowOpportunity = recordShadowOpportunity({
        symbol: signal.symbol,
        side,
        mode: masterShadowFilterActive ? 'FILTER' : 'AUDIT',
        approved: decision.approved,
        reasons: decision.reasons,
        source: book?.source ?? 'LOCAL_FALLBACK'
      });
      void query(
        `INSERT INTO shadow_opportunities (id, symbol, side, mode, approved, reasons, source, created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [shadowOpportunity.id, shadowOpportunity.symbol, shadowOpportunity.side, shadowOpportunity.mode, shadowOpportunity.approved ? 1 : 0, JSON.stringify(shadowOpportunity.reasons), shadowOpportunity.source, Date.parse(shadowOpportunity.timestamp)]
      ).catch((error: any) => console.error('[Shadow] Falha não-fatal ao persistir oportunidade:', error.message));
      GoogleSheetsService.logShadowOpportunity(shadowOpportunity);
      io.emit('shadow_opportunity', shadowOpportunity);
      io.emit('strategy_decision', { signalId: signal.id, symbol: signal.symbol, decision });
    };

    if (!decision.approved) {
      console.warn('[IndexFlow][DROP][557_DECISION_NOT_APPROVED]', {
        symbol: signal.symbol,
        type: signal.type,
        side,
        reasons: decision?.reasons,
        score: (decision as any)?.score,
        cooldownActive,
        bookTimestamp: book?.timestamp ?? 0,
        bookAgeMs: book?.timestamp ? Date.now() - book.timestamp : null
      });
      io.emit('strategy_decision', { signalId: signal.id, symbol: signal.symbol, decision });
      return;
    }

    const profile = getCryptoStrategyProfile(signal.symbol);
    const account = paperTrading.getAccountState();
    if (!profile || (book?.source !== 'BINGX' && book?.source !== 'BINANCE' && book?.source !== 'BYBIT')) {
      console.warn('[IndexFlow][DROP][551_BOOK_OR_PROFILE_INVALID]', {
        symbol: signal.symbol,
        hasProfile: !!profile,
        bookSource: book?.source,
        type: signal.type
      });
      return;
    }
    const powerMultiplier = Math.max(paperTrading.getMinTemperature(), pairConfig?.powerMultiplier || 1.5);
    const requestedNotionalUsd = Math.max(100, account.balance * 0.20) * (powerMultiplier / 1.5);
    const existingAggregateRiskUsd = account.openPositions.reduce((sum, position) => {
      if (Number.isFinite(position.riskUsd) && (position.riskUsd || 0) > 0) return sum + (position.riskUsd || 0);
      const notional = position.notionalUsd || 0;
      const stopDistancePct = position.entryPrice > 0 ? Math.abs(position.entryPrice - position.stopLoss) / position.entryPrice : 0;
      return sum + notional * stopDistancePct;
    }, 0);
    const adaptiveRisk = calculateAdaptiveRisk({
      entryPrice: asset.lastPrice,
      side,
      candles: asset.candles,
      structuralStopDistancePct: profile.stopLossPct,
      spreadPct: book.spread / asset.lastPrice,
      slippageBufferPct: profile.slippageBufferPct,
      atrMultiplier: profile.atrMultiplier,
      requestedNotionalUsd,
      accountBalanceUsd: account.balance,
      maxRiskUsd: account.balance * profile.maxRiskPct,
      existingAggregateRiskUsd,
      maxAggregateRiskUsd: account.balance * profile.maxAggregateRiskPct,
      roundTripFeePct: 0.0011
    });
    if (!adaptiveRisk.approved) {
      console.warn('[IndexFlow][DROP][596_ADAPTIVE_RISK_REJECTED]', {
        symbol: signal.symbol,
        type: signal.type,
        side,
        reasons: adaptiveRisk.reasons,
        stopDistancePct: adaptiveRisk.stopDistancePct,
        notionalUsd: adaptiveRisk.notionalUsd,
        riskUsd: adaptiveRisk.riskUsd,
        spreadPct: book.spread / asset.lastPrice,
        requestedNotionalUsd,
        existingAggregateRiskUsd,
        maxAggregateRiskUsd: account.balance * profile.maxAggregateRiskPct
      });
      decision.approved = false;
      decision.reasons.push(...adaptiveRisk.reasons);
      io.emit('strategy_decision', { signalId: signal.id, symbol: signal.symbol, decision });
      return;
    }
    if ((adaptiveRisk.notionalUsd || 0) / asset.lastPrice < getMinLot(signal.symbol)) {
      console.warn('[IndexFlow][DROP][602_MIN_LOT_EXCEEDS_RISK]', {
        symbol: signal.symbol,
        type: signal.type,
        notionalUsd: adaptiveRisk.notionalUsd,
        price: asset.lastPrice,
        computedQty: (adaptiveRisk.notionalUsd || 0) / asset.lastPrice,
        minLot: getMinLot(signal.symbol)
      });
      decision.approved = false;
      decision.reasons.push('LOTE_MINIMO_EXCEDE_RISCO');
      io.emit('strategy_decision', { signalId: signal.id, symbol: signal.symbol, decision });
      return;
    }

    if (masterShadowFilterActive) {
      const audit = await runShadowAudit(null, signal.symbol, side, 1.0, paperTrading.getAccountState().openPositions, asset.book);
      const auditDecision = String(audit?.newMode || '').toUpperCase();
      if (auditDecision.indexOf('BLOQUEADO') !== -1) {
        console.warn('[IndexFlow][DROP][612_SHADOW_FILTER_BLOCKED]', {
          symbol: signal.symbol,
          type: signal.type,
          side,
          auditDecision,
          masterShadowFilterActive
        });
        decision.approved = false;
        decision.reasons.push('BLOQUEADO_SHADOW_FILTER');
        publishOpportunity();
        return;
      }
    }

    // 🛡️ Trava Anti-Perturbação: Se já existe posição aberta neste par, não perturba a Laya pedindo nova entrada
    const hasOpenPosition = paperTrading.getAccountState().openPositions.some(p => p.symbol === signal.symbol);
    if (hasOpenPosition) {
      console.warn('[IndexFlow][DROP][601_POSITION_ALREADY_OPEN]', {
        symbol: signal.symbol,
        type: signal.type,
        side,
        openPositionSymbols: paperTrading.getAccountState().openPositions.map(p => p.symbol)
      });
      return;
    }

    // 🧠 Governança Laya Sistema 1 (Grupo 1: PRE_ENTRY / NEW_OPPORTUNITY)
    const _imbalance = book?.imbalanceRatio || 1.0;
    const _whaleActivity = flowEngine.getRecentAggression(signal.symbol)?.whaleCount || 0;
    
    // Cálculo seguro do spread real em basis points (bps) do Book L2
    let _spreadBps = 0;
    if (book?.bids?.length && book?.asks?.length && book.bids[0].price > 0) {
      const bestBid = book.bids[0].price;
      const bestAsk = book.asks[0].price;
      _spreadBps = Number((((bestAsk - bestBid) / bestBid) * 10000).toFixed(2));
    }

    let governanceDecision: any = undefined;
    const governanceResult = await marketGovernanceService.requestGovernance({
      stateVersion: 1,
      symbol: signal.symbol,
      intentGroup: 'PRE_ENTRY',
      intentSubgroup: 'NEW_OPPORTUNITY',
      side,
      currentPrice: asset.lastPrice,
      // CORREÇÃO P0.2: Injeção de proposedStopLoss para cálculo correto de delta_stop_bps
      proposedStopLoss: adaptiveRisk?.stopLoss
        || calculateProfileStopLoss(asset.lastPrice, side, profile.stopLossPct),
      requestedAction: 'AUTHORIZE',
      regime: pairConfig?.regime ?? 'TREND',
      signalSource: signal.type,
      risk: {
        accountEquity: account.balance,
        currentRiskAggregatePct: account.balance > 0 ? existingAggregateRiskUsd / account.balance : 0,
        proposedRiskPct: account.balance > 0 ? Number(adaptiveRisk.riskUsd || 0) / account.balance : 0,
        atr14: 0
      },
      trace: {
        l2DepthTop20: book?.bids?.reduce((s, b) => s + b.amount, 0) || 0,
        imbalanceRatio: _imbalance,
        cvdDelta60s: _whaleActivity,
        spreadBps: _spreadBps,
        spoofScore: 0.0,
        betaDivergence: false
      }
    });

    governanceDecision = governanceResult.decision;

    if (marketGovernanceService.getMode() === 'ACTIVE') {
      const explicitlyAuthorized = governanceResult.executed && governanceResult.decision.action === 'AUTHORIZE';
      if (!explicitlyAuthorized) {
        console.warn(`[MARKET GOVERNANCE FAIL-CLOSED] Entrada bloqueada em ${signal.symbol} | action=${governanceResult.decision.action} | reason=${governanceResult.decision.rationaleCode} | error=${governanceResult.error || governanceResult.rejectionReason || 'none'}`);
        decision.approved = false;
        decision.reasons.push(`MARKET_GOVERNANCE_NOT_EXPLICITLY_AUTHORIZED: ${governanceResult.decision.rationaleCode}`);
        publishOpportunity();
        return;
      }
    } else if (governanceResult.decision.action === 'VETO') {
      console.log(`[MARKET GOVERNANCE SHADOW/OFF VETO] ${signal.symbol} | Razão: ${governanceResult.decision.rationaleCode}`);
    }

    // Registra oportunidade e executa com os parâmetros da governança do Mercado; a Laya atua apenas como decisão tática permitida.
    console.log('[IndexFlow][DISPATCHING_TO_ENGINE]', {
      symbol: signal.symbol,
      type: signal.type,
      side,
      decisionApproved: decision?.approved,
      decisionEntrySide: decision?.entrySide,
      adaptiveRiskApproved: adaptiveRisk?.approved,
      marketGovernanceAction: governanceDecision?.action,
      price: asset.lastPrice,
      bookSource: book?.source
    });
    publishOpportunity();
    paperTrading.handleSignal(signal, asset.lastPrice, decision, adaptiveRisk, governanceDecision);
  })();
});

const activePositionCheckMap = new Map<string, number>();

const marketManager = new MarketDataManager(flowEngine, (event, data) => {
  broadcast(event, data);
  if (event === 'trade') {
    const symState = marketManager.getSymbolState(data.symbol);
    const recentAggression = flowEngine.getRecentAggression(data.symbol);
    paperTrading.updatePrice(data.symbol, data.price, symState?.book, recentAggression);
    mirrorTrading.updatePrice(data.symbol, data.price);

    // Governança de posição: regras determinísticas primeiro; Laya tática só atua sobre HOLD neutro.
    const openTrades = paperTrading.getAccountState().openPositions;
    const currentPosition = openTrades.find(p => p.symbol === data.symbol);
    if (currentPosition && marketGovernanceService.getMode() === 'ACTIVE') {
      const now = Date.now();
      const lastCheck = activePositionCheckMap.get(data.symbol) || 0;
      // Throttle de 6 segundos entre avaliações de permanência por símbolo
      if (now - lastCheck > 6000) {
        activePositionCheckMap.set(data.symbol, now);
        void (async () => {
          const isContrarianWhale = recentAggression && recentAggression.whaleCount > 0 &&
            ((currentPosition.type === 'BUY' && recentAggression.dominantSide === 'sell') ||
             (currentPosition.type === 'SELL' && recentAggression.dominantSide === 'buy'));

          const currentR = currentPosition.rMultiple ?? (currentPosition.pnlPct / 1.0);
          const imbalance = symState?.book?.imbalanceRatio ?? 1.0;
          const isRunnerExhaustion = currentR >= 1.2 && (
            (currentPosition.type === 'BUY' && imbalance < 0.30 && recentAggression?.dominantSide === 'sell') ||
            (currentPosition.type === 'SELL' && imbalance > 3.0 && recentAggression?.dominantSide === 'buy')
          );

          // Toda posição é monitorada. Evidências determinísticas continuam soberanas;
          // sem evidência de hard exit, POSITION_MONITOR retorna HOLD local e abre espaço para a Laya tática.
          {
            const requestedAction = isContrarianWhale
              ? 'CLOSE_NOW'
              : isRunnerExhaustion
                ? 'EARLY_HARVEST_CLOSE'
                : 'HOLD';
            const intentSubgroup = isContrarianWhale
              ? 'DEFENSE_CONTRARIAN_FLOW'
              : isRunnerExhaustion
                ? 'RUNNER_EVALUATION'
                : 'POSITION_MONITOR';
            const gov = await marketGovernanceService.requestGovernance({
              stateVersion: 1,
              symbol: data.symbol,
              intentGroup: 'POSITION_LIFECYCLE',
              intentSubgroup,
              side: currentPosition.type,
              currentPrice: data.price,
              currentR,
              proposedStopLoss: currentPosition.stopLoss,
              requestedAction,
              signalSource: intentSubgroup,
              evidence: {
                contrarianFlowConfirmed: Boolean(isContrarianWhale),
                exhaustionConfirmed: Boolean(isRunnerExhaustion)
              },
              trace: {
                l2DepthTop20: symState?.book?.bids?.reduce((s, b) => s + b.amount, 0) || 0,
                imbalanceRatio: symState?.book?.imbalanceRatio || 1.0,
                cvdDelta60s: recentAggression?.whaleCount || 0,
                spreadBps: (() => {
                  const bid = Number(symState?.book?.bids?.[0]?.price || 0);
                  const ask = Number(symState?.book?.asks?.[0]?.price || 0);
                  return bid > 0 && ask > bid ? ((ask - bid) / bid) * 10000 : 0;
                })(),
                holdingSeconds: Math.max(0, Math.floor(Date.now() / 1000) - Number(currentPosition.entryTime || 0)),
                partialTaken: Boolean((currentPosition as any).partialTaken),
                spoofScore: 0.0,
                betaDivergence: isContrarianWhale
              }
            }, { currentR });

            if (gov.executed && (gov.decision.action === 'CLOSE_NOW' || gov.decision.action === 'EARLY_HARVEST_CLOSE')) {
              const tacticalLayaExit = gov.decision.rationaleCode === 'LAYA_TACTICAL_EXIT';
              const closeReason = tacticalLayaExit
                ? 'TACTICAL_LAYA_EXIT'
                : gov.decision.action === 'CLOSE_NOW'
                  ? 'MARKET_CLOSE_NOW'
                  : 'MARKET_EARLY_HARVEST';
              const realClose = await clientCopyTrader.closeRealPositionsBeforeMaster(currentPosition);
              if (!realClose.success) {
                console.error(`[POSITION CLOSE BLOCKED] Não foi possível confirmar o fechamento real de ${data.symbol}. Master permanecerá aberto.`, realClose.errors);
                return;
              }
              currentPosition.exitDecisionId = gov.decision.decisionId;
              console.log(`[POSITION GOVERNANCE] Fechamento real confirmado/ausente para ${data.symbol}; atualizando Master. Motivo: ${closeReason}`);
              paperTrading.closePosition(data.symbol, data.price, false, closeReason);
              mirrorTrading.closePosition(data.symbol, data.price, false, closeReason);
            }
          }
        })();
      }
    }
  }
});
marketManager.startStreaming();

const recalculateAllPairs = () => {
  const summaries = marketManager.getSummaries();
  const account = paperTrading.getAccountState();
  const pairStats = PairPerformanceTracker.calculate(account.history, summaries);

  const booksMap = new Map<string, OrderBookData>();
  for (const asset of summaries) {
    const st = marketManager.getSymbolState(asset.symbol);
    if (st) booksMap.set(asset.symbol, st.book);
  }

  const dynamicPairs = AutoPairSelectorEngine.evaluateAllPairs(summaries, pairStats, booksMap);
  io.emit('pair_stats_update', pairStats);
  io.emit('dynamic_pairs_update', dynamicPairs);
  return { pairStats, dynamicPairs };
};

setInterval(() => {
  recalculateAllPairs();
}, 2000);

// Sincronização periódica da Planilha Google (mantém posições ativas e flutuantes atualizadas a cada 60 segundos)
setInterval(() => {
  const openPos = paperTrading.getAccountState().openPositions;
  if (openPos.length > 0) {
    void GoogleSheetsService.syncOpenPositions(openPos, paperTrading.getAccountState().balance).catch(() => {});
  }
}, 60000);

// ─── REST Endpoints (Trading Terminal) ────────────────────────────────────
// Endpoints públicos de mercado (sem auth, dados públicos)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), service: 'MarketFlow Pro Backend' });
});

app.get('/api/assets', (req, res) => {
  res.json(marketManager.getSummaries());
});

// Endpoints de paper trading (admin apenas — tela do terminal)
app.get('/api/paper-trading', requireAuth, (req, res) => {
  res.json(paperTrading.getAccountState());
});

// ─── Mirror Account Endpoints ────────────────────────────────────────────────
app.get('/api/trading/mirror/account', requireAuth, (req, res) => {
  res.json(mirrorTrading.getAccountState());
});

// POST /api/trading/balance — Ajuste manual de saldo Master com persistência no PostgreSQL
app.post('/api/trading/balance', requireAuth, async (req, res) => {
  try {
    const rawBalance = req.body?.balance;
    const balanceNum = typeof rawBalance === 'number' 
      ? rawBalance 
      : parseFloat(String(rawBalance || '').trim().replace(/\./g, '').replace(',', '.'));

    if (isNaN(balanceNum) || balanceNum <= 0) {
      return res.status(400).json({ success: false, error: 'Saldo inválido. Informe um valor numérico positivo.' });
    }

    // 1. Atualiza a banca no engine em memória
    paperTrading.setInitialBalance(balanceNum);
    const paperState = paperTrading.getAccountState();

    // 2. Persiste imediatamente no PostgreSQL
    await persistMasterBalance(paperState);

    // 3. Emite broadcast para todas as sessões conectadas em tempo real
    io.emit('paper_account_update', paperState);
    io.emit('master_feed_update', { 
      metrics: paperState, 
      masterOpenPositions: paperState.openPositions, 
      masterHistory: paperState.history 
    });

    console.log(`[TradingBalance] 💰 Saldo Master ajustado e persistido no PostgreSQL: $${balanceNum.toFixed(2)}`);

    return res.json({ 
      success: true, 
      balance: paperState.balance, 
      equity: paperState.equity,
      message: `Saldo Master atualizado para $${balanceNum.toFixed(2)}.` 
    });
  } catch (err: any) {
    console.error('[TradingBalance] Erro ao atualizar saldo:', err);
    return res.status(500).json({ success: false, error: 'Falha interna ao persistir saldo.' });
  }
});

// POST /api/trading/reset — Reset parametrizado Master + Mirror
app.post('/api/trading/reset', requireAuth, async (req, res) => {
  try {
    const rawMaster = req.body?.masterBalance;
    const masterBalance = (typeof rawMaster === 'number' && rawMaster > 0) ? rawMaster : 10000;
    const mirrorBalance = Number(req.body?.mirrorBalance || 500);

    // Fechamento automático a mercado de qualquer posição pendente antes do reset
    const masterPositions = paperTrading.getAccountState().openPositions || [];
    for (const pos of masterPositions) {
      paperTrading.closePosition(pos.symbol, pos.currentPrice || pos.entryPrice, false, 'MANUAL');
    }
    const mirrorPositions = mirrorTrading.getAccountState().openPositions || [];
    for (const pos of mirrorPositions) {
      mirrorTrading.closePosition(pos.symbol, pos.currentPrice || pos.entryPrice, false);
    }

    const result = await resetTradingAccounts(Number(masterBalance), Number(mirrorBalance));
    
    // Reset em memória
    paperTrading.resetData(result.masterBalance);
    mirrorTrading.resetData(result.mirrorBalance);
    
    // Zera o Shadow Mode Auditor e histórico de oportunidades
    clearShadowAudits();
    void query('DELETE FROM shadow_opportunities').catch(() => {});
    io.emit('shadow_audit_reset');

    // Zera logs do Copy Trader
    clientCopyTrader.clearLogs();
    io.emit('client_logs_cleared');

    // Zera planilha Google de forma segura
    void GoogleSheetsService.resetSpreadsheet().catch(() => {});

    // Recalcula métricas
    recalculateAllPairs();

    // Inicia período de pausa de 15 segundos para estabilização e sincronização
    masterResetCooldownUntil = Date.now() + 15000;

    const paperState = paperTrading.getAccountState();
    const mirrorState = mirrorTrading.getAccountState();
    io.emit('paper_account_update', paperState);
    io.emit('mirror_account_update', mirrorState);
    io.emit('master_feed_update', { metrics: paperState, masterOpenPositions: [], masterHistory: [] });
    io.emit('trading_reset', { ...result, cooldownSeconds: 15, cooldownUntil: masterResetCooldownUntil });
    
    res.json({ 
      success: true, 
      ...result, 
      cooldownSeconds: 15,
      cooldownUntil: masterResetCooldownUntil,
      message: 'Bancas Master e Mirror resetadas. Aguardando 15s para sincronização total do mercado e clientes.' 
    });
  } catch (err: any) {
    console.error('[TradingReset] Erro:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/pair-performance', requireAuth, (req, res) => {
  const { pairStats, dynamicPairs } = recalculateAllPairs();
  res.json({ pairStats, dynamicPairs });
});

app.get('/api/clients', requireAuth, (req, res) => {
  res.json({
    clients: clientCopyTrader.getClients(),
    logs: clientCopyTrader.getLogs()
  });
});

// Endpoint de Logs do Shadow Mode (Modo Fantasma)
app.get('/api/audit-logs', requireAuth, async (req, res) => {
  try {
    const logFilePath1 = path.resolve(process.cwd(), RISK_CONFIG.LOG_FILE_PATH);
    const logFilePath2 = path.resolve(rootDir, RISK_CONFIG.LOG_FILE_PATH);
    const logPath = fs.existsSync(logFilePath1) ? logFilePath1 : (fs.existsSync(logFilePath2) ? logFilePath2 : null);

    if (logPath) {
      const content = await fs.promises.readFile(logPath, 'utf8');
      if (content.trim()) {
        const lines = content.trim().split('\n');
        const lastLines = lines.slice(-1000).join('\n');
        return res.json({ logs: lastLines, count: lines.length });
      }
    }

    const opps = getShadowOpportunities();
    if (opps.length > 0) {
      const generatedLines = opps.map(item => {
        const decisionLabel = item.approved ? 'PERMITIDO 🟢' : 'BLOQUEADO 🛑';
        const reasonText = item.reasons.length > 0 ? item.reasons.join(' / ') : 'Confluência aprovada';
        return '[' + item.timestamp + '] [SHADOW AUDIT] | Ativo: ' + item.symbol + ' (' + item.side + ') | Modo: ' + item.mode + ' | Modo Novo: ' + decisionLabel + ' | Motivo: ' + reasonText;
      });
      return res.json({ logs: generatedLines.join('\n'), count: generatedLines.length });
    }

    res.json({ logs: 'Aguardando primeiros registros de auditoria em modo fantasma...', count: 0 });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao ler logs de auditoria', message: err.message });
  }
});

// Endpoint de Regime Macro Institucional (Alimentado pelo nexus-macro-sentinel :4005)
app.get('/api/macro-regime', async (req, res) => {
  const prediction = await macroSentinelClient.getMacroPrediction();
  res.json({
    status: 'ONLINE',
    macroSentinel: prediction || {
      regime: 'NEUTRAL_RANGING',
      predictiveScore: 0,
      isCircuitBreakerActive: false,
      confluences: ['Fallback padrão']
    },
    timestamp: new Date().toISOString()
  });
});

// Endpoint do feed em tempo real do Master Quant para a visão do Cliente
app.get('/api/client/master-feed', requireAuth, async (req, res) => {
  const account = paperTrading.getAccountState();
  const summaries = marketManager.getSummaries();
  const logs = clientCopyTrader.getLogs();
  const macroPrediction = await macroSentinelClient.getMacroPrediction();

  const cryptoPairs = summaries.filter(s => s.symbol.includes('USDT')).map(s => ({
    symbol: s.symbol,
    price: s.lastPrice,
    change24h: s.change24h
  }));

  res.json({
    masterOnline: true,
    autonomiaStatus: '100% ATIVA (24/7 Binance Perpétuos - 10x Isolada)',
    macroRegime: macroPrediction?.regime || 'NEUTRAL_RANGING',
    macroScore: macroPrediction?.predictiveScore || 0,
    metrics: {
      winRate: account.winRate,
      totalTrades: account.totalTrades,
      winningTrades: account.winningTrades,
      losingTrades: account.losingTrades,
      realizedPnl: account.realizedPnl,
      openPositionsCount: account.openPositions.length,
      balance: account.balance,
      equity: account.equity
    },
    trackedCryptoPairs: cryptoPairs,
    masterOpenPositions: account.openPositions.map(p => ({
      id: p.id,
      symbol: p.symbol,
      type: p.type,
      entryPrice: p.entryPrice,
      currentPrice: p.currentPrice,
      pnlUsd: p.pnlUsd,
      pnlPct: p.pnlPct,
      rMultiple: p.rMultiple,
      entryTime: p.entryTime,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      signalReason: p.signalReason,
      powerMultiplier: p.powerMultiplier
    })),
    masterHistory: account.history.slice(0, 15).map(h => ({
      id: h.id,
      symbol: h.symbol,
      type: h.type,
      entryPrice: h.entryPrice,
      currentPrice: h.currentPrice,
      pnlUsd: h.pnlUsd,
      pnlPct: h.pnlPct,
      rMultiple: h.rMultiple,
      status: h.status,
      entryTime: h.entryTime,
      closeTime: h.closeTime,
      signalReason: h.signalReason
    })),
    recentLogs: logs.slice(-25).reverse()
  });
});

app.post('/api/clients', requireAuth, (req, res) => {
  const config: ClientAccountConfig = req.body;
  clientCopyTrader.addOrUpdateClient(config);
  io.emit('client_accounts_update', clientCopyTrader.getClients());
  res.json({ status: 'ok', client: config });
});

app.post('/api/pairs/:symbol/toggle', requireAuth, (req, res) => {
  const symbol = decodeURIComponent(String(req.params.symbol));
  const active = req.body.active;
  AutoPairSelectorEngine.toggleManualOverride(symbol, active);
  const { dynamicPairs } = recalculateAllPairs();
  res.json({ status: 'ok', symbol, active, dynamicPairs });
});

app.post('/api/paper-trading/balance', requireAuth, async (req, res) => {
  const rawBalance = req.body?.balance;
  const balanceNum = typeof rawBalance === 'number' 
    ? rawBalance 
    : parseFloat(String(rawBalance || '').trim().replace(/\./g, '').replace(',', '.'));

  if (!isNaN(balanceNum) && balanceNum > 0) {
    paperTrading.setInitialBalance(balanceNum);
    const updated = paperTrading.getAccountState();
    await persistMasterBalance(updated);
    io.emit('paper_account_update', updated);
    io.emit('master_feed_update', { metrics: updated, masterOpenPositions: updated.openPositions, masterHistory: updated.history });
    return res.json({ success: true, balance: updated.balance });
  }
  res.status(400).json({ error: 'Saldo inválido' });
});

app.post('/api/paper-trading/reset', requireAuth, async (req, res) => {
  try {
    const { balance } = req.body;
    const newBalance = typeof balance === 'number' ? balance : 10000;
    
    // 1. Zera a conta Master Quant (saldo, posições abertas, histórico)
    paperTrading.resetData(newBalance);
    const updated = paperTrading.getAccountState();
    io.emit('paper_account_update', updated);
    
    // Persistir reset no banco
    await query(`DELETE FROM paper_master_orders`);
    await query(
      `UPDATE paper_master_account SET balance = $1, equity = $1, realized_pnl = 0, win_rate = 0, total_trades = 0, winning_trades = 0, losing_trades = 0, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE id = $2`,
      [newBalance, 'master-paper-account']
    );

    // 2. Zera o Shadow Mode Auditor (arquivo de log e auditorias pendentes)
    clearShadowAudits();
    void query('DELETE FROM shadow_opportunities').catch(() => {});
    io.emit('shadow_audit_reset');

    // 3. Zera os logs do Copy Trader dos clientes
    clientCopyTrader.clearLogs();
    io.emit('client_logs_cleared');

    // 4. Zera as abas de trades e auditoria na Planilha Google
    void GoogleSheetsService.resetSpreadsheet().catch(() => {});

    // 5. Recalcula métricas e status dos pares
    recalculateAllPairs();

    // 6. Ativa cooldown de 15 segundos para sincronização completa de dados
    masterResetCooldownUntil = Date.now() + 15000;
    io.emit('master_feed_update', { metrics: updated, masterOpenPositions: [], masterHistory: [] });
    io.emit('trading_reset', { masterBalance: newBalance, cooldownSeconds: 15, cooldownUntil: masterResetCooldownUntil });

    res.json({ 
      success: true, 
      message: 'Sessão zerada com sucesso em todas as frentes (Master Quant, Shadow Mode e Planilha Google). Aguardando 15s para sincronização total.', 
      cooldownSeconds: 15,
      cooldownUntil: masterResetCooldownUntil,
      account: updated
    });
  } catch (err: any) {
    console.error('[PaperTrading] Erro ao resetar:', err.message);
    res.status(500).json({ error: 'Erro ao resetar sessão', message: err.message });
  }
});

app.post('/api/paper-trading/pairs', requireAuth, (req, res) => {
  const { pairs } = req.body;
  if (Array.isArray(pairs)) {
    paperTrading.setActivePairs(pairs);
    return res.json({ success: true, activePairs: paperTrading.getActivePairs() });
  }
  res.status(400).json({ error: 'Array de pares inválido' });
});

app.post('/api/paper-trading/temperature', requireAuth, (req, res) => {
  const { temperature } = req.body;
  if (typeof temperature === 'number') {
    paperTrading.setMinTemperature(temperature);
    return res.json({ success: true, temperature: paperTrading.getMinTemperature() });
  }
  res.status(400).json({ error: 'Temperatura inválida' });
});

app.get('/api/autonomous-pairs', requireAuth, (req, res) => {
  res.json(AutonomousPairScanner.getAllPairs());
});

app.post('/api/autonomous-pairs/:symbol/toggle', requireAuth, (req, res) => {
  const symbol = decodeURIComponent(String(req.params.symbol));
  const { active } = req.body;
  const updated = AutonomousPairScanner.togglePairManual(symbol, active);
  io.emit('autonomous_pairs_update', AutonomousPairScanner.getAllPairs());
  res.json(updated);
});

app.get('/api/client-protection', requireAuth, (req, res) => {
  res.json(ClientProtectionEngine.getAllClients());
});

app.post('/api/client-protection', requireAuth, (req, res) => {
  const client = ClientProtectionEngine.addClient(req.body);
  io.emit('client_protection_update', ClientProtectionEngine.getAllClients());
  res.json(client);
});

app.delete('/api/client-protection/:id', requireAuth, (req, res) => {
  const success = ClientProtectionEngine.deleteClient(String(req.params.id));
  io.emit('client_protection_update', ClientProtectionEngine.getAllClients());
  res.json({ success });
});

app.post('/api/client-protection/:id/unlock', requireAuth, (req, res) => {
  const client = ClientProtectionEngine.unlockClient(String(req.params.id));
  io.emit('client_protection_update', ClientProtectionEngine.getAllClients());
  res.json(client);
});

app.post('/api/client-protection/send-alert', requireAuth, async (req, res) => {
  const { phone, clientName, messageType, currentBalance, initialBalance, dailyPnl, reason } = req.body;
  const result = await ClientProtectionEngine.sendWhatsAppAlert({
    phone,
    clientName,
    messageType: messageType || 'SUMMARY',
    currentBalance: Number(currentBalance || 0),
    initialBalance: Number(initialBalance || 0),
    dailyPnl: Number(dailyPnl || 0),
    reason
  });
  res.json(result);
});

app.get('/api/assets/:symbol/pressure', requireAuth, (req, res) => {
  const symbol = decodeURIComponent(String(req.params.symbol));
  const state = marketManager.getSymbolState(symbol);
  if (!state) return res.status(404).json({ error: 'Ativo não encontrado' });

  const book = state.book;
  const totalDepth = book ? (book.bidDepthTotal + book.askDepthTotal) : 1;
  const buyRatio = book ? (book.bidDepthTotal / Math.max(1, totalDepth)) : 0.5;
  const buyPressurePct = Math.round(Math.min(100, Math.max(0, buyRatio * 100)));
  const sellPressurePct = 100 - buyPressurePct;
  const netPressurePct = buyPressurePct - sellPressurePct;

  res.json({
    symbol,
    buyPressurePct,
    sellPressurePct,
    netPressurePct,
    dominantSide: netPressurePct > 10 ? 'BUY' : netPressurePct < -10 ? 'SELL' : 'NEUTRAL',
    imbalanceScore: book ? Number(book.imbalanceRatio.toFixed(2)) : 1.0,
    whaleActivityLevel: Math.abs(netPressurePct) > 40 ? 'EXTREME' : Math.abs(netPressurePct) > 20 ? 'HIGH' : 'MEDIUM'
  });
});

app.get('/api/strategy/health-report', requireAuth, (req, res) => {
  const account = paperTrading.getAccountState();
  const report = QuantStrategyEngine.generateHealthReport(account);
  res.json(report);
});


app.get('/api/shadow-opportunities', requireAuth, async (req, res) => {
  try {
    const rows = await query<{ id: string; symbol: string; side: 'BUY' | 'SELL'; mode: 'AUDIT' | 'FILTER'; approved: number; reasons: string[]; source: string; created_at: number }>(
      'SELECT id, symbol, side, mode, approved, reasons, source, created_at FROM shadow_opportunities ORDER BY created_at DESC LIMIT 500'
    );
    const opportunities = rows.map(row => ({ ...row, approved: Number(row.approved) === 1, timestamp: new Date(Number(row.created_at)).toISOString() }));
    res.json({ opportunities: opportunities.length > 0 ? opportunities : getShadowOpportunities() });
  } catch (error: any) {
    res.json({ opportunities: getShadowOpportunities(), persistence: 'UNAVAILABLE' });
  }
});

app.post('/api/ai-advisor/audit', requireAuth, async (req, res) => {
  const provider = req.body?.provider || process.env.AI_PROVIDER || 'HYBRID_AUTO';
  const account = paperTrading.getAccountState();
  const summaries = marketManager.getSummaries();
  const pairStats = PairPerformanceTracker.calculate(account.history, summaries);
  const recentSignals = flowEngine.getRecentSignals();

  const auditReport = await AIAdvisorEngine.generateAudit(account, pairStats, summaries, recentSignals, provider);
  res.json(auditReport);
});

app.post('/api/ai-advisor/chat', requireAuth, async (req, res) => {
  try {
    const { message, history = [], provider = 'HYBRID_AUTO' } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    const account = paperTrading.getAccountState();
    const summaries = marketManager.getSummaries();
    const pairStats = PairPerformanceTracker.calculate(account.history, summaries);

    const reply = await AIAdvisorEngine.chatWithAdvisor(message, history, account, pairStats, provider);
    res.json({ success: true, reply, timestamp: Date.now() });
  } catch (error: any) {
    console.error('Erro no chat com o consultor IA:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar mensagem com o Consultor IA' });
  }
});

app.get('/api/assets/:symbol/state', (req, res) => {
  const symbol = decodeURIComponent(String(req.params.symbol));
  const state = marketManager.getSymbolState(symbol);
  if (!state) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  const { pairStats, dynamicPairs } = recalculateAllPairs();

  res.json({
    symbol: state.symbol,
    category: state.category,
    lastPrice: state.lastPrice,
    high24h: state.high24h,
    low24h: state.low24h,
    change24h: state.change24h,
    volume24h: state.volume24h,
    cvd: state.cvd,
    candles: state.candles,
    book: state.book,
    trades: state.trades,
    recentSignals: flowEngine.getRecentSignals().filter(s => s.symbol === symbol),
    paperAccount: paperTrading.getAccountState(),
    pairStats,
    dynamicPairs,
    clients: clientCopyTrader.getClients(),
    clientLogs: clientCopyTrader.getLogs()
  });
});

app.get('/api/assets/:symbol/klines', async (req, res) => {
  const symbol = decodeURIComponent(String(req.params.symbol));
  const tf = (req.query.tf as string) || '1m';
  const state = marketManager.getSymbolState(symbol);
  if (!state) {
    return res.status(404).json({ error: 'Ativo não encontrado' });
  }

  const baseCandles = state.candles || [];

  if (tf === '1m' && baseCandles.length > 0) {
    return res.json({ symbol, tf, candles: baseCandles, source: 'BINGX' });
  }

  const direct = await marketManager.getKlines(symbol, tf, 200);
  if (direct && direct.length > 0) {
    return res.json({ symbol, tf, candles: direct, source: 'BINGX' });
  }

  if (tf === '1m' || baseCandles.length === 0) {
    const source = baseCandles.length > 0 ? 'BINGX' : 'LOCAL_FALLBACK';
    return res.json({ symbol, tf, candles: baseCandles, source });
  }

  let minutes = 1;
  if (tf === '3m') minutes = 3;
  else if (tf === '5m') minutes = 5;
  else if (tf === '15m') minutes = 15;
  else if (tf === '1h') minutes = 60;
  else if (tf === '4h') minutes = 240;
  else if (tf === '1D') minutes = 1440;

  const intervalSec = minutes * 60;
  const aggregatedMap = new Map<number, CandleData>();

  for (const c of baseCandles) {
    const bucketTime = Math.floor(c.time / intervalSec) * intervalSec;
    const existing = aggregatedMap.get(bucketTime);
    if (!existing) {
      aggregatedMap.set(bucketTime, {
        time: bucketTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        buyVolume: c.buyVolume,
        sellVolume: c.sellVolume,
        delta: c.delta,
        cvd: c.cvd
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume = Number((existing.volume + c.volume).toFixed(2));
      existing.buyVolume = Number((existing.buyVolume + c.buyVolume).toFixed(2));
      existing.sellVolume = Number((existing.sellVolume + c.sellVolume).toFixed(2));
      existing.delta = Number((existing.delta + c.delta).toFixed(2));
      existing.cvd = c.cvd;
    }
  }

  const aggregatedCandles = Array.from(aggregatedMap.values()).sort((a, b) => a.time - b.time);
  const source = aggregatedCandles.length > 0 ? 'BINGX' : 'LOCAL_FALLBACK';
  res.json({ symbol, tf, candles: aggregatedCandles, source });
});

app.get('/api/signals', requireAuth, (req, res) => {
  res.json(flowEngine.getRecentSignals());
});

// ─── WebSocket Connection Handling ────────────────────────────────────────
io.use((socket, next) => {
  const token = (socket.handshake.auth?.token as string)
    || (socket.handshake.headers?.authorization?.startsWith('Bearer ') ? socket.handshake.headers.authorization.split(' ')[1] : undefined);
  
  if (token) {
    try {
      const payload = verifyToken(token);
      (socket as any).user = payload;
    } catch {
      // Token expirado ou inválido: conecta apenas como convidado de dados de mercado públicos
    }
  }
  next();
});

io.on('connection', (socket) => {
  const user = (socket as any).user;
  const { pairStats, dynamicPairs } = recalculateAllPairs();

  // Enviar estado inicial: dados de mercado sempre; dados de clientes APENAS se for ADMIN autenticado
  socket.emit('initial_state', {
    assets: marketManager.getSummaries(),
    signals: flowEngine.getRecentSignals(),
    paperAccount: paperTrading.getAccountState(),
    mirrorAccount: mirrorTrading.getAccountState(),
    pairStats,
    dynamicPairs,
    clients: user?.role === 'ADMIN' ? clientCopyTrader.getClients() : [],
    clientLogs: user?.role === 'ADMIN' ? clientCopyTrader.getLogs() : []
  });

  // Inscrever em salas específicas por permissão
  if (user?.role === 'ADMIN') {
    socket.join('admin_room');
  } else if (user?.clientId) {
    socket.join(`client_${user.clientId}`);
  }
});

// Inicializar banco de dados ANTES de iniciar o servidor
initDatabase()
  .then(async () => {
    await initPaperTables();
    const masterControls = await ClientConfigDB.findByClientId('master-client');
    if (masterControls) {
      const trailingEnabled = Number(masterControls.trailing_stop_enabled ?? 1) === 1;
      masterShadowFilterActive = Number(masterControls.shadow_filter_active ?? 0) === 1;
      paperTrading.setTrailingStopEnabled(trailingEnabled);
      mirrorTrading.setTrailingStopEnabled(trailingEnabled);
    }
    const masterAccount = await hydrateMasterAccount();
    paperTrading.hydrateFromStorage({
      balance: masterAccount.balance,
      realizedPnl: masterAccount.realizedPnl,
      openPositions: masterAccount.openPositions,
      history: masterAccount.history
    });
    console.log('[PaperTrading] ✅ Banca master hidratada do PostgreSQL:', masterAccount.balance.toFixed(2));

    // Hidratar conta Mirror
    const mirrorAccount = await hydrateMirrorAccount();
    mirrorTrading.hydrateFromStorage({
      balance: mirrorAccount.balance,
      realizedPnl: mirrorAccount.realizedPnl,
      openPositions: mirrorAccount.openPositions,
      history: mirrorAccount.history
    });
    console.log('[MirrorTrading] ✅ Conta espelho hidratada do PostgreSQL:', mirrorAccount.balance.toFixed(2));

    // Hidratar histórico do Shadow Mode a partir do PostgreSQL e registrar pendências ativas
    try {
      const shadowRows = await query<{ id: string; symbol: string; side: 'BUY' | 'SELL'; mode: 'AUDIT' | 'FILTER'; approved: number; reasons: string[]; source: any; created_at: number }>(
        'SELECT id, symbol, side, mode, approved, reasons, source, created_at FROM shadow_opportunities ORDER BY created_at DESC LIMIT 500'
      );
      if (shadowRows.length > 0) {
        hydrateShadowOpportunities(shadowRows.map(r => ({
          id: r.id,
          symbol: r.symbol,
          side: r.side,
          mode: r.mode,
          approved: Number(r.approved) === 1,
          reasons: Array.isArray(r.reasons) ? r.reasons : (typeof r.reasons === 'string' ? JSON.parse(r.reasons) : []),
          source: r.source,
          timestamp: new Date(Number(r.created_at)).toISOString()
        })));
        console.log(`[ShadowAuditor] ✅ ${shadowRows.length} auditorias shadow hidratadas do PostgreSQL`);
      }
      registerPendingAuditsFromPositions(masterAccount.openPositions);
    } catch (shadowHydrateErr: any) {
      console.warn('[ShadowAuditor] Aviso ao hidratar shadow mode do PostgreSQL:', shadowHydrateErr.message);
    }
    
    await marketManager.initialize();

    // Sincronizar preços de mercado imediatamente para as posições abertas restauradas
    for (const pos of masterAccount.openPositions) {
      const liveState = marketManager.getSymbolState(pos.symbol);
      const curPrice = liveState?.lastPrice || (liveState?.candles && liveState.candles.length > 0 ? liveState.candles[liveState.candles.length - 1].close : 0);
      if (curPrice > 0) {
        paperTrading.updatePrice(pos.symbol, curPrice);
        mirrorTrading.updatePrice(pos.symbol, curPrice);
      }
    }
    io.emit('paper_account_update', paperTrading.getAccountState());
    io.emit('mirror_account_update', mirrorTrading.getAccountState());
    
    // Sincroniza posições ativas do Master na Planilha Google
    if (paperTrading.getAccountState().openPositions.length > 0) {
      void GoogleSheetsService.syncOpenPositions(paperTrading.getAccountState().openPositions, masterAccount.balance).catch(() => {});
    }
    
    server.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 MarketFlow Pro SaaS Backend running at http://0.0.0.0:${PORT}`);
      console.log(`🔒 Segurança: JWT + AES-256 + Helmet + Rate Limiting ATIVO`);
      console.log(`🐘 Banco de Dados: PostgreSQL Railway conectado`);
      console.log(`📡 WebSocket Gateway ready on ws://0.0.0.0:${PORT}`);
      
      // CORREÇÃO P0: Inicia heartbeat do Macro Sentinel (cura estagnação de 43h)
      macroSentinelClient.startAutoUpdate();
    });
  })
  .catch((err) => {
    console.error('❌ Falha ao inicializar banco de dados PostgreSQL:', err.message);
    process.exit(1);
  });
