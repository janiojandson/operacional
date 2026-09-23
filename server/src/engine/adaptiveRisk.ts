export interface AdaptiveRiskInput {
  entryPrice: number;
  side: 'BUY' | 'SELL';
  candles: Array<{ high: number; low: number; close: number }>;
  structuralStopDistancePct: number;
  spreadPct: number;
  slippageBufferPct: number;
  atrMultiplier: number;
  requestedNotionalUsd: number;
  accountBalanceUsd: number;
  maxRiskUsd: number;
  existingAggregateRiskUsd: number;
  maxAggregateRiskUsd: number;
  roundTripFeePct: number;
}

export interface AdaptiveRiskResult {
  approved: boolean;
  reasons: string[];
  stopLoss: number | null;
  takeProfit: number | null;
  stopDistancePct: number | null;
  notionalUsd: number | null;
  riskUsd: number | null;
  grossR: number | null;
  netR: number | null;
}

function averageTrueRange(candles: AdaptiveRiskInput['candles']): number | null {
  if (candles.length < 2) return null;
  const ranges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  });
  const atr = ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

export function calculateAdaptiveRisk(input: AdaptiveRiskInput): AdaptiveRiskResult {
  const reasons: string[] = [];
  if (!Number.isFinite(input.entryPrice) || input.entryPrice <= 0) reasons.push('PRECO_INVALIDO');
  const atr = averageTrueRange(input.candles);
  if (atr === null) reasons.push('ATR_INDISPONIVEL');
  if (reasons.length > 0 || atr === null) return { approved: false, reasons, stopLoss: null, takeProfit: null, stopDistancePct: null, notionalUsd: null, riskUsd: null, grossR: null, netR: null };

  const atrDistancePct = (atr * input.atrMultiplier) / input.entryPrice;
  const stopDistancePct = Math.max(input.structuralStopDistancePct, atrDistancePct, input.spreadPct + input.slippageBufferPct);
  const riskLimitedNotional = input.maxRiskUsd / stopDistancePct;
  const notionalUsd = Math.min(input.requestedNotionalUsd, riskLimitedNotional);
  const riskUsd = notionalUsd * stopDistancePct;
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0 || !Number.isFinite(riskUsd)) reasons.push('RISCO_INVALIDO');
  if (input.existingAggregateRiskUsd + riskUsd > input.maxAggregateRiskUsd) reasons.push('RISCO_AGREGADO_EXCEDIDO');
  if (reasons.length > 0) return { approved: false, reasons, stopLoss: null, takeProfit: null, stopDistancePct, notionalUsd, riskUsd, grossR: null, netR: null };

  const isBuy = input.side === 'BUY';
  const stopLoss = Number((input.entryPrice * (isBuy ? 1 - stopDistancePct : 1 + stopDistancePct)).toFixed(8));
  const takeProfit = Number((input.entryPrice * (isBuy ? 1 + stopDistancePct * 2.5 : 1 - stopDistancePct * 2.5)).toFixed(8));
  const netR = (stopDistancePct * 2.5 - input.roundTripFeePct) / (stopDistancePct + input.roundTripFeePct);
  return { approved: true, reasons, stopLoss, takeProfit, stopDistancePct, notionalUsd, riskUsd, grossR: 2.5, netR: Number.isFinite(netR) ? Number(netR.toFixed(4)) : null };
}
