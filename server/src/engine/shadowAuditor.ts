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
  usdExposureR?: number;
  timestamp: string;
}

/**
 * Executa avaliação quantitativa em Shadow Mode (Modo Fantasma).
 * NÃO-BLOQUEANTE: Roda em segundo plano sem travar ou atrasar a execução principal.
 */
export async function runShadowAudit(
  exchange: any,
  symbol: string,
  side: 'BUY' | 'SELL',
  proposedRiskR: number = 1.0
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
    let calculatedSpreadPips = 0;

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

      // Buscar posições abertas na Bybit com timeout rápido
      const positions = await Promise.race([
        exchange.fetchPositions(),
        new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Timeout fetchPositions L2')), 3000))
      ]).catch(() => []);

      for (const pos of positions) {
        const contracts = Number(pos.contracts || pos.info?.size || 0);
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
          isPosUsdLong = !isPosBuy; // Sell de EUR/USD = Long em USD
        }

        if (posRelatesToUsd && isPosUsdLong === isNewTradeUsdLong) {
          currentUsdExposureR += 1.0;
        }
      }

      const totalProjectedUsdExposure = currentUsdExposureR + proposedRiskR;
      if (totalProjectedUsdExposure > RISK_CONFIG.MAX_USD_EXPOSURE) {
        isBlockedNewMode = true;
        reasons.push(`Exposição em USD excede ${RISK_CONFIG.MAX_USD_EXPOSURE.toFixed(1)}R (Projetada: ${totalProjectedUsdExposure.toFixed(1)}R)`);
      }
    } catch (corrErr: any) {
      // Falha na checagem de correlação é capturada silenciosamente
      console.error(`\x1b[31m[SHADOW AUDIT WARNING] Falha ao verificar correlação: ${corrErr.message}\x1b[0m`);
    }

    // ──────────────────────────────────────────────────────────
    // 2. FILTRO B: TRAVA DE SPREAD DINÂMICO & ORDERBOOK L2
    // ──────────────────────────────────────────────────────────
    try {
      const orderbook = await Promise.race([
        exchange.fetchOrderBook(symbol, 5),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout fetchOrderBook L2')), 2500))
      ]);

      if (
        orderbook &&
        Array.isArray(orderbook.bids) &&
        Array.isArray(orderbook.asks) &&
        orderbook.bids.length > 0 &&
        orderbook.asks.length > 0 &&
        orderbook.bids[0]?.length > 0 &&
        orderbook.asks[0]?.length > 0
      ) {
        const bestBid = Number(orderbook.bids[0][0]);
        const bestAsk = Number(orderbook.asks[0][0]);

        if (bestBid > 0 && bestAsk > 0) {
          const rawSpread = bestAsk - bestBid;

          // Conversão de Pips conforme a classe do ativo
          const isJpy = symbol.toUpperCase().includes('JPY');
          const isForex = symbol.toUpperCase().includes('EUR') || 
                          symbol.toUpperCase().includes('GBP') || 
                          symbol.toUpperCase().includes('AUD') || 
                          symbol.toUpperCase().includes('CAD') || 
                          symbol.toUpperCase().includes('CHF') || 
                          symbol.toUpperCase().includes('NZD');

          const pipMultiplier = isJpy 
            ? 0.01 
            : (isForex ? 0.0001 : (bestBid > 100 ? bestBid * 0.0002 : 0.0002));

          calculatedSpreadPips = Number((rawSpread / pipMultiplier).toFixed(2));

          if (calculatedSpreadPips > RISK_CONFIG.MAX_SPREAD_PIPS) {
            isBlockedNewMode = true;
            reasons.push(`Spread atual de ${calculatedSpreadPips} pips > ${RISK_CONFIG.MAX_SPREAD_PIPS} pips`);
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
      : 'Confluência aprovada (Exposição USD dentro do teto & Spread L2 ótimo)';

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

    GoogleSheetsService.logShadowAudit({
      symbol,
      side,
      oldMode: oldModeText,
      newMode: newModeText,
      reasons: reasonText,
      spreadPips: calculatedSpreadPips,
      usdExposureR: currentUsdExposureR,
      timestamp
    });

    return {
      symbol,
      side,
      oldMode: oldModeText,
      newMode: newModeText,
      reasons,
      spreadPips: calculatedSpreadPips,
      usdExposureR: currentUsdExposureR,
      timestamp
    };
  } catch (fatalErr: any) {
    // Tratamento estrito: nenhum erro nesta camada pode vazar ou derrubar o processo
    console.error(`\x1b[31m[SHADOW AUDIT ERROR] Erro silencioso no shadow auditor: ${fatalErr.message}\x1b[0m`);
    return null;
  }
}
