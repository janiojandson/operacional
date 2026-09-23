export type BybitOrderState = 'PREENCHIDA' | 'ABERTA' | 'PARCIAL' | 'CANCELADA' | 'REJEITADA' | 'ENVIADA';

export function verifyIsolatedLeverage(positions: any[], symbol: string, expectedLeverage: number): { verified: boolean; reason?: string } {
  const position = positions.find((candidate: any) => candidate?.symbol === symbol);
  if (!position) return { verified: false, reason: 'CONFIGURACAO_POSICAO_INDISPONIVEL' };

  const rawMode = String(position.marginMode ?? position.info?.tradeMode ?? '').toLowerCase();
  const isolated = rawMode === 'isolated' || rawMode === '1';
  if (!isolated) return { verified: false, reason: 'MARGEM_NAO_ISOLADA' };

  const leverage = Number(position.leverage ?? position.info?.leverage ?? 0);
  if (!Number.isFinite(leverage) || leverage !== expectedLeverage) {
    return { verified: false, reason: 'ALAVANCAGEM_DIVERGENTE' };
  }
  return { verified: true };
}

export function classifyBybitOrderState(order: any): BybitOrderState {
  const status = String(order?.status || '').toLowerCase();
  const filled = Number(order?.filled || 0);
  const amount = Number(order?.amount || 0);
  if (status === 'closed' || (amount > 0 && filled >= amount)) return 'PREENCHIDA';
  if (status.includes('cancel')) return 'CANCELADA';
  if (status.includes('reject') || status === 'expired') return 'REJEITADA';
  if (filled > 0) return 'PARCIAL';
  if (status === 'open' || status === 'new') return 'ABERTA';
  return 'ENVIADA';
}
