import { Trade, OrderBookData, FlowSignal } from '../../../shared/types';

export class FlowEngine {
  private recentTrades: Map<string, Trade[]> = new Map();
  private lastSignals: FlowSignal[] = [];
  private onSignalCallback?: (signal: FlowSignal) => void;

  constructor(onSignal?: (signal: FlowSignal) => void) {
    this.onSignalCallback = onSignal;
  }

  public processTrade(trade: Trade, currentBook?: OrderBookData): FlowSignal | null {
    const symbol = trade.symbol;
    if (!this.recentTrades.has(symbol)) {
      this.recentTrades.set(symbol, []);
    }

    const trades = this.recentTrades.get(symbol)!;
    trades.push(trade);

    // Keep only last 10 seconds of trades
    const cutoff = Date.now() - 10000;
    while (trades.length > 0 && trades[0].timestamp < cutoff) {
      trades.shift();
    }

    // Check for Whale Aggression (e.g. trade cost > $50,000 for crypto or major forex equivalent)
    if (trade.cost >= 50000) {
      trade.isWhale = true;
      const signal: FlowSignal = {
        id: `whale-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: 'WHALE_AGGRESSION',
        symbol: trade.symbol,
        price: trade.price,
        volume: trade.amount,
        message: `🐋 Ordem Baleia Executada: ${trade.side.toUpperCase()} de $${(trade.cost / 1000).toFixed(1)}k a $${trade.price.toLocaleString()}`,
        timestamp: trade.timestamp,
        severity: trade.cost >= 150000 ? 'high' : 'medium'
      };
      this.emitSignal(signal);
      return signal;
    }

    // Check for Absorption
    if (currentBook && trades.length >= 5) {
      const windowTrades = trades.slice(-15);
      const buyTrades = windowTrades.filter(t => t.side === 'buy');
      const sellTrades = windowTrades.filter(t => t.side === 'sell');

      const buyVol = buyTrades.reduce((acc, t) => acc + t.amount, 0);
      const sellVol = sellTrades.reduce((acc, t) => acc + t.amount, 0);
      const bestAsk = currentBook.asks[0]?.price;
      const bestBid = currentBook.bids[0]?.price;

      // Absorption of Aggressive Buyers (Large buy volume hitting ask, but price doesn't break higher)
      if (buyTrades.length >= 6 && buyVol > sellVol * 3 && bestAsk) {
        const avgBuyPrice = buyTrades.reduce((acc, t) => acc + t.price, 0) / buyTrades.length;
        if (avgBuyPrice <= bestAsk * 1.0002) {
          const signal: FlowSignal = {
            id: `abs-buy-${Date.now()}`,
            type: 'ABSORPTION_BUY',
            symbol: trade.symbol,
            price: trade.price,
            volume: buyVol,
            message: `🛡️ Absorção Passiva Detectada: Forte agressão de compra absorvida no topo. Possível reversão / exaustão!`,
            timestamp: Date.now(),
            severity: 'high'
          };
          this.emitSignal(signal);
          return signal;
        }
      }

      // Absorption of Aggressive Sellers (Large sell volume hitting bid, but price doesn't break lower)
      if (sellTrades.length >= 6 && sellVol > buyVol * 3 && bestBid) {
        const avgSellPrice = sellTrades.reduce((acc, t) => acc + t.price, 0) / sellTrades.length;
        if (avgSellPrice >= bestBid * 0.9998) {
          const signal: FlowSignal = {
            id: `abs-sell-${Date.now()}`,
            type: 'ABSORPTION_SELL',
            symbol: trade.symbol,
            price: trade.price,
            volume: sellVol,
            message: `🛡️ Absorção Passiva Detectada: Forte agressão de venda absorvida no suporte. Possível reversão para alta!`,
            timestamp: Date.now(),
            severity: 'high'
          };
          this.emitSignal(signal);
          return signal;
        }
      }
    }

    return null;
  }

  public checkBookImbalance(book: OrderBookData): FlowSignal | null {
    if (book.bidDepthTotal === 0 || book.askDepthTotal === 0) return null;

    const ratio = book.bidDepthTotal / book.askDepthTotal;
    if (ratio > 2.8) {
      const signal: FlowSignal = {
        id: `imb-bid-${Date.now()}`,
        type: 'BOOK_IMBALANCE',
        symbol: book.symbol,
        price: book.bids[0]?.price || 0,
        volume: book.bidDepthTotal,
        message: `⚖️ Desbalanceamento no Book L2: Compradores com ${(ratio).toFixed(1)}x mais liquidez profunda que vendedores.`,
        timestamp: Date.now(),
        severity: 'medium'
      };
      this.emitSignal(signal);
      return signal;
    } else if (ratio < 0.35) {
      const sellRatio = (1 / ratio).toFixed(1);
      const signal: FlowSignal = {
        id: `imb-ask-${Date.now()}`,
        type: 'BOOK_IMBALANCE',
        symbol: book.symbol,
        price: book.asks[0]?.price || 0,
        volume: book.askDepthTotal,
        message: `⚖️ Desbalanceamento no Book L2: Vendedores com ${sellRatio}x mais liquidez profunda que compradores.`,
        timestamp: Date.now(),
        severity: 'medium'
      };
      this.emitSignal(signal);
      return signal;
    }
    return null;
  }

  private emitSignal(signal: FlowSignal) {
    // Avoid spamming identical signals within 4 seconds
    const recentDuplicate = this.lastSignals.find(
      s => s.type === signal.type && s.symbol === signal.symbol && (signal.timestamp - s.timestamp < 4000)
    );
    if (!recentDuplicate) {
      this.lastSignals.push(signal);
      if (this.lastSignals.length > 50) this.lastSignals.shift();
      if (this.onSignalCallback) {
        this.onSignalCallback(signal);
      }
    }
  }

  public getRecentSignals(): FlowSignal[] {
    return this.lastSignals;
  }
}
