import { FlowSignal } from '../../../shared/types';
import { SimulatedTrade, PaperAccount } from '../../../shared/paperTypes';
import { AutoPairSelectorEngine } from './autoPairSelectorEngine';
import { QuantStrategyEngine } from './quantStrategyEngine';
import { validateOrderMarginAndLot, getMinLot } from '../database/paperStorage.js';
import { calculateMasterMirrorSize } from './masterMirrorSizing.js';
import type { StrategyDecision } from './cryptoStrategyDecision.js';
import type { AdaptiveRiskResult } from './adaptiveRisk.js';

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
  public handleSignal(signal: FlowSignal, currentPrice: number, decision?: StrategyDecision, adaptiveRisk?: AdaptiveRiskResult) {
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

    if (!decision?.approved || !decision.stopLoss || !decision.takeProfit || !decision.trailingTrigger) {
      return;
    }
    if (adaptiveRisk && (!adaptiveRisk.approved || !adaptiveRisk.stopLoss || !adaptiveRisk.takeProfit || !adaptiveRisk.notionalUsd || !adaptiveRisk.riskUsd)) {
      return;
    }

    if (signal.type === 'ABSORPTION_BUY') {
      tradeType = 'SELL';
    } else if (signal.type === 'ABSORPTION_SELL') {
      tradeType = 'BUY';
    } else if (signal.type === 'BOOK_IMBALANCE' && signal.volume > 0) {
      if (signal.message.includes('Compradores com')) tradeType = 'BUY';
      else if (signal.message.includes('Vendedores com')) tradeType = 'SELL';
    }

    if (!tradeType || decision.entrySide !== tradeType) return;

    // 🛡️ Alvos e Stops Canônicos 2.5R Fixo por Ativo (Padrão Original do Deploy Funcional)
    const stopLoss = decision.stopLoss ?? adaptiveRisk?.stopLoss;
    const takeProfit = decision.takeProfit ?? adaptiveRisk?.takeProfit;
    const targetDistance = Math.abs((takeProfit || currentPrice) - currentPrice);
    const trailingTriggerPrice = Number((currentPrice + (tradeType === 'BUY' ? 1 : -1) * targetDistance * 0.8).toFixed(8));

    // Potência proporcional à banca (20% por trade padrão)
    const baseAllocation = Math.max(100, this.balance * 0.20);
    const powerMultiplier = Math.max(this.minTemperature, pairConfig?.powerMultiplier || 1.5);
    const temperature = pairConfig?.temperature || 'HOT_MAX_EXTRACT';
    const powerLabel = ` [Potência ${powerMultiplier.toFixed(1)}x]`;

    const now = Date.now();
    const session = QuantStrategyEngine.determineSession(now);
    const dayOfWeek = QuantStrategyEngine.determineDayOfWeek(now);
    const regime = pairConfig?.regime || 'TREND';

    const masterBalanceAtEntry = this.balance;
    const requestedNotional = Math.max(100, masterBalanceAtEntry * 0.20) * (powerMultiplier / 1.5);
    const openNotional = adaptiveRisk?.notionalUsd ?? requestedNotional;
    const qty = Number((openNotional / currentPrice).toFixed(8));
    const execution = validateOrderExecution(signal.symbol, currentPrice, qty, masterBalanceAtEntry, 10, false);
    if (!execution.valid) return;
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
      trailingStopPrice: undefined,
      qty,
      notionalUsd: openNotional,
      riskUsd: adaptiveRisk?.riskUsd ?? undefined,
      grossR: adaptiveRisk?.grossR ?? undefined,
      netR: adaptiveRisk?.netR ?? undefined,
      marginUsd: execution.marginRequired,
      masterExposureRatio: openNotional / masterBalanceAtEntry,
      masterBalanceAtEntry,
      strategyVersion: decision.profileVersion,
      decisionFactors: [
        ...decision.reasons,
        ...(adaptiveRisk ? [
          `STOP_ADAPTATIVO_${((adaptiveRisk.stopDistancePct || 0) * 100).toFixed(3)}%`,
          `RISCO_USD_${(adaptiveRisk.riskUsd || 0).toFixed(2)}`
        ] : [])
      ]
    };

    newTrade.fee = execution.fee;
    newTrade.netPnl = Number((-execution.fee).toFixed(4));

    this.openPositions.set(signal.symbol, newTrade);
    this.broadcastUpdate(newTrade);
  }

  // Atualiza preço a cada tick em tempo real e verifica Trailing Stop / TP / SL
  public updatePrice(symbol: string, currentPrice: number) {
    const trade = this.openPositions.get(symbol);
    if (!trade) return;

    trade.currentPrice = currentPrice;

    const notionalSize = trade.notionalUsd ?? (Math.max(100, this.balance * 0.20) * (trade.powerMultiplier / 1.5));

    const priceDeltaPct = trade.type === 'BUY'
      ? (currentPrice - trade.entryPrice) / trade.entryPrice
      : (trade.entryPrice - currentPrice) / trade.entryPrice;

    trade.pnlPct = Number((priceDeltaPct * 100).toFixed(2));
    trade.pnlUsd = Number((notionalSize * priceDeltaPct).toFixed(2));

    const tpDistancePct = Math.abs(trade.takeProfit - trade.entryPrice) / trade.entryPrice;
    const slDistancePct = Math.abs(trade.entryPrice - trade.stopLoss) / trade.entryPrice;
    if (!Number.isFinite(tpDistancePct) || tpDistancePct <= 0 || !Number.isFinite(slDistancePct) || slDistancePct <= 0) return;
    const decimals = currentPrice < 5 ? 4 : (currentPrice < 100 ? 3 : 2);

    // Progresso em relação ao objetivo (1.0 = 100% do alvo atingido)
    const progressRatio = priceDeltaPct / tpDistancePct;
    const trailingDistance = trade.entryPrice * (0.20 * tpDistancePct); // Distância móvel de 20% do alvo

    let closed = false;

    // ─── 1. VERIFICAÇÃO DO GATILHO E GESTÃO DO TRAILING STOP ─────────────────
    // Só persegue o preço se o botão Trailing Stop estiver ATIVADO
    if (this.trailingStopEnabled && (progressRatio >= 0.80 - 1e-9 || trade.trailingActive)) {
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
          trade.realizedR = trade.rMultiple;
          trade.closeReason = 'TRAILING';
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
          trade.realizedR = trade.rMultiple;
          trade.closeReason = 'TRAILING';
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
        trade.realizedR = trade.rMultiple;
        trade.closeReason = 'STOP_LOSS';
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
        trade.realizedR = trade.rMultiple;
        trade.closeReason = 'FIXED_TP';
        closed = true;
      }
    }

    // Se a posição encerrou, liquida e atualiza histórico (com fee round-trip)
    if (closed) {
      const closeNotional = trade.notionalUsd ?? (Math.max(100, this.balance * 0.20) * (trade.powerMultiplier / 1.5));
      const openFee = trade.fee ?? 0;
      const closeFee = Number((closeNotional * 0.00055).toFixed(4));
      trade.fee = Number((openFee + closeFee).toFixed(4));
      trade.netPnl = Number((trade.pnlUsd - openFee - closeFee).toFixed(4));
      const settlePnl = trade.netPnl;
      trade.closeTime = Math.floor(Date.now() / 1000);
      this.realizedPnl += settlePnl;
      this.balance += settlePnl;
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
      initialBalance: Number(this.initialBalance.toFixed(2)),
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
    const exposureRatio = masterTrade.masterExposureRatio
      ?? ((masterTrade.notionalUsd || (masterTrade.qty || 0) * masterTrade.entryPrice) / Math.max(masterTrade.masterBalanceAtEntry || 0, 1));
    const minQty = getMinLot(masterTrade.symbol);
    const sizing = calculateMasterMirrorSize({
      balanceUsd: this.balance,
      masterExposureRatio: exposureRatio,
      entryPrice: masterTrade.entryPrice,
      leverage: DEFAULT_LEVERAGE,
      minQty,
      qtyStep: minQty,
      feeRate: isMaker ? BYBIT_FEES.maker : BYBIT_FEES.taker
    });
    if (sizing.status !== 'EXECUTABLE') {
      return { success: false, error: sizing.reason };
    }

    // 4. Calcular quantidade baseada na alocação proporcional (mesmo % do master)
    const qty = sizing.qty;

    // 5. Calcular taxas
    const notional = sizing.notionalUsd;
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
      pnlUsd: 0,
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
      notionalUsd: notional,
      marginUsd: sizing.marginUsd,
      masterExposureRatio: exposureRatio,
      fee: openFee,
      netPnl: -openFee
    };

    this.openPositions.set(masterTrade.symbol, newTrade);
    this.broadcastUpdate(newTrade);
    return { success: true };
  }

  // Atualiza preço e verifica TP/SL/Trailing no espelho
  public updatePrice(symbol: string, currentPrice: number) {
    const trade = this.openPositions.get(symbol);
    if (!trade) return;

    trade.currentPrice = currentPrice;

    const notional = trade.notionalUsd ?? (trade.entryPrice * (trade.qty || this.calculateQty(trade)));
    const priceDeltaPct = trade.type === 'BUY'
      ? (currentPrice - trade.entryPrice) / trade.entryPrice
      : (trade.entryPrice - currentPrice) / trade.entryPrice;

    trade.pnlPct = Number((priceDeltaPct * 100).toFixed(2));
    const grossPnl = notional * priceDeltaPct;
    
    // PnL líquido = bruto - taxa de abertura - taxa de fechamento (estimada)
    const closeFeeRate = BYBIT_FEES.taker; // Assume market close
    const closeFee = notional * closeFeeRate;
    const openFee = trade.fee ?? 0;
    trade.pnlUsd = Number(grossPnl.toFixed(2));
    trade.netPnl = Number((grossPnl - openFee - closeFee).toFixed(2));

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
    if (this.trailingStopEnabled && (progressRatio >= 0.50 || trade.trailingActive)) {
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
      trade.fee = Number((openFee + closeFee).toFixed(4));
      trade.closeTime = Math.floor(Date.now() / 1000);
      this.realizedPnl += trade.netPnl;
      this.balance += trade.netPnl;
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
