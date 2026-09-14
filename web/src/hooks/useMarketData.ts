import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { AssetSummary, Trade, OrderBookData, CandleData, FlowSignal } from '../../shared/types';
import { PaperAccount } from '../../shared/paperTypes';
import { PairPerformance } from '../../server/src/engine/pairPerformanceTracker';
import { DynamicPairStatus } from '../../server/src/engine/autoPairSelectorEngine';
import { ClientAccountConfig, ClientTradeLog } from '../../shared/clientTypes';

export function useMarketData(activeSymbol: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [book, setBook] = useState<OrderBookData | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [signals, setSignals] = useState<FlowSignal[]>([]);
  const [activeCandle, setActiveCandle] = useState<CandleData | null>(null);
  const [paperAccount, setPaperAccount] = useState<PaperAccount | null>(null);
  const [pairStats, setPairStats] = useState<PairPerformance[]>([]);
  const [dynamicPairs, setDynamicPairs] = useState<DynamicPairStatus[]>([]);
  const [clients, setClients] = useState<ClientAccountConfig[]>([]);
  const [clientLogs, setClientLogs] = useState<ClientTradeLog[]>([]);

  // Initialize Socket connection
  useEffect(() => {
    const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    const serverUrl = isLocal ? 'http://localhost:4000' : window.location.origin;

    const s = io(serverUrl, {
      transports: ['websocket', 'polling']
    });

    s.on('connect', () => {
      setIsConnected(true);
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    s.on('initial_state', (data: { 
      assets: AssetSummary[]; 
      signals: FlowSignal[]; 
      paperAccount?: PaperAccount; 
      pairStats?: PairPerformance[];
      dynamicPairs?: DynamicPairStatus[];
      clients?: ClientAccountConfig[];
      clientLogs?: ClientTradeLog[];
    }) => {
      setAssets(data.assets);
      setSignals(data.signals);
      if (data.paperAccount) setPaperAccount(data.paperAccount);
      if (data.pairStats) setPairStats(data.pairStats);
      if (data.dynamicPairs) setDynamicPairs(data.dynamicPairs);
      if (data.clients) setClients(data.clients);
      if (data.clientLogs) setClientLogs(data.clientLogs);
    });

    s.on('flow_signal', (signal: FlowSignal) => {
      setSignals(prev => [signal, ...prev.slice(0, 40)]);
    });

    s.on('paper_account_update', (account: PaperAccount) => {
      setPaperAccount(account);
    });

    s.on('pair_stats_update', (stats: PairPerformance[]) => {
      setPairStats(stats);
    });

    s.on('dynamic_pairs_update', (dPairs: DynamicPairStatus[]) => {
      setDynamicPairs(dPairs);
    });

    s.on('client_trade_log', (log: ClientTradeLog) => {
      setClientLogs(prev => [log, ...prev.slice(0, 40)]);
    });

    s.on('client_accounts_update', (cList: ClientAccountConfig[]) => {
      setClients(cList);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // Fetch complete state whenever activeSymbol changes
  useEffect(() => {
    if (!activeSymbol) return;
    const token = localStorage.getItem('mfp_token');

    fetch(`/api/assets/${encodeURIComponent(activeSymbol)}/state`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => res.json())
      .then(data => {
        if (data.candles) setCandles(data.candles);
        if (data.book) setBook(data.book);
        if (data.trades) setTrades(data.trades);
        if (data.paperAccount) setPaperAccount(data.paperAccount);
        if (data.pairStats) setPairStats(data.pairStats);
        if (data.dynamicPairs) setDynamicPairs(data.dynamicPairs);
        if (data.clients) setClients(data.clients);
        if (data.clientLogs) setClientLogs(data.clientLogs);
      })
      .catch(err => console.error('Error fetching symbol state:', err));
  }, [activeSymbol]);

  // Subscribe to real-time events for activeSymbol
  useEffect(() => {
    if (!socket) return;

    const handleTrade = (trade: Trade) => {
      if (trade.symbol === activeSymbol) {
        setTrades(prev => [trade, ...prev.slice(0, 50)]);
      }
      setAssets(prev => prev.map(a => a.symbol === trade.symbol ? { ...a, lastPrice: trade.price } : a));
    };

    const handleBook = (updatedBook: OrderBookData) => {
      if (updatedBook.symbol === activeSymbol) {
        setBook(updatedBook);
      }
    };

    const handleCandleUpdate = (data: { symbol: string; candle: CandleData }) => {
      if (data.symbol === activeSymbol) {
        setActiveCandle(data.candle);
      }
    };

    socket.on('trade', handleTrade);
    socket.on('book', handleBook);
    socket.on('candle_update', handleCandleUpdate);

    return () => {
      socket.off('trade', handleTrade);
      socket.off('book', handleBook);
      socket.off('candle_update', handleCandleUpdate);
    };
  }, [socket, activeSymbol]);

  return {
    isConnected,
    assets,
    book,
    trades,
    candles,
    signals,
    activeCandle,
    paperAccount,
    pairStats,
    dynamicPairs,
    clients,
    clientLogs
  };
}
