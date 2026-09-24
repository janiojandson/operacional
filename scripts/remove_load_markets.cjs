const fs = require('fs');

const file = 'server/src/engine/marketDataManager.ts';
let code = fs.readFileSync(file, 'utf8');

// Normalize line endings to LF before regex
code = code.replace(/\r\n/g, '\n');

code = code.replace(/await this\.exchange\.loadMarkets\(\);\n/g, '');

fs.writeFileSync(file, code, 'utf8');
console.log('Removed loadMarkets from loop!');
