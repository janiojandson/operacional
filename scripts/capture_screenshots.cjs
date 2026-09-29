const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = path.resolve(__dirname, '../docs/screenshots');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const targets = [
  { name: 'terminal_1920_desktop.png', width: 1920, height: 1080 },
  { name: 'terminal_1366_notebook.png', width: 1366, height: 768 },
  { name: 'terminal_1024_tablet.png', width: 1024, height: 768 },
  { name: 'terminal_375_mobile.png', width: 375, height: 812 }
];

for (const t of targets) {
  const outFile = path.join(outputDir, t.name);
  console.log(`Capturing ${t.name} (${t.width}x${t.height})...`);
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${t.width},${t.height}`,
    `--screenshot=${outFile}`,
    '--virtual-time-budget=3500',
    'http://127.0.0.1:5173/terminal'
  ];
  try {
    execFileSync(chromePath, args, { stdio: 'inherit' });
    console.log(`Saved: ${outFile} (${fs.statSync(outFile).size} bytes)`);
  } catch (err) {
    console.error(`Failed to capture ${t.name}:`, err.message);
  }
}
