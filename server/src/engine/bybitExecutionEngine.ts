import ccxt from 'ccxt';
import { decrypt, maskApiKey } from '../utils/crypto.js';
import { ClientConfigDB, TradeHistoryDB } from '../database/db.js';
import { runShadowAudit } from './shadowAuditor.js';
import { GoogleSheetsService } from '../services/googleSheetsService.js';
import { calculateMasterMirrorSize } from './masterMirrorSizing.js';

export interface BybitAccountInfo {
  walletBalance: number;
  availableBalance: number;
  unrealisedPnl: number;
  equity: number;
  coin: string;
  fundingUsdt?: number;
  fundingBrl?: number;
  unifiedBrl?: number;
  brlBalance?: number;
  totalEquityUsd?: number;
}

export interface BybitPosition {
  symbol: string;
  side: 'Buy' | 'Sell' | 'None';
  size: number;
  entryPrice: number;
  markPrice: number;
  liqPrice: number;
  unrealisedPnl: number;
  leverage: number;
  marginType: string;
}

export interface TradePayload {
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  signalReason: string;
  powerMultiplier?: number;
  orderType?: 'MARKET' | 'LIMIT';
  isMaker?: boolean;
  trailingStopAtivo?: boolean;
  masterExposureRatio?: number;
}

export interface SizingResult {
  qty: number;
  notionalUsd: number;
  marginUsd: number;
  leverage: number;
  stopDistPct: number;
}

/** Bybit Linear VIP0: notional mínimo por ordem (USDT) */
export const MIN_NOTIONAL_USD = 5.0;
/** Spread (bps) a partir do qual priorizamos LIMIT Post-Only (taxa Maker) */
const SPREAD_MAKER_THRESHOLD_BPS = 2.0;

export const COIN_RISK_PROFILES: Record<string, { sl: number; tp: number }> = {
  'BTC/USDT': { sl: 0.0080, tp: 0.0200 }, // 0.8% SL / 2.0% TP
  'BTCUSDT': { sl: 0.0080, tp: 0.0200 },
  'ETH/USDT': { sl: 0.0100, tp: 0.0250 }, // 1.0% SL / 2.5% TP
  'ETHUSDT': { sl: 0.0100, tp: 0.0250 },
  'SOL/USDT': { sl: 0.0140, tp: 0.0350 }, // 1.4% SL / 3.5% TP
  'SOLUSDT': { sl: 0.0140, tp: 0.0350 },
  'BNB/USDT': { sl: 0.0090, tp: 0.0225 }, // 0.9% SL / 2.25% TP
  'BNBUSDT': { sl: 0.0090, tp: 0.0225 },
  'XRP/USDT': { sl: 0.0120, tp: 0.0300 }, // 1.2% SL / 3.0% TP
  'XRPUSDT': { sl: 0.0120, tp: 0.0300 }
};

function toBybitLinear(symbol: string): string {
  if (symbol.includes(':')) return symbol;
  const [base, quote] = symbol.split('/');
  if (!base || !quote) return symbol;
  return `${base}/${quote}:${quote}`;
}

function createBybitClient(apiKey: string, apiSecret: string, testnet: boolean, useAlternateDomain: boolean = false): any {
  const exchange = new (ccxt as any).bybit({
    apiKey,
    secret: apiSecret,
    options: {
      defaultType: 'linear',
    }
  });

  if (testnet) {
    exchange.setSandboxMode(true);
  } else if (useAlternateDomain) {
    exchange.urls['api'] = {
      spot: 'https://api.bytick.com',
      futures: 'https://api.bytick.com',
      v2: 'https://api.bytick.com',
      public: 'https://api.bytick.com',
      private: 'https://api.bytick.com'
    };
  }

  return exchange;
}

function toValidNumber(val: any, fallback: number = 0): number {
  const num = Number(val);
  return Number.isFinite(num) && !Number.isNaN(num) ? num : fallback;
}

export function calculatePositionSize(params: {
  balance: number;
  riskPct: number;
  entryPrice: number;
  stopLoss: number;
  leverage: number;
  minQty: number;
  qtyStep: number;
  symbol?: string;
}): SizingResult {
  const balance = toValidNumber(params.balance, 100);
  const riskPct = toValidNumber(params.riskPct, 1.0);
  const entryPrice = toValidNumber(params.entryPrice, 0);
  const stopLoss = toValidNumber(params.stopLoss, 0);
  const leverage = toValidNumber(params.leverage, 10);
  const minQty = toValidNumber(params.minQty, 0.001);
  let qtyStep = toValidNumber(params.qtyStep, 0.001);

  if (entryPrice <= 0) throw new Error(`Preço de entrada inválido: ${params.entryPrice}`);
  if (stopLoss <= 0) throw new Error(`StopLoss inválido: ${params.stopLoss}`);

  const stopDistPct = Math.abs(entryPrice - stopLoss) / entryPrice;
  if (stopDistPct <= 0 || isNaN(stopDistPct)) {
    throw new Error('StopLoss inválido — distância zero ou nula.');
  }

  const safeLeverage = Math.max(1, Math.min(50, leverage));
  const riskUsd = balance * (riskPct / 100);
  const notionalUsd = riskUsd / stopDistPct;

  let step = qtyStep;
  if (step >= 1 && Number.isInteger(step)) {
    step = Math.pow(10, -step);
  }
  if (step <= 0) step = 0.001;

  let qty = notionalUsd / entryPrice;
  qty = Math.floor(qty / step) * step;
  qty = Math.max(qty, minQty);

  if (isNaN(qty) || qty <= 0) qty = minQty;

  let realNotional = Number((qty * entryPrice).toFixed(2));

  // 🛡️ Guarda MIN_NOTIONAL (Bybit Linear exige ≥ 5 USDT por ordem)
  if (realNotional > 0 && realNotional < MIN_NOTIONAL_USD) {
    const bumpedQty = Math.ceil((MIN_NOTIONAL_USD / entryPrice) / step) * step;
    const bumpedNotional = Number((bumpedQty * entryPrice).toFixed(2));
    const bumpedMargin = Number((bumpedNotional / safeLeverage).toFixed(2));
    const symStr = params.symbol || 'Ativo';

    if (bumpedMargin <= balance * 0.95) {
      qty = bumpedQty;
      realNotional = bumpedNotional;
      console.warn(`[BybitEngine] ⚠️ MIN_NOTIONAL: notional $${(bumpedNotional - MIN_NOTIONAL_USD).toFixed(2)} < 5 USDT em ${symStr} → forçado para $${bumpedNotional.toFixed(2)} (qty ${qty}).`);
    } else {
      throw new Error(`[SHADOW] Ordem abortada: capital insuficiente para min_notional de 5 USDT (par ${symStr} | notional calc. $${realNotional.toFixed(2)} | bump exigiria margem $${bumpedMargin.toFixed(2)} | saldo $${balance.toFixed(2)}).`);
    }
  }

  const marginUsd = Number((realNotional / safeLeverage).toFixed(2));

  if (marginUsd > balance * 0.95) {
    const symStr = params.symbol || 'Ativo';
    throw new Error(`Saldo insuficiente ($${balance.toFixed(2)}) para contrato de ${minQty} em ${symStr} com ${safeLeverage}x. Margem requerida: $${marginUsd.toFixed(2)}.`);
  }

  return {
    qty: Number(qty.toFixed(8)),
    notionalUsd: realNotional,
    marginUsd,
    leverage: safeLeverage,
    stopDistPct: Number((stopDistPct * 100).toFixed(3))
  };
}

export class BybitExecutionEngine {

  static async connectAndValidate(clientId: string, targetEnv?: 'REAL' | 'TESTNET'): Promise<{ success: boolean; accountInfo?: BybitAccountInfo; maskedKey?: string; error?: string }> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config) {
      return { success: false, error: 'Chaves de API não configuradas para este cliente.' };
    }

    let apiKeyEnc = config.bybit_api_key_enc;
    let apiSecretEnc = config.bybit_api_secret_enc;
    let isTestnet = Number(config.bybit_testnet) === 1;

    if (targetEnv === 'TESTNET') {
      apiKeyEnc = config.bybit_test_api_key_enc || config.bybit_api_key_enc;
      apiSecretEnc = config.bybit_test_api_secret_enc || config.bybit_api_secret_enc;
      isTestnet = true;
    } else if (targetEnv === 'REAL') {
      apiKeyEnc = config.bybit_real_api_key_enc || config.bybit_api_key_enc;
      apiSecretEnc = config.bybit_real_api_secret_enc || config.bybit_api_secret_enc;
      isTestnet = false;
    }

    if (!apiKeyEnc || !apiSecretEnc) {
      return { success: false, error: 'Chaves de API não configuradas para este ambiente.' };
    }

    try {
      const apiKey = decrypt(apiKeyEnc);
      const apiSecret = decrypt(apiSecretEnc);
      const testnet = isTestnet;

      let exchange = createBybitClient(apiKey, apiSecret, testnet, false);

      const fetchAccountBal = async (ex: any) => {
        try {
          return await ex.fetchBalance({ type: 'unified' });
        } catch {
          try {
            return await ex.fetchBalance({ type: 'contract' });
          } catch {
            return await ex.fetchBalance();
          }
        }
      };

      let balance: any;
      try {
        balance = await fetchAccountBal(exchange);
      } catch (firstErr: any) {
        if (firstErr.message?.includes('403') || firstErr.message?.includes('CloudFront') || firstErr.message?.includes('country')) {
          console.warn(`[BybitEngine] 403 CloudFront detectado na Bybit para ${clientId}. Tentando rota alternativa (bytick.com)...`);
          exchange = createBybitClient(apiKey, apiSecret, testnet, true);
          balance = await fetchAccountBal(exchange);
        } else {
          throw firstErr;
        }
      }

      const usdt = balance.USDT || balance.total;
      const totalBalance = Number(usdt?.total ?? balance?.free?.USDT ?? 0);
      const freeBalance = Number(usdt?.free ?? balance?.free?.USDT ?? 0);

      const accountInfo: BybitAccountInfo = {
        walletBalance: isNaN(totalBalance) ? 0 : totalBalance,
        availableBalance: isNaN(freeBalance) ? 0 : freeBalance,
        unrealisedPnl: 0,
        equity: isNaN(totalBalance) ? 0 : totalBalance,
        coin: 'USDT'
      };

      await ClientConfigDB.setApiConnected(clientId, true);
      await ClientConfigDB.setEnvironmentStatus(clientId, testnet, true);
      await ClientConfigDB.updateBalance(clientId, accountInfo.walletBalance);

      return {
        success: true,
        accountInfo,
        maskedKey: maskApiKey(apiKey)
      };
    } catch (err: any) {
      await ClientConfigDB.setApiConnected(clientId, false);
      await ClientConfigDB.setEnvironmentStatus(clientId, isTestnet, false);
      console.error(`[BybitEngine] Falha ao conectar cliente ${clientId}:`, err.message);

      let friendlyError = `Erro de conexão com Bybit: ${err.message}`;
      if (err.message?.includes('CloudFront') || err.message?.includes('country')) {
        friendlyError = 'A Bybit bloqueou a requisição a partir da região dos servidores da nuvem (CloudFront 403). Ative a rota alternativa ou conecte as chaves via Mainnet.';
      }

      return {
        success: false,
        error: friendlyError
      };
    }
  }

  static async getAccountBalance(clientId: string): Promise<BybitAccountInfo | null> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config?.bybit_api_key_enc || !config?.bybit_api_secret_enc) return null;

    try {
      const apiKey = decrypt(config.bybit_api_key_enc);
      const apiSecret = decrypt(config.bybit_api_secret_enc);
      const testnet = config.bybit_testnet === 1;
      let exchange = createBybitClient(apiKey, apiSecret, testnet, false);

      const fetchBal = async (ex: any) => {
        try {
          return await ex.fetchBalance({ type: 'unified' });
        } catch {
          try {
            return await ex.fetchBalance({ type: 'contract' });
          } catch {
            return await ex.fetchBalance();
          }
        }
      };

      let balance: any;
      try {
        balance = await fetchBal(exchange);
      } catch (e: any) {
        if (e.message?.includes('403') || e.message?.includes('CloudFront')) {
          exchange = createBybitClient(apiKey, apiSecret, testnet, true);
          balance = await fetchBal(exchange);
        } else {
          throw e;
        }
      }

      const usdt = balance.USDT;
      const totalBalance = Number(usdt?.total ?? balance?.free?.USDT ?? 0);
      const freeBalance = Number(usdt?.free ?? balance?.free?.USDT ?? 0);
      const unifiedBrl = Number(balance.BRL?.total ?? balance?.free?.BRL ?? 0);

      let fundingUsdt = 0;
      let fundingBrl = 0;
      try {
        const fundBal = await exchange.fetchBalance({ type: 'funding' });
        fundingUsdt = Number(fundBal?.USDT?.total ?? fundBal?.free?.USDT ?? 0);
        fundingBrl = Number(fundBal?.BRL?.total ?? fundBal?.free?.BRL ?? 0);
      } catch { }

      const brlBalance = unifiedBrl + fundingBrl;
      const rawTotalEquity = Number(balance.info?.result?.list?.[0]?.totalEquity ?? 0);
      const totalEquityUsd = rawTotalEquity > 0 ? rawTotalEquity : totalBalance;

      return {
        walletBalance: isNaN(totalBalance) ? 0 : totalBalance,
        availableBalance: isNaN(freeBalance) ? 0 : freeBalance,
        unrealisedPnl: 0,
        equity: totalEquityUsd,
        coin: 'USDT',
        fundingUsdt: isNaN(fundingUsdt) ? 0 : fundingUsdt,
        fundingBrl: isNaN(fundingBrl) ? 0 : fundingBrl,
        unifiedBrl: isNaN(unifiedBrl) ? 0 : unifiedBrl,
        brlBalance: isNaN(brlBalance) ? 0 : brlBalance,
        totalEquityUsd: isNaN(totalEquityUsd) ? 0 : totalEquityUsd
      };
    } catch (err: any) {
      console.error(`[BybitEngine] Erro ao buscar saldo ${clientId}:`, err.message);
      return null;
    }
  }

  static async transferFundingToUnified(clientId: string, coin = 'USDT'): Promise<{ success: boolean; message: string; error?: string; transferredAmount?: number }> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config?.bybit_api_key_enc || !config?.bybit_api_secret_enc) {
      return { success: false, message: 'Chaves de API Bybit não configuradas.' };
    }

    try {
      const apiKey = decrypt(config.bybit_api_key_enc);
      const apiSecret = decrypt(config.bybit_api_secret_enc);
      const testnet = config.bybit_testnet === 1;
      const exchange = createBybitClient(apiKey, apiSecret, testnet, false);

      const fundBal = await exchange.fetchBalance({ type: 'funding' });
      const amount = Number(fundBal?.[coin]?.free ?? fundBal?.[coin]?.total ?? 0);

      if (amount <= 0) {
        return {
          success: false,
          message: `Nenhum saldo de ${coin} livre encontrado na Conta de Financiamento da Bybit para transferir.`
        };
      }

      await exchange.transfer(coin, amount, 'funding', 'unified');

      const updatedInfo = await BybitExecutionEngine.getAccountBalance(clientId);
      if (updatedInfo) {
        await ClientConfigDB.updateBalance(clientId, updatedInfo.walletBalance);
      }

      return {
        success: true,
        transferredAmount: amount,
        message: `✅ Sucesso! $${amount.toFixed(2)} ${coin} foram transferidos para a Conta de Trading Unificada (UTA)!`
      };
    } catch (err: any) {
      console.error(`[BybitEngine] Erro ao transferir funding->unified para ${clientId}:`, err.message);
      let friendlyHint = err.message;
      if (err.message?.includes('10003') || err.message?.includes('permission')) {
        friendlyHint = 'Sua chave de API precisa da permissão "Asset Transfer" ativa na Bybit.';
      }
      return {
        success: false,
        message: `Falha ao transferir: ${friendlyHint}`,
        error: err.message
      };
    }
  }

  static async getOpenPositions(clientId: string): Promise<BybitPosition[]> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config?.bybit_api_key_enc) return [];

    try {
      const apiKey = decrypt(config.bybit_api_key_enc);
      const apiSecret = decrypt(config.bybit_api_secret_enc!);
      const exchange = createBybitClient(apiKey, apiSecret, config.bybit_testnet === 1);

      const positions = await exchange.fetchPositions();
      return positions
        .filter((p: any) => p.contracts && Number(p.contracts) > 0)
        .map((p: any) => ({
          symbol: p.symbol,
          side: p.side === 'long' ? 'Buy' : 'Sell',
          size: Number(p.contracts || 0),
          entryPrice: Number(p.entryPrice || 0),
          markPrice: Number(p.markPrice || 0),
          liqPrice: Number(p.liquidationPrice || 0),
          unrealisedPnl: Number(p.unrealizedPnl || 0),
          leverage: Number(p.leverage || 1),
          marginType: p.marginType || 'isolated'
        })) as BybitPosition[];
    } catch (err: any) {
      console.error(`[BybitEngine] Erro ao buscar posições ${clientId}:`, err.message);
      return [];
    }
  }

  /**
   * Executa ordem de cópia com suporte nativo Bybit V5 (sem objetos no stopLoss/takeProfit)
   */
  static async executeCopyTrade(clientId: string, payload: TradePayload): Promise<{ success: boolean; orderId?: string; sizing?: SizingResult; error?: string }> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config || Number(config.is_active) === 0 || !config.bybit_api_key_enc) {
      return { success: false, error: 'Cliente inativo ou sem API Key configurada.' };
    }

    try {
      const apiKey = decrypt(config.bybit_api_key_enc);
      const apiSecret = decrypt(config.bybit_api_secret_enc!);
      const testnet = config.bybit_testnet === 1;
      const exchange = createBybitClient(apiKey, apiSecret, testnet);

      const ccxtSymbol = toBybitLinear(payload.symbol);

      await exchange.loadMarkets();
      const market = exchange.market(ccxtSymbol);
      const minQty = toValidNumber(market.limits?.amount?.min, 0.001);
      const qtyStep = toValidNumber(market.precision?.amount, 0.001);

      const accountInfo = await BybitExecutionEngine.getAccountBalance(clientId);
      const balance = toValidNumber(accountInfo?.availableBalance || accountInfo?.walletBalance || Number(config.balance), 100);

      const baseRiskPct = toValidNumber(config.risk_pct, 1.0);
      const power = toValidNumber(payload.powerMultiplier, 1.5);
      const isAutonomy = Number(config.copy_ai_autonomy) === 1;
      const effectiveRiskPct = isAutonomy ? Number((baseRiskPct * (power / 1.5)).toFixed(2)) : baseRiskPct;

      const validEntryPrice = toValidNumber(payload.entryPrice, 0);
      const validStopLoss = toValidNumber(payload.stopLoss, 0);
      const validTakeProfit = toValidNumber(payload.takeProfit, 0);

      if (validEntryPrice <= 0) throw new Error(`Preço de entrada inválido: ${payload.entryPrice}`);
      if (validStopLoss <= 0) throw new Error(`Stop Loss inválido: ${payload.stopLoss}`);

      const leverage = toValidNumber(config.leverage, 10);
      const mirrorSizing = payload.masterExposureRatio
        ? calculateMasterMirrorSize({
            balanceUsd: balance,
            masterExposureRatio: payload.masterExposureRatio,
            entryPrice: validEntryPrice,
            leverage,
            minQty,
            qtyStep,
            feeRate: payload.isMaker ? 0.0002 : 0.00055
          })
        : null;
      if (mirrorSizing && mirrorSizing.status !== 'EXECUTABLE') {
        return { success: false, error: mirrorSizing.reason || mirrorSizing.status };
      }
      const sizing = mirrorSizing
        ? {
            qty: mirrorSizing.qty,
            notionalUsd: mirrorSizing.notionalUsd,
            marginUsd: mirrorSizing.marginUsd,
            leverage,
            stopDistPct: Number((Math.abs(validEntryPrice - validStopLoss) / validEntryPrice * 100).toFixed(3))
          }
        : calculatePositionSize({
            balance,
            riskPct: effectiveRiskPct,
            entryPrice: validEntryPrice,
            stopLoss: validStopLoss,
            leverage,
            minQty,
            qtyStep,
            symbol: payload.symbol
          });

      const cleanQty = Number(exchange.amountToPrecision(ccxtSymbol, sizing.qty));
      if (isNaN(cleanQty) || cleanQty <= 0) {
        throw new Error(`Quantidade calculada resultou em valor inválido (${cleanQty}). Operação abortada para proteção.`);
      }

      // 🛡️ Margem ISOLADA 10x (default do cliente) — falha silenciosa não aborta a ordem
      await exchange.setMarginMode('isolated', ccxtSymbol).catch(() => { });
      await exchange.setLeverage(sizing.leverage, ccxtSymbol).catch(() => { });

      // Pré-checagem de saldo (auditoria clara antes de qualquer envio à exchange)
      if (balance < sizing.marginUsd) {
        const abortMsg = `[SHADOW] Ordem abortada: capital insuficiente (saldo $${balance.toFixed(2)} < margem $${sizing.marginUsd.toFixed(2)} | ${payload.symbol} | ${sizing.leverage}x isolada).`;
        console.warn(`\x1b[33m${abortMsg}\x1b[0m`);
        (GoogleSheetsService.logTradeExecution as any)({
          clientName: 'Bybit Linear (USD)',
          symbol: payload.symbol,
          side: payload.side,
          entryPrice: validEntryPrice,
          qty: 0,
          stopLoss: validStopLoss,
          takeProfit: validTakeProfit,
          status: 'ABORTADO_SALDO',
          orderType: (payload.isMaker || payload.orderType === 'LIMIT') ? 'LIMIT' : 'MARKET',
          trailingStopAtivo: 'NÃO',
          timestamp: new Date().toISOString(),
          errorMsg: abortMsg
        });
        return { success: false, error: abortMsg };
      }

      // ─── 🛡️ SHADOW MODE EXECUTOR (FILTRO DE ENTRADA RUIM) ────────────────
      const isShadowFilterAtivo = Number(config.shadow_filter_active ?? 0) === 1;
      if (isShadowFilterAtivo) {
        const auditResult: any = await runShadowAudit(exchange, ccxtSymbol, payload.side).catch(() => null);
        const shadowDecision = String(auditResult?.newMode || auditResult?.decision || '').toUpperCase();
        if (auditResult && shadowDecision.indexOf('BLOQUEADO') !== -1) {
          console.warn(`[BybitEngine] 🛑 ENTRADA BLOQUEADA PELO SHADOW MODE ATIVO! Motivo: ${auditResult.reasons}`);

          (GoogleSheetsService.logTradeExecution as any)({
            clientName: 'Bybit Linear (USD)',
            symbol: payload.symbol,
            side: payload.side,
            entryPrice: validEntryPrice,
            qty: 0,
            stopLoss: validStopLoss,
            takeProfit: validTakeProfit,
            status: 'BLOQUEADO SHADOW',
            orderType: (payload.isMaker || payload.orderType === 'LIMIT') ? 'LIMIT' : 'MARKET',
            trailingStopAtivo: 'NÃO',
            feePaid: 0,
            pnlTeoricoSemTrailing: 'Bloqueado pelo Shadow Mode — Capital Poupado',
            timestamp: new Date().toISOString(),
            errorMsg: `Entrada filtrada: ${(auditResult.reasons || []).join?.(' / ') || auditResult.reasons || shadowDecision}`
          });

          return { success: false, error: `Ordem bloqueada pelo filtro Shadow Mode: ${auditResult.reasons}` };
        }
      } else {
        runShadowAudit(exchange, ccxtSymbol, payload.side).catch((err) => {
          console.error(`\x1b[31m[SHADOW ERROR] ${err?.message || err}\x1b[0m`);
        });
      }

      let isMaker = payload.isMaker || payload.orderType === 'LIMIT';

      // 📈 Spread elevado → prioriza LIMIT Post-Only (Maker 0.02% vs Taker 0.055%)
      if (!isMaker) {
        try {
          const ob = await Promise.race([
            exchange.fetchOrderBook(ccxtSymbol, 5),
            new Promise<any>((_, rej) => setTimeout(() => rej(new Error('ob-timeout')), 2000))
          ]);
          const bid = Number(ob?.bids?.[0]?.[0] || 0);
          const ask = Number(ob?.asks?.[0]?.[0] || 0);
          if (bid > 0 && ask > 0) {
            const spreadBps = ((ask - bid) / bid) * 10000;
            if (spreadBps > SPREAD_MAKER_THRESHOLD_BPS) {
              isMaker = true;
              console.log(`[BybitEngine] 📈 Spread ${spreadBps.toFixed(1)} bps > ${SPREAD_MAKER_THRESHOLD_BPS} bps → LIMIT Post-Only (Maker) em ${payload.symbol}`);
            }
          }
        } catch { /* segue com MARKET */ }
      }

      const orderType = isMaker ? 'limit' : 'market';
      const orderPrice = isMaker ? Number(exchange.priceToPrecision(ccxtSymbol, validEntryPrice)) : undefined;

      const side = payload.side === 'BUY' ? 'buy' : 'sell';
      const orderParams: any = {};

      if (isMaker) {
        orderParams['timeInForce'] = 'PostOnly';
        orderParams['postOnly'] = true;
      }

      // ─── 🚀 TRAILING STOP COM COEFICIENTE EXATO DO PAR ESCOLHIDO ──────────
      const trailingAtivo = payload.trailingStopAtivo !== undefined
        ? payload.trailingStopAtivo
        : Number(config.trailing_stop_enabled ?? 1) === 1;

      const cleanKey = payload.symbol.replace(':USDT', '').trim();
      const profile = COIN_RISK_PROFILES[cleanKey] || COIN_RISK_PROFILES[payload.symbol] || { sl: 0.0100, tp: 0.0250 };

      const alvoLucroPct = profile.tp;
      const gatilhoPct = 0.80;
      const distanciaPct = 0.20;

      // ─── CORREÇÃO DEFINITIVA: STOP LOSS COMO STRING DIRETA (NUNCA OBJETO) ───
      if (validStopLoss > 0) {
        orderParams['stopLoss'] = exchange.priceToPrecision(ccxtSymbol, validStopLoss).toString();
        orderParams['slOrderType'] = 'Market';
        orderParams['tpslMode'] = 'Full';
      }

      // Se o Trailing Stop estiver DESLIGADO, envia o Take Profit fixo como string direta
      if (!trailingAtivo && validTakeProfit > 0) {
        orderParams['takeProfit'] = exchange.priceToPrecision(ccxtSymbol, validTakeProfit).toString();
        orderParams['tpOrderType'] = 'Market';
        orderParams['tpslMode'] = 'Full';
      }

      // Disparo da ordem principal
      const order = await exchange.createOrder(
        ccxtSymbol,
        orderType,
        side,
        cleanQty,
        orderPrice,
        orderParams
      );

      // Se o Trailing Stop estiver ATIVADO, programa no endpoint nativo da Bybit
      if (trailingAtivo) {
        try {
          const rawSymbol = ccxtSymbol.replace('/', '').split(':')[0];
          const callbackDistance = Number(exchange.priceToPrecision(ccxtSymbol, validEntryPrice * (distanciaPct * alvoLucroPct)));
          const activationPrice = Number(exchange.priceToPrecision(
            ccxtSymbol,
            payload.side === 'BUY'
              ? validEntryPrice * (1 + (gatilhoPct * alvoLucroPct))
              : validEntryPrice * (1 - (gatilhoPct * alvoLucroPct))
          ));

          if (!isNaN(callbackDistance) && callbackDistance > 0 && !isNaN(activationPrice) && activationPrice > 0) {
            try {
              await exchange.privatePostV5PositionSetTradingStop({
                category: 'linear',
                symbol: rawSymbol,
                trailingStop: callbackDistance.toString(),
                activePrice: activationPrice.toString(),
                positionIdx: 0
              });
            } catch (posIdxErr: any) {
              if (posIdxErr?.message?.includes('position idx') || posIdxErr?.message?.includes('10001')) {
                const hedgeIdx = payload.side === 'BUY' ? 1 : 2;
                await exchange.privatePostV5PositionSetTradingStop({
                  category: 'linear',
                  symbol: rawSymbol,
                  trailingStop: callbackDistance.toString(),
                  activePrice: activationPrice.toString(),
                  positionIdx: hedgeIdx
                }).catch(() => { });
              }
            }
          }
        } catch (e: any) {
          console.warn(`[BybitEngine] Falha ao programar Trailing Stop nativo: ${e?.message}`);
        }
      }

      const tradeId = `trade-${clientId}-${Date.now()}`;
      await TradeHistoryDB.insert({
        id: tradeId,
        client_id: clientId,
        symbol: payload.symbol,
        side: payload.side,
        entry_price: validEntryPrice,
        qty: cleanQty,
        notional_usd: sizing.notionalUsd,
        leverage: sizing.leverage,
        status: 'OPEN',
        signal_reason: payload.signalReason,
        bybitOrderId: order.id,
        entry_time: Date.now()
      });

      const feePaid = Number((sizing.notionalUsd * (isMaker ? 0.0004 : 0.0011)).toFixed(4));

      (GoogleSheetsService.logTradeExecution as any)({
        clientName: 'Bybit Linear (USD)',
        symbol: payload.symbol,
        side: payload.side,
        entryPrice: validEntryPrice,
        qty: cleanQty,
        stopLoss: validStopLoss,
        takeProfit: validTakeProfit,
        status: 'EXECUTADO',
        orderType: orderType.toUpperCase(),
        trailingStopAtivo: trailingAtivo ? 'SIM' : 'NÃO',
        feePaid,
        pnlTeoricoSemTrailing: `Alvo Fixo: +${(alvoLucroPct * 100).toFixed(2)}% | SL: -${(profile.sl * 100).toFixed(2)}%`,
        timestamp: new Date().toISOString()
      });

      return { success: true, orderId: order.id, sizing };
    } catch (err: any) {
      console.error(`[BybitEngine] Erro ao executar ordem ${clientId}:`, err.message);

      (GoogleSheetsService.logTradeExecution as any)({
        clientName: 'Bybit Linear (USD)',
        symbol: payload.symbol,
        side: payload.side,
        entryPrice: payload.entryPrice || 0,
        qty: 0,
        stopLoss: payload.stopLoss || 0,
        takeProfit: payload.takeProfit || 0,
        status: 'FALHA',
        orderType: (payload.isMaker || payload.orderType === 'LIMIT') ? 'LIMIT' : 'MARKET',
        trailingStopAtivo: 'NÃO',
        timestamp: new Date().toISOString(),
        errorMsg: err.message
      });

      return { success: false, error: err.message };
    }
  }

  static async getBybitTradeHistory(clientId: string, symbol?: string): Promise<any[]> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config?.bybit_api_key_enc) return [];

    try {
      const apiKey = decrypt(config.bybit_api_key_enc);
      const apiSecret = decrypt(config.bybit_api_secret_enc!);
      const exchange = createBybitClient(apiKey, apiSecret, config.bybit_testnet === 1);

      const trades = await exchange.fetchMyTrades(symbol ? toBybitLinear(symbol) : undefined, undefined, 100);
      return trades.map((t: any) => ({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        price: t.price,
        qty: t.amount,
        cost: t.cost,
        fee: t.fee?.cost,
        pnl: t.info?.closedPnl || null,
        timestamp: t.timestamp,
        orderId: t.order
      }));
    } catch (err: any) {
      console.error(`[BybitEngine] Erro ao buscar histórico ${clientId}:`, err.message);
      return [];
    }
  }

  static async panicCloseAll(clientId: string): Promise<{ success: boolean; closedCount: number; cancelledCount: number; errors: string[] }> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config?.bybit_api_key_enc) {
      return { success: false, closedCount: 0, cancelledCount: 0, errors: ['Chaves de API da Bybit não configuradas'] };
    }

    const errors: string[] = [];
    let closedCount = 0;
    let cancelledCount = 0;

    try {
      const apiKey = decrypt(config.bybit_api_key_enc);
      const apiSecret = decrypt(config.bybit_api_secret_enc!);
      const exchange = createBybitClient(apiKey, apiSecret, config.bybit_testnet === 1);

      try {
        const cancelled = await exchange.cancelAllOrders();
        cancelledCount = Array.isArray(cancelled) ? cancelled.length : 1;
      } catch (err: any) {
        console.warn(`[PanicClose] Erro ao cancelar ordens para ${clientId}:`, err.message);
        errors.push(`Erro ao cancelar ordens: ${err.message}`);
      }

      try {
        const positions = await exchange.fetchPositions();
        for (const pos of positions) {
          const contracts = Number(pos.contracts || pos.info?.size || 0);
          if (contracts > 0) {
            const side = pos.side?.toLowerCase() === 'long' || pos.info?.side?.toLowerCase() === 'buy' ? 'sell' : 'buy';
            try {
              await exchange.createOrder(pos.symbol, 'market', side, contracts, undefined, {
                reduceOnly: true
              });
              closedCount++;
            } catch (err: any) {
              console.error(`[PanicClose] Erro ao fechar posição ${pos.symbol} para ${clientId}:`, err.message);
              errors.push(`Erro ao fechar ${pos.symbol}: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[PanicClose] Erro ao buscar posições para ${clientId}:`, err.message);
        errors.push(`Erro ao buscar posições: ${err.message}`);
      }

      return {
        success: errors.length === 0,
        closedCount,
        cancelledCount,
        errors
      };
    } catch (err: any) {
      console.error(`[PanicClose] Erro crítico para ${clientId}:`, err.message);
      return {
        success: false,
        closedCount,
        cancelledCount,
        errors: [err.message]
      };
    }
  }
}
