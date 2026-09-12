import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { FlowEngine } from './engine/flowEngine';
import { MarketDataManager } from './engine/marketDataManager';
import { PaperTradingEngine } from './engine/paperTradingEngine';
import { PairPerformanceTracker } from './engine/pairPerformanceTracker';
import { AutoPairSelectorEngine, DynamicPairStatus } from './engine/autoPairSelectorEngine';
import { AIAdvisorEngine } from './engine/aiAdvisorEngine';
import { ClientCopyTraderEngine } from './engine/clientCopyTraderEngine';
import { FlowSignal, OrderBookData } from '../../shared/types';
import { ClientAccountConfig } from '../../shared/clientTypes';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const PORT = process.env.PORT || 4000;
const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend compilado estaticamente em produção
const distPath = path.join(rootDir, 'web/dist');
app.use(express.static(distPath));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Broadcast Helper
const broadcast = (event: string, data: any) => {
  io.emit(event, data);
};

// Client Copy Trader Engine
const clientCopyTrader = new ClientCopyTraderEngine((log) => {
  io.emit('client_trade_log', log);
});

// Paper Trading Engine (No-Repaint Simulator)
const paperTrading = new PaperTradingEngine((account, tradeEvent) => {
  io.emit('paper_account_update', account);
  if (tradeEvent) {
    io.emit('simulated_trade_event', tradeEvent);
    const pairConfig = AutoPairSelectorEngine.getPairConfig(tradeEvent.symbol);
    const power = pairConfig?.powerMultiplier || 1.0;
    clientCopyTrader.replicateTrade(tradeEvent, power);
  }
  recalculateAllPairs();
});

// Flow Engine
const flowEngine = new FlowEngine((signal: FlowSignal) => {
  io.emit('flow_signal', signal);
  const asset = marketManager.getSymbolState(signal.symbol);
  if (asset) {
    paperTrading.handleSignal(signal, asset.lastPrice);
  }
});

// Market Data Manager
const marketManager = new MarketDataManager(flowEngine, (event, data) => {
  broadcast(event, data);
  if (event === 'trade') {
    paperTrading.updatePrice(data.symbol, data.price);
  }
});
marketManager.startStreaming();

const recalculateAllPairs = () => {
  const summaries = marketManager.getSummaries();
  const account = paperTrading.getAccountState();
  const pairStats = PairPerformanceTracker.calculate(account.history, summaries);
  
  const booksMap = new Map<string, OrderBookData>();
  for (const asset of summaries) {
    const st = marketManager.getSymbolState(asset.symbol);
    if (st) booksMap.set(asset.symbol, st.book);
  }

  const dynamicPairs = AutoPairSelectorEngine.evaluateAllPairs(summaries, pairStats, booksMap);
  io.emit('pair_stats_update', pairStats);
  io.emit('dynamic_pairs_update', dynamicPairs);
  return { pairStats, dynamicPairs };
};

// Periodic recalculation
setInterval(() => {
  recalculateAllPairs();
}, 2000);

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), service: 'MarketFlow Pro Backend' });
});

app.get('/api/assets', (req, res) => {
  res.json(marketManager.getSummaries());
});

app.get('/api/paper-trading', (req, res) => {
  res.json(paperTrading.getAccountState());
});

app.get('/api/pair-performance', (req, res) => {
  const { pairStats, dynamicPairs } = recalculateAllPairs();
  res.json({ pairStats, dynamicPairs });
});

app.get('/api/clients', (req, res) => {
  res.json({
    clients: clientCopyTrader.getClients(),
    logs: clientCopyTrader.getLogs()
  });
});

app.post('/api/clients', (req, res) => {
  const config: ClientAccountConfig = req.body;
  clientCopyTrader.addOrUpdateClient(config);
  io.emit('client_accounts_update', clientCopyTrader.getClients());
  res.json({ status: 'ok', client: config });
});

app.post('/api/pairs/:symbol/toggle', (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const active = req.body.active;
  AutoPairSelectorEngine.toggleManualOverride(symbol, active);
  const { dynamicPairs } = recalculateAllPairs();
  res.json({ status: 'ok', symbol, active, dynamicPairs });
});

app.post('/api/ai-advisor/audit', async (req, res) => {
  const provider = req.body?.provider || process.env.AI_PROVIDER || 'HYBRID_AUTO';
  const account = paperTrading.getAccountState();
  const summaries = marketManager.getSummaries();
  const pairStats = PairPerformanceTracker.calculate(account.history, summaries);
  const recentSignals = flowEngine.getRecentSignals();

  const auditReport = AIAdvisorEngine.generateAudit(
    account,
    pairStats,
    summaries,
    recentSignals,
    provider
  );
  res.json(auditReport);
});

app.get('/api/assets/:symbol/state', (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const state = marketManager.getSymbolState(symbol);
  if (!state) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  const { pairStats, dynamicPairs } = recalculateAllPairs();

  res.json({
    symbol: state.symbol,
    category: state.category,
    lastPrice: state.lastPrice,
    high24h: state.high24h,
    low24h: state.low24h,
    change24h: state.change24h,
    volume24h: state.volume24h,
    cvd: state.cvd,
    candles: state.candles,
    book: state.book,
    trades: state.trades,
    recentSignals: flowEngine.getRecentSignals().filter(s => s.symbol === symbol),
    paperAccount: paperTrading.getAccountState(),
    pairStats,
    dynamicPairs,
    clients: clientCopyTrader.getClients(),
    clientLogs: clientCopyTrader.getLogs()
  });
});

app.get('/api/signals', (req, res) => {
  res.json(flowEngine.getRecentSignals());
});

// Fallback SPA route para servir o React
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return res.status(404).json({ error: 'Endpoint não encontrado' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// WebSocket Connection Handling
io.on('connection', (socket) => {
  const { pairStats, dynamicPairs } = recalculateAllPairs();
  socket.emit('initial_state', {
    assets: marketManager.getSummaries(),
    signals: flowEngine.getRecentSignals(),
    paperAccount: paperTrading.getAccountState(),
    pairStats,
    dynamicPairs,
    clients: clientCopyTrader.getClients(),
    clientLogs: clientCopyTrader.getLogs()
  });
});

server.listen(PORT, () => {
  console.log(`🚀 MarketFlow Pro Backend Server running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket Gateway ready on ws://localhost:${PORT}`);
});
