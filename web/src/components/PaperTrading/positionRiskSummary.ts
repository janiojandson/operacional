import { formatCurrencyPtBr, formatPercentPtBr } from '../../utils/formatters';

type PositionRiskFields = {
  notionalUsd?: number;
  riskUsd?: number;
  marginUsd?: number;
  masterExposureRatio?: number;
  entryPrice?: number;
  stopLoss?: number;
};

export function positionRiskSummary(position: PositionRiskFields) {
  const riskVal = Number(position.riskUsd || 0);
  const entryVal = Number(position.entryPrice || 0);
  const slVal = Number(position.stopLoss || 0);
  const isBreakeven = (riskVal <= 0.001 && riskVal >= 0) || (entryVal > 0 && Math.abs(entryVal - slVal) < 0.0001);

  return {
    notionalUsd: formatCurrencyPtBr(position.notionalUsd),
    riskUsd: isBreakeven ? 'BREAKEVEN — RISCO ZERO' : formatCurrencyPtBr(position.riskUsd),
    isBreakeven,
    marginUsd: formatCurrencyPtBr(position.marginUsd),
    exposurePct: formatPercentPtBr(Number(position.masterExposureRatio || 0) * 100, 2)
  };
}
