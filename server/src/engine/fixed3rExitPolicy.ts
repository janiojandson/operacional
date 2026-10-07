import type { ExitPolicy, SimulatedTrade } from '../../../shared/paperTypes.js';

export function configuredExitPolicy(value = process.env.MARKET_EXIT_POLICY): ExitPolicy {
  if (value === undefined) return 'FIXED_3R';
  if (value === 'FIXED_3R' || value === 'LEGACY') return value;
  throw new Error('INVALID_MARKET_EXIT_POLICY');
}

export function fixed3rExit(
  p: { type: 'BUY' | 'SELL'; entryPrice: number; initialStopLoss: number }, price: number
): 'HOLD' | 'STOP_LOSS' | 'FIXED_TP' {
  const d = Math.abs(p.entryPrice - p.initialStopLoss);
  if (![p.entryPrice, p.initialStopLoss, price].every(Number.isFinite)
      || p.entryPrice <= 0 || p.initialStopLoss <= 0 || price <= 0 || d <= 0) {
    throw new Error('INVALID_ORIGINAL_RISK_SNAPSHOT');
  }
  if ((p.type === 'BUY' && p.initialStopLoss >= p.entryPrice)
      || (p.type === 'SELL' && p.initialStopLoss <= p.entryPrice)) {
    throw new Error('ORIGINAL_STOP_ON_WRONG_SIDE');
  }
  const dir = p.type === 'BUY' ? 1 : -1;
  const target = p.entryPrice + dir * 3 * d;
  if (target <= 0) throw new Error('INVALID_FIXED_3R_TARGET');
  if (dir * (price - p.initialStopLoss) <= 0) return 'STOP_LOSS';
  if (dir * (price - target) >= 0) return 'FIXED_TP';
  return 'HOLD';
}

export function applyRealizedRisk(trade: SimulatedTrade): void {
  const risk = trade.initialRiskUsd;
  if (!risk || !Number.isFinite(risk) || risk <= 0) {
    if (trade.exitPolicy === 'FIXED_3R') throw new Error('ORIGINAL_RISK_USD_REQUIRED');
    // Legacy without a trustworthy original snapshot must not report invented R.
    trade.rMultiple = 0;
    trade.realizedR = trade.grossR = trade.netR = undefined;
    return;
  }
  const net = trade.totalNetPnl ?? trade.netPnl ?? 0;
  trade.netR = net / risk;
  trade.grossR = (net + (trade.fee ?? 0)) / risk;
  trade.rMultiple = trade.netR;
  trade.realizedR = trade.netR;
}

export function permitsDiscretionaryClose(position: SimulatedTrade, expectedId: string): boolean {
  return position.id === expectedId && position.exitPolicy !== 'FIXED_3R';
}
