/**
 * Contratos de Dados e Tipos do Decisor Sistema 1 (Market Deterministic) ↔ Mercado Financeiro v2.0
 */

export type MarketGovernanceAction =
  | 'AUTHORIZE'
  | 'VETO'
  | 'CLOSE_NOW'
  | 'EARLY_HARVEST_CLOSE'
  | 'CONVERT_TO_SUPER_RUNNER'
  | 'AUTHORIZE_SCALE_IN'
  | 'OVERRIDE_COOLDOWN'
  | 'HOLD'
  | 'NO_ACTION';

export type MarketGovernanceMode = 'OFF' | 'SHADOW' | 'ACTIVE';
/** @deprecated Use MarketGovernanceMode. */
export type MarketMode = MarketGovernanceMode;

export type StopLossMoveDirection = 'TIGHTEN' | 'TO_PROFIT' | 'WIDEN';

export type CooldownOverrideReason =
  | 'LIQUIDITY_SWEEP_CONFIRMED'
  | 'ABSORPTION_EXHAUSTION_REVERSAL'
  | 'NONE';

export type MarketRationaleCode =
  | 'SWEEP_RECLAIM_CVD_CONVERGENT'
  | 'MICRO_STOP_REORGANIZATION'
  | 'EARLY_HARVEST_EXHAUSTION'
  | 'CONVEX_SCALE_IN_SAFE'
  | 'DYNAMIC_POWER_AGGRESSION'
  | 'SPOOFING_DETECTED_VETO'
  | 'SPREAD_TOXIC_VETO'
  | 'BETA_DIVERGENCE_VETO'
  | 'NO_OPPORTUNITY';

export interface MarketGovernanceProposal {
  cooldownOverride?: boolean;
  cooldownOverrideReason?: CooldownOverrideReason;
  stopLossProposalPct?: number;
  stopLossMoveDirection?: StopLossMoveDirection;
  runnerModeAllowed?: boolean;
  runnerTrailingDistanceR?: number;
  allowScaleIn?: boolean;
  executionMode?: 'MAKER_POST_ONLY' | 'TAKER_IOC';
}

export interface MarketTraceData {
  l2DepthTop20: number;
  imbalanceRatio: number;
  cvdDelta60s: number;
  spoofScore: number;
  betaDivergence: boolean;
  [key: string]: any;
}

export type MarketIntentGroup = 'PRE_ENTRY' | 'COOLDOWN_AUDIT' | 'POSITION_LIFECYCLE';

export type MarketIntentSubgroup =
  | 'NEW_OPPORTUNITY'
  | 'LIQUIDITY_SWEEP_REENTRY'
  | 'DEFENSE_CONTRARIAN_FLOW'
  | 'RUNNER_EVALUATION'
  | 'POSITION_MONITOR'
  | 'SCALE_IN_REQUEST';

export interface MarketGovernanceRequest {
  stateVersion: number;
  symbol: string;
  intentGroup?: MarketIntentGroup;
  intentSubgroup?: MarketIntentSubgroup;
  side?: 'BUY' | 'SELL';
  currentPrice: number;
  requestedAction?: string;
  lastExitMsAgo?: number;
  regime?: string;
  currentR?: number;
  clusterExposureUsdt?: number;
  evidence?: {
    liquiditySweepConfirmed?: boolean;
    rejectionConfirmed?: boolean;
    contrarianFlowConfirmed?: boolean;
    exhaustionConfirmed?: boolean;
    sweepDirection?: 'DOWN' | 'UP';
    sweepReferencePrice?: number;
    sweepExtremePrice?: number;
    sweepReclaimPrice?: number;
    sweepBreachBps?: number;
    sweepConfirmedAt?: number;
  };
  trace: MarketTraceData;
  proposedStopLoss?: number;
  proposedTakeProfit?: number;
  signalSource?: string;
  macro?: {
    regime?: string;
    isCircuitBreakerActive?: boolean;
    powerMultiplier?: number;
    btcFundingRate?: number;
  };
  risk?: {
    accountEquity?: number;
    currentRiskAggregatePct?: number;
    proposedRiskPct?: number;
    atr14?: number;
  };
}

export interface MarketGovernanceResponse {
  decisionId: string;
  stateVersion: number;
  issuedAt: number;
  expiresAt: number;
  action: MarketGovernanceAction;
  symbol: string;
  side?: 'BUY' | 'SELL';
  powerMultiplier: number;
  riskPct: number;
  governance: MarketGovernanceProposal;
  rationaleCode: MarketRationaleCode;
  trace: MarketTraceData;
  signalSource?: string;
  vetoRuleCode?: string;
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

export interface MarketMetrics {
  mode: MarketMode;
  p50LatencyMs: number;
  p95LatencyMs: number;
  overridesUsedSession: number;
  maxOverridesPerSession: number;
  pnlAttributedOverrides: number;
  recentDecisions: Array<{
    decisionId: string;
    timestamp: number;
    action: MarketGovernanceAction;
    symbol: string;
    executed: boolean;
    rejectionReason?: string;
    rationaleCode: string;
  }>;
}


