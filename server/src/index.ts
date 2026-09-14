import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { FlowEngine } from './engine/flowEngine.js';
import { MarketDataManager } from './engine/marketDataManager.js';
import { PaperTradingEngine } from './engine/paperTradingEngine.js';
import { PairPerformanceTracker } from './engine/pairPerformanceTracker.js';
import { AutoPairSelectorEngine, DynamicPairStatus } from './engine/autoPairSelectorEngine.js';
import { AIAdvisorEngine } from './engine/aiAdvisorEngine.js';
import { QuantStrategyEngine } from './engine/quantStrategyEngine.js';
import { ClientCopyTraderEngine } from './engine/clientCopyTraderEngine.js';
import { AutonomousPairScanner } from './engine/autonomousPairScanner.js';
import { ClientProtectionEngine } from './engine/clientProtectionEngine.js';
import { FlowSignal, OrderBookData } from '../../shared/types.js';
import { ClientAccountConfig } from '../../shared/clientTypes.js';
// SaaS: Autenticação e Rotas
import { authRouter } from './auth/authRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { clientRouter } from './routes/clientRoutes.js';
import { requireAuth } from './auth/authMiddleware.js';

// Inicializar banco de dados (cria tabelas e admin padrão)
import './database/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const PORT = process.env.PORT || 4000;
const app = express();

// ─── Segurança Enterprise ──────────────────────────────────────────────────

// Helmet: headers de segurança HTTP
app.use(helmet({
  contentSecurityPolicy: false, // Desabilitado para permitir o SPA React + charts
  crossOriginEmbedderPolicy: false
}));

// CORS: restringir origem em produção
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:4000', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir sem origin (Postman, Railway internal, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    callback(new Error(`Origem não autorizada: ${origin}`));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Rate Limiting Global: max 200 req/15min por IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' }
});
app.use(globalLimiter);

// Rate Limiting específico para login: max 10 tentativas/15min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' }
});
app.use('/api/auth/login', authLimiter);

// ─── Servir Frontend ───────────────────────────────────────────────────────
const distPath = path.join(rootDir, 'web/dist');
app.use(express.static(distPath));

// ─── Servidor HTTP + WebSocket ────────────────────────────────────────────
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.NODE_ENV !== 'production' ? '*' : allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// ─── Montar Rotas SaaS ────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/client', clientRouter);

// ─── Broadcast Helper ─────────────────────────────────────────────────────
const broadcast = (event: string, data: any) => {
  io.emit(event, data);
};

// ─── Engines de Trading ───────────────────────────────────────────────────

const clientCopyTrader = new ClientCopyTraderEngine((log) => {
  io.emit('client_trade_log', log);
});

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

const flowEngine = new FlowEngine((signal: FlowSignal) => {
  io.emit('flow_signal', signal);
  const asset = marketManager.getSymbolState(signal.symbol);
  if (asset) {
    paperTrading.handleSignal(signal, asset.lastPrice);
  }
});

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

setInterval(() => {
  recalculateAllPairs();
}, 2000);

// ─── REST Endpoints (Trading Terminal) ────────────────────────────────────
// Endpoints públicos de mercado (sem auth, dados públicos)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), service: 'MarketFlow Pro Backend' });
});

app.get('/api/assets', (req, res) => {
  res.json(marketManager.getSummaries());
});

// Endpoints de paper trading (admin apenas — tela do terminal)
app.get('/api/paper-trading', requireAuth, (req, res) => {
  res.json(paperTrading.getAccountState());
});

app.get('/api/pair-performance', requireAuth, (req, res) => {
  const { pairStats, dynamicPairs } = recalculateAllPairs();
  res.json({ pairStats, dynamicPairs });
});

app.get('/api/clients', requireAuth, (req, res) => {
  res.json({
    clients: clientCopyTrader.getClients(),
    logs: clientCopyTrader.getLogs()
  });
});

app.post('/api/clients', requireAuth, (req, res) => {
  const config: ClientAccountConfig = req.body;
  clientCopyTrader.addOrUpdateClient(config);
  io.emit('client_accounts_update', clientCopyTrader.getClients());
  res.json({ status: 'ok', client: config });
});

app.post('/api/pairs/:symbol/toggle', requireAuth, (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const active = req.body.active;
  AutoPairSelectorEngine.toggleManualOverride(symbol, active);
  const { dynamicPairs } = recalculateAllPairs();
  res.json({ status: 'ok', symbol, active, dynamicPairs });
});

app.post('/api/paper-trading/balance', requireAuth, (req, res) => {
  const { balance } = req.body;
  if (typeof balance === 'number' && balance > 0) {
    paperTrading.setInitialBalance(balance);
    const updated = paperTrading.getAccountState();
    io.emit('paper_account_update', updated);
    return res.json({ success: true, balance: updated.balance });
  }
  res.status(400).json({ error: 'Saldo inválido' });
});

app.post('/api/paper-trading/reset', requireAuth, (req, res) => {
  const { balance } = req.body;
  paperTrading.resetData(typeof balance === 'number' ? balance : undefined);
  const updated = paperTrading.getAccountState();
  io.emit('paper_account_update', updated);
  res.json({ success: true, message: 'Dados zerados com sucesso', account: updated });
});

app.post('/api/paper-trading/pairs', requireAuth, (req, res) => {
  const { pairs } = req.body;
  if (Array.isArray(pairs)) {
    paperTrading.setActivePairs(pairs);
    return res.json({ success: true, activePairs: paperTrading.getActivePairs() });
  }
  res.status(400).json({ error: 'Array de pares inválido' });
});

app.post('/api/paper-trading/temperature', requireAuth, (req, res) => {
  const { temperature } = req.body;
  if (typeof temperature === 'number') {
    paperTrading.setMinTemperature(temperature);
    return res.json({ success: true, temperature: paperTrading.getMinTemperature() });
  }
  res.status(400).json({ error: 'Temperatura inválida' });
});

app.get('/api/autonomous-pairs', requireAuth, (req, res) => {
  res.json(AutonomousPairScanner.getAllPairs());
});

app.post('/api/autonomous-pairs/:symbol/toggle', requireAuth, (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const { active } = req.body;
  const updated = AutonomousPairScanner.togglePairManual(symbol, active);
  io.emit('autonomous_pairs_update', AutonomousPairScanner.getAllPairs());
  res.json(updated);
});

app.get('/api/client-protection', requireAuth, (req, res) => {
  res.json(ClientProtectionEngine.getAllClients());
});

app.post('/api/client-protection', requireAuth, (req, res) => {
  const client = ClientProtectionEngine.addClient(req.body);
  io.emit('client_protection_update', ClientProtectionEngine.getAllClients());
  res.json(client);
});

app.delete('/api/client-protection/:id', requireAuth, (req, res) => {
  const success = ClientProtectionEngine.deleteClient(req.params.id);
  io.emit('client_protection_update', ClientProtectionEngine.getAllClients());
  res.json({ success });
});

app.post('/api/client-protection/:id/unlock', requireAuth, (req, res) => {
  const client = ClientProtectionEngine.unlockClient(req.params.id);
  io.emit('client_protection_update', ClientProtectionEngine.getAllClients());
  res.json(client);
});

app.post('/api/client-protection/send-alert', requireAuth, async (req, res) => {
  const { phone, clientName, messageType, currentBalance, initialBalance, dailyPnl, reason } = req.body;
  const result = await ClientProtectionEngine.sendWhatsAppAlert({
    phone,
    clientName,
    messageType: messageType || 'SUMMARY',
    currentBalance: Number(currentBalance || 0),
    initialBalance: Number(initialBalance || 0),
    dailyPnl: Number(dailyPnl || 0),
    reason
  });
  res.json(result);
});

app.get('/api/assets/:symbol/pressure', requireAuth, (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const state = marketManager.getSymbolState(symbol);
  if (!state) return res.status(404).json({ error: 'Ativo não encontrado' });

  const book = state.book;
  const totalDepth = book ? (book.bidDepthTotal + book.askDepthTotal) : 1;
  const buyRatio = book ? (book.bidDepthTotal / Math.max(1, totalDepth)) : 0.5;
  const buyPressurePct = Math.round(Math.min(100, Math.max(0, buyRatio * 100)));
  const sellPressurePct = 100 - buyPressurePct;
  const netPressurePct = buyPressurePct - sellPressurePct;

  res.json({
    symbol,
    buyPressurePct,
    sellPressurePct,
    netPressurePct,
    dominantSide: netPressurePct > 10 ? 'BUY' : netPressurePct < -10 ? 'SELL' : 'NEUTRAL',
    imbalanceScore: book ? Number(book.imbalanceRatio.toFixed(2)) : 1.0,
    whaleActivityLevel: Math.abs(netPressurePct) > 40 ? 'EXTREME' : Math.abs(netPressurePct) > 20 ? 'HIGH' : 'MEDIUM'
  });
});

app.get('/api/strategy/health-report', requireAuth, (req, res) => {
  const account = paperTrading.getAccountState();
  const report = QuantStrategyEngine.generateHealthReport(account);
  res.json(report);
});

app.post('/api/ai-advisor/audit', requireAuth, async (req, res) => {
  const provider = req.body?.provider || process.env.AI_PROVIDER || 'HYBRID_AUTO';
  const account = paperTrading.getAccountState();
  const summaries = marketManager.getSummaries();
  const pairStats = PairPerformanceTracker.calculate(account.history, summaries);
  const recentSignals = flowEngine.getRecentSignals();

  const auditReport = await AIAdvisorEngine.generateAudit(account, pairStats, summaries, recentSignals, provider);
  res.json(auditReport);
});

app.post('/api/ai-advisor/chat', requireAuth, async (req, res) => {
  try {
    const { message, history = [], provider = 'HYBRID_AUTO' } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    const account = paperTrading.getAccountState();
    const summaries = marketManager.getSummaries();
    const pairStats = PairPerformanceTracker.calculate(account.history, summaries);

    const reply = await AIAdvisorEngine.chatWithAdvisor(message, history, account, pairStats, provider);
    res.json({ success: true, reply, timestamp: Date.now() });
  } catch (error: any) {
    console.error('Erro no chat com o consultor IA:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar mensagem com o Consultor IA' });
  }
});

app.get('/api/assets/:symbol/state', requireAuth, (req, res) => {
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

app.get('/api/signals', requireAuth, (req, res) => {
  res.json(flowEngine.getRecentSignals());
});

// Fallback SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return res.status(404).json({ error: 'Endpoint não encontrado' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── WebSocket Connection Handling ────────────────────────────────────────
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

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 MarketFlow Pro SaaS Backend running at http://0.0.0.0:${PORT}`);
  console.log(`🔒 Segurança: JWT + AES-256 + Helmet + Rate Limiting ATIVO`);
  console.log(`📡 WebSocket Gateway ready on ws://0.0.0.0:${PORT}`);
});
