const fs = require('fs');

const file = 'server/src/engine/marketDataManager.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace toExchangeLinear
code = code.replace(/function toExchangeLinear\(symbol: string\): string \{[\s\S]*?\n\}/, `function toExchangeLinear(symbol: string): string {
  if (symbol.includes(':')) return symbol.split(':')[0];
  return symbol;
}`);

// Replace ccxt binance instantiation to remove options: defaultType future that hits fapi (which 403s on CloudFront)
code = code.replace(/this\.exchange = new \(ccxt as any\)\.binance\(\{[\s\S]*?\}\);/, `this.exchange = new (ccxt as any).binance({
      enableRateLimit: true,
      timeout: 10000
    });`);

// Fix console log
code = code.replace(/\[MarketData\] ✅ Dados reais da Bybit inicializados/, `[MarketData] ✅ Dados reais da Binance inicializados`);

fs.writeFileSync(file, code, 'utf8');
console.log('Successfully updated marketDataManager.ts');
