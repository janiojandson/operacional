import { CRYPTO_STRATEGY_VERSION, getCryptoStrategyProfile } from './cryptoStrategyProfile.js';

export type StrategyEntrySide = 'BUY' | 'SELL';
export type StrategyDataSource = 'BYBIT' | 'LOCAL_FALLBACK' | 'UNAVAILABLE';

export interface CryptoOpportunityInput {
  symbol: string;
  price: number;
  signalType: 'ABSORPTION_BUY' | 'ABSORPTION_SELL' | 'BOOK_IMBALANCE' | 'WHALE_AGGRESSION';
  signalSide: StrategyEntrySide;
  bookTimestamp: number;
  now: number;
  spreadPct: number;
  bidAskRatio: number;
  flowConfirmed: boolean;
  regime: string;
  hasOpenPosition: boolean;
  cooldownActive: boolean;
  orderExecutable: boolean;
  source: StrategyDataSource;
}

export interface StrategyDecision {
  approved: boolean;
  score: number;
  reasons: string[];
  profileVersion: string;
  entrySide: StrategyEntrySide;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingTrigger: number | null;
}

function roundPrice(value: number): number {
  return Number(value.toFixed(8));
}

export function evaluateCryptoOpportunity(input: CryptoOpportunityInput): StrategyDecision {
  const profile = getCryptoStrategyProfile(input.symbol);
  const reasons: string[] = [];
  let score = 0;

  if (!profile) reasons.push('PAR_SEM_PERFIL');
  if (!Number.isFinite(input.price) || input.price <= 0) reasons.push('PRECO_INVALIDO');
  if (input.source !== 'BYBIT') reasons.push('FONTE_NAO_BYBIT');
  if (!Number.isFinite(input.bookTimestamp) || input.now - input.bookTimestamp > (profile?.maxBookAgeMs ?? 0)) reasons.push('BOOK_DESATUALIZADO');
  if (!Number.isFinite(input.spreadPct) || input.spreadPct < 0 || input.spreadPct > (profile?.maxSpreadPct ?? 0)) reasons.push('SPREAD_EXCESSIVO');
  if (input.hasOpenPosition) reasons.push('POSICAO_JA_ABERTA');
  if (input.cooldownActive) reasons.push('COOLDOWN_ATIVO');
  if (!input.orderExecutable) reasons.push('ORDEM_NAO_EXECUTAVEL');

  if (input.flowConfirmed) score++;
  if (input.regime === 'TREND' || input.regime === 'HIGH_TREND' || input.regime === 'EXPANSION_FLOW') score++;
  if (profile && ((input.signalSide === 'BUY' && input.bidAskRatio >= profile.minBookImbalance) || (input.signalSide === 'SELL' && input.bidAskRatio <= profile.maxBookImbalance))) score++;
  if (input.signalType === 'ABSORPTION_BUY' || input.signalType === 'ABSORPTION_SELL' || input.signalType === 'BOOK_IMBALANCE') score++;

  if (profile && score < profile.minScore) reasons.push('CONFLUENCIA_INSUFICIENTE');

  const approved = reasons.length === 0;
  if (!profile || !Number.isFinite(input.price) || input.price <= 0) {
    return { approved: false, score, reasons, profileVersion: CRYPTO_STRATEGY_VERSION, entrySide: input.signalSide, stopLoss: null, takeProfit: null, trailingTrigger: null };
  }

  const isBuy = input.signalSide === 'BUY';
  const stopLoss = roundPrice(input.price * (isBuy ? 1 - profile.stopLossPct : 1 + profile.stopLossPct));
  const takeProfit = roundPrice(input.price * (isBuy ? 1 + profile.takeProfitPct : 1 - profile.takeProfitPct));
  const trailingTrigger = roundPrice(input.price * (isBuy ? 1 + profile.takeProfitPct * 0.8 : 1 - profile.takeProfitPct * 0.8));

  return { approved, score, reasons, profileVersion: CRYPTO_STRATEGY_VERSION, entrySide: input.signalSide, stopLoss, takeProfit, trailingTrigger };
}
