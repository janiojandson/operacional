type PositionRiskFields = {
  notionalUsd?: number;
  riskUsd?: number;
  marginUsd?: number;
  masterExposureRatio?: number;
};

const usd = (value?: number) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function positionRiskSummary(position: PositionRiskFields) {
  return {
    notionalUsd: usd(position.notionalUsd),
    riskUsd: usd(position.riskUsd),
    marginUsd: usd(position.marginUsd),
    exposurePct: `${(Number(position.masterExposureRatio || 0) * 100).toFixed(2)}%`
  };
}
