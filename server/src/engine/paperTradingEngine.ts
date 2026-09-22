import { FlowSignal } from '../../../shared/types';
import { SimulatedTrade, PaperAccount } from '../../../shared/paperTypes';
import { AutoPairSelectorEngine } from './autoPairSelectorEngine';
import { QuantStrategyEngine } from './quantStrategyEngine';
import { validateOrderMarginAndLot, getMinLot } from '../database/paperStorage.js';

export interface SimulatedTradeWithTrailing extends SimulatedTrade {
  trailingActive?: boolean;
  trailingTriggerPrice?: number;
  trailingStopPrice?: number;
}

// ─── Validador de Margem e Lote Mínimo (Bybit USDT Perpétuos) ────────────────
export function validateOrderExecution(
  symbol: string,
  price: number,
  qty: number,
  balance: number,
  leverage = 10,
  isMaker = false
): { valid: boolean; reason?: string; marginRequired: number; fee: number } {
  return validateOrderMarginAndLot(symbol, price, qty, balance, leverage, isMaker);
}

export class PaperTradingEngine {
  private initialBalance: number = 10000;
  private balance: number = 10000;
  private realizedPnl: number = 0;
  private openPositions: Map<string, SimulatedTradeWithTrailing> = new Map();
  private history: SimulatedTradeWithTrailing[] = [];
  private onUpdateCallback?: (account: PaperAccount, newTradeEvent?: SimulatedTrade) => void;
  private activePairs: Set<string> = new Set(['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT']);
  private minTemperature: number = 1.5;
  private trailingStopEnabled: boolean = true;

  public setTrailingStopEnabled(enabled: boolean) {
    this.trailingStopEnabled = enabled;
  }

  constructor(onUpdate?: (account: PaperAccount, newTradeEvent?: SimulatedTrade) => void) {
    this.onUpdateCallback = onUpdate;
  }

  public setInitialBalance(newBalance: number) {
    if (newBalance > 0) {
      this.initialBalance = newBalance;
      this.balance = newBalance;
      this.realizedPnl = 0;
      this.openPositions.clear();
      this.history = [];
      this.broadcastUpdate();
    }
  }

  public resetData(customBalance?: number) {
    const targetBalance = customBalance || this.initialBalance;
    this.initialBalance = targetBalance;
    this.balance = targetBalance;
    this.realizedPnl = 0;
    this.openPositions.clear();
    this.history = [];
    this.broadcastUpdate();
  }

  public setActivePairs(pairs: string[]) {
    this.activePairs = new Set(pairs);
  }

  public getActivePairs(): string[] {
    return Array.from(this.activePairs);
  }

  public setMinTemperature(temp: number) {
    this.minTemperature = Math.max(1.5, temp);
  }

  public getMinTemperature(): number {
    return this.minTemperature;
  }

  public hydrateFromStorage(account: { balance: number; realizedPnl: number; openPositions: SimulatedTradeWithTrailing[]; history: SimulatedTradeWithTrailing[] }) {
    this.balance = account.balance;
    this.realizedPnl = account.realizedPnl;
    this.openPositions.clear();
    for (const t of account.openPositions) {
      this.openPositions.set(t.symbol, t);
    }
    this.history = [...account.history];
    this.broadcastUpdate();
  }

  // Executa uma entrada automatizada SEM REPAINT quando um sinal de fluxo qualificado ocorre
  public handleSignal(signal: FlowSignal, currentPrice: number) {
    // 1. Verificar se o par está habilitado pelo usuário
    if (!this.activePairs.has(signal.symbol)) {
      return;
    }

    // 2. Verificar se o par está ativo para trading de acordo com o Consultor IA
    const pairConfig = AutoPairSelectorEngine.getPairConfig(signal.symbol);
    if (pairConfig && !pairConfig.isActiveForTrading) {
      return;
    }

    // 3. Se já tem posição aberta nesse ativo, não faz overtrading
    if (this.openPositions.has(signal.symbol)) {
      return;
    }

    let tradeType: 'BUY' | 'SELL' | null = null;

    // Calibração de SL / TP específica por ativo baseada no perfil de volatilidade (Razão R:R de 2.5R mantida)
    const coinRiskProfiles: Record<string, { sl: number; tp: number }> = {
      'BTC/USDT': { sl: 0.0080, tp: 0.0200 }, // 0.8% SL / 2.0% TP
      'ETH/USDT': { sl: 0.0100, tp: 0.0250 }, // 1.0% SL / 2.5% TP (Padrão ouro)
      'SOL/USDT': { sl: 0.0140, tp: 0.0350 }, // 1.4% SL / 3.5% TP
      'BNB/USDT': { sl: 0.0090, tp: 0.0225 }, // 0.9% SL / 2.25% TP
      'XRP/USDT': { sl: 0.0120, tp: 0.0300 }  // 1.2% SL / 3.0% TP
    };

    const riskProfile = coinRiskProfiles[signal.symbol] || { sl: 0.0100, tp: 0.0250 };
    const slDistancePct = riskProfile.sl;
    const tpDistancePct = riskProfile.tp;

    if (signal.type === 'ABSORPTION_BUY') {
      tradeType = 'SELL';
    } else if (signal.type === 'ABSORPTION_SELL') {
      tradeType = 'BUY';
    } else if (signal.type === 'BOOK_IMBALANCE' && signal.volume > 0) {
      if (signal.message.includes('Compradores com')) tradeType = 'BUY';
      else if (signal.message.includes('Vendedores com')) tradeType = 'SELL';
    }

    if (!tradeType) return;

    const decimals = currentPrice < 5 ? 4 : (currentPrice < 100 ? 3 : 2);
    const stopLoss = tradeType === 'BUY'
      ? Number((currentPrice * (1 - slDistancePct)).toFixed(decimals))
      : Number((currentPrice * (1 + slDistancePct)).toFixed(decimals));

    const takeProfit = tradeType === 'BUY'
      ? Number((currentPrice * (1 + tpDistancePct)).toFixed(decimals))
      : Number((currentPrice * (1 - tpDistancePct)).toFixed(decimals));

    // Preço do Gatilho do Trailing Stop (80% do Alvo de Lucro)
    const trailingTriggerPrice = tradeType === 'BUY'
      ? Number((currentPrice * (1 + (0.80 * tpDistancePct))).toFixed(decimals))
      : Number((currentPrice * (1 - (0.80 * tpDistancePct))).toFixed(decimals));

    // Potência proporcional à banca (20% por trade padrão)
    const baseAllocation = Math.max(100, this.balance * 0.20);
    const powerMultiplier = Math.max(this.minTemperature, pairConfig?.powerMultiplier || 1.5);
    const temperature = pairConfig?.temperature || 'HOT_MAX_EXTRACT';
    const powerLabel = ` [Potência ${powerMultiplier.toFixed(1)}x]`;

    const now = Date.now();
    const session = QuantStrategyEngine.determineSession(now);
    const dayOfWeek = QuantStrategyEngine.determineDayOfWeek(now);
    const regime = pairConfig?.regime || 'TREND';

    const newTrade: SimulatedTradeWithTrailing = {
      id: `sim-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      symbol: signal.symbol,
      type: tradeType,
      entryPrice: currentPrice,
      currentPrice: currentPrice,
      takeProfit,
      stopLoss,
      pnlUsd: 0,
      pnlPct: 0,
      rMultiple: 0,
      powerMultiplier,
      temperature,
      session,
      dayOfWeek,
      marketRegime: regime,
      status: 'OPEN',
      entryTime: Math.floor(now / 1000),
      signalReason: `${signal.message}${powerLabel}`,
      trailingActive: false,
      trailingTriggerPrice,
      trailingStopPrice: undefined
    };

    this.openPositions.set(signal.symbol, newTrade);
    this.broadcastUpdate(newTrade);
  }

  // Atualiza preço a cada tick em tempo real e verifica Trailing Stop / TP / SL
  public updatePrice(symbol: string, currentPrice: number) {
    const trade = this.openPositions.get(symbol);
    if (!trade) return;

    trade.currentPrice = currentPrice;

    const baseAllocation = Math.max(100, this.balance * 0.20);
    const notionalSize = baseAllocation * (trade.powerMultiplier / 1.5);

    const priceDeltaPct = trade.type === 'BUY'
      ? (currentPrice - trade.entryPrice) / trade.entryPrice
      : (trade.entryPrice - currentPrice) / trade.entryPrice;

    trade.pnlPct = Number((priceDeltaPct * 100).toFixed(2));
    trade.pnlUsd = Number((notionalSize * priceDeltaPct).toFixed(2));

    // Determina o perfil de risco do ativo
    const coinRiskProfiles: Record<string, { sl: number; tp: number }> = {
      'BTC/USDT': { sl: 0.0080, tp: 0.0200 },
      'ETH/USDT': { sl: 0.0100, tp: 0.0250 },
      'SOL/USDT': { sl: 0.0140, tp: 0.0350 },
      'BNB/USDT': { sl: 0.0090, tp: 0.0225 },
      'XRP/USDT': { sl: 0.0120, tp: 0.0300 }
    };
    const riskProfile = coinRiskProfiles[symbol] || { sl: 0.0100, tp: 0.0250 };
    const tpDistancePct = riskProfile.tp;
    const slDistancePct = riskProfile.sl;
    const decimals = currentPrice < 5 ? 4 : (currentPrice < 100 ? 3 : 2);

    // Progresso em relação ao objetivo (1.0 = 100% do alvo atingido)
    const progressRatio = priceDeltaPct / tpDistancePct;
    const trailingDistance = trade.entryPrice * (0.20 * tpDistancePct); // Distância móvel de 20% do alvo

    let closed = false;

    // ─── 1. VERIFICAÇÃO DO GATILHO E GESTÃO DO TRAILING STOP ─────────────────
    // Só persegue o preço se o botão Trailing Stop estiver ATIVADO
    if (this.trailingStopEnabled && (progressRatio >= 0.80 || trade.trailingActive)) {
      trade.trailingActive = true;

      if (trade.type === 'BUY') {
        const candidateStop = currentPrice - trailingDistance;
        if (!trade.trailingStopPrice || candidateStop > trade.trailingStopPrice) {
          trade.trailingStopPrice = Number(candidateStop.toFixed(decimals));
        }

        // Se o preço recuar e tocar no trailing stop: realiza lucro!
        if (currentPrice <= trade.trailingStopPrice) {
          trade.status = 'CLOSED_TP';
          trade.rMultiple = Number((trade.pnlPct / (slDistancePct * 100)).toFixed(2));
          closed = true;
        }
      } else {
        // Operação de VENDA (SHORT)
        const candidateStop = currentPrice + trailingDistance;
        if (!trade.trailingStopPrice || candidateStop < trade.trailingStopPrice) {
          trade.trailingStopPrice = Number(candidateStop.toFixed(decimals));
        }

        // Se o preço subir e tocar no trailing stop: realiza lucro!
        if (currentPrice >= trade.trailingStopPrice) {
          trade.status = 'CLOSED_TP';
          trade.rMultiple = Number((trade.pnlPct / (slDistancePct * 100)).toFixed(2));
          closed = true;
        }
      }
    } else {
      // Se estiver DESATIVADO (FIXO), respeita apenas o Stop Loss inicial
      if (
        (trade.type === 'BUY' && currentPrice <= trade.stopLoss) ||
        (trade.type === 'SELL' && currentPrice >= trade.stopLoss)
      ) {
        trade.status = 'CLOSED_SL';
        trade.rMultiple = -1.0;
        closed = true;
      }
    }

    // ─── 3. TRAVA DE SEGUNDA CAMADA: CASO O PREÇO SALTE DIRETO NO TP 100% ────
    if (!closed) {
      if (
        (trade.type === 'BUY' && currentPrice >= trade.takeProfit) ||
        (trade.type === 'SELL' && currentPrice <= trade.takeProfit)
      ) {
        trade.status = 'CLOSED_TP';
        trade.rMultiple = 2.5;
        closed = true;
      }
    }

    // Se a posição encerrou, liquida e atualiza histórico
    if (closed) {
      trade.closeTime = Math.floor(Date.now() / 1000);
      this.realizedPnl += trade.pnlUsd;
      this.balance += trade.pnlUsd;
      this.history.unshift(trade);
      if (this.history.length > 100) this.history.pop();
      this.openPositions.delete(symbol);
      this.broadcastUpdate(trade);
    } else {
      this.broadcastUpdate();
    }
  }

  public getAccountState(): PaperAccount {
    const openTrades = Array.from(this.openPositions.values());
    const unrealizedPnl = openTrades.reduce((sum, t) => sum + t.pnlUsd, 0);
    const winning = this.history.filter(t => t.status === 'CLOSED_TP').length;
    const total = this.history.length;
    const winRate = total > 0 ? Number(((winning / total) * 100).toFixed(1)) : 0;

    return {
      balance: Number(this.balance.toFixed(2)),
      equity: Number((this.balance + unrealizedPnl).toFixed(2)),
      winRate,
      totalTrades: total,
      winningTrades: winning,
      losingTrades: total - winning,
      realizedPnl: Number(this.realizedPnl.toFixed(2)),
      openPositions: openTrades,
      history: this.history
    };
  }

  private broadcastUpdate(eventTrade?: SimulatedTrade) {
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.getAccountState(), eventTrade);
    }
  }
}

// ─── Mirror Trading Engine (Conta Espelho com Taxas Bybit) ─────────────────────
const BYBIT_FEES = { maker: 0.0002, taker: 0.00055 };
const DEFAULT_LEVERAGE = 10;
const DEFAULT_ALLOCATION_PCT = 0.20; // 20% da banca por trade

export class MirrorTradingEngine {
  private initialBalance: number = 500;
  private balance: number = 500;
  private realizedPnl: number = 0;
  private openPositions: Map<string, SimulatedTradeWithTrailing> = new Map();
  private history: SimulatedTradeWithTrailing[] = [];
  private onUpdateCallback?: (account: PaperAccount, newTradeEvent?: SimulatedTrade) => void;
  private activePairs: Set<string> = new Set(['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT']);
  private minTemperature: number = 1.5;
  private trailingStopEnabled: boolean = true;

  public setTrailingStopEnabled(enabled: boolean) {
    this.trailingStopEnabled = enabled;
  }

  constructor(onUpdate?: (account: PaperAccount, newTradeEvent?: SimulatedTrade) => void) {
    this.onUpdateCallback = onUpdate;
  }

  public setInitialBalance(newBalance: number) {
    if (newBalance > 0) {
      this.initialBalance = newBalance;
      this.balance = newBalance;
      this.realizedPnl = 0;
      this.openPositions.clear();
      this.history = [];
      this.broadcastUpdate();
    }
  }

  public resetData(customBalance?: number) {
    const targetBalance = customBalance || this.initialBalance;
    this.initialBalance = targetBalance;
    this.balance = targetBalance;
    this.realizedPnl = 0;
    this.openPositions.clear();
    this.history = [];
    this.broadcastUpdate();
  }

  public setActivePairs(pairs: string[]) {
    this.activePairs = new Set(pairs);
  }

  public getActivePairs(): string[] {
    return Array.from(this.activePairs);
  }

  public setMinTemperature(temp: number) {
    this.minTemperature = Math.max(1.5, temp);
  }

  public getMinTemperature(): number {
    return this.minTemperature;
  }

  public hydrateFromStorage(account: { balance: number; realizedPnl: number; openPositions: SimulatedTradeWithTrailing[]; history: SimulatedTradeWithTrailing[] }) {
    this.balance = account.balance;
    this.realizedPnl = account.realizedPnl;
    this.openPositions.clear();
    for (const t of account.openPositions) {
      this.openPositions.set(t.symbol, t);
    }
    this.history = [...account.history];
    this.broadcastUpdate();
  }

  // Replica ordem do Master na conta Espelho com dedução de taxas
  public replicateMasterTrade(masterTrade: SimulatedTradeWithTrailing, isMaker = false): { success: boolean; error?: string } {
    // 1. Verificar se o par está habilitado
    if (!this.activePairs.has(masterTrade.symbol)) {
      return { success: false, error: `Par ${masterTrade.symbol} não está ativo no espelho` };
    }

    // 2. Verificar se já tem posição aberta
    if (this.openPositions.has(masterTrade.symbol)) {
      return { success: false, error: `Já existe posição aberta em ${masterTrade.symbol} no espelho` };
    }

    // 3. Validar margem e lote mínimo com taxas
    const validation = validateOrderMarginAndLot(
      masterTrade.symbol,
      masterTrade.entryPrice,
      masterTrade.qty || this.calculateQty(masterTrade),
      this.balance,
      DEFAULT_LEVERAGE,
      isMaker
    );

    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    // 4. Calcular quantidade baseada na alocação proporcional (mesmo % do master)
    const masterAllocation = masterTrade.qty || this.calculateQty(masterTrade);
    const qty = masterAllocation;

    // 5. Calcular taxas
    const notional = masterTrade.entryPrice * qty;
    const feeRate = isMaker ? BYBIT_FEES.maker : BYBIT_FEES.taker;
    const openFee = notional * feeRate;

    // 6. Criar trade espelho
    const newTrade: SimulatedTradeWithTrailing = {
      id: `mirror-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      symbol: masterTrade.symbol,
      type: masterTrade.type,
      entryPrice: masterTrade.entryPrice,
      currentPrice: masterTrade.entryPrice,
      takeProfit: masterTrade.takeProfit,
      stopLoss: masterTrade.stopLoss,
      pnlUsd: -openFee, // Inicia com taxa de abertura negativa
      pnlPct: 0,
      rMultiple: 0,
      powerMultiplier: masterTrade.powerMultiplier,
      temperature: masterTrade.temperature,
      session: masterTrade.session,
      dayOfWeek: masterTrade.dayOfWeek,
      marketRegime: masterTrade.marketRegime,
      status: 'OPEN',
      entryTime: masterTrade.entryTime,
      signalReason: `[MIRROR] ${masterTrade.signalReason}`,
      trailingActive: false,
      trailingTriggerPrice: masterTrade.trailingTriggerPrice,
      trailingStopPrice: undefined,
      qty,
      fee: openFee,
      netPnl: -openFee
    };

    this.balance -= openFee; // Deduz taxa de abertura imediatamente
    this.openPositions.set(masterTrade.symbol, newTrade);
    this.broadcastUpdate(newTrade);
    return { success: true };
  }

  // Atualiza preço e verifica TP/SL/Trailing no espelho
  public updatePrice(symbol: string, currentPrice: number) {
    const trade = this.openPositions.get(symbol);
    if (!trade) return;

    trade.currentPrice = currentPrice;

    const notional = trade.entryPrice * (trade.qty || this.calculateQty(trade));
    const priceDeltaPct = trade.type === 'BUY'
      ? (currentPrice - trade.entryPrice) / trade.entryPrice
      : (trade.entryPrice - currentPrice) / trade.entryPrice;

    trade.pnlPct = Number((priceDeltaPct * 100).toFixed(2));
    const grossPnl = notional * priceDeltaPct;
    
    // PnL líquido = bruto - taxa de abertura - taxa de fechamento (estimada)
    const closeFeeRate = BYBIT_FEES.taker; // Assume market close
    const closeFee = notional * closeFeeRate;
    const openFee = trade.fee ?? 0;
    trade.pnlUsd = Number((grossPnl - openFee - closeFee).toFixed(2));
    trade.netPnl = trade.pnlUsd;

    // Risk profile
    const coinRiskProfiles: Record<string, { sl: number; tp: number }> = {
      'BTC/USDT': { sl: 0.0080, tp: 0.0200 },
      'ETH/USDT': { sl: 0.0100, tp: 0.0250 },
      'SOL/USDT': { sl: 0.0140, tp: 0.0350 },
      'BNB/USDT': { sl: 0.0090, tp: 0.0225 },
      'XRP/USDT': { sl: 0.0120, tp: 0.0300 }
    };
    const riskProfile = coinRiskProfiles[symbol] || { sl: 0.0100, tp: 0.0250 };
    const tpDistancePct = riskProfile.tp;
    const slDistancePct = riskProfile.sl;
    const decimals = currentPrice < 5 ? 4 : (currentPrice < 100 ? 3 : 2);

    const progressRatio = priceDeltaPct / tpDistancePct;
    const trailingDistance = trade.entryPrice * (0.20 * tpDistancePct);

    let closed = false;

    // Trailing Stop
    if (this.trailingStopEnabled && (progressRatio >= 0.80 || trade.trailingActive)) {
      trade.trailingActive = true;
      if (trade.type === 'BUY') {
        const candidateStop = currentPrice - trailingDistance;
        if (!trade.trailingStopPrice || candidateStop > trade.trailingStopPrice) {
          trade.trailingStopPrice = Number(candidateStop.toFixed(decimals));
        }
        if (currentPrice <= trade.trailingStopPrice) {
          trade.status = 'CLOSED_TP';
          trade.rMultiple = Number((trade.pnlPct / (slDistancePct * 100)).toFixed(2));
          closed = true;
        }
      } else {
        const candidateStop = currentPrice + trailingDistance;
        if (!trade.trailingStopPrice || candidateStop < trade.trailingStopPrice) {
          trade.trailingStopPrice = Number(candidateStop.toFixed(decimals));
        }
        if (currentPrice >= trade.trailingStopPrice) {
          trade.status = 'CLOSED_TP';
          trade.rMultiple = Number((trade.pnlPct / (slDistancePct * 100)).toFixed(2));
          closed = true;
        }
      }
    } else {
      if (
        (trade.type === 'BUY' && currentPrice <= trade.stopLoss) ||
        (trade.type === 'SELL' && currentPrice >= trade.stopLoss)
      ) {
        trade.status = 'CLOSED_SL';
        trade.rMultiple = -1.0;
        closed = true;
      }
    }

    // TP direto
    if (!closed) {
      if (
        (trade.type === 'BUY' && currentPrice >= trade.takeProfit) ||
        (trade.type === 'SELL' && currentPrice <= trade.takeProfit)
      ) {
        trade.status = 'CLOSED_TP';
        trade.rMultiple = 2.5;
        closed = true;
      }
    }

    if (closed) {
      trade.closeTime = Math.floor(Date.now() / 1000);
      this.realizedPnl += trade.pnlUsd;
      this.balance += trade.pnlUsd;
      this.history.unshift(trade);
      if (this.history.length > 100) this.history.pop();
      this.openPositions.delete(symbol);
      this.broadcastUpdate(trade);
    } else {
      this.broadcastUpdate();
    }
  }

  // Fecha posição do espelho quando master fecha
  public closePosition(symbol: string, closePrice: number, isMaker = false): { success: boolean; pnl?: number } {
    const trade = this.openPositions.get(symbol);
    if (!trade) return { success: false };

    const notional = trade.entryPrice * (trade.qty || this.calculateQty(trade));
    const closeFee = notional * (isMaker ? BYBIT_FEES.maker : BYBIT_FEES.taker);
    const grossPnl = trade.type === 'BUY'
      ? (closePrice - trade.entryPrice) * (trade.qty || this.calculateQty(trade))
      : (trade.entryPrice - closePrice) * (trade.qty || this.calculateQty(trade));
    
    const openFee = trade.fee ?? 0;
    const netPnl = grossPnl - openFee - closeFee;
    
    trade.currentPrice = closePrice;
    trade.pnlUsd = Number(netPnl.toFixed(2));
    trade.netPnl = netPnl;
    trade.status = netPnl >= 0 ? 'CLOSED_TP' : 'CLOSED_SL';
    trade.closeTime = Math.floor(Date.now() / 1000);
    
    this.realizedPnl += netPnl;
    this.balance += netPnl;
    this.history.unshift(trade);
    if (this.history.length > 100) this.history.pop();
    this.openPositions.delete(symbol);
    this.broadcastUpdate(trade);
    
    return { success: true, pnl: netPnl };
  }

  private calculateQty(trade: SimulatedTradeWithTrailing): number {
    const baseAllocation = Math.max(100, this.balance * DEFAULT_ALLOCATION_PCT);
    const notionalSize = baseAllocation * (trade.powerMultiplier / 1.5);
    return notionalSize / trade.entryPrice;
  }

  public getAccountState(): PaperAccount {
    const openTrades = Array.from(this.openPositions.values());
    const unrealizedPnl = openTrades.reduce((sum, t) => sum + t.pnlUsd, 0);
    const winning = this.history.filter(t => t.status === 'CLOSED_TP').length;
    const total = this.history.length;
    const winRate = total > 0 ? Number(((winning / total) * 100).toFixed(1)) : 0;

    return {
      balance: Number(this.balance.toFixed(2)),
      equity: Number((this.balance + unrealizedPnl).toFixed(2)),
      winRate,
      totalTrades: total,
      winningTrades: winning,
      losingTrades: total - winning,
      realizedPnl: Number(this.realizedPnl.toFixed(2)),
      openPositions: openTrades,
      history: this.history
    };
  }

  private broadcastUpdate(eventTrade?: SimulatedTrade) {
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.getAccountState(), eventTrade);
    }
  }
}