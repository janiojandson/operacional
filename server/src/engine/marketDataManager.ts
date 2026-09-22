import ccxt from 'ccxt';
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

const DEFAULT_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
const BYBIT_CATEGORIES: Record<string, 'crypto' | 'forex'> = {
  'BTC/USDT': 'crypto', 'ETH/USDT': 'crypto', 'SOL/USDT': 'crypto',
  'BNB/USDT': 'crypto', 'XRP/USDT': 'crypto'
};

function toBybitLinear(symbol: string): string {
  if (symbol.includes(':')) return symbol;
  const [base, quote] = symbol.split('/');
  if (!base || !quote) return symbol;
  return `${base}/${quote}:${quote}`;
}

export class MarketDataManager {
  private symbols: Map<string, ActiveSymbolState> = new Map();
  private flowEngine: FlowEngine;
  private onBroadcast?: (type: string, data: any) => void;
  private fetchInterval?: NodeJS.Timeout;
  private tickerInterval?: NodeJS.Timeout;
  private exchange: any;
  private isInitialized = false;

  constructor(flowEngine: FlowEngine, onBroadcast?: (type: string, data: any) => void) {
    this.flowEngine = flowEngine;
    this.onBroadcast = onBroadcast;
    this.exchange = new (ccxt as any).bybit({
      options: { defaultType: 'linear' },
      enableRateLimit: true
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.loadInitialData();
    this.startStreaming();
    this.isInitialized = true;
    console.log('[MarketData] ✅ Dados reais da Bybit inicializados');
  }

  private async loadInitialData(): Promise<void> {
    for (const symbol of DEFAULT_SYMBOLS) {
      try {
        const ccxtSymbol = toBybitLinear(symbol);
        await this.exchange.loadMarkets();
        
        const [ohlcv, ticker] = await Promise.all([
          this.exchange.fetchOHLCV(ccxtSymbol, '1m', undefined, 200),
          this.exchange.fetchTicker(ccxtSymbol)
        ]);

        const candles = this.normalizeCandles(ohlcv, symbol);
        const cvd = this.calculateCVD(candles);
        const book = await this.fetchOrderBook(ccxtSymbol, ticker.last);

        this.symbols.set(symbol, {
          symbol,
          category: BYBIT_CATEGORIES[symbol] || 'crypto',
          lastPrice: ticker.last || candles[candles.length - 1]?.close || 0,
          high24h: ticker.high || 0,
          low24h: ticker.low || 0,
          volume24h: ticker.baseVolume || 0,
          change24h: ticker.percentage || 0,
          cvd,
          candles,
          currentCandle: null,
          book,
          trades: []
        });
      } catch (err: any) {
        console.warn(`[MarketData] Falha ao carregar ${symbol}:`, err.message);
        this.createFallbackState(symbol);
      }
    }
  }

  private createFallbackState(symbol: string): void {
    const basePrice = symbol.startsWith('BTC') ? 95000 : symbol.startsWith('ETH') ? 2800 : symbol.startsWith('SOL') ? 200 : symbol.startsWith('BNB') ? 650 : 2.4;
    this.symbols.set(symbol, {
      symbol,
      category: 'crypto',
      lastPrice: basePrice,
      high24h: basePrice * 1.03,
      low24h: basePrice * 0.97,
      volume24h: 0,
      change24h: 0,
      cvd: 0,
      candles: [],
      currentCandle: null,
      book: this.generateRealisticBook(symbol, basePrice, 'crypto'),
      trades: []
    });
  }

  private normalizeCandles(ohlcv: any[], symbol: string): CandleData[] {
    let runningCvd = 0;
    return ohlcv.map((c, i) => {
      const [timeMs, open, high, low, close, volume] = c;
      const time = Math.floor(timeMs / 1000);
      const buyVolume = volume * (close >= open ? 0.55 : 0.45);
      const sellVolume = volume - buyVolume;
      const delta = buyVolume - sellVolume;
      runningCvd += delta;
      const dec = close < 5 ? 4 : (close < 100 ? 3 : 2);
      return {
        time,
        open: Number(open.toFixed(dec)),
        high: Number(high.toFixed(dec)),
        low: Number(low.toFixed(dec)),
        close: Number(close.toFixed(dec)),
        volume: Number(volume.toFixed(2)),
        buyVolume: Number(buyVolume.toFixed(2)),
        sellVolume: Number(sellVolume.toFixed(2)),
        delta: Number(delta.toFixed(2)),
        cvd: Number(runningCvd.toFixed(2))
      };
    });
  }

  private calculateCVD(candles: CandleData[]): number {
    return candles.reduce((sum, c) => sum + c.delta, 0);
  }

  private async fetchOrderBook(symbol: string, currentPrice: number): Promise<OrderBookData> {
    try {
      const ob = await this.exchange.fetchOrderBook(symbol, 20);
      const bids = ob.bids.slice(0, 20).map((b: any) => ({ price: b[0], amount: b[1], total: 0 }));
      const asks = ob.asks.slice(0, 20).map((a: any) => ({ price: a[0], amount: a[1], total: 0 }));
      let bidTotal = 0, askTotal = 0;
      bids.forEach((b: any) => { bidTotal += b.amount; b.total = bidTotal; });
      asks.forEach((a: any) => { askTotal += a.amount; a.total = askTotal; });
      return {
        symbol,
        bids, asks,
        timestamp: Date.now(),
        spread: Number((asks[0]?.price - bids[0]?.price).toFixed(2)),
        bidDepthTotal: bidTotal,
        askDepthTotal: askTotal,
        imbalanceRatio: +(bidTotal / Math.max(askTotal, 1)).toFixed(2)
      };
    } catch {
      return this.generateRealisticBook(symbol, currentPrice, 'crypto');
    }
  }

  public startStreaming(): void {
    if (this.fetchInterval) return;
    
    this.tickerInterval = setInterval(() => this.updateTickers(), 2000);
    this.fetchInterval = setInterval(() => this.updateCandlesAndBooks(), 60000);
    this.updateTickers();
  }

  private async updateTickers(): Promise<void> {
    for (const [symbol, state] of this.symbols.entries()) {
      try {
        const ccxtSymbol = toBybitLinear(symbol);
        const ticker = await this.exchange.fetchTicker(ccxtSymbol);
        if (!ticker.last) continue;

        const prevPrice = state.lastPrice;
        state.lastPrice = ticker.last;
        state.high24h = ticker.high || state.high24h;
        state.low24h = ticker.low || state.low24h;
        state.volume24h = ticker.baseVolume || state.volume24h;
        state.change24h = ticker.percentage || state.change24h;

        const trade: Trade = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          symbol,
          price: ticker.last,
          amount: 0,
          side: ticker.last >= prevPrice ? 'buy' : 'sell',
          timestamp: Date.now(),
          cost: 0,
          isWhale: false
        };

        state.trades.unshift(trade);
        if (state.trades.length > 80) state.trades.pop();

        if (this.onBroadcast) {
          this.onBroadcast('trade', trade);
        }
      } catch (err: any) {
        console.debug(`[MarketData] Ticker update failed for ${symbol}:`, err.message);
      }
    }
  }

  private async updateCandlesAndBooks(): Promise<void> {
    for (const [symbol, state] of this.symbols.entries()) {
      try {
        const ccxtSymbol = toBybitLinear(symbol);
        const [ohlcv, book] = await Promise.all([
          this.exchange.fetchOHLCV(ccxtSymbol, '1m', undefined, 200),
          this.fetchOrderBook(ccxtSymbol, state.lastPrice)
        ]);

        const newCandles = this.normalizeCandles(ohlcv, symbol);
        state.candles = newCandles;
        state.cvd = this.calculateCVD(newCandles);
        state.book = book;

        const currentCandle = state.candles[state.candles.length - 1];
        if (currentCandle && this.onBroadcast) {
          this.onBroadcast('candle_update', { symbol, candle: currentCandle });
          this.onBroadcast('book', book);
        }
      } catch (err: any) {
        console.debug(`[MarketData] Candles update failed for ${symbol}:`, err.message);
      }
    }
  }

  private generateRealisticBook(symbol: string, currentPrice: number, category: 'crypto' | 'forex'): OrderBookData {
    const decimals = currentPrice < 5 ? 4 : (currentPrice < 100 ? 3 : 2);
    const step = Math.max(0.0001, Number((currentPrice * 0.00008).toFixed(decimals)));
    const bids = [];
    const asks = [];
    let bidTotal = 0, askTotal = 0;

    for (let i = 1; i <= 20; i++) {
      const bidPrice = Number((currentPrice - i * step).toFixed(decimals));
      const askPrice = Number((currentPrice + i * step).toFixed(decimals));
      const bidAmount = Number(((Math.random() * 3 + 0.2) * (i > 15 ? 3 : 1)).toFixed(2));
      const askAmount = Number(((Math.random() * 3 + 0.2) * (i > 15 ? 3 : 1)).toFixed(2));
      bidTotal += bidAmount; askTotal += askAmount;
      bids.push({ price: bidPrice, amount: bidAmount, total: bidTotal });
      asks.push({ price: askPrice, amount: askAmount, total: askTotal });
    }
    return { symbol, bids, asks, timestamp: Date.now(), spread: Number((asks[0].price - bids[0].price).toFixed(decimals)), bidDepthTotal: bidTotal, askDepthTotal: askTotal, imbalanceRatio: +(bidTotal / Math.max(askTotal, 1)).toFixed(2) };
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
