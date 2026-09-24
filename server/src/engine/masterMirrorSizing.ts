export type MasterMirrorSizingStatus = 'EXECUTABLE' | 'BLOCKED_MIN_LOT' | 'BLOCKED_MARGIN_OR_FEE';

export interface MasterMirrorSizingInput {
  balanceUsd: number;
  masterExposureRatio: number;
  entryPrice: number;
  leverage: number;
  minQty: number;
  qtyStep: number;
  feeRate: number;
}

export interface MasterMirrorSizingResult {
  status: MasterMirrorSizingStatus;
  qty: number;
  notionalUsd: number;
  marginUsd: number;
  openFeeUsd: number;
  minimumBankUsd: number | null;
  reason?: string;
}

function roundDownToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  return Math.floor((value + Number.EPSILON) / step) * step;
}

function money(value: number): number {
  return Number(value.toFixed(8));
}

export function calculateMasterMirrorSize(input: MasterMirrorSizingInput): MasterMirrorSizingResult {
  const { balanceUsd, masterExposureRatio, entryPrice, leverage, minQty, qtyStep, feeRate } = input;
  if (![balanceUsd, masterExposureRatio, entryPrice, leverage, minQty, qtyStep, feeRate].every(Number.isFinite)
    || balanceUsd <= 0 || masterExposureRatio <= 0 || entryPrice <= 0 || leverage <= 0 || minQty <= 0 || qtyStep <= 0 || feeRate < 0) {
    return { status: 'BLOCKED_MARGIN_OR_FEE', qty: 0, notionalUsd: 0, marginUsd: 0, openFeeUsd: 0, minimumBankUsd: null, reason: 'Parâmetros de sizing inválidos.' };
  }

  const desiredNotionalUsd = balanceUsd * masterExposureRatio;
  const qty = roundDownToStep(desiredNotionalUsd / entryPrice, qtyStep);
  const minNotionalUsd = minQty * entryPrice;
  const minimumBankUsd = money(minNotionalUsd / masterExposureRatio);

  if (qty < minQty) {
    return { status: 'BLOCKED_MIN_LOT', qty: 0, notionalUsd: 0, marginUsd: 0, openFeeUsd: 0, minimumBankUsd, reason: 'O lote mínimo da corretora excede a exposição proporcional da banca.' };
  }

  const notionalUsd = money(qty * entryPrice);
  const marginUsd = money(notionalUsd / leverage);
  const openFeeUsd = money(notionalUsd * feeRate);
  if (marginUsd + openFeeUsd > balanceUsd) {
    return { status: 'BLOCKED_MARGIN_OR_FEE', qty: 0, notionalUsd: 0, marginUsd: 0, openFeeUsd: 0, minimumBankUsd, reason: 'Margem e taxa de abertura excedem o saldo disponível.' };
  }

  return { status: 'EXECUTABLE', qty: money(qty), notionalUsd, marginUsd, openFeeUsd, minimumBankUsd };
}
