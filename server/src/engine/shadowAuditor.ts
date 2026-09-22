// ======================================================
// 📁 server/src/engine/shadowAuditor.ts — MARKETFLOW PRO (V.TOP 2.1)
// Módulo Isolado de Avaliação Quantitativa em Shadow Mode (Modo Fantasma)
// ======================================================

import fs from 'fs';
import path from 'path';
import ccxt from 'ccxt';
import { RISK_CONFIG } from '../config/riskConfig.js';
import { GoogleSheetsService } from '../services/googleSheetsService.js';

if (RISK_CONFIG.SHADOW_MODE_AUDIT) {
  console.log(`\x1b[36m[SHADOW AUDITOR] Iniciado e aguardando sinais de entrada em modo fantasma...\x1b[0m`);
}

export interface ShadowAuditResult {
  symbol: string;
  side: 'BUY' | 'SELL';
  oldMode: string;
  newMode: string;
  reasons: string[];
  spreadPips?: number;
  spreadBps?: number;
  usdExposureR?: number;
  outcome?: string;
  safetyVerdict?: string;
  timestamp: string;
}

export interface ShadowOpportunity {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  mode: 'AUDIT' | 'FILTER';
  approved: boolean;
  reasons: string[];
  source: 'BYBIT' | 'LOCAL_FALLBACK' | 'UNAVAILABLE';
  timestamp: string;
}

// Armazena auditorias ativas para cruzar com o desfecho do trade (GREEN / RED)
const pendingAudits = new Map<string, { auditResult: ShadowAuditResult; entryTime: number }>();
const shadowOpportunities: ShadowOpportunity[] = [];

export function normalizeShadowPnlPct(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function recordShadowOpportunity(input: Omit<ShadowOpportunity, 'id' | 'timestamp'>): ShadowOpportunity {
  const record: ShadowOpportunity = {
    ...input,
    id: `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString()
  };
  shadowOpportunities.unshift(record);
  if (shadowOpportunities.length > 500) shadowOpportunities.pop();
  return record;
}

export function getShadowOpportunities(): ShadowOpportunity[] {
  return [...shadowOpportunities];
}

export function clearShadowOpportunities(): void {
  shadowOpportunities.length = 0;
}

/**
 * Executa avaliação quantitativa em Shadow Mode (Modo Fantasma).
 * NÃO-BLOQUEANTE: Roda em segundo plano sem travar ou atrasar a execução principal.
 */
export async function runShadowAudit(
  exchange: any,
  symbol: string,
  side: 'BUY' | 'SELL',
  proposedRiskR: number = 1.0,
  fallbackOpenPositions?: Array<{ symbol: string; type?: string; side?: string }>,
  fallbackOrderBook?: { bids: any[]; asks: any[]; spread?: number }
): Promise<ShadowAuditResult | null> {
  // Se auditoria estiver desativada, retorna silenciosamente
  if (!RISK_CONFIG.SHADOW_MODE_AUDIT) {
    return null;
  }

  const timestamp = new Date().toISOString();

  try {
    const reasons: string[] = [];
    let isBlockedNewMode = false;
    let currentUsdExposureR = 0;
    let calculatedSpreadBps = 0;

    // ──────────────────────────────────────────────────────────
    // 1. FILTRO A: ANTI-CORRELAÇÃO DIRECIONAL (USD CLUMPING)
    // ──────────────────────────────────────────────────────────
    try {
      const cleanSymbol = symbol.replace(':USDT', '').replace('/', '');
      const isQuoteUsd = symbol.includes('USD') || symbol.includes('USDT');
      const isBaseUsd = symbol.startsWith('USD');

      // Direção em relação ao Dólar (USD)
      let isNewTradeUsdLong = false;
      if (isBaseUsd) {
        isNewTradeUsdLong = side === 'BUY';
      } else if (isQuoteUsd) {
        isNewTradeUsdLong = side === 'SELL';
      }

      // Buscar posições abertas na Bybit ou no Master Quant (fallback)
      let positions: any[] = [];
      if (exchange && typeof exchange.fetchPositions === 'function') {
        positions = await Promise.race([
          exchange.fetchPositions(),
          new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Timeout fetchPositions L2')), 3000))
        ]).catch(() => []);
      }

      if ((!positions || positions.length === 0) && Array.isArray(fallbackOpenPositions)) {
        positions = fallbackOpenPositions
          .filter(p => p.symbol !== symbol) // Não contar o próprio ativo sob auditoria como posição prévia
          .map(p => ({
            symbol: p.symbol,
            side: p.type || (p as any).side || 'BUY',
            contracts: 1
          }));
      }

      for (const pos of positions) {
        const contracts = Number(pos.contracts || pos.info?.size || (pos.size ?? 1));
        if (contracts <= 0) continue;

        const posSymbol = (pos.symbol || '').replace(':USDT', '').replace('/', '');
        const posSide = (pos.side || pos.info?.side || '').toLowerCase();
        const isPosBuy = posSide === 'buy' || posSide === 'long';

        let posRelatesToUsd = false;
        let isPosUsdLong = false;

        if (posSymbol.startsWith('USD')) {
          posRelatesToUsd = true;
          isPosUsdLong = isPosBuy;
        } else if (posSymbol.includes('USD') || posSymbol.includes('USDT')) {
          posRelatesToUsd = true;
          isPosUsdLong = !isPosBuy; // Sell de SOL/USDT = Long em USD
        }

        if (posRelatesToUsd && isPosUsdLong === isNewTradeUsdLong) {
          currentUsdExposureR += 1.0;
        }
      }

      const totalProjectedUsdExposure = currentUsdExposureR + proposedRiskR;
      if (totalProjectedUsdExposure > RISK_CONFIG.MAX_USD_EXPOSURE) {
        isBlockedNewMode = true;
        reasons.push(`Exposição direcional em USDT excede teto de ${RISK_CONFIG.MAX_USD_EXPOSURE.toFixed(1)}R (Projetada: ${totalProjectedUsdExposure.toFixed(1)}R)`);
      }
    } catch (corrErr: any) {
      console.error(`\x1b[31m[SHADOW AUDIT WARNING] Falha ao verificar correlação: ${corrErr.message}\x1b[0m`);
    }

    // ──────────────────────────────────────────────────────────
    // 2. FILTRO B: TRAVA DE SPREAD DINÂMICO & ORDERBOOK L2 CRIPTO (BPS)
    // ──────────────────────────────────────────────────────────
    try {
      let orderbook: any = null;
      if (exchange && typeof exchange.fetchOrderBook === 'function') {
        orderbook = await Promise.race([
          exchange.fetchOrderBook(symbol, 5),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout fetchOrderBook L2')), 2500))
        ]).catch(() => null);
      }

      if (!orderbook && fallbackOrderBook) {
        orderbook = fallbackOrderBook;
      }

      if (
        orderbook &&
        Array.isArray(orderbook.bids) &&
        Array.isArray(orderbook.asks) &&
        orderbook.bids.length > 0 &&
        orderbook.asks.length > 0
      ) {
        const bidFirst = orderbook.bids[0];
        const askFirst = orderbook.asks[0];
        const bestBid = typeof bidFirst === 'object' && 'price' in bidFirst ? Number(bidFirst.price) : Number(bidFirst[0] || 0);
        const bestAsk = typeof askFirst === 'object' && 'price' in askFirst ? Number(askFirst.price) : Number(askFirst[0] || 0);

        if (bestBid > 0 && bestAsk > 0) {
          const rawSpread = bestAsk - bestBid;
          // Spread em Basis Points (1 bps = 0.01%) e Percentual
          const spreadPct = (rawSpread / bestBid) * 100;
          calculatedSpreadBps = Number((spreadPct * 100).toFixed(2));

          const maxAllowedBps = RISK_CONFIG.MAX_SPREAD_BPS || 5.0;
          if (calculatedSpreadBps > maxAllowedBps) {
            isBlockedNewMode = true;
            reasons.push(`Spread L2 Bybit de ${calculatedSpreadBps} bps (${spreadPct.toFixed(3)}%) > Teto seguro de ${maxAllowedBps} bps`);
          }
        }
      } else {
        reasons.push('Orderbook L2 temporariamente vazio ou indisponível');
      }
    } catch (obErr: any) {
      console.error(`\x1b[31m[SHADOW AUDIT WARNING] Falha ao verificar OrderBook L2: ${obErr.message}\x1b[0m`);
    }

    // ──────────────────────────────────────────────────────────
    // 3. FORMATAÇÃO DO RELATÓRIO E PERSISTÊNCIA EM LOG
    // ──────────────────────────────────────────────────────────
    const oldModeText = 'EXECUTADO 🟢';
    const newModeText = isBlockedNewMode ? 'BLOQUEADO 🛑' : 'PERMITIDO 🟢';
    const reasonText = reasons.length > 0 
      ? reasons.join(' / ') 
      : 'Confluência aprovada (Exposição USDT dentro do teto & Spread L2 ótimo)';

    const logLine = `[SHADOW AUDIT] | Ativo: ${symbol} (${side}) | Modo Antigo: ${oldModeText} | Modo Novo: ${newModeText} | Motivo: ${reasonText}`;

    // Saída no terminal em Ciano (\x1b[36m)
    console.log(`\x1b[36m${logLine}\x1b[0m`);

    // Gravação síncrona em arquivo sem afetar a thread principal
    try {
      const logFilePath = path.resolve(process.cwd(), RISK_CONFIG.LOG_FILE_PATH);
      fs.appendFileSync(logFilePath, `[${timestamp}] ${logLine}\n`, 'utf8');
    } catch (fsErr: any) {
      console.error(`\x1b[31m[SHADOW AUDIT FILE ERROR] Falha ao gravar log em disco: ${fsErr.message}\x1b[0m`);
    }

    const auditResult: ShadowAuditResult = {
      symbol,
      side,
      oldMode: oldModeText,
      newMode: newModeText,
      reasons,
      spreadPips: calculatedSpreadBps,
      spreadBps: calculatedSpreadBps,
      usdExposureR: currentUsdExposureR,
      timestamp
    };

    // Armazena para correlação com o encerramento da ordem (GREEN / RED)
    pendingAudits.set(symbol, { auditResult, entryTime: Date.now() });

    GoogleSheetsService.logShadowAudit({
      symbol,
      side,
      oldMode: oldModeText,
      newMode: newModeText,
      reasons: reasonText,
      spreadPips: calculatedSpreadBps,
      usdExposureR: currentUsdExposureR,
      outcome: 'EM ANDAMENTO ⏳',
      safetyVerdict: 'Monitorando saída da posição...',
      timestamp
    });

    return auditResult;
  } catch (fatalErr: any) {
    console.error(`\x1b[31m[SHADOW AUDIT ERROR] Erro silencioso no shadow auditor: ${fatalErr.message}\x1b[0m`);
    return null;
  }
}

/**
 * Registra o desfecho real da operação (GREEN ou RED) e cruza com a decisão do Modo Fantasma
 * Permite identificar se o filtro salvou a banca de um RED ou se aprovou um GREEN seguro!
 */
export function recordShadowOutcome(
  symbol: string,
  status: 'CLOSED_TP' | 'CLOSED_SL',
  pnlUsd: number,
  rMultiple: number,
  pnlPct: number = 0
): { outcome: string; verdict: string; savedCapital: boolean; pnlUsd: number; pnlPct: number | null; rMultiple: number } | null {
  const pending = pendingAudits.get(symbol);
  const isGreen = status === 'CLOSED_TP';
  const finalPnlPct = normalizeShadowPnlPct(pnlPct);
  const outcomeText = isGreen ? 'GREEN 🟢' : 'RED 🔴';

  let safetyVerdict = '';
  let savedCapital = false;

  if (pending) {
    const wasBlocked = pending.auditResult.newMode.includes('BLOQUEADO');
    if (wasBlocked && !isGreen) {
      safetyVerdict = `🛡️ FILTRO SALVOU A BANCA (Bloqueou loss de -$${Math.abs(pnlUsd).toFixed(2)}${finalPnlPct === null ? '' : ` | -${Math.abs(finalPnlPct).toFixed(2)}%`})`;
      savedCapital = true;
    } else if (wasBlocked && isGreen) {
      safetyVerdict = `⚠️ FALSO POSITIVO (Filtro bloqueou ganho de +$${Math.abs(pnlUsd).toFixed(2)}${finalPnlPct === null ? '' : ` | +${Math.abs(finalPnlPct).toFixed(2)}%`})`;
    } else if (!wasBlocked && isGreen) {
      safetyVerdict = `✅ CONFLUÊNCIA PERFEITA (Filtro aprovou e capturou +$${Math.abs(pnlUsd).toFixed(2)}${finalPnlPct === null ? '' : ` | +${Math.abs(finalPnlPct).toFixed(2)}%`})`;
    } else {
      safetyVerdict = `❌ RISCO NÃO EVITADO (Filtro aprovou mas bateu loss de -$${Math.abs(pnlUsd).toFixed(2)}${finalPnlPct === null ? '' : ` | -${Math.abs(finalPnlPct).toFixed(2)}%`})`;
    }
  } else {
    safetyVerdict = isGreen ? `✅ GREEN EXECUTADO (+${rMultiple.toFixed(1)}R)` : `❌ RED EXECUTADO (${rMultiple.toFixed(1)}R)`;
  }

  const timestamp = new Date().toISOString();
  const pnlPctText = finalPnlPct === null ? 'N/A' : `${finalPnlPct > 0 ? '+' : ''}${finalPnlPct.toFixed(2)}%`;
  const outcomeLog = `[SHADOW OUTCOME] | Ativo: ${symbol} | Resultado: ${outcomeText} (${pnlPctText} / $${pnlUsd.toFixed(2)}) | Decisão Pré-Trade: ${pending?.auditResult.newMode || 'N/A'} | Veredito: ${safetyVerdict}`;

  // Print no terminal com cor correspondente
  const color = isGreen ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${outcomeLog}\x1b[0m`);

  // Gravar no arquivo audit_shadow_mode.log
  try {
    const logFilePath = path.resolve(process.cwd(), RISK_CONFIG.LOG_FILE_PATH);
    fs.appendFileSync(logFilePath, `[${timestamp}] ${outcomeLog}\n`, 'utf8');
  } catch (fsErr: any) {
    console.error(`[SHADOW OUTCOME ERROR] Falha ao gravar log em disco: ${fsErr.message}`);
  }

  // Enviar para a aba de auditoria da Planilha Google com colunas estruturais
  GoogleSheetsService.logShadowAudit({
    symbol,
    side: pending?.auditResult.side || 'N/A',
    oldMode: 'FINALIZADO',
    newMode: pending?.auditResult.newMode || (isGreen ? 'PERMITIDO 🟢' : 'BLOQUEADO 🛑'),
    reasons: safetyVerdict,
    spreadPips: pending?.auditResult.spreadPips || 0,
    usdExposureR: pending?.auditResult.usdExposureR || 0,
    outcome: outcomeText,
    pnlUsd,
    ...(finalPnlPct === null ? {} : { pnlPct: finalPnlPct }),
    rMultiple,
    safetyVerdict,
    timestamp
  });

  pendingAudits.delete(symbol);
  return { outcome: outcomeText, verdict: safetyVerdict, savedCapital, pnlUsd, pnlPct: finalPnlPct, rMultiple };
}

/**
 * Zera o histórico do Modo Fantasma (Shadow Mode) e limpa auditorias pendentes
 */
export function clearShadowAudits() {
  pendingAudits.clear();
  clearShadowOpportunities();
  try {
    const logFilePath = path.resolve(process.cwd(), RISK_CONFIG.LOG_FILE_PATH);
    const timestamp = new Date().toISOString();
    fs.writeFileSync(logFilePath, `[${timestamp}] [SESSÃO ZERADA] Histórico do Modo Fantasma reiniciado para nova sessão.\n`, 'utf8');
  } catch (fsErr: any) {
    console.error(`[SHADOW AUDIT RESET ERROR] Falha ao resetar arquivo de log: ${fsErr.message}`);
  }
}
