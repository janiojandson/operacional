export function chartHistoryKey(symbol: string, timeframe: string): string {
  return `${symbol}:${timeframe}`;
}
