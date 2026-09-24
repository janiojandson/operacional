import ccxt from 'ccxt';
import { decrypt, maskApiKey } from '../utils/crypto.js';
import { ClientConfigDB, TradeHistoryDB } from '../database/db.js';
import { runShadowAudit } from './shadowAuditor.js';
import { GoogleSheetsService } from '../services/googleSheetsService.js';
import { calculateMasterMirrorSize } from './masterMirrorSizing.js';
import { assessClientMarginCapacity } from './clientMarginGuard.js';
import { classifyBybitOrderState, verifyIsolatedLeverage } from './bybitExecutionSafety.js';

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

/** BingX Swap VIP0: notional mínimo por ordem (USDT) */
export const MIN_NOTIONAL_USD = 2.0;
/** Spread (bps) a partir do qual priorizamos LIMIT Post-Only (taxa Maker) */
const SPREAD_MAKER_THRESHOLD_BPS = 2.0;

function toBybitLinear(symbol: string): string {
  if (symbol.includes(':')) return symbol;
  const [base, quote] = symbol.split('/');
  if (!base || !quote) return symbol;
  return `${base}/${quote}:${quote}`;
}

function createBybitClient(apiKey: string, apiSecret: string, testnet: boolean, _useAlternateDomain: boolean = false): any {
  // Conexão direta com BingX Perpetual Swap (Futuros USDT-M)
  const exchange = new (ccxt as any).bingx({
    apiKey,
    secret: apiSecret,
    options: {
      defaultType: 'swap',
      adjustForTimeDifference: true,
      recvWindow: 60000
    },
    enableRateLimit: true,
    timeout: 15000
  });

  if (testnet) {
    exchange.setSandboxMode(true);
  }

  return exchange;
}

function toValidNumber(val: any, fallback: number = 0): number {
  const num = Number(val);
  return Number.isFinite(num) && !Number.isNaN(num) ? num : fallback;
}

export function calculateTrailingConfiguration(input: {
  entryPrice: number;
  takeProfit: number;
  side: 'BUY' | 'SELL';
}): { activationPrice: number; callbackDistance: number } | null {
  const targetDistancePct = Math.abs(input.takeProfit - input.entryPrice) / input.entryPrice;
  if (!Number.isFinite(targetDistancePct) || targetDistancePct <= 0 || !Number.isFinite(input.entryPrice) || input.entryPrice <= 0) return null;
  const direction = input.side === 'BUY' ? 1 : -1;
  return {
    activationPrice: Number((input.entryPrice * (1 + direction * targetDistancePct * 0.8)).toFixed(8)),
    callbackDistance: Number((input.entryPrice * targetDistancePct * 0.2).toFixed(8))
  };
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
          return await ex.fetchBalance({ type: 'swap' });
        } catch {
          try {
            return await ex.fetchBalance();
          } catch (e) {
            return await ex.fetchBalance({ type: 'future' });
          }
        }
      };

      const balance: any = await fetchAccountBal(exchange);

      const vst = balance.VST;
      const usdt = balance.USDT || balance.total;
      const isVst = testnet && (Number(vst?.total || 0) > 0 || Number(vst?.free || 0) > 0);
      const chosen = isVst ? vst : (usdt || vst);

      const totalBalance = Number(chosen?.total ?? balance?.free?.USDT ?? balance?.free?.VST ?? 0);
      const freeBalance = Number(chosen?.free ?? balance?.free?.USDT ?? balance?.free?.VST ?? 0);

      const accountInfo: BybitAccountInfo = {
        walletBalance: isNaN(totalBalance) ? 0 : totalBalance,
        availableBalance: isNaN(freeBalance) ? 0 : freeBalance,
        unrealisedPnl: 0,
        equity: isNaN(totalBalance) ? 0 : totalBalance,
        coin: isVst ? 'VST' : 'USDT'
      };

      await ClientConfigDB.setApiConnected(clientId, true);
      await ClientConfigDB.setEnvironmentStatus(clientId, testnet, true);
      if (!testnet || config.bybit_testnet === 1) {
        await ClientConfigDB.updateBalance(clientId, accountInfo.walletBalance);
      }

      return {
        success: true,
        accountInfo,
        maskedKey: maskApiKey(apiKey)
      };
    } catch (err: any) {
      await ClientConfigDB.setApiConnected(clientId, false);
      await ClientConfigDB.setEnvironmentStatus(clientId, isTestnet, false);
      console.error(`[BingXEngine] Falha ao conectar cliente ${clientId}:`, err.message);

      let friendlyError = `Erro de conexão com BingX: ${err.message}`;
      if (err.message?.includes('100001') || err.message?.includes('signature') || err.message?.includes('key')) {
        friendlyError = 'API Key ou Secret inválidos na BingX. Certifique-se de copiar as credenciais completas e habilitar "Perpetual Futures Trading".';
      } else if (err.message?.includes('IP') || err.message?.includes('ip')) {
        friendlyError = 'Restrição de IP ativa na chave da BingX. Deixe em branco para permitir conexões da nuvem.';
      }

      return {
        success: false,
        error: friendlyError
      };
    }
  }

  static async getAccountBalance(clientId: string, targetEnv?: 'REAL' | 'TESTNET'): Promise<BybitAccountInfo | null> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config) return null;

    let apiKeyEnc = config.bybit_api_key_enc;
    let apiSecretEnc = config.bybit_api_secret_enc;
    let testnet = config.bybit_testnet === 1;

    if (targetEnv === 'TESTNET') {
      apiKeyEnc = config.bybit_test_api_key_enc || config.bybit_api_key_enc;
      apiSecretEnc = config.bybit_test_api_secret_enc || config.bybit_api_secret_enc;
      testnet = true;
    } else if (targetEnv === 'REAL') {
      apiKeyEnc = config.bybit_real_api_key_enc || config.bybit_api_key_enc;
      apiSecretEnc = config.bybit_real_api_secret_enc || config.bybit_api_secret_enc;
      testnet = false;
    }

    if (!apiKeyEnc || !apiSecretEnc) return null;

    try {
      const apiKey = decrypt(apiKeyEnc);
      const apiSecret = decrypt(apiSecretEnc);
      let exchange = createBybitClient(apiKey, apiSecret, testnet, false);

      const fetchBal = async (ex: any) => {
        try {
          return await ex.fetchBalance({ type: 'swap' });
        } catch {
          try {
            return await ex.fetchBalance();
          } catch {
            return await ex.fetchBalance({ type: 'future' });
          }
        }
      };

      const balance: any = await fetchBal(exchange);

      const vst = balance.VST;
      const usdt = balance.USDT;
      const isVst = testnet && (Number(vst?.total || 0) > 0 || Number(vst?.free || 0) > 0);
      const chosen = isVst ? vst : (usdt || vst);

      const totalBalance = Number(chosen?.total ?? balance?.free?.USDT ?? balance?.free?.VST ?? 0);
      const freeBalance = Number(chosen?.free ?? balance?.free?.USDT ?? balance?.free?.VST ?? 0);
      const brlBalance = Number(balance.BRL?.total ?? balance?.free?.BRL ?? 0);

      const totalEquityUsd = totalBalance;

      return {
        walletBalance: isNaN(totalBalance) ? 0 : totalBalance,
        availableBalance: isNaN(freeBalance) ? 0 : freeBalance,
        unrealisedPnl: 0,
        equity: totalEquityUsd,
        coin: isVst ? 'VST' : 'USDT',
        fundingUsdt: 0,
        fundingBrl: 0,
        unifiedBrl: 0,
        brlBalance: isNaN(brlBalance) ? 0 : brlBalance,
        totalEquityUsd: isNaN(totalEquityUsd) ? 0 : totalEquityUsd
      };
    } catch (err: any) {
      console.error(`[BingXEngine] Erro ao buscar saldo ${clientId}:`, err.message);
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
  static async executeCopyTrade(clientId: string, payload: TradePayload, targetEnv?: 'REAL' | 'TESTNET'): Promise<{ success: boolean; orderId?: string; sizing?: SizingResult; error?: string }> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config || Number(config.is_active) === 0) {
      return { success: false, error: 'Cliente inativo.' };
    }

    let apiKeyEnc = config.bybit_api_key_enc;
    let apiSecretEnc = config.bybit_api_secret_enc;
    let testnet = config.bybit_testnet === 1;

    if (targetEnv === 'TESTNET') {
      apiKeyEnc = config.bybit_test_api_key_enc || config.bybit_api_key_enc;
      apiSecretEnc = config.bybit_test_api_secret_enc || config.bybit_api_secret_enc;
      testnet = true;
    } else if (targetEnv === 'REAL') {
      apiKeyEnc = config.bybit_real_api_key_enc || config.bybit_api_key_enc;
      apiSecretEnc = config.bybit_real_api_secret_enc || config.bybit_api_secret_enc;
      testnet = false;
    }

    if (!apiKeyEnc || !apiSecretEnc) {
      return { success: false, error: `Chaves de API não configuradas para o ambiente ${targetEnv || 'padrão'}.` };
    }

    try {
      const apiKey = decrypt(apiKeyEnc);
      const apiSecret = decrypt(apiSecretEnc);
      const exchange = createBybitClient(apiKey, apiSecret, testnet);

      const ccxtSymbol = toBybitLinear(payload.symbol);

      await exchange.loadMarkets();
      const market = exchange.market(ccxtSymbol);
      const minQty = toValidNumber(market.limits?.amount?.min, 0.001);
      const qtyStep = toValidNumber(market.precision?.amount, 0.001);

      const accountInfo = await BybitExecutionEngine.getAccountBalance(clientId, targetEnv);
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
      const actualNotionalUsd = cleanQty * validEntryPrice;
      const actualMarginUsd = actualNotionalUsd / sizing.leverage;
      const conservativeOpenFeeUsd = actualNotionalUsd * 0.00055;
      const exchangePositions = await exchange.fetchPositions().catch(() => []);
      const activePositions = (exchangePositions as any[]).filter((position: any) => Number(position?.contracts || 0) > 0);
      const existingMarginUsd = activePositions.reduce((sum: number, position: any) => {
        const reportedMargin = Number(position?.initialMargin ?? position?.info?.positionIM ?? 0);
        if (Number.isFinite(reportedMargin) && reportedMargin > 0) return sum + reportedMargin;
        const contracts = Number(position?.contracts || 0);
        const markPrice = Number(position?.markPrice ?? position?.entryPrice ?? 0);
        const positionLeverage = Number(position?.leverage || sizing.leverage);
        return sum + (contracts > 0 && markPrice > 0 && positionLeverage > 0 ? contracts * markPrice / positionLeverage : 0);
      }, 0);
      const capacity = assessClientMarginCapacity({
        equityUsd: Math.max(0, Number(accountInfo?.equity || balance)),
        availableUsd: balance,
        existingMarginUsd,
        existingPositionCount: activePositions.length,
        newMarginUsd: actualMarginUsd,
        openFeeUsd: conservativeOpenFeeUsd,
        maxMarginUsagePct: 0.30,
        maxOpenPositions: Math.max(1, Number(config.max_open_positions || 2))
      });
      if (!capacity.approved) {
        return {
          success: false,
          error: `${capacity.reason}: margem projetada $${capacity.projectedMarginUsd.toFixed(2)} / limite $${capacity.maximumMarginUsd.toFixed(2)}; necessidade imediata $${capacity.requiredAvailableUsd.toFixed(2)}.`
        };
      }

      const sideArg = payload.side === 'BUY' ? 'LONG' : 'SHORT';
      const marginModeError = await exchange.setMarginMode('isolated', ccxtSymbol, { side: sideArg }).catch((error: any) => error);
      const leverageError = await exchange.setLeverage(sizing.leverage, ccxtSymbol, { side: sideArg }).catch(async (error: any) => {
        // Fallback para BOTH caso o modo de posição seja unilateral
        return await exchange.setLeverage(sizing.leverage, ccxtSymbol, { side: 'BOTH' }).catch(() => error);
      });
      const configuredPositions = await exchange.fetchPositions([ccxtSymbol]).catch(() => []);
      const configuration = verifyIsolatedLeverage(configuredPositions, ccxtSymbol, sizing.leverage);
      if (!configuration.verified && configuration.reason !== 'NENHUMA_POSICAO_ENCONTRADA') {
        const apiHint = marginModeError instanceof Error || leverageError instanceof Error
          ? ` (${marginModeError?.message || leverageError?.message || 'API recusou a configuração'})`
          : '';
        return { success: false, error: `${configuration.reason}${apiHint}. Ordem não enviada.` };
      }

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

      const trailingConfiguration = calculateTrailingConfiguration({
        entryPrice: validEntryPrice,
        takeProfit: validTakeProfit,
        side: payload.side
      });

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
      const entryOrderState = classifyBybitOrderState(order);

      // Se o Trailing Stop estiver ATIVADO, programa no endpoint nativo se suportado
      if (trailingAtivo && (entryOrderState === 'PREENCHIDA' || entryOrderState === 'PARCIAL')) {
        try {
          const rawSymbol = ccxtSymbol.replace('/', '').split(':')[0];
          if (!trailingConfiguration) throw new Error('Take Profit inválido para trailing stop.');
          const callbackDistance = Number(exchange.priceToPrecision(ccxtSymbol, trailingConfiguration.callbackDistance));
          const activationPrice = Number(exchange.priceToPrecision(ccxtSymbol, trailingConfiguration.activationPrice));

          if (!isNaN(callbackDistance) && callbackDistance > 0 && !isNaN(activationPrice) && activationPrice > 0) {
            if (typeof exchange.privatePostV5PositionSetTradingStop === 'function') {
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
          }
        } catch (e: any) {
          console.warn(`[ExecutionEngine] Aviso ao programar Trailing Stop: ${e?.message}`);
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
        status: entryOrderState,
        signal_reason: payload.signalReason,
        bybitOrderId: order.id,
        entry_time: Date.now()
      });

      const feePaid = Number((sizing.notionalUsd * (isMaker ? 0.0002 : 0.0005)).toFixed(4));

      (GoogleSheetsService.logTradeExecution as any)({
        clientName: 'BingX Swap (USDT-M)',
        symbol: payload.symbol,
        side: payload.side,
        entryPrice: validEntryPrice,
        qty: cleanQty,
        stopLoss: validStopLoss,
        takeProfit: validTakeProfit,
        status: entryOrderState,
        orderType: orderType.toUpperCase(),
        trailingStopAtivo: trailingAtivo ? 'SIM' : 'NÃO',
        feePaid,
        pnlTeoricoSemTrailing: `Alvo Fixo: +${(Math.abs(validTakeProfit - validEntryPrice) / validEntryPrice * 100).toFixed(2)}% | SL: -${(Math.abs(validEntryPrice - validStopLoss) / validEntryPrice * 100).toFixed(2)}%`,
        timestamp: new Date().toISOString()
      });

      return { success: true, orderId: order.id, sizing };
    } catch (err: any) {
      console.error(`[BingXEngine] Erro ao executar ordem ${clientId}:`, err.message);

      (GoogleSheetsService.logTradeExecution as any)({
        clientName: 'BingX Swap (USDT-M)',
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

  static async panicCloseAll(clientId: string, targetEnv?: 'REAL' | 'TESTNET'): Promise<{ success: boolean; closedCount: number; cancelledCount: number; errors: string[] }> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config) {
      return { success: false, closedCount: 0, cancelledCount: 0, errors: ['Cliente não encontrado'] };
    }

    let apiKeyEnc = config.bybit_api_key_enc;
    let apiSecretEnc = config.bybit_api_secret_enc;
    let testnet = config.bybit_testnet === 1;

    if (targetEnv === 'TESTNET') {
      apiKeyEnc = config.bybit_test_api_key_enc || config.bybit_api_key_enc;
      apiSecretEnc = config.bybit_test_api_secret_enc || config.bybit_api_secret_enc;
      testnet = true;
    } else if (targetEnv === 'REAL') {
      apiKeyEnc = config.bybit_real_api_key_enc || config.bybit_api_key_enc;
      apiSecretEnc = config.bybit_real_api_secret_enc || config.bybit_api_secret_enc;
      testnet = false;
    }

    if (!apiKeyEnc || !apiSecretEnc) {
      return { success: false, closedCount: 0, cancelledCount: 0, errors: ['Chaves de API não configuradas para este ambiente'] };
    }

    const errors: string[] = [];
    let closedCount = 0;
    let cancelledCount = 0;

    try {
      const apiKey = decrypt(apiKeyEnc);
      const apiSecret = decrypt(apiSecretEnc);
      const exchange = createBybitClient(apiKey, apiSecret, testnet);

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
