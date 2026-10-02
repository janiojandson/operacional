// ==============================================================================
// 📁 server/src/routes/dashboardRoutes.ts
// Rotas Agregadas de Telemetria e 10 Blocos de Saúde Quantitativa (Nexus v3.0)
// ==============================================================================

import { Router, Request, Response } from 'express';
import { query } from '../database/db.js';
import { layaGovernanceService } from '../services/layaGovernanceService.js';

export const dashboardRouter = Router();

// Cache em memória para garantir respostas em < 5ms sem sobrecarregar o PostgreSQL
let cachedOverview: any = null;
let lastOverviewFetch = 0;
const OVERVIEW_CACHE_TTL = 3000; // 3 segundos

let cachedBlocks: any = null;
let lastBlocksFetch = 0;
const BLOCKS_CACHE_TTL = 20000; // 20 segundos

/**
 * GET /api/dashboard/overview
 * Retorna métricas executivas agregadas (Latência, Overrides, Atribuição, Última Decisão)
 */
dashboardRouter.get('/overview', async (_req: Request, res: Response) => {
  const now = Date.now();
  if (cachedOverview && (now - lastOverviewFetch < OVERVIEW_CACHE_TTL)) {
    return res.json(cachedOverview);
  }

  try {
    const status = layaGovernanceService.getStatus();
    const lastDec = status.recentDecisions[0] || null;

    // Resumo de contrafactual no Event Store
    const attrRows = await query<{ delta_r: string; attributed_r: string; counterfactual_r: string }>(`
      SELECT
        COALESCE(SUM(delta_r), 0) AS delta_r,
        COALESCE(SUM(attributed_r), 0) AS attributed_r,
        COALESCE(SUM(counterfactual_r_multiple), 0) AS counterfactual_r
      FROM decision_events
      WHERE COALESCE(issued_at, created_at) >= NOW() - INTERVAL '24 hours'
    `).catch(() => []);

    const deltaR = Number(attrRows[0]?.delta_r ?? status.metrics.counterfactualPnL);
    const attributedR = Number(attrRows[0]?.attributed_r ?? 0);
    const counterfactualR = Number(attrRows[0]?.counterfactual_r ?? 0);

    const payload = {
      layaMode: status.mode,
      latency: {
        p50: status.metrics.latencyP50,
        p95: status.metrics.latencyP95,
        sparkline24h: [status.metrics.latencyP50, status.metrics.latencyP95]
      },
      overrides: {
        used: status.metrics.sessionPardonsUsed,
        ceiling: status.metrics.maxSessionPardons,
        sparkline: [status.metrics.sessionPardonsUsed]
      },
      attribution: {
        deltaR,
        attributedR,
        counterfactualR
      },
      lastDecision: lastDec ? {
        decisionId: lastDec.decisionId,
        decisionType: lastDec.action,
        symbol: lastDec.symbol,
        rationaleCode: lastDec.rationaleCode,
        counterfactual: null
      } : null,
      recentDecisions: status.recentDecisions || [],
      breaker: false,
      drawdownR: 0
    };

    cachedOverview = payload;
    lastOverviewFetch = now;
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: 'Falha ao obter overview do dashboard', details: err.message });
  }
});

/**
 * GET /api/dashboard/blocks
 * Retorna as métricas calculadas dos 10 Blocos de Saúde Quantitativa
 */
dashboardRouter.get('/blocks', async (_req: Request, res: Response) => {
  const now = Date.now();
  if (cachedBlocks && (now - lastBlocksFetch < BLOCKS_CACHE_TTL)) {
    return res.json(cachedBlocks);
  }

  try {
    // Bloco 1 & 2: Expectância e Assimetria a partir de trade_events
    const tradeStats = await query<{
      n: string;
      avg_r: string;
      avg_win: string;
      avg_loss: string;
      avg_mfe: string;
      avg_mae: string;
      gross_win_r: string;
      gross_loss_r: string;
    }>(`
      SELECT
        COUNT(*) AS n,
        COALESCE(AVG(r_multiple_net), 0) AS avg_r,
        COALESCE(AVG(CASE WHEN r_multiple_net > 0 THEN r_multiple_net END), 0) AS avg_win,
        COALESCE(AVG(CASE WHEN r_multiple_net <= 0 THEN r_multiple_net END), 0) AS avg_loss,
        COALESCE(AVG(mfe_r), 0) AS avg_mfe,
        COALESCE(AVG(mae_r), 0) AS avg_mae,
        COALESCE(SUM(CASE WHEN r_multiple_net > 0 THEN r_multiple_net ELSE 0 END), 0) AS gross_win_r,
        ABS(COALESCE(SUM(CASE WHEN r_multiple_net < 0 THEN r_multiple_net ELSE 0 END), 0)) AS gross_loss_r
      FROM trade_events
      WHERE opened_at >= NOW() - INTERVAL '30 days'
    `).catch(() => []);

    let n = Number(tradeStats[0]?.n ?? 0);
    let expectationR = Number(tradeStats[0]?.avg_r ?? 0);
    let avgWin = Number(tradeStats[0]?.avg_win ?? 0);
    let avgLoss = Math.abs(Number(tradeStats[0]?.avg_loss ?? 0));
    let grossWinR = Number(tradeStats[0]?.gross_win_r ?? 0);
    let grossLossR = Number(tradeStats[0]?.gross_loss_r ?? 0);

    // Se trade_events estiver vazio, busca métricas consolidadas de paper_master_orders
    if (n === 0) {
      const masterOrders = await query<{
        n: string;
        avg_r: string;
        avg_win: string;
        avg_loss: string;
        gross_win_r: string;
        gross_loss_r: string;
      }>(`
        SELECT
          COUNT(*) AS n,
          COALESCE(AVG(r_multiple), 0) AS avg_r,
          COALESCE(AVG(CASE WHEN COALESCE(total_net_pnl, net_pnl, pnl_usd) > 0 THEN r_multiple END), 0) AS avg_win,
          COALESCE(AVG(CASE WHEN COALESCE(total_net_pnl, net_pnl, pnl_usd) <= 0 THEN r_multiple END), 0) AS avg_loss,
          COALESCE(SUM(CASE WHEN COALESCE(total_net_pnl, net_pnl, pnl_usd) > 0 THEN r_multiple ELSE 0 END), 0) AS gross_win_r,
          ABS(COALESCE(SUM(CASE WHEN COALESCE(total_net_pnl, net_pnl, pnl_usd) < 0 THEN r_multiple ELSE 0 END), 0)) AS gross_loss_r
        FROM paper_master_orders
        WHERE status != 'OPEN'
      `).catch(() => []);

      n = Number(masterOrders[0]?.n ?? 0);
      expectationR = Number(masterOrders[0]?.avg_r ?? 0);
      avgWin = Number(masterOrders[0]?.avg_win ?? 0);
      avgLoss = Math.abs(Number(masterOrders[0]?.avg_loss ?? 0));
      grossWinR = Number(masterOrders[0]?.gross_win_r ?? 0);
      grossLossR = Number(masterOrders[0]?.gross_loss_r ?? 0);
    }

    const asymmetry = avgLoss > 0 ? (avgWin / avgLoss) : 0;
    const profitFactor = grossLossR > 0 ? grossWinR / grossLossR : (grossWinR > 0 ? Number.POSITIVE_INFINITY : 0);

    // Bloco 8: Atribuição Laya
    const attrStats = await query<{ delta_r: string; hit_rate: string }>(`
      SELECT
        COALESCE(SUM(delta_r), 0) AS delta_r,
        COALESCE(AVG(CASE WHEN delta_r > 0 THEN 1.0 ELSE 0.0 END), 0) * 100 AS hit_rate
      FROM decision_events
      WHERE issued_at >= NOW() - INTERVAL '30 days'
        AND delta_r IS NOT NULL
    `).catch(() => []);

    const deltaR = Number(attrStats[0]?.delta_r ?? 0);
    const hitRate = Number(attrStats[0]?.hit_rate ?? 0);

    const exposureRows = await query<{ balance: string; open_notional: string; open_count: string }>(`
      SELECT
        COALESCE((SELECT balance FROM paper_master_account WHERE id = 'master-001'), 0) AS balance,
        COALESCE(SUM(notional_usd) FILTER (WHERE status = 'OPEN'), 0) AS open_notional,
        COUNT(*) FILTER (WHERE status = 'OPEN') AS open_count
      FROM paper_master_orders
    `).catch(() => []);
    const balance = Number(exposureRows[0]?.balance ?? 0);
    const openNotional = Number(exposureRows[0]?.open_notional ?? 0);
    const openCount = Number(exposureRows[0]?.open_count ?? 0);
    const grossExposure = balance > 0 ? openNotional / balance : 0;

    const topPairsRows = await query<{ pair: string; n: string; avg_r: string }>(`
      SELECT pair, COUNT(*) AS n, COALESCE(AVG(r_multiple_net), 0) AS avg_r
      FROM trade_events
      WHERE opened_at >= NOW() - INTERVAL '30 days'
      GROUP BY pair
      ORDER BY COUNT(*) DESC, AVG(r_multiple_net) DESC
      LIMIT 2
    `).catch(() => []);
    const topPairsLabel = topPairsRows.length > 0
      ? topPairsRows.map(row => row.pair.replace('/USDT', '')).join('/')
      : 'N/D';

    const blocks = [
      {
        id: 1,
        name: 'Expectância E[R]',
        value: `${expectationR >= 0 ? '+' : ''}${expectationR.toFixed(3)}R`,
        subtext: n > 0 ? `N=${n} trades (30d)` : 'Aguardando trades v3.0',
        status: expectationR > 0 ? 'green' : (n < 20 ? 'yellow' : 'red'),
        sparkline: [expectationR]
      },
      {
        id: 2,
        name: 'Assimetria Payoff',
        value: `${asymmetry.toFixed(2)}x`,
        subtext: 'Relação Ganho/Perda',
        status: asymmetry >= 1.5 ? 'green' : 'yellow',
        sparkline: [asymmetry]
      },
      {
        id: 3,
        name: 'Fator de Lucro',
        value: Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞',
        subtext: 'Σ ganhos R / |Σ perdas R|',
        status: profitFactor >= 1.3 ? 'green' : 'yellow',
        sparkline: [Number.isFinite(profitFactor) ? profitFactor : grossWinR]
      },
      {
        id: 4,
        name: 'Risco de Ruína',
        value: 'N/D',
        subtext: 'Monte Carlo ainda não persistido no Event Store',
        status: 'yellow',
        sparkline: []
      },
      {
        id: 5,
        name: 'N e N_efetiva',
        value: `${n}`,
        subtext: n >= 50 ? 'Amostra Válida' : 'Abaixo do piso (N<50)',
        status: n >= 50 ? 'green' : 'yellow',
        sparkline: [n]
      },
      {
        id: 6,
        name: 'Exposição & Beta',
        value: `${grossExposure.toFixed(2)}x`,
        subtext: `${openCount} posição(ões) aberta(s) | Notional $${openNotional.toFixed(2)}`,
        status: grossExposure <= 1.0 ? 'green' : 'yellow',
        sparkline: [grossExposure]
      },
      {
        id: 7,
        name: 'Eficiência Ativos',
        value: topPairsLabel,
        subtext: topPairsRows.length > 0 ? 'Pares com maior amostra (30d)' : 'Sem trades canônicos no período',
        status: topPairsRows.length > 0 ? 'green' : 'yellow',
        sparkline: topPairsRows.map(row => Number(row.avg_r))
      },
      {
        id: 8,
        name: 'Atribuição Laya',
        value: `${deltaR >= 0 ? '+' : ''}${deltaR.toFixed(2)}R`,
        subtext: `Hit Rate: ${hitRate.toFixed(0)}%`,
        status: deltaR >= 0 ? 'green' : 'yellow',
        sparkline: [deltaR]
      },
      {
        id: 9,
        name: 'Integridade Operacional',
        value: (layaGovernanceService.getStatus().recentDecisions?.length || 0) === 0
          ? 'STANDBY'
          : `${layaGovernanceService.getStatus().metrics.latencyP50.toFixed(1)}ms`,
        subtext: (layaGovernanceService.getStatus().recentDecisions?.length || 0) === 0
          ? 'Aguardando 1º fluxo'
          : `p95 ${layaGovernanceService.getStatus().metrics.latencyP95.toFixed(1)}ms / timeout 1500ms`,
        status: layaGovernanceService.getStatus().metrics.latencyP95 <= 1500 ? 'green' : 'red',
        sparkline: [layaGovernanceService.getStatus().metrics.latencyP50, layaGovernanceService.getStatus().metrics.latencyP95]
      },
      {
        id: 10,
        name: 'Calibração Confiança',
        value: 'N/D',
        subtext: 'Brier requer outcome rotulado; não inferido artificialmente',
        status: 'yellow',
        sparkline: []
      }
    ];

    cachedBlocks = { blocks };
    lastBlocksFetch = now;
    res.json(cachedBlocks);
  } catch (err: any) {
    res.status(500).json({ error: 'Falha ao calcular os 10 blocos', details: err.message });
  }
});

/**
 * GET /api/dashboard/attribution
 * Retorna detalhe discriminado dos poderes da Laya e status de gate
 */
dashboardRouter.get('/attribution', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{
      decision_type: string;
      n: string;
      n_effective: string;
      delta_r: string;
      hit_rate: string;
    }>(`
      SELECT
        COALESCE(normalized_action, 'LEGACY_' || verdict::text) AS decision_type,
        COUNT(*) AS n,
        COUNT(delta_r) AS n_effective,
        COALESCE(SUM(delta_r), 0) AS delta_r,
        COALESCE(AVG(CASE WHEN delta_r > 0 THEN 1.0 WHEN delta_r IS NOT NULL THEN 0.0 END), 0) * 100 AS hit_rate
      FROM decision_events
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY COALESCE(normalized_action, 'LEGACY_' || verdict::text)
      ORDER BY COUNT(*) DESC
    `).catch(() => []);

    const powers = rows.map(row => {
      const nEffective = Number(row.n_effective || 0);
      return {
        decisionType: row.decision_type,
        deltaR: Number(row.delta_r || 0),
        hitRate: Number(row.hit_rate || 0),
        n: Number(row.n || 0),
        nEffective,
        status: nEffective >= 50 ? 'MEASURED' : 'OBSERVED'
      };
    });

    const nEffective = powers.reduce((sum, item) => sum + item.nEffective, 0);
    res.json({
      byDecisionType: powers,
      gateProgress: {
        nEffective,
        nRequired: 50,
        powersUnlocked: powers.filter(item => item.nEffective >= 50).map(item => item.decisionType),
        powersLocked: powers.filter(item => item.nEffective < 50).map(item => item.decisionType)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Falha ao buscar atribuição', details: err.message });
  }
});
