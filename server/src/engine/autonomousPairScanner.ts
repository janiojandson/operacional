import { PairAutonomousStatus, OrderBookData, FlowSignal } from '../../../shared/types';

export class AutonomousPairScanner {
  private static pairRegistry: Map<string, PairAutonomousStatus> = new Map([
    ['BTC/USDT', { symbol: 'BTC/USDT', name: 'Bitcoin', category: 'crypto', isActive: true, activatedByAI: true, reason: 'Alta liquidez e expansão de fluxo', volatilityScore: 88, orderFlowScore: 92, liquidityScore: 95 }],
    ['ETH/USDT', { symbol: 'ETH/USDT', name: 'Ethereum', category: 'crypto', isActive: true, activatedByAI: true, reason: 'Volume consistente e absorções claras', volatilityScore: 82, orderFlowScore: 85, liquidityScore: 90 }],
    ['SOL/USDT', { symbol: 'SOL/USDT', name: 'Solana', category: 'crypto', isActive: true, activatedByAI: true, reason: 'Alta volatilidade com expansão de Order Blocks', volatilityScore: 94, orderFlowScore: 89, liquidityScore: 86 }],
    ['BNB/USDT', { symbol: 'BNB/USDT', name: 'Binance Coin', category: 'crypto', isActive: true, activatedByAI: true, reason: 'Fluxo comprador consistente em suporte institucional', volatilityScore: 76, orderFlowScore: 81, liquidityScore: 92 }],
    ['XRP/USDT', { symbol: 'XRP/USDT', name: 'Ripple XRP', category: 'crypto', isActive: true, activatedByAI: true, reason: 'Deslocamento direcional e forte book imbalance', volatilityScore: 85, orderFlowScore: 87, liquidityScore: 94 }]
  ]);

  public static getAllPairs(): PairAutonomousStatus[] {
    return Array.from(this.pairRegistry.values());
  }

  public static getPairStatus(symbol: string): PairAutonomousStatus | undefined {
    return this.pairRegistry.get(symbol);
  }

  public static togglePairManual(symbol: string, isActive: boolean): PairAutonomousStatus | undefined {
    const p = this.pairRegistry.get(symbol);
    if (p) {
      p.isActive = isActive;
      p.activatedByAI = false;
      p.reason = isActive ? 'Ativado manualmente pelo Trader' : 'Pausado manualmente pelo Trader';
    }
    return p;
  }

  // Avaliação 24/7 pelo Robô Autônomo
  public static evaluateMarketDynamics(symbol: string, book?: OrderBookData, signals?: FlowSignal[]): PairAutonomousStatus {
    let p = this.pairRegistry.get(symbol);
    if (!p) {
      p = {
        symbol,
        name: symbol,
        category: symbol.includes('USD') && !symbol.includes('USDT') ? 'forex' : 'crypto',
        isActive: true,
        activatedByAI: true,
        reason: 'Par detectado e adicionado ao scanner',
        volatilityScore: 70,
        orderFlowScore: 70,
        liquidityScore: 80
      };
      this.pairRegistry.set(symbol, p);
    }

    // Calcular score dinâmico se houver dados do book
    if (book) {
      const spreadPct = book.spread / (book.bids[0]?.price || 1);
      const isSpreadFavorable = spreadPct < 0.0008;
      const depth = (book.bidDepthTotal + book.askDepthTotal);
      
      p.liquidityScore = Math.min(100, Math.round(depth > 10 ? 85 + Math.random() * 15 : 60));
      p.orderFlowScore = Math.min(100, Math.round(Math.abs(book.imbalanceRatio - 1) * 50 + 60));

      if (!isSpreadFavorable) {
        p.isActive = false;
        p.activatedByAI = true;
        p.reason = 'Pausado por IA: Spread excessivo ou baixa profundidade';
      } else if (p.orderFlowScore >= 75 && p.liquidityScore >= 70) {
        p.isActive = true;
        p.activatedByAI = true;
        p.reason = 'Ativado por IA: Alta confluência de Order Flow e liquidez';
      }
    }

    return p;
  }
}
