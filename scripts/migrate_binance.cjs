const fs = require('fs');

const file = 'server/src/engine/marketDataManager.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/new \(ccxt as any\)\.bybit\(\{[\s\S]*?enableRateLimit: true[\s\S]*?\}\)/, `new (ccxt as any).binance({
      options: { defaultType: 'future' },
      enableRateLimit: true
    })`);

code = code.replace(/source: 'BYBIT'/g, "source: 'BINANCE'");
code = code.replace(/toBybitLinear/g, 'toExchangeLinear');

fs.writeFileSync(file, code, 'utf8');
console.log('marketDataManager.ts updated successfully to Binance');
