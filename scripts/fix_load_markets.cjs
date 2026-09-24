const fs = require('fs');

const file = 'server/src/engine/marketDataManager.ts';
let code = fs.readFileSync(file, 'utf8');

// Move loadMarkets outside of Promise.all
code = code.replace(
`  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.loadInitialData();
    this.startStreaming();
    this.isInitialized = true;
    console.log('[MarketData] ✅ Dados reais da Binance inicializados');
  }

  private async loadInitialData(): Promise<void> {
    await Promise.all(DEFAULT_SYMBOLS.map(async (symbol) => {
      try {
        const ccxtSymbol = toExchangeLinear(symbol);
        await this.exchange.loadMarkets();`,
`  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.exchange.loadMarkets();
    } catch (e) {
      console.warn('[MarketData] Falha ao carregar markets ccxt:', e.message);
    }
    await this.loadInitialData();
    this.startStreaming();
    this.isInitialized = true;
    console.log('[MarketData] ✅ Dados reais da Binance inicializados');
  }

  private async loadInitialData(): Promise<void> {
    await Promise.all(DEFAULT_SYMBOLS.map(async (symbol) => {
      try {
        const ccxtSymbol = toExchangeLinear(symbol);`
);

fs.writeFileSync(file, code, 'utf8');
console.log('Moved loadMarkets outside loop');
