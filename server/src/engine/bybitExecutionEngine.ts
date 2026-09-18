import ccxt from 'ccxt';
import { decrypt } from '../utils/crypto.js';
import { ClientConfigDB, TradeHistoryDB } from '../database/db.js';
import { maskApiKey } from '../utils/crypto.js';
import { runShadowAudit } from './shadowAuditor.js';
import { GoogleSheetsService } from '../services/googleSheetsService.js';

export interface BybitAccountInfo {
  walletBalance: number;
  availableBalance: number;
  unrealisedPnl: number;
  equity: number;
  coin: string;
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
  symbol: string;        // ex: BTC/USDT:USDT (formato CCXT)
  side: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  signalReason: string;
}

export interface SizingResult {
  qty: number;
  notionalUsd: number;
  marginUsd: number;
  leverage: number;
  stopDistPct: number;
}

/**
 * Normaliza símbolo para formato Bybit Linear Perpetuals
 * BTC/USDT → BTCUSDT (para a API REST da Bybit)
 * BTC/USDT → BTC/USDT:USDT (para CCXT unified)
 */
function toBybitLinear(symbol: string): string {
  // BTC/USDT → BTC/USDT:USDT (CCXT unified format for Linear Perpetuals)
  if (symbol.includes(':')) return symbol; // já está no formato correto
  const [base, quote] = symbol.split('/');
  if (!base || !quote) return symbol;
  return `${base}/${quote}:${quote}`;
}

/**
 * Cria instância CCXT Bybit para o cliente
 * Suporta domínio alternativo oficial da Bybit (bytick.com) para contornar bloqueios regionais do CloudFront em servidores cloud como Railway (EUA/AWS)
 */
function createBybitClient(apiKey: string, apiSecret: string, testnet: boolean, useAlternateDomain: boolean = false): any {
  const exchange = new ccxt.bybit({
    apiKey,
    secret: apiSecret,
    options: {
      defaultType: 'linear', // Linear Perpetuals (USDT-margined)
    }
  });

  if (testnet) {
    exchange.setSandboxMode(true);
  } else if (useAlternateDomain) {
    // Domínio oficial alternativo global da Bybit sem bloqueio regional CloudFront
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

/**
 * Calcula o tamanho da posição baseado em Risk% e distância do Stop Loss
 * Fórmula institucional: Notional = RiskUsd / StopDistPct
 * Margem = Notional / Leverage
 */
export function calculatePositionSize(params: {
  balance: number;
  riskPct: number;
  entryPrice: number;
  stopLoss: number;
  leverage: number;
  minQty: number;
  qtyStep: number;
}): SizingResult {
  const { balance, riskPct, entryPrice, stopLoss, leverage, minQty, qtyStep } = params;

  const stopDistPct = Math.abs(entryPrice - stopLoss) / entryPrice;
  if (stopDistPct <= 0) throw new Error('StopLoss inválido — distância zero.');

  const riskUsd = balance * (riskPct / 100);
  const notionalUsd = riskUsd / stopDistPct;
  const marginUsd = notionalUsd / leverage;

  // Normalizar qty pelo stepSize da corretora
  let qty = notionalUsd / entryPrice;
  qty = Math.floor(qty / qtyStep) * qtyStep;
  qty = Math.max(qty, minQty);

  return {
    qty: Number(qty.toFixed(8)),
    notionalUsd: Number((qty * entryPrice).toFixed(2)),
    marginUsd: Number(marginUsd.toFixed(2)),
    leverage,
    stopDistPct: Number((stopDistPct * 100).toFixed(3))
  };
}

export class BybitExecutionEngine {

  /**
   * Testa conexão com a API do cliente e retorna info da conta
   */
  static async connectAndValidate(clientId: string): Promise<{ success: boolean; accountInfo?: BybitAccountInfo; maskedKey?: string; error?: string }> {
    const config = await ClientConfigDB.findByClientId(clientId);
    if (!config || !config.bybit_api_key_enc || !config.bybit_api_secret_enc) {
      return { success: false, error: 'Chaves de API não configuradas para este cliente.' };
    }

    try {
      const apiKey = decrypt(config.bybit_api_key_enc);
      const apiSecret = decrypt(config.bybit_api_secret_enc);
      const testnet = Number(config.bybit_testnet) === 1;

      let exchange = createBybitClient(apiKey, apiSecret, testnet, false);

      // Função auxiliar para tentar buscar o saldo
      const fetchAccountBal = async (ex: any) => {
        try {
          return await ex.fetchBalance({ type: 'unified' });
        } catch (e: any) {
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
        // Se houver bloqueio CloudFront / 403 Forbidden por região dos servidores do Railway
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

      // Atualizar status de conexão no banco
      await ClientConfigDB.setApiConnected(clientId, true);
      await ClientConfigDB.updateBalance(clientId, accountInfo.walletBalance);

      return {
        success: true,
        accountInfo,
        maskedKey: maskApiKey(apiKey)
      };
    } catch (err: any) {
      await ClientConfigDB.setApiConnected(clientId, false);
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

  /**
   * Busca saldo real da conta Bybit do cliente
   */
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

      const usdt = balance.USDT || balance.total;
      const totalBalance = Number(usdt?.total ?? balance?.free?.USDT ?? 0);
      const freeBalance = Number(usdt?.free ?? balance?.free?.USDT ?? 0);

      return {
        walletBalance: isNaN(totalBalance) ? 0 : totalBalance,
        availableBalance: isNaN(freeBalance) ? 0 : freeBalance,
        unrealisedPnl: 0,
        equity: isNaN(totalBalance) ? 0 : totalBalance,
        coin: 'USDT'
      };
    } catch (err: any) {
      console.error(`[BybitEngine] Erro ao buscar saldo ${clientId}:`, err.message);
      return null;
    }
  }

  /**
   * Busca posições abertas reais do cliente
   */
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
   * Executa uma ordem de copy trade para o cliente com sizing automático
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

      // Buscar informações do mercado (minQty, stepSize)
      await exchange.loadMarkets();
      const market = exchange.market(ccxtSymbol);
      const minQty = market.limits?.amount?.min ?? 0.001;
      const qtyStep = market.precision?.amount ?? 0.001;

      // Calcular tamanho da posição lendo banca ao vivo da Bybit
      const accountInfo = await BybitExecutionEngine.getAccountBalance(clientId);
      const liveBalance = accountInfo?.equity && accountInfo.equity > 0 ? accountInfo.equity : Number(config.balance);
      const balance = liveBalance > 0 ? liveBalance : 100;
      const sizing = calculatePositionSize({
        balance,
        riskPct: Number(config.risk_pct),
        entryPrice: payload.entryPrice,
        stopLoss: payload.stopLoss,
        leverage: Number(config.leverage),
        minQty,
        qtyStep: typeof qtyStep === 'number' ? qtyStep : 0.001
      });

      // Configurar alavancagem isolada ANTES de abrir a posição
      await exchange.setLeverage(Number(config.leverage), ccxtSymbol, { marginMode: 'isolated' }).catch(() => {});

      // 🛡️ SHADOW AUDIT (MODO FANTASMA): Dispara em background sem bloquear ou atrasar a thread principal
      runShadowAudit(exchange, ccxtSymbol, payload.side).catch((err) => {
        console.error(`\x1b[31m[SHADOW FATAL ERROR] ${err?.message || err}\x1b[0m`);
      });

      // Executar ordem Market com TP e SL embutidos
      const side = payload.side === 'BUY' ? 'buy' : 'sell';
      const order = await exchange.createOrder(
        ccxtSymbol,
        'market',
        side,
        sizing.qty,
        undefined,
        {
          stopLoss: { type: 'market', price: payload.stopLoss },
          takeProfit: { type: 'market', price: payload.takeProfit }
        }
      );

      // Registrar no histórico local
      const tradeId = `trade-${clientId}-${Date.now()}`;
      await TradeHistoryDB.insert({
        id: tradeId,
        client_id: clientId,
        symbol: payload.symbol,
        side: payload.side,
        entry_price: payload.entryPrice,
        qty: sizing.qty,
        notional_usd: sizing.notionalUsd,
        leverage: Number(config.leverage),
        status: 'OPEN',
        signal_reason: payload.signalReason,
        bybitOrderId: order.id,
        entry_time: Date.now()
      });

      GoogleSheetsService.logTradeExecution({
        symbol: payload.symbol,
        side: payload.side,
        entryPrice: payload.entryPrice,
        qty: sizing.qty,
        stopLoss: payload.stopLoss,
        takeProfit: payload.takeProfit,
        status: 'EXECUTADO',
        timestamp: new Date().toISOString()
      });

      return { success: true, orderId: order.id, sizing };
    } catch (err: any) {
      console.error(`[BybitEngine] Erro ao executar ordem ${clientId}:`, err.message);

      GoogleSheetsService.logTradeExecution({
        symbol: payload.symbol,
        side: payload.side,
        entryPrice: payload.entryPrice,
        qty: 0,
        stopLoss: payload.stopLoss,
        takeProfit: payload.takeProfit,
        status: 'FALHA',
        timestamp: new Date().toISOString(),
        errorMsg: err.message
      });

      return { success: false, error: err.message };
    }
  }

  /**
   * Busca histórico de trades da Bybit (últimas 100 operações)
   */
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

  /**
   * Pânico / Desconexão de Emergência:
   * Cancela todas as ordens abertas e encerra a mercado todas as posições ativas na Bybit
   */
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

      // 1. Cancelar todas as ordens ativas
      try {
        const cancelled = await exchange.cancelAllOrders();
        cancelledCount = Array.isArray(cancelled) ? cancelled.length : 1;
      } catch (err: any) {
        console.warn(`[PanicClose] Erro ao cancelar ordens para ${clientId}:`, err.message);
        errors.push(`Erro ao cancelar ordens: ${err.message}`);
      }

      // 2. Buscar posições ativas e fechar a mercado
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
