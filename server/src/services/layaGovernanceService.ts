import type {
  LayaGovernanceResponse,
  ConstitutionContext,
  ConstitutionCheckResult
} from '../../../shared/layaGovernanceTypes.js';

/**
 * Constantes da Constituição do Motor (:4000)
 */
export const MAX_FINANCIAL_RISK_PCT = 1.5;
export const MAX_VALIDITY_SPAN_MS = 3000; // Máximo 3 segundos para evitar obsolescência de microestrutura
export const MAX_SESSION_PARDONS = 3;

/**
 * Verifica se a proposta expirou ou se a janela temporal é excessivamente dilatada (>3000ms).
 */
export function isProposalExpired(
  proposal: LayaGovernanceResponse,
  currentTimeMs: number = Date.now()
): boolean {
  if (!proposal.issuedAt || !proposal.expiresAt) {
    return true;
  }

  // Regra de validade temporal estrita: expiresAt - issuedAt <= 3000ms
  const validitySpan = proposal.expiresAt - proposal.issuedAt;
  if (validitySpan > MAX_VALIDITY_SPAN_MS || validitySpan <= 0) {
    return true;
  }

  // Verifica se o momento presente já ultrapassou o expiresAt
  if (currentTimeMs > proposal.expiresAt) {
    return true;
  }

  return false;
}

/**
 * Validação rigorosa contra as 5 Linhas Vermelhas da Constituição do Motor
 */
export function validateConstitutionRules(
  proposal: LayaGovernanceResponse,
  context: ConstitutionContext = {}
): ConstitutionCheckResult {
  // Linha Vermelha 4: Stop só se move a favor (WIDEN é expressamente proibido)
  if (proposal.governance?.stopLossMoveDirection === 'WIDEN') {
    return {
      approved: false,
      rejectionReason: 'REJECTED_BY_CONSTITUTION: STOP_CANNOT_WIDEN'
    };
  }

  // Linha Vermelha 2: Teto financeiro por trade (R máximo nunca excede 1.5% da banca)
  if (proposal.riskPct > MAX_FINANCIAL_RISK_PCT) {
    return {
      approved: false,
      rejectionReason: 'REJECTED_BY_CONSTITUTION: RISK_EXCEEDS_MAX_CAP'
    };
  }

  // Linha Vermelha 1: Proibido preço médio para trás (Martingale)
  // Segunda entrada / scale-in só autorizada se trade 1 estiver com lucro consolidado >= +1.2R
  if (proposal.action === 'AUTHORIZE_SCALE_IN' || proposal.governance?.allowScaleIn) {
    const currentR = context.currentR ?? 0;
    if (currentR < 1.2) {
      return {
        approved: false,
        rejectionReason: 'REJECTED_BY_CONSTITUTION: SCALE_IN_REQUIRES_1_2R_PROFIT'
      };
    }
  }

  // Linha Vermelha 5: Cap de beta por cluster de correlação
  if (context.clusterExposureUsdt && context.maxClusterExposureUsdt) {
    if (context.clusterExposureUsdt >= context.maxClusterExposureUsdt) {
      return {
        approved: false,
        rejectionReason: 'REJECTED_BY_CONSTITUTION: CLUSTER_BETA_EXPOSURE_CAP_REACHED'
      };
    }
  }

  return { approved: true };
}
