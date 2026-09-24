export type BybitOrderState = 'PREENCHIDA' | 'ABERTA' | 'PARCIAL' | 'CANCELADA' | 'REJEITADA' | 'ENVIADA';

export function verifyIsolatedLeverage(positions: any[], symbol: string, expectedLeverage: number): { verified: boolean; reason?: string } {
  const normSym = symbol.replace(':USDT', '');
  const position = positions.find((candidate: any) => 
    candidate?.symbol === symbol || 
    candidate?.symbol === normSym || 
    candidate?.info?.symbol === normSym.replace('/', '')
  );
  if (!position) {
    // Na Binance, se ainda não há posição aberta para o par, as APIs setMarginMode e setLeverage já aplicaram a configuração
    return { verified: true };
  }

  const rawMode = String(position.marginMode ?? position.marginType ?? position.info?.marginType ?? position.info?.tradeMode ?? '').toLowerCase();
  const isolated = rawMode === 'isolated' || rawMode === '1' || position.info?.isolated === 'true' || position.info?.isolated === true;
  if (!isolated && rawMode !== '') return { verified: false, reason: 'MARGEM_NAO_ISOLADA' };

  const leverage = Number(position.leverage ?? position.info?.leverage ?? 0);
  if (Number.isFinite(leverage) && leverage > 0 && leverage !== expectedLeverage) {
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
