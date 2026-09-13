import { FlowSignal } from '../../shared/types';
import { SimulatedTrade, PaperAccount } from '../../shared/paperTypes';
import { AutoPairSelectorEngine } from './autoPairSelectorEngine';
import { QuantStrategyEngine } from './quantStrategyEngine';

export class PaperTradingEngine {
  private balance: number = 10000; // $10,000 banca inicial
  private realizedPnl: number = 0;
  private openPositions: Map<string, SimulatedTrade> = new Map();
  private history: SimulatedTrade[] = [];
  private onUpdateCallback?: (account: PaperAccount, newTradeEvent?: SimulatedTrade) => void;

  constructor(onUpdate?: (account: PaperAccount, newTradeEvent?: SimulatedTrade) => void) {
    this.onUpdateCallback = onUpdate;
  }

  // Executa uma entrada automatizada SEM REPAINT quando um sinal de fluxo qualificado ocorre
  public handleSignal(signal: FlowSignal, currentPrice: number) {
    // 1. Verificar se o par está ativo para trading de acordo com o Consultor IA
    const pairConfig = AutoPairSelectorEngine.getPairConfig(signal.symbol);
    if (pairConfig && !pairConfig.isActiveForTrading) {
      // Par pausado pela IA devido a baixa assertividade ou spread desfavorável
      return;
    }

    // 2. Se já tem posição aberta nesse ativo, não faz overtrading
    if (this.openPositions.has(signal.symbol)) {
      return;
    }

    let tradeType: 'BUY' | 'SELL' | null = null;
    let slDistancePct = 0.0035; // 0.35% de Stop Loss
    let tpDistancePct = 0.0070; // 0.70% de Take Profit (Risco/Retorno 1:2)

    if (signal.type === 'ABSORPTION_BUY') {
      tradeType = 'SELL';
    } else if (signal.type === 'ABSORPTION_SELL') {
      tradeType = 'BUY';
    } else if (signal.type === 'BOOK_IMBALANCE' && signal.volume > 0) {
      if (signal.message.includes('Compradores com')) tradeType = 'BUY';
      else if (signal.message.includes('Vendedores com')) tradeType = 'SELL';
    }

    if (!tradeType) return;

    const stopLoss = tradeType === 'BUY' 
      ? Number((currentPrice * (1 - slDistancePct)).toFixed(currentPrice > 500 ? 2 : 5))
      : Number((currentPrice * (1 + slDistancePct)).toFixed(currentPrice > 500 ? 2 : 5));

    const takeProfit = tradeType === 'BUY'
      ? Number((currentPrice * (1 + tpDistancePct)).toFixed(currentPrice > 500 ? 2 : 5))
      : Number((currentPrice * (1 - tpDistancePct)).toFixed(currentPrice > 500 ? 2 : 5));

    // Potência adaptativa (se tá dando certo, dobra a mão)
    const notionalAllocation = pairConfig?.recommendedAllocationUsd || 2000;
    const powerLabel = pairConfig?.powerMultiplier ? ` [Potência ${pairConfig.powerMultiplier}x]` : '';

    const now = Date.now();
    const session = QuantStrategyEngine.determineSession(now);
    const dayOfWeek = QuantStrategyEngine.determineDayOfWeek(now);
    const regime = pairConfig?.regime || 'TREND';

    const newTrade: SimulatedTrade = {
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
      session,
      dayOfWeek,
      marketRegime: regime,
      status: 'OPEN',
      entryTime: Math.floor(now / 1000),
      signalReason: `${signal.message}${powerLabel}`
    };

    this.openPositions.set(signal.symbol, newTrade);
    this.broadcastUpdate(newTrade);
  }

  // Atualiza preço a cada tick em tempo real e verifica TP/SL
  public updatePrice(symbol: string, currentPrice: number) {
    const trade = this.openPositions.get(symbol);
    if (!trade) return;

    trade.currentPrice = currentPrice;
    
    const pairConfig = AutoPairSelectorEngine.getPairConfig(symbol);
    const notionalSize = pairConfig?.recommendedAllocationUsd || 2000;

    const priceDeltaPct = trade.type === 'BUY' 
      ? (currentPrice - trade.entryPrice) / trade.entryPrice
      : (trade.entryPrice - currentPrice) / trade.entryPrice;

    trade.pnlPct = Number((priceDeltaPct * 100).toFixed(2));
    trade.pnlUsd = Number((notionalSize * priceDeltaPct).toFixed(2));

    let closed = false;

    // Checar Take Profit (2.0R)
    if (
      (trade.type === 'BUY' && currentPrice >= trade.takeProfit) ||
      (trade.type === 'SELL' && currentPrice <= trade.takeProfit)
    ) {
      trade.status = 'CLOSED_TP';
      trade.rMultiple = 2.0;
      closed = true;
    }
    // Checar Stop Loss (-1.0R)
    else if (
      (trade.type === 'BUY' && currentPrice <= trade.stopLoss) ||
      (trade.type === 'SELL' && currentPrice >= trade.stopLoss)
    ) {
      trade.status = 'CLOSED_SL';
      trade.rMultiple = -1.0;
      closed = true;
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
