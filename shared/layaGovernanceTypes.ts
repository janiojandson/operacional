/**
 * Contratos de Dados e Tipos do Decisor Sistema 1 (Laya) ↔ Mercado Financeiro v2.0
 */

export type LayaGovernanceAction =
  | 'AUTHORIZE'
  | 'VETO'
  | 'CLOSE_NOW'
  | 'EARLY_HARVEST_CLOSE'
  | 'CONVERT_TO_SUPER_RUNNER'
  | 'AUTHORIZE_SCALE_IN'
  | 'OVERRIDE_COOLDOWN'
  | 'NO_ACTION';

export type LayaMode = 'OFF' | 'SHADOW' | 'ACTIVE';

export type StopLossMoveDirection = 'TIGHTEN' | 'TO_PROFIT' | 'WIDEN';

export type CooldownOverrideReason =
  | 'LIQUIDITY_SWEEP_CONFIRMED'
  | 'ABSORPTION_EXHAUSTION_REVERSAL'
  | 'NONE';

export type LayaRationaleCode =
  | 'SWEEP_RECLAIM_CVD_CONVERGENT'
  | 'MICRO_STOP_REORGANIZATION'
  | 'EARLY_HARVEST_EXHAUSTION'
  | 'CONVEX_SCALE_IN_SAFE'
  | 'DYNAMIC_POWER_AGGRESSION'
  | 'SPOOFING_DETECTED_VETO'
  | 'SPREAD_TOXIC_VETO'
  | 'BETA_DIVERGENCE_VETO'
  | 'NO_OPPORTUNITY';

export interface LayaGovernanceProposal {
  cooldownOverride?: boolean;
  cooldownOverrideReason?: CooldownOverrideReason;
  stopLossProposalPct?: number;
  stopLossMoveDirection?: StopLossMoveDirection;
  runnerModeAllowed?: boolean;
  runnerTrailingDistanceR?: number;
  allowScaleIn?: boolean;
}

export interface LayaTraceData {
  l2DepthTop20: number;
  imbalanceRatio: number;
  cvdDelta60s: number;
  spoofScore: number;
  betaDivergence: boolean;
  [key: string]: any;
}

export interface LayaGovernanceRequest {
  stateVersion: number;
  symbol: string;
  side?: 'BUY' | 'SELL';
  currentPrice: number;
  requestedAction?: string;
  lastExitMsAgo?: number;
  regime?: string;
  currentR?: number;
  clusterExposureUsdt?: number;
  trace: LayaTraceData;
}

export interface LayaGovernanceResponse {
  decisionId: string;
  stateVersion: number;
  issuedAt: number;
  expiresAt: number;
  action: LayaGovernanceAction;
  symbol: string;
  powerMultiplier: number;
  riskPct: number;
  governance: LayaGovernanceProposal;
  rationaleCode: LayaRationaleCode;
  trace: LayaTraceData;
}

export interface ConstitutionContext {
  currentR?: number;
  clusterExposureUsdt?: number;
  maxClusterExposureUsdt?: number;
}

export interface ConstitutionCheckResult {
  approved: boolean;
  rejectionReason?: string;
}

export interface LayaMetrics {
  mode: LayaMode;
  p50LatencyMs: number;
  p95LatencyMs: number;
  overridesUsedSession: number;
  maxOverridesPerSession: number;
  pnlAttributedOverrides: number;
  recentDecisions: Array<{
    decisionId: string;
    timestamp: number;
    action: LayaGovernanceAction;
    symbol: string;
    executed: boolean;
    rejectionReason?: string;
    rationaleCode: string;
  }>;
}
