export type ClientMarginBlockReason =
  | 'LIMITE_POSICOES_ATINGIDO'
  | 'SALDO_LIVRE_INSUFICIENTE'
  | 'MARGEM_AGREGADA_EXCEDIDA';

export interface ClientMarginCapacityInput {
  equityUsd: number;
  availableUsd: number;
  existingMarginUsd: number;
  existingPositionCount: number;
  newMarginUsd: number;
  openFeeUsd: number;
  maxMarginUsagePct: number;
  maxOpenPositions: number;
}

export interface ClientMarginCapacityResult {
  approved: boolean;
  reason?: ClientMarginBlockReason;
  projectedMarginUsd: number;
  maximumMarginUsd: number;
  requiredAvailableUsd: number;
}

/**
 * Applies client-side capacity controls before an exchange order is sent.
 * Existing margin and the proposed margin are deliberately kept separate from
 * the strategy's stop-loss risk; both constraints must independently pass.
 */
export function assessClientMarginCapacity(input: ClientMarginCapacityInput): ClientMarginCapacityResult {
  const projectedMarginUsd = input.existingMarginUsd + input.newMarginUsd;
  const maximumMarginUsd = input.equityUsd * input.maxMarginUsagePct;
  const requiredAvailableUsd = input.newMarginUsd + input.openFeeUsd;

  if (input.existingPositionCount >= input.maxOpenPositions) {
    return { approved: false, reason: 'LIMITE_POSICOES_ATINGIDO', projectedMarginUsd, maximumMarginUsd, requiredAvailableUsd };
  }
  if (requiredAvailableUsd > input.availableUsd) {
    return { approved: false, reason: 'SALDO_LIVRE_INSUFICIENTE', projectedMarginUsd, maximumMarginUsd, requiredAvailableUsd };
  }
  if (projectedMarginUsd > maximumMarginUsd) {
    return { approved: false, reason: 'MARGEM_AGREGADA_EXCEDIDA', projectedMarginUsd, maximumMarginUsd, requiredAvailableUsd };
  }
  return { approved: true, projectedMarginUsd, maximumMarginUsd, requiredAvailableUsd };
}
