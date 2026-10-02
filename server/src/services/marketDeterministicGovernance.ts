import type { LayaGovernanceRequest } from '../../../shared/layaGovernanceTypes.js';

export const MARKET_MAX_SAFE_SPREAD_BPS = 5.0;
export const MARKET_MIN_DELTA_STOP_BPS = 55.0;
export const MARKET_MAX_PORTFOLIO_RISK_FRACTION = 0.05;
export const MARKET_MIN_WALL_PERSISTENCE_MS = 1500;

export interface MarketDeterministicDecision {
  choice: string;
  verdict: string;
  rationale: string;
  confidence: number;
  executionMode?: 'MAKER_POST_ONLY' | 'TAKER_IOC';
}

function decision(
  choice: string,
  verdict: string,
  rationale: string,
  confidence: number,
  executionMode?: 'MAKER_POST_ONLY' | 'TAKER_IOC'
): MarketDeterministicDecision {
  return { choice, verdict, rationale, confidence, executionMode };
}

export function evaluateMarketDeterministicGovernance(
  payload: LayaGovernanceRequest
): MarketDeterministicDecision {
  const intentGroup = payload.intentGroup || 'PRE_ENTRY';
  const intentSubgroup = payload.intentSubgroup || 'NEW_OPPORTUNITY';
  const side = (payload.side || 'BUY').toUpperCase();
  const currentPrice = Number(payload.currentPrice || 0);
  const proposedStop = Number(payload.proposedStopLoss || 0);
  const requiresStop = intentGroup === 'PRE_ENTRY' || intentSubgroup === 'SCALE_IN_REQUEST';

  if (currentPrice <= 0 || (requiresStop && proposedStop <= 0)) {
    return decision('VETO', 'VETO', 'V00_INVALID_PRICE_OR_STOP', 0.99);
  }

  let deltaStopBps = 0;
  if (requiresStop) {
    deltaStopBps = Number(((Math.abs(currentPrice - proposedStop) / currentPrice) * 10000).toFixed(2));
    if (deltaStopBps < MARKET_MIN_DELTA_STOP_BPS) {
      return decision('VETO', 'VETO', 'V12_INSUFFICIENT_DELTA_CALCULATED', 0.99);
    }
  }

  const evidence = payload.evidence || {};
  const currentR = Number(payload.currentR || 0);
  const currentRisk = Number(payload.risk?.currentRiskAggregatePct || 0);
  const proposedRisk = Number(payload.risk?.proposedRiskPct ?? 0.01);
  const spreadBps = Number(payload.trace?.spreadBps || 0);
  const depthImbalance = Number(
    payload.trace?.depthImbalanceRatio ?? payload.trace?.imbalanceRatio ?? 1
  );
  const whaleWallDetected = Boolean(payload.trace?.whaleWallDetected);
  const wallPersistenceMs = Number(payload.trace?.wall_persistence_ms || 0);
  const regime = String(payload.macro?.regime || payload.regime || 'NEUTRAL').toUpperCase();
  const circuitBreaker = Boolean(payload.macro?.isCircuitBreakerActive);

  if (intentGroup === 'COOLDOWN_AUDIT') {
    if (evidence.liquiditySweepConfirmed && evidence.rejectionConfirmed) {
      return decision(
        'OVERRIDE_COOLDOWN',
        'OVERRIDE_COOLDOWN',
        'COOLDOWN_PARDON_SWEEP_RECLAIM',
        0.95
      );
    }
    return decision(
      'VETO',
      'VETO',
      'COOLDOWN_MAINTAINED_NO_CONFIRMED_EVIDENCE',
      0.95
    );
  }
  if (intentGroup === 'POSITION_LIFECYCLE') {
    if (intentSubgroup === 'DEFENSE_CONTRARIAN_FLOW') {
      if (evidence.contrarianFlowConfirmed && currentR < -0.3) {
        return decision('CLOSE_NOW', 'CLOSE_NOW', 'DEFENSE_CONTRARIAN_EXIT', 0.96);
      }
      return decision('HOLD', 'HOLD', 'HOLD_NO_CONFIRMED_CONTRARIAN_FLOW', 0.95);
    }

    if (intentSubgroup === 'RUNNER_EVALUATION') {
      if (evidence.exhaustionConfirmed && currentR >= 1.2) {
        return decision(
          'EARLY_HARVEST_CLOSE',
          'EARLY_HARVEST_CLOSE',
          'EARLY_HARVEST_TOP_EXHAUSTION',
          0.95
        );
      }
      return decision('HOLD', 'HOLD', 'RUNNER_EXTENDING_NO_CONFIRMED_EXHAUSTION', 0.95);
    }

    if (intentSubgroup === 'SCALE_IN_REQUEST') {
      if (currentR >= 1.2 && (currentRisk + proposedRisk) <= MARKET_MAX_PORTFOLIO_RISK_FRACTION) {
        return decision('AUTHORIZE', 'AUTHORIZE_SCALE_IN', 'SCALE_IN_AUTHORIZED', 0.95);
      }
      return decision('VETO', 'VETO', 'SCALE_IN_RISK_REJECTED', 0.92);
    }
  }
  if (spreadBps > MARKET_MAX_SAFE_SPREAD_BPS) {
    return decision('VETO', 'VETO', 'V01_TOXIC_SPREAD', 0.99);
  }
  if (circuitBreaker) {
    return decision('VETO', 'VETO', 'V02_CIRCUIT_BREAKER_ACTIVE', 0.99);
  }
  if (regime === 'BEARISH_DUMP' && side === 'BUY') {
    return decision('VETO', 'VETO', 'V03_BEARISH_DUMP_BUY_VETO', 0.98);
  }
  if (whaleWallDetected && wallPersistenceMs > 0
      && wallPersistenceMs < MARKET_MIN_WALL_PERSISTENCE_MS) {
    return decision('VETO', 'VETO', 'V05_SPOOFING_SUSPECT', 0.95);
  }
  if ((currentRisk + proposedRisk) > MARKET_MAX_PORTFOLIO_RISK_FRACTION) {
    return decision('VETO', 'VETO', 'V06_MAX_RISK_EXCEEDED', 0.98);
  }
  if (spreadBps > 3 && deltaStopBps > 0 && deltaStopBps < 65) {
    return decision('VETO', 'VETO', 'V07_EXCESSIVE_FRICTION_DRAG', 0.94);
  }

  const source = String(payload.signalSource || payload.intentSubgroup || 'FLOW_SIGNAL').toUpperCase();
  if (source.includes('IMBALANCE') || depthImbalance >= 2.5
      || (side === 'SELL' && depthImbalance <= 0.4)) {
    return decision(
      'AUTHORIZE',
      'APPROVE_AGGRESSIVE',
      'V08_IMBALANCE_AGGRESSIVE_APPROVED',
      0.98,
      'TAKER_IOC'
    );
  }

  return decision(
    'AUTHORIZE',
    'APPROVE_PASSIVE',
    'V08_ABSORPTION_PASSIVE_APPROVED',
    0.98,
    'MAKER_POST_ONLY'
  );
}
