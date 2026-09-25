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
export const MARKET_DATA_INTERVALS = {
  tickerMs: 2_000,
  bookMs: 10_000,
  candlesMs: 60_000
} as const;
const BYBIT_CATEGORIES: Record<string, 'crypto' | 'forex'> = {
  'BTC/USDT': 'crypto', 'ETH/USDT': 'crypto', 'SOL/USDT': 'crypto',
  'BNB/USDT': 'crypto', 'XRP/USDT': 'crypto'
};

function toExchangeLinear(symbol: string): string {
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
  private bookInterval?: NodeJS.Timeout;
  private tickerInterval?: NodeJS.Timeout;
  private exchange: any;
  private wsExchange: any;
  private isInitialized = false;
  private isRefreshingBooks = false;
  private isStreamingWS = false;
  private processedTradeIds = new Map<string, Set<string>>();

  constructor(flowEngine: FlowEngine, onBroadcast?: (type: string, data: any) => void) {
    this.flowEngine = flowEngine;
    this.onBroadcast = onBroadcast;
    this.exchange = new (ccxt as any).bingx({
      options: {
        defaultType: 'swap'
      },
      enableRateLimit: true,
      timeout: 10000
    });

    if ((ccxt as any).pro && (ccxt as any).pro.bingx) {
      try {
        this.wsExchange = new (ccxt as any).pro.bingx({
          options: {
            defaultType: 'swap'
          },
          enableRateLimit: true
        });
      } catch {
        this.wsExchange = null;
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.loadInitialData();
    this.startStreaming();
    this.isInitialized = true;
    console.log('[MarketData] ✅ Dados reais da BingX Swap inicializados');
  }

  private async loadInitialData(): Promise<void> {
    await Promise.all(DEFAULT_SYMBOLS.map(async (symbol) => {
      try {
        const ccxtSymbol = toExchangeLinear(symbol);
        
        const [ohlcv, ticker] = await Promise.all([
          this.exchange.fetchOHLCV(ccxtSymbol, '1m', undefined, 200),
          this.exchange.fetchTicker(ccxtSymbol)
        ]);

        const candles = this.normalizeCandles(ohlcv, symbol);
        const cvd = this.calculateCVD(candles);
        const book = await this.fetchOrderBook(ccxtSymbol, ticker.last);
        book.symbol = symbol;

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
    }));
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
        imbalanceRatio: +(bidTotal / Math.max(askTotal, 1)).toFixed(2),
        source: 'BINGX'
      };
    } catch {
      return this.generateRealisticBook(symbol, currentPrice, 'crypto');
    }
  }

  public startStreaming(): void {
    if (this.fetchInterval) return;
    
    // Inicia loops reativos WebSocket de baixa latência (< 50ms)
    this.startWebSocketStreams();

    this.tickerInterval = setInterval(() => this.updateTickers(), MARKET_DATA_INTERVALS.tickerMs);
    this.bookInterval = setInterval(() => this.updateBooks(), MARKET_DATA_INTERVALS.bookMs);
    this.fetchInterval = setInterval(() => this.updateCandlesAndBooks(), MARKET_DATA_INTERVALS.candlesMs);
    this.updateTickers();
    this.updateBooks();
  }

  private startWebSocketStreams(): void {
    if (!this.wsExchange || this.isStreamingWS) return;
    this.isStreamingWS = true;
    console.log('[MarketData] 🚀 Iniciando túneis WebSocket nativos (ccxt.pro)...');

    for (const symbol of DEFAULT_SYMBOLS) {
      this.streamTrades(symbol);
      this.streamOrderBook(symbol);
    }
  }

  private async streamTrades(symbol: string): Promise<void> {
    const ccxtSymbol = toExchangeLinear(symbol);
    while (this.isStreamingWS) {
      try {
        const rawTrades = await this.wsExchange.watchTrades(ccxtSymbol, undefined, 25);
        if (!Array.isArray(rawTrades) || rawTrades.length === 0) continue;
        const state = this.symbols.get(symbol);
        if (!state) continue;

        for (const rt of rawTrades) {
          this.processTradeEvent(symbol, state, rt);
        }
      } catch (err: any) {
        // Pausa breve e auto-reconexão
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  private async streamOrderBook(symbol: string): Promise<void> {
    const ccxtSymbol = toExchangeLinear(symbol);
    while (this.isStreamingWS) {
      try {
        const ob = await this.wsExchange.watchOrderBook(ccxtSymbol, 20);
        const state = this.symbols.get(symbol);
        if (!state || !ob.bids || !ob.asks) continue;

        const bids = ob.bids.slice(0, 20).map((b: any) => ({ price: b[0], amount: b[1], total: 0 }));
        const asks = ob.asks.slice(0, 20).map((a: any) => ({ price: a[0], amount: a[1], total: 0 }));
        let bidTotal = 0, askTotal = 0;
        bids.forEach((b: any) => { bidTotal += b.amount; b.total = bidTotal; });
        asks.forEach((a: any) => { askTotal += a.amount; a.total = askTotal; });

        const bookData: OrderBookData = {
          symbol,
          bids,
          asks,
          timestamp: Date.now(),
          spread: Number(((asks[0]?.price || 0) - (bids[0]?.price || 0)).toFixed(2)),
          bidDepthTotal: bidTotal,
          askDepthTotal: askTotal,
          imbalanceRatio: +(bidTotal / Math.max(askTotal, 1)).toFixed(2),
          source: 'BINGX'
        };

        state.book = bookData;
        if (this.onBroadcast) this.onBroadcast('book', bookData);
        this.flowEngine.checkBookImbalance(bookData);
      } catch (err: any) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  private processTradeEvent(symbol: string, state: ActiveSymbolState, rt: any): void {
    const id = String(rt.id ?? `${rt.timestamp}-${rt.price}-${rt.amount}`);
    let seenIds = this.processedTradeIds.get(symbol);
    if (!seenIds) {
      seenIds = new Set<string>();
      this.processedTradeIds.set(symbol, seenIds);
    }
    if (seenIds.has(id)) return;
    seenIds.add(id);

    if (seenIds.size > 500) {
      let toDrop = 250;
      for (const oldId of seenIds) {
        if (toDrop-- <= 0) break;
        seenIds.delete(oldId);
      }
    }

    const prevPrice = state.lastPrice;
    if (rt.price && rt.price > 0) {
      state.lastPrice = rt.price;
    }

    const trade: Trade = {
      id,
      symbol,
      price: rt.price,
      amount: rt.amount,
      side: rt.side === 'buy' || rt.side === 'sell' ? rt.side : (rt.price >= prevPrice ? 'buy' : 'sell'),
      timestamp: rt.timestamp || Date.now(),
      cost: Number(((rt.amount || 0) * (rt.price || 0)).toFixed(2)),
      isWhale: Number(((rt.amount || 0) * (rt.price || 0))) >= 50000
    };

    state.trades.unshift(trade);
    if (state.trades.length > 80) state.trades.pop();
    if (this.onBroadcast) this.onBroadcast('trade', trade);
    this.flowEngine.processTrade(trade, state.book);
    this.updateLiveCandle(state, rt.price);
  }

  private async updateTickers(): Promise<void> {
    for (const [symbol, state] of this.symbols.entries()) {
      try {
        const ccxtSymbol = toExchangeLinear(symbol);
        const [ticker, rawTrades] = await Promise.all([
          this.exchange.fetchTicker(ccxtSymbol),
          this.exchange.fetchTrades(ccxtSymbol, undefined, 50).catch(() => [])
        ]);
        if (!ticker.last) continue;

        const prevPrice = state.lastPrice;
        state.lastPrice = ticker.last;
        state.high24h = ticker.high || state.high24h;
        state.low24h = ticker.low || state.low24h;
        state.volume24h = ticker.baseVolume || state.volume24h;
        state.change24h = ticker.percentage || state.change24h;

        for (const rt of rawTrades) {
          this.processTradeEvent(symbol, state, rt);
        }

        if (state.trades.length === 0) {
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
          if (this.onBroadcast) this.onBroadcast('trade', trade);
        }

        this.updateLiveCandle(state, ticker.last);

        if (state.book && this.onBroadcast) {
          this.flowEngine.checkBookImbalance(state.book);
        }
      } catch (err: any) {
        console.debug(`[MarketData] Ticker update failed for ${symbol}:`, err.message);
      }
    }
  }


  private updateLiveCandle(state: ActiveSymbolState, price: number): void {
    const nowSec = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowSec / 60) * 60;
    let candle = state.candles[state.candles.length - 1];

    if (!candle || candle.time !== bucket) {
      candle = {
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
        delta: 0,
        cvd: state.cvd
      };
      state.candles.push(candle);
      if (state.candles.length > 400) state.candles.shift();
    }

    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;
    candle.cvd = state.cvd;
    state.currentCandle = candle;

    if (this.onBroadcast) {
      this.onBroadcast('candle_update', { symbol: state.symbol, candle });
    }
  }

  private async updateCandlesAndBooks(): Promise<void> {
    for (const [symbol, state] of this.symbols.entries()) {
      try {
        const ccxtSymbol = toExchangeLinear(symbol);
        const ohlcv = await this.exchange.fetchOHLCV(ccxtSymbol, '1m', undefined, 200);

        const newCandles = this.normalizeCandles(ohlcv, symbol);
        const live = state.candles[state.candles.length - 1];
        const lastRemote = newCandles[newCandles.length - 1];
        if (live && lastRemote) {
          if (live.time > lastRemote.time) {
            newCandles.push(live);
          } else if (live.time === lastRemote.time) {
            newCandles[newCandles.length - 1] = live;
          }
          if (newCandles.length > 400) newCandles.shift();
        }
        state.candles = newCandles;
        state.cvd = this.calculateCVD(newCandles);
        const currentCandle = state.candles[state.candles.length - 1];
        if (currentCandle && this.onBroadcast) {
          this.onBroadcast('candle_update', { symbol, candle: currentCandle });
        }
      } catch (err: any) {
        console.debug(`[MarketData] Candles update failed for ${symbol}:`, err.message);
      }
    }
  }

  private async updateBooks(): Promise<void> {
    if (this.isRefreshingBooks) return;
    this.isRefreshingBooks = true;
    try {
      for (const [symbol, state] of this.symbols.entries()) {
        try {
          const book = await this.fetchOrderBook(toExchangeLinear(symbol), state.lastPrice);
          book.symbol = symbol;
          state.book = book;
          if (this.onBroadcast) this.onBroadcast('book', book);
        } catch (err: any) {
          console.debug(`[MarketData] Book update failed for ${symbol}:`, err.message);
        }
      }
    } finally {
      this.isRefreshingBooks = false;
    }
  }

  public async getKlines(symbol: string, tf: string, limit = 400): Promise<CandleData[] | null> {
    try {
      const ccxtSymbol = toExchangeLinear(symbol);
      const ccxtTf = tf === '1D' ? '1d' : tf === '1W' ? '1w' : tf;
      const ohlcv = await this.exchange.fetchOHLCV(ccxtSymbol, ccxtTf as any, undefined, limit);
      if (!Array.isArray(ohlcv) || ohlcv.length === 0) return null;
      return this.normalizeCandles(ohlcv, symbol);
    } catch {
      return null;
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
    return { symbol, bids, asks, timestamp: Date.now(), spread: Number((asks[0].price - bids[0].price).toFixed(decimals)), bidDepthTotal: bidTotal, askDepthTotal: askTotal, imbalanceRatio: +(bidTotal / Math.max(askTotal, 1)).toFixed(2), source: 'LOCAL_FALLBACK' };
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
