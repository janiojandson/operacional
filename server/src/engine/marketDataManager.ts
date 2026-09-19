import { Trade, OrderBookData, CandleData, AssetSummary } from '../../../shared/types';
import { FlowEngine } from './flowEngine';

interface ActiveSymbolState {
  symbol: string;
  category: 'crypto' | 'forex';
  lastPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number;
  cvd: number;
  candles: CandleData[];
  currentCandle: CandleData | null;
  book: OrderBookData;
  trades: Trade[];
}

export class MarketDataManager {
  private symbols: Map<string, ActiveSymbolState> = new Map();
  private flowEngine: FlowEngine;
  private onBroadcast?: (type: string, data: any) => void;
  private simulationIntervals: NodeJS.Timeout[] = [];
  private isWsRunning = false;

  constructor(flowEngine: FlowEngine, onBroadcast?: (type: string, data: any) => void) {
    this.flowEngine = flowEngine;
    this.onBroadcast = onBroadcast;
    this.initDefaultSymbols();
  }

  private initDefaultSymbols() {
    const defaultAssets: Array<{ symbol: string; basePrice: number; category: 'crypto' | 'forex'; name: string }> = [
      { symbol: 'BTC/USDT', basePrice: 94850.00, category: 'crypto', name: 'Bitcoin' },
      { symbol: 'ETH/USDT', basePrice: 2840.50, category: 'crypto', name: 'Ethereum' },
      { symbol: 'SOL/USDT', basePrice: 198.40, category: 'crypto', name: 'Solana' },
      { symbol: 'BNB/USDT', basePrice: 652.80, category: 'crypto', name: 'Binance Coin' },
      { symbol: 'XRP/USDT', basePrice: 2.38, category: 'crypto', name: 'Ripple XRP' }
    ];

    for (const asset of defaultAssets) {
      const nowSec = Math.floor(Date.now() / 1000);
      const candles: CandleData[] = [];
      let p = asset.basePrice;
      let runningCvd = 0;

      // Seed 60 minutes of history candles
      for (let i = 60; i >= 1; i--) {
        const time = nowSec - i * 60;
        const deltaPct = (Math.random() - 0.49) * 0.004;
        const open = p;
        const close = open * (1 + deltaPct);
        const high = Math.max(open, close) * (1 + Math.random() * 0.001);
        const low = Math.min(open, close) * (1 - Math.random() * 0.001);
        const volume = asset.category === 'crypto' ? Math.random() * 15 + 2 : Math.random() * 500 + 100;
        const buyVolume = volume * (deltaPct > 0 ? 0.6 : 0.4);
        const sellVolume = volume - buyVolume;
        const delta = buyVolume - sellVolume;
        runningCvd += delta;

        candles.push({
          time,
          open: Number(open.toFixed(asset.category === 'forex' ? 5 : 2)),
          high: Number(high.toFixed(asset.category === 'forex' ? 5 : 2)),
          low: Number(low.toFixed(asset.category === 'forex' ? 5 : 2)),
          close: Number(close.toFixed(asset.category === 'forex' ? 5 : 2)),
          volume: Number(volume.toFixed(2)),
          buyVolume: Number(buyVolume.toFixed(2)),
          sellVolume: Number(sellVolume.toFixed(2)),
          delta: Number(delta.toFixed(2)),
          cvd: Number(runningCvd.toFixed(2))
        });
        p = close;
      }

      const initialBook = this.generateRealisticBook(asset.symbol, p, asset.category);

      this.symbols.set(asset.symbol, {
        symbol: asset.symbol,
        category: asset.category,
        lastPrice: p,
        high24h: p * 1.03,
        low24h: p * 0.97,
        volume24h: asset.category === 'crypto' ? 1450000000 : 89000000000,
        change24h: +(Math.random() * 4 - 1.5).toFixed(2),
        cvd: runningCvd,
        candles,
        currentCandle: null,
        book: initialBook,
        trades: []
      });
    }
  }

  public startStreaming() {
    this.startLiveSimulator();
  }

  private generateRealisticBook(symbol: string, currentPrice: number, category: 'crypto' | 'forex'): OrderBookData {
    const decimals = currentPrice < 5 ? 4 : (currentPrice < 100 ? 3 : 2);
    // Passo institucional Bybit Linear Perpétuos (~1.6 bps de spread natural)
    const step = Math.max(0.0001, Number((currentPrice * 0.00008).toFixed(decimals)));
    const bids = [];
    const asks = [];
    let bidTotal = 0;
    let askTotal = 0;

    for (let i = 1; i <= 20; i++) {
      const bidPrice = Number((currentPrice - i * step).toFixed(decimals));
      const askPrice = Number((currentPrice + i * step).toFixed(decimals));
      const bidAmount = Number(((Math.random() * 3 + 0.2) * (i > 15 ? 3 : 1)).toFixed(2));
      const askAmount = Number(((Math.random() * 3 + 0.2) * (i > 15 ? 3 : 1)).toFixed(2));

      bidTotal += bidAmount;
      askTotal += askAmount;

      bids.push({ price: bidPrice, amount: bidAmount, total: bidTotal });
      asks.push({ price: askPrice, amount: askAmount, total: askTotal });
    }

    return {
      symbol,
      bids,
      asks,
      timestamp: Date.now(),
      spread: Number((asks[0].price - bids[0].price).toFixed(decimals)),
      bidDepthTotal: bidTotal,
      askDepthTotal: askTotal,
      imbalanceRatio: +(bidTotal / Math.max(askTotal, 1)).toFixed(2)
    };
  }

  private startLiveSimulator() {
    // Generate streaming ticks, orderbook updates and trades every 100-300ms
    const interval = setInterval(() => {
      for (const [symbol, state] of this.symbols.entries()) {
        const isWhale = Math.random() < 0.04;
        const side: 'buy' | 'sell' = Math.random() > 0.49 ? 'buy' : 'sell';
        
        // Oscilação proporcional realista (0.01% a 0.03% por tick)
        const pctDelta = (side === 'buy' ? 1 : -1) * (0.0001 + Math.random() * 0.00025);
        const priceTick = state.lastPrice * pctDelta;
        const decimals = state.lastPrice < 5 ? 4 : (state.lastPrice < 100 ? 3 : 2);

        const newPrice = Number((state.lastPrice + priceTick).toFixed(decimals));
        state.lastPrice = newPrice;

        const baseAmount = symbol.startsWith('BTC') 
          ? 0.15 
          : (symbol.startsWith('ETH') 
            ? 2.0 
            : (symbol.startsWith('SOL') 
              ? 15 
              : (symbol.startsWith('BNB') ? 8 : 2000)));
        const amount = Number((isWhale ? baseAmount * (12 + Math.random() * 10) : baseAmount * (0.2 + Math.random() * 1.5)).toFixed(3));
        const cost = Number((amount * newPrice).toFixed(2));

        const trade: Trade = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          symbol,
          price: newPrice,
          amount,
          side,
          timestamp: Date.now(),
          cost,
          isWhale: isWhale || cost > 50000
        };

        state.trades.unshift(trade);
        if (state.trades.length > 80) state.trades.pop();

        // Update OrderBook
        state.book = this.generateRealisticBook(symbol, newPrice, state.category);

        // Update Candle
        const currentSec = Math.floor(Date.now() / 1000);
        const candleIntervalSec = 60;
        const candleTime = Math.floor(currentSec / candleIntervalSec) * candleIntervalSec;

        let activeCandle = state.candles[state.candles.length - 1];
        if (!activeCandle || activeCandle.time !== candleTime) {
          activeCandle = {
            time: candleTime,
            open: newPrice,
            high: newPrice,
            low: newPrice,
            close: newPrice,
            volume: amount,
            buyVolume: side === 'buy' ? amount : 0,
            sellVolume: side === 'sell' ? amount : 0,
            delta: side === 'buy' ? amount : -amount,
            cvd: state.cvd + (side === 'buy' ? amount : -amount)
          };
          state.candles.push(activeCandle);
          if (state.candles.length > 200) state.candles.shift();
        } else {
          activeCandle.high = Math.max(activeCandle.high, newPrice);
          activeCandle.low = Math.min(activeCandle.low, newPrice);
          activeCandle.close = newPrice;
          activeCandle.volume = +(activeCandle.volume + amount).toFixed(2);
          if (side === 'buy') activeCandle.buyVolume = +(activeCandle.buyVolume + amount).toFixed(2);
          else activeCandle.sellVolume = +(activeCandle.sellVolume + amount).toFixed(2);
          activeCandle.delta = +(activeCandle.buyVolume - activeCandle.sellVolume).toFixed(2);
          activeCandle.cvd = +(state.cvd + activeCandle.delta).toFixed(2);
        }

        state.cvd += side === 'buy' ? amount : -amount;

        // Process through FlowEngine
        this.flowEngine.processTrade(trade, state.book);
        if (Math.random() < 0.1) {
          this.flowEngine.checkBookImbalance(state.book);
        }

        // Broadcast to clients
        if (this.onBroadcast) {
          this.onBroadcast('trade', trade);
          this.onBroadcast('book', state.book);
          this.onBroadcast('candle_update', { symbol, candle: activeCandle });
        }
      }
    }, 200);

    this.simulationIntervals.push(interval);
  }

  public getSummaries(): AssetSummary[] {
    return Array.from(this.symbols.values()).map(s => ({
      symbol: s.symbol,
      name: s.symbol.replace('/USDT', '').replace('/', ' / '),
      category: s.category,
      lastPrice: s.lastPrice,
      change24h: s.change24h,
      volume24h: s.volume24h,
      high24h: s.high24h,
      low24h: s.low24h,
      cvd: s.cvd
    }));
  }

  public getSymbolState(symbol: string): ActiveSymbolState | undefined {
    return this.symbols.get(symbol);
  }
}
